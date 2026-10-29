import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const declaration = extractFunction(source, 'openSutraCloudSyncPassphraseModal');

function createElement(id = '') {
  return {
    id,
    value: '',
    textContent: '',
    hidden: false,
    disabled: false,
    checked: false,
    type: '',
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    focus() { this.ownerDocument.activeElement = this; }
  };
}

function createModalHarness() {
  const timers = [];
  const activeClasses = new Set();
  const bodyClasses = new Set();
  const document = {
    activeElement: null,
    listeners: new Map(),
    addEventListener(type, listener) { this.listeners.set(type, listener); },
    removeEventListener(type) { this.listeners.delete(type); }
  };
  document.body = {
    classList: {
      add(name) { bodyClasses.add(name); },
      remove(name) { bodyClasses.delete(name); }
    }
  };

  const fields = Object.fromEntries([
    'sutraCloudSyncPasswordModal',
    'sutraCloudSyncPassphraseInput',
    'sutraCloudSyncPassphraseConfirmInput',
    'sutraCloudSyncConfirmField',
    'sutraCloudSyncShowPasswordToggle',
    'sutraCloudSyncPasswordError',
    'sutraCloudSyncPasswordStatus',
    'sutraCloudSyncPasswordSubmitBtn',
    'sutraCloudSyncPasswordCancelBtn',
    'sutraCloudSyncPasswordCloseBtn',
    'sutraCloudSyncPasswordTitle',
    'sutraCloudSyncPasswordHelp',
    'sutraCloudSyncPasswordForm',
    'sutraCloudSyncUsernameInput'
  ].map(id => [id, createElement(id)]));
  for (const element of Object.values(fields)) element.ownerDocument = document;
  const modal = fields.sutraCloudSyncPasswordModal;
  modal.classList = {
    add(name) { activeClasses.add(name); },
    remove(name) { activeClasses.delete(name); },
    contains(name) { return activeClasses.has(name); }
  };
  modal.contains = element => element === fields.sutraCloudSyncPassphraseInput
    || element === fields.sutraCloudSyncPassphraseConfirmInput;
  document.activeElement = document.body;
  document.getElementById = id => fields[id] || null;

  const dependencies = {
    document,
    assertSutraEncryptionAvailable() {},
    showToast() {},
    setPasswordModalBusy() {},
    closeSutraPasswordModal(target) {
      target.classList.remove('active');
      document.body.classList.remove('modal-open');
    },
    SUTRA_BACKUP_MIN_PASSPHRASE_LENGTH: 12,
    sutraCloudRuntime: { user: { email: 'student@example.invalid' } },
    validateSutraPassphrase(value) { return String(value); },
    sutraStorePasswordCredential() {},
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    }
  };
  const names = Object.keys(dependencies);
  const factory = new Function(
    ...names,
    `${declaration.body}; return openSutraCloudSyncPassphraseModal;`
  );
  return {
    open: factory(...Object.values(dependencies)),
    document,
    fields,
    timers,
    activeClasses,
    bodyClasses
  };
}

test('cloud password modal focuses the password field on an untouched open', async () => {
  const harness = createModalHarness();
  const prompt = harness.open({ requireConfirm: true });

  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].delay, 30);
  harness.timers[0].callback();
  assert.equal(harness.document.activeElement, harness.fields.sutraCloudSyncPassphraseInput);

  harness.fields.sutraCloudSyncPasswordCancelBtn.onclick();
  assert.equal(await prompt, null);
});

test('cloud password modal does not steal confirm focus or disturb fast password entry', async () => {
  const harness = createModalHarness();
  const passInput = harness.fields.sutraCloudSyncPassphraseInput;
  const confirmInput = harness.fields.sutraCloudSyncPassphraseConfirmInput;
  const submit = harness.fields.sutraCloudSyncPasswordSubmitBtn;
  const passphrase = 'student made phrase 42';
  const prompt = harness.open({ requireConfirm: true });

  confirmInput.focus();
  passInput.value = passphrase;
  confirmInput.value = passphrase;
  passInput.oninput();
  confirmInput.oninput();
  assert.equal(submit.disabled, false);

  harness.timers[0].callback();
  assert.equal(harness.document.activeElement, confirmInput);
  assert.equal(passInput.value, passphrase);
  assert.equal(confirmInput.value, passphrase);

  submit.onclick();
  assert.equal(await prompt, passphrase);
});

test('a canceled cloud password prompt does not steal focus when autofocus fires late', async () => {
  const harness = createModalHarness();
  const prompt = harness.open({ requireConfirm: true });
  const lateAutofocus = harness.timers[0].callback;

  harness.fields.sutraCloudSyncPasswordCancelBtn.onclick();
  assert.equal(await prompt, null);
  assert.equal(harness.activeClasses.has('active'), false);
  assert.equal(harness.document.activeElement, harness.document.body);

  lateAutofocus();
  assert.equal(harness.document.activeElement, harness.document.body);
  assert.equal(harness.fields.sutraCloudSyncPassphraseInput.value, '');
  assert.equal(harness.fields.sutraCloudSyncPassphraseConfirmInput.value, '');
});
