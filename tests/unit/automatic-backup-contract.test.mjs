import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../Sutra.html', import.meta.url), 'utf8');

test('automatic cloud backup and Sync remain opt-in and local-folder backup degrades safely', () => {
  assert.match(app, /maybeSutraCloudAutoBackup\(reason\)/);
  assert.match(app, /notifySutraSyncLocalSave\(reason, summary\)/);
  assert.match(app, /function sutraCloudAutoReady\(\)/);
  assert.match(app, /backupPassphrase.*session-only/i);
  assert.match(app, /typeof window !== 'undefined' && typeof window\.showDirectoryPicker === 'function'/);
  assert.match(app, /Folder permission is required to save a backup/);
  assert.match(shell, /Auto-backup \(optional, off by default\)/);
  assert.match(shell, /Choose default backup folder/);
});
