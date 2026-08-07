import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

test('onboarding remains skippable, preserves choices, and points students to the daily loop', () => {
  assert.match(app, /completed: false,[\s\S]*skipped: false,[\s\S]*currentStep: 'welcome'/);
  assert.match(app, /function showStudentOnboarding\(\) \{ AtelierOnboardingController\.show\(\); \}/);
  assert.match(app, /Remind me later/);
  assert.match(app, /Capture your first assignment/);
  assert.match(app, /Advanced features[\s\S]*available in Settings/);
});
