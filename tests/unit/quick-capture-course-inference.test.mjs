import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const appSource = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

function buildQuickCaptureParser(courses) {
  const window = {
    SutraHomework: { getCourses: () => courses },
    SutraStudentDateParser: null
  };
  const context = vm.createContext({ window, localStorage: {} });

  // Keep date interpretation fixed so these tests focus on course routing.
  // Deliberately do not provide readLocalArraySafe: the resolver must use the
  // public Homework facade rather than a helper scoped inside app.js's IIFE.
  context.parseQuickCaptureDate = phrase => {
    if (/sunday night/i.test(phrase)) {
      return { date: '2026-10-11', match: 'sunday night', kind: 'weekday' };
    }
    if (/friday/i.test(phrase)) {
      return { date: '2026-10-09', match: 'friday', kind: 'weekday' };
    }
    return null;
  };

  const functions = [
    'getQuickCaptureCourses',
    'resolveQuickCaptureCourse',
    'parseQuickCaptureText'
  ].map(name => {
    const declaration = extractFunction(appSource, name);
    assert.ok(declaration, `expected ${name} in src/core/app.js`);
    return declaration.body;
  });
  vm.runInContext(functions.join('\n'), context, { filename: 'quick-capture-parser.js' });
  return text => vm.runInContext(`parseQuickCaptureText(${JSON.stringify(text)})`, context);
}

test('Quick Capture infers a named Homework activity through the public Homework facade', () => {
  const parse = buildQuickCaptureParser([
    { id: 'activity-ceg', name: 'CEG', type: 'misc' }
  ]);

  const result = parse('CEG do the revisions found in revisions doc in create tab due sunday night');

  assert.equal(result.type, 'homework');
  assert.equal(result.courseId, 'activity-ceg');
  assert.equal(result.courseName, 'CEG');
  assert.equal(result.dueDate, '2026-10-11');
});

test('Quick Capture keeps existing class-name and shorthand inference working', () => {
  const parse = buildQuickCaptureParser([
    { id: 'chemistry-class', name: 'Chemistry', type: 'class' }
  ]);

  const result = parse('chem lab due Friday');

  assert.equal(result.type, 'homework');
  assert.equal(result.courseId, 'chemistry-class');
  assert.equal(result.courseName, 'Chemistry');
});

test('Quick Capture does not match a short course name inside a longer word', () => {
  const parse = buildQuickCaptureParser([
    { id: 'activity-ceg', name: 'CEG', type: 'misc' }
  ]);

  const result = parse('The ceiling revisions are due Sunday night');

  assert.equal(result.courseId, '');
  assert.equal(result.courseName, '');
});

test('Quick Capture keeps a manually selected class when inference finds another course', () => {
  const courses = [
    { id: 'activity-ceg', name: 'CEG', type: 'misc' },
    { id: 'manual-class', name: 'English', type: 'class' }
  ];
  const window = { SutraHomework: { getCourses: () => courses } };
  const field = { hidden: true };
  const select = {
    value: 'manual-class',
    dataset: { userTouched: '1' },
    options: [],
    replaceChildren() { this.options = []; },
    appendChild(option) { this.options.push(option); }
  };
  const modal = {
    querySelector(selector) {
      if (selector === '#quickCaptureCourseField') return field;
      if (selector === '#quickCaptureCourse') return select;
      if (selector === '#quickCaptureNewCourse') return { hidden: true, value: '' };
      if (selector === '#quickCaptureCourseHelp') return { textContent: '' };
      return null;
    }
  };
  const context = vm.createContext({
    window,
    document: { createElement: () => ({ value: '', textContent: '' }) }
  });
  const declarations = ['getQuickCaptureCourses', 'syncQuickCaptureCourseField'].map(name => {
    const declaration = extractFunction(appSource, name);
    assert.ok(declaration, `expected ${name} in src/core/app.js`);
    return declaration.body;
  });
  vm.runInContext(declarations.join('\n'), context);
  context.modal = modal;
  context.parsed = { type: 'homework', courseId: 'activity-ceg', classHint: '' };

  const result = vm.runInContext('syncQuickCaptureCourseField(parsed, modal)', context);

  assert.equal(select.value, 'manual-class');
  assert.equal(result.selectedCourse.id, 'manual-class');
  assert.equal(result.selectedCourse.name, 'English');
});
