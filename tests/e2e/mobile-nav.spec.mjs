import { expect, test } from '@playwright/test';

// Part 6 — Mobile: bottom tab bar (+ swipe / pull-to-refresh wiring).
// The bottom nav reuses the existing .view-tab click handlers, so tapping an
// item must switch the active view. It is phones-only (hidden ≥ 641px).

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await page.evaluate(() => {
    try { if (typeof window.markStudentOnboardingCompleted === 'function') window.markStudentOnboardingCompleted(true); } catch (e) {}
    const o = document.getElementById('studentOnboardingOverlay');
    if (o) { o.classList.remove('active'); o.hidden = true; o.style.setProperty('display', 'none', 'important'); }
  });
  await page.waitForFunction(() => !!document.getElementById('sutraBottomNav'));
}

test('bottom nav is visible on a phone viewport and has items', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  const nav = page.locator('#sutraBottomNav');
  await expect(nav).toBeVisible();
  const count = await nav.locator('.sutra-bn-item').count();
  expect(count).toBeGreaterThanOrEqual(3);
});

test('tapping a bottom-nav item switches the active view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  // Find a bottom-nav item that targets a concrete view other than the current one.
  const targetView = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#sutraBottomNav .sutra-bn-item[data-bn-view]'));
    const cur = document.body.dataset.view || 'today';
    const other = items.map(i => i.getAttribute('data-bn-view')).find(v => v && v !== '__more' && v !== cur);
    return other || null;
  });
  expect(targetView).not.toBeNull();
  await page.locator(`#sutraBottomNav .sutra-bn-item[data-bn-view="${targetView}"]`).click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.view)).toBe(targetView);
});

test('bottom nav active item tracks the current view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  const activeView = await page.evaluate(() => {
    const a = document.querySelector('#sutraBottomNav .sutra-bn-item.active');
    return a ? a.getAttribute('data-bn-view') : null;
  });
  const bodyView = await page.evaluate(() => document.body.dataset.view || 'today');
  expect(activeView).toBe(bodyView);
});

test('bottom nav is hidden on a desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
  await expect(page.locator('#sutraBottomNav')).toBeHidden();
});
