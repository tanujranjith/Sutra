import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const htmlPagesSource = await readFile(new URL('../../src/features/workspace/html-pages.js', import.meta.url), 'utf8');
const slidesSource = await readFile(new URL('../../src/features/workspace/slides.js', import.meta.url), 'utf8');
const sheetsSource = await readFile(new URL('../../src/features/workspace/sheets.js', import.meta.url), 'utf8');
const sheetsEngineSource = await readFile(new URL('../../src/features/workspace/sheets-engine.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = String(tagName || 'div').toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.style = {};
    this.dataset = {};
    this.classNames = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classNames.add(name)),
      remove: (...names) => names.forEach((name) => this.classNames.delete(name)),
      contains: (name) => this.classNames.has(name),
      toggle: (name, force) => {
        const next = force === undefined ? !this.classNames.has(name) : !!force;
        if (next) this.classNames.add(name);
        else this.classNames.delete(name);
        return next;
      }
    };
    this.parentNode = null;
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.checked = false;
    this.open = false;
    this.clientWidth = 640;
    this.clientHeight = 420;
    this.scrollLeft = 0;
    this.scrollTop = 0;
    this.isConnected = true;
    this._id = '';
    this._queryNodes = new Map();
  }

  set id(value) {
    this._id = String(value || '');
    if (this._id && this.ownerDocument) this.ownerDocument.ids.set(this._id, this);
  }

  get id() { return this._id; }

  set className(value) {
    this.classNames = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  get className() { return Array.from(this.classNames).join(' '); }

  setAttribute(name, value) { this.attributes.set(String(name), String(value)); }
  getAttribute(name) { return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null; }
  removeAttribute(name) { this.attributes.delete(String(name)); }
  toggleAttribute(name, force) {
    const next = force === undefined ? !this.attributes.has(name) : !!force;
    if (next) this.attributes.set(name, '');
    else this.attributes.delete(name);
    return next;
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry !== listener));
  }
  dispatchEvent(event) {
    const dispatched = Object.assign({ target: this }, event || {});
    (this.listeners.get(dispatched.type) || []).slice().forEach((listener) => listener(dispatched));
    return true;
  }
  querySelector(selector) {
    if (!this._queryNodes.has(selector)) {
      const node = new FakeElement(this.ownerDocument, 'div');
      node.parentNode = this;
      this._queryNodes.set(selector, node);
    }
    return this._queryNodes.get(selector);
  }
  querySelectorAll() { return []; }
  getClientRects() {
    // Hidden or detached ancestors suppress layout boxes, unlike visibility:hidden.
    for (let node = this; node; node = node.parentNode) {
      if (!node.isConnected || node.hidden || node.attributes.has('hidden') || node.style.display === 'none') return [];
    }
    return [{
      x: 0, y: 0, top: 0, left: 0,
      width: this.clientWidth, height: this.clientHeight,
      right: this.clientWidth, bottom: this.clientHeight
    }];
  }
  closest() { return this; }
  appendChild(child) {
    if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((item) => item !== child);
    child.parentNode = this;
    child.isConnected = true;
    this.children.push(child);
    return child;
  }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  insertBefore(node, reference) {
    if (node.parentNode) node.parentNode.children = node.parentNode.children.filter((item) => item !== node);
    node.parentNode = this;
    node.isConnected = true;
    const index = this.children.indexOf(reference);
    this.children.splice(index < 0 ? this.children.length : index, 0, node);
    return node;
  }
  replaceChildren(...nodes) {
    this.children.forEach((child) => { child.parentNode = null; child.isConnected = false; });
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((item) => item !== this);
    this.parentNode = null;
    this.isConnected = false;
  }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  click() { if (typeof this.onclick === 'function') this.onclick({ target: this }); }
  select() {}
}

class FakeDocument {
  constructor() {
    this.ids = new Map();
    this.listeners = new Map();
    this.activeElement = null;
    this.body = this.createElement('body');
    this.documentElement = this.createElement('html');
    this.documentElement.setAttribute('data-sutra-workspace-locked', 'false');
    this.notesPane = this.createElement('main');
    this.notesPane.id = 'notesPrimaryPane';
    this.body.appendChild(this.notesPane);
  }
  createElement(tagName) { return new FakeElement(this, tagName); }
  createTextNode(value) { const node = this.createElement('#text'); node.textContent = String(value || ''); return node; }
  getElementById(id) { return this.ids.get(String(id)) || null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry !== listener));
  }
}

function makePage(fields) {
  return Object.assign({
    id: 'locked-source-page',
    title: 'Protected page',
    type: 'note',
    content: '',
    blocks: [],
    spaceId: 'space-a',
    isLocked: false,
    lockHash: ''
  }, fields || {});
}

function makeWorld(page) {
  const document = new FakeDocument();
  const listeners = new Map();
  let authorized = true;
  const bridge = {
    pages: [page],
    currentPageId: page.id,
    activeSpaceId: 'space-a',
    activeView: 'notes',
    unlockedPageIds: new Set(),
    persistAppData() {},
    renderPagesList() {},
    isPageContentAuthorized(candidate) {
      return candidate === page && authorized;
    },
    canWritePageContent(candidate) { return candidate === page && this.isPageContentAuthorized(candidate); }
  };
  const window = {
    document,
    flowAtelier: bridge,
    matchMedia: () => ({ matches: true }),
    setTimeout: () => 1,
    clearTimeout() {},
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== listener));
    },
    dispatchEvent(event) {
      (listeners.get(event.type) || []).slice().forEach((listener) => listener(event));
    },
    SutraDOMSafety: {
      renderUserHTMLToFrame(host) {
        const frame = document.createElement('iframe');
        host.appendChild(frame);
        return frame;
      }
    }
  };
  const context = vm.createContext({ window, document, Blob, console });
  return {
    context,
    document,
    window,
    bridge,
    load(source, filename) { vm.runInContext(source, context, { filename }); },
    pageLoaded() {
      window.dispatchEvent({ type: 'sutra:note-page-loaded', detail: { pageId: page.id } });
    },
    lockCurrentPage() {
      authorized = false;
      page.isLocked = true;
      page.lockHash = 'test-lock-hash';
      window.dispatchEvent({ type: 'sutra:note-page-locked', detail: { pageId: page.id } });
    },
    lockWorkspace() {
      document.documentElement.setAttribute('data-sutra-workspace-locked', 'true');
      window.dispatchEvent({ type: 'sutra:workspace-lock-changed', detail: { locked: true } });
    },
    unlockWorkspace() {
      document.documentElement.setAttribute('data-sutra-workspace-locked', 'false');
      window.dispatchEvent({ type: 'sutra:workspace-lock-changed', detail: { locked: false } });
      this.pageLoaded();
    }
  };
}

test('HTML Page lock event clears live source and sandbox preview', () => {
  const page = makePage({
    htmlDocument: { version: 1, source: '<h1>Protected source</h1>', createdAt: 'now', updatedAt: 'now' }
  });
  const world = makeWorld(page);
  world.load(htmlPagesSource, 'src/features/workspace/html-pages.js');
  world.pageLoaded();

  const editor = world.document.getElementById('htmlPageEditor');
  assert.ok(editor);
  const source = editor.querySelector('[data-html-source]');
  const preview = editor.querySelector('[data-html-preview]');
  assert.equal(source.value, page.htmlDocument.source);
  world.window.SutraHTMLPages.renderPreview();
  assert.equal(preview.children[0] && preview.children[0].tagName, 'IFRAME');
  assert.ok(world.document.body.classList.contains('html-page-active'));

  world.lockCurrentPage();

  assert.equal(editor.hidden, true);
  assert.equal(source.value, '');
  assert.equal(preview.children.length, 0);
  assert.equal(world.document.body.classList.contains('html-page-active'), false);
});

test('Slides lock event hides and clears the workbench and exits a presentation', () => {
  const page = makePage({
    slides: {
      version: 2,
      size: 'widescreen',
      theme: 'sutra',
      slides: [{
        id: 'slide-protected',
        layout: 'blank',
        title: 'Protected slide',
        speakerNotes: 'Private speaker notes',
        background: '',
        elements: []
      }]
    }
  });
  const world = makeWorld(page);
  world.load(slidesSource, 'src/features/workspace/slides.js');
  world.pageLoaded();

  const editor = world.document.getElementById('slidesEditor');
  const stage = editor.querySelector('.slides-stage');
  const notes = editor.querySelector('.slides-notes-panel textarea');
  assert.equal(editor.hidden, false);
  assert.equal(notes.value, 'Private speaker notes');
  assert.ok(stage.children.length > 0, 'the visible slide has content');

  world.window.SutraSlides.present();
  const overlay = world.document.body.children.find((child) => child.className.includes('slides-present-overlay'));
  assert.ok(overlay, 'presentation overlay is mounted while the deck is authorized');
  assert.ok(world.document.body.classList.contains('slides-page-active'));

  world.lockCurrentPage();

  assert.equal(editor.hidden, true);
  assert.equal(stage.children.length, 0);
  assert.equal(editor.querySelector('.slides-thumbnail-list').children.length, 0);
  assert.equal(notes.value, '');
  assert.equal(overlay.isConnected, false);
  assert.equal(world.document.body.classList.contains('slides-page-active'), false);
});

test('Sheets lock event hides the workbench and clears protected drafts and rendered values', () => {
  const page = makePage();
  const world = makeWorld(page);
  world.load(sheetsEngineSource, 'src/features/workspace/sheets-engine.js');
  const workbook = world.window.SutraSheetsEngine.createWorkbook('Protected workbook');
  workbook.sheets[0].rows = workbook.sheets[0].rows.slice(0, 8);
  workbook.sheets[0].columns = workbook.sheets[0].columns.slice(0, 8);
  page.spreadsheet = workbook;
  world.load(sheetsSource, 'src/features/workspace/sheets.js');
  world.pageLoaded();

  const editor = world.document.getElementById('sheetsEditor');
  const formula = editor.querySelector('[data-formula]');
  const preview = editor.querySelector('[data-value-preview]');
  const grid = editor.querySelector('.sheets-grid-canvas');
  assert.equal(editor.hidden, false);
  assert.ok(grid.children.length > 0, 'the authorized workbook rendered cells');
  assert.ok(world.document.body.classList.contains('sheets-page-active'));

  formula.value = 'UNSAVED PRIVATE DRAFT';
  preview.textContent = 'Private calculated result';
  world.lockCurrentPage();

  assert.equal(editor.hidden, true);
  assert.equal(formula.value, '');
  assert.equal(preview.textContent, '');
  assert.equal(grid.children.length, 0);
  assert.equal(world.document.body.classList.contains('sheets-page-active'), false);
});

function makeCanonicalWorkbook() {
  const rows = Array.from({ length: 8 }, (_, index) => ({ id: 'row-' + index, height: 28, hidden: false }));
  const columns = Array.from({ length: 8 }, (_, index) => ({ id: 'column-' + index, width: 120, hidden: false }));
  return {
    version: 2,
    title: 'Protected workbook',
    sheets: [{
      id: 'sheet-protected',
      name: 'Sheet1',
      rows,
      columns,
      cells: { 'row-0:column-0': { value: 'Canonical A1', formula: '', styleId: '', note: '', validation: null } },
      merges: [],
      frozen: { rows: 0, columns: 0 },
      filters: [],
      conditionalFormats: [],
      charts: []
    }],
    namedRanges: {},
    styles: {},
    importWarnings: []
  };
}

function makeSheetsEditWorld(value) {
  const page = makePage({ spreadsheet: makeCanonicalWorkbook() });
  page.spreadsheet.sheets[0].cells['row-0:column-0'].value = value;
  page.spreadsheet.sheets[0].cells['row-0:column-1'] = { value: '', formula: '=IF(A1,1,0)' };
  const world = makeWorld(page);
  let saves = 0;
  world.bridge.persistAppData = () => { saves += 1; };
  world.load(sheetsEngineSource, 'src/features/workspace/sheets-engine.js');
  world.load(sheetsSource, 'src/features/workspace/sheets.js');
  world.pageLoaded();
  const editor = world.document.getElementById('sheetsEditor');
  const formula = editor.querySelector('[data-formula]');
  // A browser input exposes its value as text even for typed workbook data.
  formula.value = String(value);
  return { world, page, editor, formula, saves: () => saves };
}

test('Sheets formula focus and blur preserve Boolean false and dependent results without a save', () => {
  const state = makeSheetsEditWorld(false);
  const before = JSON.stringify(state.page.spreadsheet);
  state.formula.dispatchEvent({ type: 'focus' });
  state.formula.dispatchEvent({ type: 'blur', relatedTarget: null });
  assert.equal(JSON.stringify(state.page.spreadsheet), before);
  assert.equal(state.saves(), 0);
  const book = state.page.spreadsheet;
  assert.equal(state.world.window.SutraSheetsEngine.evaluate(book).getValue(book.sheets[0], 0, 1), 0);
});

test('Sheets unchanged Enter and explicit Apply preserve numeric cell types and history', () => {
  const state = makeSheetsEditWorld(42);
  const before = JSON.stringify(state.page.spreadsheet);
  state.formula.dispatchEvent({ type: 'focus' });
  state.editor.querySelector('[data-formula-apply]').click();
  state.formula.value = '42';
  state.formula.dispatchEvent({ type: 'focus' });
  state.formula.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {} });
  assert.equal(JSON.stringify(state.page.spreadsheet), before);
  assert.equal(state.saves(), 0);
  state.world.window.SutraSheets.undo();
  assert.equal(state.saves(), 0, 'unchanged actions did not create an Undo checkpoint');
});

test('Sheets changed draft commits once on blur and keeps the sheet tab click target', () => {
  const state = makeSheetsEditWorld(false);
  const tabs = state.editor.querySelector('[data-sheet-tabs]');
  const tab = tabs.children[0];
  tab.closest = () => null; // It is a sheet tab, not an Apply/Cancel action.
  state.formula.dispatchEvent({ type: 'focus' });
  state.formula.value = 'Reviewed text';
  state.formula.dispatchEvent({ type: 'input' });
  state.formula.dispatchEvent({ type: 'blur', relatedTarget: tab });
  assert.equal(state.page.spreadsheet.sheets[0].cells['row-0:column-0'].value, 'Reviewed text');
  assert.equal(state.saves(), 1);
  assert.equal(tabs.children[0], tab, 'blur must not replace a tab before its click');
  state.formula.dispatchEvent({ type: 'blur', relatedTarget: null });
  assert.equal(state.saves(), 1);
  state.world.window.SutraSheets.undo();
  assert.equal(state.page.spreadsheet.sheets[0].cells['row-0:column-0'].value, false);
});

test('Sheets Escape discards a changed draft without converting the original Boolean', () => {
  const state = makeSheetsEditWorld(false);
  state.formula.dispatchEvent({ type: 'focus' });
  state.formula.value = 'Changed';
  state.formula.dispatchEvent({ type: 'input' });
  state.formula.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
  state.formula.dispatchEvent({ type: 'blur', relatedTarget: null });
  assert.equal(state.page.spreadsheet.sheets[0].cells['row-0:column-0'].value, false);
  assert.equal(state.saves(), 0);
});

test('Sheets commits a draft to its original cell before pointer selection moves', () => {
  const state = makeSheetsEditWorld(false);
  state.formula.dispatchEvent({ type: 'focus' });
  state.formula.value = 'Edited A1';
  state.formula.dispatchEvent({ type: 'input' });
  const grid = state.editor.querySelector('.sheets-grid-canvas');
  const b1 = grid.children.find((cell) => cell.getAttribute('aria-label') === 'B1');
  b1.dispatchEvent({ type: 'pointerdown', shiftKey: false });
  assert.equal(state.page.spreadsheet.sheets[0].cells['row-0:column-0'].value, 'Edited A1');
  assert.equal(state.page.spreadsheet.sheets[0].cells['row-0:column-1'].formula, '=IF(A1,1,0)');
  assert.equal(state.editor.querySelector('[data-address]').textContent, 'B1');
  assert.equal(state.saves(), 1);
});

test('Sheets rejects drafts after the owning cell changes or a remote apply reloads it', () => {
  const state = makeSheetsEditWorld(false);
  state.formula.dispatchEvent({ type: 'focus' });
  state.formula.value = 'Old draft';
  state.formula.dispatchEvent({ type: 'input' });
  state.page.spreadsheet.sheets[0].cells['row-0:column-0'].value = 'New canonical value';
  state.editor.querySelector('[data-formula-apply]').click();
  assert.equal(state.page.spreadsheet.sheets[0].cells['row-0:column-0'].value, 'New canonical value');
  assert.equal(state.saves(), 0);
  state.formula.dispatchEvent({ type: 'focus' });
  state.formula.value = 'Another old draft';
  state.formula.dispatchEvent({ type: 'input' });
  state.world.window.dispatchEvent({ type: 'sutra:workspace-remote-commit' });
  state.formula.dispatchEvent({ type: 'blur', relatedTarget: null });
  assert.equal(state.formula.value, 'New canonical value');
  assert.equal(state.saves(), 0);
});

const workspaceLockScenarios = [
  {
    name: 'HTML Page',
    modelKey: 'htmlDocument',
    makePage: () => makePage({ htmlDocument: { version: 1, source: '<h1>Canonical HTML</h1>', createdAt: 'now', updatedAt: 'now' } }),
    load(world) { world.load(htmlPagesSource, 'src/features/workspace/html-pages.js'); },
    capture(world) {
      world.window.SutraHTMLPages.renderPreview();
      const editor = world.document.getElementById('htmlPageEditor');
      return { editor, source: editor.querySelector('[data-html-source]'), preview: editor.querySelector('[data-html-preview]') };
    },
    assertReady(world, page, state) {
      assert.equal(state.source.value, page.htmlDocument.source);
      assert.equal(state.preview.children[0] && state.preview.children[0].tagName, 'IFRAME');
      assert.ok(world.document.body.classList.contains('html-page-active'));
    },
    assertLocked(world, page, state) {
      assert.equal(state.editor.hidden, true);
      assert.equal(state.source.value, '');
      assert.equal(state.preview.children.length, 0);
      assert.equal(world.document.body.classList.contains('html-page-active'), false);
    },
    assertRestored(world, page, state) {
      assert.equal(state.editor.hidden, false);
      assert.equal(state.source.value, page.htmlDocument.source);
      world.window.SutraHTMLPages.renderPreview();
      assert.equal(state.preview.children[0] && state.preview.children[0].tagName, 'IFRAME');
      assert.ok(world.document.body.classList.contains('html-page-active'));
    }
  },
  {
    name: 'Slides',
    modelKey: 'slides',
    makePage: () => makePage({ slides: {
      version: 2,
      size: 'widescreen',
      theme: 'sutra',
      slides: [{ id: 'slide-workspace-lock', layout: 'blank', title: 'Canonical slide', speakerNotes: 'Canonical notes', background: '', elements: [] }]
    } }),
    load(world) { world.load(slidesSource, 'src/features/workspace/slides.js'); },
    capture(world) {
      const editor = world.document.getElementById('slidesEditor');
      world.window.SutraSlides.present();
      const overlay = world.document.body.children.find((child) => child.className.includes('slides-present-overlay'));
      return { editor, stage: editor.querySelector('.slides-stage'), notes: editor.querySelector('.slides-notes-panel textarea'), overlay };
    },
    assertReady(world, page, state) {
      assert.equal(state.editor.hidden, false);
      assert.equal(state.notes.value, 'Canonical notes');
      assert.ok(state.stage.children.length > 0);
      assert.ok(state.overlay && state.overlay.isConnected);
      assert.ok(world.document.body.classList.contains('slides-page-active'));
    },
    assertLocked(world, page, state) {
      assert.equal(state.editor.hidden, true);
      assert.equal(state.stage.children.length, 0);
      assert.equal(state.editor.querySelector('.slides-thumbnail-list').children.length, 0);
      assert.equal(state.notes.value, '');
      assert.equal(state.overlay.isConnected, false);
      assert.equal(world.document.body.classList.contains('slides-page-active'), false);
    },
    assertRestored(world, page, state) {
      assert.equal(state.editor.hidden, false);
      assert.equal(state.notes.value, 'Canonical notes');
      assert.ok(state.stage.children.length > 0);
      assert.ok(world.document.body.classList.contains('slides-page-active'));
    }
  },
  {
    name: 'Sheets',
    modelKey: 'spreadsheet',
    makePage: () => makePage({ spreadsheet: makeCanonicalWorkbook() }),
    load(world) {
      world.load(sheetsEngineSource, 'src/features/workspace/sheets-engine.js');
      world.load(sheetsSource, 'src/features/workspace/sheets.js');
    },
    capture(world) {
      const editor = world.document.getElementById('sheetsEditor');
      return {
        editor,
        formula: editor.querySelector('[data-formula]'),
        preview: editor.querySelector('[data-value-preview]'),
        grid: editor.querySelector('.sheets-grid-canvas')
      };
    },
    assertReady(world, page, state) {
      assert.equal(state.editor.hidden, false);
      assert.equal(state.formula.value, 'Canonical A1');
      assert.ok(state.grid.children.some((cell) => cell.textContent === 'Canonical A1'));
      assert.ok(world.document.body.classList.contains('sheets-page-active'));
      state.formula.value = 'UNSAVED PRIVATE DRAFT';
      state.formula.dispatchEvent({ type: 'input' });
    },
    assertLocked(world, page, state) {
      assert.equal(state.editor.hidden, true);
      assert.equal(state.formula.value, '');
      assert.equal(state.preview.textContent, '');
      assert.equal(state.grid.children.length, 0);
      assert.equal(world.document.body.classList.contains('sheets-page-active'), false);
    },
    assertRestored(world, page, state) {
      assert.equal(state.editor.hidden, false);
      assert.equal(state.formula.value, 'Canonical A1', 'the saved cell returns instead of the discarded draft');
      assert.notEqual(state.formula.value, 'UNSAVED PRIVATE DRAFT');
      assert.ok(state.grid.children.some((cell) => cell.textContent === 'Canonical A1'));
      assert.ok(world.document.body.classList.contains('sheets-page-active'));
    }
  }
];

workspaceLockScenarios.forEach((scenario) => {
  test('workspace lock hides and later restores canonical ' + scenario.name + ' content', () => {
    const page = scenario.makePage();
    const world = makeWorld(page);
    scenario.load(world);
    world.pageLoaded();
    const state = scenario.capture(world);
    scenario.assertReady(world, page, state);
    const canonicalSnapshot = JSON.stringify(page[scenario.modelKey]);

    world.lockWorkspace();

    assert.equal(world.bridge.isPageContentAuthorized(page), true, 'the page-level bridge remains authorized during a workspace lock');
    assert.equal(world.bridge.canWritePageContent(page), true, 'the feature must apply the workspace-root lock gate');
    assert.equal(world.document.documentElement.getAttribute('data-sutra-workspace-locked'), 'true');
    assert.equal(JSON.stringify(page[scenario.modelKey]), canonicalSnapshot, 'locking must not rewrite the canonical page model');
    scenario.assertLocked(world, page, state);

    world.unlockWorkspace();

    assert.equal(JSON.stringify(page[scenario.modelKey]), canonicalSnapshot, 'unlock and page reload must retain the exact canonical model');
    scenario.assertRestored(world, page, state);
  });
});
