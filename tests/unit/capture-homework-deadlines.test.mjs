import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const app = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const shared = readFileSync(new URL('../../src/core/student-date-parser.js', import.meta.url), 'utf8');
const text = 'physics hw do the graph for the lab done on oct 26 due tomorrow night';
function fixture() {
  const context = vm.createContext({ window: { SutraHomework: { getCourses: () => [
    { id: 'physics', name: 'Physics C + Physics', type: 'class' },
    { id: 'photo', name: 'Photography', type: 'class' },
    { id: 'applications', name: 'Submit applications', type: 'misc' }
  ] } } });
  vm.runInContext(`const NativeDate = Date;
    Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [2026, 9, 26, 19, 0])); } };`, context);
  vm.runInContext(shared, context);
  for (const name of ['quickCaptureLocalISO', 'parseQuickCaptureDate', 'getQuickCaptureCourses', 'resolveQuickCaptureCourse', 'parseQuickCaptureText']) {
    vm.runInContext(extractFunction(app, name).body, context);
  }
  return { context, parse: value => vm.runInContext(`parseQuickCaptureText(${JSON.stringify(value)})`, context) };
}

test('Capture keeps the lab date in the title and recognizes Physics homework due tomorrow night', () => {
  const { parse } = fixture();
  for (const phrase of [text, text.replace('tomorrow', 'tmrw')]) {
    const result = parse(phrase);
    assert.equal(result.type, 'homework');
    assert.equal(result.courseId, 'physics');
    assert.equal(result.dueDate, '2026-10-27');
    assert.equal(result.dueTime, '23:59');
    assert.match(result.title, /done on oct 26/i);
    assert.doesNotMatch(result.title, /tomorrow|tmrw|night|\bhw\b/i);
  }
});

test('explicit deadline clocks beat night defaults and incidental event clocks', () => {
  const { parse } = fixture();
  for (const phrase of [
    'physics hw lab done at 9am on oct 26 due tomorrow night at 8pm',
    'physics hw lab done on oct 26 due tomorrow at 20:00'
  ]) {
    const result = parse(phrase);
    assert.equal(result.dueDate, '2026-10-27');
    assert.equal(result.dueTime, '20:00');
  }
  assert.equal(parse('physics hw lab due tomorrow night').dueTime, '23:59');
  assert.equal(parse('schedule physics study block tomorrow night').dueTime, '19:00');
});

test('Photography homework infers its exact class and tomorrow-night deadline without due', () => {
  const { parse } = fixture();
  const result = parse('submit photography hw tmrw night');
  assert.equal(result.type, 'homework');
  assert.equal(result.courseId, 'photo', 'an incidental submit activity word must not block the exact Photography name');
  assert.equal(result.courseName, 'Photography');
  assert.equal(result.dueDate, '2026-10-27');
  assert.equal(result.dueTime, '23:59');
  assert.equal(parse('submit photography hw tmrw night at 8pm').dueTime, '20:00');
});

test('inferred Photography reaches the actual course picker while explicit no-class remains respected', () => {
  const { context, parse } = fixture();
  const select = { value: '', dataset: { userTouched: '0' }, options: [],
    replaceChildren() { this.options = []; }, appendChild(option) { this.options.push(option); } };
  const fields = { quickCaptureCourse: select, quickCaptureCourseField: {}, quickCaptureNewCourse: {}, quickCaptureCourseHelp: {} };
  context.document = { createElement: () => ({}) };
  context.modal = { querySelector: selector => fields[selector.slice(1)] };
  context.parsed = parse('submit photography hw tmrw night');
  vm.runInContext(extractFunction(app, 'syncQuickCaptureCourseField').body, context);
  const selected = vm.runInContext('syncQuickCaptureCourseField(parsed, modal)', context);
  assert.equal(select.value, 'photo');
  assert.equal(selected.selectedCourse.name, 'Photography');
  select.value = '';
  select.dataset.userTouched = '1';
  assert.equal(vm.runInContext('syncQuickCaptureCourseField(parsed, modal)', context).selectedCourse, null);
  assert.equal(select.value, '');
});

test('opening Add task permits homework inference while an explicit dropdown choice still wins', () => {
  const { context } = fixture();
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', dataset: {}, options: [], style: {}, hidden: false,
      addEventListener() {}, setAttribute() {}, focus() {}, classList: { add() {}, remove() {} } });
    return elements.get(id);
  };
  const modal = { dataset: {}, querySelector: selector => element(selector.slice(1)), querySelectorAll: () => [],
    addEventListener() {}, setAttribute() {}, classList: { add() {} } };
  Object.assign(context, {
    document: { getElementById: () => modal, createElement: () => element('option') },
    setTimeout() {}, refreshEnhancedDateTimeInputs() {},
    syncQuickCaptureApSubjectField: () => ({ subjects: [], selectedSubject: null }),
    syncQuickCaptureCourseField: () => ({ selectedCourse: { id: 'physics', name: 'Physics C + Physics' }, isNew: false }),
    estimateQuickCaptureMinutes: () => 45, formatQuickCaptureEstimate: () => '45 min',
    closeQuickCaptureModal() {}, submitQuickCapture() {}
  });
  vm.runInContext(extractFunction(app, 'openQuickCaptureModal').body, context);
  vm.runInContext(`openQuickCaptureModal(${JSON.stringify(text)}, { type: 'task' })`, context);
  assert.equal(element('quickCaptureType').value, 'homework');
  assert.equal(element('quickCaptureDate').value, '2026-10-27');
  assert.equal(element('quickCaptureTime').value, '23:59');
  assert.match(element('quickCapturePreview').textContent, /Homework · Physics/);
  element('quickCaptureType').value = 'task';
  element('quickCaptureType').onchange();
  element('quickCaptureInput').oninput();
  assert.equal(element('quickCaptureType').value, 'task');
  assert.match(element('quickCapturePreview').textContent, /To-do · General/);
});
