import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

test.use({ serviceWorkers: 'block' });

async function open(page) {
  await page.addInitScript(() => sessionStorage.setItem('sutra_intro_played', '1'));
  await page.goto('/Sutra.html');
  await waitForAppReady(page);
  await page.evaluate(async () => {
    window.markStudentOnboardingCompleted?.(true);
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) { overlay.hidden = true; overlay.style.display = 'none'; overlay.classList.remove('active'); }
    document.body.classList.remove('onboarding-open');
    await window.SutraFeatureRegistry.enable('assistant', { test: true });
    window.flowAssistant.init();
    window.setActiveView('settings');
  });
  await page.locator('[data-settings-nav="assistant"]').click();
}

test('fresh Everyday is useful without autonomous writes or startup provider requests; saved restrictions survive reload', async ({ page }) => {
  const remote = [];
  page.on('request', request => { if (/api\.openai\.com|generativelanguage\.googleapis\.com|api\.groq\.com/.test(request.url())) remote.push(request.url()); });
  await open(page);
  await expect(page.locator('#assistantAccessPreset')).toHaveValue('everyday');
  await expect(page.locator('#assistantWorkspaceAccess')).toHaveValue('approved_actions');
  await expect(page.locator('[data-pref-path="assistant.contextDepth"]')).toHaveValue('workspace');
  await expect(page.locator('[data-pref-path="assistant.chatMemoryMode"]')).toHaveValue('stateful');
  expect(await page.evaluate(() => window.SutraAssistantPrivacy.getActionPermissions())).not.toContain('workspace.write');

  await page.getByText('Access by area', { exact: true }).click();
  await page.locator('[data-assistant-permission-area="notes"]').selectOption('denied');
  await expect(page.locator('#assistantWorkspaceAccessStatus')).toContainText('Assistant access change saved locally.');
  await page.locator('#assistantAccessPreset').selectOption('advanced');
  await page.locator('#assistantAccessPreset').selectOption('private');
  await expect(page.locator('#assistantWorkspaceAccessStatus')).toContainText('Assistant access change saved locally.');
  await page.reload(); await waitForAppReady(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('[data-settings-nav="assistant"]').click();
  await expect(page.locator('#assistantAccessPreset')).toHaveValue('private');
  await expect(page.locator('#assistantWorkspaceAccess')).toHaveValue('off');
  await expect(page.locator('[data-assistant-permission-area="notes"]')).toHaveValue('denied');
  expect(await page.evaluate(() => window.SutraAssistantPrivacy.canRead('notes'))).toBe(false);
  await page.locator('#assistantAccessPreset').selectOption('everyday');
  await expect(page.locator('#assistantWorkspaceAccess')).toHaveValue('approved_actions');
  await expect(page.locator('[data-assistant-permission-area="notes"]')).toHaveValue('denied');
  expect(await page.evaluate(() => window.SutraAssistantPrivacy.canRead('notes'))).toBe(false);
  await expect(page.locator('#assistantWorkspaceAccessStatus')).toContainText('Assistant access change saved locally.');
  expect(remote).toEqual([]);
});

test('preset refuses an unsaved draft; Advanced leaves current permissions intact', async ({ page }) => {
  await open(page);
  await page.locator('[data-pref-path="assistant.chatMemoryMode"]').selectOption('stateless');
  await page.locator('#assistantAccessPreset').selectOption('private');
  await expect(page.locator('#assistantWorkspaceAccessStatus')).toContainText('Save or Revert');
  expect(await page.evaluate(() => window.SutraAssistantPermissions.get().mode)).toBe('approved_actions');
  await expect(page.locator('[data-pref-path="assistant.chatMemoryMode"]')).toHaveValue('stateless');
  await page.locator('#view-settings').getByRole('button', { name: 'Revert', exact: true }).click();
  await page.locator('#assistantAccessPreset').selectOption('advanced');
  await expect(page.locator('#assistantWorkspaceAccessStatus')).toContainText('keeps your current permissions');
  expect(await page.evaluate(() => window.SutraAssistantPermissions.get().mode)).toBe('approved_actions');
});

test('permission save failure keeps the selected restriction and offers Retry save', async ({ page }) => {
  await open(page);
  const status = page.locator('#assistantWorkspaceAccessStatus');
  await page.getByText('Access by area', { exact: true }).click();
  await page.locator('[data-assistant-permission-area="notes"]').selectOption('denied');
  await expect(status).toContainText('Assistant access change saved locally.');

  await page.evaluate(() => {
    const owner = window.flowAtelier;
    const flush = owner.flushAppSaveNow;
    owner.flushAppSaveNow = (...args) => {
      owner.flushAppSaveNow = flush;
      return Promise.reject(new Error('Simulated permission save rejection.'));
    };
  });
  await page.locator('#assistantAccessPreset').selectOption('private');
  await expect(status).toContainText('Could not confirm saving this Assistant access change.');
  await expect(status.getByRole('button', { name: 'Retry save', exact: true })).toBeEnabled();
  await expect(status).not.toContainText('Assistant access change saved locally.');
  expect(await page.evaluate(() => window.SutraAssistantPermissions.get())).toMatchObject({ mode: 'off', areas: { notes: 'denied' } });

  await status.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(status).toContainText('Assistant access change saved locally.');
  await page.reload(); await waitForAppReady(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('[data-settings-nav="assistant"]').click();
  await expect(page.locator('#assistantAccessPreset')).toHaveValue('private');
  await expect(page.locator('[data-assistant-permission-area="notes"]')).toHaveValue('denied');
});

test('reviewed task creation applies once with Undo; importing missing permissions fails closed', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.setActiveView('assistantview');
    window.flowAssistant.renderActionCards(document.getElementById('asstMessages'), [{ type: 'create_task', title: 'QA Everyday reviewed task' }]);
  });
  const card = page.locator('.flow-action-card').last();
  expect(await page.evaluate(() => window.flowAssistant.listOpenWorkspaceTasks().some(row => row.title === 'QA Everyday reviewed task'))).toBe(false);
  await card.locator('.flow-action-apply').click();
  await expect(card.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.flowAssistant.listOpenWorkspaceTasks().filter(row => row.title === 'QA Everyday reviewed task').length)).toBe(1);
  await card.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => window.flowAssistant.listOpenWorkspaceTasks().some(row => row.title === 'QA Everyday reviewed task'))).toBe(false);
  await page.evaluate(() => {
    const payload = window.serializeWorkspace();
    delete payload.assistantPermissions;
    if (payload.workspace) delete payload.workspace.assistantPermissions;
    delete payload.settings.preferences.assistant.contextDepth;
    delete payload.settings.preferences.assistant.chatMemoryMode;
    delete payload.settings.preferences.assistant.chatMemoryDepth;
    window.deserializeWorkspace(payload);
  });
  expect(await page.evaluate(() => window.SutraAssistantPermissions.get().mode)).toBe('off');
  expect(await page.evaluate(() => window.getWorkspacePreference('assistant.chatMemoryMode'))).toBe('stateless');
  expect(await page.evaluate(() => window.getWorkspacePreference('assistant.contextDepth'))).toBe('currentView');
});

test('enabling Everyday beside a blocked proposal does not apply that proposal', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.SutraAssistantPermissions.setMode('read_only');
    window.setActiveView('assistantview');
    window.flowAssistant.renderActionCards(document.getElementById('asstMessages'), [{ type: 'create_task', title: 'QA explicit review still required' }]);
  });
  const card = page.locator('.flow-action-card').last();
  await card.getByRole('button', { name: 'Use Everyday Assistant', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Use Everyday Assistant?', exact: true });
  await confirmation.getByRole('button', { name: 'Keep current permissions', exact: true }).click();
  expect(await page.evaluate(() => window.SutraAssistantPermissions.get().mode)).toBe('read_only');
  await card.getByRole('button', { name: 'Use Everyday Assistant', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Enable Everyday', exact: true }).click();
  await expect(card).toContainText('Assistant access change saved locally.');
  expect(await page.evaluate(() => window.flowAssistant.listOpenWorkspaceTasks().some(row => row.title === 'QA explicit review still required'))).toBe(false);
  await expect(card.locator('.flow-action-apply')).toBeEnabled();
});
