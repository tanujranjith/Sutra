import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const declarations = ['recoveryCanMarkDone', 'mutateDeadlineRecord'].map(name => extractFunction(source, name).body).join('\n');
const projection = createRequire(import.meta.url)('../../src/sync/sync-projection.js');

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

test('individual College dates complete, restore, and survive normalization and Sync projection', () => {
  const collegeTracker = { checklist: [{ id: 'school', college: 'Purdue', earlyDeadline: '2026-11-01', regularDeadline: '2027-01-01', otherData: { keep: true } }], deadlines: [{ id: 'plan', college: 'Purdue', essaysDoneBy: '2026-10-30', submitBy: '2026-11-01' }], essays: [] };
  let saves = 0;
  const methods = new Function('collegeTracker', 'collegeAppWorkspace', 'persistAppData', 'window', declarations + '\n' + extractFunction(source, 'restoreCollegeDeadlineRecord').body + '; return { recoveryCanMarkDone, mutateDeadlineRecord, restoreCollegeDeadlineRecord };')(collegeTracker, {}, () => { saves++; }, {});
  const item = { source: 'college', sourceView: 'college', sourceCollection: 'checklist', sourceId: 'school', id: 'college:checklist:school:earlyDeadline', dueDate: '2026-11-01' };
  assert.equal(methods.recoveryCanMarkDone(item), true);
  assert.equal(methods.mutateDeadlineRecord(item, { done: true }), true);
  assert.deepEqual(collegeTracker.checklist[0].completedDeadlineDates, { earlyDeadline: '2026-11-01' });
  assert.equal(collegeTracker.checklist[0].regularDeadline, '2027-01-01');
  assert.equal(collegeTracker.checklist[0].appSubmitted, undefined);
  assert.equal(methods.mutateDeadlineRecord({ ...item, dueDate: '2026-10-30' }, { done: true }), false, 'a stale date cannot complete a changed deadline');

  const normalize = new Function('createCollegeTrackerRow', extractFunction(source, 'normalizeCollegeTrackerRow').body + ';return normalizeCollegeTrackerRow;')(() => ({ id: 'default' }));
  const normalized = normalize('checklist', JSON.parse(JSON.stringify(collegeTracker.checklist[0])));
  assert.deepEqual(normalized.completedDeadlineDates, { earlyDeadline: '2026-11-01' });
  assert.deepEqual(normalized.otherData, { keep: true });
  const projected = projection.buildProjection({ collegeTracker });
  const restored = projection.applyProjectionToWorkspace({}, projected);
  assert.deepEqual(restored.collegeTracker.checklist[0].completedDeadlineDates, { earlyDeadline: '2026-11-01' });
  assert.deepEqual(JSON.parse(JSON.stringify({ collegeTracker })).collegeTracker.checklist[0].otherData, { keep: true });

  assert.equal(methods.restoreCollegeDeadlineRecord('checklist', 'school', 'earlyDeadline'), true);
  assert.deepEqual(collegeTracker.checklist[0].completedDeadlineDates, {});
  assert.equal(saves, 2);
  assert.equal(methods.restoreCollegeDeadlineRecord('checklist', 'school', 'earlyDeadline'), false);
});

test('changing a completed date reactivates that deadline without changing other fields', () => {
  const collegeTracker = { checklist: [{ id: 'school', college: 'Purdue', earlyDeadline: '2026-11-02', completedDeadlineDates: { earlyDeadline: '2026-11-01' } }], deadlines: [], essays: [] };
  const collect = new Function('collegeTracker', 'collegeAppWorkspace', 'COLLEGE_APP_COMPLETED_STATUSES', 'trimCollegeDeadlineLabel', 'pushCollegeDeadlineItem', extractFunction(source, 'collectCollegeDeadlineItems').body + '; return collectCollegeDeadlineItems;')(
    collegeTracker, {}, new Set(), (value, fallback) => value || fallback, (out, _now, entry) => out.push(entry));
  assert.equal(collect(new Date()).find(item => item.id === 'college:checklist:school:earlyDeadline').dueDate, '2026-11-02');
  collegeTracker.checklist[0].earlyDeadline = '2026-11-01';
  assert.equal(collect(new Date()).length, 0);
});

test('every individual checklist and application-plan deadline can be completed and restored', () => {
  for (const [collection, fields] of [
    ['checklist', ['earlyDeadline', 'regularDeadline', 'fafsaDeadline', 'cssDeadline']],
    ['deadlines', ['essaysDoneBy', 'submitBy', 'applicationDeadline']]
  ]) {
    for (const field of fields) {
      const row = { id: 'one', college: 'Purdue', [field]: '2026-11-01', appSubmitted: false, submitted: false };
      const collegeTracker = { [collection]: [row] };
      const methods = new Function('collegeTracker', 'collegeAppWorkspace', 'persistAppData', 'window', declarations + '\n' + extractFunction(source, 'restoreCollegeDeadlineRecord').body + '; return { recoveryCanMarkDone, mutateDeadlineRecord, restoreCollegeDeadlineRecord };')(collegeTracker, {}, () => {}, {});
      const item = { source: 'college', sourceView: 'college', sourceCollection: collection, sourceId: 'one', id: `college:${collection}:one:${field}`, dueDate: '2026-11-01' };
      assert.equal(methods.recoveryCanMarkDone(item), true, field);
      assert.equal(methods.mutateDeadlineRecord(item, { done: true }), true, field);
      assert.deepEqual(row.completedDeadlineDates, { [field]: '2026-11-01' });
      assert.equal(row.appSubmitted, false);
      assert.equal(row.submitted, false);
      assert.equal(methods.restoreCollegeDeadlineRecord(collection, 'one', field), true);
      assert.deepEqual(row.completedDeadlineDates, {});
    }
  }
});

test('failed saves and unknown completion maps preserve the original data', () => {
  const row = { id: 'one', earlyDeadline: '2026-11-01' };
  const collegeTracker = { checklist: [row] };
  const methods = new Function('collegeTracker', 'collegeAppWorkspace', 'persistAppData', 'window', declarations + '\n' + extractFunction(source, 'restoreCollegeDeadlineRecord').body + '; return { mutateDeadlineRecord, restoreCollegeDeadlineRecord };')(collegeTracker, {}, () => { throw new Error('save failed'); }, {});
  const item = { source: 'college', sourceCollection: 'checklist', sourceId: 'one', id: 'college:checklist:one:earlyDeadline', dueDate: '2026-11-01' };
  assert.equal(methods.mutateDeadlineRecord(item, { done: true }), false);
  assert.equal(Object.hasOwn(row, 'completedDeadlineDates'), false);
  row.completedDeadlineDates = 'unrecognized legacy value';
  assert.equal(methods.mutateDeadlineRecord(item, { done: true }), false);
  assert.equal(row.completedDeadlineDates, 'unrecognized legacy value');
  assert.equal(methods.restoreCollegeDeadlineRecord('checklist', 'one', 'earlyDeadline'), false);
});
