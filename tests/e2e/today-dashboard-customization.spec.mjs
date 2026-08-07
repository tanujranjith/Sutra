import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/Sutra.html?today-dashboard-test=1');
  await page.waitForFunction(() => !!window.SutraTodayDashboard && !!window.flowAtelier);
});

test('Today widgets can be shown, resized, reordered, and persisted', async ({ page }) => {
  await page.getByRole('button', { name: 'Customize' }).click();
  const modal = page.getByRole('dialog', { name: 'Make Today yours' });
  await expect(modal).toBeVisible();

  const habits = modal.locator('[data-widget-id="habits"]');
  await habits.locator('input[type="checkbox"]').check();
  await expect(page.locator('#view-today .today-panel-habits')).toBeVisible();

  const review = modal.locator('[data-widget-id="review"]');
  await review.locator('select').selectOption('wide');
  await expect(page.locator('#todayReviewCard')).toHaveClass(/today-widget-size-wide/);

  const assignments = modal.locator('[data-widget-id="assignments"]');
  await assignments.getByRole('button', { name: 'Move Assignments later' }).click();
  await modal.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await page.waitForFunction(() => !!window.SutraTodayDashboard && !!window.flowAtelier);
  await expect(page.locator('#view-today .today-panel-habits')).toBeVisible();
  await expect(page.locator('#todayReviewCard')).toHaveClass(/today-widget-size-wide/);

  const stored = await page.evaluate(() => window.SutraTodayDashboard.getPreferences());
  expect(stored.preset).toBe('custom');
  expect(stored.hidden).not.toContain('habits');
});

test('Calm preset keeps the mobile Today shell canonical', async ({ page }) => {
  await page.getByRole('button', { name: 'Customize' }).click();
  await page.getByRole('button', { name: /Calm/ }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#todayMobileShell')).toBeVisible();
  await expect(page.locator('#todayCustomizeDashboardBtn')).toBeHidden();
});
