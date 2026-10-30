/*
 * Shared mock Supabase-shaped sync server for the cloud-sync e2e suite.
 * The semantic model is src/sync/sync-transport.js createMemoryServer —
 * the SAME implementation the unit tests exercise — wrapped here as a
 * Playwright context.route HTTP layer.
 *
 * The origin rides the `*.supabase.co` CSP wildcard already approved in
 * scripts/lib/csp-policy.mjs: in-page CSP is enforced BEFORE Playwright
 * routing, so an unapproved origin would be blocked without ever reaching
 * the route handler.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const transportApi = require('../../../src/sync/sync-transport.js');

export const SYNC_MOCK_ORIGIN = 'https://sync-mock.supabase.co';

export function createSyncMockServer(options) {
  return transportApi.createMemoryServer(options);
}

/*
 * Routes every request for SYNC_MOCK_ORIGIN in the given browser context to
 * the shared in-process server. Returns a `net` handle: set `net.down = true`
 * to simulate a dead network (requests abort like a dropped connection).
 */
export async function routeSyncServer(context, server, net = { down: false }) {
  const seenAuthHeaders = [];
  net.syncRpcTrace = Array.isArray(net.syncRpcTrace) ? net.syncRpcTrace : [];
  net.logoutCalls = Number(net.logoutCalls) || 0;
  await context.route(`${SYNC_MOCK_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const rpcPrefix = '/rest/v1/rpc/';
    const rpcName = url.pathname.startsWith(rpcPrefix) ? url.pathname.slice(rpcPrefix.length) : '';
    const isSyncRpc = request.method() === 'POST' && rpcName.startsWith('sync_');
    let body = {};
    if (isSyncRpc) {
      try { body = JSON.parse(request.postData() || '{}'); } catch (error) { body = {}; }
    }
    const recordSyncRpc = (result, responseStatus, outcome) => {
      if (net.captureSyncRpcTrace !== true || !isSyncRpc) return;
      const safeToken = (value, maxLength = 128) => {
        if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]+$/.test(value) || value.length > maxLength) return null;
        return value;
      };
      net.syncRpcTrace.push({
        at: Date.now(),
        rpc: /^sync_[A-Za-z0-9_]{1,64}$/.test(rpcName) ? rpcName : 'unknown',
        deviceId: safeToken(body.deviceId),
        targetDeviceId: safeToken(body.targetDeviceId),
        httpStatus: responseStatus === null || responseStatus === undefined
          ? null
          : Number.isFinite(Number(responseStatus)) ? Number(responseStatus) : null,
        ok: result && typeof result.ok === 'boolean' ? result.ok : null,
        resultCode: result ? safeToken(result.code, 64) : null,
        statusContractMatches: rpcName === 'sync_get_device_status'
          ? Boolean(result && result.contract === 'sutra-device-status-v1')
          : undefined,
        statusDeviceMatches: rpcName === 'sync_get_device_status'
          ? Boolean(result && result.deviceId === body.deviceId)
          : undefined,
        statusUserMatches: rpcName === 'sync_get_device_status'
          ? Boolean(result && result.userId === server.state.userId)
          : undefined,
        statusWipeRequired: rpcName === 'sync_get_device_status'
          ? Boolean(result && result.wipeRequired === true)
          : undefined,
        outcome
      });
      if (net.syncRpcTrace.length > 200) net.syncRpcTrace.splice(0, net.syncRpcTrace.length - 200);
    };

    if (net.down) {
      recordSyncRpc({ ok: false, code: 'offline' }, null, 'network-abort');
      return route.abort('internetdisconnected');
    }

    // Minimal Supabase GoTrue mock so UI flows can sign in with email OTP
    // and the real createSupabaseTransport path (anon key + bearer headers)
    // is exercised end-to-end against this server.
    if (url.pathname === '/auth/v1/otp' && request.method() === 'POST') return json(200, {});
    if (url.pathname === '/auth/v1/verify' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() || '{}');
      const accountB = /account-b/i.test(String(body.email || ''));
      return json(200, {
        access_token: accountB ? 'mock-access-token-b' : 'mock-access-token', token_type: 'bearer', expires_in: 3600,
        refresh_token: accountB ? 'mock-refresh-token-b' : 'mock-refresh-token',
        user: { id: accountB ? 'mock-user-2' : 'mock-user-1', email: body.email || 'student@example.com' }
      });
    }
    if (url.pathname === '/auth/v1/token' && request.method() === 'POST') {
      return json(200, {
        access_token: 'mock-access-token-2', expires_in: 3600,
        refresh_token: 'mock-refresh-token',
        user: { id: 'mock-user-1', email: 'student@example.com' }
      });
    }
    if (url.pathname === '/auth/v1/settings') return json(200, {});
    if (url.pathname === '/auth/v1/logout') {
      net.logoutCalls += 1;
      return route.fulfill({ status: 204, body: '' });
    }

    if (request.method() !== 'POST' || !url.pathname.startsWith('/rest/v1/rpc/')) {
      return json(404, { ok: false, code: 'not-found' });
    }
    seenAuthHeaders.push({
      rpc: url.pathname.replace('/rest/v1/rpc/', ''),
      apikey: request.headers().apikey || null,
      authorization: request.headers().authorization || null
    });
    if (typeof net.rpcOverride === 'function') {
      const overridden = net.rpcOverride({ rpcName, body });
      if (overridden) {
        const responseBody = overridden.body || overridden;
        const responseStatus = Number(overridden.status) || 200;
        recordSyncRpc(responseBody, responseStatus, 'response');
        return json(responseStatus, responseBody);
      }
    }
    const { status, body: result } = server.handleRpc(rpcName, body);
    recordSyncRpc(result, status, 'response');
    return json(status, result);
  });
  net.seenAuthHeaders = seenAuthHeaders;
  return net;
}
