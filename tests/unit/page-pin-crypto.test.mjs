import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../src/core/page-pin-crypto.js', import.meta.url), 'utf8');
const window = { crypto: webcrypto };
vm.runInNewContext(source, { window, TextEncoder, Uint8Array });
const pins = window.SutraPagePinCrypto;
const salt = '0123456789abcdef0123456789abcdef';

test('versioned page PIN survives serialization and verifies only its PIN and salt', async () => {
  const verifier = await pins.create('482613', salt);
  const page = JSON.parse(JSON.stringify({ lockHash: verifier, lockSalt: salt, unknown: 'preserved' }));
  assert.match(page.lockHash, /^v2\$210000\$[0-9a-f]{64}$/);
  assert.equal(await pins.verify('482613', page.lockHash, page.lockSalt), true);
  assert.equal(await pins.verify('482614', page.lockHash, page.lockSalt), false);
  assert.equal(await pins.verify('482613', page.lockHash, '1123456789abcdef0123456789abcdef'), false);
});

test('legacy verifier remains readable and can be replaced without changing the PIN', async () => {
  const legacy = createHash('sha256').update(salt + '482613').digest('hex');
  assert.equal(await pins.verify('482613', legacy, salt), true);
  assert.equal(await pins.verify('482614', legacy, salt), false);
  const nextSalt = 'abcdef0123456789abcdef0123456789';
  const modern = await pins.create('482613', nextSalt);
  assert.equal(await pins.verify('482613', modern, nextSalt), true);
  assert.notEqual(modern, legacy);
});

test('unknown versions, hostile iteration counts, malformed salts, and invalid PINs fail closed', async () => {
  for (const verifier of ['v3$210000$' + '0'.repeat(64), 'v2$999999999$' + '0'.repeat(64), '', null]) {
    assert.equal(await pins.verify('482613', verifier, salt), false);
  }
  assert.equal(await pins.verify('482613', '0'.repeat(64), 'broken'), false);
  assert.equal(await pins.verify('bad', '0'.repeat(64), salt), false);
  await assert.rejects(pins.create('123', salt), /4–8 digit/);
});
