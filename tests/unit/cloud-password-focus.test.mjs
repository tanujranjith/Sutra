import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const declaration = extractFunction(source, 'openSutraCloudSyncPassphraseModal');
const focusInitialDeclaration = extractFunction(source, 'focusInitial');
const getFocusableDeclaration = extractFunction(source, 'getFocusable');
const sutraHtml = readFileSync(new URL('../../Sutra.html', import.meta.url), 'utf8');

function passwordInputAttributesFromMarkup() {
  const modalMarker = '<div class="modal" id="sutraCloudSyncPasswordModal">';
  const modalStart = sutraHtml.indexOf(modalMarker);
  const nextModalStart = sutraHtml.indexOf('id="sutraDriveConflictModal"', modalStart);
  const inputAttribute = 'id="sutraCloudSyncPassphraseInput"';
  const inputIdIndex = sutraHtml.indexOf(inputAttribute, modalStart);
  assert.ok(modalStart >= 0 && nextModalStart > modalStart && inputIdIndex > modalStart && inputIdIndex < nextModalStart,
    'the cloud password input remains inside its password modal');
  const tagStart = sutraHtml.lastIndexOf('<input', inputIdIndex);
  const tagEnd = sutraHtml.indexOf('>', inputIdIndex);
  assert.ok(tagStart >= modalStart && tagEnd > inputIdIndex && tagEnd < nextModalStart,
    'the password input has a readable opening tag in the modal');
  const inputTag = sutraHtml.slice(tagStart, tagEnd + 1);
  const attributes = new Map();
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  const tagAttributes = inputTag.replace(/^<input\b/i, '').replace(/\s*\/?\s*>$/, '');
  for (const match of tagAttributes.matchAll(attributePattern)) {
    attributes.set(match[1], match[2] ?? match[3] ?? match[4] ?? '');
  }
  assert.equal(attributes.get('id'), 'sutraCloudSyncPassphraseInput');
  return attributes;
}

function createElement(id = '') {
  return {
    id,
    value: '',
    textContent: '',
    hidden: false,
    disabled: false,
    checked: false,
    type: '',
    focusCount: 0,
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    focus() {
      this.focusCount += 1;
      this.ownerDocument.activeElement = this;
    },
    getBoundingClientRect() { return { width: 100, height: 24 }; }
  };
}

function createModalHarness({ passInputAttributes = new Map() } = {}) {
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
  fields.sutraCloudSyncPassphraseInput.attributes = new Map(passInputAttributes);
  const modal = fields.sutraCloudSyncPasswordModal;
  modal.classList = {
    add(name) { activeClasses.add(name); },
    remove(name) { activeClasses.delete(name); },
    contains(name) { return activeClasses.has(name); }
  };
  const focusableElements = [
    fields.sutraCloudSyncPasswordCloseBtn,
    fields.sutraCloudSyncPassphraseInput,
    fields.sutraCloudSyncPassphraseConfirmInput,
    fields.sutraCloudSyncShowPasswordToggle,
    fields.sutraCloudSyncPasswordCancelBtn,
    fields.sutraCloudSyncPasswordSubmitBtn
  ];
  modal.contains = element => focusableElements.includes(element);
  modal.querySelector = selector => {
    if (selector !== '[data-autofocus], [autofocus]') return null;
    return focusableElements.find(element => element.attributes.has('data-autofocus')
      || element.attributes.has('autofocus')) || null;
  };
  modal.querySelectorAll = () => focusableElements;
  const makeFocusInitial = new Function(
    'focusableSelector',
    'window',
    `${getFocusableDeclaration.body}; ${focusInitialDeclaration.body}; return focusInitial;`
  );
  const focusInitial = makeFocusInitial(
    'button, input:not([disabled]):not([type="hidden"]), select, textarea',
    { getComputedStyle: () => ({ visibility: 'visible', display: 'block' }) }
  );
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
    bodyClasses,
    focusInitial
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

test('modal manager and cloud password opening keep initial focus on the marked password input', async () => {
  const harness = createModalHarness({ passInputAttributes: passwordInputAttributesFromMarkup() });
  const passwordInput = harness.fields.sutraCloudSyncPassphraseInput;
  const prompt = harness.open({ requireConfirm: true });

  // This is the modal manager's zero-delay focusInitial pass, which precedes
  // the cloud modal's 30 ms fallback focus timer.
  harness.focusInitial(harness.fields.sutraCloudSyncPasswordModal);
  assert.equal(harness.document.activeElement, passwordInput,
    'focusInitial should honor the password input hint in Sutra.html');
  passwordInput.value = 'quick typed phrase 81';
  const focusCountBeforeFallback = passwordInput.focusCount;

  harness.timers[0].callback();
  assert.equal(harness.document.activeElement, passwordInput,
    'the delayed fallback must preserve focus already chosen by the modal manager');
  assert.equal(passwordInput.focusCount, focusCountBeforeFallback,
    'the fallback should not refocus the input after the modal manager focused it');
  assert.equal(passwordInput.value, 'quick typed phrase 81');
  harness.fields.sutraCloudSyncPasswordCancelBtn.onclick();
  assert.equal(await prompt, null);
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
