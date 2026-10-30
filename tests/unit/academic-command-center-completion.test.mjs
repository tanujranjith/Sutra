import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const academic = require('../../src/features/academic/academic-command-center.js');
const store = require('../../src/domain/homework-store.js');

test('course summaries and recommendations include reopened canonical Homework', () => {
  const homeworkTasks = store.normalizeWorkspace({ tasks: [
    { id: 'reopened', title: 'Reopened lab', courseId: 'chem', dueDate: '2026-06-01', done: false, completed: true, status: 'done', future: { keep: true } },
    { id: 'done', title: 'Finished lab', courseId: 'chem', dueDate: '2026-06-01', done: true, completed: false },
    { id: 'legacy', title: 'Legacy finished', courseId: 'chem', dueDate: '2026-06-01', completed: true }
  ], courses: [{ id: 'chem', name: 'Chemistry' }] }).tasks;
  const before = structuredClone(homeworkTasks);
  const model = academic.buildModel({ now: new Date(2026, 5, 2), courses: [{ id: 'chem', name: 'Chemistry' }], homeworkTasks });
  assert.equal(model.totals.overdue, 1);
  assert.equal(model.courses[0].nextAssignment.task.id, 'reopened');
  assert.deepEqual(model.actions.map(action => action.id), ['reopened']);
  assert.deepEqual(homeworkTasks, before);
});
