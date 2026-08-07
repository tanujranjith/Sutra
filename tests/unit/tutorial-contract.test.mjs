import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

test('interactive tutorial offers a short restartable essentials path', () => {
  assert.match(source, /function startInteractiveTutorial\(forceStart = false, options = \{\}\)/);
  assert.match(source, /getTutorialSteps\(options\.essentialsOnly === true\)/);
  assert.match(source, /Quick start tour \(5 essentials\)/);
  assert.match(source, /rerun-onboarding/);
});
