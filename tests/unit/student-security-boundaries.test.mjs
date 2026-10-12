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
