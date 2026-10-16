import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

test.use({ serviceWorkers: 'block' });

const MODEL = 'gpt-5-mini';
const API_KEY = 'theme-chat-mock-key-123456789';
const NOTE_SENTINEL = 'PRIVATE_THEME_NOTE_SENTINEL_71C4';
const ATTACHMENT_SENTINEL = 'PRIVATE_THEME_ATTACHMENT_SENTINEL_22A9';

const THEME_OK = {
  name: 'Kyoto Paper',
  description: 'Warm paper tones with soft ink contrast.',
  colors: {
    bgPrimary: '#f3ece0',
    bgSecondary: '#e8ddc9',
    textPrimary: '#2c2620',
    accent: '#9c6b4a',
    sidebar: '#ece2d0',
    button: '#e0d3bd'
  }
};

const THEME_REFINED = {
  name: 'Kyoto Paper Soft',
  description: 'The same paper palette with a softer accent.',
  colors: {
    bgPrimary: '#f5efe4',
    bgSecondary: '#ece2d0',
    textPrimary: '#2c2620',
    accent: '#8c5f42',
    sidebar: '#f1e8d8',
    button: '#e3d7c1'
  }
};

async function openApp(page) {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sutra_intro_played', '1'); } catch {}
  });
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await waitForAppReady(page);
  await page.evaluate(() => {
    try { window.markStudentOnboardingCompleted?.(true); } catch {}
    document.body.classList.remove('onboarding-open');
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) { overlay.classList.remove('active'); overlay.hidden = true; overlay.style.setProperty('display', 'none', 'important'); }
    window.setWorkspacePreference('assistant.enabled', true);
    window.SutraFeatureRegistry?.enable('assistant', { test: true });
  });
  await page.waitForFunction(() => window.SutraThemeAI && window.SutraProviderMeta && window.SutraAssistantConversationController);
}

async function configureProvider(page) {
  await page.evaluate(({ model, apiKey }) => {
    localStorage.setItem('sutra_ai_send_ack_v1', '1');
    window.SutraProviderMeta.saveSessionKey('openai', apiKey);
    window.SutraProviderMeta.selectModel('openai', model);
    window.setActiveView('assistantview');
  }, { model: MODEL, apiKey: API_KEY });
  await expect(page.locator('#asstInput')).toBeVisible();
  await expect(page.locator('#asstModelLabel')).toContainText(MODEL);
  await expect(page.locator('#asstReasoningRow')).toBeVisible();
  await page.locator('#asstReasoningTrigger').click();
  await page.locator('#asstReasoningMenu').getByRole('menuitemradio', { name: 'Low', exact: true }).click();
  await expect(page.locator('#asstReasoningTrigger')).toHaveAccessibleName('Thinking effort: Low');
}

async function openThemeAssistant(page) {
  await page.evaluate(() => {
    const trigger = document.querySelector('.view-tab-theme');
    if (!trigger) throw new Error('Theme panel control is missing');
    trigger.click();
  });
  await expect(page.locator('#aiThemeGenerateCard')).toBeVisible();
  await page.locator('#aiThemeGenerateCard').click();
  await expect(page.locator('#view-assistantview')).toHaveClass(/active/);
  await expect(page.locator('#asstInput')).toHaveValue('/theme ');
  await expect(page.locator('#aiThemeModal')).not.toHaveClass(/active/);
}

function mockOpenAiThemes(page, replies) {
  const requests = [];
  page.route('https://api.openai.com/v1/chat/completions', async route => {
    requests.push(route.request().postDataJSON());
    const reply = replies.shift();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: typeof reply === 'string' ? reply : JSON.stringify(reply) } }] })
    });
  });
  return requests;
}

async function sendThemePrompt(page, text) {
  await page.locator('#asstInput').fill(text);
  await page.locator('#asstSendBtn').click();
}

test('Create your own theme uses the full Assistant provider chat, keeps preview reviewable, and saves the approved result', async ({ page }) => {
  const requests = mockOpenAiThemes(page, [THEME_OK, THEME_REFINED]);
  await openApp(page);
  await configureProvider(page);
  const privateFixture = await page.evaluate(async ({ noteSentinel, attachmentSentinel }) => {
    window.__sutraPublicBetaTestHooks.createNoteInActiveSpace('Private workspace note', `<p>${noteSentinel}</p>`);
    await window.flowAssistant.addAttachmentFromFile(
      new File([attachmentSentinel], 'private-theme-context.txt', { type: 'text/plain' })
    );
    return {
      noteIncluded: JSON.stringify(window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false })).includes(noteSentinel),
      attachmentCount: window.flowAssistant.getAttachments().length
    };
  }, { noteSentinel: NOTE_SENTINEL, attachmentSentinel: ATTACHMENT_SENTINEL });
  expect(privateFixture.noteIncluded).toBe(true);
  expect(privateFixture.attachmentCount).toBe(1);
  await openThemeAssistant(page);

  const emptyCount = await page.evaluate(() => window.SutraAssistantConversationController.getCurrent().messages.length);
  expect(emptyCount).toBe(0);
  expect(requests).toHaveLength(0); // The CTA prefills the chat and never sends it.

  await page.locator('#asstSendBtn').click();
  await expect(page.locator('#asstMessages .asst-notice').last()).toContainText('Add a short description after /theme');
  expect(requests).toHaveLength(0); // Empty /theme is rejected before provider traffic.
  expect(await page.evaluate(() => window.flowAssistant.getAttachments().length)).toBe(1);

  await sendThemePrompt(page, '/theme a calm paper palette for studying');
  const firstCard = page.locator('#asstMessages .ai-theme-chat-card').first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard.locator('.ai-theme-chat-title')).toHaveText(THEME_OK.name);
  await expect(page.locator('#asstSendBtn')).toHaveAccessibleName('Send message');
  await expect(page.locator('#asstSendBtn')).not.toHaveClass(/is-stop/);
  await expect(firstCard.getByRole('button', { name: 'Preview' })).toBeVisible();
  await expect(firstCard.getByRole('button', { name: 'Apply theme' })).toBeVisible();
  await expect(firstCard.getByRole('button', { name: 'Revert preview' })).toBeDisabled();

  const initialState = await page.evaluate(() => ({
    previewing: window.SutraThemeAI.isPreviewing(),
    theme: document.body.getAttribute('data-theme'),
    themeKey: document.body.getAttribute('data-theme-key'),
    customThemes: window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false }).settings.customThemes || []
  }));
  expect(initialState.previewing).toBe(false);
  expect(initialState.customThemes).toHaveLength(0);

  await firstCard.getByRole('button', { name: 'Preview' }).click();
  await expect(firstCard.locator('.ai-theme-chat-status')).toContainText('is previewing');
  await expect(firstCard.getByRole('button', { name: 'Revert preview' })).toBeEnabled();
  expect(await page.evaluate(() => window.SutraThemeAI.isPreviewing())).toBe(true);
  expect(await page.locator('body').getAttribute('data-theme-key')).toBe('custom');
  await firstCard.getByRole('button', { name: 'Revert preview' }).click();
  await expect(firstCard.locator('.ai-theme-chat-status')).toHaveText('The saved theme has been restored.');
  expect(await page.evaluate(() => ({
    previewing: window.SutraThemeAI.isPreviewing(),
    theme: document.body.getAttribute('data-theme'),
    themeKey: document.body.getAttribute('data-theme-key')
  }))).toEqual({ previewing: false, theme: initialState.theme, themeKey: initialState.themeKey });

  await sendThemePrompt(page, 'Make the accent warmer');
  const refinedCard = page.locator('#asstMessages .ai-theme-chat-card').last();
  await expect(refinedCard.locator('.ai-theme-chat-title')).toHaveText(THEME_REFINED.name);
  expect(requests).toHaveLength(2);

  const firstRequest = requests[0];
  expect(firstRequest.model).toBe(MODEL);
  expect(firstRequest.reasoning_effort).toBe('low');
  expect(firstRequest.messages.filter(message => message.role === 'system')).toHaveLength(1);
  expect(firstRequest.messages[0].content).toContain('Respond with ONLY one JSON object');
  expect(firstRequest.messages[0].content).toContain('"bgPrimary"');
  expect(firstRequest.messages[0].content).not.toContain('ACTIONS AVAILABLE FOR THIS REQUEST');
  expect(firstRequest.messages[0].content).not.toContain('workspace context');
  expect(firstRequest.messages).toHaveLength(2);
  expect(firstRequest.attachments).toBeUndefined();
  expect(firstRequest.messages.every(message => typeof message.content === 'string')).toBe(true);
  expect(firstRequest.messages[1].content).toContain('a calm paper palette for studying');
  expect(firstRequest.messages[1].content).not.toContain('/theme');
  expect(JSON.stringify(firstRequest)).not.toContain(NOTE_SENTINEL);
  expect(JSON.stringify(firstRequest)).not.toContain(ATTACHMENT_SENTINEL);
  expect(JSON.stringify(firstRequest)).not.toContain('private-theme-context.txt');
  expect(JSON.stringify(firstRequest)).not.toContain('PRIVATE_THEME');
  expect(await page.evaluate(() => window.flowAssistant.getAttachments().length)).toBe(1);

  const refinementRequest = requests[1];
  expect(refinementRequest.model).toBe(MODEL);
  expect(refinementRequest.reasoning_effort).toBe('low');
  expect(refinementRequest.messages.map(message => message.role)).toEqual(['system', 'user', 'assistant', 'user']);
  expect(JSON.stringify(refinementRequest.messages)).toContain(THEME_OK.name);
  expect(JSON.stringify(refinementRequest.messages)).toContain(THEME_OK.colors.accent);
  expect(JSON.stringify(refinementRequest.messages)).toContain('Make the accent warmer');
  expect(JSON.stringify(refinementRequest)).not.toContain(NOTE_SENTINEL);
  expect(JSON.stringify(refinementRequest)).not.toContain(ATTACHMENT_SENTINEL);
  expect(JSON.stringify(refinementRequest)).not.toContain('private-theme-context.txt');

  await refinedCard.getByRole('button', { name: 'Apply theme' }).click();
  await expect(refinedCard.locator('.ai-theme-chat-status')).toContainText('was applied and saved');
  const applied = await page.evaluate(() => ({
    previewing: window.SutraThemeAI.isPreviewing(),
    themeKey: document.body.getAttribute('data-theme-key'),
    customThemes: window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false }).settings.customThemes || []
  }));
  expect(applied.previewing).toBe(false);
  expect(applied.themeKey).toBe('custom');
  expect(applied.customThemes).toHaveLength(1);
  expect(applied.customThemes[0].name).toBe(THEME_REFINED.name);
  await page.evaluate(async () => {
    if (window.flowAtelier && typeof window.flowAtelier.flushAppSaveNow === 'function') {
      await window.flowAtelier.flushAppSaveNow('assistant-theme-chat-reload');
    }
  });

  await page.reload();
  await waitForAppReady(page);
  await page.waitForFunction(() => window.SutraFeatureRegistry && window.SutraAssistantConversationController && window.SutraThemeAI);
  await page.evaluate(() => {
    window.SutraFeatureRegistry.enable('assistant', { test: true });
    window.setWorkspacePreference('assistant.enabled', true);
    window.setActiveView('assistantview');
  });
  await expect(page.locator('#asstMessages .ai-theme-chat-card')).toHaveCount(2);
  await expect(page.locator('#asstMessages .ai-theme-chat-card').last().locator('.ai-theme-chat-title')).toHaveText(THEME_REFINED.name);
  expect(await page.evaluate(() => window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false }).settings.customThemes.map(theme => theme.name))).toContain(THEME_REFINED.name);
});

test('malformed theme chat replies show a safe failure and do not preview or apply', async ({ page }) => {
  const requests = mockOpenAiThemes(page, ['This is not a theme JSON response.']);
  await openApp(page);
  await configureProvider(page);
  await openThemeAssistant(page);
  const before = await page.evaluate(() => ({
    theme: document.body.getAttribute('data-theme'),
    themeKey: document.body.getAttribute('data-theme-key'),
    customThemes: window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false }).settings.customThemes || []
  }));

  await sendThemePrompt(page, '/theme a quiet night theme');
  const reply = page.locator('#asstMessages .asst-msg.assistant').last();
  await expect(reply).toContainText('Nothing changed. Ask Assistant to return the theme format');
  await expect(page.locator('#asstMessages .ai-theme-chat-card')).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect(await page.evaluate(() => ({
    previewing: window.SutraThemeAI.isPreviewing(),
    theme: document.body.getAttribute('data-theme'),
    themeKey: document.body.getAttribute('data-theme-key'),
    customThemes: window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false }).settings.customThemes || []
  }))).toEqual({ previewing: false, ...before });
});
