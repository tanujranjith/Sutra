/* Canonical browser-origin cleanup used only after a verified device-revocation RPC. */
(function (global) {
  'use strict';

  var GUARD_KEY = 'sutra:revocationWipeGuard:v1';
  var DATABASES = Object.freeze([
    'noteflow_atelier_db',
    'noteflow_attachments_db',
    'sutra_credentials_db',
    'sutra_sync_db',
    'sutra-drive-sync-keys',
    'sutra-fs-config',
    'sutra_share_target_db'
  ]);

  function storageValue(storage, key) {
    try { return storage && storage.getItem(key); } catch (error) { return null; }
  }

  function readGuard(storage) {
    var raw = storageValue(storage || global.localStorage, GUARD_KEY);
    if (!raw) return null;
    try {
      var value = JSON.parse(raw);
      return value && Number(value.version) === 1 ? value : { version: 1, status: 'locked' };
    } catch (error) {
      return { version: 1, status: 'locked' };
    }
  }

  function writeGuard(storage, status, detail) {
    var target = storage || global.localStorage;
    var value = {
      version: 1,
      status: String(status || 'locked'),
      updatedAt: new Date().toISOString(),
      detail: detail ? String(detail).slice(0, 160) : ''
    };
    target.setItem(GUARD_KEY, JSON.stringify(value)); // sutra-allow-storage: emergency fail-closed revocation sentinel
    return value;
  }

  function deleteDatabase(factory, name, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var request;
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('Timed out deleting ' + name + '; another Sutra tab may still be open.'));
      }, Math.max(1000, Number(timeoutMs) || 8000));
      function finish(error) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve(true);
      }
      try { request = factory.deleteDatabase(name); }
      catch (error) { finish(error); return; }
      request.onsuccess = function () { finish(); };
      request.onerror = function () { finish(request.error || new Error('Failed to delete ' + name)); };
      // Do not treat `blocked` as success. Other tabs receive the broadcast and
      // close their handles; the request can then complete before the timeout.
      request.onblocked = function () {};
    });
  }

  async function verifyDatabasesGone(factory, names) {
    if (!factory || typeof factory.databases !== 'function') return true;
    var rows = await factory.databases();
    var remaining = new Set((rows || []).map(function (row) { return String(row && row.name || ''); }));
    var found = names.filter(function (name) { return remaining.has(name); });
    if (found.length) throw new Error('Local cleanup verification found remaining database(s): ' + found.join(', '));
    return true;
  }

  function verifyStorageEmpty(storage, allowedKeys) {
    if (!storage) return true;
    var allowed = new Set(allowedKeys || []);
    for (var i = 0; i < storage.length; i += 1) {
      var key = storage.key(i);
      if (key && !allowed.has(key)) throw new Error('Local cleanup verification found remaining browser storage.');
    }
    return true;
  }

  async function wipe(options) {
    var config = options || {};
    var local = config.localStorage || global.localStorage;
    var session = config.sessionStorage || global.sessionStorage;
    var factory = config.indexedDB || global.indexedDB;
    if (!local || !session || !factory) throw new Error('Required browser storage is unavailable.');
    writeGuard(local, 'cleaning');
    try {
      local.clear(); // sutra-allow-storage: verified revocation deletes only this Sutra origin
      writeGuard(local, 'cleaning');
      var names = Array.isArray(config.databaseNames) ? config.databaseNames.slice() : DATABASES.slice();
      for (var i = 0; i < names.length; i += 1) {
        await deleteDatabase(factory, names[i], config.timeoutMs);
      }
      await verifyDatabasesGone(factory, names);
      verifyStorageEmpty(local, [GUARD_KEY]);
      if (config.preserveSessionUntilAcknowledged === true) {
        return writeGuard(local, 'local-verified');
      }
      session.clear(); // sutra-allow-storage: verified revocation clears auth/provider session material
      verifyStorageEmpty(session, []);
      return writeGuard(local, 'complete');
    } catch (error) {
      try { writeGuard(local, 'cleanup-error', error && error.message ? error.message : 'Cleanup failed.'); } catch (guardError) {}
      throw error;
    }
  }

  function finalize(options) {
    var config = options || {};
    var local = config.localStorage || global.localStorage;
    var session = config.sessionStorage || global.sessionStorage;
    session.clear(); // sutra-allow-storage: server acknowledgement completed; remove auth/provider session material
    verifyStorageEmpty(session, []);
    verifyStorageEmpty(local, [GUARD_KEY]);
    return writeGuard(local, 'complete');
  }

  function clearGuard(storage) {
    (storage || global.localStorage).removeItem(GUARD_KEY); // sutra-allow-storage: explicit reuse after verified cleanup
  }

  var api = {
    GUARD_KEY: GUARD_KEY,
    DATABASES: DATABASES,
    readGuard: readGuard,
    writeGuard: writeGuard,
    wipe: wipe,
    finalize: finalize,
    clearGuard: clearGuard,
    _deleteDatabase: deleteDatabase,
    _verifyStorageEmpty: verifyStorageEmpty
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SutraRevocationWipe = api;
}(typeof window !== 'undefined' ? window : globalThis));
