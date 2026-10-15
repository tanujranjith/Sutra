import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const appSource = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

function compile(name, dependencies) {
  const declaration = extractFunction(appSource, name);
  assert.ok(declaration, `${name} exists in the application source`);
  const parameterNames = Object.keys(dependencies);
  const prefix = appSource.includes(`async function ${name}(`) ? 'async ' : '';
  return new Function(
    ...parameterNames,
    `${prefix}${declaration.body}\nreturn ${name};`
  )(...parameterNames.map(parameter => dependencies[parameter]));
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function lockedPage(id, hash = 'legacy-hash') {
  return { id, title: `Locked ${id}`, isLocked: true, lockHash: hash, lockSalt: 'salt-a' };
}

function basicPromptDependencies(pages, verifyPagePin) {
  return {
    pages,
    showCustomPromptDialog: async () => '2468',
    verifyPagePin
  };
}

test('deletion PIN verification rejects a page replaced while the KDF is pending', async () => {
  const original = lockedPage('page-1');
  const pages = [original];
  const kdf = deferred();
  let started;
  const verificationStarted = new Promise(resolve => { started = resolve; });
  const verifyPagePin = () => {
    started();
    return kdf.promise;
  };
  const promptAndVerifyPageLock = compile('promptAndVerifyPageLock', basicPromptDependencies(pages, verifyPagePin));
  const toasts = [];
  const verifyLockedPagesBeforeDeletion = compile('verifyLockedPagesBeforeDeletion', {
    pages,
    unlockedPageIds: new Set(),
    promptAndVerifyPageLock,
    showToast: message => toasts.push(message),
    workspaceImportInProgress: false,
    sutraRemoteCommitPending: false,
    sutraRevocationLockActive: false
  });

  const authorization = verifyLockedPagesBeforeDeletion(new Set([original.id]));
  await verificationStarted;
  pages.splice(0, 1, lockedPage(original.id, 'replacement-hash'));
  kdf.resolve(true);

  assert.equal(await authorization, false);
  assert.equal(toasts.length, 1);
});

test('Assistant PIN verification rejects a changed lock while the KDF is pending', async () => {
  const page = lockedPage('page-assistant');
  const pages = [page];
  const kdf = deferred();
  let started;
  const verificationStarted = new Promise(resolve => { started = resolve; });
  const verifyPagePin = () => {
    started();
    return kdf.promise;
  };
  const requestAssistantPageAccess = compile('requestAssistantPageAccess', {
    pages,
    showCustomPromptDialog: async () => '2468',
    validatePinInput: () => null,
    verifyPagePin,
    workspaceImportInProgress: false,
    sutraRemoteCommitPending: false,
    sutraRevocationLockActive: false
  });

  const authorization = requestAssistantPageAccess(page.id);
  await verificationStarted;
  page.lockHash = 'new-hash';
  kdf.resolve(true);

  const result = await authorization;
  assert.equal(result.ok, false);
  assert.equal(result.status, 'changed');
});

test('deletion authorization token rechecks the captured page identities and lock state', async () => {
  const page = lockedPage('page-guard');
  const pages = [page];
  const promptAndVerifyPageLock = compile('promptAndVerifyPageLock', basicPromptDependencies(pages, async () => true));
  const verifyLockedPagesBeforeDeletion = compile('verifyLockedPagesBeforeDeletion', {
    pages,
    unlockedPageIds: new Set(),
    promptAndVerifyPageLock,
    showToast: () => {},
    workspaceImportInProgress: false,
    sutraRemoteCommitPending: false,
    sutraRevocationLockActive: false
  });

  const authorization = await verifyLockedPagesBeforeDeletion(new Set([page.id]));
  assert.equal(typeof authorization?.isCurrent, 'function');
  assert.equal(authorization.isCurrent(), true);

  page.lockHash = 'rotated-hash';
  assert.equal(authorization.isCurrent(), false);
  page.lockHash = 'legacy-hash';
  pages.splice(0, 1, lockedPage(page.id, page.lockHash));
  assert.equal(authorization.isCurrent(), false);
});
