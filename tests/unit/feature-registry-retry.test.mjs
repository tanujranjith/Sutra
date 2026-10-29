import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../src/features/feature-registry.js', import.meta.url), 'utf8');

// Exercise the production browser loader with controllable resource events.
function harness({ existingStyle = false, existingStyleLoaded = false } = {}) {
  const nodes = [], requested = [];
  const baseURI = 'https://sutra.test/Sutra.html';
  function node(tag) {
    const listeners = new Map();
    const value = {
      tag, disabled: false, sheet: null, nonce: '', media: '',
      getAttribute(key) { return this[key] || null; },
      addEventListener(type, fn) { listeners.set(type, fn); },
      removeEventListener(type) { listeners.delete(type); },
      remove() { const index = nodes.indexOf(this); if (index >= 0) nodes.splice(index, 1); },
      replaceWith(next) { nodes.splice(nodes.indexOf(this), 1, next); requested.push(next); },
      cloneNode() { return Object.assign(node(tag), { href: this.href, rel: this.rel, nonce: this.nonce, media: this.media }); },
      emit(type) {
        if (type === 'load' && tag === 'link') this.sheet = {};
        this['on' + type]?.();
        listeners.get(type)?.();
      }
    };
    return value;
  }
  const document = {
    baseURI, createElement: node,
    head: { appendChild(value) { nodes.push(value); requested.push(value); } },
    querySelectorAll() { return nodes.filter(value => value.tag === 'link'); }
  };
  const existing = existingStyle ? Object.assign(node('link'), {
    href: 'retry.css', rel: 'stylesheet', nonce: 'local-nonce', media: 'screen',
    sheet: existingStyleLoaded ? {} : null
  }) : null;
  if (existing) nodes.push(existing);
  let initialized = 0;
  const context = vm.createContext({ document, URL, fixture: { init() { initialized += 1; } } });
  vm.runInContext(source, context);
  const registry = context.SutraFeatureRegistry.createFeatureRegistry({ retry: {
    id: 'retry', dependencies: [], styles: existingStyle ? ['retry.css'] : [],
    scripts: existingStyle ? [] : ['ready.js', 'retry.js'], initialization: 'fixture.init'
  } });
  return { registry, requested, nodes, existing, initialized: () => initialized };
}

async function until(predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail('Expected resource request did not occur');
}

test('optional scripts retry failed downloads without executing successful dependencies twice', async () => {
  const h = harness();
  const first = h.registry.configure({ retry: true });
  await until(() => h.requested.length === 1);
  h.requested[0].emit('load');
  await until(() => h.requested.length === 2);
  h.requested[1].emit('error');
  assert.match((await first)[0].error, /script failed/);
  assert.equal(h.initialized(), 0);
  assert.equal(h.nodes.length, 1, 'failed script nodes are removed');

  const second = h.registry.configure({ retry: true });
  const concurrent = h.registry.enable('retry');
  await until(() => h.requested.length === 3);
  assert.equal(h.requested[2].src, 'retry.js');
  h.requested[2].emit('load');
  await Promise.all([second, concurrent]);
  assert.equal(h.initialized(), 1);
  assert.equal(h.requested.filter(value => value.src === 'ready.js').length, 1);
  assert.equal(h.registry.getState('retry').error, null, 'successful retry clears the old error');
  assert.equal(h.registry.getState('retry').initialized, true);
});

test('an existing style that failed before enable is replaced and loaded in its original cascade position', async () => {
  const h = harness({ existingStyle: true });
  const after = { tag: 'link', href: 'later.css' };
  h.nodes.push(after);
  h.existing.emit('error');
  const first = h.registry.configure({ retry: true });
  await until(() => h.requested.length === 1);
  const replacement = h.requested[0];
  assert.notEqual(replacement, h.existing);
  assert.equal(h.nodes[0], replacement);
  assert.equal(h.nodes[1], after, 'later styles retain cascade precedence');
  assert.equal(replacement.nonce, 'local-nonce');
  assert.equal(replacement.media, 'screen');
  assert.equal(typeof replacement.onload, 'function', 'listeners are installed before insertion');
  assert.equal(typeof replacement.onerror, 'function');
  replacement.emit('load');
  assert.equal((await first)[0].state.loaded, true);
  await h.registry.disable('retry');
  await h.registry.enable('retry');
  assert.equal(h.requested.length, 1, 'successfully loaded replacement is reused');
  assert.equal(h.registry.getState('retry').error, null);
});

test('a pending existing style is replaced so the loader observes its own request', async () => {
  const h = harness({ existingStyle: true });
  const after = { tag: 'link', href: 'later.css' };
  h.nodes.push(after);
  const pending = h.registry.configure({ retry: true });
  await until(() => h.requested.length === 1);
  const replacement = h.requested[0];
  assert.notEqual(replacement, h.existing);
  assert.equal(h.nodes[0], replacement);
  assert.equal(h.nodes[1], after);
  assert.equal(typeof replacement.onload, 'function');
  replacement.emit('load');
  assert.equal((await pending)[0].state.loaded, true);
});

test('a replacement stylesheet failure can retry without changing cascade position', async () => {
  const h = harness({ existingStyle: true });
  const after = { tag: 'link', href: 'later.css' };
  h.nodes.push(after);
  const failed = h.registry.configure({ retry: true });
  await until(() => h.requested.length === 1);
  const firstReplacement = h.requested[0];
  firstReplacement.emit('error');
  assert.match((await failed)[0].error, /style failed/);

  const retried = h.registry.configure({ retry: true });
  await until(() => h.requested.length === 2);
  const replacement = h.requested[1];
  assert.notEqual(replacement, firstReplacement);
  assert.equal(h.nodes[0], replacement);
  assert.equal(h.nodes[1], after, 'later styles retain cascade precedence');
  assert.equal(replacement.nonce, 'local-nonce');
  assert.equal(replacement.media, 'screen');
  replacement.emit('load');
  assert.equal((await retried)[0].state.loaded, true);
  await h.registry.disable('retry');
  await h.registry.enable('retry');
  assert.equal(h.requested.length, 2, 'successful retry is reused');
  assert.equal(h.registry.getState('retry').error, null);
});

test('an already-loaded existing stylesheet is reused', async () => {
  const h = harness({ existingStyle: true, existingStyleLoaded: true });
  h.existing.disabled = true;
  const outcome = await h.registry.configure({ retry: true });
  assert.equal(outcome[0].state.loaded, true);
  assert.equal(h.nodes.length, 1);
  assert.equal(h.nodes[0], h.existing);
  assert.equal(h.requested.length, 0, 'no duplicate stylesheet is inserted');
  assert.equal(h.existing.disabled, false);
  await h.registry.disable('retry');
  assert.equal(h.existing.disabled, true);
  await h.registry.enable('retry');
  assert.equal(h.existing.disabled, false);
  assert.equal(h.requested.length, 0);
});
