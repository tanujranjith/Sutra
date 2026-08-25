import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mod = require('../../src/state/persistence-state.js');

test('normalizePersistenceState returns the canonical health-record shape', () => {
  const normalized = mod.normalizePersistenceState({
    lastConfirmedSaveAt: '2026-08-25T00:00:00Z',
    lastSerializedBytes: '2048',
    lastAttachmentWarnings: Array.from({ length: 30 }, (_, i) => `w${i}`),
    backupState: 42,
    unknownField: 'preserved upstream, not part of this record'
  });
  assert.equal(normalized.version, mod.SUTRA_PERSISTENCE_HEALTH_VERSION);
  assert.equal(normalized.lastConfirmedSaveAt, '2026-08-25T00:00:00Z');
  assert.equal(normalized.lastSerializedBytes, 2048);
  assert.equal(normalized.lastAttachmentWarnings.length, 12, 'attachment warnings stay bounded');
  assert.equal(normalized.backupState, '42');
  assert.equal(normalized.retryCount, 0);
  assert.deepEqual(normalized.lastFailure, null);
});

test('normalizePersistenceState tolerates null, primitives, and hostile input', () => {
  for (const input of [null, undefined, 7, 'x', {}, { lastFailure: 'not-an-object' }]) {
    const out = mod.normalizePersistenceState(input);
    assert.equal(typeof out, 'object');
    assert.equal(out.version, mod.SUTRA_PERSISTENCE_HEALTH_VERSION);
    if (input && typeof input === 'object' && input.lastFailure === 'not-an-object') {
      assert.equal(out.lastFailure, null);
    }
  }
});

test('export failure phases include every exporter that must stay visible', () => {
  const phases = mod.SUTRA_EXPORT_FAILURE_PHASES;
  for (const expected of ['attachment-export', 'cache-warming', 'sutra-export', 'emergency-export']) {
    assert.ok(phases.has(expected), `missing export failure phase: ${expected}`);
  }
});
