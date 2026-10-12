import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';
const source = readFileSync(new URL('../../src/features/workspace/custom-tabs.js', import.meta.url), 'utf8');
const calculate = new Function(extractFunction(source, 'evalExpression').body + ';return evalExpression;')();
test('calculator handles unary signs without changing multiplication precedence', () => {
  for (const [expression, result] of [['2 * -3', -6], ['8 / -2', -4], ['-(2 + 3)', -5], ['--3', 3], ['2+-3', -1], ['-2*-3', 6], ['2 * +3', 6], ['1+2*3', 7], ['(-2)*(-3+1)', 4]]) assert.equal(calculate(expression), result, expression);
});
test('calculator rejects malformed, non-arithmetic, and non-finite expressions', () => {
  for (const expression of ['2abc+3', '2(3)', '()', '1..2', '2+', '*/2', '(2+3', '2/0', 'alert(1)', '2**3']) assert.equal(calculate(expression), null, expression);
});
