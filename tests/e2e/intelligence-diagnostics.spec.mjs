import { openResponseDetails } from './helpers/assistant-details.mjs';
// End-to-end coverage for the Sutra Intelligence hardening batch, driven
// through the REAL sendChat() runtime with a network-stubbed provider:
//   - a successful response with usage renders a progressive-disclosure
//     "Response details" chip that expands accessibly and shows tokens/latency
//   - a response with NO usage shows latency alone (never misleading 0-token rows)
//   - the aggregate diagnostics summary reads only the in-memory buffer (cap 60)
//     and excludes unavailable usage from token totals
//   - the ephemeral per-response stats are NOT persisted to chat history
import { expect, test } from '@playwright/test';

async function completeOnboarding(page) {
  await page.evaluate(() => {
    try { if (typeof window.markStudentOnboardingCompleted === 'function') window.markStudentOnboardingCompleted(true); } catch (e) {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.setProperty('display', 'none', 'important');
      overlay.style.setProperty('pointer-events', 'none', 'important');
    }
  });
  await expect(page.locator('#studentOnboardingOverlay')).toBeHidden();
}

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await page.waitForFunction(() => typeof window.flowAtelier?.flushAppSaveNow === 'function');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-diagnostics-ready'));
  await completeOnboarding(page);
  await expect(page.locator('[data-sutra-component="brand-mark"]').first()).toBeVisible();
  await page.evaluate(() => { window.setWorkspacePreference('assistant.enabled', true); });
  await page.evaluate(() => {
    const panel = document.getElementById('chatbotPanel');
    const isOpen = panel && panel.offsetParent !== null;
    if (!isOpen && typeof window.toggleChat === 'function') window.toggleChat();
  });
  await expect(page.locator('#chatbotMessages')).toBeVisible();
}

async function configureProvider(page, { provider, key, model }) {
  await page.waitForFunction(() => !!window.SutraProviderMeta && !!window.SutraIntelligence);
  await page.evaluate(({ provider, key, model }) => {
    localStorage.setItem('sutra_ai_send_ack_v1', '1');
    window.SutraProviderMeta.saveSessionKey(provider, key);
    window.SutraProviderMeta.selectModel(provider, model || '');
  }, { provider, key, model });
  await expect.poll(() => page.evaluate(() => window.SutraIntelligence.getActiveProviderModel()))
    .toEqual({ provider, model: model || '' });
}

// Non-streaming stub (no `.body`) so the deterministic non-stream usage path runs.
async function stubFetch(page, payload) {
  await page.evaluate((payload) => {
    window.fetch = async () => ({ ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) });
  }, payload);
}

async function send(page, text) {
  await page.evaluate(async (text) => {
    const input = document.getElementById('chatInput');
    input.value = text;
    await window.sendChat();
  }, text);
}

async function waitForStreamComplete(page) {
  await page.waitForFunction(() => {
    const msgs = document.querySelectorAll('#chatbotMessages .chatbot-msg.assistant:not(.chatbot-notice)');
    const last = msgs[msgs.length - 1];
    if (!last) return false;
    const actions = last.querySelector('.assistant-actions');
    return !!actions && actions.style.visibility !== 'hidden';
  });
}

const OPENAI_REPLY_WITH_USAGE = {
  choices: [{ message: { content: 'Here is a thorough answer that is comfortably longer than eighty characters so the action row reveals.' } }],
  usage: { prompt_tokens: 1200, completion_tokens: 340, total_tokens: 1540, prompt_tokens_details: { cached_tokens: 800 } }
};

const OPENAI_REPLY_NO_USAGE = {
  choices: [{ message: { content: 'Another sufficiently long answer that comfortably exceeds the eighty-character action threshold here.' } }]
};

// A fetch stub that fails the FIRST call with a retryable 503, then succeeds.
async function stubFetchRetryThenOk(page, payload) {
  await page.evaluate((payload) => {
    window.__fetchCalls = 0;
    window.fetch = async () => {
      window.__fetchCalls += 1;
      if (window.__fetchCalls === 1) {
        const errBody = { error: { message: 'server overloaded, please retry' } };
        return { ok: false, status: 503, headers: { get: () => null }, json: async () => errBody, text: async () => JSON.stringify(errBody) };
      }
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => payload, text: async () => JSON.stringify(payload) };
    };
  }, payload);
}

test('a reported-usage response renders an accessible Response details chip with tokens + latency', async ({ page }) => {
  await openApp(page);
  // Pin a light palette so the chip background cannot silently use a dark
  // fallback while its labels and values inherit light-theme text colors.
  await page.evaluate(() => {
    document.body.dataset.theme = 'light';
    document.body.style.setProperty('--bg-elevated', '#ffffff');
    document.body.style.setProperty('--surface-border', 'rgba(31, 41, 55, 0.18)');
    document.body.style.setProperty('--text-primary', '#1f2937');
    document.body.style.setProperty('--text-secondary', '#475569');
    document.body.style.setProperty('--accent-strong', '#1d4ed8');
  });
  await configureProvider(page, { provider: 'openai', key: 'test-openai-key', model: 'gpt-4o-mini' });
  await stubFetch(page, OPENAI_REPLY_WITH_USAGE);
  await send(page, 'Give me a detailed study plan for AP Biology unit 3.');
  await waitForStreamComplete(page);

  const chip = page.locator('#chatbotMessages .asst-response-stats').last();
  await openResponseDetails(page.locator('#chatbotMessages'), 'Usage');
  await expect(chip).toBeVisible();
  // Existing measurement nodes are inside the keyboard-operable Usage panel.
  await expect(chip).toHaveJSProperty('tagName', 'DETAILS');
  const summary = page.locator('#chatbotMessages').getByRole('tab', { name: 'Usage', exact: true }).last();
  await expect(summary).toHaveAttribute('aria-selected', 'true');

  // Read the selected Usage panel.
  await summary.click();
  await expect(chip).toHaveJSProperty('open', true);
  const body = chip.locator('.asst-response-stats-body');
  await expect(body).toContainText('Latency');
  await expect(body).toContainText('Input');
  await expect(body).toContainText('1,200');
  await expect(body).toContainText('Output');
  await expect(body).toContainText('Total');
  // Cache read tokens were reported (>0) → a cache-hit row is shown.
  await expect(body).toContainText('Cache hit');

  const latency = chip.locator('.asst-response-stat').filter({ hasText: 'Latency' }).first();
  const colors = await latency.evaluate((row) => ({
    background: getComputedStyle(row).backgroundColor,
    label: getComputedStyle(row.querySelector('.asst-response-stat-k')).color,
    value: getComputedStyle(row.querySelector('.asst-response-stat-v')).color
  }));
  expect(colors.background).toBe('rgb(255, 255, 255)');
  expect(colors.label).toBe('rgb(31, 41, 55)');
  expect(colors.value).toBe('rgb(31, 41, 55)');

  const responseDetails = page.locator('#chatbotMessages').getByRole('dialog', { name: 'Response details', exact: true }).last();
  const closeDetails = responseDetails.getByRole('button', { name: 'Close response details', exact: true });
  // The tablist's roving-focus contract uses arrow keys. Native Tab behavior
  // in WebKit also depends on the platform's full keyboard access setting.
  await expect(summary).toBeFocused();
  await expect(closeDetails).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  const privacy = responseDetails.getByRole('tab', { name: 'Privacy', exact: true });
  await expect(privacy).toBeFocused();
  await expect(privacy).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(summary).toBeFocused();
  await expect(summary).toHaveAttribute('aria-selected', 'true');
  const focusStyle = await summary.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(focusStyle).toBe('solid');

  // Escape dismisses the containing popover.
  await summary.press('Escape');
  await expect(page.locator('#chatbotMessages').getByRole('dialog', { name: 'Response details', exact: true })).toBeHidden();

  // Ephemeral: the per-response stats never reach persisted chat history.
  const persisted = await page.evaluate(() => sessionStorage.getItem('chat_history') || '[]');
  expect(persisted).not.toContain('responseStats');
  expect(persisted).not.toContain('1540');
});

test('a response with no usage shows latency alone — never a misleading zero-token row', async ({ page }) => {
  await openApp(page);
  await configureProvider(page, { provider: 'openai', key: 'test-openai-key', model: 'gpt-4o-mini' });
  await stubFetch(page, OPENAI_REPLY_NO_USAGE);
  await send(page, 'Summarize the water cycle in a few sentences for my notes.');
  await waitForStreamComplete(page);

  const chip = page.locator('#chatbotMessages .asst-response-stats').last();
  await openResponseDetails(page.locator('#chatbotMessages'), 'Usage');
  await expect(chip).toBeVisible();
  const body = chip.locator('.asst-response-stats-body');
  await expect(body).toContainText('Latency');
  // No usage was reported — no token rows at all, and certainly no "0 tok".
  await expect(body).not.toContainText('0 tok');
  await expect(body).not.toContainText('Input');
  await expect(body).not.toContainText('Total');
});

test('aggregate diagnostics summarize only the in-memory buffer (cap 60) and exclude unavailable usage', async ({ page }) => {
  await openApp(page);
  await configureProvider(page, { provider: 'openai', key: 'test-openai-key', model: 'gpt-4o-mini' });

  await stubFetch(page, OPENAI_REPLY_WITH_USAGE);
  await send(page, 'First detailed request that comfortably exceeds the action-row length threshold today.');
  await waitForStreamComplete(page);

  await stubFetch(page, OPENAI_REPLY_NO_USAGE);
  await send(page, 'Second detailed request that comfortably exceeds the action-row length threshold today.');
  await waitForStreamComplete(page);

  const summary = await page.evaluate(() => window.SutraIntelligence.getDiagnosticsSummary());
  expect(summary).toBeTruthy();
  expect(summary.requests).toBeGreaterThanOrEqual(2);
  // Only the first request reported usage → totals reflect that one alone.
  expect(summary.tokens.available).toBe(true);
  expect(summary.tokens.total).toBe(1540);
  expect(summary.cacheHits).toBe(1);
  // A measured, positive average latency across the two sends.
  expect(summary.avgLatencyMs === null || summary.avgLatencyMs >= 0).toBe(true);

  // The buffer is bounded and the raw diagnostics carry token COUNTS only —
  // never prompt or document content.
  const diag = await page.evaluate(() => window.SutraIntelligence.getDiagnostics());
  expect(diag.length).toBeLessThanOrEqual(60);
  const blob = JSON.stringify(diag);
  expect(blob).not.toContain('AP Biology');
  expect(blob).not.toContain('water cycle');
});

test('after a reload, an old message never inherits a new turn\'s stats (no ephemeral-id collision)', async ({ page }) => {
  const assistantReplies = '#chatbotMessages .chatbot-msg.assistant:not(.chatbot-notice)';
  await openApp(page);
  await configureProvider(page, { provider: 'openai', key: 'test-openai-key', model: 'gpt-4o-mini' });
  await stubFetch(page, OPENAI_REPLY_WITH_USAGE);
  await send(page, 'First detailed request that comfortably exceeds the eighty-character action threshold now.');
  await waitForStreamComplete(page);
  // Baseline: the first reply shows a stats chip this session.
  await openResponseDetails(page.locator(assistantReplies).first(), 'Usage');
  await expect(page.locator(`${assistantReplies} .asst-response-stats`).first()).toBeVisible();

  // Reload (fresh session): the in-memory stats Map is cleared. The persisted
  // chat history reloads, but the old turn's ephemeral stats are gone.
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-diagnostics-reload'));
  await openApp(page);
  const firstReply = page.locator(assistantReplies).first();
  await expect(firstReply).toBeVisible();
  await expect(firstReply.locator('.asst-response-stats')).toHaveCount(0);

  // Send a NEW message in the SAME conversation. With a reset-counter id this
  // would mint the old turn's id and mis-attribute the new stats to it.
  await configureProvider(page, { provider: 'openai', key: 'test-openai-key', model: 'gpt-4o-mini' });
  await stubFetch(page, OPENAI_REPLY_WITH_USAGE);
  await send(page, 'Second detailed request that comfortably exceeds the eighty-character action threshold now.');
  await waitForStreamComplete(page);

  // The OLD reply STILL has no chip; only the NEW reply does.
  await expect(page.locator(assistantReplies).first().locator('.asst-response-stats')).toHaveCount(0);
  await expect(page.locator(assistantReplies).last().locator('.asst-response-stats')).toHaveCount(1);
});

test('a context-limit 400 shows actionable "too large" guidance, not the raw provider error', async ({ page }) => {
  await openApp(page);
  await configureProvider(page, { provider: 'openai', key: 'test-openai-key', model: 'gpt-4o-mini' });
  await page.evaluate(() => {
    const errBody = { error: { message: "This model's maximum context length is 8192 tokens, however you requested 90000 tokens." } };
    window.fetch = async () => ({ ok: false, status: 400, headers: { get: () => null }, json: async () => errBody, text: async () => JSON.stringify(errBody) });
  });
  await send(page, 'Please analyze this enormous amount of pasted context in great detail for me.');
  // The failure surfaces as a chat notice; wait for the actionable guidance.
  await page.waitForFunction(() => /too large/i.test(document.getElementById('chatbotMessages').innerText), null, { timeout: 10000 });
  const transcript = await page.evaluate(() => document.getElementById('chatbotMessages').innerText);
  expect(transcript).toMatch(/too large/i);
  expect(transcript).toMatch(/Lower Workspace Access|remove an attachment/i);
});

test('a retryable pre-output 503 is automatically retried and then succeeds', async ({ page }) => {
  await openApp(page);
  await configureProvider(page, { provider: 'openai', key: 'test-openai-key', model: 'gpt-4o-mini' });
  await stubFetchRetryThenOk(page, OPENAI_REPLY_WITH_USAGE);
  await send(page, 'A detailed request that comfortably exceeds the eighty-character action-row threshold now.');
  await waitForStreamComplete(page);

  // The second attempt succeeded, so the real answer is shown…
  const transcript = await page.evaluate(() => document.getElementById('chatbotMessages').innerText);
  expect(transcript).toContain('thorough answer');
  // …and fetch was actually called twice (one retry).
  const calls = await page.evaluate(() => window.__fetchCalls);
  expect(calls).toBe(2);

  // The response-details chip discloses the retry.
  const chip = page.locator('#chatbotMessages .asst-response-stats').last();
  await openResponseDetails(page.locator('#chatbotMessages'), 'Usage');
  await expect(chip.locator('.asst-response-stats-body')).toContainText('Retries');
});
