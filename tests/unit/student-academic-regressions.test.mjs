import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';
const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function load(name, dependencies = {}) {
  return new Function(...Object.keys(dependencies), extractFunction(source, name).body + ';return ' + name + ';')(...Object.values(dependencies));
}

for (const [name, listKey, criteriaKey] of [['computeCollegeAppDecisionScores', 'decisionColleges', 'decisionCriteria'], ['computeMajorDecisionScores', 'majorDecisionMajors', 'majorDecisionCriteria']]) {
  test(name + ' excludes unrated/all-zero and zero-weight-only entries', () => {
    const rows = {
      [criteriaKey]: [{ id: 'fit', weight: 100 }, { id: 'ignored', weight: 0 }],
      [listKey]: [{ id: 'blank', name: 'Unrated', scores: {} }, { id: 'zero', scores: { fit: 0 } },
        { id: 'ignored', scores: { ignored: 10 } }, { id: 'rated', name: 'Rated', scores: { fit: 8 } }]
    };
    const compute = load(name, { getCollegeAppRows: key => rows[key], normalizeFiniteNumber: finite });
    assert.deepEqual(compute().map(item => item.id), ['rated']);
    assert.equal(compute()[0].normalizedScore, 8);
  });
}

test('unknown essay target stays blank, explicit zero and real targets round-trip', () => {
  const create = load('createCollegeEssayRow', { generateId: () => 'essay', normalizeCollegeChoice: (value, choices, fallback) => value || fallback,
    COLLEGE_ESSAY_DRAFT_STATUSES: [], COLLEGE_ESSAY_TYPE_VALUES: [], COLLEGE_ESSAY_REVIEWER_VALUES: [],
    clampWholeNumber: (value, fallback, min, max) => Math.max(min, Math.min(max, Math.round(Number(value)))) });
  for (const wordTarget of [undefined, null, '', ' ']) assert.equal(create({ wordTarget }).wordTarget, null);
  for (const wordTarget of [0, 650]) assert.equal(create(JSON.parse(JSON.stringify(create({ wordTarget })))).wordTarget, wordTarget);
});

test('SAT/ACT cards display the local date-only value instead of UTC midnight', () => {
  const parseDate = load('parseDate');
  const meta = { examDate: '2026-10-07', name: 'SAT', daysLeft: 1, studyStatus: 'planning', practiceCount: 0, unresolvedMistakes: 0 };
  const dependencies = { parseDate, escapeHtml: value => String(value), _examMeta: () => meta, _isExamTaken: () => false, _examIdIcon: () => 'fa-book' };
  const render = load('_renderExamCard', dependencies);
  assert.ok(render('sat').includes(parseDate(meta.examDate).toLocaleDateString()));
  assert.equal(parseDate(meta.examDate).getDate(), 7);
  const group = load('_renderExamGroupCard', { parseDate, escapeHtml: value => String(value), _examGroupMeta: () => ({ ...meta, total: 2, remaining: 2, practice: 0, mistakes: 0 }) });
  assert.ok(group({ key: 'sat-act', label: 'SAT/ACT' }).includes(parseDate(meta.examDate).toLocaleDateString()));
});

for (const sourceVersion of ['v1', 'v2']) {
  test('Homework notes and URL edits preserve IDs, metadata, and clearable values: ' + sourceVersion, () => {
    let row = { id: 'task-1', title: 'Essay', notes: 'Imported note', sourceUrl: 'https://school.example/old', future: { rubric: 5 } };
    const update = load('updateHomeworkTaskInStorage', {
      normalizePriorityValue: value => value || 'medium', normalizeDifficultyValue: value => value || 'medium',
      parseHomeworkDueDate: value => value, parseHomeworkDueTime: value => value,
      normalizeExternalUrl: value => value || null, readLocalArraySafe: () => [structuredClone(row)],
      writeLocalArraySafe: (key, list) => { row = JSON.parse(JSON.stringify(list[0])); return true; },
      window: { dispatchEvent() {} }, CustomEvent: class {}, console
    });
    const task = { origin: 'homework', homeworkSource: sourceVersion, homeworkSourceId: 'task-1', dueDate: '2026-10-07' };
    assert.equal(update(task, { notes: 'Edited note', referenceUrl: 'https://school.example/new', dueDate: '' }), true);
    assert.equal(row.notes, 'Edited note');
    assert.equal(row.sourceUrl, 'https://school.example/new');
    assert.equal(row.dueDate, '');
    assert.deepEqual(row.future, { rubric: 5 });
    assert.equal(update(task, { notes: '', referenceUrl: '' }), true);
    assert.equal(row.notes, '');
    assert.equal(row.sourceUrl, '');
  });
}
