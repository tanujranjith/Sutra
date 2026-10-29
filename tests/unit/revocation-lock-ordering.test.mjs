import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const mountDeclaration = extractFunction(source, 'mountSutraRevokedScreen');
const cleanupFinishedDeclaration = extractFunction(source, 'sutraRevocationCleanupFinished');
const lockDeclaration = extractFunction(source, 'enterSutraRevocationLock');
const scheduleDeclaration = extractFunction(source, 'scheduleAppSave');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function flushTasks(count = 3) {
  for (let index = 0; index < count; index += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

function createNode(tagName, events) {
  const node = {
    tagName: String(tagName).toUpperCase(),
    id: '',
    style: {},
    children: [],
    attributes: new Map(),
    hidden: false,
    inert: false,
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    append(...children) {
      children.forEach(child => this.appendChild(child));
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    addEventListener() {},
    querySelector(selector) {
      const matches = candidate => selector.startsWith('#')
        ? candidate.id === selector.slice(1)
        : candidate.tagName === selector.toUpperCase();
      const visit = parent => {
        for (const child of parent.children) {
          if (matches(child)) return child;
          const nested = visit(child);
          if (nested) return nested;
        }
        return null;
      };
      return visit(this);
    },
    focus() {
      events.push('screen:focus');
    }
  };
  return node;
}

function createDocument(events) {
  const body = createNode('body', events);
  const head = createNode('head', events);
  const visitById = (parent, id) => {
    if (parent.id === id) return parent;
    for (const child of parent.children) {
      const found = visitById(child, id);
      if (found) return found;
    }
    return null;
  };
  body.classList = { add(name) { events.push(`body-class:${name}`); } };
  return {
    body,
    head,
    createElement(tagName) { return createNode(tagName, events); },
    getElementById(id) {
      return visitById(body, id) || visitById(head, id);
    }
  };
}

function createLockHarness({ persistenceCommitQueue, attachmentPromise }) {
  const events = [];
  const document = createDocument(events);
  const workspaceRoot = createNode('main', events);
  workspaceRoot.id = 'workspaceRoot';
  document.body.appendChild(workspaceRoot);

  const dependencies = {
    events,
    workspaceRoot,
    document,
    window: { SutraRevocationWipe: { readGuard: () => ({ status: 'cleaning' }) } },
    pendingAppSave: 11,
    primarySaveDebounceTimer: 12,
    splitSecondaryDebounceTimer: 13,
    clearTimeout(timer) { events.push(`timer:clear:${timer}`); },
    setTimeout(_callback, delay) {
      events.push(`timer:schedule:${delay}`);
      return 99;
    },
    lifecycleSaveFlushScheduled: false,
    persistenceWritesBlocked: false,
    persistenceWriteBlockReason: '',
    sutraRevocationLockActive: false,
    persistenceCommitQueue,
    sutraSyncRuntime: {
      engine: {
        setVaultKey(key) { events.push(`engine:key:${key}`); },
        stop() { events.push('engine:stop'); }
      },
      store: { close() { events.push('sync-store:close'); } }
    },
    workspaceCoordinator: { close() { events.push('workspace-coordinator:close'); } },
    workspaceDb: { close() { events.push('workspace-db:close'); } },
    _cwAttachDbPromise: attachmentPromise,
    courseAttachmentCache: { clear() { events.push('attachment-cache:clear'); } },
    _importAttachmentWrites: ['pending'],
    workspaceHydrationComplete: true,
    saveRequestedBeforeHydration: false,
    workspaceImportInProgress: false,
    localWorkspaceSaveRequestRevision: 0,
    commitAppDataWithHealth() {
      events.push('workspace-commit:unexpected');
      return Promise.resolve();
    }
  };
  const names = Object.keys(dependencies);
  const factory = new Function(
    ...names,
    `${cleanupFinishedDeclaration.body}; ${mountDeclaration.body}; async ${lockDeclaration.body}; ${scheduleDeclaration.body};
     return {
       enter: enterSutraRevocationLock,
       scheduleSave: scheduleAppSave,
       document,
       workspaceRoot,
       events,
       state: () => ({
         persistenceWritesBlocked,
         persistenceWriteBlockReason,
         sutraRevocationLockActive,
         lifecycleSaveFlushScheduled,
         pendingAppSave,
         primarySaveDebounceTimer,
         splitSecondaryDebounceTimer,
         importAttachmentWrites: _importAttachmentWrites
       })
     };`
  );
  return factory(...Object.values(dependencies));
}

function assertScreenConcealsWorkspace(harness) {
  const screen = harness.document.getElementById('sutraRevokedDeviceScreen');
  assert.ok(screen, 'the revoked screen is mounted before cleanup waits');
  assert.equal(harness.document.body.children.includes(harness.workspaceRoot), true);
  assert.equal(harness.workspaceRoot.hidden, true);
  assert.equal(harness.workspaceRoot.inert, true);
  assert.equal(harness.workspaceRoot.attributes.get('aria-hidden'), 'true');
  assert.ok(harness.events.includes('screen:focus'));
}

test('revocation conceals workspace while commit and attachment barriers are pending', async () => {
  const commit = deferred();
  const attachment = deferred();
  const harness = createLockHarness({
    persistenceCommitQueue: commit.promise,
    attachmentPromise: attachment.promise
  });

  const locking = harness.enter();
  assert.equal(harness.state().sutraRevocationLockActive, true);
  assert.equal(harness.state().persistenceWritesBlocked, true);
  assert.equal(harness.state().lifecycleSaveFlushScheduled, true);
  assert.equal(harness.events.includes('engine:key:null'), true);
  assert.equal(harness.events.includes('engine:stop'), true);
  assert.deepEqual(
    harness.events.filter(event => event.startsWith('timer:clear:')),
    ['timer:clear:11', 'timer:clear:12', 'timer:clear:13']
  );
  assertScreenConcealsWorkspace(harness);
  assert.equal(harness.events.some(event => event.endsWith(':close')), false,
    'database handles remain open until the in-flight commit barrier settles');

  harness.scheduleSave();
  assert.equal(harness.events.some(event => event.startsWith('timer:schedule:')), false,
    'a new workspace write cannot be scheduled after revocation locks');

  commit.resolve();
  await flushTasks();
  assert.ok(harness.events.includes('workspace-coordinator:close'));
  assert.ok(harness.events.includes('workspace-db:close'));
  assert.ok(harness.events.includes('sync-store:close'));
  assert.equal(harness.events.includes('attachment-cache:clear'), false,
    'attachment cleanup waits for an in-flight attachment DB connection');
  assert.equal(harness.events.some(event => event.startsWith('attachment-db:close')), false);

  attachment.resolve({ close() { harness.events.push('attachment-db:close'); } });
  await locking;
  assert.ok(harness.events.includes('attachment-db:close'));
  assert.ok(harness.events.includes('attachment-cache:clear'));
  assert.deepEqual(harness.state().importAttachmentWrites, []);
  assert.equal(harness.state().persistenceWritesBlocked, true);
  assertScreenConcealsWorkspace(harness);
});

test('a rejected commit barrier leaves the workspace concealed and writes blocked', async () => {
  const commit = deferred();
  const attachment = deferred();
  const harness = createLockHarness({
    persistenceCommitQueue: commit.promise,
    attachmentPromise: attachment.promise
  });

  const locking = harness.enter();
  assertScreenConcealsWorkspace(harness);
  commit.reject(new Error('IndexedDB commit failed'));
  await flushTasks();

  assert.equal(harness.state().sutraRevocationLockActive, true);
  assert.equal(harness.state().persistenceWritesBlocked, true);
  assertScreenConcealsWorkspace(harness);
  assert.ok(harness.events.includes('workspace-db:close'));
  assert.equal(harness.events.includes('attachment-cache:clear'), false);

  attachment.resolve(null);
  await locking;
  assert.equal(harness.state().persistenceWritesBlocked, true);
  assert.equal(harness.events.includes('attachment-cache:clear'), true);
  assert.equal(harness.events.includes('workspace-commit:unexpected'), false);
});
