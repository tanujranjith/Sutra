import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const wipeApi = require('../../src/persistence/revocation-wipe.js');

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
    entries() { return [...values.entries()]; }
  };
}

function fakeIndexedDb(options = {}) {
  const existing = new Set(wipeApi.DATABASES);
  const deleted = [];
  return {
    deleted,
    deleteDatabase(name) {
      const request = {};
      queueMicrotask(() => {
        if (options.failName === name) {
          request.error = new Error(`cannot delete ${name}`);
          request.onerror?.();
          return;
        }
        existing.delete(name);
        deleted.push(name);
        request.onsuccess?.();
      });
      return request;
    },
    async databases() { return [...existing].map(name => ({ name })); }
  };
}

test('verified wipe deletes every Sutra database, preserves session until acknowledgement, then finalizes', async () => {
  const local = memoryStorage({ workspaceMirror: 'private', homework: 'private' });
  const session = memoryStorage({ accessToken: 'private', providerKey: 'private' });
  const indexedDB = fakeIndexedDb();
  const result = await wipeApi.wipe({ localStorage: local, sessionStorage: session, indexedDB, preserveSessionUntilAcknowledged: true });
  assert.equal(result.status, 'local-verified');
  assert.deepEqual(indexedDB.deleted.sort(), [...wipeApi.DATABASES].sort());
  assert.deepEqual(local.entries().map(([key]) => key), [wipeApi.GUARD_KEY]);
  assert.equal(session.length, 2, 'auth session remains only until the server acknowledgement succeeds');
  const complete = wipeApi.finalize({ localStorage: local, sessionStorage: session });
  assert.equal(complete.status, 'complete');
  assert.equal(session.length, 0);
});

test('wipe is idempotent and a partial deletion remains fail-closed', async () => {
  const local = memoryStorage({ private: 'data' });
  const session = memoryStorage({ token: 'data' });
  const indexedDB = fakeIndexedDb({ failName: 'noteflow_attachments_db' });
  await assert.rejects(() => wipeApi.wipe({ localStorage: local, sessionStorage: session, indexedDB }), /cannot delete/);
  assert.equal(wipeApi.readGuard(local).status, 'cleanup-error');
  assert.equal(session.getItem('token'), 'data', 'session is retained so a verified cleanup can be retried and acknowledged');

  const retryDb = fakeIndexedDb();
  await wipeApi.wipe({ localStorage: local, sessionStorage: session, indexedDB: retryDb });
  assert.equal(wipeApi.readGuard(local).status, 'complete');
  assert.equal(session.length, 0);
});
