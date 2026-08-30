import { expect, test } from '@playwright/test';

const PIN = '2468';

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await page.waitForFunction(() =>
    !!window.__sutraPublicBetaTestHooks &&
    !!window.flowAtelier &&
    typeof window.flowAtelier.flushAppSaveNow === 'function');
  // Production keeps the startup overlay above the app until canonical
  // hydration is ready. Establish that baseline before touching onboarding.
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-app-ready'));
  const completedOnboarding = await page.evaluate(() => {
    const overlay = document.getElementById('studentOnboardingOverlay');
    const visible = !!overlay && !overlay.hidden && getComputedStyle(overlay).display !== 'none';
    if (visible) {
      try { window.markStudentOnboardingCompleted?.(true); } catch (error) {}
      overlay.classList.remove('active');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.setProperty('display', 'none', 'important');
      overlay.style.setProperty('pointer-events', 'none', 'important');
    }
    return visible;
  });
  if (completedOnboarding) {
    await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-onboarding-ready'));
  }
  // Some startup bridges intentionally request the ordinary 250 ms autosave.
  // Let that debounce become visible, then drain it before this test treats the
  // tab's canonical hash as a deliberate cross-tab baseline.
  await page.waitForTimeout(350);
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-startup-settled'));
}

async function createUnlockedLockedNote(page, id, lockAutoLock = 'navigation') {
  await page.evaluate(async ({ id, pin, lockAutoLock }) => {
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    payload.pages = [
      ...payload.pages,
      { id, title: id, content: '<p>before</p>', blocks: [], lockAutoLock }
    ];
    window.deserializeWorkspace(payload);
    await window.__sutraPublicBetaTestHooks.lockPageWithPin(id, pin);
    window.flowAtelier.setActiveView('notes');
    window.loadPage(id);
    const input = document.getElementById('lockScreenPinInput');
    input.value = pin;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('lockScreenForm').requestSubmit();
  }, { id, pin: PIN, lockAutoLock });
  await page.waitForFunction(() => document.getElementById('lockedPageScreen')?.hidden === true);
}

async function pasteIntoVisibleEditor(page, text) {
  return page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData('text/html', `<p>${text}</p>`);
    data.setData('text/plain', text);
    const target = document.querySelector('#editorV2Host .ProseMirror');
    target.focus();
    target.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true
    }));
    return {
      visible: window.SutraNotesEditorV2.getStorageHtml(),
      mirror: document.getElementById('editor').innerHTML
    };
  }, text);
}

async function readLockedPageLayers(page, id) {
  return page.evaluate(async (id) => {
    const live = window.flowAtelier.pages.find((entry) => entry.id === id);
    const serialized = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false })
      .pages.find((entry) => entry.id === id);
    const durable = (await window.loadWorkspaceLocally())?.pages?.find((entry) => entry.id === id);
    return {
      live: live?.content || '',
      serialized: serialized?.content || '',
      durable: durable?.content || '',
      lockState: window.__sutraPublicBetaTestHooks.getPageLockState(id)
    };
  }, id);
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

test('a locked-note paste is durable when leaving Notes before the v2 mirror debounce', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(async ({ pin }) => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const lockedId = 'locked-note-view-switch-paste-qa';
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    payload.pages = [
      ...payload.pages,
      { id: lockedId, title: 'Locked view switch paste QA', content: '<p>before</p>', blocks: [] }
    ];
    payload.settings = payload.settings || {};
    payload.settings.preferences = payload.settings.preferences || {};
    payload.settings.preferences.editor = {
      ...(payload.settings.preferences.editor || {}),
      autosaveMs: 8000
    };
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

    const data = new DataTransfer();
    data.setData('text/html', '<p>paste before immediate view switch</p>');
    data.setData('text/plain', 'paste before immediate view switch');
    const target = document.querySelector('#editorV2Host .ProseMirror');
    target.focus();
    target.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true
    }));

    const visible = window.SutraNotesEditorV2.getStorageHtml();
    const mirrorBeforeSwitch = document.getElementById('editor').innerHTML;
    window.flowAtelier.setActiveView('today');
    await window.flowAtelier.flushAppSaveNow('locked-note-view-switch-boundary');

    const live = window.flowAtelier.pages.find(entry => entry.id === lockedId);
    const serialized = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false })
      .pages.find(entry => entry.id === lockedId);
    const durable = (await window.loadWorkspaceLocally())?.pages?.find(entry => entry.id === lockedId);
    return {
      visible,
      mirrorBeforeSwitch,
      mirrorAfterSwitch: document.getElementById('editor').innerHTML,
      liveContent: live?.content || '',
      serializedContent: serialized?.content || '',
      durableContent: durable?.content || '',
      activeView: window.flowAtelier.activeView,
      lockState: hooks.getPageLockState(lockedId)
    };
  }, { pin: PIN });

  expect(result.visible).toContain('paste before immediate view switch');
  expect(result.mirrorBeforeSwitch).not.toContain('paste before immediate view switch');
  expect(result.mirrorAfterSwitch).toContain('paste before immediate view switch');
  expect(result.liveContent).toContain('paste before immediate view switch');
  expect(result.serializedContent).toContain('paste before immediate view switch');
  expect(result.durableContent).toContain('paste before immediate view switch');
  expect(result.activeView).toBe('today');
  expect(result.lockState).toMatchObject({ isLocked: true, sessionUnlocked: false });
});

for (const destination of ['homework', 'timeline']) {
  test(`locked-note typing is durable when immediately switching to ${destination}`, async ({ page }) => {
    await openApp(page);
    const id = `locked-note-typing-${destination}-qa`;
    const sentinel = `typed before ${destination} switch`;
    await createUnlockedLockedNote(page, id);

    const editor = page.locator('#editorV2Host .ProseMirror');
    await editor.click();
    await editor.pressSequentially(sentinel);
    await page.evaluate((destination) => window.flowAtelier.setActiveView(destination), destination);
    await page.evaluate(() => window.flowAtelier.flushAppSaveNow('locked-note-typing-view-switch'));

    const stored = await readLockedPageLayers(page, id);
    expect(stored.live).toContain(sentinel);
    expect(stored.serialized).toContain(sentinel);
    expect(stored.durable).toContain(sentinel);
    expect(stored.lockState).toMatchObject({ isLocked: true, sessionUnlocked: false });
  });
}

test('manual and timed re-lock flush a pending Editor v2 paste before revoking authorization', async ({ page }) => {
  await openApp(page);

  for (const mode of ['manual', 'timer']) {
    const id = `locked-note-${mode}-relock-qa`;
    const sentinel = `${mode} re-lock pending paste`;
    await createUnlockedLockedNote(page, id, mode === 'timer' ? '5min' : 'navigation');
    const editorState = await pasteIntoVisibleEditor(page, sentinel);
    expect(editorState.visible).toContain(sentinel);
    expect(editorState.mirror).not.toContain(sentinel);

    await page.evaluate(({ id, mode }) => {
      const hooks = window.__sutraPublicBetaTestHooks;
      if (mode === 'manual') hooks.lockPageNow(id);
      else hooks.triggerPageAutoLock(id);
    }, { id, mode });
    await page.evaluate(() => window.flowAtelier.flushAppSaveNow('locked-note-relock-boundary'));

    const stored = await readLockedPageLayers(page, id);
    expect(stored.live).toContain(sentinel);
    expect(stored.serialized).toContain(sentinel);
    expect(stored.durable).toContain(sentinel);
    expect(stored.lockState).toMatchObject({ isLocked: true, sessionUnlocked: false });
  }
});

test('pagehide and reload preserve an unlocked locked-note paste without journaling plaintext', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);
  const id = 'locked-note-pagehide-paste-qa';
  const sentinel = 'pagehide pending paste survives reload';
  await createUnlockedLockedNote(page, id);
  const editorState = await pasteIntoVisibleEditor(page, sentinel);
  expect(editorState.visible).toContain(sentinel);
  expect(editorState.mirror).not.toContain(sentinel);

  const journal = await page.evaluate(async () => {
    window.dispatchEvent(new Event('pagehide'));
    await window.flowAtelier.flushAppSaveNow('locked-note-pagehide-verification');
    return sessionStorage.getItem('sutra:lifecycle-note-journal:v1');
  });
  expect(journal).toBeNull();

  await page.reload();
  await openApp(page);
  await page.evaluate((id) => {
    window.flowAtelier.setActiveView('notes');
    window.loadPage(id);
  }, id);
  await page.fill('#lockScreenPinInput', PIN);
  await page.locator('#lockScreenForm').evaluate((form) => form.requestSubmit());
  await page.waitForFunction(() => document.getElementById('lockedPageScreen')?.hidden === true);
  await expect(page.locator('#editorV2Host .ProseMirror')).toContainText(sentinel);

  const stored = await readLockedPageLayers(page, id);
  expect(stored.durable).toContain(sentinel);
});

test('lifecycle recovery never copies unlocked PIN-note plaintext into session storage', async ({ page }) => {
  await openApp(page);

  const journal = await page.evaluate(async ({ pin }) => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const lockedId = 'locked-note-journal-privacy-qa';
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    payload.pages = [
      ...payload.pages,
      { id: lockedId, title: 'Locked journal privacy QA', content: '<p>before</p>', blocks: [] }
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

    const sentinel = 'PIN note plaintext must never enter the lifecycle journal.';
    const editor = document.getElementById('editor');
    editor.innerHTML = `<p>${sentinel}</p>`;
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'x' }));
    window.dispatchEvent(new Event('pagehide'));
    await new Promise(resolve => setTimeout(resolve, 0));
    return sessionStorage.getItem('sutra:lifecycle-note-journal:v1');
  }, { pin: PIN });

  expect(journal).toBeNull();
});

test('a committed save remains the local base when only its verification read fails', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(async () => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const note = hooks.createNoteInActiveSpace('Readback recovery baseline', '<p>durable</p>');
    await window.flowAtelier.flushAppSaveNow('readback-recovery-baseline');

    const originalTransaction = IDBDatabase.prototype.transaction;
    let rootWriteStarted = false;
    IDBDatabase.prototype.transaction = function (...args) {
      const mode = String(args[1] || 'readonly');
      if (mode === 'readwrite') rootWriteStarted = true;
      if (rootWriteStarted && mode === 'readonly') {
        rootWriteStarted = false;
        throw new DOMException('Injected verification read failure', 'UnknownError');
      }
      return originalTransaction.apply(this, args);
    };

    hooks.renamePage(note.id, 'Committed despite verification failure');
    let firstError = null;
    try {
      await window.flowAtelier.flushAppSaveNow('readback-recovery-injected-failure');
    } catch (error) {
      firstError = { name: error?.name || '', message: error?.message || String(error) };
    } finally {
      IDBDatabase.prototype.transaction = originalTransaction;
    }

    let retryError = null;
    try {
      await window.flowAtelier.flushAppSaveNow('retry');
    } catch (error) {
      retryError = { name: error?.name || '', message: error?.message || String(error) };
    }
    const durable = await window.loadWorkspaceLocally();
    return {
      firstError,
      retryError,
      durableTitle: durable?.pages?.find(entry => entry.id === note.id)?.title || '',
      failureBannerHidden: document.getElementById('sutraSaveFailureBanner')?.hidden === true
    };
  });

  expect(result.firstError).toMatchObject({ name: 'UnknownError' });
  expect(result.retryError).toBeNull();
  expect(result.durableTitle).toBe('Committed despite verification failure');
  expect(result.failureBannerHidden).toBe(true);
});

test('a visibility-change save recreates a missing canonical root from its confirmed checkpoint', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(async () => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const note = hooks.createNoteInActiveSpace('Missing root recovery baseline', '<p>safe baseline</p>');
    await window.flowAtelier.flushAppSaveNow('missing-root-recovery-baseline');

    const checkpointBefore = JSON.parse(localStorage.getItem('sutra:persistenceHealth:v1') || '{}')
      .lastConfirmedWorkspaceHash || null;
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('noteflow_atelier_db', 8);
      request.onerror = () => reject(request.error || new Error('Could not open workspace DB'));
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').delete('root');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error || new Error('Could not delete root'));
        tx.onabort = () => reject(tx.error || new Error('Root deletion aborted'));
      };
    });

    hooks.renamePage(note.id, 'Recovered during visibility change');
    let saveError = null;
    try {
      await window.flowAtelier.flushAppSaveNow('visibilitychange');
    } catch (error) {
      saveError = { name: error?.name || '', message: error?.message || String(error) };
    }
    const durable = await window.loadWorkspaceLocally();
    const health = window.SutraPersistenceHealth.getState();
    return {
      checkpointBefore,
      checkpointAfter: JSON.parse(localStorage.getItem('sutra:persistenceHealth:v1') || '{}')
        .lastConfirmedWorkspaceHash || null,
      saveError,
      durableTitle: durable?.pages?.find(entry => entry.id === note.id)?.title || '',
      failure: health.lastFailure,
      bannerHidden: document.getElementById('sutraSaveFailureBanner')?.hidden === true
    };
  });

  expect(result.checkpointBefore).toMatch(/^[0-9a-f]{8}$/);
  expect(result.checkpointAfter).toMatch(/^[0-9a-f]{8}$/);
  expect(result.saveError).toBeNull();
  expect(result.durableTitle).toBe('Recovered during visibility change');
  expect(result.failure).toBeNull();
  expect(result.bannerHidden).toBe(true);
});

test('a superseded same-tab lifecycle save is declined without raising a conflict', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(async () => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const note = hooks.createNoteInActiveSpace('Lifecycle predecessor baseline', '<p>safe baseline</p>');
    await window.flowAtelier.flushAppSaveNow('lifecycle-predecessor-baseline');

    // Model the previous document in this SAME browser tab. The replacement
    // document supersedes its session-scoped barrier before the delayed
    // lifecycle transaction reaches the conditional root write.
    hooks.renamePage(note.id, 'Late predecessor must not overwrite');
    const token = hooks.persistenceLifecycle.beginBarrier('pagehide');
    hooks.persistenceLifecycle.clearBarrier(token);
    await hooks.persistenceLifecycle.flushWithBarrier('pagehide', token);
    const afterSuperseded = await window.loadWorkspaceLocally();
    const failureAfterSuperseded = window.SutraPersistenceHealth.getState().lastFailure;

    await window.flowAtelier.flushAppSaveNow('retry');
    const afterRetry = await window.loadWorkspaceLocally();
    return {
      titleAfterSuperseded: afterSuperseded?.pages?.find(entry => entry.id === note.id)?.title || '',
      titleAfterRetry: afterRetry?.pages?.find(entry => entry.id === note.id)?.title || '',
      failureAfterSuperseded,
      bannerHidden: document.getElementById('sutraSaveFailureBanner')?.hidden === true
    };
  });

  expect(result.titleAfterSuperseded).toBe('Lifecycle predecessor baseline');
  expect(result.titleAfterRetry).toBe('Late predecessor must not overwrite');
  expect(result.failureAfterSuperseded).toBeNull();
  expect(result.bannerHidden).toBe(true);
});

test('a real same-tab reload hands off its lifecycle save without a false conflict', async ({ page }) => {
  test.slow(); // This regression intentionally performs two complete app boots.
  await openApp(page);

  const noteId = await page.evaluate(async () => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const note = hooks.createNoteInActiveSpace('Reload lifecycle baseline', '<p>before reload</p>');
    window.loadPage(note.id);
    await window.flowAtelier.flushAppSaveNow('reload-lifecycle-baseline');
    return note.id;
  });

  await page.fill('#pageTitle', 'Saved during same-tab reload');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await page.waitForFunction(() => !!window.flowAtelier && !!window.SutraPersistenceHealth);
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('reload-lifecycle-verification'));

  const result = await page.evaluate(async (id) => {
    const durable = await window.loadWorkspaceLocally();
    return {
      title: durable?.pages?.find(entry => entry.id === id)?.title || '',
      failure: window.SutraPersistenceHealth.getState().lastFailure,
      bannerHidden: document.getElementById('sutraSaveFailureBanner')?.hidden === true
    };
  }, noteId);

  expect(result.title).toBe('Saved during same-tab reload');
  expect(result.failure).toBeNull();
  expect(result.bannerHidden).toBe(true);
});

test('an unproven root change is not mislabeled as another open Sutra page', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(async () => {
    const changed = await window.loadWorkspaceLocally();
    changed.ui = { ...(changed.ui || {}), storageConflictProvenanceQa: Date.now() };
    const db = window.SutraWorkspaceDB.create({
      indexedDB,
      dbName: 'noteflow_atelier_db',
      storeName: 'workspace',
      version: 8
    });
    await db.write('root', changed);
    db.close();

    let saveError = null;
    try {
      await window.flowAtelier.flushAppSaveNow('unknown-root-change-test');
    } catch (error) {
      saveError = { name: error?.name || '', message: error?.message || String(error) };
    }
    return {
      saveError,
      bannerMessage: document.getElementById('sutraSaveFailureMessage')?.textContent || '',
      conflict: window.SutraPersistenceHealth.getState().lastFailure?.conflict || null
    };
  });

  expect(result.saveError).toMatchObject({ name: 'WorkspaceConflictError' });
  expect(result.saveError.message).toContain('No other open Sutra page was detected');
  expect(result.bannerMessage).toContain('No other open Sutra page was detected');
  expect(result.saveError.message).not.toMatch(/another (tab|open Sutra page)|stale tab/i);
  expect(result.conflict).toMatchObject({ source: 'unverified-storage-change' });
  expect(result.conflict.expectedHash).toMatch(/^[0-9a-f]{8}$/);
  expect(result.conflict.actualHash).toMatch(/^[0-9a-f]{8}$/);
  expect(result.conflict.actualHash).not.toBe(result.conflict.expectedHash);
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

  // Stop the seeding tab before the second tab establishes its baseline. Boot
  // normalization/onboarding saves are valid canonical writes; leaving both
  // tabs active here makes the test race before the intentional stale-write
  // step and does not model the scenario under test.
  await page.goto('/HomePage.html');

  // This tab hydrates the pre-paste workspace and deliberately stays stale.
  const stalePage = await context.newPage();
  await openApp(stalePage);
  await stalePage.waitForFunction((lockedId) => {
    return window.flowAtelier?.pages?.find(entry => entry.id === lockedId)?.content === '<p>before</p>';
  }, ids.lockedId);

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
