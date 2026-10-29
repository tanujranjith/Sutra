import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const store = require('../../src/domain/homework-store.js');
const student = require('../../src/domain/student-engine.js');
const planner = require('../../src/domain/planner.js');

test('Student OS and its planner honor reopened Homework and omit completed Homework', () => {
  const homeworkWorkspace = store.normalizeWorkspace({ tasks: [
    { id: 'reopened', title: 'Reopened lab', dueDate: '2026-06-03', done: false, completed: true, status: 'done', futureData: { keep: true } },
    { id: 'finished', title: 'Finished lab', dueDate: '2026-06-03', done: true },
    { id: 'legacy', title: 'Legacy finished', dueDate: '2026-06-03', completed: true }
  ] });
  const workspace = { homeworkWorkspace, tasks: [{ id: 'finished-task', title: 'Finished task', completed: true }] };
  const before = structuredClone(workspace);
  const actions = student.getInbox(workspace, { now: '2026-06-01T09:00:00' });
  assert.deepEqual(actions.map(action => action.id), ['homework:reopened']);
  assert.equal(actions[0].status, 'todo');
  const result = planner.proposeSchedule({ actions }, { startAt: '2026-06-01T09:00:00', days: 3 });
  assert.ok(result.proposals.some(proposal => proposal.sourceId === 'reopened'));
  assert.deepEqual(workspace, before);
});
