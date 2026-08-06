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

test('More opens a focus-trapped all-sections sheet and reaches advanced views', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  const more = page.locator('#sutraBottomNav [data-bn-view="__more"]');
  await expect(more).toBeVisible();
  await more.click();

  const sheet = page.locator('#sutraMobileMoreOverlay');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('dialog', { name: 'All sections' })).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/mobile-more-open/);
  await expect(sheet.locator('[data-mobile-more-view]')).toHaveCount(await page.locator('.view-tab[data-view]:not([hidden])').evaluateAll((nodes) => new Set(nodes.map((node) => node.dataset.view)).size));

  await page.evaluate(() => history.back());
  await expect(sheet).toBeHidden();
  await expect(more).toBeFocused();

  await more.click();
  await expect(sheet).toBeVisible();

  await sheet.locator('[data-mobile-more-view="settings"]').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.view)).toBe('settings');
  await expect(sheet).toBeHidden();
});

test('phone sidebar behaves as a modal drawer and Escape restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  const sidebar = page.locator('#sidebar');
  const toggle = page.locator('#sidebarToggle');
  if (!(await sidebar.evaluate((node) => node.classList.contains('collapsed')))) await toggle.click();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar).toHaveAttribute('role', 'dialog');
  await expect(sidebar).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('body')).toHaveClass(/sidebar-open/);
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('body')).not.toHaveClass(/sidebar-open/);
  await expect(toggle).toBeFocused();
});

test('bottom nav is hidden on a desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
  await expect(page.locator('#sutraBottomNav')).toBeHidden();
});
