import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const require = createRequire(import.meta.url);
const wipeApi = require('../../src/persistence/revocation-wipe.js');
const app = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const performDeclaration = extractFunction(app, 'performVerifiedSutraRevocationWipe');
const channelDeclaration = extractFunction(app, 'getSutraSyncBroadcastChannel');
assert.ok(performDeclaration, 'the actual revocation runner is available for behavior-level coverage');
assert.ok(channelDeclaration, 'the actual cross-tab channel handler is available for behavior-level coverage');

const ORIGIN_LOCK = 'sutra-revoke-wipe-v1';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function until(predicate, label) {
  for (let index = 0; index < 80; index += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail(`Timed out waiting for ${label}`);
}

function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
  return {
    get length() { return values.size; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
    key(index) { return [...values.keys()][index] ?? null; }
  };
}

function createBus() {
  const channels = [];
  let pending = [];
  class FakeBroadcastChannel {
    constructor(name) {
      this.name = String(name);
      this.onmessage = null;
      channels.push(this);
    }
    postMessage(data) { pending.push({ from: this, data }); }
    close() {}
  }
  return {
    BroadcastChannel: FakeBroadcastChannel,
    pending(type) { return pending.filter(entry => entry.data && entry.data.type === type).length; },
    deliver(type) {
      const selected = pending.filter(entry => entry.data && entry.data.type === type);
      pending = pending.filter(entry => !entry.data || entry.data.type !== type);
      for (const entry of selected) {
        for (const channel of channels) {
          if (channel === entry.from || channel.name !== entry.from.name || typeof channel.onmessage !== 'function') continue;
          channel.onmessage({ data: entry.data });
        }
      }
      return selected.length;
    }
  };
}

function createOriginLocks() {
  let queue = Promise.resolve();
  let requestCount = 0;
  return {
    request(name, _options, callback) {
      assert.equal(String(name), ORIGIN_LOCK, 'guard transitions and follower finalization share one origin lock');
      requestCount += 1;
      const current = queue.then(() => callback({ name: String(name) }));
      queue = current.then(() => undefined, () => undefined);
      return current;
    },
    idle() { return queue; },
    get requestCount() { return requestCount; }
  };
}

function makeIndexedDb() {
  return {
    deleteDatabase() {
      const request = {};
      queueMicrotask(() => { if (typeof request.onsuccess === 'function') request.onsuccess(); });
      return request;
    },
    databases() { return Promise.resolve([]); }
  };
}

function createTwoTabHarness(options = {}) {
  const localStorage = createStorage({ 'sutra:workspace:fixture': 'private local content' });
  const bus = createBus();
  const locks = options.locks || createOriginLocks();
  const tabs = [];
  const events = [];
  let wipeCount = 0;

  function makeTab(id, barrier = Promise.resolve()) {
    const sessionStorage = createStorage({ [`sutra-session-${id}`]: `session-${id}` });
    const tabEvents = [];
    const state = { locked: false, clearCalls: [], mounts: [], enterCalls: 0 };
    const sutraSyncRuntime = { channel: undefined };
    const api = {
      GUARD_KEY: wipeApi.GUARD_KEY,
      readGuard() { return wipeApi.readGuard(localStorage); },
      writeGuard(_storage, status, detail) {
        events.push(`guard:${status}`);
        return wipeApi.writeGuard(localStorage, status, detail);
      },
      async wipe(wipeOptions) {
        wipeCount += 1;
        events.push(`wipe:${id}`);
        return wipeApi.wipe({
          ...wipeOptions,
          localStorage,
          sessionStorage,
          indexedDB: makeIndexedDb()
        });
      },
      finalize() {
        events.push(`finalize:${id}`);
        return wipeApi.finalize({ localStorage, sessionStorage });
      }
    };
    const window = { SutraRevocationWipe: api };
    const navigator = { locks };
    const enterSutraRevocationLock = () => {
      state.locked = true;
      state.enterCalls += 1;
      tabEvents.push('lock-entered');
      return barrier;
    };
    const clearSutraRevokedInMemoryData = clearOptions => {
      state.clearCalls.push(clearOptions || null);
      tabEvents.push('memory-cleared');
    };
    const mountSutraRevokedScreen = (message, mountOptions) => {
      state.mounts.push({ message: String(message || ''), options: mountOptions || {} });
      tabEvents.push('screen-mounted');
    };
    const dispatchSutraSyncEvent = () => {};
    let sutraRevocationGuard = null;
    let sutraRevocationWipePromise = null;
    const factory = new Function(
      'sutraRevocationWipePromise', 'sutraRevocationGuard',
      'enterSutraRevocationLock', 'window', 'navigator', 'clearSutraRevokedInMemoryData',
      'mountSutraRevokedScreen', 'sutraSyncRuntime', 'BroadcastChannel', 'dispatchSutraSyncEvent',
      `async ${performDeclaration.body}\n${channelDeclaration.body}\nreturn {
        perform: transport => performVerifiedSutraRevocationWipe(transport),
        getChannel: getSutraSyncBroadcastChannel
      };`
    );
    const runtime = factory(
      sutraRevocationWipePromise, sutraRevocationGuard,
      enterSutraRevocationLock, window, navigator, clearSutraRevokedInMemoryData,
      mountSutraRevokedScreen, sutraSyncRuntime, bus.BroadcastChannel, dispatchSutraSyncEvent
    );
    const transport = {
      async acknowledgeDeviceWipe() {
        state.acknowledgements = (state.acknowledgements || 0) + 1;
        events.push(`ack:${id}`);
        return { ok: true };
      }
    };
    const tab = { id, state, sessionStorage, tabEvents, runtime, transport };
    tabs.push(tab);
    return tab;
  }

  return { localStorage, bus, locks, tabs, events, makeTab, get wipeCount() { return wipeCount; } };
}

test('queued verified tabs do not restart a terminal wipe, and delayed completion clears the follower session', async () => {
  const harness = createTwoTabHarness();
  const gate = deferred();
  const hold = harness.locks.request(ORIGIN_LOCK, { mode: 'exclusive' }, () => gate.promise);
  const leaderBarrier = deferred();
  const followerBarrier = deferred();
  const leader = harness.makeTab('leader', leaderBarrier.promise);
  const follower = harness.makeTab('follower', followerBarrier.promise);

  const leaderRun = leader.runtime.perform(leader.transport);
  const followerRun = follower.runtime.perform(follower.transport);
  assert.equal(leader.state.locked, true, 'the leader blocks the tab before it queues on the shared lock');
  assert.equal(follower.state.locked, true, 'the follower blocks its tab before it queues on the shared lock');
  assert.equal(leader.state.acknowledgements || 0, 0);
  assert.equal(follower.state.acknowledgements || 0, 0);

  gate.resolve();
  await hold;
  await until(() => harness.localStorage.getItem(wipeApi.GUARD_KEY) !== null, 'the lock holder to persist the verified guard');
  assert.equal(wipeApi.readGuard(harness.localStorage).status, 'verified');
  assert.equal(harness.wipeCount, 0, 'the persistence barrier remains in force before database deletion');
  assert.equal(harness.bus.deliver('revoke-wipe-start'), 1);

  leaderBarrier.resolve();
  await leaderRun;
  assert.equal(wipeApi.readGuard(harness.localStorage).status, 'complete');
  assert.equal(leader.state.acknowledgements, 1);

  followerBarrier.resolve();
  await followerRun;
  assert.equal(wipeApi.readGuard(harness.localStorage).status, 'complete',
    'the queued follower does not overwrite the terminal guard with cleaning');
  assert.equal(harness.wipeCount, 1, 'the origin performs one database wipe');
  assert.equal(leader.state.acknowledgements, 1);
  assert.equal(follower.state.acknowledgements || 0, 0, 'the follower does not acknowledge the leader’s completed wipe again');

  assert.equal(harness.bus.deliver('revoke-wipe-complete'), 2,
    'the delayed leader completion is delivered after the queued follower run');
  await harness.locks.idle();
  assert.equal(wipeApi.readGuard(harness.localStorage).status, 'complete');
  assert.equal(leader.sessionStorage.length, 0);
  assert.equal(follower.sessionStorage.length, 0, 'the follower clears its own tab-scoped session');
  assert.equal(harness.events.includes('guard:cleanup-error'), false);
});

test('complete-unverified remains honest and skips a repeated wipe and acknowledgement', async () => {
  const harness = createTwoTabHarness();
  harness.localStorage.clear();
  wipeApi.writeGuard(harness.localStorage, 'complete-unverified', 'Database enumeration is unavailable.');
  const tab = harness.makeTab('unverified');

  await tab.runtime.perform(tab.transport);

  const guard = wipeApi.readGuard(harness.localStorage);
  assert.equal(guard.status, 'complete-unverified');
  assert.equal(guard.detail, 'Database enumeration is unavailable.');
  assert.equal(harness.wipeCount, 0);
  assert.equal(tab.state.acknowledgements || 0, 0);
  assert.equal(tab.sessionStorage.length, 0);
  assert.match(tab.state.mounts.at(-1).message, /cannot verify/i);
});

test('origin-lock acquisition failure keeps the tab locked without claiming a completed wipe', async () => {
  const failingLocks = {
    request() { return Promise.reject(new Error('origin lock unavailable')); }
  };
  const harness = createTwoTabHarness({ locks: failingLocks });
  const tab = harness.makeTab('lock-error');

  await assert.rejects(tab.runtime.perform(tab.transport), /origin lock unavailable/);

  assert.equal(tab.state.locked, true);
  assert.equal(wipeApi.readGuard(harness.localStorage).status, 'cleanup-error',
    'a missing guard gets the durable fail-closed sentinel if the origin lock cannot be acquired');
  assert.equal(harness.wipeCount, 0);
  assert.equal(tab.state.acknowledgements || 0, 0);
  assert.equal(tab.state.clearCalls.at(-1)?.preserveAuth, true);
  assert.equal(tab.state.mounts.at(-1).options.allowReuse, false);

  const terminalHarness = createTwoTabHarness({ locks: failingLocks });
  wipeApi.writeGuard(terminalHarness.localStorage, 'complete-unverified', 'Keep the verified completeness limit.');
  const terminalTab = terminalHarness.makeTab('terminal-lock-error');
  await assert.rejects(terminalTab.runtime.perform(terminalTab.transport), /origin lock unavailable/);
  assert.equal(wipeApi.readGuard(terminalHarness.localStorage).status, 'complete-unverified',
    'lock-acquisition failure cannot downgrade an existing terminal guard');
  assert.equal(wipeApi.readGuard(terminalHarness.localStorage).detail, 'Keep the verified completeness limit.');
  assert.equal(terminalHarness.wipeCount, 0);
  assert.equal(terminalTab.state.acknowledgements || 0, 0);
});

test('the local lock is immediate, while the verified guard and start event precede the persistence barrier', async () => {
  const harness = createTwoTabHarness();
  const gate = deferred();
  const hold = harness.locks.request(ORIGIN_LOCK, { mode: 'exclusive' }, () => gate.promise);
  const barrier = deferred();
  const tab = harness.makeTab('barrier', barrier.promise);

  const run = tab.runtime.perform(tab.transport);
  assert.equal(tab.state.locked, true, 'the tab is concealed before its origin-lock request can run');
  assert.equal(harness.localStorage.getItem(wipeApi.GUARD_KEY), null,
    'shared state is unchanged while another lock holder owns the origin transition');

  gate.resolve();
  await hold;
  await until(() => wipeApi.readGuard(harness.localStorage)?.status === 'verified', 'verified guard before persistence settles');
  assert.equal(harness.bus.pending('revoke-wipe-start'), 1);
  assert.equal(harness.wipeCount, 0);
  assert.equal(tab.state.acknowledgements || 0, 0);

  barrier.resolve();
  await run;
  assert.equal(wipeApi.readGuard(harness.localStorage).status, 'complete');
  assert.equal(harness.wipeCount, 1);
  assert.equal(tab.state.acknowledgements, 1);
});
