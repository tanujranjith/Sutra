/* IndexedDB workspace adapter. Domain/state modules never talk to IDB directly. */
(function (global) {
  'use strict';

  function create(options) {
    var config = options || {};
    var indexedDb = config.indexedDB || global.indexedDB;
    var dbName = String(config.dbName || 'sutra_workspace_db');
    var version = Math.max(1, Math.floor(Number(config.version) || 1));
    var storeName = String(config.storeName || 'workspace');
    function open() {
      return new Promise(function (resolve, reject) {
        if (!indexedDb) { reject(new Error('IndexedDB unavailable')); return; }
        var request;
        try { request = indexedDb.open(dbName, version); } catch (error) { reject(error); return; }
        request.onupgradeneeded = function () {
          var db = request.result;
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
        };
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error); };
      });
    }
    async function read(key) {
      var db = await open();
      return new Promise(function (resolve, reject) {
        var request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error); };
      });
    }
    async function write(key, value) {
      var db = await open();
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(storeName, 'readwrite');
        var request = tx.objectStore(storeName).put(value, key);
        request.onerror = function () { reject(request.error || tx.error || new Error('IndexedDB write request failed')); };
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('IndexedDB transaction failed')); };
        tx.onabort = function () { reject(tx.error || new Error('IndexedDB transaction aborted')); };
      });
    }
    return { open: open, read: read, write: write };
  }
  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SutraWorkspaceDB = api;
}(typeof window !== 'undefined' ? window : globalThis));
