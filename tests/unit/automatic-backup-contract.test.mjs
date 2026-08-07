import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const app = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../Sutra.html', import.meta.url), 'utf8');

// Wrapper pattern: new Function(stubNames..., body; return NAME) returns the
// inner function when the wrapper is CALLED with the stubs. Mirrors
// review-purge-contract.test.mjs: run(stub...)(data...).
function loadAppFunction(name, stubNames) {
  const extract = extractFunction(app, name);
  assert.ok(extract, `${name} must be a top-level declaration`);
  return new Function(...stubNames, `${extract.body}; return ${name};`);
}

function readyProvider() {
  return { supportsAutoBackup: true, getSetupStatus: () => ({ ready: true }) };
}

test('auto-backup fires only when every opt-in condition holds', () => {
  const sutraCloudAutoReady = loadAppFunction('sutraCloudAutoReady', ['loadSutraCloudMeta', 'getActiveSutraCloudProvider', 'sutraCloudRuntime']);
  const run = (meta, provider, runtime) => sutraCloudAutoReady(() => meta, () => provider, runtime)();
  assert.equal(run({ autoBackup: { enabled: true } }, readyProvider(), { backupPassphrase: 'session-key' }), true);
  assert.equal(run({ autoBackup: { enabled: false } }, readyProvider(), { backupPassphrase: 'session-key' }), false, 'toggle off stops auto-backup');
  assert.equal(run({ autoBackup: { enabled: true } }, readyProvider(), {}), false, 'no session passphrase means no auto-backup');
  assert.equal(run({ autoBackup: { enabled: true } }, { supportsAutoBackup: true, getSetupStatus: () => ({ ready: false }) }, { backupPassphrase: 'x' }), false, 'unready provider stops auto-backup');
  assert.equal(run({ autoBackup: { enabled: true } }, { supportsAutoBackup: false, getSetupStatus: () => ({ ready: true }) }, { backupPassphrase: 'x' }), false, 'provider without auto-backup support is excluded');
  assert.ok(extractFunction(app, 'sutraCloudAutoReady').body.includes('backupPassphrase'), 'the session-only passphrase gate is part of the readiness check');
});

test('auto-backup respects frequency: close-only, daily window, and change scheduling', () => {
  const maybe = loadAppFunction('maybeSutraCloudAutoBackup', ['sutraCloudAutoReady', 'loadSutraCloudMeta', 'runSutraCloudAutoBackup', 'scheduleSutraCloudAutoBackup']);
  const run = (ready, meta, reason) => {
    const calls = { run: 0, schedule: 0 };
    maybe(() => ready, () => meta, () => { calls.run += 1; }, () => { calls.schedule += 1; })(reason);
    return calls;
  };

  let calls = run(true, { autoBackup: { frequency: 'close' } }, 'hidden');
  assert.equal(calls.run, 1, 'close mode runs when the tab hides');
  assert.equal(calls.schedule, 0);
  calls = run(true, { autoBackup: { frequency: 'close' } }, 'change');
  assert.equal(calls.run, 0, 'close mode never runs on change');
  assert.equal(calls.schedule, 0);

  calls = run(true, { autoBackup: { frequency: 'daily' }, lastAutoBackupAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() }, 'change');
  assert.equal(calls.schedule, 0, 'daily mode skips within the ~once-per-day window');
  calls = run(true, { autoBackup: { frequency: 'daily' }, lastAutoBackupAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }, 'change');
  assert.equal(calls.schedule, 1, 'daily mode schedules after the window');
  calls = run(true, { autoBackup: { frequency: 'daily' } }, 'change');
  assert.equal(calls.schedule, 1, 'daily mode schedules when never backed up');
  calls = run(false, { autoBackup: { frequency: 'daily' } }, 'change');
  assert.equal(calls.schedule, 0, 'not ready never schedules');
  calls = run(true, { autoBackup: { frequency: 'daily' } }, 'hidden');
  assert.equal(calls.schedule, 0, 'hidden events never schedule a debounced upload');
});

test('runSutraCloudAutoBackup is single-flight and passes the session passphrase', async () => {
  const runBackup = loadAppFunction('runSutraCloudAutoBackup', ['sutraCloudAutoReady', 'sutraCloudRuntime', 'sutraCloudBackupNow', 'refreshSutraCloudBackupList']);
  const attempts = [];
  const backupNow = (opts) => { attempts.push(opts); return Promise.resolve(); };
  let refreshCalls = 0;
  await runBackup(() => false, { backupPassphrase: 'x' }, backupNow, () => { refreshCalls += 1; })();
  assert.equal(attempts.length, 0, 'not ready never uploads');
  await runBackup(() => true, { backupPassphrase: 'session-key', busy: false }, backupNow, () => { refreshCalls += 1; })();
  assert.deepEqual(attempts[0], { passphrase: 'session-key', auto: true, silent: true, label: 'Auto backup' });
  assert.equal(refreshCalls, 1, 'list refreshes after a successful auto-backup');
  let busyCalls = 0;
  await runBackup(() => true, { backupPassphrase: 'x', busy: true }, () => { busyCalls += 1; return Promise.resolve(); }, () => {})();
  assert.equal(busyCalls, 0, 'busy runtime skips the cycle (single-flight)');
});

test('folder backup is gated on picker support and explains the permission', () => {
  const supported = extractFunction(app, 'sutraFsSupported');
  assert.ok(supported, 'sutraFsSupported is a top-level declaration');
  assert.ok(supported.body.includes("typeof window.showDirectoryPicker === 'function'"), 'picker availability is type-checked');
  const choose = extractFunction(app, 'chooseSutraBackupFolder');
  assert.ok(choose, 'chooseSutraBackupFolder is a top-level declaration');
  assert.ok(choose.body.includes('sutraFsSupported()'), 'the chooser gates on the capability check first');
  assert.ok(choose.body.includes('showDirectoryPicker({'), 'the picker is invoked with the canonical directory id');
  const saveNow = extractFunction(app, 'saveSutraBackupNow');
  assert.ok(saveNow, 'saveSutraBackupNow is a top-level declaration');
  assert.match(saveNow.body, /Folder permission is required to save a backup/);
});

test('local saving never blocks on Sync, and Sync never throws from the save hook', () => {
  const hook = app.indexOf("notifySutraSyncLocalSave(reason, summary)");
  assert.ok(hook >= 0, 'the save hook calls Sutra Sync');
  const guarded = app.slice(hook - 200, hook + 300);
  assert.ok(guarded.includes('try {'), 'the sync call is wrapped in try/catch');
  assert.match(guarded, /Sutra Sync must never block local saving/);
  const notify = extractFunction(app, 'notifySutraSyncLocalSave');
  assert.ok(notify, 'notifySutraSyncLocalSave is a top-level declaration');
  assert.ok(notify.body.includes('engine.noteLocalChange()'), 'the hook notifies the engine');
  assert.ok(notify.body.includes('sutraSyncApplyingRemote'), 'remote applies never echo into local-change tracking');
});

test('auto-backup and folder controls stay explicit in Settings', () => {
  assert.match(shell, /Auto-backup \(optional, off by default\)/);
  assert.match(shell, /Choose default backup folder/);
});
