import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const planning = require('../../src/features/academic/planning-engine.js');

const today = '2026-06-01';
const dates = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'];

function windowsForWeek() {
  return Object.fromEntries(dates.map(date => [date, [{ start: 540, end: 1020 }]]));
}

test('weekly planning includes medium-priority work due on day five', () => {
  const items = planning.collectPlanningItems({
    dates,
    tasks: [{ id: 'day-five', title: 'Reading response', dueDate: '2026-06-06', priority: 'medium' }]
  });
  assert.deepEqual(items.map(item => [item.id, item.kind]), [['day-five', 'task']]);

  const plan = planning.planWork({ today, dates, items, freeWindowsByDate: windowsForWeek() });
  assert.ok(plan.blocks.some(block => block.sourceKind === 'task' && block.sourceId === 'day-five'));
});

test('weekly planning excludes already scheduled work by typed source link', () => {
  const items = planning.collectPlanningItems({
    dates,
    tasks: [
      { id: 'scheduled-task', title: 'Already scheduled', dueDate: '2026-06-04' },
      { id: 'open-task', title: 'Still needs time', dueDate: '2026-06-04' }
    ],
    timeBlocks: [
      { source: 'planner_preview:task', sourceNoteId: 'scheduled-task' },
      { sourceType: 'task', sourceId: 'scheduled-task', name: 'Already scheduled' }
    ]
  });
  assert.deepEqual(items.map(item => item.id), ['open-task']);

  const plan = planning.planWork({ today, dates, items, freeWindowsByDate: windowsForWeek() });
  assert.deepEqual(plan.blocks.map(block => [block.sourceKind, block.sourceId]), [['task', 'open-task']]);
});

test('task and homework rows with equal IDs retain distinct source links', () => {
  const items = planning.collectPlanningItems({
    dates,
    tasks: [{ id: 'shared-id', title: 'Personal task', dueDate: '2026-06-04' }],
    homeworkTasks: [{ id: 'shared-id', title: 'Class assignment', dueDate: '2026-06-04' }],
    timeBlocks: [{ sourceType: 'task', sourceId: 'shared-id' }]
  });
  assert.deepEqual(items.map(item => [item.kind, item.id]), [['homework', 'shared-id']]);

  const unfiltered = planning.collectPlanningItems({
    dates,
    tasks: [{ id: 'shared-id', title: 'Personal task', dueDate: '2026-06-04' }],
    homeworkTasks: [{ id: 'shared-id', title: 'Class assignment', dueDate: '2026-06-04' }]
  });
  const plan = planning.planWork({ today, dates, items: unfiltered, freeWindowsByDate: windowsForWeek() });
  assert.deepEqual(plan.blocks.map(block => [block.sourceKind, block.sourceId]).sort(), [
    ['homework', 'shared-id'], ['task', 'shared-id']
  ]);
});

test('weekly planning includes the last day and excludes work due after it', () => {
  const items = planning.collectPlanningItems({
    dates,
    tasks: [
      { id: 'last-day', title: 'Last day assignment', dueDate: '2026-06-07' },
      { id: 'outside', title: 'Outside the preview', dueDate: '2026-06-08' }
    ]
  });
  assert.deepEqual(items.map(item => item.id), ['last-day']);
});

test('weekly planning keeps normal capacity beyond intelligence signal limits', () => {
  const tasks = Array.from({ length: 20 }, (_, index) => ({
    id: `task-${index}`,
    title: `Assignment ${index}`,
    dueDate: '2026-06-07',
    estimateMinutes: 15
  }));
  const items = planning.collectPlanningItems({ dates, tasks });
  const plan = planning.planWork({ today, dates, items, freeWindowsByDate: windowsForWeek() });

  assert.equal(items.length, 20);
  assert.equal(plan.blocks.length, 20);
  assert.equal(new Set(plan.blocks.map(block => block.sourceId)).size, 20);
});

test('weekly planning ignores completed and deleted canonical rows', () => {
  const items = planning.collectPlanningItems({
    dates,
    tasks: [
      { id: 'open', title: 'Open work', dueDate: '2026-06-03' },
      { id: 'complete', title: 'Completed work', dueDate: '2026-06-03', completed: true },
      { id: 'inactive', title: 'Inactive work', dueDate: '2026-06-03', isActive: false },
      { id: 'deleted', title: 'Deleted work', dueDate: '2026-06-03', deletedAt: '2026-05-30T10:00:00Z' }
    ],
    homeworkTasks: [
      { id: 'done-homework', title: 'Done homework', dueDate: '2026-06-03', done: true }
    ]
  });
  assert.deepEqual(items.map(item => item.id), ['open']);
});

test('undated high-priority work remains eligible, but invalid calendar dates do not become undated work', () => {
  const items = planning.collectPlanningItems({ dates, tasks: [
    { id: 'urgent', title: 'Choose project topic', priority: 'high' },
    { id: 'ordinary', title: 'Someday idea', priority: 'medium' },
    { id: 'invalid', title: 'Impossible deadline', dueDate: '2026-02-30', priority: 'high' }
  ] });
  assert.deepEqual(items.map(item => item.id), ['urgent']);
});

test('browser preview reads canonical Tasks and Homework rather than capped attention summaries', () => {
  const window = {
    flowAtelier: {
      get tasks() { return [{ id: 'task-live', title: 'Personal deadline', dueDate: '2026-06-06' }]; },
      get timeBlocks() { return []; },
      getFreeWindowsForDateKey: () => [{ start: 540, end: 1020 }]
    },
    SutraHomework: {
      getTasks: () => [{ id: 'hw-live', title: 'Course deadline', courseId: 'chem', dueDate: '2026-06-06' }],
      getCourses: () => [{ id: 'chem', name: 'Chemistry' }]
    },
    sutraIntelligence: { deriveStudentContext: () => ({ dueSoon: [], overdue: [], unscheduledHighPriority: [] }) }
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-06-01T12:00:00'])); }
  }
  vm.runInNewContext(readFileSync(new URL('../../src/features/academic/planning-engine.js', import.meta.url), 'utf8'), {
    window, Date: FixedDate, document: { readyState: 'loading', addEventListener() {} }
  });
  const result = window.SutraPlanningEngine.buildPreview('week');
  const sources = Array.from(result.blocks, block => block.sourceKind + ':' + block.sourceId).sort();
  assert.deepEqual(sources, ['homework:hw-live', 'task:task-live']);
});

test('historical or removed blocks do not suppress open work, and legacy preview links still match', () => {
  const rows = ['past', 'removed', 'legacy', 'homework-link'].map(id => ({ id, title: id, dueDate: '2026-06-04' }));
  const items = planning.collectPlanningItems({ today, dates, tasks: rows.slice(0, 3), homeworkTasks: rows.slice(3), timeBlocks: [
    { source: 'task', sourceId: 'past', date: '2026-05-01' },
    { source: 'task', sourceId: 'removed', date: '2026-06-03', deleted: true },
    { source: 'planner_preview', sourceNoteId: 'legacy', name: 'legacy (1/2)', date: '2026-06-03' },
    { source: 'homework', sourceNoteId: 'homework-link', date: '2026-06-03' }
  ] });
  assert.deepEqual(items.map(item => item.id), ['past', 'removed']);
});
