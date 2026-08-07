import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../Sutra.html', import.meta.url), 'utf8');

test('optional plaintext .sutra export stays explicit, complete, and safely exposed', () => {
  assert.match(app, /async function exportUnencryptedSutraPackage\(options = \{\}\)/);
  assert.match(app, /window\.confirm\('This \.sutra backup will NOT be encrypted\./);
  assert.match(app, /buildCanonicalSutraPackageBytes\(\{ \.\.\.options, requireCompleteAttachments: true \}\)/);
  assert.match(app, /recordPersistenceFailure\(error, \{ reason: 'unencrypted-sutra-export'/);
  assert.match(app, /exportUnencryptedPackage: exportUnencryptedSutraPackage/);
  assert.match(shell, /onclick="window\.SutraEncryptedBackups\.exportUnencryptedPackage\(\)"/);
  assert.match(shell, /optional compatibility export[\s\S]*readable by anyone/i);
});
