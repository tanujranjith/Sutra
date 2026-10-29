import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const coordinatorApi = require('../../src/persistence/workspace-coordinator.js');
const migrationSource = readFileSync(new URL('../../src/boot/legacy-workspace-migration.js', import.meta.url), 'utf8');

class FakeChannel {
  static channels = new Map();

  constructor(name) {
    this.name = name;
    this.listeners = new Set();
    const peers = FakeChannel.channels.get(name) || new Set();
    peers.add(this);
    FakeChannel.channels.set(name, peers);
  }

  addEventListener(type, listener) { if (type === 'message') this.listeners.add(listener); }
  removeEventListener(type, listener) { if (type === 'message') this.listeners.delete(listener); }

  postMessage(data) {
    for (const peer of FakeChannel.channels.get(this.name) || []) {
      if (peer === this) continue;
      for (const listener of peer.listeners) listener({ data: JSON.parse(JSON.stringify(data)) });
    }
  }

  close() { (FakeChannel.channels.get(this.name) || new Set()).delete(this); }
}

function copy(value) {
  return value === null || value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function defaultLifeWorkspace() {
  return {
    onboardingSeeded: false,
    goals: [], habits: [], habitCompletions: {}, habitExcused: {}, skills: [],
    fitness: [], calories: [], books: [], spending: [], spendingBudgets: {},
    recurringExpenses: [], journals: [],
    sleepTracker: { targetSleepMinutes: 480, entries: [] },
    wellness: {
      checkIns: [], journalEntries: [],
      breathing: {
        preferredPattern: 'calm-focus', preferredDuration: 120, reducedMotion: false,
        soundEnabled: false, ambientSound: 'off', breathingCuesEnabled: false,
        volume: 0.35, muted: false, sessionsCompleted: 0, lastCompletedAt: null
      }
    }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function makeRuntime({ records = {}, pauseInitialReads = false, beforeLock = null, failReadKey = '', failWriteIf = false } = {}) {
  FakeChannel.channels.clear();
  const rows = new Map(Object.entries(records).map(([key, value]) => [key, copy(value)]));
  const lockCalls = [];
  const createOptions = [];
  const writeIfCalls = [];
  const directRootWrites = [];
  const gate = pauseInitialReads ? { observed: deferred(), release: deferred(), seen: new Set() } : null;
  let nextTabId = 0;

  const locks = {
    async request(name, options, work) {
      lockCalls.push({ name, options });
      if (beforeLock) await beforeLock(rows);
      return work();
    }
  };

  const fakeDbApi = {
    create(options) {
      const config = options || {};
      createOptions.push(config);
      return {
        async read(key) {
          if (String(key) === failReadKey) throw new Error('simulated canonical root read failure');
          const value = copy(rows.has(String(key)) ? rows.get(String(key)) : null);
          if (gate && ['root', 'workspace-last-meaningful', 'workspace-confirmed-root'].includes(String(key))
              && !gate.seen.has(String(key))) {
            gate.seen.add(String(key));
            if (gate.seen.size === 3) gate.observed.resolve();
            await gate.release.promise;
          }
          return value;
        },
        async write(key, value) {
          if (String(key) === 'root') directRootWrites.push(copy(value));
          rows.set(String(key), copy(value));
        },
        async writeIf(key, value, predicate) {
          if (failWriteIf) throw new Error('simulated conditional root write failure');
          const current = copy(rows.has(String(key)) ? rows.get(String(key)) : null);
          writeIfCalls.push({ key: String(key), value: copy(value), current: copy(current) });
          const accepted = typeof predicate === 'function' && predicate(copy(current)) === true;
          if (!accepted) return { written: false, current };

          if (config.backupKey && config.backupKey !== String(key)
              && typeof config.shouldBackup === 'function'
              && config.shouldBackup(current, value, key) === true) {
            rows.set(String(config.backupKey), copy(current));
          }
          if (config.commitKey && config.commitKey !== String(key)
              && typeof config.buildCommit === 'function') {
            const marker = config.buildCommit(current, value, key);
            if (marker !== undefined) rows.set(String(config.commitKey), copy(marker));
          }
          rows.set(String(key), copy(value));
          return { written: true, current };
        },
        close() {}
      };
    }
  };

  const fakeCoordinatorApi = {
    hashRecord: coordinatorApi.hashRecord,
    create(options) {
      nextTabId += 1;
      return coordinatorApi.create({
        ...options,
        locks,
        BroadcastChannel: FakeChannel,
        tabId: `boot-${nextTabId}`
      });
    }
  };
  const context = {
    console: { warn() {}, error() {}, log() {} },
    Date,
    Promise,
    Set,
    SutraWorkspaceDB: fakeDbApi,
    SutraWorkspaceCoordinator: fakeCoordinatorApi,
    localStorage: { getItem() { return null; } }
  };
  context.window = context;
  context.globalThis = context;
  const sandbox = vm.createContext(context);

  return {
    rows,
    lockCalls,
    createOptions,
    writeIfCalls,
    directRootWrites,
    gate,
    context,
    run() { vm.runInContext(migrationSource, sandbox, { filename: 'src/boot/legacy-workspace-migration.js' }); },
    async waitForMigration() {
      const adapter = context.SutraWorkspaceDB.create({ dbName: 'noteflow_atelier_db', storeName: 'workspace', version: 8 });
      return adapter.read('root');
    }
  };
}

function attachExistingTab(received) {
  return coordinatorApi.create({
    locks: null,
    BroadcastChannel: FakeChannel,
    tabId: 'existing-tab',
    onRemoteCommit: detail => received.push(detail)
  });
}

test('a newer canonical plan arriving after migration read is preserved when its CAS loses', async () => {
  const initial = {
    pages: [{ id: 'existing-page', title: 'Existing' }],
    settings: {}
  };
  const runtime = makeRuntime({ records: { root: initial }, pauseInitialReads: true });
  const notifications = [];
  const existingTab = attachExistingTab(notifications);
  runtime.run();

  await runtime.gate.observed.promise;
  const newer = {
    ...initial,
    timeBlocks: [{ id: 'plan-block-1', title: 'Chemistry plan' }]
  };
  runtime.rows.set('root', copy(newer));
  runtime.gate.release.resolve();

  const loaded = await runtime.waitForMigration();
  assert.deepEqual(loaded, newer);
  assert.equal(runtime.writeIfCalls.length, 1);
  assert.equal(runtime.writeIfCalls[0].value.timeBlocks, undefined, 'the derived candidate was based on the earlier root');
  assert.deepEqual(runtime.directRootWrites, []);
  assert.equal(notifications.length, 0, 'a declined stale migration does not publish a commit');
  assert.deepEqual(runtime.lockCalls, [{ name: 'sutra-workspace-write-v1', options: { mode: 'exclusive' } }]);
  existingTab.close();
});

test('a root that appears before empty-root recovery wins without stale resurrection', async () => {
  const journal = {
    pages: [{ id: 'recovery-page', title: 'Older copy' }],
    pluginOwnedFutureField: { keep: true }
  };
  const runtime = makeRuntime({
    records: { 'workspace-last-meaningful': journal },
    pauseInitialReads: true
  });
  const notifications = [];
  const existingTab = attachExistingTab(notifications);
  runtime.run();

  await runtime.gate.observed.promise;
  const current = {
    pages: [{ id: 'new-page', title: 'Newer copy' }],
    timeBlocks: [{ id: 'new-plan' }]
  };
  runtime.rows.set('root', copy(current));
  runtime.gate.release.resolve();

  const loaded = await runtime.waitForMigration();
  assert.deepEqual(loaded, current);
  assert.equal(runtime.rows.has('workspace-empty-before-recovery'), false);
  assert.equal(notifications.length, 0);
  existingTab.close();
});

test('boot migration reads the latest root only after acquiring the shared writer lock', async () => {
  const prior = { pages: [{ id: 'existing-page' }], settings: {} };
  const current = {
    pages: [{ id: 'existing-page' }],
    timeBlocks: [{ id: 'plan-block-1' }],
    settings: { onboarding: { completed: true } }
  };
  const runtime = makeRuntime({
    records: { root: prior },
    beforeLock(rows) { rows.set('root', copy(current)); }
  });
  runtime.run();

  const loaded = await runtime.waitForMigration();
  assert.deepEqual(loaded, current);
  assert.deepEqual(runtime.lockCalls, [{ name: 'sutra-workspace-write-v1', options: { mode: 'exclusive' } }]);
  assert.equal(runtime.writeIfCalls.length, 0);
});

test('accepted recovery journals the displaced root, preserves unknown fields, and notifies exactly once', async () => {
  const emptyRoot = { pages: [] };
  const journal = {
    pages: [{ id: 'recovery-page', title: 'Recovered page' }],
    pluginOwnedFutureField: { keep: true }
  };
  const runtime = makeRuntime({ records: { root: emptyRoot, 'workspace-last-meaningful': journal } });
  const notifications = [];
  const existingTab = attachExistingTab(notifications);
  runtime.run();

  const recovered = await runtime.waitForMigration();
  assert.equal(recovered.pages[0].id, 'recovery-page');
  assert.deepEqual(recovered.pluginOwnedFutureField, { keep: true });
  assert.deepEqual(runtime.rows.get('workspace-empty-before-recovery'), emptyRoot);
  assert.equal(runtime.rows.get('workspace-confirmed-root').meaningful, true);
  assert.equal(runtime.writeIfCalls.length, 1);
  assert.deepEqual(runtime.directRootWrites, []);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].reason, 'boot-workspace-recovery');
  assert.equal(notifications[0].hash, coordinatorApi.hashRecord(recovered));
  assert.equal(runtime.lockCalls.length, 1);
  assert.equal(runtime.lockCalls[0].name, 'sutra-workspace-write-v1');
  assert.equal(runtime.createOptions.filter(options => options.backupKey === 'workspace-empty-before-recovery').length, 1);
  existingTab.close();
});

test('onboarding-only repair journals the prior meaningful root', async () => {
  const prior = {
    pages: [{ id: 'meaningful-page', title: 'Keep this page' }],
    timeBlocks: [{ id: 'existing-plan' }],
    pluginOwnedFutureField: { keep: true },
    settings: { onboarding: { completed: false } }
  };
  const runtime = makeRuntime({
    records: {
      root: prior,
      'workspace-last-meaningful': { pages: [{ id: 'older-journal-page' }] }
    }
  });
  const notifications = [];
  const existingTab = attachExistingTab(notifications);
  runtime.run();

  const repaired = await runtime.waitForMigration();
  assert.equal(repaired.settings.onboarding.completed, true);
  assert.deepEqual(repaired.timeBlocks, prior.timeBlocks);
  assert.deepEqual(repaired.pluginOwnedFutureField, prior.pluginOwnedFutureField);
  assert.deepEqual(runtime.rows.get('workspace-last-meaningful'), prior);
  assert.equal(runtime.rows.has('workspace-empty-before-recovery'), false);
  assert.equal(runtime.rows.get('workspace-confirmed-root').meaningful, true);
  assert.equal(runtime.createOptions[1].backupKey, 'workspace-last-meaningful');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].reason, 'boot-onboarding-repair');
  assert.equal(notifications[0].hash, coordinatorApi.hashRecord(repaired));
  existingTab.close();
});

test('canonical workspace writes keep recovery journaling when the default store name is omitted', async () => {
  const prior = {
    pages: [{ id: 'confirmed-page', title: 'Keep this page' }],
    settings: { onboarding: { version: 1, completed: true, skipped: false, migratedFromLegacy: true } }
  };
  const empty = {
    pages: [],
    settings: { onboarding: { version: 1, completed: true, skipped: false, migratedFromLegacy: true } }
  };

  for (const includeStoreName of [true, false]) {
    const runtime = makeRuntime({ records: { root: prior } });
    runtime.run();
    await runtime.waitForMigration();

    const options = { dbName: 'noteflow_atelier_db', version: 8 };
    if (includeStoreName) options.storeName = 'workspace';
    const db = runtime.context.SutraWorkspaceDB.create(options);
    const result = await db.writeIf('root', empty, current => Array.isArray(current?.pages)
      && current.pages.some(page => page.id === 'confirmed-page'));

    assert.equal(result.written, true);
    assert.deepEqual(runtime.rows.get('workspace-last-meaningful'), prior,
      `the previous root remains journaled with ${includeStoreName ? 'an explicit' : 'the default'} store name`);
    assert.equal(runtime.rows.get('workspace-confirmed-root').meaningful, false);
  }
});

test('startup-created empty day states do not replace the journal after a confirmed empty save', async () => {
  const helpPage = { id: 'help_page', title: 'Help & Docs', isSystemPage: true };
  const prior = {
    pages: [{ id: 'kept-page', title: 'Keep this page' }, helpPage],
    settings: { onboarding: { version: 1, completed: true, skipped: false, migratedFromLegacy: true } }
  };
  const empty = { pages: [] };
  const runtime = makeRuntime({ records: { root: prior } });
  runtime.run();
  await runtime.waitForMigration();

  const db = runtime.context.SutraWorkspaceDB.create({ dbName: 'noteflow_atelier_db', storeName: 'workspace', version: 8 });
  const clearResult = await db.writeIf('root', empty, current => current?.pages?.some(page => page.id === 'kept-page'));
  assert.equal(clearResult.written, true);
  assert.deepEqual(runtime.rows.get('workspace-last-meaningful'), prior);
  assert.equal(runtime.rows.get('workspace-confirmed-root').meaningful, false);

  const runtimeHydratedRoot = {
    pages: [helpPage],
    streaks: {
      dayStates: { '2026-10-28': { committedTaskIds: [], completedTaskIds: [], freezeUsed: false } },
      taskStreaks: []
    },
    habitTracker: { habits: [], dayStates: { '2026-10-28': { completedHabitIds: [] } } }
  };
  assert.equal((await db.writeIf('root', runtimeHydratedRoot, current => current === null || current.pages?.length === 0)).written, true);
  assert.equal((await db.writeIf('root', runtimeHydratedRoot, current => current?.pages?.some(page => page.id === 'help_page'))).written, true);

  assert.deepEqual(runtime.rows.get('workspace-last-meaningful'), prior,
    'repeated startup saves of the Help-only root must not replace the previous meaningful workspace');
  assert.equal(runtime.rows.get('workspace-confirmed-root').meaningful, false,
    'default per-day records keep the confirmed-root marker empty');
  db.close();
});

test('populated day-state fields and unknown day-state fields remain meaningful', async () => {
  const helpPage = { id: 'help_page', title: 'Help & Docs', isSystemPage: true };
  const meaningfulDayStates = [
    ['committed tasks', { streaks: { dayStates: { '2026-10-28': { committedTaskIds: ['task-1'], completedTaskIds: [], freezeUsed: false } } } }],
    ['completed tasks', { streaks: { dayStates: { '2026-10-28': { committedTaskIds: [], completedTaskIds: ['task-1'], freezeUsed: false } } } }],
    ['used freeze', { streaks: { dayStates: { '2026-10-28': { committedTaskIds: [], completedTaskIds: [], freezeUsed: true } } } }],
    ['completed habits', { habitTracker: { dayStates: { '2026-10-28': { completedHabitIds: ['habit-1'] } } } }],
    ['unknown future field', { streaks: { dayStates: { '2026-10-28': { committedTaskIds: [], completedTaskIds: [], freezeUsed: false, futureDayValue: false } } } }]
  ];

  for (const [name, patch] of meaningfulDayStates) {
    const root = { pages: [helpPage], ...patch };
    const runtime = makeRuntime({ records: {
      root,
      'workspace-last-meaningful': { pages: [{ id: 'older-page', title: 'Older recovery candidate' }] }
    } });
    runtime.run();

    assert.deepEqual(await runtime.waitForMigration(), root, `${name} must remain part of the workspace`);
    assert.equal(runtime.writeIfCalls.length, 0, `${name} must prevent empty-root recovery`);
  }
});

test('a confirmed empty workspace is not replaced by an older recovery journal', async () => {
  const emptyRoot = { pages: [] };
  const runtime = makeRuntime({
    records: {
      root: emptyRoot,
      'workspace-last-meaningful': { pages: [{ id: 'older-page' }] },
      'workspace-confirmed-root': { version: 1, meaningful: false, confirmedAt: '2026-10-14T12:00:00.000Z' }
    }
  });
  const notifications = [];
  const existingTab = attachExistingTab(notifications);
  runtime.run();

  const loaded = await runtime.waitForMigration();
  assert.deepEqual(loaded, emptyRoot);
  assert.equal(runtime.writeIfCalls.length, 0);
  assert.equal(notifications.length, 0);
  existingTab.close();
});

test('retired Life records, preferences, history, and unknown fields prevent stale or unmarked recovery', async () => {
  const breathingDefaults = defaultLifeWorkspace().wellness.breathing;
  const legacyValues = [
    ['sleep entries', { sleepTracker: { targetSleepMinutes: 480, entries: [{ date: '2025-04-02', totalSleepMinutes: 360 }] } }],
    ['custom sleep target', { sleepTracker: { targetSleepMinutes: 420, entries: [] } }],
    ['custom breathing preference', { wellness: { checkIns: [], journalEntries: [], breathing: { ...breathingDefaults, preferredPattern: 'box' } } }],
    ['breathing session history', { wellness: { checkIns: [], journalEntries: [], breathing: { ...breathingDefaults, sessionsCompleted: 2, lastCompletedAt: '2025-04-02T09:00:00.000Z' } } }],
    ['unknown Life zero', { futureLifeValue: 0 }],
    ['unknown Life false', { futureLifeValue: false }],
    ['unknown wellness zero', { wellness: { ...defaultLifeWorkspace().wellness, futureWellnessValue: 0 } }],
    ['unknown wellness false', { wellness: { ...defaultLifeWorkspace().wellness, futureWellnessValue: false } }],
    ['unknown breathing false', { wellness: { checkIns: [], journalEntries: [], breathing: { ...breathingDefaults, futureBreathingValue: false } } }],
    ['unknown sleep zero', { sleepTracker: { targetSleepMinutes: 480, entries: [], futureSleepValue: 0 } }]
  ];
  const markerCases = [
    ['absent marker', undefined],
    ['stale marker', { version: 1, meaningful: true, confirmedAt: '2026-10-14T12:00:00.000Z' }]
  ];

  for (const [valueName, lifePatch] of legacyValues) {
    for (const [markerName, marker] of markerCases) {
      const root = {
        pages: [],
        lifeWorkspace: { ...defaultLifeWorkspace(), ...lifePatch },
        settings: { onboarding: { completed: true } }
      };
      const records = {
        root,
        'workspace-last-meaningful': { pages: [{ id: 'older-page', title: 'Older recovery candidate' }] }
      };
      if (marker) records['workspace-confirmed-root'] = marker;
      const runtime = makeRuntime({ records });
      runtime.run();

      const loaded = await runtime.waitForMigration();
      assert.deepEqual(loaded, root, `${valueName} must survive with an ${markerName}`);
      assert.equal(runtime.writeIfCalls.length, 0, `${valueName} must not trigger recovery with an ${markerName}`);
    }
  }
});

test('default sleep and breathing state remains empty for recovery selection', async () => {
  const emptyRoot = { pages: [], lifeWorkspace: defaultLifeWorkspace() };
  const runtime = makeRuntime({ records: {
    root: emptyRoot,
    'workspace-last-meaningful': { pages: [{ id: 'older-page', title: 'Older recovery candidate' }] }
  } });
  runtime.run();

  const loaded = await runtime.waitForMigration();
  assert.equal(loaded.pages[0].id, 'older-page');
  assert.deepEqual(runtime.rows.get('workspace-empty-before-recovery'), emptyRoot);
  assert.equal(runtime.rows.get('workspace-confirmed-root').meaningful, true);
  assert.equal(runtime.writeIfCalls.length, 1);
});

test('canonical root read failures reject the migration gate instead of permitting startup to assume recovery succeeded', async () => {
  const runtime = makeRuntime({ failReadKey: 'root' });
  runtime.run();

  await assert.rejects(runtime.waitForMigration(), /simulated canonical root read failure/);
  assert.equal(runtime.writeIfCalls.length, 0);
});

test('conditional root write failures reject startup and do not publish a recovery commit', async () => {
  const emptyRoot = { pages: [] };
  const runtime = makeRuntime({
    records: { root: emptyRoot, 'workspace-last-meaningful': { pages: [{ id: 'recovery-page' }] } },
    failWriteIf: true
  });
  const notifications = [];
  const existingTab = attachExistingTab(notifications);
  runtime.run();

  await assert.rejects(runtime.waitForMigration(), /simulated conditional root write failure/);
  assert.deepEqual(runtime.rows.get('root'), emptyRoot);
  assert.equal(notifications.length, 0);
  existingTab.close();
});
