import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const app = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

function triggerHarness({ hidden = false } = {}) {
  const calls = [];
  const windowListeners = new Map();
  const documentListeners = new Map();
  const intervals = [];
  const runtime = {
    triggersInstalled: false,
    engine: { noteLocalChange: () => calls.push('sync') }
  };
  const window = {
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    }
  };
  const document = {
    hidden,
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    }
  };
  const setInterval = (callback, delay) => {
    const interval = { callback, delay };
    intervals.push(interval);
    return intervals.length;
  };
  const declaration = extractFunction(app, 'installSutraSyncBackgroundTriggers');
  assert.ok(declaration, 'Sync trigger installer exists');
  const install = new Function('sutraSyncRuntime', 'window', 'document', 'setInterval', `
    ${declaration.body}
    return installSutraSyncBackgroundTriggers;
  `)(runtime, window, document, setInterval);

  return {
    calls,
    runtime,
    document,
    windowListeners,
    documentListeners,
    intervals,
    install,
    fireWindow(type) { (windowListeners.get(type) || []).forEach(listener => listener()); },
    fireDocument(type) { (documentListeners.get(type) || []).forEach(listener => listener()); }
  };
}

function changeBackupHarness({ ready = true, frequency = 'change', run } = {}) {
  const timers = [];
  let nextTimerId = 1;
  const meta = { autoBackup: { frequency } };
  const setTimeout = (callback, delay) => {
    const timer = { id: nextTimerId++, callback, delay, cleared: false, fired: false };
    timers.push(timer);
    return timer.id;
  };
  const clearTimeout = id => {
    const timer = timers.find(item => item.id === id);
    if (timer) timer.cleared = true;
  };
  const declaration = extractFunction(app, 'scheduleSutraCloudAutoBackup');
  assert.ok(declaration, 'change backup scheduler exists');
  const scheduler = new Function(
    'sutraCloudAutoReady', 'loadSutraCloudMeta', 'runSutraCloudAutoBackup', 'setTimeout', 'clearTimeout',
    `
      let sutraCloudAutoTimer = null;
      ${declaration.body}
      return {
        schedule: scheduleSutraCloudAutoBackup,
        getTimer: () => sutraCloudAutoTimer
      };
    `
  )(() => ready, () => meta, run || (async () => ({ skipped: true, reason: 'busy' })), setTimeout, clearTimeout);

  return {
    meta,
    timers,
    schedule: scheduler.schedule,
    getTimer: scheduler.getTimer,
    async fire(timerOrId) {
      const timer = typeof timerOrId === 'object'
        ? timerOrId
        : timers.find(item => item.id === timerOrId);
      assert.ok(timer && !timer.cleared, 'cannot fire a cleared timer');
      timer.fired = true;
      return timer.callback();
    },
    activeTimers() { return timers.filter(timer => !timer.cleared && !timer.fired); }
  };
}

test('Sync polling is foreground-only, interval triggers install once, and returning to the app syncs', () => {
  const h = triggerHarness();
  h.install();
  h.install();

  assert.equal(h.runtime.triggersInstalled, true);
  assert.equal(h.windowListeners.get('online').length, 1, 'online listener installs once');
  assert.equal(h.documentListeners.get('visibilitychange').length, 1, 'visibility listener installs once');
  assert.equal(h.intervals.length, 1, 'foreground poll installs once');
  assert.equal(h.intervals[0].delay, 2 * 60 * 1000, 'foreground poll runs every two minutes');

  h.document.hidden = true;
  h.intervals[0].callback();
  assert.equal(h.calls.length, 0, 'hidden tabs do not poll');
  h.fireDocument('visibilitychange');
  assert.equal(h.calls.length, 0, 'hidden visibility changes do not start a cycle');

  h.document.hidden = false;
  h.fireDocument('visibilitychange');
  h.intervals[0].callback();
  assert.deepEqual(h.calls, ['sync', 'sync'], 'foreground return and poll both notify the engine');
});

test('online and visibility triggers are safe after the engine is cleared', () => {
  const h = triggerHarness();
  h.install();

  h.fireWindow('online');
  h.document.hidden = false;
  h.fireDocument('visibilitychange');
  assert.deepEqual(h.calls, ['sync', 'sync']);

  h.runtime.engine = null;
  assert.doesNotThrow(() => h.fireWindow('online'));
  assert.doesNotThrow(() => h.fireDocument('visibilitychange'));
  assert.doesNotThrow(() => h.intervals[0].callback());
  assert.deepEqual(h.calls, ['sync', 'sync'], 'cleared engine receives no calls');
});

test('change backup retries only a transient busy or lock-held attempt after one minute', async () => {
  for (const reason of ['busy', 'lock-held']) {
    const h = changeBackupHarness({ run: async () => ({ skipped: true, reason }) });
    h.schedule();
    const first = h.getTimer();
    assert.equal(h.timers[0].delay, 60000);

    await h.fire(first);

    assert.equal(h.activeTimers().length, 1, `${reason} schedules one retry`);
    assert.equal(h.activeTimers()[0].delay, 60000, `${reason} retry is rate-limited to one minute`);
  }
});

test('change backup completes after a transient busy retry without leaving a timer', async () => {
  let calls = 0;
  const h = changeBackupHarness({
    run: async () => {
      calls += 1;
      return calls === 1 ? { skipped: true, reason: 'busy' } : { uploaded: true };
    }
  });

  h.schedule();
  await h.fire(h.getTimer());
  const retry = h.getTimer();
  assert.equal(h.timers.find(timer => timer.id === retry).delay, 60000);

  await h.fire(retry);

  assert.equal(calls, 2, 'the backup runs again after the transient contention clears');
  assert.equal(h.getTimer(), null, 'completed backup leaves no scheduled retry');
  assert.equal(h.activeTimers().length, 0);
});

test('change backup leaves a newer pending timer intact when an older attempt returns busy', async () => {
  let resolveAttempt;
  const h = changeBackupHarness({
    run: () => new Promise(resolve => { resolveAttempt = resolve; })
  });
  h.schedule();
  const first = h.getTimer();
  const running = h.fire(first);

  h.schedule(2500);
  const newer = h.getTimer();
  resolveAttempt({ skipped: true, reason: 'busy' });
  await running;

  assert.equal(h.getTimer(), newer, 'the newer save schedule remains current');
  assert.equal(h.activeTimers().length, 1);
  assert.equal(h.activeTimers()[0].delay, 2500, 'the old attempt does not replace it with a retry');
});

test('disabled, stale, unchanged, and failed change schedules do not re-arm', async t => {
  const cases = [
    { name: 'disabled readiness', ready: false, frequency: 'change', result: { skipped: true, reason: 'busy' } },
    { name: 'schedule changed', ready: true, frequency: 'daily', result: { skipped: true, reason: 'busy' } },
    { name: 'unchanged workspace', ready: true, frequency: 'change', result: { skipped: true, reason: 'unchanged' } },
    { name: 'schedule changed result', ready: true, frequency: 'change', result: { skipped: true, reason: 'schedule-changed' } },
    { name: 'reported error', ready: true, frequency: 'change', result: { error: true } }
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const h = changeBackupHarness({
        ready: scenario.ready,
        frequency: scenario.frequency,
        run: async () => scenario.result
      });
      h.schedule();
      await h.fire(h.getTimer());
      assert.equal(h.activeTimers().length, 0, 'no retry is scheduled');
    });
  }
});

test('a rejected change-backup attempt does not create a retry loop', async () => {
  const h = changeBackupHarness({ run: async () => { throw new Error('provider failure'); } });
  h.schedule();
  await assert.rejects(h.fire(h.getTimer()), /provider failure/);
  assert.equal(h.activeTimers().length, 0);
});
