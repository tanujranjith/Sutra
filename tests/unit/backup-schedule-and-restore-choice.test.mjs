import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const app = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const source = name => extractFunction(app, name).body;
const schedule = new Function(`${source('normalizeSutraCloudDailyTime')}\n${source('getSutraCloudDailySchedule')}\nreturn getSutraCloudDailySchedule;`)();
const local = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const iso = time => new Date(time).toISOString();

test('daily backup waits for the chosen time, then catches up once after a missed day', () => {
  const meta = { autoBackup: { dailyTime: '20:00', dailyScheduleStartedAt: iso(local(2, 12)) } };
  assert.equal(schedule(meta, local(2, 19, 59)).due, false);
  assert.equal(schedule(meta, local(2, 20)).due, true);
  const missed = schedule(meta, local(4, 8));
  assert.equal(missed.due, true);
  assert.equal(missed.dueAt, local(3, 20));
  assert.equal(missed.nextAt, local(4, 20));
  meta.lastAutoBackupAt = iso(local(4, 8));
  assert.equal(schedule(meta, local(4, 9)).due, false);
  assert.equal(schedule(meta, local(4, 20)).due, true);
});

test('a new schedule starts at its next occurrence; an unchanged-work check covers only that slot', () => {
  const meta = { autoBackup: { dailyTime: '09:30', dailyScheduleStartedAt: iso(local(2, 12)) } };
  assert.equal(schedule(meta, local(2, 18)).due, false);
  assert.equal(schedule(meta, local(3, 9, 30)).due, true);
  meta.lastAutoBackupCheckAt = iso(local(3, 9, 30));
  assert.equal(schedule(meta, local(3, 23)).due, false);
  assert.equal(meta.lastAutoBackupAt, undefined, 'checking unchanged work never claims a new backup');
  assert.equal(schedule(meta, local(4, 9, 30)).due, true);
});

test('midnight uses the next calendar day rather than a rolling elapsed window', () => {
  const meta = { autoBackup: { dailyTime: '00:00', dailyScheduleStartedAt: iso(local(2, 23)) } };
  assert.equal(schedule(meta, local(2, 23, 59)).due, false);
  assert.equal(schedule(meta, local(3, 0)).due, true);
  meta.lastAutoBackupAt = iso(local(3, 0));
  assert.equal(schedule(meta, local(3, 0, 1)).due, false);
});

test('safety export chooser has explicit export, skip, and cancel outcomes', async () => {
  let modal;
  const choose = new Function('document', 'openSutraModal', `async ${source('confirmPreImportSafetyExport')}; return confirmPreImportSafetyExport;`)(
    { createElement: () => ({ textContent: '' }) },
    options => { modal = options; return { result: Promise.resolve('skip') }; }
  );
  assert.equal(await choose(), 'skip');
  assert.deepEqual(modal.buttons.map(button => button.value), [false, 'skip', 'export']);
  assert.equal(modal.buttons.find(button => button.primary).value, 'export');
});

function makeRestoreFixture(scenario = {}) {
  return new Function('scenario', `
    let localWorkspaceSaveRequestRevision = Number(scenario.startRevision || 0);
    let lockActive = false;
    let imported = false;
    let persistenceWritesBlocked = false;
    let sutraRemoteCommitPending = false;
    const events = [];
    const canonicalWorkspaceHash = scenario.canonicalHash || 'root:current';
    const persistenceCommitQueue = Promise.resolve().then(() => {
      events.push('persistence-queue-drained');
      if (lockActive) throw new Error('Persistence queue was awaited while the workspace lock was held.');
    });
    const workspaceCoordinator = {
      getState: () => ({ lastRemoteCommit: scenario.remoteCommit || null }),
      async runExclusive(work) {
        events.push('lock-acquired');
        lockActive = true;
        try { return await work(); }
        finally { lockActive = false; events.push('lock-released'); }
      }
    };
    function bumpSaveRevision() { localWorkspaceSaveRequestRevision += 1; return localWorkspaceSaveRequestRevision; }
    function validateWorkspacePayloadForImport() {}
    async function confirmWorkspaceRestoreConflict() {
      events.push('conflict-confirmed');
      return scenario.conflictProceed !== false;
    }
    async function confirmPreImportSafetyExport() {
      events.push('safety-choice');
      return typeof scenario.chooseSafety === 'function'
        ? scenario.chooseSafety({ bumpSaveRevision, revision: localWorkspaceSaveRequestRevision })
        : (scenario.safetyChoice || 'skip');
    }
    async function createPreImportSafetySnapshot() {
      events.push('safety-export');
      if (typeof scenario.createSafetySnapshot === 'function') {
        return scenario.createSafetySnapshot({ bumpSaveRevision, revision: localWorkspaceSaveRequestRevision });
      }
      return scenario.snapshot || { ok: true, snapshotSaveRevision: localWorkspaceSaveRequestRevision };
    }
    async function readAppData() {
      events.push('read-head');
      if (!lockActive) throw new Error('Canonical head read was not protected by the writer lock.');
      return scenario.diskRoot || { canonicalHash: canonicalWorkspaceHash };
    }
    function hashCanonicalWorkspaceRecord(record) { return record && record.canonicalHash || null; }
    const window = {};
    const courseWorkspace = { files: scenario.files || [] };
    async function cwListStoredBlobKeys() {
      if (scenario.readbackFailure) throw new Error('Attachment readback failed');
      return scenario.storedKeys || [];
    }
    function showToast(message) { events.push('toast:' + message); }
    function importWorkspacePayload(payload, options) {
      if (!lockActive) throw new Error('Workspace replacement escaped the writer lock.');
      if (!options || options.deferSuccessToast !== true) events.push('toast:Workspace imported successfully!');
      imported = true;
      events.push('workspace-imported');
    }
    async function flushImportedAttachmentWrites() {
      if (lockActive) throw new Error('Attachment flush ran while the writer lock was held.');
      events.push('attachments-flushed');
      if (scenario.attachmentException) throw new Error('Attachment database unavailable');
      return scenario.attachmentResult || { ok: true, failed: [], total: 0 };
    }
    async function flushAppSaveNow() {
      if (lockActive) throw new Error('Workspace save was awaited while the writer lock was held.');
      events.push('workspace-save-flushed');
      if (scenario.saveFailure) throw new Error('Disk full');
    }
    function serializeWorkspace() { return { pages: [] }; }
    function isWorkspacePayload() { return true; }
    function recordPersistenceFailure(error, context) { events.push('incomplete-restore:' + context.kind); }

    async ${source('flushWorkspaceRestoreWrites')}
    async ${source('applyValidatedWorkspaceImport')}
    return {
      apply: applyValidatedWorkspaceImport,
      events,
      bumpSaveRevision,
      wasImported: () => imported,
      currentRevision: () => localWorkspaceSaveRequestRevision,
      files: courseWorkspace.files,
      lockIsActive: () => lockActive
    };
  `)(scenario);
}

test('Skip keeps the pre-dialog revision baseline and cancels if a local save arrives in the dialog', async () => {
  const fixture = makeRestoreFixture({
    startRevision: 7,
    chooseSafety: ({ bumpSaveRevision }) => {
      bumpSaveRevision();
      return 'skip';
    }
  });

  assert.equal(await fixture.apply({ pages: [] }), false);
  assert.equal(fixture.wasImported(), false);
  assert.ok(fixture.events.includes('read-head'));
});

test('successful safety export uses its payload-capture revision and catches a later save', async () => {
  const fixture = makeRestoreFixture({
    startRevision: 10,
    safetyChoice: 'export',
    createSafetySnapshot: ({ bumpSaveRevision, revision }) => {
      bumpSaveRevision(); // buildCanonicalSutraPackageBytes() flushes savePage().
      const snapshotSaveRevision = revision + 1;
      bumpSaveRevision(); // A save after fullPayload was captured is not in the safety file.
      return { ok: true, snapshotSaveRevision };
    }
  });

  assert.equal(await fixture.apply({ pages: [] }), false);
  assert.equal(fixture.wasImported(), false);
});

test('unchanged workspace applies under the writer lock and flushes only after release', async () => {
  const fixture = makeRestoreFixture({ startRevision: 4, safetyChoice: 'skip' });

  assert.equal(await fixture.apply({ pages: [] }), true);
  assert.equal(fixture.wasImported(), true);
  assert.ok(fixture.events.indexOf('lock-acquired') < fixture.events.indexOf('workspace-imported'));
  assert.ok(fixture.events.indexOf('workspace-imported') < fixture.events.indexOf('lock-released'));
  assert.ok(fixture.events.indexOf('lock-released') < fixture.events.indexOf('attachments-flushed'));
  assert.ok(fixture.events.indexOf('attachments-flushed') < fixture.events.indexOf('workspace-save-flushed'));
  assert.equal(fixture.lockIsActive(), false);
  assert.ok(fixture.events.indexOf('toast:Workspace imported successfully!') > fixture.events.indexOf('workspace-save-flushed'));
});

test('a changed canonical disk head aborts before replacing the workspace', async () => {
  const fixture = makeRestoreFixture({
    startRevision: 4,
    safetyChoice: 'skip',
    canonicalHash: 'root:loaded',
    diskRoot: { canonicalHash: 'root:other-tab' }
  });

  assert.equal(await fixture.apply({ pages: [] }), false);
  assert.equal(fixture.wasImported(), false);
  assert.ok(fixture.events.includes('lock-released'));
  assert.equal(fixture.events.includes('attachments-flushed'), false);
});

for (const scenario of [
  { attachmentResult: { ok: false, failed: ['file-one'], total: 2 } },
  { attachmentException: true },
  { saveFailure: true },
  { attachmentResult: { ok: false, failed: ['file-one'], total: 2 }, saveFailure: true },
  { files: [{ id: 'missing-file', storageType: 'indexeddb', blobKey: 'absent', missingBlob: true }] },
  { files: [{ id: 'unverified-file', storageType: 'indexeddb', blobKey: 'cached-only' }], readbackFailure: true }
]) {
  test('attachment persistence failure rejects full-restore success without discarding recovered content: ' + JSON.stringify(scenario), async () => {
    const fixture = makeRestoreFixture(scenario);
    await assert.rejects(fixture.apply({ pages: [] }), error => {
      assert.equal(error.code, 'restore-incomplete');
      assert.match(error.message, /Recovered content is available/);
      assert.match(error.message, /original backup/);
      if (scenario.saveFailure) assert.match(error.message, /Local saving could not be confirmed/);
      if (scenario.attachmentResult || scenario.attachmentException) assert.match(error.message, /attachments could not be saved/);
      if (scenario.files) assert.match(error.message, /could not be verified in storage/);
      return true;
    });
    assert.equal(fixture.wasImported(), true);
    assert.ok(fixture.events.includes('workspace-save-flushed'));
    if (scenario.attachmentResult || scenario.attachmentException || scenario.files) assert.ok(fixture.events.includes('incomplete-restore:attachment'));
    if (scenario.saveFailure) assert.ok(fixture.events.includes('incomplete-restore:indexeddb'));
    assert.equal(fixture.events.some(event => event.startsWith('toast:Workspace imported successfully!')), false);
    assert.equal(fixture.lockIsActive(), false);
  });
}

test('restore verifies existing file bytes before clearing a stale missing marker; links need no blob', async () => {
  const fixture = makeRestoreFixture({
    files: [
      { id: 'existing-file', storageType: 'indexeddb', blobKey: 'persisted-file', missingBlob: true },
      { id: 'link', storageType: 'link', url: 'https://example.com/reference' }
    ],
    storedKeys: ['persisted-file']
  });
  assert.equal(await fixture.apply({ pages: [] }), true);
  assert.equal(fixture.files[0].missingBlob, false);
  assert.equal(fixture.files[1].missingBlob, undefined);
});

test('one canonical HTML helper accepts nullish, numeric and literal markup values', () => {
  assert.equal([...app.matchAll(/function escapeHtml\(/g)].length, 1);
  const escape = new Function(source('escapeHtml') + '; return escapeHtml;')();
  assert.equal(escape(null), '');
  assert.equal(escape(undefined), '');
  assert.equal(escape(42), '42');
  assert.equal(escape('<a title="x">&\''), '&lt;a title=&quot;x&quot;&gt;&amp;&#39;');
});

function makeSnapshotFixture(scenario = {}) {
  return new Function('scenario', `
    const messages = [];
    let reloadScheduled = false;
    const window = {};
    const courseWorkspace = { files: scenario.files || [] };
    async function cwListStoredBlobKeys() { return scenario.storedKeys || []; }
    const location = { reload() {} };
    function getWorkspaceSnapshots() { return [{ id: 'qa-snapshot', payload: { pages: [] } }]; }
    function confirm() { return true; }
    function createWorkspaceSnapshot() { return { id: 'qa-before-restore' }; }
    function importWorkspacePayload(payload, options) {
      if (!options || !options.deferSuccessToast) messages.push('Workspace imported successfully!');
      if (scenario.importFailure) throw new Error('Apply interrupted');
    }
    async function flushImportedAttachmentWrites() { return scenario.attachmentResult || { ok: true, failed: [], total: 0 }; }
    async function flushAppSaveNow() { if (scenario.saveFailure) throw new Error('Disk full'); }
    function recordPersistenceFailure() {}
    function showToast(message) { messages.push(message); }
    function setTimeout() { reloadScheduled = true; }
    async ${source('flushWorkspaceRestoreWrites')}
    async ${source('restoreWorkspaceSnapshot')}
    return { restore: () => restoreWorkspaceSnapshot('qa-snapshot'), messages, reloadScheduled: () => reloadScheduled };
  `)(scenario);
}

test('snapshot restore reloads only after both stores confirm successful writes', async () => {
  const f = makeSnapshotFixture();
  assert.equal(await f.restore(), true);
  assert.deepEqual(f.messages, ['Workspace restored. Reloading…']);
  assert.equal(f.reloadScheduled(), true);
});

for (const scenario of [
  { attachmentResult: { ok: false, failed: ['qa-file'], total: 1 } },
  { saveFailure: true },
  { attachmentResult: { ok: false, failed: ['qa-file'], total: 1 }, saveFailure: true },
  { files: [{ storageType: 'indexeddb', blobKey: 'absent', missingBlob: true }] },
  { importFailure: true }
]) {
  test('snapshot restore keeps recovery visible and avoids success/reload on failure: ' + JSON.stringify(scenario), async () => {
    const f = makeSnapshotFixture(scenario);
    assert.equal(await f.restore(), false);
    assert.equal(f.reloadScheduled(), false);
    assert.equal(f.messages.some(message => /successfully|Workspace restored|workspace is unchanged/.test(message)), false);
    assert.match(f.messages.at(-1), /Recovered content/);
    if (scenario.saveFailure) assert.match(f.messages.at(-1), /Local saving could not be confirmed/);
    if (scenario.attachmentResult) assert.match(f.messages.at(-1), /attachments could not be saved/);
    if (scenario.files) assert.match(f.messages.at(-1), /could not be verified in storage/);
  });
}
