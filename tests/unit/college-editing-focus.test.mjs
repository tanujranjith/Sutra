import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';
const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

test('college and major score commits persist without rebuilding editable controls', () => {
  for (const [name, key] of [['updateCollegeAppDecisionScore', 'collegeappScoreCriterion'], ['updateCollegeAppMajorDecisionScore', 'collegeappMajorScoreCriterion']]) {
    const record = { id: 'row', scores: {} }, renders = [];
    let saves = 0;
    const update = new Function('getCollegeAppRows', 'normalizeFiniteNumber', 'persistAppData', 'renderCollegeAppDecisionMatrix', 'renderCollegeAppMajorDecisionMatrix',
      extractFunction(source, name).body + ';return ' + name + ';')(
      () => [record], (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
      () => { saves++; }, preserve => renders.push(preserve), preserve => renders.push(preserve));
    const input = { dataset: { collegeappRowId: 'row', [key]: 'criterion' }, value: '8.5' };
    update(input);
    assert.equal(record.scores.criterion, 8.5);
    assert.equal(saves, 1);
    assert.deepEqual(renders, [true]);
    input.value = '50'; update(input);
    assert.equal(record.scores.criterion, 10);
    assert.equal(input.value, 10);
  }
});

test('Application Sheets checkboxes identify field and college while escaping imported labels', () => {
  const escape = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const render = new Function('getCollegeRows', 'escapeHtml', extractFunction(source, 'renderCollegeCheckboxInput').body + ';return renderCollegeCheckboxInput;')(
    () => [{ id: 'row', college: 'QA "Northstar" <College>' }], escape);
  const html = render('checklist', 'row', 'appSubmitted', true);
  assert.match(html, /aria-label="Application submitted for QA &quot;Northstar&quot; &lt;College>/);
  assert.match(html, / checked/);
});
