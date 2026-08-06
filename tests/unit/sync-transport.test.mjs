import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const transportApi = require('../../src/sync/sync-transport.js');
const syncCrypto = require('../../src/sync/sync-crypto.js');
const protocol = require('../../src/sync/sync-protocol.js');

async function makeEnvelope(key, opId, lamport, deviceId = 'dev-a', body = 'content') {
  const op = {
    opId, deviceId, lamport,
    recordKey: `c/pages/${opId.replace(':', '-')}`,
    kind: 'upsert', baseHash: null,
    hash: await protocol.hashValue({ body }),
    payload: { id: opId, body },
    schemaVersion: 5, protocolVersion: 1, clientTime: '2026-07-15T00:00:00.000Z'
  };
  return syncCrypto.encryptOpEnvelope(key, op);
}

test('memory server: push appends, pull pages, cursor advances, opId dedupes', async () => {
  const key = await syncCrypto.importVaultKey(syncCrypto.generateVaultKeyBytes());
  const server = transportApi.createMemoryServer();

  const env1 = await makeEnvelope(key, 'dev-a:1', 1);
  const env2 = await makeEnvelope(key, 'dev-a:2', 2);

  let result = server.push({ ops: [env1, env2], cursor: 0, deviceId: 'dev-a' });
  assert.equal(result.ok, true);
  assert.equal(result.cursor, 2);

  // Exact duplicate push (lost ack retry): succeeds without appending.
  result = server.push({ ops: [env1, env2], cursor: 0, deviceId: 'dev-a' });
  assert.equal(result.ok, true);
  assert.equal(result.cursor, 2);
  assert.equal(server.state.ops.length, 2);
  assert.equal(server.stats.dedupedOps, 2);

  // Stale cursor with fresh content is rejected.
  const env3 = await makeEnvelope(key, 'dev-b:1', 1, 'dev-b');
  result = server.push({ ops: [env3], cursor: 0, deviceId: 'dev-b' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'stale-cursor');

  result = server.push({ ops: [env3], cursor: 2, deviceId: 'dev-b' });
  assert.equal(result.ok, true);
  assert.equal(result.cursor, 3);

  const pulled = server.pull({ cursor: 0, deviceId: 'dev-c' });
  assert.equal(pulled.ops.length, 3);
  assert.equal(pulled.cursor, 3);
  const partial = server.pull({ cursor: 2, deviceId: 'dev-c' });
  assert.deepEqual(partial.ops.map(e => e.meta.opId), ['dev-b:1']);
});

test('memory server rejects malformed envelopes wholesale', async () => {
  const server = transportApi.createMemoryServer();
  const result = server.push({ ops: [{ v: 1, alg: 'A256GCM', iv: 'x', ct: 'y', meta: {} }], cursor: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid-envelope');
  assert.equal(server.state.ops.length, 0);
});

test('vault key, snapshot, and asset storage round-trip on the server', async () => {
  const server = transportApi.createMemoryServer();
  assert.equal(server.getVaultKey().wrapped, null);
  server.putVaultKey({ wrapped: { v: 1, kdf: {}, wrapped: 'blob' } });
  assert.equal(server.getVaultKey().wrapped.wrapped, 'blob');

  server.putSnapshot({ snapshot: { v: 1, meta: { type: 'snapshot', cursor: 0 } }, cursor: 0 });
  assert.equal(server.getSnapshot().cursor, 0);

  server.putAsset({ hash: 'abc', envelope: { v: 1, hash: 'abc', ct: 'x' } });
  assert.equal(server.hasAsset({ hash: 'abc' }).present, true);
  assert.equal(server.hasAsset({ hash: 'zzz' }).present, false);
  assert.equal(server.getAsset({ hash: 'abc' }).envelope.ct, 'x');
});

test('device registry: touch, list, revoke; revoked devices cannot pull or push', async () => {
  const server = transportApi.createMemoryServer();
  server.touchDevice({ deviceId: 'dev-a', label: 'Laptop' });
  server.touchDevice({ deviceId: 'dev-b', label: 'Desktop' });
  assert.equal(server.listDevices().devices.length, 2);

  server.revokeDevice({ targetDeviceId: 'dev-b', at: '2026-07-15' });
  assert.equal(server.pull({ cursor: 0, deviceId: 'dev-b' }).code, 'revoked');
  assert.equal(server.push({ ops: [], cursor: 0, deviceId: 'dev-b' }).code, 'revoked');
  assert.equal(server.getVaultKey({ deviceId: 'dev-b' }).code, 'revoked');
  assert.equal(server.getSnapshot({ deviceId: 'dev-b' }).code, 'revoked');
  assert.equal(server.hasAsset({ hash: 'abc', deviceId: 'dev-b' }).code, 'revoked');
  assert.equal(server.pull({ cursor: 0, deviceId: 'dev-a' }).ok, true);
});

test('vault-key writes are create-only or compare-and-swap rewraps with the same keyId', async () => {
  const server = transportApi.createMemoryServer();
  const bytes = syncCrypto.generateVaultKeyBytes();
  const first = await syncCrypto.wrapVaultKey(bytes, 'first passphrase', { iterations: 1000 });
  const rewrapped = await syncCrypto.wrapVaultKey(bytes, 'second passphrase', { iterations: 1000 });
  const different = await syncCrypto.wrapVaultKey(syncCrypto.generateVaultKeyBytes(), 'other', { iterations: 1000 });
  assert.equal(server.putVaultKey({ wrapped: first }).ok, true);
  assert.equal(server.putVaultKey({ wrapped: different }).code, 'key-conflict');
  assert.equal(server.putVaultKey({ wrapped: rewrapped, expectedWrapped: different }).code, 'key-conflict');
  assert.equal(server.putVaultKey({ wrapped: rewrapped, expectedWrapped: first }).ok, true);
  assert.equal(server.getVaultKey().wrapped.keyId, first.keyId);
});

test('memory transport binds a deviceId and passes calls through', async () => {
  const server = transportApi.createMemoryServer();
  const transport = transportApi.createMemoryTransport(server, { deviceId: 'dev-x' });
  await transport.ping();
  await transport.pull({ cursor: 0 });
  assert.ok(server.state.devices['dev-x'], 'pull must register the device');
});

test('REST transport speaks the Supabase RPC surface via injected fetch', async () => {
  const server = transportApi.createMemoryServer();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const name = url.split('/rest/v1/rpc/')[1];
    const { status, body } = server.handleRpc(name, JSON.parse(init.body));
    return {
      ok: status === 200,
      status,
      json: async () => body
    };
  };
  const transport = transportApi.createRestTransport({
    baseUrl: 'https://mock.supabase.co/',
    fetchImpl,
    deviceId: 'dev-rest',
    getAuthHeaders: () => ({ Authorization: 'Bearer test-token', apikey: 'anon' })
  });

  assert.deepEqual(await transport.ping(), { ok: true });
  const pulled = await transport.pull({ cursor: 0, userId: 'forged-account-a', user_id: 'forged-account-b' });
  assert.equal(pulled.ok, true);
  assert.deepEqual(pulled.ops, []);

  // URL shape + auth headers + deviceId injection all correct.
  assert.ok(calls[0].url.startsWith('https://mock.supabase.co/rest/v1/rpc/sync_ping'));
  assert.equal(calls[1].init.headers.Authorization, 'Bearer test-token');
  assert.equal(JSON.parse(calls[1].init.body).deviceId, 'dev-rest');
  assert.equal(Object.hasOwn(JSON.parse(calls[1].init.body), 'userId'), false, 'transport must not send caller ownership hints');
  assert.equal(Object.hasOwn(JSON.parse(calls[1].init.body), 'user_id'), false, 'transport must not send caller ownership hints');

  // Error codes surface as structured results, not thrown JSON.
  const key = await syncCrypto.importVaultKey(syncCrypto.generateVaultKeyBytes());
  const env = await makeEnvelope(key, 'dev-rest:1', 1, 'dev-rest');
  await transport.push({ ops: [env], cursor: 0 });
  const stale = await transport.push({ ops: [await makeEnvelope(key, 'dev-rest:2', 2, 'dev-rest')], cursor: 0 });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'stale-cursor');
});

test('revoke through a transport targets the named device, not the caller', async () => {
  const server = transportApi.createMemoryServer();
  server.touchDevice({ deviceId: 'dev-caller', label: 'caller' });
  server.touchDevice({ deviceId: 'dev-old-laptop', label: 'old laptop' });
  const transport = transportApi.createMemoryTransport(server, { deviceId: 'dev-caller' });
  await transport.revokeDevice({ targetDeviceId: 'dev-old-laptop' });
  const devices = (await transport.listDevices()).devices;
  assert.equal(devices.find(d => d.deviceId === 'dev-old-laptop').revokedAt !== null, true);
  assert.equal(devices.find(d => d.deviceId === 'dev-old-laptop').wipeRequired, true);
  assert.equal(devices.find(d => d.deviceId === 'dev-caller').revokedAt, null, 'caller must not revoke itself');
});

test('revoked-device wipe instruction is status-only, identity-bound, project-bound, and acknowledged after cleanup', async () => {
  const server = transportApi.createMemoryServer({ userId: 'account-a' });
  server.touchDevice({ deviceId: 'device-target' });
  server.touchDevice({ deviceId: 'device-controller' });
  server.revokeDevice({ deviceId: 'device-controller', targetDeviceId: 'device-target', at: '2026-07-16T12:00:00.000Z' });
  const target = transportApi.createMemoryTransport(server, { deviceId: 'device-target' });
  const status = await target.getDeviceStatus();
  assert.equal(status.code, 'DEVICE_REVOKED');
  assert.equal(transportApi.validateVerifiedWipeInstruction(status, {
    userId: 'account-a', deviceId: 'device-target',
    actualProjectUrl: 'https://project.supabase.co/', expectedProjectUrl: 'https://project.supabase.co'
  }), true);
  for (const invalid of [
    // A generic HTTP-ish failure, a transport failure, and malformed data are
    // never instructions to delete local user data.
    { ok: false, status: 401, code: 'auth-expired' },
    { ok: false, code: 'network-error' },
    { ok: false, code: 'DEVICE_REVOKED', contract: 'not-sutra-device-status-v1' },
    { ...status, deviceId: 'forged-device-id' },
    { ...status, code: 'revoked' },
    { ...status, userId: 'account-b' },
    { ...status, deviceId: 'device-other' },
    { ...status, wipeRequired: false },
    null
  ]) {
    assert.equal(transportApi.validateVerifiedWipeInstruction(invalid, {
      userId: 'account-a', deviceId: 'device-target',
      actualProjectUrl: 'https://project.supabase.co', expectedProjectUrl: 'https://project.supabase.co'
    }), false);
  }
  assert.equal(transportApi.validateVerifiedWipeInstruction(status, {
    userId: 'account-a', deviceId: 'device-target',
    actualProjectUrl: 'https://forged.example', expectedProjectUrl: 'https://project.supabase.co'
  }), false);
  const ack = await target.acknowledgeDeviceWipe({ at: '2026-07-16T12:01:00.000Z' });
  assert.equal(ack.ok, true);
  assert.equal((await target.getDeviceStatus()).wipeAcknowledgedAt, '2026-07-16T12:01:00.000Z');
});

test('deleteVault wipes ops, keys, snapshot, devices, and assets', async () => {
  const key = await syncCrypto.importVaultKey(syncCrypto.generateVaultKeyBytes());
  const server = transportApi.createMemoryServer();
  server.push({ ops: [await makeEnvelope(key, 'dev-a:1', 1)], cursor: 0, deviceId: 'dev-a' });
  server.putVaultKey({ wrapped: { v: 1, kdf: {}, wrapped: 'x' } });
  server.putSnapshot({ snapshot: { v: 1, meta: { type: 'snapshot', cursor: 1 } }, cursor: 1 });
  server.putAsset({ hash: 'h1', envelope: { v: 1, hash: 'h1', ct: 'c' } });
  const result = server.deleteVault();
  assert.equal(result.ok, true);
  assert.equal(server.state.ops.length, 0);
  assert.equal(server.getVaultKey().wrapped, null);
  assert.equal(server.getSnapshot().snapshot, null);
  assert.equal(server.hasAsset({ hash: 'h1' }).present, false);
  assert.equal(server.listDevices().devices.length, 0);
});

test('Supabase transport injects anon key + bearer token, and fails typed when signed out', async () => {
  const server = transportApi.createMemoryServer();
  const seenHeaders = [];
  const fetchImpl = async (url, init) => {
    seenHeaders.push(init.headers);
    const name = url.split('/rest/v1/rpc/')[1];
    const { status, body } = server.handleRpc(name, JSON.parse(init.body));
    return { ok: status === 200, status, json: async () => body };
  };
  let token = 'live-access-token';
  const transport = transportApi.createSupabaseTransport({
    baseUrl: 'https://real-project.supabase.co',
    anonKey: 'public-anon-key',
    deviceId: 'dev-sb',
    fetchImpl,
    getAccessToken: () => token
  });
  await transport.ping();
  assert.equal(seenHeaders[0].apikey, 'public-anon-key');
  assert.equal(seenHeaders[0].Authorization, 'Bearer live-access-token');

  token = null; // signed out → typed auth error BEFORE any network call
  await assert.rejects(() => transport.pull({ cursor: 0 }), (e) => e.code === 'auth-expired');
});

test('Supabase asset upload requires its index and vault deletion removes encrypted objects first', async () => {
  const calls = [];
  let failIndex = true;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/storage/v1/object/sync-assets/') && init.method === 'POST') {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (url.endsWith('/rest/v1/rpc/sync_put_asset')) {
      return { ok: true, status: 200, json: async () => failIndex ? { ok: false, code: 'index-down' } : { ok: true } };
    }
    if (url.endsWith('/rest/v1/rpc/sync_list_assets')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, hashes: ['a'.repeat(64)] }) };
    }
    if (url.endsWith('/storage/v1/object/sync-assets') && init.method === 'DELETE') {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (url.endsWith('/rest/v1/rpc/sync_delete_vault')) {
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    throw new Error(`unexpected ${init.method} ${url}`);
  };
  const transport = transportApi.createSupabaseTransport({
    baseUrl: 'https://real-project.supabase.co',
    anonKey: 'public-key',
    deviceId: 'dev-assets',
    fetchImpl,
    getAccessToken: () => 'access-token',
    getUserId: () => 'user-1'
  });
  const hash = 'a'.repeat(64);
  const assetEnvelope = { v: 1, alg: 'A256GCM', iv: 'a'.repeat(16), ct: 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYQ==', hash };
  await assert.rejects(
    () => transport.putAsset({ hash, envelope: assetEnvelope, size_bytes: 10 }),
    (e) => e.code === 'index-down'
  );
  failIndex = false;
  assert.equal((await transport.putAsset({ hash, envelope: assetEnvelope, size_bytes: 10 })).ok, true);
  assert.equal((await transport.deleteVault()).ok, true);
  const remove = calls.find(call => call.url.endsWith('/storage/v1/object/sync-assets') && call.init.method === 'DELETE');
  assert.deepEqual(JSON.parse(remove.init.body).prefixes, [`user-1/${hash}`]);
});

test('Supabase asset transport rejects crafted paths and plaintext-shaped bodies before any request', async () => {
  const calls = [];
  const transport = transportApi.createSupabaseTransport({
    baseUrl: 'https://real-project.supabase.co',
    anonKey: 'public-key',
    deviceId: 'dev-assets',
    fetchImpl: async (url) => { calls.push(url); throw new Error('must not request'); },
    getAccessToken: () => 'access-token',
    getUserId: () => 'user-1'
  });
  await assert.rejects(
    () => transport.putAsset({ hash: 'user-a/secret-name.txt', envelope: { plaintext: 'nope' } }),
    /SHA-256 content hash/
  );
  const hash = 'b'.repeat(64);
  await assert.rejects(
    () => transport.putAsset({ hash, envelope: { v: 1, alg: 'A256GCM', iv: 'a'.repeat(16), ct: 'visible plaintext', hash } }),
    /malformed or unencrypted asset envelope/
  );
  await assert.rejects(() => transport.getAsset({ hash: '../account-a/object' }), /SHA-256 content hash/);
  assert.deepEqual(calls, [], 'invalid asset inputs must not reach Storage');
});

test('REST transport throws a typed error on non-JSON HTTP failure', async () => {
  const transport = transportApi.createRestTransport({
    baseUrl: 'https://mock.supabase.co',
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => { throw new Error('no body'); } })
  });
  await assert.rejects(() => transport.ping(), (e) => e.status === 503);
});

test('REST transport classifies auth, quota, and missing-schema failures', async () => {
  for (const [status, code] of [[401, 'auth-expired'], [413, 'quota-exceeded'], [404, 'schema-mismatch']]) {
    const transport = transportApi.createRestTransport({
      baseUrl: 'https://mock.supabase.co',
      fetchImpl: async () => ({ ok: false, status, json: async () => ({ message: 'failed' }) })
    });
    await assert.rejects(() => transport.ping(), (e) => e.code === code);
  }
});
