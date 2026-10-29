import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';
import { openResponseDetails } from './helpers/assistant-details.mjs';

test.use({ serviceWorkers: 'block' });

async function openLocalAssistant(page) {
  await page.addInitScript(() => sessionStorage.setItem('sutra_intro_played', '1'));
  await page.goto('/Sutra.html');
  await waitForAppReady(page);
  await page.evaluate(async () => {
    window.markStudentOnboardingCompleted?.(true);
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) { overlay.hidden = true; overlay.classList.remove('active'); overlay.setAttribute('aria-hidden', 'true'); overlay.style.setProperty('display', 'none', 'important'); }
    document.body.classList.remove('onboarding-open');
    await window.SutraFeatureRegistry.enable('assistant', { test: true });
    window.flowAssistant.init();
    window.setWorkspacePreference('assistant.enabled', true);
    window.SutraAssistantPermissions.setMode('off');
    window.setActiveView('assistantview');
  });
}

async function send(page, text, expected) {
  await page.locator('#asstInput').fill(text);
  await page.locator('#asstSendBtn').click();
  await expect(page.locator('#asstMessages .asst-msg.assistant').last()).toContainText(expected);
}

test('local study interview opens a draft, preserves skipped values, and saves only through Settings', async ({ page }) => {
  const remote = [];
  page.on('request', request => { if (/api\.openai\.com|generativelanguage\.googleapis\.com|api\.groq\.com/.test(request.url())) remote.push(request.url()); });
  await openLocalAssistant(page);
  await send(page, 'Get to know me', 'What time does school');
  await send(page, '7:30', 'AM or PM');
  await page.reload(); await waitForAppReady(page);
  const restoredSetupTurns = await page.evaluate(() => window.SutraAssistantConversationController.getCurrent()
    .messages.filter(message => message.role === 'user').map(message => message.content));
  expect(restoredSetupTurns).toEqual(expect.arrayContaining(['Get to know me', '7:30']));
  await page.evaluate(() => window.setActiveView('assistantview'));
  await send(page, 'AM', 'usually finish');
  await page.reload(); await waitForAppReady(page);
  await page.evaluate(() => window.setActiveView('assistantview'));
  await send(page, '2:15 PM', 'earliest time');
  await send(page, 'not sure', 'finish studying');
  await send(page, 'not sure', 'comfortably focus');
  await send(page, '45 minutes', 'each break');
  await send(page, '10 minutes', 'for the night');
  await send(page, '10:30 PM', 'on weekends');
  await send(page, 'usually not on weekends', 'review best');
  await send(page, 'practice questions', 'extra study time');
  await send(page, 'Physics', 'Here’s what I picked up');
  await expect.poll(() => page.evaluate(() => window.flowAtelier.getStudentPreferences().schoolStartHour)).toBe(8);
  const review = page.getByRole('button', { name: 'Review in Settings', exact: true });
  await expect(review).toBeEnabled();
  await review.click();
  await expect(page.locator('[data-pref-path="studentPreferences.schoolStartHour"]')).toHaveValue('07:30');
  await expect(page.locator('[data-pref-path="studentPreferences.schoolEndHour"]')).toHaveValue('14:15');
  await expect(page.locator('[data-pref-path="studentPreferences.bedtimeHour"]')).toHaveValue('22:30');
  await expect(page.locator('[data-pref-path="studentPreferences.studyBlockMinutes"]')).toHaveValue('45');
  await expect(page.getByRole('button', { name: 'Save Changes', exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.flowAtelier.getStudentPreferences().schoolStartHour)).toBe(8);
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.flowAtelier.getStudentPreferences().schoolStartHour)).toBe(7.5);
  await page.reload(); await waitForAppReady(page);
  await expect.poll(() => page.evaluate(() => window.flowAtelier.getStudentPreferences().schoolStartHour)).toBe(7.5);
  const portable = await page.evaluate(() => {
    const payload = window.serializeWorkspace();
    const before = payload.settings.preferences.studentPreferences;
    window.deserializeWorkspace(JSON.parse(JSON.stringify(payload)));
    const after = window.serializeWorkspace().settings.preferences.studentPreferences;
    return { before, after };
  });
  expect(portable.after).toEqual(portable.before);
  expect(portable.after.schoolStartHour).toBe(7.5);
  expect(portable.after.schoolEndHour).toBe(14.25);
  expect(portable.after.bedtimeHour).toBe(22.5);
  expect(remote).toEqual([]);
});

test('a restored setup continues locally in the dock and stays with its conversation', async ({ page }) => {
  await openLocalAssistant(page);
  await send(page, 'Get to know me', 'usually start');
  await send(page, '7:30 AM', 'usually finish');
  const chatId = await page.evaluate(() => window.SutraAssistantConversationController.getCurrent().id);
  await page.reload(); await waitForAppReady(page);
  await page.locator('#chatbotBtn').click();
  await page.locator('#chatInput').fill('2:15 PM');
  await page.locator('#chatSendBtn').click();
  await expect(page.locator('#chatbotMessages .chatbot-msg.assistant').last()).toContainText('earliest time');
  await expect(page.locator('#chatbotMessages')).not.toContainText('No AI provider is connected');
  const current = await page.evaluate(() => window.SutraAssistantConversationController.getCurrent());
  expect(current.id).toBe(chatId);
  expect(current.messages.filter(row => row.role === 'user' && row.content === '7:30 AM')).toHaveLength(1);
  expect(current.messages.filter(row => row.role === 'user' && row.content === '2:15 PM')).toHaveLength(1);
});

test('reviewed local memory works without workspace access or provider and Details supports keyboard dismissal', async ({ page }) => {
  await openLocalAssistant(page);
  await send(page, 'Remember that my preferred study notebook is blue.', 'Review it before saving');
  const reply = page.locator('#asstMessages .asst-msg.assistant').last();
  await expect(reply.getByRole('button', { name: 'Save to memory', exact: true })).toBeEnabled();
  await expect(reply).not.toContainText('Currently blocked');
  await reply.getByRole('button', { name: 'Save to memory', exact: true }).click();
  await expect(reply.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  const card = await openResponseDetails(reply, 'Privacy');
  await expect(card).toContainText('No');
  await card.getByRole('tab', { name: 'Privacy', exact: true }).press('ArrowRight');
  await expect(card.getByRole('tab', { name: 'Usage', exact: true })).toBeFocused();
  await card.getByRole('tab', { name: 'Usage', exact: true }).press('Escape');
  await expect(reply.getByRole('button', { name: 'Response details', exact: true })).toBeFocused();
  await expect(card).not.toBeVisible();
  await reply.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(reply).toContainText('Undone');
  expect(await page.evaluate(() => window.SutraAssistantPermissions.get().mode)).toBe('off');
});
