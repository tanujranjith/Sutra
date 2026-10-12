import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const planner = require('../../src/features/academic/grade-planner.js');
const original = {
  categories: [{ id: 'tests', name: 'Tests', weight: 100, drops: 0 }],
  entries: [{ id: 'exam-1', title: 'Unit exam', categoryId: 'tests', score: 90, maxScore: 100 }]
};

test('Semester Setup preserves score identity and grade through serialization and normalization', () => {
  const result = planner.reconcileCategories(original.categories, [{ name: ' tests ', weight: 100 }], original.entries);
  const restored = planner.normalizeCourseGrades(JSON.parse(JSON.stringify({ ...original, categories: result.categories })));
  assert.equal(restored.categories[0].id, 'tests');
  assert.equal(restored.entries[0].categoryId, 'tests');
  assert.equal(planner.computeCourseGrade(restored).percent, 90);
  assert.equal(result.retained, 0);
});

test('renamed categories keep explicit IDs and newly added categories get independent IDs', () => {
  const result = planner.reconcileCategories(original.categories, [
    { id: 'tests', name: 'Exams', weight: 80 }, { name: 'Projects', weight: 20 }
  ], original.entries);
  assert.equal(result.categories[0].id, 'tests');
  assert.notEqual(result.categories[1].id, 'tests');
  assert.equal(result.categories[0].name, 'Exams');
});

test('unmatched categories with scores survive while unused categories can be replaced', () => {
  const categories = [...original.categories, { id: 'unused', name: 'Old participation', weight: 0 }];
  const result = planner.reconcileCategories(categories, [{ name: 'Projects', weight: 100 }], original.entries);
  assert.equal(result.retained, 1);
  assert.ok(result.categories.some(category => category.id === 'tests'));
  assert.ok(!result.categories.some(category => category.id === 'unused'));
});

test('ambiguous category names never reassign existing scores to a guessed category', () => {
  const categories = [{ id: 'a', name: 'Tests', weight: 50 }, { id: 'b', name: 'Tests', weight: 50 }];
  const entries = [{ ...original.entries[0], categoryId: 'b' }];
  const result = planner.reconcileCategories(categories, [{ name: 'Tests', weight: 100 }], entries);
  assert.notEqual(result.categories[0].id, 'a');
  assert.notEqual(result.categories[0].id, 'b');
  assert.ok(result.categories.some(category => category.id === 'b'));
});
