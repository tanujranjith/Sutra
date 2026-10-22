import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const singleton = require('../../src/features/feature-registry.js');

function harness() {
  const calls = [];
  const loader = {
    async script(src) { calls.push(['script', src]); },
    async style(href) { calls.push(['style', href]); },
    enableStyle(href) { calls.push(['enable-style', href]); },
    disableStyle(href) { calls.push(['disable-style', href]); }
  };
  const manifest = {
    base: { id: 'base', displayName: 'Base', pack: 'test', defaultEnabled: false, dependencies: [], scripts: ['base.js'], styles: ['base.css'], initialization: '', teardown: '', navigationEntries: ['base'], persistenceNamespace: 'baseData', assistantCapabilities: [], searchIntegration: [], commandIntegration: [] },
    heavy: { id: 'heavy', displayName: 'Heavy', pack: 'test', defaultEnabled: false, dependencies: ['base'], scripts: ['heavy-a.js', 'heavy-b.js'], styles: ['heavy.css'], initialization: '', teardown: '', navigationEntries: ['heavy'], persistenceNamespace: 'heavyData', assistantCapabilities: ['heavy'], searchIntegration: ['heavy'], commandIntegration: ['open-heavy'] }
  };
  return { registry: singleton.createFeatureRegistry(manifest, loader), calls };
}

test('disabled packs load no scripts, styles, listeners, or background initializers', async () => {
  const { registry, calls } = harness();
  const result = await registry.configure({ base: false, heavy: false });
  assert.deepEqual(calls, [['disable-style', 'base.css'], ['disable-style', 'heavy.css']]);
  assert.equal(result.every((row) => row.state.initialized === false), true);
  assert.equal(registry.getState('heavy').loaded, false);
});

test('dependencies load predictably and each asset initializes once', async () => {
  const { registry, calls } = harness();
  await Promise.all([registry.enable('heavy'), registry.enable('heavy')]);
  assert.deepEqual(calls, [
    ['style', 'base.css'], ['script', 'base.js'], ['enable-style', 'base.css'],
    ['style', 'heavy.css'], ['script', 'heavy-a.js'], ['script', 'heavy-b.js'], ['enable-style', 'heavy.css']
  ]);
  assert.equal(registry.getState('base').loaded, true);
  assert.equal(registry.getState('heavy').initialized, true);
  assert.ok(registry.getMetrics().heavy.durationMs >= 0);
});

test('disabling and re-enabling preserves the persistence namespace and does not reload assets', async () => {
  const { registry, calls } = harness();
  await registry.enable('heavy');
  await registry.disable('heavy');
  assert.ok(calls.some((row) => row[0] === 'disable-style' && row[1] === 'heavy.css'));
  assert.equal(registry.get('heavy').persistenceNamespace, 'heavyData');
  assert.equal(registry.getState('heavy').loaded, true);
  await registry.enable('heavy');
  assert.equal(calls.filter((row) => row[0] === 'script').length, 3);
  assert.equal(calls.filter((row) => row[0] === 'enable-style' && row[1] === 'heavy.css').length, 2);
});

test('feature definitions expose the full declarative contract', () => {
  const { registry } = harness();
  const feature = registry.get('heavy');
  for (const field of ['id', 'displayName', 'pack', 'defaultEnabled', 'dependencies', 'scripts', 'styles', 'initialization', 'teardown', 'navigationEntries', 'persistenceNamespace', 'assistantCapabilities', 'searchIntegration', 'commandIntegration']) {
    assert.equal(Object.prototype.hasOwnProperty.call(feature, field), true, field);
  }
});

test('recovery mode prevents optional assets and initializers from loading', async () => {
  globalThis.SutraRecoveryMode = { shouldLoadOptionalFeature: () => false };
  try {
    const { registry, calls } = harness();
    const result = await registry.enable('heavy');
    assert.equal(result.enabled, false);
    assert.equal(result.loaded, false);
    assert.match(result.error, /Recovery Mode/);
    assert.deepEqual(calls, []);
  } finally {
    delete globalThis.SutraRecoveryMode;
  }
});


function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function deferredLifecycle({ blockScript = false, blockInit = false, autoInit = false } = {}) {
  const scriptGate = deferred(), initGate = deferred(), scriptStarted = deferred(), initStarted = deferred();
  if (!blockScript) scriptGate.resolve();
  if (!blockInit) initGate.resolve();
  const calls = [], styles = new Set();
  let live = false;
  globalThis.__sutraRegistryLifecycleFixture = {
    async init() { calls.push('init'); live = true; initStarted.resolve(); await initGate.promise; styles.add('race.css'); },
    async teardown() { calls.push('teardown'); live = false; }
  };
  const registry = singleton.createFeatureRegistry({ race: {
    id: 'race', dependencies: [], scripts: ['race.js'], styles: ['race.css'],
    initialization: '__sutraRegistryLifecycleFixture.init', teardown: '__sutraRegistryLifecycleFixture.teardown'
  } }, {
    async script() { calls.push('script'); scriptStarted.resolve(); await scriptGate.promise; if (autoInit) { calls.push('auto-init'); live = true; styles.add('race.css'); } },
    async style(href) { calls.push('style'); styles.add(href); },
    enableStyle(href) { calls.push('enable-style'); styles.add(href); },
    disableStyle(href) { calls.push('disable-style'); styles.delete(href); }
  });
  return { registry, calls, styles, scriptGate, initGate, scriptStarted, initStarted, isLive: () => live,
    cleanup() { scriptGate.resolve(); initGate.resolve(); delete globalThis.__sutraRegistryLifecycleFixture; } };
}

test('disable during deferred loading cleans up legacy script auto-init and re-enables cached assets safely', async () => {
  const fixture = deferredLifecycle({ blockScript: true, autoInit: true });
  const { registry, calls, styles, scriptGate, scriptStarted } = fixture;
  try {
    const loading = registry.enable('race');
    await scriptStarted.promise;
    const stopping = registry.disable('race');
    assert.equal(styles.has('race.css'), false, 'styles disable immediately');
    scriptGate.resolve();
    await Promise.all([loading, stopping]);
    assert.equal(registry.getState('race').enabled, false);
    assert.equal(registry.getState('race').initialized, false);
    assert.equal(registry.getState('race').loaded, true);
    assert.equal(fixture.isLive(), false);
    assert.equal(styles.has('race.css'), false, 'late script effects cannot re-enable disabled styles');
    assert.equal(calls.filter(value => value === 'init').length, 0);
    assert.equal(calls.filter(value => value === 'teardown').length, 1);
    await registry.enable('race');
    assert.equal(registry.getState('race').initialized, true);
    assert.equal(fixture.isLive(), true);
    assert.equal(styles.has('race.css'), true);
    assert.equal(calls.filter(value => value === 'script').length, 1);
  } finally { fixture.cleanup(); }
});

test('disable waits for a pending initializer and tears down its late effects before resolving', async () => {
  const fixture = deferredLifecycle({ blockInit: true });
  const { registry, styles, initGate, initStarted } = fixture;
  try {
    const enabling = registry.enable('race');
    await initStarted.promise;
    let disabledResolved = false;
    const stopping = registry.disable('race').then(() => { disabledResolved = true; });
    await Promise.resolve();
    assert.equal(disabledResolved, false, 'disable cannot finish ahead of pending initialization');
    assert.equal(styles.has('race.css'), false);
    initGate.resolve();
    await Promise.all([enabling, stopping]);
    assert.equal(registry.getState('race').initialized, false);
    assert.equal(fixture.isLive(), false);
    assert.equal(styles.has('race.css'), false);
    await registry.enable('race');
    assert.equal(registry.getState('race').initialized, true);
    assert.equal(styles.has('race.css'), true);
  } finally { fixture.cleanup(); }
});

test('re-enable requested during load cleanup initializes once after cleanup and preserves the latest request', async () => {
  const fixture = deferredLifecycle({ blockScript: true, autoInit: true });
  const { registry, calls, styles, scriptGate, scriptStarted } = fixture;
  try {
    const first = registry.enable('race');
    await scriptStarted.promise;
    const stopping = registry.disable('race');
    const reopening = registry.enable('race');
    scriptGate.resolve();
    await Promise.all([first, stopping, reopening]);
    const state = registry.getState('race');
    assert.equal(state.enabled, true); assert.equal(state.initialized, true);
    assert.equal(fixture.isLive(), true); assert.equal(styles.has('race.css'), true);
    assert.equal(calls.filter(value => value === 'script').length, 1);
    assert.equal(calls.filter(value => value === 'init').length, 1);
    assert.ok(calls.indexOf('teardown') < calls.indexOf('init'));
  } finally { fixture.cleanup(); }
});

test('concurrent enables share an asynchronous initializer', async () => {
  const fixture = deferredLifecycle({ blockInit: true });
  const { registry, calls, initGate, initStarted } = fixture;
  try {
    const first = registry.enable('race'), second = registry.enable('race');
    await initStarted.promise;
    assert.equal(calls.filter(value => value === 'init').length, 1);
    initGate.resolve();
    await Promise.all([first, second]);
    assert.equal(calls.filter(value => value === 'init').length, 1);
    assert.equal(registry.getState('race').initialized, true);
  } finally { fixture.cleanup(); }
});
