import { expect, test } from '@playwright/test';

// Part 6 — Mobile: bottom tab bar (+ swipe / pull-to-refresh wiring).
// The bottom nav reuses the existing .view-tab click handlers, so tapping an
// item must switch the active view. It is phones-only (hidden ≥ 641px).

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await page.waitForFunction(() => window.__hwDueDateDelegateBound === true
    && !!window.SutraNotifications);
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
  await expect(page.locator('.top-nav')).toBeHidden();
  await expect(page.locator('#sidebarToggle')).toBeHidden();
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

test('Notes keeps a contextual arrow that opens the complete notes sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.locator('#sutraBottomNav [data-bn-view="notes"]').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.view)).toBe('notes');

  const sidebar = page.locator('#sidebar');
  const toggle = page.locator('#sidebarToggle');
  if (!(await sidebar.evaluate((node) => node.classList.contains('collapsed')))) {
    await page.evaluate(() => document.getElementById('sidebarToggle').click());
  }

  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-label', 'Open notes list');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar).toHaveAttribute('role', 'dialog');
  await expect(sidebar.locator('#pagesList')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/sidebar-open/);

  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('body')).not.toHaveClass(/sidebar-open/);
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeFocused();
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
  await expect(sheet.locator('[data-mobile-more-action="pages"]')).toBeHidden();
  await expect(sheet.locator('[data-mobile-more-action="new-dashboard"]')).toBeVisible();
  await expect(sheet.locator('[data-mobile-more-action="notifications"]')).toBeVisible();
  await expect(sheet.locator('[data-mobile-more-view]')).toHaveCount(await page.locator('.view-tab[data-view]:not([hidden])').evaluateAll((nodes) => new Set(nodes.map((node) => node.dataset.view)).size));
  if (process.env.SUTRA_CAPTURE_QA === '1') {
    await page.screenshot({ path: '.tmp/mobile-unified-navigation-more.png', fullPage: false });
  }

  await page.evaluate(() => history.back());
  await expect(sheet).toBeHidden();
  await expect(more).toBeFocused();

  await more.click();
  await expect(sheet).toBeVisible();

  await sheet.locator('[data-mobile-more-view="settings"]').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.view)).toBe('settings');
  await expect(sheet).toBeHidden();
});

test('More clears its modal and history state when desktop navigation takes over', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  const more = page.locator('#sutraBottomNav [data-bn-view="__more"]');
  const sheet = page.locator('#sutraMobileMoreOverlay');

  await more.click();
  await expect(sheet).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/mobile-more-open/);

  await page.setViewportSize({ width: 900, height: 800 });
  await expect.poll(() => page.evaluate(() => {
    const overlay = document.getElementById('sutraMobileMoreOverlay');
    return {
      hidden: overlay.hidden,
      ariaHidden: overlay.getAttribute('aria-hidden'),
      bodyOpen: document.body.classList.contains('mobile-more-open'),
      historyOpen: !!(history.state && history.state.sutraMobileMore === true)
    };
  })).toEqual({
    hidden: true,
    ariaHidden: 'true',
    bodyOpen: false,
    historyOpen: false
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sheet).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/mobile-more-open/);
});

test('phone workspace save status and actions are reachable through More', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.locator('#sutraBottomNav [data-bn-view="homework"]').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.view)).toBe('homework');
  const homeworkSetup = page.locator('#hwSetupOverlay');
  if (await homeworkSetup.isVisible()) {
    await homeworkSetup.getByRole('button', { name: 'Cancel for now' }).click();
    await expect(homeworkSetup).toBeHidden();
  }
  await expect(page.locator('#storageOptions')).toBeHidden();
  const more = page.locator('#sutraBottomNav [data-bn-view="__more"]');
  await more.click();
  const overlay = page.locator('#sutraMobileMoreOverlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Close all sections' })).toBeFocused();
  const status = overlay.locator('.sutra-mobile-save-status');
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute('role', 'status');
  await expect.poll(() => page.evaluate(() => {
    const normalizedText = (node) => node.textContent.replace(/\s+/g, ' ').trim();
    const canonical = normalizedText(document.getElementById('taskbarSaveStatus'));
    return canonical.length > 0
      && normalizedText(document.querySelector('#sutraMobileMoreOverlay .sutra-mobile-save-status')) === canonical;
  })).toBe(true);

  const save = overlay.getByRole('button', { name: 'Save locally', exact: true });
  const backup = overlay.getByRole('button', { name: 'Data & Backup', exact: true });
  await expect(save).toBeVisible();
  await expect(save).toBeEnabled();
  await expect(backup).toBeVisible();
  await expect(backup).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(save).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(overlay.getByRole('button', { name: 'Export', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(overlay.getByRole('button', { name: 'Import', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(backup).toBeFocused();

  await expect.poll(() => page.evaluate(() => {
    const panel = document.querySelector('#sutraMobileMoreOverlay .sutra-mobile-more-sheet').getBoundingClientRect();
    const status = document.querySelector('#sutraMobileMoreOverlay .sutra-mobile-save-status').getBoundingClientRect();
    const nav = document.getElementById('sutraBottomNav').getBoundingClientRect();
    const actions = ['save', 'cloud'].map((action) => document.querySelector(
      '#sutraMobileMoreOverlay [data-mobile-more-action="' + action + '"]'
    ).getBoundingClientRect());
    return {
      sheetContained: panel.left >= 0 && panel.right <= innerWidth && panel.top >= 0 && panel.bottom <= innerHeight,
      statusContained: status.left >= panel.left && status.right <= panel.right && status.top >= panel.top && status.bottom <= panel.bottom,
      primaryTargetsUsable: actions.every((rect) => rect.width >= 44 && rect.height >= 44
        && rect.left >= panel.left && rect.right <= panel.right && rect.top >= panel.top && rect.bottom <= panel.bottom),
      navigationContained: nav.left >= 0 && nav.right <= innerWidth && nav.top >= 0 && nav.bottom <= innerHeight
    };
  })).toEqual({ sheetContained: true, statusContained: true, primaryTargetsUsable: true, navigationContained: true });

  if (process.env.SUTRA_CAPTURE_QA === '1') {
    await page.screenshot({ path: '.tmp/mobile-unified-navigation-homework.png', fullPage: false });
  }
  await page.keyboard.press('Enter');
  await expect(overlay).toBeHidden();
  await expect(page.locator('#sutraCloudModal')).toHaveClass(/active/);
});

test('phone sidebar opens from the unified More sheet and Escape restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.locator('#sutraBottomNav [data-bn-view="notes"]').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.view)).toBe('notes');
  const sidebar = page.locator('#sidebar');
  const toggle = page.locator('#sidebarToggle');
  if (!(await sidebar.evaluate((node) => node.classList.contains('collapsed')))) {
    await page.evaluate(() => document.getElementById('sidebarToggle').click());
  }

  const more = page.locator('#sutraBottomNav [data-bn-view="__more"]');
  await more.click();
  await page.locator('[data-mobile-more-action="pages"]').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toBeVisible();
  await expect(sidebar).toHaveAttribute('role', 'dialog');
  await expect(sidebar).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('body')).toHaveClass(/sidebar-open/);
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('body')).not.toHaveClass(/sidebar-open/);
  await expect(more).toBeFocused();
});

test('unified More actions open Notifications and the custom dashboard prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  const more = page.locator('#sutraBottomNav [data-bn-view="__more"]');
  const unread = await page.evaluate(() => window.SutraNotifications
    .getNotifications().filter(notification => !notification.read).length);
  expect(unread).toBeGreaterThan(0);
  await expect(more.locator('.sutra-mobile-nav-badge')).toHaveText(unread > 99 ? '99+' : String(unread));
  await expect(more).toHaveAttribute('aria-label', `More, ${unread} unread notification${unread === 1 ? '' : 's'}`);

  await more.click();
  await page.locator('[data-mobile-more-action="notifications"]').click();
  await expect(page.locator('#notifPanel')).toBeVisible();
  await page.locator('#notifCloseBtn').click();
  await expect(page.locator('#notifPanel')).toHaveAttribute('aria-hidden', 'true');
  await expect(more).toBeFocused();

  await more.click();
  await page.locator('[data-mobile-more-action="new-dashboard"]').click();
  await expect(page.locator('#customPromptModal')).toHaveClass(/active/);
  await expect(page.locator('#customPromptTitle')).toHaveText('New tab');
});

test('More actions wait for delayed history teardown before opening the next panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.evaluate(() => {
    const back = history.back.bind(history);
    history.back = () => {
      // Controlled slow popstate, not a readiness sleep: the former 210ms
      // action timer would open Notifications while the old sheet still owned focus.
      window.setTimeout(() => {
        window.__moreOpenedBeforeHistory = document.getElementById('notifPanel').getAttribute('aria-hidden') === 'false';
        back();
      }, 500);
    };
  });
  const more = page.locator('#sutraBottomNav [data-bn-view="__more"]');
  await more.click();
  await expect.poll(() => page.evaluate(() => history.state?.sutraMobileMore)).toBe(true);
  await page.locator('[data-mobile-more-action="notifications"]').click();
  // This drawer remains CSS-visible while translated offscreen and transparent.
  // Wait for its actual open state before reading the delayed-history probe.
  await expect(page.locator('#notifPanel')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#notifPanel')).toBeVisible();
  expect(await page.evaluate(() => window.__moreOpenedBeforeHistory)).toBe(false);
  await expect(page.locator('#sutraMobileMoreOverlay')).toBeHidden();
  await page.locator('#notifCloseBtn').click();
  await expect(more).toBeFocused();
});

test('bottom nav is hidden on a desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
  await expect(page.locator('#sutraBottomNav')).toBeHidden();
});
