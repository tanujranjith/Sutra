import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

test('Help & Docs remains a generated local system resource instead of synced user content', () => {
  assert.match(source, /const HELP_PAGE_SYSTEM_ROLE = 'help-docs'/);
  assert.match(source, /function isHelpDocsPage\(page\)/);
  assert.match(source, /Help & Docs is built in and stays available in every space/);
  assert.match(source, /Help & Docs is a generated local system resource and is excluded[\s\S]*from Sync records/);
});
