import { expect, test } from '@playwright/test';

// Part 2 — Study & Review upgrades:
//  - Math/LaTeX rendering (vendored KaTeX, lazy + offline)
//  - Code syntax highlighting (dependency-free)
//  - Cloze deletions ({{...}})
//  - Robust deck import (Quizlet / Anki text / CSV)
//  - Retention analytics helpers (retention rate, due forecast)

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await page.evaluate(() => {
    try { if (typeof window.markStudentOnboardingCompleted === 'function') window.markStudentOnboardingCompleted(true); } catch (e) {}
    const o = document.getElementById('studentOnboardingOverlay');
    if (o) { o.classList.remove('active'); o.hidden = true; o.style.setProperty('display', 'none', 'important'); }
  });
  await page.waitForFunction(() => !!(window.SutraHighlight && window.SutraMath && window.SutraReviewTesting));
}

test('code highlighting tokenizes keywords, strings and comments (offline, no deps)', async ({ page }) => {
  await openApp(page);
  const html = await page.evaluate(() =>
    window.SutraHighlight.highlight('const x = "hi"; // note', 'js'));
  expect(html).toContain('tok-keyword');
  expect(html).toContain('tok-string');
  expect(html).toContain('tok-comment');
  // Output is escaped — no raw injection.
  expect(html).not.toContain('<script');
});

test('math renders via the locally-vendored KaTeX build (works same-origin/offline)', async ({ page }) => {
  await openApp(page);
  const out = await page.evaluate(async () => {
    await window.SutraMath.ensure();
    return window.SutraMath.renderToHtml('\\frac{1}{2} + x^2', true);
  });
  expect(out).not.toBeNull();
  expect(out).toContain('katex');
});

test('the vendored KaTeX asset is served same-origin (not a CDN)', async ({ request }) => {
  const css = await request.get('/assets/vendor/katex/katex.min.css');
  expect(css.ok()).toBeTruthy();
  const js = await request.get('/assets/vendor/katex/katex.min.js');
  expect(js.ok()).toBeTruthy();
});

test('cloze deletions blank the term on the front and reveal it on the back', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const T = window.SutraReviewTesting;
    return {
      isCloze: T.hasCloze('The capital of France is {{Paris}}.'),
      front: T.renderClozeHtml('The capital of France is {{Paris}}.', false),
      back: T.renderClozeHtml('The capital of France is {{Paris}}.', true)
    };
  });
  expect(r.isCloze).toBe(true);
  expect(r.front).toContain('review-cloze-blank');
  expect(r.front).not.toContain('Paris');
  expect(r.back).toContain('Paris');
});

test('import parses Quizlet (tab), CSV (quoted), and decodes entities', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const T = window.SutraReviewTesting;
    return {
      tab: T.parseImportLine('Mitochondria\tThe powerhouse of the cell'),
      csv: T.parseImportLine('"Cell, basic","Smallest unit of life"'),
      ent: T.parseImportLine('A &amp; B\tplus &lt;c&gt;')
    };
  });
  expect(r.tab.prompt).toBe('Mitochondria');
  expect(r.tab.answer).toContain('powerhouse');
  expect(r.csv.prompt).toBe('Cell, basic');
  expect(r.csv.answer).toBe('Smallest unit of life');
  expect(r.ent.prompt).toBe('A & B');
  expect(r.ent.answer).toBe('plus <c>');
});

test('bulk import creates cards and skips Anki "#" directive lines', async ({ page }) => {
  await openApp(page);
  const count = await page.evaluate(() => {
    const deck = window.createReviewDeck({ name: 'QA Import Deck' });
    if (!deck) return -1;
    const text = '#separator:tab\n#html:true\nApple\tA fruit\nDog\tAn animal';
    return window.bulkImportReviewCards(deck.id, text);
  });
  expect(count).toBe(2);
});

test('analytics helpers return well-formed shapes', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const T = window.SutraReviewTesting;
    const ret = T.getRetentionRate();
    const fc = T.getDueForecast(7);
    return { ret, len: fc.series.length, hasOverdue: typeof fc.overdue === 'number' };
  });
  expect(typeof r.ret.rate).toBe('number');
  expect(r.ret.rate).toBeGreaterThanOrEqual(0);
  expect(r.ret.rate).toBeLessThanOrEqual(100);
  expect(r.len).toBe(7);
  expect(r.hasOverdue).toBe(true);
});
