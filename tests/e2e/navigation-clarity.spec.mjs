import { expect, test } from '@playwright/test';

async function openApp(page, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => { sessionStorage.setItem('sutra_intro_played', '1'); });
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await page.evaluate(() => {
    try { if (typeof window.markStudentOnboardingCompleted === 'function') window.markStudentOnboardingCompleted(true); } catch {}
    document.body.classList.remove('onboarding-open');
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.hidden = true;
      overlay.style.setProperty('display', 'none', 'important');
    }
    window.setActiveView('today');
  });
  await expect(page.locator('#view-today')).toBeVisible();
}

async function enableAdvancedPacks(page) {
  await page.evaluate(() => {
    ['collegeapp', 'life', 'business', 'assistantview'].forEach((view) => {
      const toggle = document.querySelector(`#featureToggleListSettings [data-feature-view="${view}"]`);
      if (!toggle || toggle.checked) return;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    });
    window.setActiveView('today');
  });
  await expect(page.locator('#moreViewsWrapper')).toBeVisible();
}

test('desktop navigation keeps the daily loop direct and groups advanced packs in More', async ({ page }) => {
  await openApp(page);
  await enableAdvancedPacks(page);

  for (const view of ['today', 'homework', 'notes', 'timeline', 'apstudy', 'settings']) {
    await expect(page.locator(`.view-tabs > .view-tab[data-view="${view}"]`)).toBeVisible();
  }
  for (const view of ['collegeapp', 'life', 'business', 'assistantview']) {
    await expect(page.locator(`.view-tabs > .view-tab[data-view="${view}"]`)).toBeHidden();
  }

  const more = page.locator('#moreViewsToggle');
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#moreViewsMenu')).toBeVisible();
  await expect(page.locator('[data-nav-group="workspace"]')).toBeVisible();
  await expect(page.locator('[data-nav-group="tools"]')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'College' })).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Life' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#moreViewsMenu')).toBeHidden();
  await expect(more).toBeFocused();

  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Business' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'business');
  await expect(more).toContainText('Business');
  await expect(more).toHaveAttribute('aria-label', /current section Business/);
});

test('overflowed custom dashboards remain reachable through My dashboards', async ({ page }) => {
  await openApp(page, 1060);
  await page.waitForFunction(() => !!window.SutraCustomTabsBridge && !!window.SutraCustomTabs);
  await enableAdvancedPacks(page);
  await page.evaluate(() => {
    window.SutraCustomTabsBridge.setTabs([{ id: 'qa-night-shift', name: 'Night Shift', icon: 'fa-star', widgets: [] }]);
    window.SutraCustomTabs.refresh();
    window.setActiveView('today');
  });

  const direct = page.locator('.view-tabs > [data-custom-tab="qa-night-shift"]');
  const overflow = page.locator('#moreViewsMenu [data-generated-overflow-item="true"][data-view="custom-qa-night-shift"]');
  await expect(direct).toBeHidden();
  await page.locator('#moreViewsToggle').click();
  await expect(page.locator('[data-nav-group="custom"]')).toBeVisible();
  await expect(overflow).toBeVisible();
  await expect(overflow).toHaveText(/Night Shift/);

  await overflow.click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'custom-qa-night-shift');
  await expect(page.locator('#view-custom-qa-night-shift')).toBeVisible();
  await expect(page.locator('#moreViewsMenu')).toBeHidden();
});

test('the 641px tablet boundary never loses both navigation surfaces', async ({ page }) => {
  await openApp(page, 641);
  await expect(page.locator('.top-nav')).toBeVisible();
  await expect(page.locator('#sutraBottomNav')).toBeHidden();
  await expect(page.locator('#moreViewsWrapper')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  )).toBeLessThanOrEqual(1);
});
