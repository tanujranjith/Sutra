import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sql = readFileSync(path.join(root, 'supabase', 'sync-schema.sql'), 'utf8');
const accountIsolationMigration = readFileSync(
  path.join(root, 'supabase', 'migrations', '20260718_sync_account_isolation.sql'),
  'utf8'
);
const revokeWipeMigration = readFileSync(
  path.join(root, 'supabase', 'migrations', '20260716_device_revoke_wipe.sql'),
  'utf8'
);

const tables = ['sync_ops', 'sync_devices', 'sync_vault_keys', 'sync_snapshots', 'sync_asset_index'];
const exposedFunctions = [
  'sync_ping', 'sync_touch_device', 'sync_pull', 'sync_push',
  'sync_get_vault_key', 'sync_put_vault_key', 'sync_get_snapshot',
  'sync_put_snapshot', 'sync_put_asset', 'sync_has_asset',
  'sync_list_assets', 'sync_list_devices', 'sync_revoke_device',
  'sync_get_device_status', 'sync_acknowledge_device_wipe',
  'sync_delete_vault'
];

test('every sync table enables RLS, denies direct access, and revokes table grants', () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table}\\s+enable row level security`, 'i'));
    assert.match(sql, new RegExp(`create policy "${table}_deny_direct"`, 'i'));
  }
  assert.match(sql, /revoke all on table public\.sync_ops,[\s\S]*from public, anon, authenticated;/i);
});

test('all browser RPCs are authenticated-only security-definer functions with a fixed path', () => {
  for (const name of exposedFunctions) {
    const start = sql.indexOf(`function public.${name}`);
    assert.ok(start >= 0, `missing ${name}`);
    const body = sql.slice(start, sql.indexOf('$$;', start) + 3);
    assert.match(body, /security definer/i, `${name} must not depend on direct table grants`);
    assert.match(body, /set search_path = pg_catalog, public/i, `${name} needs a fixed safe search_path`);
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^;]+from public, anon(?:, authenticated)?;`, 'i'));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\([^;]+to authenticated;`, 'i'));
    const signature = sql.slice(start, sql.indexOf('returns ', start));
    assert.doesNotMatch(signature, /\b(user_id|userId|owner(?:Id)?)\b/i,
      `${name} must not accept caller-supplied ownership`);
    assert.match(body, /auth\.uid\(\)|sync_authorize_device\(/i,
      `${name} must derive authority from the authenticated server identity`);
  }
});

test('device revocation binds the JWT session and protects the dedicated asset bucket', () => {
  assert.match(sql, /auth_session_id\s+text/i);
  assert.match(sql, /auth\.jwt\(\) ->> 'session_id'/i);
  assert.match(sql, /sync_session_active\(\)/i);
  assert.match(sql, /values \('sync-assets', 'sync-assets', false\)/i);
  assert.match(sql, /bucket_id = 'sync-assets'[\s\S]*public\.sync_session_active\(\)/i);
  assert.match(sql, /wipe_required\s+boolean\s+not null default false/i);
  assert.match(sql, /wipe_acknowledged_at\s+timestamptz/i);
  assert.match(sql, /'code', 'DEVICE_REVOKED'[\s\S]*'contract', 'sutra-device-status-v1'/i);
  assert.match(sql, /auth_session_id = v_session[\s\S]*revoked_at is not null[\s\S]*wipe_required = true/i);
});

test('sync asset Storage policies enforce an exact authenticated opaque path and the additive migration preserves that hardening', () => {
  for (const policy of [
    'read active own', 'insert active own', 'update active own', 'delete active own'
  ]) {
    const pattern = new RegExp(`Sutra sync assets: ${policy}[\\s\\S]*?bucket_id = 'sync-assets'[\\s\\S]*?array_length\\(storage\\.foldername\\(name\\), 1\\) = 2[\\s\\S]*?\\(storage\\.foldername\\(name\\)\\)\\[1\\] = auth\\.uid\\(\\)::text[\\s\\S]*?\\(storage\\.foldername\\(name\\)\\)\\[2\\] ~ '\\^\\[0-9a-f\\]\\{64\\}\\$'[\\s\\S]*?public\\.sync_session_active\\(\\)`,'i');
    assert.match(sql, pattern, `canonical policy ${policy} must scope exact account/hash paths`);
    assert.match(accountIsolationMigration, pattern, `migration must recreate hardened ${policy} policy`);
  }
  assert.match(accountIsolationMigration, /drop policy if exists "Sutra sync assets: read active own"/i);
  assert.doesNotMatch(accountIsolationMigration, /delete from public\.sync_|drop table|truncate\s+/i,
    'the hardening migration must not destroy encrypted sync data');
});

test('sensitive sync rows are written only from auth.uid and browser payloads contain no owner argument', () => {
  assert.match(sql, /insert into public\.sync_ops[\s\S]*?values \([\s\S]*?auth\.uid\(\)/i);
  assert.match(sql, /insert into public\.sync_vault_keys[\s\S]*?values \(auth\.uid\(\)/i);
  assert.match(sql, /insert into public\.sync_snapshots[\s\S]*?values \(auth\.uid\(\)/i);
  assert.match(sql, /insert into public\.sync_asset_index[\s\S]*?values \(auth\.uid\(\)/i);
  assert.match(sql, /update public\.sync_devices[\s\S]*?where user_id = auth\.uid\(\)/i);
  assert.match(sql, /where user_id = v_uid[\s\S]*?device_id = "deviceId"[\s\S]*?auth_session_id = v_session/i);
});

test('operation and vault-key contracts enforce idempotency and split-brain safety', () => {
  assert.match(sql, /sync_ops_user_device_seq/i);
  assert.match(sql, /op-id-collision/i);
  assert.match(sql, /device-sequence-collision/i);
  assert.match(sql, /expectedWrapped/i);
  assert.match(sql, /key-conflict/i);
  assert.match(sql, /v_current->>'keyId'[^\n]+v_key_id/i);
});

test('schema is ordered after backup setup and exposes no elevated browser credential', () => {
  assert.match(sql, /Run AFTER supabase\/schema\.sql/i);
  assert.doesNotMatch(sql, /service_role|sb_secret_/i);
});

test('additive migration chain is ordered, non-destructive, and folded into the fresh schema', () => {
  assert.ok('20260716_device_revoke_wipe.sql' < '20260718_sync_account_isolation.sql');
  for (const [name, migration] of [
    ['device revoke/wipe', revokeWipeMigration],
    ['account isolation', accountIsolationMigration]
  ]) {
    assert.doesNotMatch(migration, /delete\s+from\s+public\.sync_|drop\s+table|truncate\s+/i,
      `${name} migration must preserve encrypted sync state`);
  }
  for (const pattern of [
    /wipe_required\s+boolean\s+not null default false/i,
    /wipe_acknowledged_at\s+timestamptz/i,
    /function public\.sync_get_device_status/i,
    /function public\.sync_acknowledge_device_wipe/i
  ]) {
    assert.match(revokeWipeMigration, pattern);
    assert.match(sql, pattern, 'fresh sync schema must include the additive revoke/wipe contract');
  }
  assert.match(accountIsolationMigration, /array_length\(storage\.foldername\(name\), 1\) = 2/i);
  assert.match(sql, /array_length\(storage\.foldername\(name\), 1\) = 2/i,
    'fresh sync schema must include the additive exact-path policy');
});
