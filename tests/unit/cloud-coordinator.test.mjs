import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const app = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const source = name => extractFunction(app, name).body;

test('automatic backup controls require independent session credentials and explicit opt-in', () => {
  const meta = { autoBackup: { enabled: false, frequency: 'daily' } };
  const runtime = { backupPassphrase: '' };
  let scheduled = 0;
  const set = new Function('sutraCloudRuntime', 'loadSutraCloudMeta', 'getActiveSutraCloudProvider',
    'persistSutraCloudMeta', 'updateSutraCloudUi', 'maybeSutraCloudAutoBackup', `
      let sutraCloudAutoTimer = null;
      ${source('normalizeSutraCloudDailyTime')}
      ${source('setSutraCloudAutoBackup')}
      return setSutraCloudAutoBackup;
    `)(runtime, () => meta, () => ({ supportsAutoBackup: true, getSetupStatus: () => ({ ready: true }) }),
      () => {}, () => {}, () => scheduled++);
  assert.throws(() => set({ enabled: true }), /encrypted backup first/);
  assert.equal(meta.autoBackup.enabled, false);
  assert.equal(scheduled, 0);
  runtime.backupPassphrase = 'separate-backup-password';
  const enabled = set({ enabled: true });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.frequency, 'daily');
  assert.equal(enabled.dailyTime, '20:00');
  assert.ok(Number.isFinite(Date.parse(enabled.dailyScheduleStartedAt)));
  assert.equal(scheduled, 1);
  assert.throws(() => set({ enabled: true, frequency: 'invalid' }), /Unknown/);
  runtime.backupPassphrase = '';
  assert.equal(set({ enabled: false, frequency: 'close' }).enabled, false);
  assert.equal(meta.autoBackup.frequency, 'close');
  assert.equal(scheduled, 1, 'disabling requires no password and schedules no work');
  set({ dailyTime: '06:45' });
  assert.equal(meta.autoBackup.dailyTime, '06:45', 'time can be prepared while disabled');
  assert.equal(meta.autoBackup.enabled, false, 'editing a time does not opt in');
  assert.throws(() => set({ dailyTime: '24:00' }), /valid backup time/);
  assert.throws(() => set({ dailyTime: '' }), /valid backup time/);
});

test('Cloud metadata upgrades in place without losing unknown fields or enabling backups', () => {
  for (const old of [null, { deviceId: 'legacy', extra: { keep: true }, autoBackup: { enabled: false, frequency: 'unexpected' } },
    { deviceId: 'enabled', autoBackup: { enabled: true, frequency: 'close', future: 3 } }]) {
    let value = old;
    let writes = 0;
    const storage = { get: () => value, set: (_key, next) => { value = structuredClone(next); writes++; } };
    const read = new Function('SutraSafeStorage', 'randomSutraId', `
      const SUTRA_CLOUD_META_KEY = 'sutra:supabaseCloud:v1';
      let sutraCloudMeta = null;
      ${source('normalizeSutraCloudDailyTime')}
      ${source('getDefaultSutraCloudMeta')}
      ${source('persistSutraCloudMeta')}
      ${source('loadSutraCloudMeta')}
      return () => { sutraCloudMeta = null; return loadSutraCloudMeta(); };
    `)(storage, () => 'new-device');
    const migrated = read();
    assert.equal(migrated.schemaVersion, 3);
    assert.equal(migrated.autoBackup.dailyTime, '20:00');
    assert.equal(migrated.autoBackup.enabled, old?.autoBackup?.enabled === true);
    assert.equal(migrated.autoBackup.frequency, old?.autoBackup?.frequency === 'close' ? 'close' : 'daily');
    if (old?.extra) assert.deepEqual(migrated.extra, old.extra);
    if (old?.autoBackup?.future) assert.equal(migrated.autoBackup.future, 3);
    assert.deepEqual(read(), migrated);
    assert.equal(writes, 1, 'migration is idempotent');
  }
});

test('Cloud status keeps local save, locked Sync and backup failures independent', () => {
  const status = new Function('getSutraSyncStatus', 'loadSutraCloudMeta', 'getActiveSutraCloudProvider',
    'sutraPersistenceState', 'sutraCloudRuntime', 'navigator', 'persistenceWritesBlocked',
    'appSettings', 'sutraSyncStateLabel', source('getSutraCloudStatus') + '; return getSutraCloudStatus;')(
      () => ({ state: 'locked', enabled: true, outboxDepth: 2 }),
      () => ({ autoBackup: { enabled: false, frequency: 'daily' }, lastError: 'Upload failed' }),
      () => ({ id: 'supabase' }), { lastConfirmedSaveAt: '2026-09-15' }, {},
      { onLine: true }, false, {}, state => state
    )();
  assert.equal(status.local.savedAt, '2026-09-15');
  assert.equal(status.local.error, null);
  assert.equal(status.sync.state, 'locked');
  assert.equal(status.sync.outboxDepth, 2);
  assert.equal(status.backups.error, 'Upload failed');
  assert.equal(status.backups.lastBackupAt, null);
});

test('automatic backup status exposes blocked readiness and unchanged checks without claiming an upload', () => {
  const runtime = { backupPassphrase: 'session-only-password' };
  const meta = { autoBackup: { enabled: true, frequency: 'daily' }, lastAutoBackupCheckAt: '2026-10-11T11:16:00.000Z' };
  const read = (ready, writesBlocked = false, remotePending = false) => new Function(
    'getSutraSyncStatus', 'loadSutraCloudMeta', 'getActiveSutraCloudProvider', 'sutraPersistenceState',
    'sutraCloudRuntime', 'navigator', 'persistenceWritesBlocked', 'sutraRemoteCommitPending', 'appSettings', 'sutraSyncStateLabel',
    source('getSutraCloudStatus') + '; return getSutraCloudStatus;'
  )(() => ({ state: 'off' }), () => meta,
    () => ({ id: 'supabase', supportsAutoBackup: true, getSetupStatus: () => ({ ready }) }),
    {}, runtime, { onLine: true, locks: {} }, writesBlocked, remotePending, {}, state => state)().backups;
  assert.match(read(false).state, /connect the backup destination/);
  assert.match(read(true, true).state, /local saving needs attention/);
  assert.match(read(true, false, true).state, /workspace changes to finish/);
  const ready = read(true);
  assert.equal(ready.state, 'Automatic backups on');
  assert.equal(ready.lastAutoBackupCheckAt, meta.lastAutoBackupCheckAt);
  assert.equal(ready.lastAutoBackupAt, null);
  assert.equal(ready.lastBackupAt, null);
});
