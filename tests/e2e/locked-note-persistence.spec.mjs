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
