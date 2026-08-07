import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const app = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

function loadGlobalSearch() {
  const extract = extractFunction(app, 'globalSearchAll');
  assert.ok(extract, 'globalSearchAll must be a top-level declaration');
  return new Function(
    'pages',
    'tasks',
    'timeBlocks',
    'habits',
    'sutraFuzzyScore',
    `${extract.body}; return globalSearchAll;`
  );
}

const fuzzy = (title, query) => (String(title).toLowerCase().includes(String(query).toLowerCase()) ? 1 : 0);
const lockedPage = { id: 'secret-note', title: 'Private journal', content: '<p>NEVER-SNIPPET password hint</p>', isLocked: true, lockHash: 'abc' };
const openPage = { id: 'open-note', title: 'Biology', content: '<p>mitochondria is the powerhouse</p>' };

test('global search returns a complete empty skeleton for an empty query', () => {
  const search = loadGlobalSearch()([], [], [], [], fuzzy)('');
  assert.deepEqual(search, {
    notes: [], tasks: [], homework: [], courses: [], resources: [], apstudy: [], college: [],
    timeline: [], review: [], trackers: [], assistant: [], settings: []
  });
});

test('locked pages match only on title and never leak body snippets', () => {
  const search = loadGlobalSearch()([lockedPage], [], [], [], fuzzy)('password hint');
  assert.equal(search.notes.length, 0, 'locked body content must not be searchable');
  const byTitle = loadGlobalSearch()([lockedPage], [], [], [], fuzzy)('journal');
  assert.equal(byTitle.notes.length, 1, 'locked pages still match on title');
  assert.equal(byTitle.notes[0].context, 'Locked page', 'context flags the lock instead of showing a snippet');
});

test('session-unlocked locked pages become searchable again', () => {
  const extract = extractFunction(app, 'globalSearchAll');
  const search = new Function(
    'pages',
    'tasks',
    'timeBlocks',
    'habits',
    'unlockedPageIds',
    'sutraFuzzyScore',
    `${extract.body}; return globalSearchAll;`
  )([lockedPage], [], [], [], new Set(['secret-note']), fuzzy)('password hint');
  assert.equal(search.notes.length, 1, 'an unlocked-in-session note is searchable by body');
  assert.ok(!search.notes[0].context.includes('NEVER-SNIPPET password hint'), 'snippets are still bounded to 80 chars');
});

test('open notes surface short bounded snippets, never full content', () => {
  const search = loadGlobalSearch()([openPage], [], [], [], fuzzy)('mitochondria');
  assert.equal(search.notes.length, 1);
  assert.ok(search.notes[0].context.includes('mitochondria'), 'matching snippet is shown');
  assert.ok(search.notes[0].context.length <= 80, 'snippets are bounded');
  assert.ok(!search.notes[0].context.includes('</p>'), 'raw HTML is stripped from snippets');
});

test('the search body derivation is explicit about locked pages', () => {
  const extract = extractFunction(app, 'globalSearchAll');
  assert.ok(extract.body.includes("const body = pageIsLocked ? '' : stripHtml(page.content).toLowerCase()"), 'locked pages produce an empty search body');
  assert.ok(extract.body.includes("context: pageIsLocked ? 'Locked page' : body.slice(0, 80)"), 'results distinguish locked from snippet contexts');
  assert.ok(extract.body.includes('MAX = 10'), 'results are bounded per category');
});
