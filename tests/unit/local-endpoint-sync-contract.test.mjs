import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
import { extractFunction } from '../helpers/extract-function.mjs';

const require = createRequire(import.meta.url);
const projectionApi = require('../../src/sync/sync-projection.js');
const protocol = require('../../src/sync/sync-protocol.js');
const appSource = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const inventory = JSON.parse(readFileSync(new URL('../../docs/architecture/persistence-inventory.json', import.meta.url), 'utf8'));

function sampleWorkspace() {
  return {
    version: 5,
    pages: [],
    tasks: [],
    taskOrder: [],
    timeBlocks: [],
    customTabs: [],
    trash: [],
    spaces: [],
    settings: {
      theme: 'dark',
      dataHealth: { lastSaveAttemptAt: '2026-07-15T09:00:00.000Z' },
      preferences: {
        assistant: {
          chatMemoryDepth: 10,
          localEndpoint: { enabled: true, baseUrl: 'http://192.168.1.23:11434/v1', model: 'mistral', visionCapable: false }
        },
        sync: { enabled: true, endpoint: 'https://example.supabase.co' }
      }
    },
    globalTheme: { name: 'glass' }
  };
}

function assertDeepStringifyLeft(value, needle, message) {
  assert.ok(!protocol.stableStringify(value).includes(needle), message);
}

test('local endpoint configuration is stripped from the sync projection while chat memory depth travels', () => {
  const { records } = projectionApi.buildProjection(sampleWorkspace());
  const assistant = records['a/settings'].preferences.assistant;
  assert.equal(assistant.localEndpoint, undefined, 'assistant.localEndpoint must not project');
  assert.equal(assistant.chatMemoryDepth, 10, 'chat memory depth stays synchronized');
  assertDeepStringifyLeft(records['a/settings'], '192.168.1.23', 'one device\'s local endpoint address leaked into the projection');
  assertDeepStringifyLeft(records['a/settings'], 'mistral', 'local model name leaked into the projection');
  const stripped = protocol.CLASSIFICATION.strippedSettingsPreferenceSubpaths || [];
  assert.ok(stripped.includes('assistant.localEndpoint'), 'classification lists the local endpoint subpath');
});

test('apply re-injects the receiving device\'s local endpoint, creating the section when absent', () => {
  const remote = projectionApi.buildProjection(sampleWorkspace());
  const target = { settings: { preferences: { assistant: { chatMemoryDepth: 5 } } } };
  const applied = projectionApi.applyProjectionToWorkspace(target, remote);
  const assistant = applied.settings.preferences.assistant;
  assert.equal(assistant.chatMemoryDepth, 10, 'synced chat depth applies from the remote');
  assert.equal(assistant.localEndpoint, undefined, 'a device that never configured a local endpoint must not gain one');
});

test('apply never clobbers the receiving device\'s local endpoint with a stripped value', () => {
  const remote = projectionApi.buildProjection(sampleWorkspace());
  const target = sampleWorkspace();
  target.settings.preferences.assistant.localEndpoint = {
    enabled: true, baseUrl: 'http://10.0.0.7:8080/v1', model: 'qwen', visionCapable: true
  };
  const applied = projectionApi.applyProjectionToWorkspace(target, remote);
  assert.deepEqual(
    applied.settings.preferences.assistant.localEndpoint,
    { enabled: true, baseUrl: 'http://10.0.0.7:8080/v1', model: 'qwen', visionCapable: true },
    'device-local endpoint must survive a remote apply'
  );
  assert.equal(applied.settings.preferences.assistant.chatMemoryDepth, 10, 'synced sibling still applies');
});

test('local endpoint base URL is validated and normalized on write', () => {
  const extract = extractFunction(appSource, 'sanitizeLocalEndpointBaseUrl');
  assert.ok(extract, 'sanitizeLocalEndpointBaseUrl is a top-level declaration');
  const sanitize = new Function(`return (${extract.body});`)();
  assert.equal(sanitize('localhost:11434/v1'), 'http://localhost:11434/v1/', 'bare host gains http scheme and trailing slash');
  assert.equal(sanitize('  https://ollama.example  '), 'https://ollama.example/', 'whitespace trimmed, trailing slash normalized');
  assert.equal(sanitize('https://ollama.example/v1/'), 'https://ollama.example/v1/', 'already normalized stays');
  assert.equal(sanitize('https://user:pass@ollama.example/v1'), 'https://user:pass@ollama.example/v1', 'credentials are rejected verbatim, never normalized into the stored value');
  assert.equal(sanitize('ftp://ollama.example/v1'), 'ftp://ollama.example/v1', 'non-http protocols are rejected verbatim');
  assert.equal(sanitize(''), '', 'empty input stays empty');
  assert.equal(sanitize(42), 42, 'non-string values pass through untouched');
});

test('setWorkspacePreference routes base URL writes through the sanitizer', () => {
  const setter = extractFunction(appSource, 'setWorkspacePreference');
  assert.ok(setter, 'setWorkspacePreference is a top-level declaration');
  assert.ok(setter.body.includes("'assistant.localEndpoint.baseUrl'"), 'sanitizer hook targets the local endpoint path');
  assert.ok(setter.body.includes('sanitizeLocalEndpointBaseUrl(value)'), 'base URL writes are routed through the sanitizer before assignment');
});
