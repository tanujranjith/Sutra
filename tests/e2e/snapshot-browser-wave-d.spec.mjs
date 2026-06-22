import { expect, test } from '@playwright/test';

// Wave D — Whole-workspace snapshot browser + diff (#6).

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await page.evaluate(() => {
    try { if (typeof window.markStudentOnboardingCompleted === 'function') window.markStudentOnboardingCompleted(true); } catch (e) {}
    const o = document.getElementById('studentOnboardingOverlay');
    if (o) { o.classList.remove('active'); o.hidden = true; o.style.setProperty('display', 'none', 'important'); }
  });
  await page.waitForFunction(() => !!(window.openSnapshotBrowserModal && window.__sutraPublicBetaTestHooks && window.__sutraPublicBetaTestHooks.createWorkspaceSnapshot));
}

test('creating a snapshot stores it with a summary', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const H = window.__sutraPublicBetaTestHooks;
    const snap = H.createWorkspaceSnapshot('QA snapshot');
    const list = H.getWorkspaceSnapshots();
    return { ok: !!snap, count: list.length, hasSummary: !!(snap && snap.summary && typeof snap.summary.pages === 'number') };
  });
  expect(r.ok).toBe(true);
  expect(r.count).toBeGreaterThanOrEqual(1);
  expect(r.hasSummary).toBe(true);
});

test('diff reports collection deltas vs the current workspace', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const H = window.__sutraPublicBetaTestHooks;
    const snap = H.createWorkspaceSnapshot('Baseline');
    H.createNoteInActiveSpace('A brand new note', '<p>x</p>');
    const d = H.diffWorkspaceSnapshot(snap.id);
    const pageDelta = d.diffs.find(x => x.key === 'pages');
    return { hasDiff: !!(d && d.diffs.length), pageDelta: pageDelta ? pageDelta.delta : 0 };
  });
  expect(r.hasDiff).toBe(true);
  expect(r.pageDelta).toBeGreaterThanOrEqual(1);
});

test('the snapshot browser modal opens and offers create', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    window.openSnapshotBrowserModal();
    const m = document.getElementById('sutraSnapshotModal');
    return { active: !!(m && m.classList.contains('active')), hasCreate: !!(m && m.querySelector('[data-snap-create]')) };
  });
  expect(r.active).toBe(true);
  expect(r.hasCreate).toBe(true);
});

test('snapshots are capped (oldest dropped)', async ({ page }) => {
  await openApp(page);
  const count = await page.evaluate(() => {
    const H = window.__sutraPublicBetaTestHooks;
    for (let i = 0; i < 6; i++) H.createWorkspaceSnapshot('S' + i);
    return H.getWorkspaceSnapshots().length;
  });
  expect(count).toBeLessThanOrEqual(3);
});
