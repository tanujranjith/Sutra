import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Sutra Cloud (Supabase) — optional, consent-first, end-to-end-encrypted backup.
// These tests mock the Supabase REST surface so they never touch a real project.
// They assert the load-bearing privacy guarantees:
//   • zero cloud requests on a cold boot (consent-first),
//   • uploads are ciphertext only (SUTRAENC envelope, no plaintext / no secrets),
//   • restore reproduces the workspace,
//   • auto-backup is off by default.

// The fetch origin must match the exact Supabase origin pinned in Sutra.html's
// CSP meta tag (the browser blocks any other origin before the route mock can
// intercept). Derive it from the CSP so this test tracks whatever project ref is
// configured — placeholder before setup, the real ref after.
function detectSupabaseOrigin() {
  try {
    const html = readFileSync('Sutra.html', 'utf8');
    const match = html.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
    if (match) return match[0];
  } catch (error) { /* fall through */ }
  return 'https://YOUR-PROJECT-REF.supabase.co';
}
const SUPA_URL = detectSupabaseOrigin();
const SUPA_ANON = 'test-anon-key';
const PASS = 'correct horse battery staple';
const EMAIL = 'student@example.com';
const USER_ID = 'user-1';

async function completeOnboarding(page) {
  await page.evaluate(() => {
    try {
      if (typeof window.markStudentOnboardingCompleted === 'function') {
        window.markStudentOnboardingCompleted(true);
      }
    } catch (error) {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.setProperty('display', 'none', 'important');
      overlay.style.setProperty('pointer-events', 'none', 'important');
    }
  });
  await expect(page.locator('#studentOnboardingOverlay')).toBeHidden();
}

function installSupabaseConfig(page) {
  return page.addInitScript(({ url, anon }) => {
    window.SUTRA_CONFIG = { supabaseUrl: url, supabaseAnonKey: anon };
  }, { url: SUPA_URL, anon: SUPA_ANON });
}

async function installSupabaseMock(page) {
  const state = { otp: [], objects: new Map(), index: [], uploads: [], nextId: 1, nextVer: 1 };

  await page.route(`${SUPA_URL}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    // ---- Auth ----
    if (path === '/auth/v1/otp' && method === 'POST') {
      state.otp.push(JSON.parse(request.postData() || '{}'));
      return json(200, {});
    }
    if (path === '/auth/v1/verify' && method === 'POST') {
      const body = JSON.parse(request.postData() || '{}');
      return json(200, {
        access_token: 'access-1', token_type: 'bearer', expires_in: 3600,
        refresh_token: 'refresh-1', user: { id: USER_ID, email: body.email || EMAIL }
      });
    }
    if (path === '/auth/v1/token' && method === 'POST') {
      return json(200, {
        access_token: 'access-2', token_type: 'bearer', expires_in: 3600,
        refresh_token: 'refresh-1', user: { id: USER_ID, email: EMAIL }
      });
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
    if (path === '/auth/v1/settings' && method === 'GET') {
      state.settingsChecks = (state.settingsChecks || 0) + 1;
      return json(200, { external: {}, disable_signup: false });
    }

    // ---- Storage ----
    if (path.startsWith('/storage/v1/object/authenticated/backups/') && method === 'GET') {
      const key = decodeURIComponent(path.replace('/storage/v1/object/authenticated/backups/', ''));
      const bytes = state.objects.get(key);
      if (!bytes) return route.fulfill({ status: 404, body: 'missing' });
      return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: bytes });
    }
    if (path.startsWith('/storage/v1/object/backups/') && method === 'POST') {
      const key = decodeURIComponent(path.replace('/storage/v1/object/backups/', ''));
      const bytes = request.postDataBuffer() || Buffer.alloc(0);
      state.objects.set(key, bytes);
      state.uploads.push({ key, bytes });
      return json(200, { Key: `backups/${key}` });
    }
    if (path.startsWith('/storage/v1/object/backups/') && method === 'DELETE') {
      const key = decodeURIComponent(path.replace('/storage/v1/object/backups/', ''));
      state.objects.delete(key);
      return json(200, {});
    }

    // ---- PostgREST: backup_index ----
    if (path === '/rest/v1/backup_index' && method === 'POST') {
      const body = JSON.parse(request.postData() || '{}');
      state.index.push({
        id: `idx-${state.nextId++}`,
        path: body.path,
        label: body.label || 'Backup',
        size_bytes: body.size_bytes || 0,
        device_id: body.device_id || '',
        created_at: new Date(Date.UTC(2026, 5, 18, 12, state.nextVer++, 0)).toISOString()
      });
      return route.fulfill({ status: 201, body: '' });
    }
    if (path === '/rest/v1/backup_index' && method === 'GET') {
      const rows = [...state.index].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return json(200, rows);
    }
    if (path === '/rest/v1/backup_index' && method === 'DELETE') {
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      state.index = state.index.filter(r => r.id !== id);
      return route.fulfill({ status: 204, body: '' });
    }

    return route.fulfill({ status: 500, body: `Unhandled Supabase mock route: ${method} ${url.href}` });
  });

  return state;
}

async function openApp(page) {
  await installSupabaseConfig(page);
  const supa = await installSupabaseMock(page);
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await completeOnboarding(page);
  await expect(page.locator('[data-sutra-component="brand-mark"]').first()).toBeVisible();
  return supa;
}

async function seedWorkspace(page, marker) {
  await page.evaluate(async ({ marker }) => {
    const base = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const now = new Date().toISOString();
    window.deserializeWorkspace({
      ...base,
      pages: [{
        id: `cloud-page-${marker}`,
        title: `Cloud Sentinel ${marker}`,
        content: `<h1>Cloud Sentinel ${marker}</h1><p>Body ${marker}</p>`,
        blocks: [], icon: 'doc', collapsed: false, createdAt: now, updatedAt: now, theme: 'dark'
      }],
      tasks: [{ id: `cloud-task-${marker}`, title: `Cloud Task ${marker}`, status: 'todo', priority: 'high' }]
    });
    sessionStorage.setItem('openai_api_key', `sk-cloud-secret-${marker}`);
    await window.saveWorkspaceLocally();
  }, { marker });
}

async function signIn(page) {
  await page.evaluate(async ({ email }) => {
    await window.SutraCloudSync.verifyCode(email, '123456');
  }, { email: EMAIL });
  expect(await page.evaluate(() => window.SutraCloudSync.isSignedIn())).toBe(true);
}

async function fillCloudPassword(page, pass = PASS, confirm = true) {
  await expect(page.locator('#sutraCloudSyncPasswordModal')).toHaveClass(/active/, { timeout: 20_000 });
  await page.fill('#sutraCloudSyncPassphraseInput', pass);
  if (confirm) await page.fill('#sutraCloudSyncPassphraseConfirmInput', pass);
  await page.locator('#sutraCloudSyncPasswordSubmitBtn').click();
}

function parseEnvelopeHeader(buffer) {
  const headerLength = buffer.readUInt32BE(9);
  return JSON.parse(buffer.slice(13, 13 + headerLength).toString('utf8'));
}

test('Sutra Cloud is configured but signed-out by default and makes zero requests on cold boot', async ({ page }) => {
  let cloudRequests = 0;
  page.on('request', req => { if (req.url().startsWith(SUPA_URL)) cloudRequests += 1; });
  await openApp(page);
  const snapshot = await page.evaluate(() => ({
    configured: window.SutraCloudSync.isConfigured(),
    signedIn: window.SutraCloudSync.isSignedIn(),
    autoEnabled: !!window.SutraCloudSync.getMeta().autoBackup.enabled
  }));
  expect(snapshot.configured).toBe(true);
  expect(snapshot.signedIn).toBe(false);
  expect(snapshot.autoEnabled).toBe(false); // auto-backup is opt-in
  expect(cloudRequests).toBe(0);            // consent-first: nothing contacted the cloud
});

test('back up now uploads only an encrypted envelope — no plaintext, no secrets', async ({ page }) => {
  const supa = await openApp(page);
  await seedWorkspace(page, 'UPLOAD');
  await signIn(page);

  const backupPromise = page.evaluate(() => window.SutraCloudSync.backupNow().then(r => (r && r.uploaded ? 'ok' : 'no')));
  await fillCloudPassword(page);
  expect(await backupPromise).toBe('ok');

  expect(supa.uploads).toHaveLength(1);
  const upload = supa.uploads[0];
  expect(upload.key.startsWith(`${USER_ID}/`)).toBe(true);            // RLS folder convention
  expect(upload.bytes.slice(0, 8).toString('utf8')).toBe('SUTRAENC'); // ciphertext envelope
  const header = parseEnvelopeHeader(upload.bytes);
  expect(header.kdf).toMatchObject({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600000 });
  expect(header.cipher).toMatchObject({ name: 'AES-GCM', keyLength: 256, tagLength: 128 });
  const asText = upload.bytes.toString('utf8');
  expect(asText).not.toContain('Cloud Sentinel UPLOAD');
  expect(asText).not.toContain('sk-cloud-secret-UPLOAD');

  // An index row was recorded, and the backup passphrase is never persisted.
  expect(supa.index).toHaveLength(1);
  const lsText = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(lsText).not.toContain(PASS); // passphrase is in memory only, never written to localStorage
});

test('restore from cloud reproduces the backed-up workspace', async ({ page }) => {
  await openApp(page);
  await seedWorkspace(page, 'REMOTE');
  await signIn(page);
  const backupPromise = page.evaluate(() => window.SutraCloudSync.backupNow().then(r => (r && r.uploaded ? 'ok' : 'no')));
  await fillCloudPassword(page);
  expect(await backupPromise).toBe('ok');

  // Overwrite the local workspace, then restore the cloud copy.
  await seedWorkspace(page, 'LOCAL');
  await expect.poll(() => page.evaluate(() => window.serializeWorkspace().pages[0].title)).toBe('Cloud Sentinel LOCAL');

  const restorePromise = page.evaluate(async () => {
    const rows = await window.SutraCloudSync.listBackups();
    return window.SutraCloudSync.restore(rows[0]).then(r => (r && r.restored ? 'ok' : 'no'));
  });
  await fillCloudPassword(page, PASS, false);
  expect(await restorePromise).toBe('ok');
  await expect.poll(() => page.evaluate(() => window.serializeWorkspace().pages[0].title), { timeout: 20_000 }).toBe('Cloud Sentinel REMOTE');
});

test('restore rejects a wrong password without mutating the workspace', async ({ page }) => {
  await openApp(page);
  await seedWorkspace(page, 'REMOTE');
  await signIn(page);
  const backupPromise = page.evaluate(() => window.SutraCloudSync.backupNow().then(r => (r && r.uploaded ? 'ok' : 'no')));
  await fillCloudPassword(page);
  expect(await backupPromise).toBe('ok');

  await seedWorkspace(page, 'LOCAL');
  const wrongPromise = page.evaluate(async () => {
    const rows = await window.SutraCloudSync.listBackups();
    return window.SutraCloudSync.restore(rows[0]).then(() => 'ok').catch(e => e.name || e.message || 'err');
  });
  await fillCloudPassword(page, 'totally wrong password', false);
  expect(await wrongPromise).not.toBe('ok');
  await expect.poll(() => page.evaluate(() => window.serializeWorkspace().pages[0].title)).toBe('Cloud Sentinel LOCAL');
});

// ---------------------------------------------------------------------------
// Bring-Your-Own Supabase (advanced backend)
// ---------------------------------------------------------------------------

test('defaults to Official Sutra Cloud, with BYO behind the advanced disclosure', async ({ page }) => {
  await openApp(page);
  expect(await page.evaluate(() => window.SutraCloudSync.getBackend().mode)).toBe('official');
  expect(await page.evaluate(() => window.SutraCloudSync.getActiveConfig().mode)).toBe('official');
  await page.evaluate(() => window.SutraCloudSync.open());
  // Official radio is the default selection; BYO sits inside a closed <details>.
  expect(await page.locator('#sutraCloudBackendOfficial').isChecked()).toBe(true);
  expect(await page.locator('#sutraCloudBackendCustom').isChecked()).toBe(false);
  expect(await page.locator('#sutraCloudAdvanced').evaluate(el => el.open)).toBe(false);
  await expect(page.locator('#sutraCloudStatBackend')).toContainText('Official Sutra Cloud');
});

test('BYO config saves through SafeStorage and makes zero requests', async ({ page }) => {
  let cloudRequests = 0;
  page.on('request', req => { if (req.url().startsWith(SUPA_URL)) cloudRequests += 1; });
  await openApp(page);

  const result = await page.evaluate(async (url) => {
    await window.SutraCloudSync.switchBackend({ mode: 'custom', customSupabaseUrl: url, customSupabaseAnonKey: 'byo-anon-key' });
    return {
      backend: window.SutraCloudSync.getBackend(),
      stored: localStorage.getItem('sutra:supabaseCustomBackend:v1')
    };
  }, SUPA_URL);

  expect(result.backend.mode).toBe('custom');
  expect(result.backend.customSupabaseUrl).toBe(SUPA_URL);
  expect(result.stored).toContain('custom');
  expect(result.stored).toContain(SUPA_URL);
  expect(cloudRequests).toBe(0); // saving a backend config alone contacts nothing
});

test('BYO rejects invalid URLs and service-role keys', async ({ page }) => {
  await openApp(page);
  const checks = await page.evaluate(async (url) => {
    const out = {};
    out.badUrl = await window.SutraCloudSync.switchBackend({ mode: 'custom', customSupabaseUrl: 'http://not-supabase.example', customSupabaseAnonKey: 'k' }).then(() => 'ok').catch(e => e.message);
    // A JWT whose payload declares role: service_role must be rejected.
    const jwt = `h.${btoa(JSON.stringify({ role: 'service_role' }))}.s`;
    out.detectsJwt = window.SutraCloudSync.looksLikeServiceRoleKey(jwt);
    out.detectsSecret = window.SutraCloudSync.looksLikeServiceRoleKey('sb_secret_abc123');
    out.anonOk = window.SutraCloudSync.looksLikeServiceRoleKey('sb_publishable_abc123');
    out.serviceRoleSwitch = await window.SutraCloudSync.switchBackend({ mode: 'custom', customSupabaseUrl: url, customSupabaseAnonKey: jwt }).then(() => 'ok').catch(e => e.message);
    out.mode = window.SutraCloudSync.getBackend().mode;
    return out;
  }, SUPA_URL);

  expect(checks.badUrl).not.toBe('ok');
  expect(checks.badUrl).toMatch(/Supabase URL/i);
  expect(checks.detectsJwt).toBe(true);
  expect(checks.detectsSecret).toBe(true);
  expect(checks.anonOk).toBe(false);
  expect(checks.serviceRoleSwitch).not.toBe('ok');
  expect(checks.serviceRoleSwitch).toMatch(/service_role/i);
  expect(checks.mode).toBe('official'); // none of the bad attempts switched the backend
});

test('Test connection only fires a request when explicitly invoked', async ({ page }) => {
  let settingsHits = 0;
  page.on('request', req => { if (req.url().includes('/auth/v1/settings')) settingsHits += 1; });
  await openApp(page);

  // Switching to a custom backend must NOT itself contact the network.
  await page.evaluate((url) => window.SutraCloudSync.switchBackend({ mode: 'custom', customSupabaseUrl: url, customSupabaseAnonKey: 'byo-anon-key' }), SUPA_URL);
  expect(settingsHits).toBe(0);

  // Only an explicit Test connection should hit the settings endpoint.
  const res = await page.evaluate(() => window.SutraCloudSync.testConnection());
  expect(res.ok).toBe(true);
  expect(settingsHits).toBe(1);
});

test('switching backend signs out and clears the session but keeps the local workspace', async ({ page }) => {
  await openApp(page);
  await seedWorkspace(page, 'KEEP');
  await signIn(page);
  const backupPromise = page.evaluate(() => window.SutraCloudSync.backupNow().then(r => (r && r.uploaded ? 'ok' : 'no')));
  await fillCloudPassword(page);
  expect(await backupPromise).toBe('ok');
  expect(await page.evaluate(() => window.SutraCloudSync.isSignedIn())).toBe(true);

  // Switch to a (CSP-allowed) custom backend.
  await page.evaluate((url) => window.SutraCloudSync.switchBackend({ mode: 'custom', customSupabaseUrl: url, customSupabaseAnonKey: 'byo-anon-key' }), SUPA_URL);

  const after = await page.evaluate(() => ({
    signedIn: window.SutraCloudSync.isSignedIn(),
    session: localStorage.getItem('sutra:supabaseSession:v1'),
    lastBackup: window.SutraCloudSync.getMeta().lastBackupAt,
    auto: window.SutraCloudSync.getMeta().autoBackup.enabled,
    title: window.serializeWorkspace().pages[0].title
  }));
  expect(after.signedIn).toBe(false);     // signed out of old backend
  expect(after.session).toBeNull();       // session cleared
  expect(after.lastBackup).toBe('');      // old backend's cached metadata cleared
  expect(after.auto).toBe(false);         // auto re-opt-in required
  expect(after.title).toBe('Cloud Sentinel KEEP'); // local workspace untouched
});

test('custom-mode backup uploads an encrypted envelope to the custom origin', async ({ page }) => {
  const supa = await openApp(page);
  await page.evaluate((url) => window.SutraCloudSync.switchBackend({ mode: 'custom', customSupabaseUrl: url, customSupabaseAnonKey: 'byo-anon-key' }), SUPA_URL);
  await seedWorkspace(page, 'BYO');
  await signIn(page);
  const backupPromise = page.evaluate(() => window.SutraCloudSync.backupNow().then(r => (r && r.uploaded ? 'ok' : 'no')));
  await fillCloudPassword(page);
  expect(await backupPromise).toBe('ok');

  expect(supa.uploads).toHaveLength(1);
  expect(supa.uploads[0].bytes.slice(0, 8).toString('utf8')).toBe('SUTRAENC');
  expect(supa.uploads[0].bytes.toString('utf8')).not.toContain('Cloud Sentinel BYO');
  expect(await page.evaluate(() => window.SutraCloudSync.getMeta().autoBackup.enabled)).toBe(false); // auto still off in custom mode
});
