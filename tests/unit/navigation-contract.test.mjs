import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../src/features/workspace/mobile-nav.js', import.meta.url), 'utf8');

test('mobile navigation delegates to canonical tabs and retains dialog and Back behavior', () => {
  assert.match(source, /function clickTabForView\(view\)/);
  assert.ok(source.includes("document.querySelector('.view-tab[data-view=\"' + view + '\"]');"));
  assert.match(source, /morePanel\.setAttribute\('role', 'dialog'\)/);
  assert.match(source, /morePanel\.setAttribute\('aria-modal', 'true'\)/);
  assert.match(source, /window\.addEventListener\('popstate'/);
});
