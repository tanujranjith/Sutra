import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Sheets = require('../../src/features/workspace/sheets-engine.js');

function book() { return Sheets.createWorkbook('Test'); }
function set(sheet, row, column, cell) { Sheets.setCell(sheet, row, column, cell); }

test('uses stable row and column ids with sparse cells', () => {
  const workbook = book(); const sheet = workbook.sheets[0];
  const key = Sheets.cellKey(sheet, 0, 0); set(sheet, 0, 0, { value: 'hello' });
  assert.equal(Object.keys(sheet.cells).length, 1); assert.match(key, /^row_[^:]+:col_/);
  set(sheet, 0, 0, { value: '' }); assert.equal(Object.keys(sheet.cells).length, 0);
});

test('evaluates arithmetic, ranges, cross-sheet formulas, and errors', () => {
  const workbook = book(); const one = workbook.sheets[0]; const two = Sheets.createSheet('Sheet2'); workbook.sheets.push(two);
  set(one, 0, 0, { value: 2 }); set(one, 1, 0, { value: 3 }); set(one, 0, 1, { formula: '=SUM(A1:A2)*2' }); set(two, 0, 0, { formula: '=Sheet1!B1+1' }); set(one, 0, 2, { formula: '=1/0' });
  const evaluation = Sheets.evaluate(workbook);
  assert.equal(evaluation.getValue(one, 0, 1), 10); assert.equal(evaluation.getValue(two, 0, 0), 11); assert.equal(evaluation.getValue(one, 0, 2).error, '#DIV/0!');
});

test('supports relative, absolute, and mixed formula fill translation', () => {
  assert.equal(Sheets.translateFormula('=A1+$B$2+C$3+$D4', 2, 1), '=B3+$B$2+D$3+$D6');
});

test('detects a cycle deterministically', () => {
  const workbook = book(); const sheet = workbook.sheets[0]; set(sheet, 0, 0, { formula: '=B1' }); set(sheet, 0, 1, { formula: '=A1' });
  assert.equal(Sheets.evaluate(workbook).getValue(sheet, 0, 0).error, '#CYCLE!');
});
