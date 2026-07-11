import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const canonical = require('../../src/domain/homework-store.js');
const legacyReader = require('../../src/compat/legacy-homework.js');
const NOW = '2026-07-09T12:00:00.000Z';

function memoryStorage(values = {}) {
  return { getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; } };
}

test('legacy-only homework migrates with IDs, metadata, and relationships intact', () => {
  const legacy = legacyReader.readSnapshot(memoryStorage({
    'homeworkCourses:v1': JSON.stringify([{ id: 'chem', name: 'Chemistry', type: 'class', color: '#abc' }]),
    'homeworkTasks:v1': JSON.stringify([{ id: 'lab-1', title: 'Lab report', courseId: 'chem', dueDate: '2026-07-12', done: true, recurrence: 'weekly', notes: 'Keep', sourceUrl: 'https://school.example/lab', custom: { rubric: 5 } }])
  }));
  const migrated = canonical.mergeLegacy({}, legacy, { now: NOW });
  assert.equal(migrated.courses[0].id, 'chem');
  assert.equal(migrated.courses[0].color, '#abc');
  assert.equal(migrated.tasks[0].id, 'lab-1');
  assert.equal(migrated.tasks[0].courseId, 'chem');
  assert.equal(migrated.tasks[0].done, true);
  assert.equal(migrated.tasks[0].recurrence, 'weekly');
  assert.deepEqual(migrated.tasks[0].custom, { rubric: 5 });
  assert.equal(migrated.migrations.legacyHomework.status, 'complete');
});

test('workspace-only homework is normalized without needing legacy input', () => {
  const migrated = canonical.mergeLegacy({
    revision: 7,
    courses: [{ id: 'math', name: 'Math' }],
    tasks: [{ id: 'p1', title: 'Problems', courseId: 'math', dueDate: '2026-07-15' }]
  }, {}, { now: NOW });
  assert.equal(migrated.courses.length, 1);
  assert.equal(migrated.tasks.length, 1);
  assert.equal(migrated.tasks[0].courseId, 'math');
});

test('overlapping stores deduplicate by ID and semantic identity while preserving canonical IDs', () => {
  const primary = {
    courses: [{ id: 'canonical-course', name: 'Biology', updatedAt: '2026-07-01T00:00:00Z' }],
    tasks: [{ id: 'canonical-task', title: 'Read chapter 4', courseId: 'canonical-course', dueDate: '2026-07-20', notes: 'primary', updatedAt: '2026-07-01T00:00:00Z' }]
  };
  const legacy = {
    courses: [{ id: 'legacy-course', name: 'biology', updatedAt: '2026-07-02T00:00:00Z' }],
    tasks: [{ id: 'legacy-task', title: 'Read chapter 4', courseId: 'legacy-course', dueDate: '2026-07-20', notes: 'newer legacy detail', updatedAt: '2026-07-02T00:00:00Z' }]
  };
  const merged = canonical.mergeLegacy(primary, legacy, { now: NOW });
  assert.equal(merged.courses.length, 1);
  assert.equal(merged.courses[0].id, 'canonical-course');
  assert.equal(merged.tasks.length, 1);
  assert.equal(merged.tasks[0].id, 'canonical-task');
  assert.equal(merged.tasks[0].courseId, 'canonical-course');
  assert.equal(merged.tasks[0].notes, 'newer legacy detail');
});

test('malformed legacy JSON is quarantined instead of silently discarded', () => {
  const snapshot = legacyReader.readSnapshot(memoryStorage({
    'hwCourses:v2': '{broken',
    'hwTasks:v2': JSON.stringify({ not: 'an array' })
  }));
  assert.equal(snapshot.courses.length, 0);
  assert.equal(snapshot.tasks.length, 0);
  assert.deepEqual(snapshot.quarantine.map((item) => item.reason).sort(), ['expected-array', 'malformed-json']);
});

test('interrupted and repeated migrations are idempotent', () => {
  const interrupted = { courses: [{ id: 'a', name: 'Algebra' }], tasks: [], migrations: { legacyHomework: { status: 'started' } } };
  const legacy = { courses: [{ id: 'a', name: 'Algebra' }], tasks: [{ id: 'x', title: 'Worksheet', courseId: 'a' }] };
  const completed = canonical.mergeLegacy(interrupted, legacy, { now: NOW });
  const repeated = canonical.mergeLegacy(completed, { courses: [{ id: 'new', name: 'Should not reimport' }], tasks: [] }, { now: '2026-07-10T00:00:00.000Z' });
  assert.equal(completed.courses.length, 1);
  assert.equal(completed.tasks.length, 1);
  assert.deepEqual(repeated, completed);
});

test('course and assignments commit as one transaction and rollback on persistence failure', () => {
  const store = canonical.createStore({});
  let persisted = { courses: [], tasks: [] };
  let fail = false;
  store.configure({
    getWorkspace: () => persisted,
    setWorkspace: (next) => { persisted = next; },
    readLegacy: () => ({ courses: [], tasks: [] }),
    persist: (reason) => { if (fail && reason !== 'homework-migration') throw new Error('disk full'); }
  });
  store.transact((workspace) => {
    workspace.courses.push({ id: 'c', name: 'Calculus' });
    workspace.tasks.push({ id: 't', title: 'Limits', courseId: 'c' });
  }, { reason: 'batch' });
  assert.equal(persisted.courses.length, 1);
  assert.equal(persisted.tasks[0].courseId, 'c');
  const before = store.getSnapshot();
  fail = true;
  assert.throws(() => store.transact((workspace) => workspace.tasks.push({ id: 'bad', title: 'Lost' }), { reason: 'fail' }), /disk full/);
  assert.deepEqual(store.getSnapshot(), before);
  assert.deepEqual(persisted, before);
});

test('normalization rejects unsafe URLs, repairs duplicate IDs, and records orphans', () => {
  const workspace = canonical.normalizeWorkspace({
    courses: [{ id: 'same', name: 'A' }, { id: 'same', name: 'A duplicate' }],
    tasks: [
      { id: 'dup', title: 'One', courseId: 'missing', sourceUrl: 'javascript:alert(1)' },
      { id: 'dup', title: 'Two', courseId: 'same' }
    ]
  }, { now: NOW });
  assert.equal(new Set(workspace.tasks.map((item) => item.id)).size, workspace.tasks.length);
  assert.equal(workspace.tasks[0].sourceUrl, '');
  assert.equal(workspace.tasks[0].orphanedCourseId, 'missing');
});
