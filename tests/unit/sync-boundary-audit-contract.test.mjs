import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const inventory = JSON.parse(readFileSync(new URL('../../docs/architecture/persistence-inventory.json', import.meta.url), 'utf8'));
const protocol = readFileSync(new URL('../../docs/architecture/SYNC_PROTOCOL.md', import.meta.url), 'utf8');

test('Sync audit preserves portable workspace contracts while excluding device state and credentials', () => {
  const text = JSON.stringify(inventory);
  assert.match(protocol, /deviceId.*Never appears in workspace exports/s);
  assert.match(protocol, /API keys, provider credentials, OAuth\/Supabase tokens, passphrases/i);
  assert.match(protocol, /settings\.preferences\.sync.*device-local/is);
  assert.match(text, /assistantChatHistory/);
  assert.match(text, /syncAuditLog/);
  assert.match(text, /privateDocuments/);
});
