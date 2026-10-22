import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engineApi = require('../../src/sync/sync-engine.js');
const syncCrypto = require('../../src/sync/sync-crypto.js');
const projectionApi = require('../../src/sync/sync-projection.js');
const protocolApi = require('../../src/sync/sync-protocol.js');

function makeStore() {
  const state = {
    meta: new Map([['lastServerCursor', 12]]),
    baseline: null,
    outbox: new Map(),
    tombstones: {},
    conflicts: new Map()
  };
  return {
    state,
    async getMeta(key) { return state.meta.has(key) ? state.meta.get(key) : null; },
    async setMeta(key, value) { state.meta.set(key, value); },
    async getBaseline() { return state.baseline; },
    async getOutbox() { return [...state.outbox.values()]; },
    async replaceOutbox(ops) {
      state.outbox.clear();
      for (const op of ops) state.outbox.set(op.recordKey, op);
    },
    async getTombstones() { return state.tombstones; },
    async listConflicts() { return [...state.conflicts.values()]; },
    async putConflict(conflict) { state.conflicts.set(conflict.id, conflict); },
    async commitCycleState(commit) {
      if (commit.baseline !== undefined) state.baseline = commit.baseline;
      if (commit.outboxOps !== undefined) {
        state.outbox.clear();
        for (const op of commit.outboxOps) state.outbox.set(op.recordKey, op);
      }
      if (commit.tombstones !== undefined) state.tombstones = commit.tombstones;
      if (commit.meta) for (const [key, value] of Object.entries(commit.meta)) state.meta.set(key, value);
    }
  };
}

function makeBridge(workspace) {
  const holder = { workspace: structuredClone(workspace), applies: 0 };
  return {
    holder,
    async getWorkspaceSnapshot() { return structuredClone(holder.workspace); },
    async applyMergedWorkspace(merged) {
      holder.workspace = structuredClone(merged);
      holder.applies += 1;
    }
  };
}

function workspace() {
  return {
    version: 5,
    pages: [{ id: 'p1', title: 'Biology', content: 'saved baseline' }],
    tasks: [{ id: 't1', text: 'Read chapter', done: false }],
    taskOrder: ['t1'],
    settings: { theme: 'dark', preferences: {} }
  };
}

test('auth-rejected pulls and corrupt remote ciphertext preserve the local durable sync state', async t => {
  const vaultKey = await syncCrypto.importVaultKey(syncCrypto.generateVaultKeyBytes());
  const remoteOp = {
    opId: 'remote-device:1',
    deviceId: 'remote-device',
    lamport: 1,
    recordKey: protocolApi.collectionKey('pages', 'p1'),
    kind: 'upsert',
    baseHash: null,
    hash: 'ab'.repeat(32),
    payload: { id: 'p1', title: 'Biology', content: 'remote content' },
    schemaVersion: 5,
    protocolVersion: protocolApi.PROTOCOL_VERSION,
    clientTime: '2026-10-16T00:00:00.000Z'
  };
  const validEnvelope = await syncCrypto.encryptOpEnvelope(vaultKey, remoteOp);
  const badCiphertext = (validEnvelope.ct[0] === 'A' ? 'B' : 'A') + validEnvelope.ct.slice(1);
  const corruptedEnvelope = { ...validEnvelope, ct: badCiphertext };

  for (const failure of ['unauthorized', 'corrupt-ciphertext']) {
    await t.test(failure, async t => {
      const store = makeStore();
      const bridge = makeBridge(workspace());
      const originalProjection = projectionApi.buildProjection(bridge.holder.workspace);
      const baseline = {
        cursor: 12,
        records: originalProjection.records,
        hashes: await projectionApi.hashProjection(originalProjection)
      };
      store.state.baseline = structuredClone(baseline);

      const priorConflict = {
        id: 'prior-review-item',
        recordKey: protocolApi.collectionKey('pages', 'archived-page'),
        type: 'page-content-conflict',
        localValue: { id: 'archived-page', content: 'local branch' },
        remoteValue: { id: 'archived-page', content: 'remote branch' }
      };
      store.state.conflicts.set(priorConflict.id, structuredClone(priorConflict));

      // This local edit must be durable before the request and stay queued if
      // authentication or remote ciphertext verification fails.
      bridge.holder.workspace.pages[0].content = 'offline local edit';
      const beforeWorkspace = structuredClone(bridge.holder.workspace);
      let snapshotCalls = 0;
      const pullCursors = [];
      let pushCalls = 0;
      let touchCalls = 0;
      const engine = engineApi.create({
        store,
        transport: {
          async getSnapshot() { snapshotCalls += 1; return { ok: true, snapshot: null }; },
          async pull({ cursor }) {
            pullCursors.push(cursor);
            if (failure === 'unauthorized') return { ok: false, code: 'unauthorized' };
            return cursor === 12
              ? { ok: true, ops: [corruptedEnvelope], cursor: 13 }
              : { ok: true, ops: [], cursor };
          },
          async push() { pushCalls += 1; return { ok: true, cursor: 13 }; },
          async touchDevice() { touchCalls += 1; return { ok: true }; }
        },
        bridge,
        identity: { deviceId: `device-${failure}`, schemaVersion: 5 },
        vaultKey,
        debounceMs: 0,
        timers: { now: () => 1800000000000, setTimeout: () => 1, clearTimeout: () => {} }
      });
      t.after(() => engine.stop());

      const outcome = await engine.syncNow();

      assert.ok(outcome.error);
      assert.equal(engine.getStatus().state, failure === 'unauthorized' ? 'auth-expired' : 'encryption-error');
      const status = engine.getStatus();
      if (failure === 'corrupt-ciphertext') {
        assert.equal(status.lastErrorStage, 'operation');
        assert.match(status.lastErrorReference, /^operation-[0-9a-f]{8}$/);
        assert.ok(!status.lastError.includes(remoteOp.recordKey), 'unverified remote IDs stay out of status messages');
      } else {
        assert.equal(status.lastErrorStage, null);
        assert.equal(status.lastErrorReference, null);
      }
      assert.deepEqual(await engine.syncNow(), { skipped: true, reason: 'paused' }, 'a paused cycle is not reported as a successful sync');
      assert.equal(snapshotCalls, 0, 'an established baseline skips bootstrap snapshot discovery');
      assert.deepEqual(pullCursors, failure === 'unauthorized' ? [12] : [12, 13]);
      assert.deepEqual(bridge.holder.workspace, beforeWorkspace, 'remote failures never replace the saved local workspace');
      assert.equal(bridge.holder.applies, 0);
      assert.deepEqual(store.state.baseline, baseline, 'the acknowledged merge base and cursor remain intact');
      assert.equal(await store.getMeta('lastServerCursor'), 12);
      const outbox = await store.getOutbox();
      assert.equal(outbox.length, 1, 'the pending local edit stays in the durable outbox');
      assert.equal(outbox[0].payload.content, 'offline local edit');
      assert.deepEqual(await store.listConflicts(), [priorConflict], 'prior review data remains available');
      assert.equal(pushCalls, 0);
      assert.equal(touchCalls, 0);
      assert.equal(engine.getStatus().lastSyncAt, null);
      engine.pause();
      assert.equal(engine.getStatus().lastErrorStage, null, 'leaving the integrity state clears session-only diagnostic details');
      assert.equal(engine.getStatus().lastErrorReference, null);
    });
  }
});
