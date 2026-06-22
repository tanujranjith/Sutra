import { expect, test } from '@playwright/test';

// Part 4 — Notes & Search:
//  - Backlinks / linked references (reverse index over page-link tokens)
//  - Fuzzy, relevance-ranked global search

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await page.evaluate(() => {
    try { if (typeof window.markStudentOnboardingCompleted === 'function') window.markStudentOnboardingCompleted(true); } catch (e) {}
    const o = document.getElementById('studentOnboardingOverlay');
    if (o) { o.classList.remove('active'); o.hidden = true; o.style.setProperty('display', 'none', 'important'); }
  });
  await page.waitForFunction(() => !!(window.__sutraPublicBetaTestHooks && window.__sutraPublicBetaTestHooks.getBacklinksForPage));
}

test('backlinks: a page that links to another shows up as a linked reference', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const H = window.__sutraPublicBetaTestHooks;
    const target = H.createNoteInActiveSpace('Mitochondria', '<p>The powerhouse.</p>');
    const linkHtml = '<p>See <span class="page-link" data-page-id="' + target.id + '" contenteditable="false">Mitochondria</span> for detail.</p>';
    const source = H.createNoteInActiveSpace('Cell Biology', linkHtml);
    const back = H.getBacklinksForPage(target.id);
    return { count: back.length, hasSource: back.some(b => b.id === source.id), selfExcluded: !back.some(b => b.id === target.id) };
  });
  expect(r.count).toBeGreaterThanOrEqual(1);
  expect(r.hasSource).toBe(true);
  expect(r.selfExcluded).toBe(true);
});

test('fuzzy search matches a subsequence in a note title', async ({ page }) => {
  await openApp(page);
  const found = await page.evaluate(() => {
    const H = window.__sutraPublicBetaTestHooks;
    H.createNoteInActiveSpace('Photosynthesis', '<p>light to energy</p>');
    const res = H.searchAll('psyn'); // subsequence of "photosynthesis"
    return (res.notes || []).some(n => /Photosynthesis/i.test(n.title));
  });
  expect(found).toBe(true);
});

test('search results are ranked: an exact/prefix title beats a buried match', async ({ page }) => {
  await openApp(page);
  const order = await page.evaluate(() => {
    const H = window.__sutraPublicBetaTestHooks;
    H.createNoteInActiveSpace('a long buried test note', '<p>x</p>');
    H.createNoteInActiveSpace('Test', '<p>y</p>');
    const res = H.searchAll('test');
    return (res.notes || []).map(n => n.title);
  });
  const exactIdx = order.findIndex(t => t === 'Test');
  const buriedIdx = order.findIndex(t => /buried/.test(t));
  expect(exactIdx).toBeGreaterThanOrEqual(0);
  expect(buriedIdx).toBeGreaterThanOrEqual(0);
  expect(exactIdx).toBeLessThan(buriedIdx);
});

test('the backlinks panel container exists in the notes view', async ({ page }) => {
  await openApp(page);
  const exists = await page.evaluate(() => !!document.getElementById('notesBacklinksPanel'));
  expect(exists).toBe(true);
});
