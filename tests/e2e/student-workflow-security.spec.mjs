import { expect, test } from '@playwright/test';

test('all Assistant action aliases deny missing permissions and preserve approved local actions', async ({ page }) => {
  await page.goto('/Sutra.html');
  await page.waitForFunction(() => window.SutraFeatureRegistry && window.SutraAssistantPermissions);
  await page.evaluate(() => window.SutraFeatureRegistry.enable('assistant', { test: true }));
  await page.waitForFunction(() => window.flowAssistant && window.SutraAssistantActions);
  const result = await page.evaluate(() => {
    const policy = window.SutraAssistantPrivacy;
    const action = { type: 'create_task', title: 'Permission regression control' };
    const api = window.SutraAssistantActions;
    window.SutraAssistantPrivacy = undefined;
    const missing = [window.flowAssistant.applyAction(action), window.flowAssistant.applyActionLogged(action), api.applyAction(action, { permissions: ['workspace.write'] })];
    window.SutraAssistantPrivacy = policy;
    window.SutraAssistantPermissions.setMode('read_only');
    const denied = api.applyAction(action, { reviewed: true, permissions: ['workspace.write'] });
    window.SutraAssistantPermissions.setMode('approved_actions');
    const allowed = api.applyAction(action, { reviewed: true });
    return { missing, denied, allowed };
  });
  expect(result.missing.every(item => item.ok === false)).toBe(true);
  expect(result.denied.ok).toBe(false);
  expect(result.allowed.ok).toBe(true);
});
