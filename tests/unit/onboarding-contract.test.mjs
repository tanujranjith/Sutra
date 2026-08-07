import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const app = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

test('onboarding defaults are local-first, skippable, and start at welcome', () => {
  const extract = extractFunction(app, 'getDefaultAppData');
  assert.ok(extract, 'getDefaultAppData is a top-level declaration');
  const start = extract.body.indexOf('onboarding: {');
  const end = extract.body.indexOf('temporaryPages: {', start);
  assert.ok(start >= 0 && end > start, 'the onboarding defaults live inside getDefaultAppData');
  const onboarding = extract.body.slice(start, end);
  assert.ok(onboarding.includes('completed: false'), 'onboarding starts incomplete');
  assert.ok(onboarding.includes('skipped: false'), 'onboarding starts unskipped');
  assert.ok(onboarding.includes("currentStep: 'welcome'"), 'onboarding starts at the welcome step');
  assert.ok(onboarding.includes("aiSetup: { provider: 'local'"), 'the default AI setup is the local provider');
  assert.ok(onboarding.includes('backupAcknowledged: false'), 'backup acknowledgement is never assumed');
  assert.ok(onboarding.includes('migratedFromLegacy: false'), 'legacy migration is never assumed');
});

test('onboarding opens through the unified controller and can be re-run', () => {
  const show = extractFunction(app, 'showStudentOnboarding');
  assert.ok(show, 'showStudentOnboarding is a top-level declaration');
  assert.ok(show.body.includes('AtelierOnboardingController.show()'), 'the wrapper delegates to the unified controller');
  const setup = extractFunction(app, 'showUserModeSetup');
  assert.ok(setup, 'showUserModeSetup is a top-level declaration');
  assert.ok(setup.body.includes("jumpTo: 'welcome'"), 're-running setup returns to the welcome step');
});

test('onboarding screens offer deferral and point students at the daily loop', () => {
  const protect = extractFunction(app, 'renderProtectStep');
  assert.ok(protect, 'renderProtectStep is a top-level declaration');
  assert.ok(protect.body.includes('Remind me later'), 'backup deferral is available');
  const finish = extractFunction(app, 'renderFinishStep');
  assert.ok(finish, 'renderFinishStep is a top-level declaration');
  assert.ok(finish.body.includes('Capture your first assignment'), 'finish step hands off to the daily loop');
  const mode = extractFunction(app, 'renderModeStep');
  assert.ok(mode, 'renderModeStep is a top-level declaration');
  assert.match(mode.body, /Advanced features[\s\S]*available in Settings/);
});
