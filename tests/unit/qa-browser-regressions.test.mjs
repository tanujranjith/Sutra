import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { extractBalancedBlock, extractFunction } from '../helpers/extract-function.mjs';

const appSource = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

function functionBody(source, name) {
  const declaration = extractFunction(source, name);
  assert.ok(declaration, `expected ${name} in source`);
  return declaration.body;
}

function makeElement(initial = {}) {
  return {
    value: '',
    textContent: '',
    hidden: false,
    checked: false,
    open: false,
    dataset: {},
    options: [],
    listeners: {},
    ...initial,
    addEventListener(type, callback) { this.listeners[type] = callback; },
    replaceChildren() { this.options = []; },
    appendChild(option) { this.options.push(option); },
    focus() {}
  };
}

test('saving a live Assistant reply retains its review payload but strips it from durable history', () => {
  const proposal = 'Review this task.\n```flow-actions\n[{"type":"create_task","title":"QA Review"}]\n```';
  const context = vm.createContext({
    convo: [{ role: 'assistant', content: '<think>hidden</think>' + proposal, claimType: 'proposed_action' }],
    current: { title: 'QA' },
    ensureCurrentConversation() { return context.current; },
    getCurrentProviderModelLabels: () => ({}),
    inferChatTitle: () => 'QA', writeAssistantSessionHistory: () => {}, persistChatStore: () => {},
    localStorage: { removeItem() {} }, window: {}, console
  });
  vm.runInContext([
    functionBody(appSource, 'stripAssistantHiddenPayloads'),
    functionBody(appSource, 'sanitizeAssistantChatMessage'),
    functionBody(appSource, 'saveConvo'),
    'saveConvo();'
  ].join('\n'), context);
  assert.ok(context.convo[0].content.includes('```flow-actions'));
  assert.ok(!context.convo[0].content.includes('<think>'));
  assert.equal(context.current.messages[0].content, 'Review this task.');
  assert.equal(context.current.messages[0].claimType, 'proposed_action');
});

test('Quick Capture clears the previous draft before parsing a new prefill', () => {
  const ids = [
    'quickCaptureInput', 'quickCapturePreview', 'quickCaptureType', 'quickCaptureDate',
    'quickCaptureTime', 'quickCaptureApSubject', 'quickCapturePriority',
    'quickCaptureDifficulty', 'quickCaptureEstimate', 'quickCaptureNotes',
    'quickCaptureCourse', 'quickCaptureNewCourse', 'quickCaptureTitle',
    'quickCaptureSubmitBtn', 'quickCaptureBlockTime'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, makeElement()]));
  const details = makeElement({ open: true });
  const modal = makeElement({
    dataset: {},
    classList: { add() {} },
    setAttribute() {},
    querySelector(selector) {
      const id = selector.startsWith('#') ? selector.slice(1) : '';
      if (id === 'quickCaptureBlockTimeField' || id === 'quickCaptureBlockTimeLabel' || id === 'quickCaptureCourseField' || id === 'quickCaptureCourseHelp' || id === 'quickCaptureApSubjectField' || id === 'quickCaptureApSubjectHelp' || id === 'quickCaptureCancelBtn') {
        return elements[id] || makeElement();
      }
      return elements[id] || null;
    },
    querySelectorAll(selector) { return selector === '.quick-capture-details' ? [details] : []; }
  });
  const stale = {
    quickCaptureDate: '2026-02-10', quickCaptureTime: '16:30', quickCapturePriority: 'high',
    quickCaptureDifficulty: 'hard', quickCaptureEstimate: '90', quickCaptureNotes: 'old note',
    quickCaptureNewCourse: 'Old class'
  };
  Object.entries(stale).forEach(([id, value]) => { elements[id].value = value; });
  elements.quickCaptureNewCourse.hidden = false;
  elements.quickCaptureType.value = 'homework';
  elements.quickCaptureCourse.value = '__new__';
  elements.quickCaptureApSubject.value = 'old-subject';
  elements.quickCaptureBlockTime.checked = true;

  let parserSnapshot = null;
  const openQuickCaptureModal = new Function(
    'document', 'window', 'parseQuickCaptureText', 'refreshEnhancedDateTimeInputs',
    'syncQuickCaptureApSubjectField', 'syncQuickCaptureCourseField',
    'estimateQuickCaptureMinutes', 'formatQuickCaptureEstimate', 'closeQuickCaptureModal',
    'submitQuickCapture', 'setTimeout',
    `${functionBody(appSource, 'openQuickCaptureModal')}; return openQuickCaptureModal;`
  )(
    { getElementById: id => id === 'quickCaptureModal' ? modal : null, createElement: () => makeElement() },
    { refreshCustomSelects() {} },
    text => {
      parserSnapshot = {
        text,
        date: elements.quickCaptureDate.value,
        time: elements.quickCaptureTime.value,
        priority: elements.quickCapturePriority.value,
        difficulty: elements.quickCaptureDifficulty.value,
        estimate: elements.quickCaptureEstimate.value,
        notes: elements.quickCaptureNotes.value,
        newCourse: elements.quickCaptureNewCourse.value,
        newCourseHidden: elements.quickCaptureNewCourse.hidden,
        detailsOpen: details.open,
        blockTime: elements.quickCaptureBlockTime.checked
      };
      return null;
    },
    () => {},
    () => ({ subjects: [], selectedSubject: null }),
    () => ({ selectedCourse: null, isNew: false }),
    () => 0,
    minutes => `${minutes} min`,
    () => {},
    () => {},
    () => {}
  );

  openQuickCaptureModal('fresh capture');

  assert.deepEqual(parserSnapshot, {
    text: 'fresh capture', date: '', time: '', priority: 'medium', difficulty: 'medium',
    estimate: '', notes: '', newCourse: '', newCourseHidden: true, detailsOpen: false,
    blockTime: false
  });
});

test('exam countdown uses validated local calendar days across the spring DST transition', () => {
  const originalTz = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const now = new Date(2026, 2, 8, 12, 0, 0);
    class FixedDate extends Date {
      constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
      static now() { return now.getTime(); }
    }
    const daysLeft = new Function('Date', `${functionBody(appSource, '_examDaysLeft')}; return _examDaysLeft;`)(FixedDate);

    assert.equal(daysLeft('2026-03-08'), 0, 'an exam later today is still zero calendar days away');
    assert.equal(daysLeft('2026-03-09'), 1, 'the spring-forward day does not shorten a calendar day');
    assert.equal(daysLeft('2026-03-07'), -1);
    assert.equal(daysLeft('2026-02-30'), null, 'impossible date-only values are rejected');
    assert.equal(daysLeft('not-a-date'), null);
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }
});

test('_examMeta routes standard and custom exam dates through the canonical countdown', () => {
  const calls = [];
  const examDaysLeft = date => { calls.push(date); return 17; };
  const testingHub = {
    custom: [{ id: 'custom-gre', name: 'GRE', examDate: '2026-06-10', tasks: [], mistakes: [] }]
  };
  const profile = {
    name: 'SAT', examDate: '2026-07-02', tasks: [], mistakes: [], practiceTests: []
  };
  const examMeta = new Function(
    '_examDaysLeft', 'testingHub', 'getExamProfile',
    `${functionBody(appSource, '_examMeta')}; return _examMeta;`
  )(examDaysLeft, testingHub, () => profile);

  assert.equal(examMeta('custom:custom-gre').daysLeft, 17);
  assert.equal(examMeta('sat').daysLeft, 17);
  assert.deepEqual(calls, ['2026-06-10', '2026-07-02']);
});

function makeEssayOrganizerConfig() {
  const config = extractBalancedBlock(appSource, 'essayOrganizer: {');
  assert.ok(config, 'expected the essay organizer field configuration');
  return new Function(
    'COLLEGE_ESSAY_TYPES', 'COLLEGE_ESSAY_REVIEWER_STATUSES', 'createCollegeEssayRow',
    `const ADD_ITEM_FIELD_CONFIGS = { ${config.body} }; return ADD_ITEM_FIELD_CONFIGS.essayOrganizer;`
  )([], [], seed => seed);
}

function saveEssayWordTarget(value) {
  const config = makeEssayOrganizerConfig();
  const rows = [];
  const body = {
    querySelector(selector) {
      if (selector === '[data-field-key="wordTarget"]') return { value };
      return null;
    }
  };
  const save = new Function(
    'document', 'getCollegeAppRows', 'persistAppData', 'renderCollegeAppWorkspace',
    'closeAddItemModal', 'config', 'body', 'rows',
    `let _addItemModalContext = { collectionKey: 'essayOrganizer', workspace: 'collegeapp', config };
     ${functionBody(appSource, 'saveAddItemModal')}
     saveAddItemModal(); return rows;`
  )(
    { getElementById: id => id === 'addItemModalBody' ? body : null },
    () => rows,
    () => {},
    () => {},
    () => {},
    config,
    body,
    rows
  );
  return save[0];
}

test('blank essay word targets stay null while an explicit zero stays numeric', () => {
  const blank = saveEssayWordTarget('');
  const zero = saveEssayWordTarget('0');

  assert.equal(blank.wordTarget, null);
  assert.equal(zero.wordTarget, 0);
});

function makeLifeCalculator() {
  const expr = { textContent: '' };
  const result = { textContent: '' };
  const context = vm.createContext({
    document: {
      getElementById(id) {
        if (id === 'lifeCalcExpr') return expr;
        if (id === 'lifeCalcResult') return result;
        return null;
      }
    },
    window: {}
  });
  const start = appSource.indexOf("            let calcExpr = '';");
  const end = appSource.indexOf('            const lifeCalcButtons =', start);
  assert.ok(start >= 0 && end > start, 'expected the Life Quick Calculator controller block');
  const controller = appSource.slice(start, end);
  vm.runInContext(`${controller}\nwindow.__lifeCalc = {
    press: calcHandleButton,
    evaluate: calcTryEval,
    state: () => ({ expression: calcExpr, justEvalued: calcJustEvaled })
  };`, context, { filename: 'life-quick-calculator.js' });
  return { calc: context.window.__lifeCalc, expr, result };
}

test('Life Quick Calculator reports invalid input and keeps it editable', () => {
  const { calc, result } = makeLifeCalculator();
  calc.press('(');
  calc.press('2');
  calc.press('+');
  calc.press('3');
  calc.press('=');

  assert.equal(result.textContent, 'Error');
  assert.equal(calc.state().expression, '(2+3');

  calc.press('backspace');
  assert.equal(calc.state().expression, '(2+');
  assert.notEqual(result.textContent, 'Error');
  calc.press('3');
  calc.press(')');
  calc.press('=');
  assert.equal(result.textContent, '5');
});

test('Life Quick Calculator keeps unary negatives and rejects unmatched parentheses', () => {
  const { calc, result } = makeLifeCalculator();

  assert.equal(calc.evaluate('(2+3'), null);
  assert.equal(calc.evaluate('2+3)'), null);
  assert.equal(calc.evaluate('-(2+3)'), -5);

  for (const action of ['−', '3', '×', '−', '2', '=']) calc.press(action);
  assert.equal(result.textContent, '6');
});
