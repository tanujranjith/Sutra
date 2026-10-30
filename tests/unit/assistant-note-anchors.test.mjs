import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const require = createRequire(import.meta.url);
const patches = require('../../src/features/assistant/note-patch-system.js');
const source = readFileSync(new URL('../../src/features/assistant/flow-assistant.js', import.meta.url), 'utf8');
function validator(note) {
  return new Function('bridge', 'window', extractFunction(source, 'validateAnchoredNoteAction').body + ';return validateAnchoredNoteAction;')(
    () => ({ getPageById: id => id === note.id ? note : null }), { SutraNotePatchSystem: patches });
}

test('unique literal source quotes repair model offsets before review and apply through the canonical engine', () => {
  const note = { id: 'essay', content: '<p>Original essay.</p><p>Second paragraph.</p>', versions: [{ id: 'snapshot-123' }] };
  for (const coordinates of [{}, { start: 999, end: 2000 }]) {
    const action = { noteId: note.id, baseHash: patches.hash(note.content), versionId: '1',
      hunks: [{ ...coordinates, before: note.content, replacement: '<p>Shorter essay.</p>' }] };
    assert.equal(validator(note)(action).ok, true);
    assert.equal(action.hunks[0].start, 0);
    assert.equal(action.hunks[0].end, note.content.length);
    const proposal = patches.create({ note, ...action });
    const result = patches.apply(proposal, note, { approveAll: true });
    assert.equal(result.ok, true);
    assert.equal(result.content, '<p>Shorter essay.</p>');
    assert.equal(patches.revert(result.receipt, { ...note, content: result.content }).content, note.content);
  }
});

test('ambiguous, absent, overlapping, and stale source anchors remain blocked', () => {
  const note = { id: 'n', content: '<p>Repeat Repeat</p>' };
  const validate = validator(note);
  assert.equal(validate({ noteId: 'n', hunks: [{ before: 'Repeat', replacement: 'Other' }] }).ok, false);
  assert.equal(validate({ noteId: 'n', hunks: [{ before: 'Missing', replacement: 'Other' }] }).ok, false);
  assert.equal(validate({ noteId: 'n', hunks: [
    { before: '<p>Repeat Repeat</p>', replacement: '<p>Other</p>' },
    { before: 'Repeat Repeat', replacement: 'Other' }
  ] }).ok, false);
  assert.equal(validate({ noteId: 'n', baseHash: 'old-hash', hunks: [{ start: 0, end: 13, before: 'Repeat Repeat', replacement: 'Other' }] }).ok, false);
  assert.equal(note.content, '<p>Repeat Repeat</p>');
});

test('prompt note version matches the patch engine rather than an individual snapshot id', () => {
  const note = { id: 'n', content: '<p>Essay.</p>', versions: [{ id: 'snapshot-id' }] };
  const summarize = new Function('syncActiveV2NoteForContext', 'bridge', 'currentLockedPageAccessIds', 'window', 'document', 'setUserHtml', 'truncate',
    extractFunction(source, 'assistantPageWithinScope').body + '\n' + extractFunction(source, 'getActiveNoteSummary').body + ';return getActiveNoteSummary;')(
    () => {}, () => ({ currentPageId: 'n', pages: [note] }), () => [], { SutraNotePatchSystem: patches },
    { createElement: () => ({ textContent: 'Essay.' }) }, () => {}, text => text);
  assert.equal(summarize().versionId, patches.create({ note, after: '<p>Short.</p>' }).versionId);
});
