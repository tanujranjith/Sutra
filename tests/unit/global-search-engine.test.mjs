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

test('multi-word queries exclude records that only match one token', () => {
  const records = [
    page({ sourceId: 'one-word', title: 'Biology hub', body: '' }),
    page({ sourceId: 'two-words', title: 'Biology notes', body: 'notes about cells' })
  ];
  const out = engine.search(records, 'biology notes', { now: NOW });
  assert.equal(out.total, 1);
  assert.equal(out.results[0].sourceId, 'two-words');
});

test('specific long queries require meaningful token coverage without demanding every word', () => {
  const records = [
    { sourceId: 'exact', type: 'homework', title: 'AP Gov summer work', body: '', breadcrumb: 'AP Gov', metadata: {}, timestamp: 0 },
    { sourceId: 'near', type: 'homework', title: 'AP Lit summer work', body: '', breadcrumb: 'AP Lit', metadata: {}, timestamp: 0 },
    { sourceId: 'two-of-four', type: 'course', title: 'AP Gov', body: '', breadcrumb: 'Courses', metadata: {}, timestamp: 0 },
    { sourceId: 'one-of-four', type: 'timeline', title: 'AP Networking Exam', body: '', breadcrumb: '', metadata: {}, timestamp: 0 }
  ];
  const out = engine.search(records, 'ap gov summer work', { now: NOW });
  assert.deepEqual(out.results.map(result => result.sourceId), ['exact', 'near']);
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

  const typoTitle = engine.search([locked], 'jounral', { now: NOW });
  assert.equal(typoTitle.total, 1, 'locked titles retain typo recovery');
  assert.equal(typoTitle.results[0].snippet, null, 'locked title matches still reveal no body snippet');

  const byBody = engine.search([locked], 'NEVER-SNIPPET', { now: NOW });
  assert.equal(byBody.total, 0, 'locked body text is not searchable');
  const byTypoBody = engine.search([locked], 'secrett', { now: NOW });
  assert.equal(byTypoBody.total, 0, 'typo recovery never searches a locked body');
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

test('non-page records qualify through metadata alone (due date, priority, category, time)', () => {
  const records = [
    { sourceId: 'hw-1', type: 'homework', title: 'Worksheet 3', body: '', breadcrumb: '', metadata: { due: '2026-05-22', priority: 'high' }, timestamp: 0 },
    { sourceId: 'task-1', type: 'task', title: 'Finish reading', body: '', breadcrumb: '', metadata: { due: '2026-05-23', priority: 'medium', completed: false }, timestamp: 0 },
    { sourceId: 'block-1', type: 'timeline', title: 'Deep work', body: '', breadcrumb: '', metadata: { date: '2026-05-21', start: '16:00', end: '17:30', category: 'study' }, timestamp: 0 }
  ];
  // Homework due date.
  const byDue = engine.search(records, '2026-05-22', { now: NOW });
  assert.equal(byDue.total, 1);
  assert.equal(byDue.results[0].sourceId, 'hw-1');
  assert.equal(byDue.results[0].matchKind, 'meta');
  // Task priority.
  const byPriority = engine.search(records, 'high', { now: NOW });
  assert.equal(byPriority.total, 1);
  assert.equal(byPriority.results[0].sourceId, 'hw-1');
  // Timeline category and start time.
  const byCategory = engine.search(records, 'study', { now: NOW });
  assert.equal(byCategory.total, 1);
  assert.equal(byCategory.results[0].sourceId, 'block-1');
  const byTime = engine.search(records, '16:00', { now: NOW });
  assert.equal(byTime.total, 1);
  assert.equal(byTime.results[0].sourceId, 'block-1');
  // Metadata matches outrank nothing — a title match still wins.
  const mixed = engine.search([
    { sourceId: 'meta-only', type: 'homework', title: 'Worksheet 3', body: '', breadcrumb: '', metadata: { due: '2026-05-22' }, timestamp: 0 },
    { sourceId: 'title-hit', type: 'homework', title: '2026-05-22 debrief', body: '', breadcrumb: '', metadata: {}, timestamp: 0 }
  ], '2026-05-22', { now: NOW });
  assert.equal(mixed.results[0].sourceId, 'title-hit');
});

test('attachment kind, MIME type, and size are genuinely searchable', () => {
  const records = [
    { sourceId: 'f1', type: 'attachment', title: 'Cell summary report', body: 'photosynthesis overview', breadcrumb: 'Biology 101 / Attachments', metadata: { kind: 'pdf', mimeType: 'application/pdf', sizeBytes: 1468006 }, timestamp: 0 }
  ];
  // Kind is metadata-only here: the title and body contain neither "pdf" nor
  // "application", so each hit below proves metadata qualification.
  const byKind = engine.search(records, 'pdf', { now: NOW });
  assert.equal(byKind.total, 1);
  assert.equal(byKind.results[0].sourceId, 'f1');
  assert.equal(byKind.results[0].matchKind, 'meta');
  const byMime = engine.search(records, 'application/pdf', { now: NOW });
  assert.equal(byMime.total, 1);
  const byMimeToken = engine.search(records, 'application', { now: NOW });
  assert.equal(byMimeToken.total, 1);
  const bySize = engine.search(records, '1468006', { now: NOW });
  assert.equal(bySize.total, 1);
  assert.equal(bySize.results[0].sourceId, 'f1');
  // A body match on the same record still wins over its metadata match.
  const byBody = engine.search(records, 'photosynthesis', { now: NOW });
  assert.equal(byBody.total, 1);
  assert.ok(byBody.results[0].snippet.text.includes('photosynthesis'));
});

test('pages never qualify through metadata, preserving the Pages/Notes contract', () => {
  const records = [
    page({ sourceId: 'p1', title: 'Unit plan', body: 'plain text only', metadata: { updatedAt: '2026-05-22T00:00:00Z' } })
  ];
  // The date exists only in page metadata: it must not qualify the page.
  const byMeta = engine.search(records, '2026-05-22', { now: NOW });
  assert.equal(byMeta.total, 0);
  // Title and body qualification still work.
  assert.equal(engine.search(records, 'unit plan', { now: NOW }).total, 1);
  assert.equal(engine.search(records, 'plain text', { now: NOW }).total, 1);
});

test('boolean metadata flags are not searchable text', () => {
  const records = [
    { sourceId: 't1', type: 'task', title: 'Something to do', body: '', breadcrumb: '', metadata: { due: '', completed: false, priority: '' }, timestamp: 0 },
    { sourceId: 't2', type: 'task', title: 'Another thing', body: '', breadcrumb: '', metadata: { due: '', completed: true, priority: '' }, timestamp: 0 }
  ];
  assert.equal(engine.search(records, 'false', { now: NOW }).total, 0);
  assert.equal(engine.search(records, 'true', { now: NOW }).total, 0);
});

test('locked records stay title-only even with metadata present', () => {
  const locked = page({
    title: 'Private journal',
    body: 'NEVER-SNIPPET secret contents',
    breadcrumb: 'Personal',
    locked: true,
    metadata: { locked: true, updatedAt: '2026-05-22T00:00:00Z' }
  });
  assert.equal(engine.search([locked], 'journal', { now: NOW }).total, 1, 'title still matches');
  assert.equal(engine.search([locked], 'NEVER-SNIPPET', { now: NOW }).total, 0, 'body never matches');
  assert.equal(engine.search([locked], '2026-05-22', { now: NOW }).total, 0, 'metadata never qualifies a locked page');
  const byTitle = engine.search([locked], 'journal', { now: NOW });
  assert.equal(byTitle.results[0].snippet, null);
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

test('Settings prematched results preserve bounded owner relevance', () => {
  const records = [
    { sourceId: 'help', type: 'assistant', title: 'Help: Appearance', body: '', breadcrumb: '', metadata: {}, timestamp: 0, prematched: true },
    { sourceId: 'answer', type: 'assistant', title: 'Answer: Change appearance', body: '', breadcrumb: '', metadata: {}, timestamp: 0, prematched: true },
    { sourceId: 'theme', type: 'setting', title: 'Settings: Theme', body: '', breadcrumb: '', metadata: {}, timestamp: 0, prematched: true, settingsSearchScore: 250 }
  ];
  const out = engine.search(records, 'turn on dark mode', { now: NOW });

  assert.equal(out.results[0].sourceId, 'theme', 'Settings owner relevance outranks generic secondary matches');
  assert.equal(out.results[0].score, 250);
  assert.equal(out.results.find(result => result.sourceId === 'help').score, 30, 'non-Settings prematched scoring stays unchanged');
  assert.equal(out.results.find(result => result.sourceId === 'answer').score, 30);
});

test('Settings relevance is capped and strong direct title matches remain higher', () => {
  const capped = engine.search([
    { sourceId: 'capped', type: 'setting', title: 'Settings: Theme', body: '', breadcrumb: '', metadata: {}, timestamp: 0, prematched: true, settingsSearchScore: '900' }
  ], 'turn on dark mode', { now: NOW });
  assert.equal(capped.results[0].score, 300);

  const direct = engine.search([
    { sourceId: 'owner', type: 'setting', title: 'Settings: Theme', body: '', breadcrumb: '', metadata: {}, timestamp: 0, prematched: true, settingsSearchScore: 250 },
    { sourceId: 'direct', type: 'setting', title: 'Dark Mode', body: '', breadcrumb: '', metadata: {}, timestamp: 0, prematched: true, settingsSearchScore: 250 }
  ], 'dark mode', { now: NOW });
  assert.equal(direct.results[0].sourceId, 'direct');
  assert.ok(direct.results[0].score > 300);

  const invalid = engine.search([
    { sourceId: 'invalid', type: 'setting', title: 'Settings: Theme', body: '', breadcrumb: '', metadata: {}, timestamp: 0, prematched: true, settingsSearchScore: Infinity }
  ], 'turn on dark mode', { now: NOW });
  assert.equal(invalid.results[0].score, 30, 'non-finite owner scores fall back to the existing prematched score');
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

test('one-edit spelling recovery preserves title priority over body matches', () => {
  const records = [
    page({ sourceId: 'body', title: 'Word list', body: 'receive is a common spelling error' }),
    page({ sourceId: 'typo-title', title: 'Receive practice', body: '' }),
    page({ sourceId: 'exact-title', title: 'Recieve glossary', body: '' })
  ];
  const out = engine.search(records, 'recieve', { now: NOW });

  assert.equal(out.total, 3);
  assert.equal(out.results[0].sourceId, 'exact-title', 'a direct title match ranks first');
  assert.equal(out.results[1].sourceId, 'typo-title', 'a one-edit title match outranks a one-edit body match');
  assert.equal(out.results[1].matchKind, 'title');
  assert.equal(out.results[2].sourceId, 'body', 'a one-edit body match stays below title matches');
});

test('two-word searches allow one typo while still requiring both query tokens', () => {
  const records = [
    page({ sourceId: 'matching', title: 'Receive Notes', body: '' }),
    page({ sourceId: 'partial', title: 'Receive Guide', body: '' })
  ];
  const out = engine.search(records, 'recieve notes', { now: NOW });

  assert.equal(out.total, 1);
  assert.equal(out.results[0].sourceId, 'matching');
});

test('fuzzy and subsequence snippets expose the visible matched text ranges', () => {
  const typo = engine.buildSnippet('Read the receive chapter before class.', ['recieve'], 120);
  assert.ok(typo.ranges.some(([start, end]) => typo.text.slice(start, end).toLowerCase() === 'receive'));

  const subsequence = engine.buildSnippet('AP Biology', ['apbio'], 120);
  const highlighted = subsequence.ranges.map(([start, end]) => subsequence.text.slice(start, end));
  assert.deepEqual(highlighted, ['AP', 'Bio']);
});

test('direct field matches outrank typo recovery, which outranks subsequence matches', () => {
  const direct = engine.scoreField('Receive', 'receive');
  const typo = engine.scoreField('Receive', 'recieve');
  const subsequence = engine.scoreField('AP Biology', 'apbio');

  assert.ok(direct > typo);
  assert.ok(typo > subsequence);
});

test('token matching is capped while full literal phrase matching remains available', () => {
  const manyTokens = Array.from({ length: 15 }, (_, index) => `topic${index}`).join(' ');
  const normalizedTokens = engine.normalizeQuery(manyTokens);
  assert.equal(normalizedTokens.words.length, 12);
  assert.equal(normalizedTokens.phrase, manyTokens.toLowerCase());

  const longPhrase = 'literal'.repeat(45);
  assert.deepEqual(engine.normalizeQuery(longPhrase).words, [], 'an over-limit partial token is not fuzzy-matched');
  const out = engine.search([
    page({ title: 'Long note', body: `prefix ${longPhrase} suffix` })
  ], longPhrase, { now: NOW });
  assert.equal(out.total, 1, 'a full literal phrase longer than 256 characters still searches the complete body');
  assert.equal(out.results[0].matchKind, 'body');
});

test('typo scans stop at 20,000 characters while literal body search still reaches later text', () => {
  const lateToken = `${'x '.repeat(10000)}receive`;
  assert.equal(engine.scoreField(lateToken, 'recieve'), 0, 'field typo recovery is bounded');

  const record = page({ title: 'Reading list', body: lateToken });
  assert.equal(engine.search([record], 'recieve', { now: NOW }).total, 0, 'body typo recovery is bounded');
  const literal = engine.search([record], 'receive', { now: NOW });
  assert.equal(literal.total, 1, 'literal matching still scans the full body');
  assert.ok(literal.results[0].snippet.text.includes('receive'));
});
