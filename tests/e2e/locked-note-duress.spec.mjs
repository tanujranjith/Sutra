import { expect, test } from '@playwright/test';

const NORMAL_PIN = '246824';
const DURESS_PIN = '864209';
const SECRET = 'DURESS_PAGE_SECRET_MUST_DISAPPEAR';

async function openApp(page) {
  await page.addInitScript(() => { try { sessionStorage.setItem('sutra_intro_played', '1'); } catch (_) {} });
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await page.evaluate(() => {
    try { window.markStudentOnboardingCompleted?.(true); } catch (_) {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.setProperty('display', 'none', 'important');
    }
  });
  await page.waitForFunction(() => !!window.__sutraPublicBetaTestHooks
    && !!window.flowAtelier
    && typeof window.flowAtelier.flushAppSaveNow === 'function');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('locked-note-duress-ready'));
}

async function seedLockedTree(page, { withChild = true } = {}) {
  return page.evaluate(async ({ normalPin, secret, withChild }) => {
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const rootId = 'duress-root-note';
    const childId = 'duress-child-note';
    const now = new Date().toISOString();
    payload.pages = [
      ...payload.pages,
      { id: rootId, title: 'Duress Root', content: `<p>${secret}</p>`, blocks: [], createdAt: now, updatedAt: now },
      ...(withChild ? [{ id: childId, title: 'Duress Root::Child', content: '<p>child secret</p>', blocks: [], createdAt: now, updatedAt: now }] : [])
    ];
    payload.tasks = [...(payload.tasks || []), { id: 'duress-linked-task', title: 'Linked', noteId: rootId, createdAt: now, updatedAt: now }];
    window.deserializeWorkspace(payload);
    window.loadPage(rootId);
    await window.__sutraPublicBetaTestHooks.lockPageWithPin(rootId, normalPin);
    window.loadPage(rootId);
    return { rootId, childId: withChild ? childId : null };
  }, { normalPin: NORMAL_PIN, secret: SECRET, withChild });
}

async function submitLockPin(page, pin) {
  await expect(page.locator('#lockedPageScreen')).toBeVisible();
  await page.locator('#lockScreenPinInput').fill(pin);
  await page.locator('#lockScreenForm').evaluate(form => form.requestSubmit());
}

async function unlockNormally(page) {
  await submitLockPin(page, NORMAL_PIN);
  await expect(page.locator('#lockedPageScreen')).toBeHidden();
}

async function openLockSettings(page, pageId) {
  await page.evaluate(id => window.__sutraPublicBetaTestHooks.openPageLockSettings(id), pageId);
  await expect(page.locator('#setPageLockModal')).toHaveClass(/active/);
  await expect(page.locator('#lockViewManage')).toHaveClass(/active/);
}

async function configureDuressThroughUi(page, pageId, pin = DURESS_PIN) {
  await openLockSettings(page, pageId);
  await page.locator('#lockManageDuressBtn').click();
  await expect(page.locator('#lockViewDuress')).toHaveClass(/active/);
  await page.locator('#lockDuressPin').fill(pin);
  await page.locator('#lockDuressPinConfirm').fill(pin);
  await page.locator('#lockDuressAcknowledge').check();
  await page.locator('#setPageLockConfirmBtn').click();
  await expect(page.locator('#setPageLockModal')).not.toHaveClass(/active/);
}

test('explicit duress use permanently removes the protected page tree and local recovery copies', async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page);
  const ids = await seedLockedTree(page);
  await unlockNormally(page);
  await configureDuressThroughUi(page, ids.rootId);

  const configured = await page.evaluate(async ({ rootId, pin, secret }) => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const protectedPage = payload.pages.find(entry => entry.id === rootId);
    window.SutraTrash.add('page', 'Older recovery copy', protectedPage);
    const snapshot = hooks.createWorkspaceSnapshot('Before duress QA');
    // The public test hook adds Trash and starts an immediate save. Settle that
    // synthetic write before exercising the separate duplication workflow.
    await window.saveWorkspaceLocally();
    hooks.duplicatePageById(rootId);
    const afterDuplicate = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const duplicate = afterDuplicate.pages.find(entry => entry.title === 'Duress Root (Copy)');
    return {
      lockState: hooks.getPageLockState(rootId),
      verifierShape: /^v1\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(protectedPage.lockDuressVerifier || ''),
      rawPinStored: JSON.stringify(protectedPage).includes(pin),
      secretPresentBefore: JSON.stringify(protectedPage).includes(secret),
      snapshotCreated: !!snapshot,
      duplicateId: duplicate?.id || '',
      duplicateHasDuress: !!duplicate?.lockDuressVerifier,
      duplicateHasSecret: String(duplicate?.content || '').includes(secret)
    };
  }, { rootId: ids.rootId, pin: DURESS_PIN, secret: SECRET });

  // Duplicating navigates to the copy; navigation auto-locks the source page.
  expect(configured.lockState).toEqual({ isLocked: true, hasDuress: true, sessionUnlocked: false });
  expect(configured.verifierShape).toBe(true);
  expect(configured.rawPinStored).toBe(false);
  expect(configured.secretPresentBefore).toBe(true);
  expect(configured.snapshotCreated).toBe(true);
  expect(configured.duplicateId).not.toBe('');
  expect(configured.duplicateHasDuress).toBe(false);
  expect(configured.duplicateHasSecret).toBe(true);

  await page.evaluate(rootId => {
    window.loadPage(rootId);
    window.__sutraPublicBetaTestHooks.lockPageNow(rootId);
  }, ids.rootId);
  await submitLockPin(page, DURESS_PIN);

  await expect.poll(() => page.evaluate(rootId => window.__sutraPublicBetaTestHooks.pageExists(rootId), ids.rootId)).toBe(false);
  await expect.poll(() => page.evaluate(childId => window.__sutraPublicBetaTestHooks.pageExists(childId), ids.childId)).toBe(false);

  const after = await page.evaluate(({ rootId, childId, duplicateId, secret }) => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const snapshots = hooks.getWorkspaceSnapshots();
    const duplicate = payload.pages.find(entry => entry.id === duplicateId);
    return {
      originalStillActive: payload.pages.some(entry => entry.id === rootId || entry.id === childId),
      duplicateSurvived: !!duplicate,
      duplicateHasDuress: !!duplicate?.lockDuressVerifier,
      duplicateHasSecret: String(duplicate?.content || '').includes(secret),
      linkedTaskNoteId: payload.tasks.find(task => task.id === 'duress-linked-task')?.noteId ?? null,
      trashLeaks: hooks.getTrash().some(record => record?.payload?.id === rootId || record?.payload?.id === childId),
      snapshotLeaks: snapshots.some(snapshot => snapshot?.payload?.pages?.some(entry => entry.id === rootId || entry.id === childId))
    };
  }, { rootId: ids.rootId, childId: ids.childId, duplicateId: configured.duplicateId, secret: SECRET });

  expect(after).toEqual({
    originalStillActive: false,
    duplicateSurvived: true,
    duplicateHasDuress: false,
    duplicateHasSecret: true,
    linkedTaskNoteId: null,
    trashLeaks: false,
    snapshotLeaks: false
  });
});

test('ambiguity guards reject matching PINs while wrong and normal PINs never delete', async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page);
  const ids = await seedLockedTree(page, { withChild: false });
  await unlockNormally(page);

  await openLockSettings(page, ids.rootId);
  await page.locator('#lockManageDuressBtn').click();
  await page.locator('#lockDuressPin').fill(DURESS_PIN);
  await page.locator('#lockDuressPinConfirm').fill(DURESS_PIN);
  await page.locator('#setPageLockConfirmBtn').click();
  await expect(page.locator('#lockDuressAcknowledgeError')).toContainText('Acknowledge');
  expect(await page.evaluate(id => window.__sutraPublicBetaTestHooks.getPageLockState(id), ids.rootId)).toEqual({
    isLocked: true, hasDuress: false, sessionUnlocked: true
  });

  await page.locator('#lockDuressPin').fill(NORMAL_PIN);
  await page.locator('#lockDuressPinConfirm').fill(NORMAL_PIN);
  await page.locator('#lockDuressAcknowledge').check();
  await page.locator('#setPageLockConfirmBtn').click();
  await expect(page.locator('#lockDuressPinError')).toContainText('must differ');
  expect(await page.evaluate(id => window.__sutraPublicBetaTestHooks.getPageLockState(id), ids.rootId)).toEqual({
    isLocked: true, hasDuress: false, sessionUnlocked: true
  });
  await page.locator('#setPageLockCancelBtn').click();

  await configureDuressThroughUi(page, ids.rootId);
  await page.evaluate(id => window.__sutraPublicBetaTestHooks.lockPageNow(id), ids.rootId);
  await submitLockPin(page, '111111');
  await expect(page.locator('#lockScreenError')).toContainText('Incorrect PIN');
  expect(await page.evaluate(id => window.__sutraPublicBetaTestHooks.pageExists(id), ids.rootId)).toBe(true);

  await submitLockPin(page, NORMAL_PIN);
  await expect(page.locator('#lockedPageScreen')).toBeHidden();
  expect(await page.evaluate(id => window.__sutraPublicBetaTestHooks.pageExists(id), ids.rootId)).toBe(true);

  await openLockSettings(page, ids.rootId);
  await page.locator('#lockManageChangeBtn').click();
  await page.locator('#lockPinChange').fill(DURESS_PIN);
  await page.locator('#lockPinChangeConfirm').fill(DURESS_PIN);
  await page.locator('#setPageLockConfirmBtn').click();
  await expect(page.locator('#lockPinChangeError')).toContainText('must differ');
  await page.locator('#setPageLockCancelBtn').click();

  await page.evaluate(id => window.__sutraPublicBetaTestHooks.lockPageNow(id), ids.rootId);
  await submitLockPin(page, NORMAL_PIN);
  await expect(page.locator('#lockedPageScreen')).toBeHidden();
  expect(await page.evaluate(id => window.__sutraPublicBetaTestHooks.pageExists(id), ids.rootId)).toBe(true);
});
