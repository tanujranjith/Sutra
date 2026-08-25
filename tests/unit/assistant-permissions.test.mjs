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

test('top-level privateDocuments are denied by default even when workspace is readable', () => {
  privacy.configure({ getPermissions: () => ({ mode: 'read_only', areas: {}, allowPrivateDocuments: false }) });
  const result = privacy.filterContext({
    tasks: [{ id: 'task-1' }],
    privateDocuments: [{ id: 'doc-1', title: 'Diagnosis letter', content: 'highly sensitive' }]
  });
  // The outbound boundary itself must remove the field; it cannot rely on
  // context builders choosing not to populate it.
  assert.equal(result.privateDocuments, undefined);
  assert.ok(!JSON.stringify(result).includes('Diagnosis letter'));
  assert.ok(result.accessReport.excludedSensitiveAreas.includes('private_documents'));
});

test('explicit allowPrivateDocuments approval admits top-level private documents', () => {
  privacy.configure({ getPermissions: () => ({ mode: 'read_only', areas: {}, allowPrivateDocuments: true }) });
  const result = privacy.filterContext({
    privateDocuments: [{ id: 'doc-1', title: 'Allowed letter' }]
  });
  assert.equal(result.privateDocuments.length, 1);
});

test('wellness and financial concepts are denied as top-level fields by default too', () => {
  privacy.configure({ getPermissions: () => ({ mode: 'read_only', areas: {}, allowWellness: false, allowFinancial: false }) });
  const result = privacy.filterContext({
    wellness: { mood: 3 },
    sleep: [{ id: 's1' }],
    financialAid: [{ id: 'f1' }],
    spending: { id: 'sp-1' }
  });
  assert.equal(result.wellness, undefined);
  assert.equal(result.sleep, undefined);
  assert.equal(result.financialAid, undefined);
  assert.equal(result.spending, undefined);
});

test('nested privateDocuments inside an approved area value are still removed', () => {
  privacy.configure({ getPermissions: () => ({ mode: 'read_only', areas: {}, allowPrivateDocuments: false }) });
  const result = privacy.filterContext({
    courses: { id: 'course-1', name: 'Biology', privateDocuments: [{ id: 'hidden' }] }
  });
  assert.equal(result.courses.privateDocuments, undefined);
});
