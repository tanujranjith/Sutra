import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../src/domain/student-life.js', import.meta.url), 'utf8');

test('Life insights are bounded, actionable, and avoid medical claims', () => {
  assert.match(source, /function wellnessTrends\(workspace, options\)/);
  assert.match(source, /Stress has been high recently\. Consider reducing today to essential commitments\./);
  assert.match(source, /gentle personal trends, not medical or mental-health advice/);
  assert.match(source, /function buildEmergencyWeek\(workspace, options\)/);
});
