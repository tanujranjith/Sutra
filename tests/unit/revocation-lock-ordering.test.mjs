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
    style: null,
    children: [],
    attributes: new Map(),
    hidden: false,
    inert: false,
    appendChild(child) {
      child.parentNode = this;
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
  const styleValues = new Map();
  const stylePriorities = new Map();
  node.style = {
    setProperty(name, value, priority = '') {
      const property = String(name);
      styleValues.set(property, String(value));
      stylePriorities.set(property, String(priority));
      events.push(`style:${node.id}:${property}:${String(value)}:${String(priority)}`);
    },
    getPropertyValue(name) { return styleValues.get(String(name)) || ''; },
    getPropertyPriority(name) { return stylePriorities.get(String(name)) || ''; }
  };
  let hidden = false;
  Object.defineProperty(node, 'hidden', {
    configurable: true,
    enumerable: true,
    get() { return hidden; },
    set(value) {
      hidden = !!value;
      if (hidden) events.push(`hidden:true:${node.id}`);
    }
  });
  return node;
}

function createDocument(events) {
  const body = createNode('body', events);
  const head = createNode('head', events);
  const bodyClasses = new Set();
  body.classList = {
    add(name) {
      bodyClasses.add(String(name));
      events.push(`body-class:${name}`);
    },
    contains(name) { return bodyClasses.has(String(name)); }
  };
  const visitById = (parent, id) => {
    if (parent.id === id) return parent;
    for (const child of parent.children) {
      const found = visitById(child, id);
      if (found) return found;
    }
    return null;
  };
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
  workspaceRoot.style.setProperty('display', 'block', 'important');
  const secondaryRoot = createNode('aside', events);
  secondaryRoot.id = 'secondaryRoot';
  secondaryRoot.style.setProperty('display', 'block', 'important');
  const alreadyConcealedRoot = createNode('aside', events);
  alreadyConcealedRoot.id = 'alreadyConcealedRoot';
  alreadyConcealedRoot.style.setProperty('display', 'none', 'important');
  document.body.appendChild(workspaceRoot);
  document.body.appendChild(secondaryRoot);
  document.body.appendChild(alreadyConcealedRoot);

  const dependencies = {
    events,
    workspaceRoot,
    secondaryRoot,
    alreadyConcealedRoot,
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
       backgroundRoots: [workspaceRoot, secondaryRoot, alreadyConcealedRoot],
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
  const concealmentStyle = harness.document.getElementById('sutraRevocationConcealmentStyle');
  assert.ok(screen, 'the revoked screen is mounted before cleanup waits');
  assert.equal(screen.parentNode, harness.document.body, 'the revoked screen is a direct body child');
  assert.equal(harness.document.body.classList.contains('sutra-revocation-locked'), true);
  assert.ok(concealmentStyle, 'a document-level concealment rule is installed');
  assert.equal(concealmentStyle.parentNode, harness.document.head);
  assert.equal(concealmentStyle.textContent,
    'body.sutra-revocation-locked > :not(#sutraRevokedDeviceScreen) { display: none !important; }',
    'the lock rule conceals every other direct body child while excluding the recovery screen');
  for (const root of harness.backgroundRoots) {
    assert.equal(harness.document.body.children.includes(root), true);
    assert.equal(root.style.getPropertyValue('display'), 'none', `${root.id} is forced out of view`);
    assert.equal(root.style.getPropertyPriority('display'), 'important', `${root.id} overrides its prior display style`);
    const displayWrites = harness.events.filter(event => event.startsWith(`style:${root.id}:display:`));
    assert.equal(displayWrites.length, root.id === 'alreadyConcealedRoot' ? 1 : 2,
      `${root.id} avoids a redundant write when it is already concealed`);
    assert.equal(root.inert, true, `${root.id} cannot receive user input`);
    assert.equal(root.attributes.get('aria-hidden'), 'true', `${root.id} is hidden from assistive technology`);
    assert.equal(root.hidden, false, `${root.id} is concealed without the slow hidden setter`);
    assert.equal(harness.events.includes(`hidden:true:${root.id}`), false,
      `${root.id} never uses the native hidden setter`);
  }
  assert.equal(harness.document.body.children.includes(screen), true);
  assert.equal(screen.id, 'sutraRevokedDeviceScreen', 'the CSS exclusion keeps the recovery screen visible');
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
