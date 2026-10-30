import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';
const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function load(name, dependencies = {}) {
  return new Function(...Object.keys(dependencies), (source.includes('async function ' + name + '(') ? 'async ' : '') + extractFunction(source, name).body + ';return ' + name + ';')(...Object.values(dependencies));
}

test('setting choices preserve canonical Current view casing and reject unknown values', () => {
  const normalize = load('normalizeSettingChoice');
  const choices = ['minimal', 'currentView', 'workspace'];
  for (const input of ['currentView', 'currentview', ' CURRENTVIEW ']) {
    assert.equal(normalize(input, choices, 'workspace'), 'currentView');
  }
  assert.equal(normalize('read_everything', choices, 'currentView'), 'currentView');
  assert.equal(normalize(undefined, choices, 'currentView'), 'currentView');
  assert.equal(normalize(' HIGH ', ['low', 'medium', 'high'], 'medium'), 'high');
});

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
  // Simulate a west-of-UTC host deterministically: local calendar construction
  // preserves October 7, while parsing UTC midnight as a date-only string lands
  // on October 6. This keeps the regression visible on UTC CI runners too.
  class WestOfUtcDate {
    constructor(...args) {
      let [year, month, day] = args;
      if (args.length === 1 && typeof args[0] === 'string') {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(args[0]);
        [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3]) - 1];
      } else {
        month += 1;
      }
      this.year = year;
      this.month = month;
      this.day = day;
    }
    getDate() { return this.day; }
    toLocaleDateString() {
      return `${this.year}-${String(this.month).padStart(2, '0')}-${String(this.day).padStart(2, '0')}`;
    }
  }
  const parseDate = load('parseDate', { Date: WestOfUtcDate });
  const meta = { examDate: '2026-10-07', name: 'SAT', daysLeft: 1, studyStatus: 'planning', practiceCount: 0, unresolvedMistakes: 0 };
  const dependencies = { Date: WestOfUtcDate, parseDate, escapeHtml: value => String(value), _examMeta: () => meta, _isExamTaken: () => false, _examOfficialResult: () => null, _storedExamOfficialResult: () => null, _examLifecycleLabel: () => 'Upcoming', _examIdIcon: () => 'fa-book' };
  const render = load('_renderExamCard', dependencies);
  assert.ok(render('sat').includes('2026-10-07'));
  assert.ok(!render('sat').includes('2026-10-06'), 'UTC-midnight parsing would show the previous local day');
  assert.equal(parseDate(meta.examDate).getDate(), 7);
  const group = load('_renderExamGroupCard', { Date: WestOfUtcDate, parseDate, escapeHtml: value => String(value), _examGroupMeta: () => ({ ...meta, total: 2, remaining: 2, practice: 0, mistakes: 0 }) });
  assert.ok(group({ key: 'sat-act', label: 'SAT/ACT' }).includes('2026-10-07'));
  assert.ok(!group({ key: 'sat-act', label: 'SAT/ACT' }).includes('2026-10-06'));
});

function loadExamLifecycle(testingHub) {
  const takenExamsMap = load('_takenExamsMap', { testingHub });
  const isExamTaken = load('_isExamTaken', { _takenExamsMap: takenExamsMap });
  const examTakenAt = load('_examTakenAt', { _takenExamsMap: takenExamsMap });
  const storedResult = load('_storedExamOfficialResult', { testingHub });
  const examOfficialResult = load('_examOfficialResult', { _storedExamOfficialResult: storedResult, _examTakenAt: examTakenAt });
  const examLifecycleLabel = load('_examLifecycleLabel', { _isExamTaken: isExamTaken, _examOfficialResult: examOfficialResult });
  const computeNextAction = load('computeExamNextAction', {
    _examDaysLeft: () => 60,
    _isExamTaken: isExamTaken,
    _examOfficialResult: examOfficialResult,
    _examLifecycleLabel: examLifecycleLabel,
    _toNum: value => Number.isFinite(Number(value)) ? Number(value) : null,
    rankWeakAreas: () => []
  });
  return { examOfficialResult, examLifecycleLabel, computeNextAction };
}

test('exam lifecycle distinguishes upcoming, pending, and recorded official results', () => {
  const testingHub = {
    takenExams: {},
    officialResults: {
      sat: { examDate: '2026-10-10', totalScore: '1550' }
    }
  };
  const lifecycle = loadExamLifecycle(testingHub);
  const profile = {
    examDate: '2027-04-01',
    currentScore: '1500',
    practiceTests: [{ date: '2026-10-01', totalScore: '1520' }],
    mistakes: []
  };
  const config = { terminology: { practiceUnit: 'module', diagnostic: 'practice test' }, sections: [] };

  // A matching score, current score, and practice history do not establish that
  // the exam was taken or make a result official without its taken marker.
  assert.equal(lifecycle.examOfficialResult('sat'), null);
  assert.equal(lifecycle.examLifecycleLabel('sat'), 'Upcoming');
  const upcomingAction = lifecycle.computeNextAction('sat', profile, config);
  assert.notEqual(upcomingAction.actionLabel, 'Edit result');
  assert.doesNotMatch(upcomingAction.detail, /Official result|1550/);

  // A result from the previous sitting stays hidden when the taken marker moves
  // to a new date; the next action asks for the new official result.
  testingHub.takenExams.sat = '2026-10-12';
  assert.equal(lifecycle.examOfficialResult('sat'), null);
  assert.equal(lifecycle.examLifecycleLabel('sat'), 'Taken · results pending');
  const pendingAction = lifecycle.computeNextAction('sat', profile, config);
  assert.equal(pendingAction.actionLabel, 'Record result');
  assert.match(pendingAction.detail, /Record the official result/);
  assert.doesNotMatch(pendingAction.detail, /1550/);

  const recorded = { examDate: '2026-10-12', totalScore: '1560', sourceMetadata: { importedFrom: 'legacy' } };
  testingHub.officialResults.sat = recorded;
  assert.deepEqual(lifecycle.examOfficialResult('sat'), recorded);
  assert.equal(lifecycle.examLifecycleLabel('sat'), 'Result recorded');
  const recordedAction = lifecycle.computeNextAction('sat', profile, config);
  assert.equal(recordedAction.actionLabel, 'Edit result');
  assert.match(recordedAction.detail, /Official result: 1560/);
});

test('official result normalization preserves unknown result fields across reloads', () => {
  const normalize = load('normalizeTestingHub', {
    getDefaultTestingHub: () => ({}),
    normalizeCustomExam: value => value,
    TESTING_HUB_CORE_EXAMS: [],
    TESTING_HUB_SECTIONS: ['dashboard']
  });
  const original = {
    officialResults: {
      sat: {
        examDate: '2026-10-12',
        totalScore: '1560',
        sourceMetadata: { importedFrom: 'legacy', revision: 2 }
      }
    }
  };

  const firstPass = normalize(original);
  const reloaded = normalize(JSON.parse(JSON.stringify(firstPass)));

  assert.deepEqual(reloaded.officialResults.sat.sourceMetadata, { importedFrom: 'legacy', revision: 2 });
  assert.equal(reloaded.officialResults.sat.totalScore, '1560');
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


test('official result editor cancels atomically and rejects a stale taken marker', async () => {
  for (const scenario of ['cancel-date', 'cancel-score', 'stale', 'save']) {
    const testingHub = { takenExams: { sat: '2026-10-10' }, officialResults: {} };
    let prompts = 0, commits = 0;
    const notices = [];
    const edit = load('editTestingHubExamResult', {
      testingHub, resolveTestingHubExamId: id => id === 'sat' ? id : null,
      _examTakenAt: id => testingHub.takenExams[id], _examMeta: () => ({ examDate: '2026-10-10' }),
      _examDaysLeft: () => -5, showToast: message => notices.push(message),
      atelierPrompt: async () => {
        prompts += 1;
        if (prompts === 1) return scenario === 'cancel-date' ? null : '2026-10-10';
        if (scenario === 'stale') testingHub.takenExams.sat = '2026-10-11';
        return scenario === 'cancel-score' ? null : '1450';
      },
      _setExamTaken: () => { commits += 1; }
    });
    await edit('sat');
    assert.equal(commits, scenario === 'save' ? 1 : 0, scenario);
    if (scenario === 'save') assert.equal(testingHub.officialResults.sat.totalScore, '1450');
    else assert.deepEqual(testingHub.officialResults, {}, scenario + ' must not partially save');
    if (scenario === 'stale') assert.match(notices[0], /changed while/);
  }
});

test('Assistant status setter returns canonical undo state for an unpinned exam', () => {
  const testingHub = { takenExams: { sat: '2026-06-06' } };
  const profile = { studyStatus: 'ready' };
  const setStatus = load('setTestingHubExamStatus', {
    resolveTestingHubExamId: () => 'sat', _isExamTaken: id => !!testingHub.takenExams[id],
    _examTakenAt: id => testingHub.takenExams[id] || null, _examProfileFor: () => profile,
    _setExamTaken: (id, taken, date) => { if (taken) testingHub.takenExams[id] = date || '2026-10-15'; else delete testingHub.takenExams[id]; },
    _examMeta: () => ({ name: 'SAT', studyStatus: profile.studyStatus }), _examIdLabel: () => 'SAT', persistAppData() {}
  });
  const result = setStatus('SAT', { taken: false });
  assert.deepEqual(result.previousState, { id: 'sat', taken: true, takenAt: '2026-06-06', studyStatus: 'ready' });
  setStatus('sat', { ...result.previousState });
  assert.equal(testingHub.takenExams.sat, '2026-06-06');
});


test('AP Battle Plan excludes finished subjects from diagnostic recommendations', () => {
  const aps = { subjects: [{ id: 'finished', name: 'Finished AP', examDate: '2026-10-15' }], units: [], practiceLogs: [] };
  const compute = load('computeApBattlePlan', { apStudyWorkspace: aps, window: { flowAtelier: { testingHub: { takenExams: { 'ap:finished': '2026-10-15' } } } } });
  assert.equal(compute().completed, true);
  assert.equal(compute().subject, null);
  assert.doesNotMatch(compute().recommendation, /diagnostic/i);
  aps.subjects.push({ id: 'next', name: 'Next AP', examDate: '2027-05-01' });
  assert.equal(compute().subject.id, 'next');
});
