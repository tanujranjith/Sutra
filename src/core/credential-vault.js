/* Device-local credential vault for explicit "remember on this device" opt-ins. */
(function (global) {
  'use strict';

  var DB_NAME = 'sutra_credentials_db';
  var DB_VERSION = 1;
  var META_STORE = 'meta';
  var CREDENTIAL_STORE = 'credentials';
  var KEY_NAME = 'encryptionKey';
  var liveDb = null;
  var liveFactory = null;
  var opening = null;
  var keyPromise = null;

  function getCrypto() {
    return global.crypto && global.crypto.subtle ? global.crypto : null;
  }

  function getTextEncoder() {
    return typeof global.TextEncoder === 'function' ? new global.TextEncoder() : null;
  }

  function getTextDecoder() {
    return typeof global.TextDecoder === 'function' ? new global.TextDecoder() : null;
  }

  function bytesToBase64(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return global.btoa(binary);
  }

  function base64ToBytes(value) {
    var binary = global.atob(String(value || ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function forget(db) {
    if (!db || liveDb === db) {
      liveDb = null;
      liveFactory = null;
    }
    if (!db) opening = null;
  }

  function open() {
    var indexedDb = global.indexedDB;
    if (liveDb) {
      if (indexedDb === liveFactory) return Promise.resolve(liveDb);
      close();
    }
    if (opening) return opening;
    if (!indexedDb) return Promise.reject(new Error('IndexedDB unavailable.'));
    var request;
    try { request = indexedDb.open(DB_NAME, DB_VERSION); }
    catch (error) { return Promise.reject(error); }
    opening = new Promise(function (resolve, reject) {
      var settled = false;
      function fail(error) {
        if (settled) return;
        settled = true;
        forget();
        reject(error || new Error('Credential vault could not open.'));
      }
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
        if (!db.objectStoreNames.contains(CREDENTIAL_STORE)) db.createObjectStore(CREDENTIAL_STORE);
      };
      request.onblocked = function () { fail(new Error('Credential vault upgrade is blocked by another Sutra tab.')); };
      request.onerror = function () { fail(request.error); };
      request.onsuccess = function () {
        var db = request.result;
        if (settled) { try { db.close(); } catch (error) {} return; }
        settled = true;
        opening = null;
        liveDb = db;
        liveFactory = indexedDb;
        db.onversionchange = function () {
          try { db.close(); } catch (error) {}
          forget(db);
        };
        resolve(db);
      };
    });
    return opening;
  }

  function requestResult(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Credential vault request failed.')); };
    });
  }

  function transactionDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error || new Error('Credential vault transaction failed.')); };
      tx.onabort = function () { reject(tx.error || new Error('Credential vault transaction aborted.')); };
    });
  }

  async function read(storeName, key) {
    var db = await open();
    var tx = db.transaction(storeName, 'readonly');
    var value = await requestResult(tx.objectStore(storeName).get(key));
    return value === undefined ? null : value;
  }

  async function write(storeName, key, value) {
    var db = await open();
    var tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value, key);
    return transactionDone(tx);
  }

  async function remove(storeName, key) {
    var db = await open();
    var tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    return transactionDone(tx);
  }

  async function ensureKey() {
    var cryptoApi = getCrypto();
    if (!cryptoApi) throw new Error('Web Crypto is unavailable.');
    if (keyPromise) return keyPromise;
    keyPromise = (async function () {
      var existing = await read(META_STORE, KEY_NAME);
      if (existing) return existing;
      var generated = await cryptoApi.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      await write(META_STORE, KEY_NAME, generated);
      return generated;
    })().catch(function (error) {
      keyPromise = null;
      throw error;
    });
    return keyPromise;
  }

  async function setValue(name, value) {
    var cryptoApi = getCrypto();
    var encoder = getTextEncoder();
    if (!cryptoApi || !encoder) throw new Error('Web Crypto is unavailable.');
    var keyName = String(name || '').trim();
    if (!keyName) throw new Error('Credential name is required.');
    var key = await ensureKey();
    var iv = new Uint8Array(12);
    cryptoApi.getRandomValues(iv);
    var additionalData = encoder.encode(keyName);
    var plaintext = encoder.encode(JSON.stringify(value));
    var ciphertext = await cryptoApi.subtle.encrypt(
      { name: 'AES-GCM', iv: iv, additionalData: additionalData },
      key,
      plaintext
    );
    await write(CREDENTIAL_STORE, keyName, {
      version: 1,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext))
    });
    return true;
  }

  async function getValue(name) {
    var cryptoApi = getCrypto();
    var encoder = getTextEncoder();
    var decoder = getTextDecoder();
    if (!cryptoApi || !encoder || !decoder) return null;
    var keyName = String(name || '').trim();
    if (!keyName) return null;
    var record = await read(CREDENTIAL_STORE, keyName);
    if (!record || record.version !== 1 || !record.iv || !record.ciphertext) return null;
    try {
      var plaintext = await cryptoApi.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(record.iv), additionalData: encoder.encode(keyName) },
        await ensureKey(),
        base64ToBytes(record.ciphertext)
      );
      return JSON.parse(decoder.decode(plaintext));
    } catch (error) {
      // A corrupted or unrecoverable secret must not block the workspace.
      return null;
    }
  }

  async function setPreference(name, value) {
    return setValue('preference:' + String(name || ''), value === true);
  }

  async function getPreference(name, fallback) {
    var value = await getValue('preference:' + String(name || ''));
    return value === null || value === undefined ? fallback : value === true;
  }

  async function clearValue(name) {
    var keyName = String(name || '').trim();
    if (!keyName) return false;
    await remove(CREDENTIAL_STORE, keyName);
    return true;
  }

  async function clearAll() {
    var db = await open();
    var tx = db.transaction([META_STORE, CREDENTIAL_STORE], 'readwrite');
    tx.objectStore(META_STORE).clear();
    tx.objectStore(CREDENTIAL_STORE).clear();
    await transactionDone(tx);
    keyPromise = null;
    return true;
  }

  function close() {
    if (liveDb) {
      try { liveDb.close(); } catch (error) {}
    }
    liveDb = null;
    liveFactory = null;
    opening = null;
    keyPromise = null;
  }

  var api = {
    set: setValue,
    get: getValue,
    remove: clearValue,
    clearAll: clearAll,
    setPreference: setPreference,
    getPreference: getPreference,
    close: close,
    DB_NAME: DB_NAME
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SutraCredentialVault = api;
}(typeof window !== 'undefined' ? window : globalThis));
