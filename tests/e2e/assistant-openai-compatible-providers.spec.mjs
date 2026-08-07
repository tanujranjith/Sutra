import { expect, test } from '@playwright/test';

async function openApp(page) {
  await page.addInitScript(() => { try { sessionStorage.setItem('sutra_intro_played', '1'); } catch (_) {} });
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await page.evaluate(() => {
    try { window.markStudentOnboardingCompleted?.(true); } catch (_) {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.setProperty('display', 'none', 'important');
    }
  });
  await expect(page.locator('[data-sutra-component="brand-mark"]').first()).toBeVisible();
}

async function openAssistant(page) {
  await page.waitForFunction(() => window.SutraProviderMeta && window.flowAssistant);
  await page.evaluate(() => {
    window.setWorkspacePreference('assistant.enabled', true);
    window.SutraFeatureRegistry?.enable('assistant', { test: true });
    window.flowAssistant?.init?.();
    localStorage.setItem('sutra_ai_send_ack_v1', '1');
    const panel = document.getElementById('chatbotPanel');
    if (!panel || panel.offsetParent === null) window.toggleChat();
  });
  await expect(page.locator('#chatbotMessages')).toBeVisible();
}

test('NVIDIA, Mistral, and Together providers discover models with session-only keys', async ({ page }) => {
  const requests = [];
  const providers = [
    {
      id: 'nvidia', keyName: 'nvidia_api_key', key: 'nvapi-test-provider-secret-123456',
      endpoint: 'https://integrate.api.nvidia.com/v1/models', model: 'nvidia/test-model', arrayBody: false
    },
    {
      id: 'mistral', keyName: 'mistral_api_key', key: 'mistral-test-provider-secret-123456',
      endpoint: 'https://api.mistral.ai/v1/models', model: 'mistral-test-model', arrayBody: true
    },
    {
      id: 'together', keyName: 'together_api_key', key: 'together-test-provider-secret-123456',
      endpoint: 'https://api.together.xyz/v1/models', model: 'org/test-model', arrayBody: false
    }
  ];

  for (const provider of providers) {
    await page.route(provider.endpoint, async route => {
      requests.push({ id: provider.id, authorization: route.request().headers().authorization || '' });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(provider.arrayBody ? [{ id: provider.model }] : { data: [{ id: provider.model }] })
      });
    });
  }

  await openApp(page);

  const result = await page.evaluate(async providerFixtures => {
    const meta = window.SutraProviderMeta;
    const registered = meta.list().map(provider => provider.id);
    const discovered = {};
    for (const fixture of providerFixtures) {
      meta.saveSessionKey(fixture.id, fixture.key);
      discovered[fixture.id] = await meta.discoverModels(fixture.id);
    }
    const serialized = JSON.stringify(window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false }));
    return {
      registered,
      discovered,
      sessionValues: Object.fromEntries(providerFixtures.map(fixture => [fixture.id, sessionStorage.getItem(fixture.keyName)])),
      localValues: Object.fromEntries(providerFixtures.map(fixture => [fixture.id, localStorage.getItem(fixture.keyName)])),
      exportLeaksSecret: providerFixtures.some(fixture => serialized.includes(fixture.key))
    };
  }, providers);

  expect(result.registered).toEqual(expect.arrayContaining(['nvidia', 'mistral', 'together']));
  expect(result.discovered).toEqual({
    nvidia: ['nvidia/test-model'],
    mistral: ['mistral-test-model'],
    together: ['org/test-model']
  });
  expect(result.sessionValues).toEqual(Object.fromEntries(providers.map(provider => [provider.id, provider.key])));
  expect(result.localValues).toEqual({ nvidia: null, mistral: null, together: null });
  expect(result.exportLeaksSecret).toBe(false);
  expect(requests).toEqual(providers.map(provider => ({ id: provider.id, authorization: `Bearer ${provider.key}` })));

  await expect(page.locator('#chatProviderSelect option[value="nvidia"]')).toHaveCount(1);
  await expect(page.locator('#chatProviderSelect option[value="mistral"]')).toHaveCount(1);
  await expect(page.locator('#chatProviderSelect option[value="together"]')).toHaveCount(1);
  for (const provider of providers) {
    await expect(page.locator(`#${provider.id}ApiKeyInput`)).toHaveAttribute('type', 'password');
  }
});

test('NVIDIA, Mistral, and Together chat requests use their audited OpenAI-compatible endpoints', async ({ page }) => {
  const providers = [
    { id: 'nvidia', key: 'nvapi-chat-test-123456789', endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions', model: 'nvidia/chat-test' },
    { id: 'mistral', key: 'mistral-chat-test-123456789', endpoint: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-chat-test' },
    { id: 'together', key: 'together-chat-test-123456789', endpoint: 'https://api.together.xyz/v1/chat/completions', model: 'org/chat-test' }
  ];
  const requests = [];

  for (const provider of providers) {
    await page.route(provider.endpoint, async route => {
      const request = route.request();
      requests.push({
        id: provider.id,
        authorization: request.headers().authorization || '',
        body: request.postDataJSON()
      });
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: {"choices":[{"delta":{"content":"${provider.id} endpoint verified"}}]}\n\ndata: [DONE]\n\n`
      });
    });
  }

  await openApp(page);
  await openAssistant(page);

  for (const provider of providers) {
    await page.evaluate(async fixture => {
      window.SutraProviderMeta.saveSessionKey(fixture.id, fixture.key);
      window.SutraProviderMeta.selectModel(fixture.id, fixture.model);
      const input = document.getElementById('chatInput');
      input.value = `Return the provider handshake for ${fixture.id}.`;
      await window.sendChat();
    }, provider);
    await expect(page.locator('.chatbot-msg.assistant').last()).toContainText(`${provider.id} endpoint verified`);
  }

  expect(requests).toHaveLength(3);
  for (const provider of providers) {
    const request = requests.find(entry => entry.id === provider.id);
    expect(request.authorization).toBe(`Bearer ${provider.key}`);
    expect(request.body.model).toBe(provider.model);
    expect(request.body.stream).toBe(true);
    for (const other of providers) expect(JSON.stringify(request.body)).not.toContain(other.key);
  }
});
