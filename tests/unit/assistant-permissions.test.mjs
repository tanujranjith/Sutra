import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const privacy = require('../../src/domain/assistant-permissions.js');

test('off mode exposes only non-workspace envelope metadata', () => {
  privacy.configure({ getPermissions: () => ({ mode: 'off' }) });
  const result = privacy.filterContext({ schema: 'x', view: 'today', tasks: [{ id: 'secret-task' }], life: { wellness: { mood: 1 } } });
  assert.equal(result.tasks, undefined);
  assert.equal(result.life, undefined);
  assert.deepEqual(result.accessReport.areasRead, []);
});

test('read-only mode reports exact records and strips sensitive areas by default', () => {
  privacy.configure({ getPermissions: () => ({ mode: 'read_only', areas: {}, allowWellness: false, allowFinancial: false }) });
  const result = privacy.filterContext({
    tasks: [{ id: 'task-1', title: 'Essay' }],
    life: { id: 'life-1', wellness: { mood: 2 }, goals: [{ id: 'goal-1' }] },
    college: { id: 'college-1', applicationCosts: [{ id: 'cost-1' }], schools: [{ id: 'school-1' }] },
    activeNote: { id: 'note-1', title: 'Private', locked: true, content: 'secret' }
  });
  assert.equal(result.life.wellness, undefined);
  assert.equal(result.college.applicationCosts, undefined);
  assert.equal(result.activeNote.content, undefined);
  assert.ok(result.accessReport.recordsRead.some((row) => row.id === 'task-1'));
  assert.ok(result.accessReport.excludedSensitiveAreas.includes('private_documents'));
});

test('ask-per-area mode accepts one-request approval without changing saved policy', () => {
  privacy.configure({ getPermissions: () => ({ mode: 'ask_per_area', areas: { planning: 'ask', notes: 'denied' } }) });
  const denied = privacy.filterContext({ tasks: [{ id: 't1' }], activeNote: { id: 'n1' } });
  assert.equal(denied.tasks, undefined);
  const approved = privacy.filterContext({ tasks: [{ id: 't1' }], activeNote: { id: 'n1' } }, { approvedAreas: ['planning', 'notes'] });
  assert.equal(approved.tasks.length, 1);
  assert.equal(approved.activeNote, undefined);
});

test('action permissions require approved-actions mode and explicit approval', () => {
  privacy.configure({ getPermissions: () => ({ mode: 'read_only' }) });
  assert.deepEqual(privacy.getActionPermissions({ approved: true }), ['workspace.read']);
  privacy.configure({ getPermissions: () => ({ mode: 'approved_actions' }) });
  assert.deepEqual(privacy.getActionPermissions({ approved: true, destructiveApproved: true }), ['workspace.read', 'workspace.write', 'workspace.delete']);
});
