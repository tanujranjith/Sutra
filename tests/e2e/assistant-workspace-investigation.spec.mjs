import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

test.use({ serviceWorkers: 'block' });
const tool = data => '```sutra-lookup\n' + JSON.stringify(data) + '\n```';
async function open(page, provider = 'openai') {
  await page.addInitScript(() => sessionStorage.setItem('sutra_intro_played', '1'));
  await page.goto('/Sutra.html'); await waitForAppReady(page);
  await page.evaluate(async provider => {
    localStorage.setItem('sutra_ai_send_ack_v1', '1');
    window.markStudentOnboardingCompleted?.(true);
    document.getElementById('sutraStartupIntro')?.remove();
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) { overlay.hidden = true; overlay.classList.remove('active'); overlay.style.display = 'none'; }
    document.body.classList.remove('onboarding-open');
    await window.SutraFeatureRegistry.enable('assistant', { test: true });
    window.flowAssistant.init();
    window.setWorkspacePreference('assistant.enabled', true);
    window.setWorkspacePreference('assistant.contextDepth', 'workspace');
    window.setWorkspacePreference('assistant.localRouting', false);
    window.setWorkspacePreference('assistant.chatMemoryMode', 'stateless');
    window.SutraAssistantPermissions.setMode('read_only');
    window.SutraAssistantPermissions.setArea('planning', 'approved');
    window.SutraProviderMeta.saveSessionKey(provider, 'fake-investigation-key');
    window.SutraProviderMeta.selectModel(provider, provider === 'gemini' ? 'gemini-3.5-flash' : 'gpt-6-luna');
    window.setActiveView('assistantview');
  }, provider);
  await expect(page.locator('#asstInput')).toBeVisible();
}
async function send(page, prompt) { await page.locator('#asstInput').fill(prompt); await page.locator('#asstSendBtn').click(); }
function mock(page, provider, replies, requests) {
  return page.route(provider === 'gemini' ? /generativelanguage\.googleapis\.com.*(?:generateContent|streamGenerateContent)/ : 'https://api.openai.com/v1/chat/completions', async route => {
    requests.push(route.request().postDataJSON());
    const text = replies.shift() || 'No additional reply should be requested.';
    const body = provider === 'gemini' ? { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, totalTokenCount: 16 } }
      : { choices: [{ message: { content: text } }], usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
for (const provider of ['openai', 'gemini']) {
  test(provider + ' sends search metadata, bounded canonical reads and a final comparison through the real chat path', async ({ page }) => {
    const requests = [];
    await mock(page, provider, [tool({ search: 'Orchid Cedar' }), tool({ read: ['task:orchid', 'task:cedar'] }), 'Orchid says Monday; Cedar says Tuesday. Their deadlines differ.'], requests);
    await open(page, provider);
    await page.evaluate(() => {
      window.flowAtelier.tasks.push({ id: 'orchid', title: 'Orchid assignment', notes: 'ORCHID_BODY: deadline Monday.', completed: false });
      window.flowAtelier.tasks.push({ id: 'cedar', title: 'Cedar assignment', notes: 'CEDAR_BODY: deadline Tuesday.', completed: false });
      window.flowAtelier.tasks.push({ id: 'unrelated', title: 'Unrelated geometry', notes: 'UNRELATED_BODY', completed: false });
      window.SutraWorkspaceEntityRegistry.invalidate('investigation-fixture');
    });
    await send(page, 'Compare my Orchid and Cedar assignment records and explain their different deadlines.');
    const reply = page.locator('#asstMessages .asst-msg.assistant').last();
    await expect(reply).toContainText('Their deadlines differ.');
    expect(requests).toHaveLength(3);
    expect(JSON.stringify(requests[0])).not.toContain('ORCHID_BODY');
    expect(JSON.stringify(requests[1])).toContain('Orchid assignment');
    expect(JSON.stringify(requests[1])).not.toContain('ORCHID_BODY');
    expect(JSON.stringify(requests[2])).toContain('ORCHID_BODY');
    expect(JSON.stringify(requests[2])).toContain('CEDAR_BODY');
    expect(JSON.stringify(requests)).not.toContain('UNRELATED_BODY');
    await expect(reply.locator('.assistant-sources')).toContainText('Orchid assignment');
    await expect(reply.locator('.assistant-sources')).toContainText('Cedar assignment');
    await expect(reply).not.toContainText('sutra-lookup');
    await expect(page.locator('[data-sutra-component="assistant-investigation-progress"]')).toHaveCount(0);
    const saved = await page.evaluate(() => window.SutraAssistantConversationController.getCurrent().messages);
    expect(JSON.stringify(saved)).not.toContain('sutra-lookup');
    expect(saved.filter(row => row.role === 'assistant')).toHaveLength(1);
  });
}

test('same-title ambiguity requires a keyboard-accessible explicit choice before source bodies are sent', async ({ page }) => {
  const requests = [];
  await mock(page, 'openai', [tool({ search: 'Orchid' }), 'The selected assignment uses the blue binder.'], requests);
  await open(page);
  await page.evaluate(() => {
    window.flowAtelier.tasks.push({ id: 'orchid-a', title: 'Orchid assignment', notes: 'UNSELECTED_RED_BODY', completed: false });
    window.flowAtelier.tasks.push({ id: 'orchid-b', title: 'Orchid assignment', notes: 'SELECTED_BLUE_BODY', completed: false });
    window.SutraWorkspaceEntityRegistry.invalidate('ambiguous-investigation');
  });
  await send(page, 'Investigate my Orchid assignment notes.');
  const choices = page.locator('[data-sutra-component="assistant-source-choice"]');
  await expect(choices).toBeVisible(); expect(requests).toHaveLength(1);
  await expect(choices.locator('.assistant-source-option')).toHaveCount(2);
  await expect(choices).not.toContainText('task:orchid-');
  await expect(choices.getByRole('status')).toHaveText('No sources selected');
  await expect(choices.getByRole('button', { name: 'Read selected sources' })).toBeDisabled();
  const status = page.locator('[data-sutra-component="assistant-investigation-progress"]');
  await expect(status).toHaveAttribute('role', 'status');
  await expect(status).toContainText('up to 3 provider calls');
  await expect(choices.locator('input[type="checkbox"]').first()).toBeFocused();
  await choices.locator('input[value="task:orchid-b"]').check();
  await expect(choices.getByRole('status')).toHaveText('1 source selected');
  await choices.getByRole('button', { name: 'Read selected sources' }).click();
  await expect(page.locator('#asstMessages .asst-msg.assistant').last()).toContainText('blue binder');
  expect(requests).toHaveLength(2);
  expect(JSON.stringify(requests[1])).toContain('SELECTED_BLUE_BODY');
  expect(JSON.stringify(requests[1])).not.toContain('UNSELECTED_RED_BODY');
  await expect(status).toHaveCount(0);
});

for (const cancellation of ['Stop', 'permission change']) {
  test(cancellation + ' ends a pending ambiguity choice without sending another request', async ({ page }) => {
    const requests = [];
    await mock(page, 'openai', [tool({ search: 'Orchid' })], requests);
    await open(page);
    await page.evaluate(() => {
      window.flowAtelier.tasks.push({ id: 'orchid-a', title: 'Orchid assignment', notes: 'PRIVATE_A', completed: false });
      window.flowAtelier.tasks.push({ id: 'orchid-b', title: 'Orchid assignment', notes: 'PRIVATE_B', completed: false });
      window.SutraWorkspaceEntityRegistry.invalidate('cancel-investigation');
    });
    await send(page, 'Investigate my Orchid assignment notes.');
    await expect(page.locator('[data-sutra-component="assistant-source-choice"]')).toBeVisible();
    if (cancellation === 'Stop') await page.locator('#asstSendBtn').click();
    else await page.evaluate(() => window.SutraAssistantPermissions.setArea('planning', 'denied'));
    await expect(page.locator('[data-sutra-component="assistant-source-choice"]')).toHaveCount(0);
    await expect(page.locator('#asstMessages')).toContainText('Stopped');
    await expect(page.locator('[data-sutra-component="assistant-investigation-progress"]')).toHaveCount(0);
    expect(requests).toHaveLength(1);
    expect(JSON.stringify(requests)).not.toContain('PRIVATE_A');
    expect(JSON.stringify(requests)).not.toContain('PRIVATE_B');
  });
}


test('saving Assistant enablement loads and reinitializes workspace-access controls without registry calls', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('sutra_intro_played', '1'));
  await page.goto('/Sutra.html');
  await waitForAppReady(page);
  await page.evaluate(() => {
    window.markStudentOnboardingCompleted?.(true);
    document.getElementById('sutraStartupIntro')?.remove();
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) { overlay.hidden = true; overlay.classList.remove('active'); overlay.style.display = 'none'; }
    document.body.classList.remove('onboarding-open');
    window.setActiveView('settings');
  });
  await page.locator('[data-settings-nav="assistant"]').click();
  const toggle = page.locator('[data-pref-path="assistant.enabled"]');
  const mode = page.locator('#assistantWorkspaceAccess');
  const status = page.locator('#assistantWorkspaceAccessStatus');
  if (await toggle.isChecked()) {
    await toggle.uncheck({ force: true });
    await page.locator('#settingsApplyBtnTop').click();
  }
  await expect(mode).toBeDisabled();
  await toggle.check({ force: true });
  await page.locator('#settingsApplyBtnTop').click();
  await expect(mode).toBeEnabled();
  await expect(status).not.toContainText('Enable Sutra Assistant');
  await mode.selectOption('read_only');
  await expect.poll(() => page.evaluate(() => window.SutraAssistantPermissions.get().mode)).toBe('read_only');
  // Exercise the loaded -> teardown -> reinit path as well as first enable.
  await toggle.uncheck({ force: true });
  await page.locator('#settingsApplyBtnTop').click();
  await expect(mode).toBeDisabled();
  await expect(status).toContainText('Enable Sutra Assistant');
  await toggle.check({ force: true });
  await page.locator('#settingsApplyBtnTop').click();
  await expect(mode).toBeEnabled();
  await expect(mode).toHaveValue('read_only');
  await mode.selectOption('ask_per_area');
  await expect.poll(() => page.evaluate(() => window.SutraAssistantPermissions.get().mode)).toBe('ask_per_area');
  await page.getByText('Access by area', { exact: true }).click();
  await page.getByLabel('Tasks & schedule access', { exact: true }).selectOption('approved');
  await expect.poll(() => page.evaluate(() => window.SutraAssistantPermissions.get().areas.planning)).toBe('approved');
});
