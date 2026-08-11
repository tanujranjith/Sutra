import { expect, test } from '@playwright/test';

const PIN = '2468';

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await page.evaluate(() => {
    try { window.markStudentOnboardingCompleted?.(true); } catch (error) {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.setProperty('display', 'none', 'important');
      overlay.style.setProperty('pointer-events', 'none', 'important');
    }
  });
  await page.waitForFunction(() => !!window.__sutraPublicBetaTestHooks);
}

test('edits made in a locked note survive navigation auto-lock', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(async ({ pin }) => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const lockedId = 'locked-note-persistence-qa';
    const otherId = 'other-note-persistence-qa';
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    payload.pages = [
      ...payload.pages,
      { id: lockedId, title: 'Locked persistence QA', content: '<p>before</p>', blocks: [] },
      { id: otherId, title: 'Other persistence QA', content: '<p>other</p>', blocks: [] }
    ];
    window.deserializeWorkspace(payload);
    await hooks.lockPageWithPin(lockedId, pin);
    window.loadPage(lockedId);

    const input = document.getElementById('lockScreenPinInput');
    input.value = pin;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('lockScreenForm').requestSubmit();
    await new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const waitForUnlock = () => {
        if (document.getElementById('lockedPageScreen')?.hidden) return resolve();
        if (Date.now() - startedAt > 5000) return reject(new Error('Timed out waiting for note unlock.'));
        setTimeout(waitForUnlock, 25);
      };
      waitForUnlock();
    });

    if (window.SutraNotesEditorV2?.isMounted()) {
      window.SutraNotesEditorV2.setContent('<p>edited immediately before leaving</p>');
    } else {
      const editor = document.getElementById('editor');
      editor.innerHTML = '<p>edited immediately before leaving</p>';
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'x' }));
    }

    // The default lock policy is "When leaving page". This used to revoke the
    // session marker before savePage(), causing the privacy guard to skip the
    // editor snapshot entirely.
    window.loadPage(otherId);
    const livePage = window.flowAtelier.pages.find(entry => entry.id === lockedId);
    const serialized = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const storedPage = serialized.pages.find(entry => entry.id === lockedId);
    await window.flowAtelier.flushAppSaveNow('locked-note-persistence-test');
    const durableWorkspace = await window.loadWorkspaceLocally();
    const durablePage = durableWorkspace?.pages?.find(entry => entry.id === lockedId);
    return {
      liveContent: livePage?.content || '',
      serializedContent: storedPage?.content || '',
      durableContent: durablePage?.content || '',
      lockState: hooks.getPageLockState(lockedId)
    };
  }, { pin: PIN });

  expect(result.liveContent).toContain('edited immediately before leaving');
  expect(result.serializedContent).toContain('edited immediately before leaving');
  expect(result.durableContent).toContain('edited immediately before leaving');
  expect(result.lockState).toMatchObject({ isLocked: true, sessionUnlocked: false });
});

test('a stale second tab cannot overwrite a paste saved in a locked note', async ({ page, context }) => {
  await openApp(page);

  const ids = await page.evaluate(async ({ pin }) => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const lockedId = 'locked-note-cross-tab-qa';
    const otherId = 'other-note-cross-tab-qa';
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    payload.pages = [
      ...payload.pages,
      { id: lockedId, title: 'Locked cross-tab QA', content: '<p>before</p>', blocks: [] },
      { id: otherId, title: 'Other cross-tab QA', content: '<p>other</p>', blocks: [] }
    ];
    payload.ui = payload.ui || {};
    payload.ui.lastOpenedPageId = otherId;
    payload.ui.lastOpenedPageBySpace = { ...(payload.ui.lastOpenedPageBySpace || {}), default: otherId };
    window.deserializeWorkspace(payload);
    await hooks.lockPageWithPin(lockedId, pin);
    window.loadPage(otherId);
    await window.flowAtelier.flushAppSaveNow('locked-note-cross-tab-seed');
    return { lockedId, otherId };
  }, { pin: PIN });

  // This tab hydrates the pre-paste workspace and deliberately stays stale.
  const stalePage = await context.newPage();
  await openApp(stalePage);
  await stalePage.waitForFunction((lockedId) => {
    return window.flowAtelier?.pages?.find(entry => entry.id === lockedId)?.content === '<p>before</p>';
  }, ids.lockedId);
  await stalePage.evaluate(() => window.flowAtelier.flushAppSaveNow('stale-tab-baseline'));

  // Start the editing tab from that exact confirmed base. The second tab now
  // holds the same base in memory but will not hydrate the later paste.
  await openApp(page);
  await page.waitForFunction((lockedId) => {
    return window.flowAtelier?.pages?.find(entry => entry.id === lockedId)?.content === '<p>before</p>';
  }, ids.lockedId);

  await page.evaluate(async ({ lockedId, pin }) => {
    window.loadPage(lockedId);
    const input = document.getElementById('lockScreenPinInput');
    input.value = pin;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('lockScreenForm').requestSubmit();
    await new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const waitForUnlock = () => {
        if (document.getElementById('lockedPageScreen')?.hidden) return resolve();
        if (Date.now() - startedAt > 5000) return reject(new Error('Timed out waiting for note unlock.'));
        setTimeout(waitForUnlock, 25);
      };
      waitForUnlock();
    });

    const data = new DataTransfer();
    data.setData('text/html', '<p>paste that must remain durable</p>');
    data.setData('text/plain', 'paste that must remain durable');
    const target = window.SutraNotesEditorV2?.isMounted()
      ? document.querySelector('#editorV2Host .ProseMirror')
      : document.getElementById('editor');
    target.focus();
    target.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 1300));
    await window.flowAtelier.flushAppSaveNow('locked-note-cross-tab-paste');
  }, { lockedId: ids.lockedId, pin: PIN });

  const afterPaste = await page.evaluate(async (lockedId) => {
    const durable = await window.loadWorkspaceLocally();
    return durable.pages.find(entry => entry.id === lockedId)?.content || '';
  }, ids.lockedId);
  expect(afterPaste).toContain('paste that must remain durable');

  // This is the same full-workspace write the stale tab's ordinary autosave
  // performs. It must fail closed instead of replacing the newer workspace.
  const staleSave = await stalePage.evaluate(async () => {
    window.savePage();
    try {
      await window.flowAtelier.flushAppSaveNow('stale-tab-autosave-test');
      return {
        ok: true,
        hasConditionalWrite: typeof window.SutraWorkspaceDB?.create({ indexedDB }).writeIf === 'function'
      };
    } catch (error) {
      return {
        ok: false,
        name: error?.name || '',
        message: error?.message || String(error),
        hasConditionalWrite: typeof window.SutraWorkspaceDB?.create({ indexedDB }).writeIf === 'function'
      };
    }
  });
  expect(staleSave).toMatchObject({ ok: false, name: 'WorkspaceConflictError', hasConditionalWrite: true });
  await expect(stalePage.locator('#sutraSaveFailureBanner')).toBeVisible();
  await expect(stalePage.locator('#sutraSaveFailureMessage')).toContainText(/newer workspace|prevented from overwriting/i);

  const afterStaleSave = await page.evaluate(async (lockedId) => {
    const durable = await window.loadWorkspaceLocally();
    return durable.pages.find(entry => entry.id === lockedId)?.content || '';
  }, ids.lockedId);
  expect(afterStaleSave).toContain('paste that must remain durable');
});
