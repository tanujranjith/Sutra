import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync(new URL('../../Sutra.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../styles/base/styles.css', import.meta.url), 'utf8');

test('homework paste import uses a self-contained, scroll-safe dialog card', () => {
  assert.match(shell, /id="homeworkPasteImportModal"[\s\S]*class="hw-paste-card glass-card"/);
  assert.match(styles, /\.hw-paste-card\s*\{[\s\S]*grid-template-rows: auto auto auto minmax\(80px, 1fr\) auto/);
  assert.match(styles, /\.hw-paste-card\s*\{[\s\S]*overflow-y: auto/);
  assert.match(styles, /\.hw-paste-card\s*\{[\s\S]*background: var\(--bg-primary\)/);
  assert.match(styles, /\.hw-paste-card\s*\{[\s\S]*backdrop-filter: none/);
});
