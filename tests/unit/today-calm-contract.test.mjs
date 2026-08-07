import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../src/features/workspace/today-dashboard.js', import.meta.url), 'utf8');

test('Today keeps the daily loop and backup confidence visible in its calm default', () => {
  assert.match(source, /label: 'Calm'/);
  assert.match(source, /description: 'The daily loop first, with secondary signals tucked away\.'/);
  assert.match(source, /hidden: \['tonight', 'habits', 'tracker', 'life-signals', 'academic-planner', 'momentum'\]/);
  assert.match(source, /id: 'backup', label: 'Save & backup'/);
  assert.match(source, /id: 'next-up'/);
});
