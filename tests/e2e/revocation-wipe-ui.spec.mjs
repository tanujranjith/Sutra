import { test, expect } from '@playwright/test';

const GUARD_KEY = 'sutra:revocationWipeGuard:v1';

async function openWithGuard(page, status) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, status: value, updatedAt: new Date().toISOString() }));
  }, { key: GUARD_KEY, value: status });
  await page.goto('/Sutra.html');
  await expect(page.locator('#sutraRevokedDeviceScreen')).toBeVisible();
}

test('an enumeration-unverified wipe remains fail-closed until browser site data is cleared', async ({ page }) => {
  await openWithGuard(page, 'complete-unverified');
  await expect(page.locator('#sutraRevokedDeviceReuse')).toBeHidden();
  await expect(page.locator('#sutraRevokedDeviceMessage')).toContainText('cannot verify');
  await expect(page.locator('#sutraRevokedDeviceMessage')).toContainText('Clear all site data');
});

test('a fully verified wipe permits an explicit empty-workspace restart', async ({ page }) => {
  await openWithGuard(page, 'complete');
  await expect(page.locator('#sutraRevokedDeviceReuse')).toBeVisible();
});
