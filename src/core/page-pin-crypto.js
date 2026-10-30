/* Page PIN verifiers are UI privacy gates; they do not encrypt note content. */
(function (global) {
    'use strict';
    var ITERATIONS = 210000;
    function hex(bytes) { return Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join(''); }
    function saltBytes(salt) {
        if (!/^[0-9a-f]{32}$/i.test(String(salt || ''))) throw new Error('Invalid page PIN salt.');
        return new Uint8Array(salt.match(/../g).map(function (pair) { return parseInt(pair, 16); }));
    }
    function equal(a, b) {
        var mismatch = a.length ^ b.length;
        for (var index = 0; index < Math.max(a.length, b.length); index++) mismatch |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
        return mismatch === 0;
    }
    async function derive(pin, salt) {
        var key = await global.crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
        return hex(new Uint8Array(await global.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes(salt), iterations: ITERATIONS }, key, 256)));
    }
    async function create(pin, salt) {
        if (!/^\d{4,8}$/.test(String(pin || ''))) throw new Error('Use a 4–8 digit page PIN.');
        return 'v2$' + ITERATIONS + '$' + await derive(pin, salt);
    }
    async function verify(pin, verifier, salt) {
        if (!/^\d{4,8}$/.test(String(pin || ''))) return false;
        try {
            saltBytes(salt);
            var value = String(verifier || '');
            var modern = /^v2\$210000\$([0-9a-f]{64})$/i.exec(value);
            if (modern) return equal(await derive(pin, salt), modern[1].toLowerCase());
            // Older backups used SHA-256 of the exact stored salt string + PIN.
            if (!/^[0-9a-f]{64}$/i.test(value)) return false;
            var legacy = hex(new Uint8Array(await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + String(pin)))));
            return equal(legacy, value.toLowerCase());
        } catch (_) { return false; }
    }
    global.SutraPagePinCrypto = { create: create, verify: verify };
})(typeof window !== 'undefined' ? window : globalThis);
