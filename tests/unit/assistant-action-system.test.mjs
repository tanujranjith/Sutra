import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const system = require('../../src/features/assistant/action-system.js');
let seq = 0;

function register(overrides = {}) {
  const type = overrides.type || `unit_action_${++seq}`;
  return system.register({
    type,
    description: 'Unit action',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'title'],
      properties: {
        type: { type: 'string', enum: [type] },
        title: { type: 'string', minLength: 1, maxLength: 40, format: 'safe-content' },
        url: { type: 'string', format: 'url', maxLength: 2048 },
        rows: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 20 } } } }
      }
    },
    permissions: ['workspace.write'],
    affectedEntities: ['tasks'],
    confirmation: 'writes',
    persistence: { required: true, strategy: 'workspace' },
    prepare: (action) => ({ action, before: 'snapshot' }),
    commit: (prepared, context) => context.commit(prepared.action),
    rollback: (receipt, context) => context.rollback(receipt),
    undo: (receipt, context) => context.undo(receipt),
    audit: (action) => ({ type: action.type, title: action.title }),
    ...overrides
  });
}

test('typed validation accepts valid payloads and rejects unknown actions and fields', () => {
  const def = register();
  assert.equal(system.validate({ type: def.type, title: 'Do work', rows: [{ name: 'one' }] }).ok, true);
  assert.match(system.validate({ type: 'unknown', title: 'x' }).error, /Unknown action/);
  assert.match(system.validate({ type: def.type, title: 'x', surprise: true }).error, /unknown field/);
});

test('schemas reject malformed nested data, duplicate-scale arrays, malicious URLs/HTML, and oversized payloads', () => {
  const def = register();
  assert.equal(system.validate({ type: def.type, title: 'x', rows: [{ wrong: 'x' }] }).ok, false);
  assert.equal(system.validate({ type: def.type, title: 'x', rows: [{ name: '1' }, { name: '2' }, { name: '3' }, { name: '4' }] }).ok, false);
  assert.equal(system.validate({ type: def.type, title: 'x', url: 'javascript:alert(1)' }).ok, false);
  assert.equal(system.validate({ type: def.type, title: '<img onerror=alert(1)>' }).ok, false);
  assert.match(system.validate({ type: def.type, title: 'x'.repeat(300000) }).error, /too large/);
});

test('permissions and destructive confirmation are mandatory', () => {
  const def = register({ destructive: true, confirmation: 'destructive', permissions: ['workspace.delete'] });
  const action = { type: def.type, title: 'Delete' };
  assert.equal(system.validate(action, { permissions: [] }).ok, false);
  const denied = system.executeSync(action, { permissions: ['workspace.delete'], commit: () => ({ ok: true }) });
  assert.equal(denied.code, 'confirmation_required');
  const allowed = system.executeSync(action, { confirmed: true, permissions: ['workspace.delete'], commit: () => ({ ok: true }), persist: () => {} });
  assert.equal(allowed.ok, true);
});

test('plans rollback committed actions in reverse order after a partial failure', async () => {
  const events = [];
  const a = register({ confirmation: 'never', permissions: [], persistence: { required: false } });
  const b = register({ confirmation: 'never', permissions: [], persistence: { required: false } });
  const c = register({ confirmation: 'never', permissions: [], persistence: { required: false } });
  const result = await system.executePlan([
    { type: a.type, title: 'a' }, { type: b.type, title: 'b' }, { type: c.type, title: 'c' }
  ], {
    commit(action) { events.push('commit:' + action.title); return action.title === 'c' ? { ok: false, message: 'boom' } : { ok: true, id: action.title }; },
    rollback(receipt) { events.push('rollback:' + receipt.result.id); return true; }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'rolled_back');
  assert.deepEqual(events, ['commit:a', 'commit:b', 'commit:c', 'rollback:b', 'rollback:a']);
  assert.deepEqual(result.outcomes.map((row) => row.status), ['rolled_back', 'rolled_back', 'failed']);
});

test('persistence failure rolls back the whole committed plan and reports exact outcomes', async () => {
  const rolledBack = [];
  const def = register({ confirmation: 'never', permissions: [] });
  const result = await system.executePlan([{ type: def.type, title: 'persist me' }], {
    commit: () => ({ ok: true, id: 'saved' }),
    persist: () => { throw new Error('disk full'); },
    rollback: (receipt) => { rolledBack.push(receipt.result.id); return true; }
  });
  assert.equal(result.code, 'rolled_back');
  assert.deepEqual(rolledBack, ['saved']);
  assert.equal(result.outcomes[0].status, 'rolled_back');
});

test('rollback failures are reported as partial outcomes', async () => {
  const def = register({ confirmation: 'never', permissions: [], persistence: { required: false } });
  const result = await system.executePlan([{ type: def.type, title: 'one' }, { type: def.type, title: 'two' }], {
    commit(action) { return action.title === 'two' ? { ok: false, message: 'fail' } : { ok: true }; },
    rollback() { throw new Error('rollback failed'); }
  });
  assert.equal(result.code, 'partial_rollback');
  assert.equal(result.rollbackFailures.length, 1);
});

test('idempotency prevents repeated execution and undo uses definition metadata', async () => {
  let commits = 0;
  let undos = 0;
  const def = register({ confirmation: 'never', permissions: [], persistence: { required: false } });
  const context = { idempotencyKey: 'same-request', commit: () => ({ ok: true, id: ++commits }), undo: () => ({ ok: true, count: ++undos }) };
  const first = system.executeSync({ type: def.type, title: 'once' }, context);
  const repeated = system.executeSync({ type: def.type, title: 'once' }, context);
  assert.equal(first.ok, true);
  assert.equal(repeated.repeated, true);
  assert.equal(commits, 1);
  const undone = await system.undo(first, context);
  assert.equal(undone.ok, true);
  assert.equal(undos, 1);
});
