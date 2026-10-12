import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

test.use({ serviceWorkers: 'block' });

async function openAssistant(page) {
  await page.addInitScript(() => sessionStorage.setItem('sutra_intro_played', '1'));
  await page.goto('/Sutra.html');
  await waitForAppReady(page);
  await page.evaluate(() => {
    window.markStudentOnboardingCompleted?.(true);
    document.getElementById('sutraStartupIntro')?.remove();
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) { overlay.hidden = true; overlay.classList.remove('active'); overlay.style.display = 'none'; }
    document.body.classList.remove('onboarding-open');
    window.setWorkspacePreference('assistant.enabled', true);
    window.setActiveView('assistantview');
  });
  await expect(page.locator('#asstInput')).toBeVisible();
}

test('Gemini refreshes an existing catalog, selections replace custom overrides, and effort is visible for Gemini and OpenAI', async ({ page }) => {
  let listRequests = 0;
  await page.route(url => url.hostname === 'generativelanguage.googleapis.com' && url.pathname === '/v1beta/models', async route => {
    listRequests++;
    const second = new URL(route.request().url()).searchParams.get('pageToken') === 'second';
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(second
      ? { models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] }
      : { models: [{ name: 'models/gemma-example', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }], nextPageToken: 'second' }) });
  });
  await page.route('https://api.openai.com/v1/models', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'gpt-6-luna' }] }) }));
  await openAssistant(page);
  await page.evaluate(() => {
    window.SutraProviderMeta.saveSessionKey('gemini', 'fake-gemini-key');
    window.SutraProviderMeta.saveSessionKey('openai', 'fake-openai-key');
    window.SutraProviderMeta.selectModel('gemini', 'gemma-example');
    window.SutraSafeStorage.set('chat_models_cache_gemini', ['gemini-3.5-flash']);
    window.setActiveView('assistantview');
  });
  await page.locator('#asstModelBtn').click();
  const picker = page.locator('#asstModelPop');
  const model = picker.locator('select[aria-label="Model"]');
  await expect(model.locator('option[value="gemini-3.8-flash"]')).toHaveCount(1);
  expect(listRequests).toBe(2);
  await model.selectOption('gemini-3.8-flash', { force: true });
  await expect(page.locator('#asstModelLabel')).toHaveText('gemini-3.8-flash');
  await expect(picker.locator('input[aria-label="Model ID"]')).toHaveValue('');
  await expect(page.locator('#asstReasoningRow')).toBeVisible();
  await page.locator('#asstInput').click();
  await page.locator('#asstReasoningSelect').selectOption('high', { force: true });
  await page.locator('#asstModelBtn').click();
  await picker.locator('select[aria-label="AI provider"]').selectOption('openai', { force: true });
  await expect(model.locator('option[value="gpt-6-luna"]')).toHaveCount(1);
  await model.selectOption('gpt-6-luna', { force: true });
  await expect(page.locator('#asstReasoningRow')).toBeVisible();
  await expect(page.locator('#asstReasoningSelect option[value="xhigh"]')).toHaveCount(1);
  await picker.locator('select[aria-label="AI provider"]').selectOption('gemini', { force: true });
  await expect(page.locator('#asstModelLabel')).toHaveText('gemini-3.8-flash');
  await page.locator('#asstInput').click();
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('model-selection-review'));
  await page.reload();
  await waitForAppReady(page);
  await page.evaluate(() => window.setActiveView('assistantview'));
  await expect(page.locator('#asstModelLabel')).toHaveText('gemini-3.8-flash');
});

test('Assistant reads the full to-do store locally and retrieves relevant cross-workspace context without dumping unrelated records', async ({ page }) => {
  await openAssistant(page);
  await page.evaluate(() => {
    window.flowAtelier.tasks.push({ id: 'orchid-task', title: 'Orchid protocol worksheet', completed: false, priority: 'low', dueDate: '2099-12-01' });
    window.flowAtelier.tasks.push({ id: 'undated-task', title: 'Clean locker', completed: false });
    window.flowAtelier.collegeAppWorkspace.collegeTracker.push({ id: 'unrelated-school', school: 'Unrelated College Sentinel' });
    window.SutraAssistantPermissions.setMode('read_only');
    window.SutraAssistantPermissions.setArea('planning', 'approved');
    window.SutraWorkspaceEntityRegistry.invalidate('assistant-fixture');
  });
  await page.locator('#asstInput').fill("what's in my to-do list?");
  await page.locator('#asstSendBtn').click();
  await expect(page.locator('#asstMessages')).toContainText('Orchid protocol worksheet');
  await expect(page.locator('#asstMessages')).toContainText('Clean locker');
  const context = await page.evaluate(() => window.flowAssistant.buildRequestEnrichment('Explain the Orchid protocol worksheet', 'gemini').context);
  expect(context.tasks.some(row => row.id === 'orchid-task')).toBe(true);
  expect(JSON.stringify(context)).not.toContain('Unrelated College Sentinel');
  expect(context.college).toBeUndefined();
  await page.evaluate(() => window.SutraAssistantPermissions.setArea('planning', 'denied'));
  const denied = await page.evaluate(() => window.flowAssistant.buildRequestEnrichment('Explain the Orchid protocol worksheet', 'gemini').context);
  expect(JSON.stringify(denied)).not.toContain('Orchid protocol worksheet');
});
