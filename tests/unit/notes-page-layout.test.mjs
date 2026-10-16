import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadEditorHelpers() {
  const source = readFileSync(new URL('../../src/features/notes/editor-v2.js', import.meta.url), 'utf8');
  const context = { window: {}, document: {}, console, Date, Math, Number, Array, Object, Set, Map, Promise, RegExp };
  vm.runInNewContext(source, context, { filename: 'editor-v2.js' });
  return context.window.SutraNotesEditorV2;
}

function plan(events, options = {}) {
  const result = loadEditorHelpers()._planAutomaticPageBreaks(events, {
    enabled: true,
    pageHeight: 1056,
    topPadding: 96,
    bottomPadding: 120,
    gapHeight: 60,
    ...options
  });
  return JSON.parse(JSON.stringify(result));
}

test('long text moves the first overflowing line past paper, gap, and next-page top margin', () => {
  const breaks = plan([
    { type: 'line', pos: 10, top: 900, bottom: 928 },
    { type: 'line', pos: 20, top: 930, bottom: 954 },
    { type: 'line', pos: 30, top: 1000, bottom: 1020 }
  ]);

  assert.equal(breaks.length, 1);
  assert.equal(breaks[0].pos, 20);
  assert.equal(breaks[0].height, 282);
  assert.equal(breaks[0].gapOffset, 126);
  assert.equal(breaks[0].pageBoundary, 1056);
  assert.equal(breaks[0].anchorKind, 'line');
  assert.equal(930 + breaks[0].height, 1212);
});

test('duplicate inline fragments resolved to one text position create only one page break', () => {
  const breaks = plan([
    { type: 'line', pos: 20, top: 930, bottom: 954 },
    { type: 'line', pos: 20, top: 932, bottom: 958 }
  ]);

  assert.equal(breaks.length, 1);
  assert.equal(breaks[0].pos, 20);
  assert.equal(breaks[0].height, 282);
});

test('overlapping inline fragments with different baselines stay on one measured line', () => {
  const rows = loadEditorHelpers()._groupPageLineRects([
    { top: 10, bottom: 25, left: 0, right: 40, width: 40, height: 15 },
    { top: 6, bottom: 19, left: 41, right: 70, width: 29, height: 13 },
    { top: 30, bottom: 45, left: 0, right: 20, width: 20, height: 15 }
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(rows[0])), {
    top: 6, bottom: 25, baseline: 22, left: 0, right: 70, minHeight: 13
  });
});

test('a stored manual break starts a fresh page and keeps later content on that page', () => {
  const breaks = plan([
    { type: 'line', pos: 10, top: 500, bottom: 528 },
    { type: 'manual', pos: 20, top: 550, bottom: 550, hasFollowing: true },
    { type: 'line', pos: 21, top: 550, bottom: 578 }
  ]);

  assert.equal(breaks.length, 1);
  assert.equal(breaks[0].reason, 'manual');
  assert.equal(breaks[0].pos, 20);
  assert.equal(breaks[0].pageBoundary, 1056);
  assert.equal(breaks[0].anchorKind, 'manual');
  assert.equal(550 + breaks[0].height, 1212);
});

test('an overflowing atomic block retains its geometry anchor for post-widget alignment', () => {
  const breaks = plan([
    { type: 'line', pos: 10, top: 900, bottom: 928 },
    { type: 'atom', pos: 20, top: 930, bottom: 1120 }
  ]);

  assert.equal(breaks.length, 1);
  assert.equal(breaks[0].pos, 20);
  assert.equal(breaks[0].pageBoundary, 1056);
  assert.equal(breaks[0].anchorKind, 'atom');
});

test('oversized atomic content is kept intact and following text is aligned to a later sheet', () => {
  const breaks = plan([
    { type: 'atom', pos: 10, top: 300, bottom: 1300 },
    { type: 'line', pos: 20, top: 1300, bottom: 1328 }
  ]);

  assert.deepEqual(breaks, []);
});

test('page layout does nothing when Pages mode is disabled', () => {
  const planner = loadEditorHelpers()._planAutomaticPageBreaks;
  assert.deepEqual(JSON.parse(JSON.stringify(planner([{ type: 'line', pos: 5, top: 1000, bottom: 1020 }], {
    enabled: false, pageHeight: 1056, topPadding: 96, bottomPadding: 120
  }))), []);
});
