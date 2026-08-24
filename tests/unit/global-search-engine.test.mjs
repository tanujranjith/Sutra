import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const engine = require('../../src/features/search/global-search-engine.js');

const NOW = Date.parse('2026-05-20T12:00:00Z');

function page(overrides = {}) {
  return {
    sourceId: 'page-1',
    type: 'page',
    title: 'Biology Notes',
    body: '',
    breadcrumb: '',
    metadata: {},
    timestamp: 0,
    ...overrides
  };
}

test('empty or whitespace queries return an empty result set', () => {
  const out = engine.search([page({ title: 'Biology' })], '   ', { now: NOW });
  assert.equal(out.total, 0);
  assert.deepEqual(out.results, []);
});

test('search is case-insensitive and supports partial words', () => {
  const out = engine.search([page({ title: 'Photosynthesis Overview' })], 'PHOTO', { now: NOW });
  assert.equal(out.total, 1);
  assert.equal(out.results[0].title, 'Photosynthesis Overview');
  assert.equal(out.results[0].matchKind, 'title');
});

test('title matches outrank deep body-text matches', () => {
  const records = [
    page({ sourceId: 'body-match', title: 'Lab Safety', body: 'long essay about biology and cells', breadcrumb: '' }),
    page({ sourceId: 'title-match', title: 'Biology', body: '' })
  ];
  const out = engine.search(records, 'biology', { now: NOW });
  assert.equal(out.total, 2);
  assert.equal(out.results[0].sourceId, 'title-match');
  assert.ok(out.results[0].score > out.results[1].score);
});

test('multiple matching words improve ranking', () => {
  const records = [
    page({ sourceId: 'one-word', title: 'Biology hub', body: '' }),
    page({ sourceId: 'two-words', title: 'Biology notes', body: 'notes about cells' })
  ];
  const out = engine.search(records, 'biology notes', { now: NOW });
  assert.equal(out.results[0].sourceId, 'two-words');
});

test('results are deduplicated by type and sourceId', () => {
  const duplicate = page({ title: 'Biology' });
  const out = engine.search([duplicate, { ...duplicate }], 'biology', { now: NOW });
  assert.equal(out.total, 1);
});

test('pages split into Page (title match) and Note (body match)', () => {
  const records = [
    page({ sourceId: 'hub', title: 'Biology 101 Hub', body: '' }),
    page({ sourceId: 'content', title: 'Cell Structure', body: 'all about biology basics' })
  ];
  const all = engine.search(records, 'biology', { now: NOW, filter: 'all' });
  assert.deepEqual(all.results.map(r => r.typeLabel), ['Page', 'Note']);

  const pages = engine.search(records, 'biology', { now: NOW, filter: 'pages' });
  assert.equal(pages.total, 1);
  assert.equal(pages.results[0].sourceId, 'hub');

  const notes = engine.search(records, 'biology', { now: NOW, filter: 'notes' });
  assert.equal(notes.total, 1);
  assert.equal(notes.results[0].sourceId, 'content');
  assert.equal(notes.results[0].typeLabel, 'Note');
});

test('a page matching both title and body appears once, labeled as Page', () => {
  const records = [page({ sourceId: 'both', title: 'Biology', body: 'biology is the study of life' })];
  const all = engine.search(records, 'biology', { now: NOW, filter: 'all' });
  assert.equal(all.total, 1);
  assert.equal(all.results[0].typeLabel, 'Page');
  const pages = engine.search(records, 'biology', { now: NOW, filter: 'pages' });
  assert.equal(pages.total, 1);
  const notes = engine.search(records, 'biology', { now: NOW, filter: 'notes' });
  assert.equal(notes.total, 1);
});

test('filter chips select their entity types', () => {
  const records = [
    page({ title: 'Biology' }),
    { sourceId: 'hw-1', type: 'homework', title: 'Biology worksheet', body: '', breadcrumb: '', metadata: { due: '2026-05-22' }, timestamp: 0 },
    { sourceId: 'task-1', type: 'task', title: 'Biology reading', body: '', breadcrumb: '', metadata: {}, timestamp: 0 },
    { sourceId: 'block-1', type: 'timeline', title: 'Biology study session', body: '', breadcrumb: '', metadata: { date: '2026-05-21' }, timestamp: 0 },
    { sourceId: 'file-1', type: 'attachment', title: 'biology-notes.pdf', body: '', breadcrumb: '', metadata: { kind: 'pdf' }, timestamp: 0 }
  ];
  assert.equal(engine.search(records, 'biology', { now: NOW, filter: 'homework' }).total, 1);
  assert.equal(engine.search(records, 'biology', { now: NOW, filter: 'tasks' }).total, 1);
  assert.equal(engine.search(records, 'biology', { now: NOW, filter: 'timeline' }).total, 1);
  assert.equal(engine.search(records, 'biology', { now: NOW, filter: 'attachments' }).total, 1);
  assert.equal(engine.search(records, 'biology', { now: NOW, filter: 'all' }).total, 5);
});

test('locked records never expose body text or snippets', () => {
  const locked = page({
    title: 'Private journal',
    body: 'NEVER-SNIPPET secret contents',
    locked: true,
    metadata: { locked: true }
  });
  const byTitle = engine.search([locked], 'journal', { now: NOW });
  assert.equal(byTitle.total, 1, 'locked pages match on title');
  assert.equal(byTitle.results[0].snippet, null, 'no snippet for locked pages');
  assert.equal(byTitle.results[0].locked, true);

  const byBody = engine.search([locked], 'NEVER-SNIPPET', { now: NOW });
  assert.equal(byBody.total, 0, 'locked body text is not searchable');
});

test('snippets are centered on the match with valid highlight ranges', () => {
  const filler = 'filler words '.repeat(60);
  const body = `${filler}the mitochondria is the powerhouse of the cell and more text follows here to force a window`;
  const out = engine.search([page({ title: 'Cell Structure', body })], 'mitochondria', { now: NOW });
  assert.equal(out.total, 1);
  const snippet = out.results[0].snippet;
  assert.ok(snippet, 'snippet exists');
  assert.ok(snippet.text.length <= 200, 'snippet is bounded');
  assert.ok(snippet.ranges.length >= 1, 'ranges exist');
  snippet.ranges.forEach(([start, end]) => {
    assert.ok(start >= 0 && end <= snippet.text.length, 'range within snippet');
    assert.equal(snippet.text.slice(start, end).toLowerCase(), 'mitochondria', 'range covers the match');
  });
  assert.ok(snippet.text.toLowerCase().includes('mitochondria'));
});

test('snippet ranges cover multi-word matches without overlapping', () => {
  const snippet = engine.buildSnippet('biology notes review and biology practice', ['biology', 'notes'], 120);
  const highlighted = snippet.ranges.map(([s, e]) => snippet.text.slice(s, e).toLowerCase());
  assert.ok(highlighted.includes('biology'));
  assert.ok(highlighted.includes('notes'));
  for (let i = 1; i < snippet.ranges.length; i += 1) {
    assert.ok(snippet.ranges[i][0] >= snippet.ranges[i - 1][1], 'ranges are ordered and non-overlapping');
  }
});

test('breadcrumb and metadata matches rank and surface', () => {
  const records = [
    page({ sourceId: 'in-course', title: 'Unit 1', body: '', breadcrumb: 'School / Biology 101' }),
    page({ sourceId: 'unrelated', title: 'Unit 1', body: '', breadcrumb: 'Personal' })
  ];
  const out = engine.search(records, 'biology', { now: NOW });
  assert.equal(out.total, 1);
  assert.equal(out.results[0].sourceId, 'in-course');
});

test('attachment metadata (kind, size) is searchable', () => {
  const records = [
    { sourceId: 'f1', type: 'attachment', title: 'Summary.pdf', body: 'photosynthesis overview', breadcrumb: 'Biology 101 / Attachments', metadata: { kind: 'pdf', sizeBytes: 1400000 }, timestamp: 0 }
  ];
  const byName = engine.search(records, 'summary', { now: NOW });
  assert.equal(byName.total, 1);
  const byCourse = engine.search(records, 'biology 101', { now: NOW });
  assert.equal(byCourse.total, 1);
  const byBody = engine.search(records, 'photosynthesis', { now: NOW });
  assert.equal(byBody.total, 1);
  assert.ok(byBody.results[0].snippet.text.includes('photosynthesis'));
});

test('prematched records are always included in All and ranked modestly', () => {
  const records = [
    { sourceId: 'deck-1', type: 'review', title: 'Deck: Biology', body: '', breadcrumb: '', metadata: { context: '12 cards' }, timestamp: 0, prematched: true }
  ];
  const out = engine.search(records, 'biology', { now: NOW });
  assert.equal(out.total, 1, 'prematched record survives');
  const strongTitle = engine.search([
    page({ title: 'Biology' }),
    { sourceId: 'deck-1', type: 'review', title: 'Deck: Biology', body: '', breadcrumb: '', metadata: {}, timestamp: 0, prematched: true }
  ], 'biology', { now: NOW });
  assert.equal(strongTitle.results[0].type, 'page', 'direct page match outranks prematched record');
});

test('due-soon and completed homework affect ranking', () => {
  const soon = { sourceId: 'hw-soon', type: 'homework', title: 'Biology lab', body: '', breadcrumb: '', metadata: { due: '2026-05-21' }, timestamp: 0 };
  const far = { sourceId: 'hw-far', type: 'homework', title: 'Biology essay', body: '', breadcrumb: '', metadata: { due: '2026-06-30' }, timestamp: 0 };
  const out = engine.search([far, soon], 'biology', { now: NOW });
  assert.equal(out.results[0].sourceId, 'hw-soon', 'due-soon work ranks above far-out work');

  const done = { sourceId: 'hw-done', type: 'homework', title: 'Biology quiz', body: '', breadcrumb: '', metadata: { due: '2026-05-21', done: true }, timestamp: 0 };
  const doneOut = engine.search([done, soon], 'biology', { now: NOW });
  assert.equal(doneOut.results[0].sourceId, 'hw-soon', 'open work ranks above completed work');
});

test('total and limit behave independently', () => {
  const records = Array.from({ length: 30 }, (_, i) => page({ sourceId: `p${i}`, title: `Biology chapter ${i}`, body: '' }));
  const out = engine.search(records, 'biology', { now: NOW, limit: 10 });
  assert.equal(out.total, 30);
  assert.equal(out.results.length, 10);
});

test('invalid records are rejected safely', () => {
  const out = engine.search([
    null,
    { type: 'unknown-type', sourceId: 'x', title: 'X' },
    { type: 'page', title: '' },
    { type: 'page', title: 'No id' },
    page({ title: 'Valid biology' })
  ], 'biology', { now: NOW });
  assert.equal(out.total, 1);
});
