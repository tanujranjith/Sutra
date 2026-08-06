import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import {
  createEverythingWorkspace,
  createReverseDirectionWorkspace,
  EVERYTHING_ASSISTANT_HISTORY
} from '../fixtures/everything-workspace.mjs';
import { comparePortableWorkspaces, fieldDiff } from '../helpers/sync-parity.mjs';

const require = createRequire(import.meta.url);
const projectionApi = require('../../src/sync/sync-projection.js');
const diffApi = require('../../src/sync/sync-diff.js');
const mergeApi = require('../../src/sync/sync-merge.js');
const inventory = JSON.parse(fs.readFileSync(
  new URL('../../docs/architecture/persistence-inventory.json', import.meta.url),
  'utf8'
));

async function projected(workspace) {
  const projection = projectionApi.buildProjection(workspace);
  return { records: projection.records, hashes: await projectionApi.hashProjection(projection) };
}

function identity(deviceId, start = 0) {
  let lamport = start;
  return {
    deviceId, schemaVersion: 6, clientTime: '2026-07-16T14:00:00.000Z',
    nextLamport() { lamport += 1; return lamport; }
  };
}

async function protocolTransfer(sourceWorkspace, targetWorkspace, deviceId) {
  const source = await projected(sourceWorkspace);
  const outbox = diffApi.computeOutbox({
    baseHashes: {}, currentRecords: source.records, currentHashes: source.hashes,
    previousOutbox: [], identity: identity(deviceId)
  });
  const merged = await mergeApi.merge({
    baseRecords: {}, baseHashes: {}, localRecords: {}, localHashes: {},
    remoteOps: outbox.ops, localOps: [], tombstones: {},
    ownDeviceId: 'target-device', now: 1
  });
  return projectionApi.applyProjectionToWorkspace(targetWorkspace, { records: merged.mergedRecords });
}

test('everything fixture survives actual diff, merge, and projection bootstrap', async () => {
  const deviceA = createEverythingWorkspace({});
  const deviceB = await protocolTransfer(deviceA, {
    version: 6,
    workspaceMeta: { revision: 2, lastWriterTabId: 'device-b' },
    ui: { lastActiveView: 'today' },
    splitPaneContexts: { primary: { pageId: 'device-b-page' } },
    settings: {
      dataHealth: { lastSaveAttemptAt: 'device-b-only' },
      preferences: { sync: { enabled: true, endpoint: 'device-b-only' } }
    },
    notificationsState: { lastActiveAt: 123 }
  }, 'device-a');

  const comparison = comparePortableWorkspaces(deviceA, deviceB);
  assert.deepEqual(comparison.differences, [], JSON.stringify(comparison.differences.slice(0, 20), null, 2));
  assert.equal(deviceB.workspaceMeta.lastWriterTabId, 'device-b');
  assert.equal(deviceB.ui.lastActiveView, 'today');
  assert.equal(deviceB.settings.preferences.sync.endpoint, 'device-b-only');
  assert.equal(deviceB.notificationsState.lastActiveAt, 123);
});

test('Assistant thread contract includes order, provenance, receipts, memory, and empty threads', () => {
  const records = projectionApi.buildProjection(createEverythingWorkspace({})).records;
  const main = records['c/assistantConversations/chat-parity-main'];
  const empty = records['c/assistantConversations/chat-parity-empty'];
  assert.deepEqual(main.messages.map(message => message.id), ['msg-parity-user', 'msg-parity-assistant']);
  assert.equal(main.messages[1].sources[0].quote, 'Unique parity evidence.');
  assert.equal(main.messages[1].receipt.schema, 'sutra-assistant-receipt/1');
  assert.deepEqual(main.messages[1].receipt.actionsProposed, ['create_task']);
  assert.deepEqual(main.messages[1].memoryUsedIds, ['memory-parity-1']);
  assert.deepEqual(empty.messages, []);
  assert.deepEqual(records['a/assistantChatHistory.__rest'], {
    version: EVERYTHING_ASSISTANT_HISTORY.version,
    legacyMigrationComplete: true,
    currentChatId: EVERYTHING_ASSISTANT_HISTORY.currentChatId
  });
});

test('everything fixture covers every portable top-level and named nested contract', () => {
  const fixture = createEverythingWorkspace({});
  const portableCategories = new Set(['record', 'ordered', 'atomic', 'asset', 'compatibility']);
  for (const [field, decision] of Object.entries(inventory.workspaceFieldClassifications)) {
    if (!portableCategories.has(decision.category) || decision.category === 'asset') continue;
    assert.ok(Object.prototype.hasOwnProperty.call(fixture, field), 'fixture missing portable field: ' + field);
  }

  const samples = {
    'pages[]': Object.assign({}, ...fixture.pages),
    'tasks[]': Object.assign({}, ...fixture.tasks),
    assistantChatHistory: fixture.assistantChatHistory,
    'assistantChatHistory.conversations[]': fixture.assistantChatHistory.conversations[0],
    'assistantChatHistory.conversations[].messages[]':
      Object.assign({}, ...fixture.assistantChatHistory.conversations[0].messages.map(row => row)),
    'courseWorkspace.files[]': fixture.courseWorkspace.files[0],
    'settings.preferences': fixture.settings.preferences,
    homeworkWorkspace: fixture.homeworkWorkspace,
    reviewWorkspace: fixture.reviewWorkspace
  };
  for (const [contract, fields] of Object.entries(inventory.nestedPersistentContracts)) {
    if (!Array.isArray(fields)) continue;
    const sample = samples[contract];
    assert.ok(sample, 'fixture has no sample for nested contract: ' + contract);
    for (const field of fields) {
      if (contract === 'courseWorkspace.files[]' && field === 'syncContentHash') continue;
      assert.ok(Object.prototype.hasOwnProperty.call(sample, field),
        'fixture missing ' + contract + '.' + field);
    }
  }
});

test('reverse changes, deletions, reordering, and empty values survive incremental ops', async () => {
  const baselineWorkspace = createEverythingWorkspace({});
  const baseline = await projected(baselineWorkspace);
  const changedWorkspace = createReverseDirectionWorkspace(baselineWorkspace);
  changedWorkspace.pages = [changedWorkspace.pages[1], changedWorkspace.pages[0]];
  changedWorkspace.focusSessions = [];
  changedWorkspace.assistantChatHistory.conversations[0].messages.push({
    id: 'msg-reverse', role: 'user',
    content: 'Reverse-direction Assistant sentinel.',
    createdAt: '2026-07-16T15:00:00.000Z'
  });
  changedWorkspace.assistantChatHistory.conversations =
    changedWorkspace.assistantChatHistory.conversations.filter(row => row.id !== 'chat-parity-empty');
  const changed = await projected(changedWorkspace);
  const outbox = diffApi.computeOutbox({
    baseHashes: baseline.hashes, currentRecords: changed.records,
    currentHashes: changed.hashes, previousOutbox: [],
    identity: identity('device-b', 100)
  });
  assert.ok(outbox.ops.some(op =>
    op.recordKey === 'c/assistantConversations/chat-parity-empty' && op.kind === 'delete'));
  assert.ok(outbox.ops.some(op =>
    op.recordKey === 'a/focusSessions' && op.kind === 'upsert'
    && Array.isArray(op.payload) && op.payload.length === 0));
  assert.ok(outbox.ops.some(op => op.recordKey === 'o/pages' && op.kind === 'upsert'));

  const remote = mergeApi.applyOpsToRecords(baseline.records, outbox.ops).records;
  const applied = projectionApi.applyProjectionToWorkspace(baselineWorkspace, { records: remote });
  const comparison = comparePortableWorkspaces(changedWorkspace, applied);
  assert.deepEqual(comparison.differences, [], JSON.stringify(comparison.differences.slice(0, 20), null, 2));
});

test('field-level diff reports exact content paths', () => {
  const differences = fieldDiff(
    { assistant: { conversations: [{ messages: [{ content: 'expected' }] }] } },
    { assistant: { conversations: [{ messages: [{ content: 'actual' }] }] } }
  );
  assert.deepEqual(
    differences.map(row => row.path),
    ['$.assistant.conversations[0].messages[0].content']
  );
});
