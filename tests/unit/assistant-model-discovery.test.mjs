import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const discoverySource = extractFunction(source, 'normalizeModelIdFromGeminiName').body
  + '\n' + extractFunction(source, 'fetchProviderModels').body;
function discover(config, fetch, preferences = () => ({})) {
  return new Function('CHAT_PROVIDER_CONFIG', 'fetch', 'getWorkspacePreference', 'window', discoverySource + ';return fetchProviderModels;')(
    config, fetch, preferences, { location: { origin: 'https://sutra.test' } });
}
const ok = payload => ({ ok: true, json: async () => payload });

test('Gemini discovery follows every page, filters generation capability, and includes newly released IDs', async () => {
  const requests = [];
  const run = discover({ gemini: { modelsEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models' } }, async (url, init) => {
    requests.push({ url, headers: init.headers });
    return new URL(url).searchParams.has('pageToken')
      ? ok({ models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] })
      : ok({ models: [{ name: 'models/gemma-example', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding-example', supportedGenerationMethods: ['embedContent'] }], nextPageToken: 'second' });
  });
  assert.deepEqual(await run('gemini', 'fake-key'), ['gemma-example', 'gemini-3.8-flash']);
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[1].url).searchParams.get('pageToken'), 'second');
  assert.equal(requests[0].headers['x-goog-api-key'], 'fake-key');
  assert.ok(!requests[0].url.includes('fake-key'));
});

test('Anthropic discovery follows cursors and enables its browser API', async () => {
  const requests = [];
  const run = discover({ anthropic: { modelsEndpoint: 'https://api.anthropic.com/v1/models' } }, async (url, init) => {
    requests.push({ url, headers: init.headers });
    return new URL(url).searchParams.has('after_id')
      ? ok({ data: [{ id: 'claude-new' }], has_more: false })
      : ok({ data: [{ id: 'claude-existing' }], has_more: true, last_id: 'claude-existing' });
  });
  assert.deepEqual(await run('anthropic', 'fake-key'), ['claude-existing', 'claude-new']);
  assert.equal(requests[0].headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(new URL(requests[1].url).searchParams.get('after_id'), 'claude-existing');
});

test('model pagination fails visibly instead of caching an incomplete catalog', async () => {
  const run = discover({ gemini: { modelsEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models' } }, async () => ok({ models: [], nextPageToken: 'same' }));
  await assert.rejects(run('gemini', 'fake'), /pagination did not advance/);
});

test('provider model IDs are not filtered by an outdated family allowlist', async () => {
  const run = discover({ openai: { modelsEndpoint: 'https://api.openai.com/v1/models' } }, async () => ok({ data: [{ id: 'new-family-model' }, { id: 'gpt-6-luna' }] }));
  assert.deepEqual(await run('openai', 'fake'), ['new-family-model', 'gpt-6-luna']);
});

test('a live catalog replaces seed IDs rather than retaining removed models', () => {
  let cached = null;
  const read = new Function('CHAT_PROVIDER_CONFIG', 'localStorage', extractFunction(source, 'getCachedModels').body + ';return getCachedModels;')(
    { deepseek: { models: ['old-seed'] } }, { getItem: () => cached });
  assert.deepEqual(read('deepseek'), ['old-seed']);
  cached = JSON.stringify(['new-live-model']);
  assert.deepEqual(read('deepseek'), ['new-live-model']);
  cached = '[]';
  assert.deepEqual(read('deepseek'), []);
});

test('local discovery is explicit and supports keyless endpoints', async () => {
  let request;
  const run = discover({ local: {} }, async (url, init) => { request = { url, headers: init.headers }; return ok({ data: [{ id: 'local-model' }] }); }, () => ({ baseUrl: 'http://127.0.0.1:11434/v1/' }));
  assert.deepEqual(await run('local', ''), ['local-model']);
  assert.equal(request.url, 'http://127.0.0.1:11434/v1/models');
  assert.deepEqual(request.headers, {});
});

test('choosing a model replaces only that provider custom override and ignores stale hidden controls', () => {
  let selected = { gemini: 'old-model', openai: 'gpt-6-luna' };
  const custom = { gemini: 'gemma-example', openai: 'gpt-6-luna' };
  const panelCustom = { value: 'gemma-example' }, panelSelect = { value: 'old-model' };
  const setModel = new Function('getModelMap', 'setCustomModelForProvider', 'getCurrentChatProvider', 'chatCustomModelInput', 'chatModelSelect', 'window', 'CHAT_MODEL_MAP_KEY',
    extractFunction(source, 'setModelForProvider').body + ';return setModelForProvider;')(
    () => ({ ...selected }), (provider, value) => { if (value) custom[provider] = value; else delete custom[provider]; },
    () => 'gemini', panelCustom, panelSelect, { SutraSafeStorage: { set: (key, value) => { selected = JSON.parse(value); } } }, 'map');
  setModel('gemini', 'gemini-3.8-flash');
  assert.equal(selected.gemini, 'gemini-3.8-flash');
  assert.equal(custom.gemini, undefined);
  assert.equal(custom.openai, 'gpt-6-luna');
  assert.equal(panelCustom.value, '');
  const active = new Function('getSelectedModelForProvider', extractFunction(source, 'getActiveModelForProvider').body + ';return getActiveModelForProvider;')(
    provider => custom[provider] || selected[provider] || '');
  assert.equal(active('openai'), 'gpt-6-luna');
  assert.equal(active('gemini'), 'gemini-3.8-flash');
});
