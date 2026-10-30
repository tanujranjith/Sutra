import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/features/notes/editor-v2.js', import.meta.url), 'utf8');
const declarations = ['maybeSlash', 'chooseSlashItem', 'onEditorKeydown']
  .map(name => extractFunction(source, name).body).join('\n');

function fixture() {
  const calls = { refreshes: 0, deleted: [], activated: [], prevented: 0, stopped: 0 };
  const doc = {};
  const editor = {
    isFocused: true,
    isEditable: true,
    view: {},
    state: { doc, selection: { empty: true, from: 1, to: 1 } },
    chain() {
      return {
        focus() { return this; },
        deleteRange(range) { calls.deleted.push(range); return this; },
        run() { return true; }
      };
    }
  };
  const state = { editor };
  const ctx = { slashOpen: true, slashActiveIndex: 0, slashFilter: '', slashItems: [], slashRange: null };
  const items = [
    { label: 'Writing help', deferred: true, writingCommand: true, keywords: 'grammar', run: range => calls.activated.push(['writing', range]) },
    { label: 'Table', run: () => calls.activated.push(['table']) }
  ];
  let query = null;
  const currentSlashQuery = () => query;
  const closeSlash = () => { ctx.slashOpen = false; ctx.slashItems = []; ctx.slashRange = null; };
  const onKeydown = new Function('state', 'ctx', 'currentSlashQuery', 'slashItemDefs', 'renderSlashMenu',
    'positionSlashMenu', 'closeSlash', 'scheduleMirrorFlush', 'beginPlainTextPaste',
    `${declarations}\nreturn onEditorKeydown;`)(state, ctx, currentSlashQuery, () => items,
    () => { calls.refreshes++; }, () => {}, closeSlash, () => {}, () => {});
  function key(key) {
    onKeydown({ key, preventDefault() { calls.prevented++; }, stopPropagation() { calls.stopped++; } });
  }
  function setQuery(text) {
    query = text === null ? null : { from: 1, to: 1 + text.length, text, filter: text.slice(1), editor };
  }
  return { calls, ctx, editor, items, key, setQuery };
}

for (const key of ['Enter', 'Tab']) {
  test(`${key} activates the latest typed slash query before the scheduled menu refresh`, () => {
    const f = fixture();
    f.ctx.slashItems = f.items;
    f.ctx.slashRange = { from: 1, to: 3, text: '/t', editor: f.editor };
    f.setQuery('/table');
    f.key(key);
    assert.deepEqual(f.calls.deleted, [{ from: 1, to: 7 }]);
    assert.deepEqual(f.calls.activated, [['table']]);
    assert.equal(f.calls.prevented, 1);
    assert.equal(f.calls.stopped, 1);
  });
}

test('a dismissed menu stays dismissed on Enter', () => {
  const f = fixture();
  f.ctx.slashItems = f.items;
  f.ctx.slashRange = { from: 1, to: 3, text: '/t', editor: f.editor };
  f.setQuery('/table');
  f.key('Escape');
  f.key('Enter');
  assert.equal(f.calls.refreshes, 0);
  assert.deepEqual(f.calls.activated, []);
  assert.equal(f.calls.prevented, 1); // Escape only; Enter retains its normal behavior.
});

test('selection-based writing commands retain their captured selection', () => {
  const f = fixture();
  f.editor.state.selection = { empty: false, from: 2, to: 8 };
  const range = { selection: true, from: 2, to: 8, editor: f.editor, doc: f.editor.state.doc };
  f.ctx.slashRange = range;
  f.ctx.slashItems = [f.items[0]];
  f.setQuery(null);
  f.key('Enter');
  assert.deepEqual(f.calls.activated, [['writing', range]]);
  assert.deepEqual(f.calls.deleted, []);
  assert.equal(f.calls.refreshes, 0);
  assert.equal(f.calls.prevented, 1);
});

test('an invalidated typed query releases Enter and ordinary typing does not refresh the menu', () => {
  const f = fixture();
  f.ctx.slashRange = { from: 1, to: 3, text: '/t', editor: f.editor };
  f.ctx.slashItems = f.items;
  f.setQuery(null);
  f.key('x');
  assert.equal(f.calls.refreshes, 0);
  f.key('Enter');
  assert.equal(f.ctx.slashOpen, false);
  assert.equal(f.calls.prevented, 0);
  assert.equal(f.calls.stopped, 0);
  assert.deepEqual(f.calls.activated, []);
});

test('a query with no matching command releases Tab', () => {
  const f = fixture();
  f.ctx.slashRange = { from: 1, to: 3, text: '/t', editor: f.editor };
  f.ctx.slashItems = f.items;
  f.setQuery('/zzz');
  f.key('Tab');
  assert.equal(f.ctx.slashOpen, false);
  assert.equal(f.calls.prevented, 0);
  assert.equal(f.calls.stopped, 0);
  assert.deepEqual(f.calls.activated, []);
});
