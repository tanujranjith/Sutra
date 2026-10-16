import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const fakeKeys = ['sk-proj-FAKEONLY_abcdef0123456789_suffix', 'sk-ant-api03-FAKEONLY_abcdefgh_suffix',
  'sk-or-v1-FAKEONLY_abcdefgh_suffix', 'nvapi-FAKEONLY_abcdefgh_suffix', 'gsk_FAKEONLY_abcdefgh_suffix'];
for (const hostname of ['localhost', 'sutra.example']) {
  test('diagnostics sanitize all output and isolate returned copies on ' + hostname, () => {
    const outputs = [], events = [];
    const window = { addEventListener() {}, dispatchEvent(event) { events.push(event.detail); }, showToast(value) { outputs.push(value); } };
    const context = vm.createContext({ window, location: { hostname, protocol: 'https:', href: '?key=FAKE_QUERY_SUFFIX' },
      navigator: { userAgent: 'test', language: 'en' }, CustomEvent: class { constructor(type, init) { this.detail = init.detail; } },
      console: Object.fromEntries(['error', 'warn', 'log', 'debug'].map(name => [name, (...args) => outputs.push(args)])) });
    vm.runInContext(source('src/core/error-reporter.js'), context);
    const api = window.SutraDiagnostics;
    const error = { name: fakeKeys[0], message: fakeKeys.join(' '), stack: 'Bearer FAKE_BEARER_SUFFIX' };
    const result = api.report(error, { where: fakeKeys[1], userMessage: fakeKeys[2], nested: [{ [fakeKeys[3]]: fakeKeys[4] }], apiKey: 'UNKNOWN_CREDENTIAL_SUFFIX' });
    const all = JSON.stringify([outputs, events, result, api.buildReport(), api.exportText()]);
    for (const suffix of ['FAKEONLY', 'abcdefgh_suffix', '0123456789_suffix', 'FAKE_BEARER_SUFFIX', 'FAKE_QUERY_SUFFIX', 'UNKNOWN_CREDENTIAL_SUFFIX']) assert.ok(!all.includes(suffix), suffix);
    result.message = fakeKeys[0];
    events[0].context.injected = fakeKeys[1];
    api.getEntries()[0].message = fakeKeys[2];
    api.buildReport().entries[0].message = fakeKeys[3];
    assert.ok(!api.exportText().includes('FAKEONLY'));
    api.report('Ordinary storage failure', { where: 'save', count: 3 }, 'warning');
    assert.ok(api.exportText().includes('Ordinary storage failure'));
    assert.equal(api.getEntries().at(-1).context.count, 3);
  });
}

test('diagnostics scrub credential aliases from fields and labeled text at every output sink', () => {
  const outputs = [], events = [];
  const window = { addEventListener() {}, dispatchEvent(event) { events.push(event.detail); }, showToast(value) { outputs.push(value); } };
  const secrets = {
    passphrase: 'FAKE PASS PHRASE 001',
    recovery: 'FAKE RECOVERY KEY GROUP 002',
    vault: 'FAKE VAULT KEY GROUP 003',
    wrapped: 'FAKE WRAPPED KEY GROUP 004',
    access: 'FAKE_ACCESS_TOKEN_005',
    refresh: 'FAKE_REFRESH_TOKEN_006',
    id: 'FAKE_ID_TOKEN_007',
    provider: 'FAKE_PROVIDER_API_KEY_008',
    openai: 'FAKE_OPENAI_KEY_009',
    gemini: 'FAKE_GEMINI_API_KEY_010',
    url: 'FAKE URL ACCESS TOKEN 011',
    authorization: 'FAKE_AUTHORIZATION_HEADER_013',
    multilayer: 'FAKE_API_KEY_014',
    recoveryVault: 'FAKE_RECOVERY_VAULT_KEY_015',
    wrappedVault: 'FAKE_WRAPPED_VAULT_KEY_016'
  };
  const dangerousKeyContext = { where: 'prototype-key context' };
  Object.defineProperty(dangerousKeyContext, '__proto__', {
    value: { recoveryKey: 'FAKE_PROTO_RECOVERY_KEY_012' }, enumerable: true
  });
  const context = vm.createContext({ window, location: {
    hostname: 'localhost', protocol: 'https:',
    href: 'https://sutra.example/?%61ccess%5Ftoken=' + encodeURIComponent(secrets.url)
      + '&%252561pi%255Fkey=' + secrets.multilayer + '&view=timeline'
  }, navigator: { userAgent: 'test', language: 'en' }, CustomEvent: class { constructor(type, init) { this.detail = init.detail; } },
  console: Object.fromEntries(['error', 'warn', 'log', 'debug'].map(name => [name, (...args) => outputs.push(args)])) });
  vm.runInContext(source('src/core/error-reporter.js'), context);
  const api = window.SutraDiagnostics;
  const message = [
    'pass phrase: ' + secrets.passphrase,
    'recovery-key=' + secrets.recovery,
    'VAULT_KEY=' + secrets.vault,
    'wrapped key: ' + secrets.wrapped,
    'ACCESS TOKEN=' + secrets.access,
    'Refresh-Token=' + secrets.refresh,
    'id%5Ftoken=' + secrets.id,
    'x-goog-api-key: ' + secrets.provider,
    'openAIKey=' + secrets.openai,
    'geminiApiKey=' + secrets.gemini,
    'Authorization: Basic ' + secrets.authorization,
    '%252561pi%255Fkey=' + secrets.multilayer,
    'recoveryVaultKey=' + secrets.recoveryVault,
    'wrappedVaultKey=' + secrets.wrappedVault
  ].join('; ');
  const result = api.report(new Error(message), {
    where: 'provider request',
    providerConfig: {
      syncPassPhrase: secrets.passphrase,
      recovery_key: secrets.recovery,
      'Vault-Key': secrets.vault,
      'wrapped key': secrets.wrapped,
      accessToken: secrets.access,
      refresh_token: secrets.refresh,
      'ID Token': secrets.id,
      provider_api_key: secrets.provider,
      openAIKey: secrets.openai,
      geminiApiKey: secrets.gemini,
      '%252561pi%255Fkey': secrets.multilayer,
      recoveryVaultKey: secrets.recoveryVault,
      wrappedVaultKey: secrets.wrappedVault
    },
    userMessage: 'Could not save; passphrase=' + secrets.passphrase,
    detail: 'Saved assignment count: 3'
  }, 'error');
  const prototypeResult = api.report(new Error('Prototype context check'), dangerousKeyContext, 'warning');

  const allOutputs = JSON.stringify([outputs, events, result, prototypeResult, api.getEntries(), api.buildReport(), api.exportText()]);
  for (const value of Object.values(secrets)) {
    assert.ok(!allOutputs.includes(value), 'credential sentinel leaked: ' + value);
  }
  assert.ok(!allOutputs.includes(encodeURIComponent(secrets.url)), 'URL-encoded credential value leaked');
  assert.ok(!allOutputs.includes('FAKE_PROTO_RECOVERY_KEY_012'), 'prototype-named context property leaked');
  assert.ok(allOutputs.includes('Saved assignment count: 3'), 'ordinary diagnostic context should remain available');
  assert.ok(allOutputs.includes('view=timeline'), 'non-secret query data should remain available');
  assert.equal(Object.getPrototypeOf(prototypeResult.context), null, 'returned diagnostic context should be prototype-safe');
  assert.equal(prototypeResult.context.__proto__.recoveryKey, '[redacted]');
  assert.equal(api.scrubSecrets('Ordinary diagnostic text'), 'Ordinary diagnostic text');
  assert.equal(api.scrubSecrets(17), 17);
});

test('diagnostics scrub credentials after ordinary, nested, quoted, and encoded labels', () => {
  const window = { addEventListener() {}, dispatchEvent() {}, showToast() {} };
  const context = vm.createContext({ window, location: {
    hostname: 'localhost', protocol: 'https:', href: 'https://sutra.example/'
  }, navigator: { userAgent: 'test', language: 'en' }, CustomEvent: class { constructor(type, init) { this.detail = init.detail; } },
  console: Object.fromEntries(['error', 'warn', 'log', 'debug'].map(name => [name, () => {}])) });
  vm.runInContext(source('src/core/error-reporter.js'), context);
  const api = window.SutraDiagnostics;
  const secret = 'FAKE_NESTED_PASS_PHRASE_017';
  const values = [
    'Error:passphrase=' + secret,
    'Error: pass_phrase=' + secret,
    'Error: access_token=' + secret,
    'Error:diagnostic:passphrase=' + secret,
    'Error: "pass phrase"=' + secret,
    'Error:%2570ass%2570hrase=' + secret
  ];

  for (const value of values) {
    const scrubbed = api.scrubSecrets(value);
    assert.ok(!scrubbed.includes(secret), 'nested credential value should be redacted');
    assert.ok(scrubbed.includes('[redacted]'), 'redaction marker should remain visible');
  }
  assert.equal(api.scrubSecrets('Error: Saved assignment count: 3'), 'Error: Saved assignment count: 3');
  assert.equal(api.scrubSecrets('Error: public key: enabled'), 'Error: public key: enabled');

  const error = new Error('safe message');
  error.stack = 'Error:passphrase=' + secret;
  const entry = api.report(error, { where: 'diagnostic stack' }, 'warning');
  assert.ok(!JSON.stringify([entry, api.getEntries(), api.exportText()]).includes(secret), 'stack copies and exports must stay scrubbed');
});

test('Homework escaping protects quoted attributes without changing source data', () => {
  const text = source('src/features/study/homework.js');
  const helper = text.slice(text.indexOf('  function escHtml(value)'), text.indexOf('  function normalizeCustomCourseEmoji'));
  const context = vm.createContext({ window: {} });
  vm.runInContext(helper + ';this.escape = escHtml;', context);
  assert.equal(context.escape('"\'`<>& &quot;'), '&quot;&#39;&#96;&lt;&gt;&amp; &amp;quot;');
  assert.equal(context.escape(0), '0');
  assert.equal(context.escape(null), '');
});

test('Assistant permissions fail closed and caller grants can only narrow policy', () => {
  const text = source('src/features/assistant/flow-assistant.js');
  const helper = text.slice(text.indexOf('    function resolveAssistantActionPermissions('), text.indexOf('    function assistantActionPermissionError('));
  const window = {};
  const context = vm.createContext({ window });
  vm.runInContext(helper + ';this.resolve = resolveAssistantActionPermissions;', context);
  const grants = () => Array.from(context.resolve({ permissions: ['workspace.write', 'workspace.delete'] }, false));
  assert.deepEqual(grants(), []);
  for (const result of [null, {}, ['workspace.write', 9]]) {
    window.SutraAssistantPrivacy = { getActionPermissions: () => result };
    assert.deepEqual(grants(), []);
  }
  window.SutraAssistantPrivacy = { getActionPermissions() { throw new Error('not ready'); } };
  assert.deepEqual(grants(), []);
  window.SutraAssistantPrivacy = { getActionPermissions: () => ['workspace.read'] };
  assert.deepEqual(grants(), []);
  window.SutraAssistantPrivacy = { getActionPermissions: options => options.approved ? ['workspace.read', 'workspace.write'] : ['workspace.read'] };
  assert.deepEqual(Array.from(context.resolve({ reviewed: true, permissions: ['workspace.write'] }, false)), ['workspace.write']);
  assert.deepEqual(Array.from(context.resolve({}, false)), ['workspace.read']);
  assert.deepEqual(Array.from(context.resolve({ confirmed: true }, false)), ['workspace.read']);
});
