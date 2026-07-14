import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { create } = require('../../src/persistence/workspace-db.js');

function makeIndexedDb() {
  const rows = new Map();
  const state = { openCalls: 0, closeCalls: 0, dbs: [] };
  const factory = {
    open() {
      state.openCalls += 1;
      const request = {};
      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore() {},
        close() { state.closeCalls += 1; },
        transaction(_name, mode) {
          const tx = { error: null };
          tx.objectStore = () => ({
            get(key) {
              const req = {};
              queueMicrotask(() => {
                req.result = rows.get(key);
                req.onsuccess?.();
                tx.oncomplete?.();
              });
              return req;
            },
            put(value, key) {
              const req = {};
              queueMicrotask(() => {
                rows.set(key, value);
                req.onsuccess?.();
                tx.oncomplete?.();
              });
              return req;
            }
          });
          assert.ok(mode === 'readonly' || mode === 'readwrite');
          return tx;
        }
      };
      state.dbs.push(db);
      queueMicrotask(() => {
        request.result = db;
        request.onsuccess?.();
      });
      return request;
    }
  };

  return { factory, state };
}

test('an unpinned adapter observes a replaced platform IndexedDB factory', async () => {
  const original = globalThis.indexedDB;
  const first = makeIndexedDb();
  const replacementError = new DOMException('Simulated quota exhaustion', 'QuotaExceededError');
  try {
    globalThis.indexedDB = first.factory;
    const db = create({ dbName: 'qa', storeName: 'workspace' });
    await db.write('root', { title: 'safe' });
    assert.equal(first.state.openCalls, 1);

    globalThis.indexedDB = { open() { throw replacementError; } };
    await assert.rejects(db.write('root', { title: 'new' }), error => error === replacementError);
    assert.equal(first.state.closeCalls, 1);
  } finally {
    if (original === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = original;
  }
});

test('workspace DB reuses one connection and resolves reads on transaction completion', async () => {
  const fake = makeIndexedDb();
  const db = create({ indexedDB: fake.factory, dbName: 'qa', storeName: 'workspace' });
  await db.write('root', { title: 'safe' });
  assert.deepEqual(await db.read('root'), { title: 'safe' });
  assert.equal(fake.state.openCalls, 1);
  db.close();
  assert.equal(fake.state.closeCalls, 1);
});

test('versionchange closes the stale connection and the next operation reopens', async () => {
  const fake = makeIndexedDb();
  const db = create({ indexedDB: fake.factory, dbName: 'qa', storeName: 'workspace' });
  await db.open();
  fake.state.dbs[0].onversionchange();
  assert.equal(fake.state.closeCalls, 1);
  await db.open();
  assert.equal(fake.state.openCalls, 2);
});

test('blocked upgrades reject instead of hanging indefinitely', async () => {
  const factory = {
    open() {
      const request = {};
      queueMicrotask(() => request.onblocked?.());
      return request;
    }
  };
  const db = create({ indexedDB: factory, dbName: 'qa', storeName: 'workspace' });
  await assert.rejects(db.open(), /blocked by another open Sutra tab/i);
});
