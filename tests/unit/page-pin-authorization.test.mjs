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

function managementFixture() {
  const page = lockedPage('manage-page');
  const pages = [page];
  const unlockedPageIds = new Set([page.id]);
  const flags = {
    workspaceImportInProgress: false,
    sutraRemoteCommitPending: false,
    sutraRevocationLockActive: false,
    persistenceWritesBlocked: false
  };
  const canManagePageLock = target => compile('canManagePageLock', { pages, unlockedPageIds, ...flags })(target);
  let saves = 0;
  const dependencies = {
    pages, unlockedPageIds, canManagePageLock,
    generateLockSalt: async () => 'new-salt',
    hashPinWithSalt: async () => 'new-verifier',
    verifyPageDuressPin: async () => false,
    savePagesToLocal: () => { saves += 1; },
    renderPagesList() {}, reportError() {}
  };
  return { page, pages, unlockedPageIds, flags, dependencies, saves: () => saves };
}

test('PIN changes require a live unlocked page before deriving a replacement', async () => {
  const fixture = managementFixture();
  fixture.unlockedPageIds.clear();
  let derived = false;
  const change = compile('changePageLock', {
    ...fixture.dependencies,
    hashPinWithSalt: async () => { derived = true; return 'new-verifier'; }
  });
  assert.equal((await change(fixture.page.id, '1357')).code, 'not-authorized');
  assert.equal(derived, false);
  assert.equal(fixture.saves(), 0);
});

for (const mutation of ['relock', 'replace', 'rotate', 'workspaceImportInProgress', 'sutraRemoteCommitPending', 'sutraRevocationLockActive', 'persistenceWritesBlocked']) {
  test(`PIN change preserves the existing lock after ${mutation} during derivation`, async () => {
    const fixture = managementFixture();
    const pending = deferred();
    const entered = deferred();
    const change = compile('changePageLock', {
      ...fixture.dependencies,
      hashPinWithSalt: () => { entered.resolve(); return pending.promise; }
    });
    const result = change(fixture.page.id, '1357');
    await entered.promise;
    if (mutation === 'relock') fixture.unlockedPageIds.clear();
    else if (mutation === 'replace') fixture.pages.splice(0, 1, lockedPage(fixture.page.id));
    else if (mutation === 'rotate') fixture.page.lockHash = 'rotated';
    else fixture.flags[mutation] = true;
    const before = fixture.page.lockHash;
    pending.resolve('new-verifier');
    assert.equal((await result).code, 'changed');
    assert.equal(fixture.page.lockHash, before);
    assert.equal(fixture.saves(), 0);
  });
}

test('an authorized PIN change saves the new verifier and preserves the session unlock', async () => {
  const fixture = managementFixture();
  const change = compile('changePageLock', fixture.dependencies);
  assert.equal((await change(fixture.page.id, '1357')).ok, true);
  assert.equal(fixture.page.lockHash, 'new-verifier');
  assert.equal(fixture.page.lockSalt, 'new-salt');
  assert.equal(fixture.unlockedPageIds.has(fixture.page.id), true);
  assert.equal(fixture.saves(), 1);
});

for (const mutation of ['cancel', 'relock', 'replace', 'rotate', 'persistenceWritesBlocked', 'none']) {
  test(`PIN removal rechecks authorization after confirmation: ${mutation}`, async () => {
    const fixture = managementFixture();
    const confirmation = deferred();
    let removed = false;
    const remove = compile('confirmPageLockRemoval', {
      ...fixture.dependencies,
      showCustomConfirmDialog: () => confirmation.promise,
      showToast() {},
      removePageLock: () => { removed = true; },
      currentPageId: fixture.page.id,
      hideLockedPageScreen() {}, getPrimaryEditor: () => null, loadPageContentIntoEditor() {}, notifyNotePageLoaded() {}
    });
    const result = remove(fixture.page.id);
    if (mutation === 'relock') fixture.unlockedPageIds.clear();
    if (mutation === 'replace') fixture.pages.splice(0, 1, lockedPage(fixture.page.id));
    if (mutation === 'rotate') fixture.page.lockSalt = 'changed-salt';
    if (mutation === 'persistenceWritesBlocked') fixture.flags.persistenceWritesBlocked = true;
    confirmation.resolve(mutation !== 'cancel');
    assert.equal(await result, mutation === 'none');
    assert.equal(removed, mutation === 'none');
  });
}

test('duress setup cannot persist after the page relocks during derivation', async () => {
  const fixture = managementFixture();
  const pending = deferred();
  const entered = deferred();
  const setup = compile('setPageDuressPin', {
    ...fixture.dependencies,
    verifyPagePin: async () => false,
    createPageDuressVerifier: () => { entered.resolve(); return pending.promise; }
  });
  const result = setup(fixture.page.id, '135790');
  await entered.promise;
  fixture.unlockedPageIds.clear();
  pending.resolve('alternate-verifier');
  assert.equal((await result).code, 'changed');
  assert.equal(fixture.page.lockDuressVerifier, undefined);
  assert.equal(fixture.saves(), 0);
});
