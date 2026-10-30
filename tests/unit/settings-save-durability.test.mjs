import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const applyDeclaration = extractFunction(source, 'applySettingsDraftChanges');
const updateUiDeclaration = extractFunction(source, 'updateSettingsDraftUi');
const revertDeclaration = extractFunction(source, 'revertSettingsDraftChanges');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function classList() {
  const values = new Set();
  return {
    values,
    add(name) { values.add(name); },
    remove(name) { values.delete(name); },
    contains(name) { return values.has(name); },
    toggle(name, force) {
      const shouldHave = force === undefined ? !values.has(name) : !!force;
      if (shouldHave) values.add(name);
      else values.delete(name);
      return shouldHave;
    }
  };
}

function createSettingsHarness() {
  const drafts = new Map();
  const activePreferences = {
    studentPreferences: {
      schoolStartHour: 8,
      schoolEndHour: 14.25
    }
  };
  const events = [];
  const toasts = [];
  const flushCalls = [];
  const flushQueue = [];
  const timers = [];
  const ccPage = { dataset: {}, classList: classList() };
  const settingsRoot = {
    classList: classList(),
    querySelector(selector) { return selector === '.cc-page' ? ccPage : null; }
  };
  const statusText = { textContent: '' };
  const statusPill = {
    textContent: '',
    dataset: {},
    querySelector(selector) { return selector === '.cc-status-text' ? statusText : null; }
  };
  const controls = {
    settingsUnsavedText: { textContent: '' },
    settingsActionBar: { dataset: {} },
    settingsApplyBtn: { disabled: false },
    settingsRevertBtn: { disabled: false },
    settingsApplyBtnTop: { disabled: false },
    settingsRevertBtnTop: { disabled: false },
    settingsResetSectionBtn: { textContent: '' }
  };
  const elements = {
    'view-settings': settingsRoot,
    settingsStatusPill: statusPill,
    ...controls
  };
  const document = {
    getElementById(id) { return elements[id] || null; },
    querySelector(selector) {
      if (selector === '#view-settings .cc-page') return ccPage;
      return null;
    },
    querySelectorAll() { return []; }
  };

  let updateUi = () => {};
  const dependencies = {
    document,
    activePreferences,
    settingsDraftValues: drafts,
    settingsSavePending: false,
    settingsSaveError: '',
    settingsLastAppliedAt: 123,
    setWorkspacePreference(path, value, options) {
      events.push({ type: 'apply-preference', path, value, options });
      const segments = path.split('.');
      let target = activePreferences;
      for (const segment of segments.slice(0, -1)) target = target[segment];
      target[segments[segments.length - 1]] = value;
    },
    applyWorkspacePreferences(options) { events.push({ type: 'refresh-preferences', options }); },
    persistAppData() { events.push({ type: 'schedule-workspace-save' }); },
    reportError(error, context) { events.push({ type: 'report-error', name: error && error.name, context }); },
    flushAppSaveNow(reason) {
      flushCalls.push(reason);
      const next = flushQueue.shift();
      if (!next) throw new Error('The test must provide a deferred canonical save.');
      return next.promise;
    },
    updateSettingsLastAppliedLabel() { events.push({ type: 'update-last-applied-label' }); },
    syncWorkspacePreferenceControls() { updateUi(); },
    filterSettingsControlsBySearch() {},
    showToast(message) { toasts.push(String(message)); },
    getCurrentSettingsCategoryLabel() { return 'Student preferences'; },
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    }
  };
  const names = Object.keys(dependencies);
  const factory = new Function(
    ...names,
    `${updateUiDeclaration.body}; ${revertDeclaration.body}; async ${applyDeclaration.body};
     return {
       apply: applySettingsDraftChanges,
       updateUi: updateSettingsDraftUi,
       revert: revertSettingsDraftChanges,
       state: () => ({
         savePending: settingsSavePending,
         saveError: settingsSaveError,
         lastAppliedAt: settingsLastAppliedAt,
         draftEntries: Array.from(settingsDraftValues.entries()),
         activePreferences
       })
     };`
  );
  const extracted = factory(...Object.values(dependencies));
  updateUi = extracted.updateUi;
  extracted.updateUi();
  return {
    ...extracted,
    drafts,
    activePreferences,
    events,
    toasts,
    flushCalls,
    flushQueue,
    timers,
    ccPage,
    statusText,
    statusPill,
    controls
  };
}

function stage(harness, path, value) {
  harness.drafts.set(path, value);
  harness.updateUi();
}

function hasSuccessToast(harness) {
  return harness.toasts.some(message => /^(?:applied \d+ change|settings (?:applied|saved)|saved(?:\s|!|$))/i.test(message));
}

test('Settings Apply confirms only after the canonical save and preserves edits staged meanwhile', async () => {
  const harness = createSettingsHarness();
  const commit = deferred();
  harness.flushQueue.push(commit);
  stage(harness, 'studentPreferences.schoolStartHour', 7.5);

  const applying = harness.apply();
  assert.equal(harness.activePreferences.studentPreferences.schoolStartHour, 7.5,
    'the accepted Settings value takes effect immediately');
  assert.deepEqual(harness.state().draftEntries, [], 'the applied draft is no longer staged');
  assert.equal(harness.state().savePending, true);
  assert.deepEqual(harness.flushCalls, ['settings-apply']);
  assert.match(harness.statusText.textContent, /saving/i);
  assert.equal(harness.statusPill.dataset.state, 'saving');
  assert.equal(harness.ccPage.dataset.pending, 'true');
  assert.equal(harness.controls.settingsActionBar.dataset.pending, 'true');
  assert.equal(harness.controls.settingsApplyBtn.disabled, true);
  assert.equal(harness.controls.settingsRevertBtn.disabled, true);
  assert.equal(harness.controls.settingsApplyBtnTop.disabled, true);
  assert.equal(harness.controls.settingsRevertBtnTop.disabled, true);
  assert.equal(hasSuccessToast(harness), false, 'success feedback waits for confirmed persistence');
  assert.equal(harness.state().lastAppliedAt, 123);
  assert.equal(harness.events.some(event => event.type === 'update-last-applied-label'), false);
  assert.equal(harness.ccPage.classList.contains('is-saved-flash'), false);
  assert.equal(harness.timers.some(timer => timer.delay === 1400), false);

  const duplicate = harness.apply();
  await duplicate;
  assert.deepEqual(harness.flushCalls, ['settings-apply'], 'a pending save cannot start twice');

  stage(harness, 'studentPreferences.schoolEndHour', 14.5);
  assert.match(harness.statusText.textContent, /saving/i);
  commit.resolve();
  await applying;

  assert.equal(harness.state().savePending, false);
  assert.equal(!!harness.state().saveError, false);
  assert.deepEqual(harness.state().draftEntries, [['studentPreferences.schoolEndHour', 14.5]],
    'a later draft is not cleared when the earlier save confirms');
  assert.equal(harness.controls.settingsApplyBtn.disabled, false);
  assert.equal(harness.controls.settingsRevertBtn.disabled, false);
  assert.equal(harness.controls.settingsApplyBtnTop.disabled, false);
  assert.equal(harness.controls.settingsRevertBtnTop.disabled, false);
  assert.match(harness.statusText.textContent, /unsaved/i);
  assert.equal(harness.statusPill.dataset.state, 'dirty');
  assert.ok(harness.state().lastAppliedAt > 123);
  assert.equal(hasSuccessToast(harness), true);
  assert.equal(harness.events.some(event => event.type === 'update-last-applied-label'), true);
  assert.equal(harness.ccPage.classList.contains('is-saved-flash'), false,
    'success flash is omitted when another draft remains');
  assert.equal(harness.timers.some(timer => timer.delay === 1400), false);
});

test('a failed Settings save retains active values and Retry flushes them with the recovery reason', async () => {
  const harness = createSettingsHarness();
  const commit = deferred();
  const retryCommit = deferred();
  harness.flushQueue.push(commit, retryCommit);
  stage(harness, 'studentPreferences.schoolStartHour', 7.5);

  const applying = harness.apply();
  assert.equal(harness.state().savePending, true);
  assert.match(harness.statusText.textContent, /saving/i);
  assert.equal(harness.controls.settingsApplyBtn.disabled, true);
  assert.equal(harness.controls.settingsApplyBtnTop.disabled, true);
  commit.reject(new Error('IndexedDB readback failed'));
  await applying;

  assert.equal(harness.activePreferences.studentPreferences.schoolStartHour, 7.5,
    'a failed save does not roll the selected preference back');
  assert.deepEqual(harness.state().draftEntries, []);
  assert.equal(harness.state().savePending, false);
  assert.ok(harness.state().saveError);
  assert.equal(harness.state().lastAppliedAt, 123);
  assert.match(harness.statusText.textContent, /save failed|could not save/i);
  assert.equal(harness.statusPill.dataset.state, 'error');
  assert.equal(harness.controls.settingsActionBar.dataset.pending, 'true');
  assert.match(harness.controls.settingsUnsavedText.textContent, /active|applied/i);
  assert.match(harness.controls.settingsUnsavedText.textContent, /not saved|retry/i);
  assert.equal(harness.controls.settingsApplyBtn.disabled, false,
    'Save Changes remains available to retry even with no staged draft');
  assert.equal(harness.controls.settingsApplyBtnTop.disabled, false);
  const appliedValueCount = harness.events.filter(event => event.type === 'apply-preference').length;
  assert.equal(hasSuccessToast(harness), false, 'a failed write does not show success feedback');

  const retrying = harness.apply();
  assert.deepEqual(harness.flushCalls, ['settings-apply', 'retry']);
  assert.equal(harness.events.filter(event => event.type === 'apply-preference').length, appliedValueCount,
    'retry confirms the active values without reapplying or rolling them back');
  assert.equal(harness.state().savePending, true);
  assert.match(harness.statusText.textContent, /saving/i);
  retryCommit.resolve();
  await retrying;

  assert.equal(harness.state().savePending, false);
  assert.equal(!!harness.state().saveError, false);
  assert.match(harness.statusText.textContent, /saved/i);
  assert.equal(harness.statusPill.dataset.state, 'saved');
  assert.ok(harness.state().lastAppliedAt > 123);
  assert.equal(hasSuccessToast(harness), true);
  assert.equal(harness.ccPage.classList.contains('is-saved-flash'), true,
    'the saved flash appears after a confirmed retry with no newer drafts');
  assert.equal(harness.timers.some(timer => timer.delay === 1400), true);
});

test('Revert clears only later staged edits and keeps a failed active-save warning', async () => {
  const harness = createSettingsHarness();
  const commit = deferred();
  harness.flushQueue.push(commit);
  stage(harness, 'studentPreferences.schoolStartHour', 7.5);

  const applying = harness.apply();
  commit.reject(new Error('IndexedDB readback failed'));
  await applying;
  stage(harness, 'studentPreferences.schoolEndHour', 14.5);
  assert.deepEqual(harness.state().draftEntries, [['studentPreferences.schoolEndHour', 14.5]]);

  harness.revert();
  assert.deepEqual(harness.state().draftEntries, []);
  assert.equal(harness.activePreferences.studentPreferences.schoolStartHour, 7.5,
    'Revert discards future drafts but does not undo the already applied preference');
  assert.equal(harness.activePreferences.studentPreferences.schoolEndHour, 14.25);
  assert.ok(harness.state().saveError);
  assert.match(harness.statusText.textContent, /save failed|could not save/i);
  assert.equal(harness.statusPill.dataset.state, 'error');
  assert.equal(harness.controls.settingsActionBar.dataset.pending, 'true');
  assert.match(harness.controls.settingsUnsavedText.textContent, /active|applied/i);
  assert.match(harness.controls.settingsUnsavedText.textContent, /not saved|retry/i);
  assert.equal(harness.controls.settingsApplyBtn.disabled, false);
  assert.equal(harness.controls.settingsRevertBtn.disabled, true);
  assert.deepEqual(harness.flushCalls, ['settings-apply']);
});
