import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

test('Assistant action aliases require reviewed writes in approved_actions mode', async ({ page }) => {
  await page.goto('/Sutra.html');
  await page.waitForFunction(() => window.SutraFeatureRegistry && window.SutraAssistantPermissions);
  await waitForAppReady(page);
  await page.evaluate(() => window.SutraFeatureRegistry.enable('assistant', { test: true }));
  await page.waitForFunction(() => window.flowAssistant && window.SutraAssistantActions);
  const result = await page.evaluate(async () => {
    const policy = window.SutraAssistantPrivacy;
    const action = { type: 'create_task', title: 'Permission regression control' };
    const api = window.SutraAssistantActions;
    window.SutraAssistantPrivacy = undefined;
    const missing = [window.flowAssistant.applyAction(action), window.flowAssistant.applyActionLogged(action), api.applyAction(action, { permissions: ['workspace.write'] })];
    window.SutraAssistantPrivacy = policy;
    window.SutraAssistantPermissions.setMode('read_only');
    const readOnlyDenied = api.applyAction(action, { reviewed: true, permissions: ['workspace.write'] });
    window.SutraAssistantPermissions.setMode('approved_actions');
    const unreviewed = [
      window.flowAssistant.applyAction(action, { permissions: ['workspace.write'] }),
      window.flowAssistant.applyActionLogged(action, { permissions: ['workspace.write'] }),
      api.applyAction(action, { permissions: ['workspace.write'] })
    ];
    const beforeReviewed = window.flowAssistant.listOpenWorkspaceTasks().some(item => item.title === action.title);
    const reviewed = api.applyAction(action, { reviewed: true });
    const afterReviewed = window.flowAssistant.listOpenWorkspaceTasks().some(item => item.title === action.title);
    const batchAction = { type: 'create_task', title: 'Confirmed but unreviewed batch action' };
    const confirmedOnlyBatch = await api.applyBatch([batchAction], { confirmed: true });
    const batchDeniedVisible = window.flowAssistant.listOpenWorkspaceTasks().some(item => item.title === batchAction.title);
    const reviewedBatchAction = { type: 'create_task', title: 'Reviewed batch action' };
    const reviewedBatch = await api.applyBatch([reviewedBatchAction], { confirmed: true, reviewed: true });
    const reviewedBatchVisible = window.flowAssistant.listOpenWorkspaceTasks().some(item => item.title === reviewedBatchAction.title);
    return { missing, readOnlyDenied, unreviewed, beforeReviewed, reviewed, afterReviewed,
      confirmedOnlyBatch, batchDeniedVisible, reviewedBatch, reviewedBatchVisible };
  });
  expect(result.missing.every(item => item.ok === false)).toBe(true);
  expect(result.readOnlyDenied.ok).toBe(false);
  expect(result.unreviewed.every(item => item.ok === false)).toBe(true);
  expect(result.beforeReviewed).toBe(false);
  expect(result.reviewed.ok).toBe(true);
  expect(result.afterReviewed).toBe(true);
  expect(result.confirmedOnlyBatch.ok).toBe(false);
  expect(result.batchDeniedVisible).toBe(false);
  expect(result.reviewedBatch.ok).toBe(true);
  expect(result.reviewedBatchVisible).toBe(true);
});
