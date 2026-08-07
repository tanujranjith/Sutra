import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync(new URL('../../Sutra.html', import.meta.url), 'utf8');

test('Cloud leads with encrypted multi-device Sync while preserving backup distinction', () => {
  assert.match(shell, /id="sutraCloudSyncFirstTitle">Use Sutra on another device/);
  assert.match(shell, /Sign in by email, set a Sync passphrase/);
  assert.match(shell, /Sync replicates changes; backups remain separate recovery points/);
  assert.match(shell, /id="sutraCloudOpenSyncBtn" onclick="window\.openSutraSyncModal\(\)"/);
  assert.match(shell, /<h4 class="sutra-cloud-h">Backup destinations<\/h4>/);
});
