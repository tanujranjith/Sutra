/* IndexedDB workspace adapter. Domain/state modules never talk to IDB directly. */
(function (global) {
  'use strict';

  function create(options) {
    var config = options || {};
    // Only pin an explicitly-injected factory (used by unit tests). Otherwise the
    // platform factory is resolved fresh on every open() rather than captured once
    // at create() time — so a genuine mid-session IndexedDB failure (quota, blocked
    // upgrade, a swapped/failing implementation) is observed and surfaced instead of
    // being masked by a stale load-time reference.
    var pinnedIndexedDb = config.indexedDB || null;
    var dbName = String(config.dbName || 'sutra_workspace_db');
    var version = Math.max(1, Math.floor(Number(config.version) || 1));
    var storeName = String(config.storeName || 'workspace');
    var liveFactory = null;
    var liveDb = null;
    var opening = null;

    function forget(db) {
      var shouldClear = !db || liveDb === db;
      if (shouldClear) {
        liveDb = null;
        liveFactory = null;
      }
      // A stale connection can fail after another caller has already begun
      // opening its replacement. Only open() owns the in-flight promise; do not
      // let that stale connection clear a newer open attempt.
      if (!db) opening = null;
    }

    function isClosingConnectionError(error) {
      // Per IndexedDB, IDBDatabase.transaction() throws InvalidStateError when
      // the connection's close-pending flag is set. Opening a fresh connection
      // is safe because no transaction (and therefore no write) started.
      return !!error && error.name === 'InvalidStateError';
    }

    function open() {
      var indexedDb = pinnedIndexedDb || global.indexedDB;
      if (liveDb) {
        if (pinnedIndexedDb || indexedDb === liveFactory) return Promise.resolve(liveDb);
        // The browser factory was replaced or invalidated after startup. Do not
        // let a cached connection mask the new failure state; normal saves still
        // reuse the live connection while the platform factory is unchanged.
        close();
      }
      if (opening) return opening;
      if (!indexedDb) return Promise.reject(new Error('IndexedDB unavailable'));
      var request;
      try { request = indexedDb.open(dbName, version); }
      catch (error) { return Promise.reject(error); }
      opening = new Promise(function (resolve, reject) {
        var settled = false;
        function fail(error) {
          if (settled) return;
          settled = true;
          forget();
          reject(error || new Error('IndexedDB open failed'));
        }
        request.onupgradeneeded = function () {
          var db = request.result;
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
        };
        request.onblocked = function () { fail(new Error('IndexedDB upgrade is blocked by another open Sutra tab.')); };
        request.onsuccess = function () {
          var db = request.result;
          if (settled) { try { db.close(); } catch (error) {} return; }
          settled = true;
          liveDb = db;
          liveFactory = indexedDb;
          opening = null;
          db.onversionchange = function () {
            try { db.close(); } catch (error) {}
            forget(db);
          };
          resolve(db);
        };
        request.onerror = function () { fail(request.error); };
      });
      return opening;
    }
    async function read(key, retryCount) {
      var db = await open();
      var tx;
      var request;
      var value = null;
      try {
        tx = db.transaction(storeName, 'readonly');
        request = tx.objectStore(storeName).get(key);
      } catch (error) {
        if (!retryCount && isClosingConnectionError(error)) {
          forget(db);
          return read(key, 1);
        }
        throw error;
      }
      return new Promise(function (resolve, reject) {
        request.onsuccess = function () { value = request.result === undefined ? null : request.result; };
        request.onerror = function () { reject(request.error || tx.error || new Error('IndexedDB read request failed')); };
        tx.oncomplete = function () { resolve(value); };
        tx.onerror = function () { reject(tx.error || new Error('IndexedDB read transaction failed')); };
        tx.onabort = function () { reject(tx.error || new Error('IndexedDB read transaction aborted')); };
      });
    }
    async function write(key, value, retryCount) {
      var db = await open();
      var tx;
      var request;
      try {
        tx = db.transaction(storeName, 'readwrite');
        request = tx.objectStore(storeName).put(value, key);
      } catch (error) {
        if (!retryCount && isClosingConnectionError(error)) {
          forget(db);
          return write(key, value, 1);
        }
        throw error;
      }
      return new Promise(function (resolve, reject) {
        request.onerror = function () { reject(request.error || tx.error || new Error('IndexedDB write request failed')); };
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('IndexedDB transaction failed')); };
        tx.onabort = function () { reject(tx.error || new Error('IndexedDB transaction aborted')); };
      });
    }
    function close() {
      var db = liveDb;
      forget(db);
      if (db) { try { db.close(); } catch (error) {} }
    }
    return { open: open, read: read, write: write, close: close };
  }
  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SutraWorkspaceDB = api;
}(typeof window !== 'undefined' ? window : globalThis));
