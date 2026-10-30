import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../src/core/workspace-lock.js', import.meta.url), 'utf8');

function base64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function makeConfig({ enabled = true, saltByte = 7, verifierByte = 1, inactivityTimeout = 5 } = {}) {
  return {
    version: 1,
    enabled,
    salt: base64(new Uint8Array(16).fill(saltByte)),
    verifier: base64(new Uint8Array(32).fill(verifierByte)),
    iterations: 120000,
    inactivityTimeout
  };
}

function createHarness(options = {}) {
  let now = 1000;
  const shared = options.shared || { storedConfig: options.config || makeConfig() };
  let kdfCalls = 0;
  let nextDeriveGate = null;
  let afterNextConfigWrite = null;
  let timerId = 0;
  const listeners = new Map();
  const storage = {
    get(key) {
      if (key !== 'sutra:workspaceLock:v1' || !shared.storedConfig) return null;
      return JSON.parse(JSON.stringify(shared.storedConfig));
    },
    set(key, value) {
      if (key === 'sutra:workspaceLock:v1') {
        shared.storedConfig = JSON.parse(JSON.stringify(value));
        if (afterNextConfigWrite) {
          const callback = afterNextConfigWrite;
          afterNextConfigWrite = null;
          callback();
        }
      }
      return { ok: true };
    },
    remove(key) {
      if (key === 'sutra:workspaceLock:v1') shared.storedConfig = null;
      return { ok: true };
    }
  };
  const subtle = {
    async importKey(_format, raw) {
      return { pin: Buffer.from(raw).toString('utf8') };
    },
    async deriveBits(_params, key) {
      kdfCalls += 1;
      if (nextDeriveGate) {
        const gate = nextDeriveGate;
        nextDeriveGate = null;
        await gate.promise;
      }
      const byte = key.pin === '2468' ? 1 : key.pin === '8642' ? 3 : 2;
      return new Uint8Array(32).fill(byte).buffer;
    }
  };
  const window = {
    SutraSafeStorage: storage,
    navigator: { locks: Object.hasOwn(options, 'locks') ? options.locks : { request(_name, _options, work) { return Promise.resolve().then(work); } } },
    crypto: {
      subtle,
      getRandomValues(bytes) { bytes.fill(9); return bytes; }
    },
    performance: { now: () => now },
    btoa(value) { return Buffer.from(value, 'binary').toString('base64'); },
    atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
    setTimeout() { timerId += 1; return timerId; },
    clearTimeout() {},
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatchEvent(event) {
      (listeners.get(event.type) || []).forEach(listener => listener(event));
      return true;
    },
    console: { warn() {} }
  };
  const document = {
    readyState: 'loading',
    body: null,
    documentElement: { toggleAttribute() {}, setAttribute() {} },
    addEventListener() {},
    querySelector() { return null; },
    getElementById() { return null; }
  };
  class CustomEventMock {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  vm.runInNewContext(source, {
    window,
    document,
    TextEncoder,
    Uint8Array,
    CustomEvent: CustomEventMock,
    console: window.console
  }, { filename: 'workspace-lock.js' });

  return {
    api: window.SutraWorkspaceLock,
    get kdfCalls() { return kdfCalls; },
    getStoredConfig() { return shared.storedConfig === null ? null : JSON.parse(JSON.stringify(shared.storedConfig)); },
    setStoredConfig(value) { shared.storedConfig = JSON.parse(JSON.stringify(value)); },
    afterNextConfigWrite(callback) { afterNextConfigWrite = callback; },
    advance(milliseconds) { now += milliseconds; },
    holdNextDerive() {
      let release;
      const promise = new Promise(resolve => { release = resolve; });
      nextDeriveGate = { promise };
      return release;
    },
    async waitForKdf() {
      for (let i = 0; i < 20 && kdfCalls === 0; i += 1) await Promise.resolve();
      assert.ok(kdfCalls > 0, 'the KDF started');
    }
  };
}

test('workspace lock backoff blocks KDF work and resets after a successful unlock', async () => {
  const harness = createHarness();
  const lock = harness.api;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await lock.unlock('0000');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'That PIN is incorrect.');
  }
  assert.equal(harness.kdfCalls, 3);

  const fourthFailure = await lock.unlock('0000');
  assert.equal(fourthFailure.ok, false);
  assert.match(fourthFailure.error, /wait 1 second/i);
  assert.equal(harness.kdfCalls, 4);

  const blockedCorrectPin = await lock.unlock('2468');
  assert.equal(blockedCorrectPin.ok, false);
  assert.match(blockedCorrectPin.error, /too many incorrect PIN attempts/i);
  assert.equal(harness.kdfCalls, 4, 'a cooldown rejection must not derive a verifier');
  assert.equal(lock.getStatus().locked, true);

  harness.advance(1001);
  const success = await lock.unlock('2468');
  assert.equal(success.ok, true);
  assert.equal(harness.kdfCalls, 5);
  assert.equal(lock.getStatus().locked, false);

  lock.lock();
  const afterReset = await lock.unlock('0000');
  assert.equal(afterReset.error, 'That PIN is incorrect.');
  assert.equal(harness.kdfCalls, 6, 'successful authentication clears the tab-local failure count');
});

test('workspace lock backoff caps at 30 seconds and does not derive during the wait', async () => {
  const harness = createHarness();
  const lock = harness.api;
  const waits = [1000, 2000, 4000, 8000, 16000, 30000, 30000];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal((await lock.unlock('0000')).ok, false);
  }

  for (const wait of waits) {
    const failure = await lock.unlock('0000');
    assert.equal(failure.ok, false);
    assert.match(failure.error, new RegExp('wait ' + wait / 1000 + ' seconds?', 'i'));
    const callsAtCooldown = harness.kdfCalls;

    const blocked = await lock.unlock('2468');
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /too many incorrect PIN attempts/i);
    assert.equal(harness.kdfCalls, callsAtCooldown, 'a request during cooldown must not invoke the KDF');

    harness.advance(wait + 1);
  }

  assert.equal((await lock.unlock('2468')).ok, true);
});

test('verification backoff is shared by verifyPin and current-PIN management operations', async () => {
  const harness = createHarness();
  const lock = harness.api;
  for (let attempt = 0; attempt < 4; attempt += 1) assert.equal(await lock.verifyPin('0000'), false);
  const callsAtCooldown = harness.kdfCalls;

  assert.equal(await lock.verifyPin('2468'), false);
  assert.match((await lock.unlock('2468')).error, /too many incorrect PIN attempts/i);
  assert.match((await lock.changePin('2468', '8642')).error, /too many incorrect PIN attempts/i);
  assert.match((await lock.changeTimeout('2468', 10)).error, /too many incorrect PIN attempts/i);
  assert.match((await lock.disable('2468')).error, /too many incorrect PIN attempts/i);
  assert.equal(harness.kdfCalls, callsAtCooldown, 'all public verification paths share the same cooldown');
  assert.equal(lock.getStatus().locked, true);
});

test('concurrent PIN verification is rejected without starting a second KDF', async () => {
  const harness = createHarness();
  const release = harness.holdNextDerive();
  const first = harness.api.verifyPin('2468');
  await harness.waitForKdf();

  const concurrent = await harness.api.unlock('2468');
  assert.equal(concurrent.ok, false);
  assert.match(concurrent.error, /already in progress/i);
  assert.equal(harness.kdfCalls, 1);

  release();
  assert.equal(await first, true);
  assert.equal(harness.api.getStatus().locked, true, 'verifyPin does not itself unlock the workspace');
});

test('credentials changed during a KDF cannot unlock the workspace', async () => {
  const harness = createHarness();
  const release = harness.holdNextDerive();
  const pending = harness.api.unlock('2468');
  await harness.waitForKdf();

  harness.setStoredConfig(makeConfig({ saltByte: 8, verifierByte: 3 }));
  release();
  const result = await pending;

  assert.equal(result.ok, false);
  assert.match(result.error, /settings changed/i);
  assert.equal(harness.api.getStatus().locked, true);
});

test('a stale current-PIN management check cannot overwrite changed lock settings', async () => {
  const harness = createHarness();
  const release = harness.holdNextDerive();
  const pending = harness.api.changeTimeout('2468', 10);
  await harness.waitForKdf();

  const changedConfig = makeConfig({ saltByte: 8, verifierByte: 3, inactivityTimeout: 15 });
  harness.setStoredConfig(changedConfig);
  release();
  const result = await pending;

  assert.equal(result.ok, false);
  assert.match(result.error, /settings changed/i);
  assert.equal(harness.api.getStatus().locked, true);
  assert.equal(harness.api.getStatus().inactivityTimeout, 15, 'the external configuration must remain authoritative');
});

test('a newer lock verifier between write and readback is retained and enforced after reload', async () => {
  for (const operation of ['changeTimeout', 'disable']) {
    const harness = createHarness();
    assert.equal((await harness.api.unlock('2468')).ok, true);
    const newerConfig = makeConfig({ saltByte: 8, verifierByte: 3, inactivityTimeout: 15 });
    harness.afterNextConfigWrite(() => harness.setStoredConfig(newerConfig));

    const result = operation === 'changeTimeout'
      ? await harness.api.changeTimeout('2468', 10)
      : await harness.api.disable('2468');
    assert.equal(result.ok, false, `${operation} must not report an unverified write as successful`);
    assert.deepEqual(harness.getStoredConfig(), newerConfig, 'another tab\'s verifier must not be removed');
    assert.equal(harness.api.getStatus().locked, true);
    assert.equal(harness.api.getStatus().inactivityTimeout, 15);

    const reloaded = createHarness({ config: harness.getStoredConfig() });
    assert.equal(reloaded.api.getStatus().locked, true, 'the newer verifier still locks a fresh document');
    assert.equal((await reloaded.api.unlock('2468')).ok, false);
    assert.equal((await reloaded.api.unlock('8642')).ok, true);
  }
});

test('concurrent tab mutations recheck their authorization under the shared lock', async () => {
  let release;
  let queue = new Promise(resolve => { release = resolve; });
  const requests = [];
  const locks = {
    request(name, options, work) {
      requests.push({ name, options });
      const result = queue.then(work);
      queue = result.catch(() => {});
      return result;
    }
  };
  const shared = { storedConfig: makeConfig() };
  const first = createHarness({ shared, locks });
  const second = createHarness({ shared, locks });
  const changed = first.api.changePin('2468', '8642');
  for (let i = 0; i < 30 && requests.length < 1; i += 1) await Promise.resolve();
  assert.equal(requests.length, 1);
  const disabled = second.api.disable('2468');
  for (let i = 0; i < 30 && requests.length < 2; i += 1) await Promise.resolve();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].name, requests[1].name);
  assert.equal(requests[0].options.mode, 'exclusive');
  release();
  assert.equal((await changed).ok, true);
  assert.equal((await disabled).ok, false, 'old authorization cannot disable the new verifier');
  assert.equal(shared.storedConfig.enabled, true);
  const reloaded = createHarness({ config: shared.storedConfig });
  assert.equal(reloaded.api.getStatus().locked, true);
  assert.equal((await reloaded.api.unlock('2468')).ok, false);
  assert.equal((await reloaded.api.unlock('8642')).ok, true);
});

test('without Web Locks, settings mutations fail without weakening the existing gate', async () => {
  const original = makeConfig();
  const harness = createHarness({ config: original, locks: null });
  assert.equal((await harness.api.unlock('2468')).ok, true, 'normal unlock remains available');
  for (const result of [
    await harness.api.changeTimeout('2468', 10),
    await harness.api.changePin('2468', '8642'),
    await harness.api.disable('2468')
  ]) {
    assert.equal(result.ok, false);
    assert.match(result.error, /Web Locks/);
  }
  assert.deepEqual(harness.getStoredConfig(), original);
  const reloaded = createHarness({ config: harness.getStoredConfig(), locks: null });
  assert.equal(reloaded.api.getStatus().locked, true);
  assert.equal((await reloaded.api.unlock('2468')).ok, true);
  const disabled = createHarness({ config: makeConfig({ enabled: false }), locks: null });
  const enableResult = await disabled.api.enable('1357', 5);
  assert.equal(enableResult.ok, false);
  assert.match(enableResult.error, /Web Locks/);
  assert.equal(disabled.getStoredConfig().enabled, false);
});

test('a queued enable from a stale disabled tab cannot replace a newer PIN change', async () => {
  let release;
  let queue = new Promise(resolve => { release = resolve; });
  let requests = 0;
  const locks = { request(_name, _options, work) {
    requests += 1;
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  } };
  const shared = { storedConfig: makeConfig({ enabled: false }) };
  const staleTab = createHarness({ shared, locks });
  // Another tab has enabled the lock, but the stale tab has not processed its event.
  shared.storedConfig = makeConfig();
  const activeTab = createHarness({ shared, locks });
  const changed = activeTab.api.changePin('2468', '8642');
  for (let i = 0; i < 30 && requests < 1; i += 1) await Promise.resolve();
  assert.equal(requests, 1);
  const staleEnable = staleTab.api.enable('1357', 5);
  for (let i = 0; i < 30 && requests < 2; i += 1) await Promise.resolve();
  assert.equal(requests, 2);
  release();
  assert.equal((await changed).ok, true);
  assert.equal((await staleEnable).ok, false);
  const reloaded = createHarness({ config: shared.storedConfig });
  assert.equal(reloaded.api.getStatus().locked, true);
  assert.equal((await reloaded.api.unlock('1357')).ok, false);
  assert.equal((await reloaded.api.unlock('8642')).ok, true);
});

test('enable cannot replace an enabled verifier without the current PIN', async () => {
  const harness = createHarness();
  const original = harness.getStoredConfig();
  assert.equal((await harness.api.enable('8642', 5)).ok, false);
  assert.deepEqual(harness.getStoredConfig(), original);
});

test('a lock transition during a KDF invalidates the pending unlock', async () => {
  const harness = createHarness();
  const release = harness.holdNextDerive();
  const pending = harness.api.unlock('2468');
  await harness.waitForKdf();

  harness.api.lock();
  release();
  const result = await pending;

  assert.equal(result.ok, false);
  assert.match(result.error, /settings changed/i);
  assert.equal(harness.api.getStatus().locked, true);
});
