import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

function dialogFixture() {
  const callbacks = [];
  const document = { activeElement: null, body: { classList: { add() {}, remove() {} } }, querySelector: () => null };
  function element() {
    const listeners = new Map();
    const classes = new Set();
    return {
      value: '', textContent: '', innerHTML: '', hidden: false,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
      addEventListener(name, callback) { listeners.set(name, callback); },
      removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
      click() { listeners.get('click')?.({ target: this, preventDefault() {} }); },
      appendChild() {}, focus() { document.activeElement = this; },
      setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    };
  }
  const ids = ['htmlEmbedModal', 'htmlEmbedModalTitle', 'htmlEmbedModalSubtitle', 'htmlEmbedModalLabel',
    'htmlEmbedModalInput', 'htmlEmbedModalError', 'htmlEmbedModalPreview', 'htmlEmbedModalCancelBtn', 'htmlEmbedModalConfirmBtn'];
  const nodes = Object.fromEntries(ids.map(id => [id, element()]));
  const modal = nodes.htmlEmbedModal;
  modal.contains = node => Object.values(nodes).includes(node);
  document.getElementById = id => nodes[id] || null;
  document.createElement = element;
  const declaration = extractFunction(source, 'showHtmlEmbedDialog');
  assert.ok(declaration);
  const open = new Function('document', 'sanitizeHtmlEmbedContent', 'renderHtmlEmbedIntoSurface', 'showToast', 'requestAnimationFrame',
    `let activeHtmlEmbedDialogResolver = null; ${declaration.body}; return showHtmlEmbedDialog;`)(
    document, value => String(value), () => {}, () => {}, callback => callbacks.push(callback)
  );
  return { open, nodes, document, runNextFrame: () => { assert.ok(callbacks.length); callbacks.shift()(); } };
}

test('embed dialog autofocus runs only while its untouched opening owns the dialog', () => {
  const fixture = dialogFixture();
  fixture.open({ defaultValue: '<p>original</p>' });
  fixture.runNextFrame();
  const input = fixture.nodes.htmlEmbedModalInput;
  assert.equal(fixture.document.activeElement, input);
  assert.equal(input.selectionStart, input.value.length);
  assert.equal(input.selectionEnd, input.value.length);
});

test('embed dialog autofocus never replaces a user selection, another focused control, or edited input', () => {
  for (const situation of ['selection', 'control', 'edited']) {
    const fixture = dialogFixture();
    fixture.open({ defaultValue: '<p>original</p>' });
    const input = fixture.nodes.htmlEmbedModalInput;
    if (situation === 'selection') {
      fixture.document.activeElement = input;
      input.setSelectionRange(2, 5);
    } else if (situation === 'control') {
      fixture.document.activeElement = fixture.nodes.htmlEmbedModalCancelBtn;
    } else {
      input.value = '<p>changed before autofocus</p>';
    }
    const beforeFocus = fixture.document.activeElement;
    const beforeSelection = [input.selectionStart, input.selectionEnd];
    fixture.runNextFrame();
    assert.equal(fixture.document.activeElement, beforeFocus, situation);
    assert.deepEqual([input.selectionStart, input.selectionEnd], beforeSelection, situation);
  }
});

test('a closed or replaced embed dialog cannot run an old autofocus callback', () => {
  const fixture = dialogFixture();
  fixture.open({ defaultValue: '<p>first</p>' });
  fixture.nodes.htmlEmbedModalCancelBtn.click();
  fixture.runNextFrame();
  assert.equal(fixture.document.activeElement, null);

  fixture.open({ defaultValue: '<p>second</p>' });
  fixture.open({ defaultValue: '<p>third</p>' });
  fixture.runNextFrame();
  assert.equal(fixture.document.activeElement, null, 'the superseded callback must not focus the new dialog');
  fixture.runNextFrame();
  assert.equal(fixture.document.activeElement, fixture.nodes.htmlEmbedModalInput);
  assert.equal(fixture.nodes.htmlEmbedModalInput.value, '<p>third</p>');
});
