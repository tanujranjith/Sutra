import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const declarations = ['recoveryCanMarkDone', 'mutateDeadlineRecord'].map(name => extractFunction(source, name).body).join('\n');

test('Radar completes the selected College record through its existing status', () => {
  const collegeAppWorkspace = { essayOrganizer: [{ id: 'essay', draftStatus: 'drafting' }], recommenders: [{ id: 'rec', status: 'requested' }], scholarships: [{ id: 'grant', status: 'applying' }], collegeTracker: [{ id: 'school', status: 'planning' }] };
  const collegeTracker = { essays: [{ id: 'legacy', firstDraftDone: false, reviewSubmitted: false }] };
  let saves = 0;
  const actions = new Function('collegeAppWorkspace', 'collegeTracker', 'persistAppData', 'window', declarations + '; return { recoveryCanMarkDone, mutateDeadlineRecord };')(collegeAppWorkspace, collegeTracker, () => { saves++; }, {});
  for (const [collection, id, field, expected] of [['essayOrganizer', 'essay', 'draftStatus', 'final'], ['recommenders', 'rec', 'status', 'submitted'], ['scholarships', 'grant', 'status', 'submitted'], ['collegeTracker', 'school', 'status', 'submitted']]) {
    const item = { source: 'college', sourceView: 'collegeapp', sourceCollection: collection, sourceId: id };
    assert.equal(actions.recoveryCanMarkDone(item), true);
    assert.equal(actions.mutateDeadlineRecord(item, { done: true }), true);
    assert.equal(collegeAppWorkspace[collection][0][field], expected);
  }
  const milestone = { source: 'college', sourceView: 'college', sourceCollection: 'essays', sourceId: 'legacy', id: 'college:essays:legacy:firstDraftBy' };
  assert.equal(actions.mutateDeadlineRecord(milestone, { done: true }), true);
  assert.equal(collegeTracker.essays[0].firstDraftDone, true);
  assert.equal(collegeTracker.essays[0].reviewSubmitted, false);
  assert.equal(saves, 5);
  assert.equal(actions.mutateDeadlineRecord({ ...milestone, sourceId: 'missing' }, { done: true }), false);
  assert.equal(saves, 5);
});

test('an AP exam is marked taken only while its source exists', () => {
  const taken = [];
  const actions = new Function('apStudyWorkspace', '_setExamTaken', 'window', declarations + '; return { recoveryCanMarkDone, mutateDeadlineRecord };')(
    { subjects: [{ id: 'bio' }] }, (id, value) => { taken.push([id, value]); return true; }, {});
  const item = { source: 'apexam', sourceId: 'bio', id: 'ap:bio' };
  assert.equal(actions.recoveryCanMarkDone(item), true);
  assert.equal(actions.mutateDeadlineRecord(item, { done: true }), true);
  assert.deepEqual(taken, [['ap:bio', true]]);
  assert.equal(actions.mutateDeadlineRecord({ ...item, sourceId: 'missing' }, { done: true }), false);
});
