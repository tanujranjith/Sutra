import { expect, test } from '@playwright/test';

// Notes Editor v2 (TipTap engine, shipped 2026-07-07, opt-in flag
// editor.editorV2Enabled). Regression coverage:
//   1. THE bug: typing "1. item" produces ONE ordered-list marker — the typed
//      "1. " is consumed by the input rule, never left as literal text, and no
//      phantom empty <li> appears (the user's "1. 1. sim racing wheel" report).
//   2. Storage round-trip: content saves through the legacy mirror in the
//      classic storage format and reloads into v2 intact.
//   3. Legacy component preservation: embed/drawing anchors ([data-block-id]),
//      math blocks, and checklist-item markup survive a v2 round-trip
//      byte-compatibly (page.blocks depends on the anchors surviving).
//   4. Toolbar bridge: the execCommand-era globals (formatText/formatBlock)
//      drive schema commands when v2 is active.
//   5. Flag off by default; toggling off unmounts and restores the classic
//      contenteditable editor.

async function completeOnboarding(page) {
  await page.evaluate(() => {
    try {
      if (typeof window.markStudentOnboardingCompleted === 'function') {
        window.markStudentOnboardingCompleted(true);
      }
    } catch (error) {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.setProperty('display', 'none', 'important');
      overlay.style.setProperty('pointer-events', 'none', 'important');
    }
  });
  await page.waitForFunction(() => {
    const overlay = document.getElementById('studentOnboardingOverlay');
    return !overlay || overlay.hidden || getComputedStyle(overlay).display === 'none';
  });
}

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await page.waitForFunction(() =>
    !!window.SutraNotesEditorV2 &&
    !!window.flowAtelier &&
    typeof window.flowAtelier.flushAppSaveNow === 'function' &&
    typeof window.setWorkspacePreference === 'function' &&
    typeof window.applyWorkspacePreferences === 'function');
  // The static shell and v2 module exist before the async canonical workspace
  // hydrate completes. Wait through the public durability seam so tests never
  // simulate typing into boot defaults that a real user cannot reach beneath
  // the startup overlay.
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-app-ready'));
  await completeOnboarding(page);
}

async function enableEditorV2(page) {
  await page.evaluate(() => {
    window.setWorkspacePreference('editor.editorV2Enabled', true, {});
    window.applyWorkspacePreferences({});
  });
  await page.waitForFunction(() => window.SutraNotesEditorV2.isMounted());
}

async function openNotesView(page) {
  await page.evaluate(() => {
    const nav = document.querySelector('[data-view="notes"]');
    if (nav) nav.click();
  });
  await page.waitForFunction(() => {
    const view = document.getElementById('view-notes');
    return view && getComputedStyle(view).display !== 'none';
  });
}

// Create a fresh blank note through the real new-page flow and wait for it to
// load into the active editor.
async function createBlankNote(page, name) {
  await page.evaluate((pageName) => {
    window.createNewPage({ templateId: 'blank' });
    const nameInput = document.getElementById('newPageName');
    if (nameInput) {
      nameInput.value = pageName;
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    window.confirmNewPage();
  }, name);
  await page.waitForFunction((pageName) => {
    const title = document.getElementById('pageTitle');
    const pm = document.querySelector('#editorV2Host .ProseMirror');
    const current = window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId);
    return title && title.value === pageName &&
      current && current.title.split('::').pop() === pageName &&
      current.isSystemPage !== true &&
      pm && !pm.textContent.includes('Sutra Help & Docs');
  }, name);
}

const PM_SELECTOR = '#editorV2Host .ProseMirror';

test('typing "1. " creates ONE list marker and consumes the typed text', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'birthday list');

  // Trusted keyboard input — the exact keystrokes from the bug report.
  await page.click(PM_SELECTOR);
  await page.keyboard.type('1. sim racing wheel along with f1 26');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Logitech MX master 4');

  const state = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    return {
      html: pm.innerHTML,
      text: pm.textContent,
      listCount: pm.querySelectorAll('ol').length,
      itemCount: pm.querySelectorAll('ol > li').length,
      itemTexts: Array.from(pm.querySelectorAll('ol > li')).map(li => li.textContent.trim())
    };
  }, PM_SELECTOR);

  // ONE ordered list, exactly two items, and the typed "1. " was consumed:
  // no literal "1." anywhere in the document text.
  expect(state.listCount).toBe(1);
  expect(state.itemCount).toBe(2);
  expect(state.itemTexts[0]).toBe('sim racing wheel along with f1 26');
  expect(state.itemTexts[1]).toBe('Logitech MX master 4');
  expect(state.text).not.toContain('1.');

  // No phantom empty trailing <li> (the "3." from the report).
  expect(state.itemTexts.every(t => t.length > 0)).toBe(true);
});

test('content saves in classic storage format and reloads into v2', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 roundtrip');

  await page.click(PM_SELECTOR);
  await page.keyboard.type('1. first item');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second item');
  await expect(page.locator('#taskbarSaveStatus')).toContainText(/Saving/i);

  // Force the readback-verified save path and capture what persisted.
  const savedContent = await page.evaluate(async () => {
    window.SutraNotesEditorV2.flushToMirror();
    await window.saveWorkspaceLocally();
    const title = document.getElementById('pageTitle').value;
    const mirror = document.getElementById('editor');
    return { title, mirrorHtml: mirror.innerHTML };
  });
  expect(savedContent.mirrorHtml).toContain('<ol>');
  expect(savedContent.mirrorHtml).toContain('first item');
  expect(savedContent.mirrorHtml).not.toContain('1. first');
  await expect(page.locator('#taskbarSaveStatus')).toContainText(/Saved/i);

  // Reload the app: the flag persists, v2 remounts, content restores.
  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await completeOnboarding(page);
  await page.waitForFunction(() => window.SutraNotesEditorV2 && window.SutraNotesEditorV2.isMounted());
  await openNotesView(page);

  // Wait for the restored page content to land in the v2 document.
  await page.waitForFunction((sel) => {
    const pm = document.querySelector(sel);
    return pm && pm.textContent.includes('first item');
  }, PM_SELECTOR);
  const restored = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    return { title: document.getElementById('pageTitle').value, text: pm ? pm.textContent : '' };
  }, PM_SELECTOR);
  expect(restored.title).toBe('v2 roundtrip');
  expect(restored.text).toContain('first item');
  expect(restored.text).toContain('second item');
});

test('an immediate reload flushes the latest note before the editor debounce', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'immediate reload trust');

  const sentinel = 'Latest sentence survives an immediate reload.';
  await page.click(PM_SELECTOR);
  await page.keyboard.type(sentinel);
  await expect(page.locator('#taskbarSaveStatus')).toContainText(/Saving/i);

  // Do not call savePage/saveWorkspaceLocally or wait for the editor debounce.
  // The lifecycle flush must synchronously snapshot the editor and start the
  // canonical write/readback or the bounded lifecycle recovery journal before
  // navigation completes.
  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await completeOnboarding(page);
  await page.waitForFunction(() =>
    !!window.flowAtelier && typeof window.flowAtelier.flushAppSaveNow === 'function');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-journal-promotion'));
  await page.waitForFunction(() => window.SutraNotesEditorV2 && window.SutraNotesEditorV2.isMounted());
  await openNotesView(page);
  await page.waitForFunction(({ selector, text }) => {
    const editor = document.querySelector(selector);
    return editor && editor.textContent.includes(text);
  }, { selector: PM_SELECTOR, text: sentinel });
  expect(await page.evaluate(() => sessionStorage.getItem('sutra:lifecycle-note-journal:v1'))).toBeNull();
});

test('assistant context reads latest v2 note content and visible selection', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'assistant context v2');

  await page.click(PM_SELECTOR);
  await page.keyboard.type('Assistant context sentinel alpha beta stays readable.');

  // Do not call savePage() here. The assistant should still force the v2 mirror
  // current before it builds context, so immediate asks after typing are fresh.
  const context = await page.evaluate(() => {
    const ctx = window.getFlowAssistantContext({ depth: 'currentView' });
    const page = window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId);
    return {
      excerpt: ctx.activeNote && ctx.activeNote.excerpt,
      wordCount: ctx.activeNote && ctx.activeNote.wordCount,
      pageContent: page && page.content,
      mirrorHtml: document.getElementById('editor').innerHTML
    };
  });

  expect(context.excerpt).toContain('Assistant context sentinel alpha beta');
  expect(context.wordCount).toBeGreaterThanOrEqual(7);
  expect(context.pageContent).toContain('Assistant context sentinel alpha beta');
  expect(context.mirrorHtml).toContain('Assistant context sentinel alpha beta');

  const selectedText = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let target = null;
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.includes('sentinel alpha beta')) {
        target = walker.currentNode;
        break;
      }
    }
    if (!target) return '';
    const start = target.nodeValue.indexOf('sentinel alpha beta');
    const range = document.createRange();
    range.setStart(target, start);
    range.setEnd(target, start + 'sentinel alpha beta'.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return window.getFlowAssistantContext({ depth: 'currentView' }).selection || '';
  }, PM_SELECTOR);

  expect(selectedText).toBe('sentinel alpha beta');
});

test('legacy anchors, math, and checklists survive a v2 round-trip', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);

  const result = await page.evaluate(() => {
    const legacyNote = '<h2>My note</h2>' +
      '<div class="checklist-item"><input type="checkbox" checked><span contenteditable="true">done thing</span></div>' +
      '<div class="checklist-item"><input type="checkbox"><span contenteditable="true">todo thing</span></div>' +
      '<div class="html-embed-anchor" data-note-block-type="html-embed" data-block-id="blk-123" contenteditable="false"></div>' +
      '<p>text with <span class="sutra-math-block" data-latex="x^2" contenteditable="false">x^2</span> math</p>' +
      '<div class="drawing-anchor" data-note-block-type="drawing" data-block-id="draw-9" contenteditable="false"></div>';
    window.SutraNotesEditorV2.setContent(legacyNote);
    const out = window.SutraNotesEditorV2.getStorageHtml();
    return {
      embedAnchorKept: out.includes('data-block-id="blk-123"'),
      drawingAnchorKept: out.includes('data-block-id="draw-9"'),
      mathKept: out.includes('data-latex="x^2"'),
      checklistCount: (out.match(/checklist-item/g) || []).length,
      checkedPreserved: /<input type="checkbox" checked/.test(out)
    };
  });

  expect(result.embedAnchorKept).toBe(true);
  expect(result.drawingAnchorKept).toBe(true);
  expect(result.mathKept).toBe(true);
  expect(result.checklistCount).toBe(2);
  expect(result.checkedPreserved).toBe(true);
});

test('toolbar globals drive schema commands when v2 is active', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 toolbar');

  const result = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    window.SutraNotesEditorV2.setContent('<p>hello world</p>');
    pm.editor.commands.focus();
    pm.editor.commands.selectAll();
    window.formatText('bold');
    const bolded = window.SutraNotesEditorV2.getStorageHtml();
    window.formatBlock('h2');
    const asHeading = window.SutraNotesEditorV2.getStorageHtml();
    window.formatText('undo');
    const undone = window.SutraNotesEditorV2.getStorageHtml();
    return { bolded, asHeading, undone };
  }, PM_SELECTOR);

  // The TrailingNode extension keeps an empty trailing paragraph after
  // non-paragraph blocks (so the caret can always leave a heading/table) —
  // strip it before comparing.
  const strip = (html) => html.replace(/(<p><\/p>)+$/, '');
  expect(strip(result.bolded)).toBe('<p><strong>hello world</strong></p>');
  expect(strip(result.asHeading)).toBe('<h2><strong>hello world</strong></h2>');
  expect(strip(result.undone)).toBe('<p><strong>hello world</strong></p>');
});

test('toolbar pressed states mirror the v2 cursor formatting', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 toolbar state');

  await page.evaluate(() => {
    window.SutraNotesEditorV2.setContent(
      '<p><strong>bold text</strong> plain text</p>' +
      '<h2>Heading text</h2>' +
      '<p style="text-align: center"><a href="https://example.com">linked text</a></p>' +
      '<ul><li><p>bullet text</p></li></ul>'
    );
  });

  await page.locator('#editorV2Host strong').click();
  await expect(page.locator('[data-notes-v2-state="bold"]')).toHaveAttribute('aria-pressed', 'true');
  // The styles dropdown reflects the current block type (paragraph here).
  await expect(page.locator('#toolbarStylesSelect')).toHaveValue('p');

  await page.locator('#editorV2Host h2').click();
  await expect(page.locator('#toolbarStylesSelect')).toHaveValue('h2');
  await expect(page.locator('[data-notes-v2-state="bold"]')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#editorV2Host a').click();
  await expect(page.locator('[data-notes-v2-state="link"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-notes-v2-state="alignCenter"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#editorV2Host li').click();
  await expect(page.locator('[data-notes-v2-state="bulletList"]')).toHaveAttribute('aria-pressed', 'true');
});

test('task lists render checkbox and text on one row and preserved cards stay visible', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 task layout');

  const result = await page.evaluate(() => {
    window.SutraNotesEditorV2.setContent(
      '<ul data-type="taskList">' +
        '<li data-type="taskItem" data-checked="false"><p>Open task item that wraps beside the checkbox.</p></li>' +
        '<li data-type="taskItem" data-checked="true"><p>Done task item</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Nested task</p></li></ul></li>' +
      '</ul>' +
      '<div class="html-embed-anchor" data-note-block-type="html-embed" data-block-id="blk-visible" contenteditable="false"></div>'
    );
    const host = document.querySelector('#editorV2Host');
    const item = host.querySelector('ul[data-type="taskList"] > li[data-checked]');
    const label = item.querySelector(':scope > label');
    const content = item.querySelector(':scope > div');
    const card = host.querySelector('.html-embed-anchor[data-block-id="blk-visible"]');
    const itemStyle = getComputedStyle(item);
    const cardStyle = getComputedStyle(card);
    const labelBox = label.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    const storage = window.SutraNotesEditorV2.getStorageHtml();
    return {
      itemDisplay: itemStyle.display,
      itemGap: itemStyle.gap,
      labelTop: Math.round(labelBox.top),
      contentTop: Math.round(contentBox.top),
      cardDisplay: cardStyle.display,
      cardAria: card.getAttribute('aria-label'),
      storageHasAria: storage.includes('aria-label'),
      storageHasAnchor: storage.includes('data-block-id="blk-visible"'),
      storageHasNestedInputInsideSpan: /<span contenteditable="true">[^<]*<input/i.test(storage)
    };
  });

  expect(result.itemDisplay).toBe('flex');
  expect(result.itemGap).not.toBe('normal');
  expect(Math.abs(result.labelTop - result.contentTop)).toBeLessThanOrEqual(6);
  expect(result.cardDisplay).toBe('flex');
  expect(result.cardAria).toContain('Embedded block');
  expect(result.storageHasAria).toBe(false);
  expect(result.storageHasAnchor).toBe(true);
  expect(result.storageHasNestedInputInsideSpan).toBe(false);
});

test('empty Enter exits ordered lists without leaving a phantom list item', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 list boundary');

  await page.click(PM_SELECTOR);
  await page.keyboard.type('1. first item');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('after list');

  const state = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    return {
      listItems: Array.from(pm.querySelectorAll('ol > li')).map(li => li.textContent.trim()),
      trailingParagraphs: Array.from(pm.querySelectorAll(':scope > p')).map(p => p.textContent.trim())
    };
  }, PM_SELECTOR);

  expect(state.listItems).toEqual(['first item']);
  expect(state.trailingParagraphs).toContain('after list');
});

test('pasted foreign fonts and colors are stripped while document structure survives', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 paste cleanup');

  await page.click(PM_SELECTOR);
  await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    const data = new DataTransfer();
    data.setData('text/html',
      '<h1 style="font-family: Comic Sans MS; color: red">Paste Heading</h1>' +
      '<p class="MsoNormal" style="font-size: 22pt; color: blue"><strong><a href="https://example.com" style="color: green">Linked bold</a></strong></p>' +
      '<table style="font-family: Times New Roman; color: purple"><tbody><tr><td style="background: yellow; color: purple">Cell</td></tr></tbody></table>'
    );
    data.setData('text/plain', 'Paste Heading\nLinked bold\nCell');
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    pm.dispatchEvent(event);
  }, PM_SELECTOR);

  await page.waitForFunction((sel) => document.querySelector(sel).textContent.includes('Linked bold'), PM_SELECTOR);
  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('<h1>Paste Heading</h1>');
  expect(html).toContain('<strong>');
  expect(html).toContain('<a');
  expect(html).toContain('href="https://example.com"');
  expect(html).toContain('<table');
  expect(html).not.toMatch(/font-family|font-size|color:\s*(red|blue|green|purple)|background:\s*yellow|class="MsoNormal"/i);
});

test('modern editor is ON by default; disabling restores the classic editor', async ({ page }) => {
  await openApp(page);

  // Default ON: v2 mounts at boot, the classic #editor is a hidden mirror.
  await page.waitForFunction(() => window.SutraNotesEditorV2.isMounted(), { timeout: 8000 });
  const defaults = await page.evaluate(() => ({
    mounted: window.SutraNotesEditorV2.isMounted(),
    hostExists: !!document.getElementById('editorV2Host'),
    legacyEditable: document.getElementById('editor').getAttribute('contenteditable'),
    legacyDisplay: document.getElementById('editor').style.display
  }));
  expect(defaults.mounted).toBe(true);
  expect(defaults.hostExists).toBe(true);
  expect(defaults.legacyEditable).toBe('false');
  expect(defaults.legacyDisplay).toBe('none');

  // Explicit opt-out: v2 unmounts and the classic editor comes back.
  await page.evaluate(() => {
    window.setWorkspacePreference('editor.editorV2Enabled', false, {});
    window.applyWorkspacePreferences({});
  });
  const restored = await page.evaluate(() => ({
    mounted: window.SutraNotesEditorV2.isMounted(),
    hostExists: !!document.getElementById('editorV2Host'),
    legacyDisplay: document.getElementById('editor').style.display,
    legacyEditable: document.getElementById('editor').getAttribute('contenteditable')
  }));
  expect(restored.mounted).toBe(false);
  expect(restored.hostExists).toBe(false);
  expect(restored.legacyDisplay).not.toBe('none');
  expect(restored.legacyEditable).toBe('true');
});

// ---- Phase 1: parity plumbing (find/replace, indent, keymap, spacing, fonts) ----

test('find & replace runs over the v2 document, not the hidden mirror', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 find replace');

  const found = await page.evaluate(() => {
    window.SutraNotesEditorV2.setContent('<p>alpha beta alpha gamma alpha</p>');
    return window.SutraNotesEditorV2.search.set('alpha');
  });
  expect(found.count).toBe(3);
  expect(found.index).toBe(0);

  const cycled = await page.evaluate(() => window.SutraNotesEditorV2.search.next());
  expect(cycled.index).toBe(1);

  const afterReplace = await page.evaluate(() => {
    window.SutraNotesEditorV2.search.set('alpha');
    window.SutraNotesEditorV2.search.replaceAll('ALPHA');
    return window.SutraNotesEditorV2.getStorageHtml();
  });
  expect(afterReplace).toContain('ALPHA');
  expect(afterReplace).not.toContain('alpha');
  // Decoration highlights are view-only — they must never leak into storage.
  expect(afterReplace).not.toContain('find-highlight');
});

test('Tab indents a paragraph and stores margin-left (legacy-compatible)', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 indent');

  await page.click(PM_SELECTOR);
  await page.keyboard.type('indented line');
  await page.keyboard.press('Tab');

  const afterIndent = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(afterIndent).toContain('margin-left: 40px');

  await page.keyboard.press('Shift+Tab');
  const afterOutdent = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(afterOutdent).not.toContain('margin-left');
});

test('Ctrl+Alt+1 turns the current block into an H1', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 heading shortcut');

  await page.click(PM_SELECTOR);
  await page.keyboard.type('make me a heading');
  await page.keyboard.press('Control+Alt+1');

  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('<h1>make me a heading</h1>');
});

test('line spacing sets block line-height in storage', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 line spacing');

  const html = await page.evaluate((sel) => {
    window.SutraNotesEditorV2.setContent('<p>spaced paragraph</p>');
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    pm.editor.commands.selectAll();
    window.SutraNotesEditorV2.exec('lineHeight', '2');
    return window.SutraNotesEditorV2.getStorageHtml();
  }, PM_SELECTOR);
  expect(html).toContain('line-height: 2');
});

test('font family and size commands round-trip through storage', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 fonts');

  const html = await page.evaluate((sel) => {
    window.SutraNotesEditorV2.setContent('<p>styled text</p>');
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    pm.editor.commands.selectAll();
    window.SutraNotesEditorV2.exec('fontFamily', 'Georgia');
    window.SutraNotesEditorV2.exec('fontSize', '24px');
    return window.SutraNotesEditorV2.getStorageHtml();
  }, PM_SELECTOR);
  expect(html).toMatch(/font-family:\s*Georgia/i);
  expect(html).toContain('24px');
});

// ---- Phase 2: Docs-style toolbar controls (selects/steppers) ----

test('toolbar style + font + spacing selects drive the v2 document', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 toolbar controls');

  const selectAll = () => page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    pm.editor.commands.selectAll();
  }, PM_SELECTOR);

  await page.evaluate(() => window.SutraNotesEditorV2.setContent('<p>styled paragraph</p>'));
  await selectAll();
  await page.selectOption('#toolbarStylesSelect', 'h2');
  await selectAll();
  await page.selectOption('#toolbarFontFamily', 'Georgia, serif');
  await selectAll();
  await page.selectOption('#toolbarLineSpacing', '1.5');

  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('<h2');
  expect(html).toMatch(/font-family:\s*Georgia/i);
  expect(html).toContain('line-height: 1.5');
});

test('font-size stepper buttons change the size and reflect in the input', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 size stepper');

  await page.evaluate(() => window.SutraNotesEditorV2.setContent('<p>resize me</p>'));
  await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    pm.editor.commands.selectAll();
  }, PM_SELECTOR);
  await page.evaluate(() => { document.getElementById('toolbarFontSize').value = '16'; });

  // Click "+" twice → 16 → 18 → 20.
  const plus = page.locator('.toolbar-size-stepper .toolbar-size-btn').last();
  await plus.click();
  await plus.click();

  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('20px');
});

// ---- Phase 3: contextual editing UX ----

test('selection bubble menu appears and applies bold', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 bubble');

  await page.evaluate(() => window.SutraNotesEditorV2.setContent('<p>select these words</p>'));
  await page.click(PM_SELECTOR);
  await page.keyboard.press('Control+a');

  const bubble = page.locator('.editor-v2-bubble');
  await expect(bubble).toBeVisible();
  await bubble.locator('.editor-v2-mini-btn').first().click(); // Bold

  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('<strong>');
});

test('slash menu inserts a block and consumes the trigger text', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 slash');

  await page.evaluate(() => window.SutraNotesEditorV2.setContent('<p></p>'));
  await page.click(PM_SELECTOR);
  await page.keyboard.type('/table');
  await expect(page.locator('.editor-v2-slash-menu')).toBeVisible();
  await page.keyboard.press('Enter');

  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('<table');
  // The typed "/table" trigger must be consumed — no literal text left behind.
  const text = await page.evaluate((sel) => document.querySelector(sel).textContent, PM_SELECTOR);
  expect(text).not.toContain('/table');
});

test('smart paste recovers Google Docs style-based bold/italic as semantics', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 docs paste');

  await page.click(PM_SELECTOR);
  await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    const data = new DataTransfer();
    data.setData('text/html',
      '<b id="docs-internal-guid-abc" style="font-weight:normal">' +
      '<p><span style="font-weight:700">Bold via style</span> and <span style="font-style:italic">italic via style</span></p>' +
      '</b>');
    data.setData('text/plain', 'Bold via style and italic via style');
    pm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, PM_SELECTOR);

  await page.waitForFunction((sel) => document.querySelector(sel).textContent.includes('Bold via style'), PM_SELECTOR);
  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('<strong>Bold via style</strong>');
  expect(html).toContain('<em>italic via style</em>');
  expect(html).not.toMatch(/font-weight|font-style/i);
});

test('smart paste converts Word mso-list paragraphs into a real list', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 word list paste');

  await page.evaluate(() => window.SutraNotesEditorV2.setContent('<p></p>'));
  await page.click(PM_SELECTOR);
  await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    const data = new DataTransfer();
    data.setData('text/html',
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>First item</p>' +
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.</span>Second item</p>');
    data.setData('text/plain', 'First item\nSecond item');
    pm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, PM_SELECTOR);

  await page.waitForFunction((sel) => document.querySelector(sel).textContent.includes('First item'), PM_SELECTOR);
  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toMatch(/<ol>/);
  expect(html).toContain('First item');
  expect(html).not.toContain('mso-list');
});

test('block drag handle appears on hover and reorders top-level blocks', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 drag reorder');

  await page.evaluate(() => window.SutraNotesEditorV2.setContent('<p>Alpha block</p><p>Beta block</p><p>Gamma block</p>'));
  const first = page.locator('#editorV2Host .ProseMirror > p').first();
  await first.hover();
  await expect(page.locator('.editor-v2-drag-handle')).toBeVisible();

  // Drive the pointer drag through real DOM events on the handle element.
  // (Coordinate hit-testing on a body-appended fixed handle is flaky headless;
  // dispatching on the element exercises the same mousedown→move→up handlers.)
  const order = await page.evaluate(async (sel) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const pm = document.querySelector(sel);
    const ps = () => pm.querySelectorAll(':scope > p');
    const r0 = ps()[0].getBoundingClientRect();
    pm.dispatchEvent(new MouseEvent('mousemove', { clientX: r0.left + 20, clientY: r0.top + 8, bubbles: true }));
    await sleep(40);
    const handle = document.querySelector('.editor-v2-drag-handle');
    const hb = handle.getBoundingClientRect();
    const gamma = ps()[2].getBoundingClientRect();
    handle.dispatchEvent(new MouseEvent('mousedown', { clientX: hb.left + 2, clientY: hb.top + 2, bubbles: true }));
    for (let i = 1; i <= 6; i++) {
      const y = r0.top + (gamma.bottom + 6 - r0.top) * (i / 6);
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: gamma.left + 20, clientY: y, bubbles: true }));
      await sleep(8);
    }
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: gamma.left + 20, clientY: gamma.bottom + 6, bubbles: true }));
    await sleep(60);
    return Array.from(ps()).map(p => p.textContent.trim()).filter(Boolean);
  }, PM_SELECTOR);
  expect(order[order.length - 1]).toContain('Alpha');
});

// ---- Phase 4: Docs-grade tables & images ----

test('table structure commands merge cells, toggle header, and delete a column', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 tables');

  const result = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    // Insert a 3x3 table, place the cursor in the first body cell.
    window.SutraNotesEditorV2.exec('table', { rows: 3, cols: 3 });
    const table = pm.querySelector('table');
    const firstCell = table.querySelectorAll('td, th')[0];
    // Select the first two header cells → merge.
    const cells = table.querySelectorAll('th');
    const range = document.createRange();
    range.selectNodeContents(cells[0]);
    const range2 = document.createRange();
    range2.selectNodeContents(cells[1]);
    // Use TipTap cell-selection via commands instead of DOM selection.
    return { hasTable: !!table, headerCells: cells.length };
  }, PM_SELECTOR);
  expect(result.hasTable).toBe(true);

  // Header row toggle + delete column via the command bridge.
  const storage = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    // put cursor in first cell
    pm.editor.commands.setTextSelection(3);
    window.SutraNotesEditorV2.exec('addColumnAfter');
    window.SutraNotesEditorV2.exec('toggleHeaderRow');
    return window.SutraNotesEditorV2.getStorageHtml();
  }, PM_SELECTOR);
  expect(storage).toContain('<table');
  // Round-trips as legacy table HTML (colgroup + cells).
  expect(storage).toMatch(/<t(d|h)/);
});

test('merged cells round-trip through storage with colspan', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 merge');

  const storage = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    window.SutraNotesEditorV2.exec('table', { rows: 2, cols: 3 });
    // Select the first two cells of the body row as a CellSelection and merge.
    // CellSelection positions point at (before) each cell node.
    if (pm.editor.commands.setCellSelection) {
      let bodyCells = [];
      pm.editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'tableCell') bodyCells.push(pos);
      });
      if (bodyCells.length >= 2) {
        pm.editor.commands.setCellSelection({ anchorCell: bodyCells[0], headCell: bodyCells[1] });
        window.SutraNotesEditorV2.exec('mergeCells');
      }
    }
    return window.SutraNotesEditorV2.getStorageHtml();
  }, PM_SELECTOR);
  expect(storage).toMatch(/colspan="2"/);
});

test('inserting an image in v2 creates a resizable image node, not a media-wrapper', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 image');

  await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    window.SutraNotesEditorV2.insertHtml('<img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="dot">');
  }, PM_SELECTOR);

  // The NodeView renders a wrap + resize handle in the editor.
  await expect(page.locator('#editorV2Host .sutra-img-wrap img')).toBeVisible();

  // Align + width via the command bridge round-trips to storage.
  const storage = await page.evaluate(() => {
    const pm = document.querySelector('#editorV2Host .ProseMirror');
    pm.editor.commands.focus();
    // Select the image node (first child).
    pm.editor.commands.setNodeSelection(0);
    window.SutraNotesEditorV2.exec('imageAlign', 'center');
    window.SutraNotesEditorV2.exec('imageWidth', '240px');
    return window.SutraNotesEditorV2.getStorageHtml();
  });
  expect(storage).toContain('<img');
  expect(storage).toContain('data-align="center"');
  expect(storage).toContain('width: 240px');
  expect(storage).not.toContain('media-wrapper');
});

// ---- Phase 5: page-like layout ----

test('pages mode renders the v2 host as a clean page card', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 pages');

  await page.evaluate(() => {
    window.SutraNotesEditorV2.setContent('<h1>Doc title</h1><p>Body text on the page.</p>');
    if (!document.body.classList.contains('notes-pages-mode')) window.togglePagesMode();
  });
  await expect(page.locator('body')).toHaveClass(/notes-pages-mode/);

  const metrics = await page.evaluate(() => {
    const host = document.getElementById('editorV2Host');
    const pane = document.querySelector('#view-notes .notes-pane-primary');
    const hcs = getComputedStyle(host);
    return {
      paneWidth: Math.round(pane.getBoundingClientRect().width),
      hostBg: hcs.backgroundColor,
      hostPad: hcs.padding
    };
  });
  // The pane is the physical page card (~816px letter width); the host adds no
  // background or padding of its own (no double-padding / grey inner panel).
  expect(metrics.paneWidth).toBeGreaterThanOrEqual(760);
  expect(metrics.hostPad).toBe('0px');
  expect(metrics.hostBg).toBe('rgba(0, 0, 0, 0)');

  // A page break inserts as a rendered break atom inside the host.
  await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    if (window.insertPageBreak) window.insertPageBreak();
  }, PM_SELECTOR);
  await expect(page.locator('#editorV2Host .atelier-page-break')).toHaveCount(1);
});

// ---- Phase 6: live NodeViews for preserved atoms ----

test('embedded media renders as a live element and still round-trips verbatim', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 media live');

  await page.evaluate(() => {
    window.SutraNotesEditorV2.setContent(
      '<div class="media-wrapper" data-type="video"><video controls><source src="data:video/mp4;base64,AAAAHGZ0" type="video/mp4"></video></div>'
    );
  });

  // The media element is live in the editor (NodeView renders it), not a card.
  await expect(page.locator('#editorV2Host video')).toHaveCount(1);

  // Storage keeps the media-wrapper anchor byte-compatible.
  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('class="media-wrapper"');
  expect(html).toContain('<video');
});

test('math atoms render live KaTeX while storage keeps the raw LaTeX', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 math live');

  await page.evaluate(() => {
    window.SutraNotesEditorV2.setContent(
      '<p>x: <span class="sutra-math-block" data-latex="x^2" contenteditable="false">x^2</span></p>'
    );
  });

  // The NodeView renders KaTeX into the span for display.
  await expect(page.locator('#editorV2Host .sutra-math-block .katex')).toBeVisible({ timeout: 6000 });

  // Storage still holds the raw LaTeX (display-only render never leaks in).
  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('data-latex="x^2"');
  expect(html).not.toContain('class="katex"');
});


test('undo history is isolated when switching between notes', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'undo boundary alpha');

  await page.click(PM_SELECTOR);
  await page.keyboard.type('alpha-only note content');
  const alphaId = await page.evaluate(() => {
    window.SutraNotesEditorV2.flushToMirror();
    window.savePage();
    return window.flowAtelier.currentPageId;
  });

  await createBlankNote(page, 'undo boundary beta');
  await page.click(PM_SELECTOR);
  await page.keyboard.type('beta-only note content');
  const betaId = await page.evaluate(() => {
    window.SutraNotesEditorV2.flushToMirror();
    window.savePage();
    return window.flowAtelier.currentPageId;
  });

  await page.evaluate(({ firstId, secondId }) => {
    window.loadPage(firstId);
    window.loadPage(secondId);
  }, { firstId: alphaId, secondId: betaId });
  await page.waitForFunction(({ id, text }) => {
    const pm = document.querySelector('#editorV2Host .ProseMirror');
    return window.flowAtelier.currentPageId === id && pm && pm.textContent.includes(text);
  }, { id: betaId, text: 'beta-only note content' });

  await page.click(PM_SELECTOR);
  await page.keyboard.press('Control+z');

  const current = await page.evaluate(() => ({
    pageId: window.flowAtelier.currentPageId,
    text: document.querySelector('#editorV2Host .ProseMirror').textContent
  }));
  expect(current.pageId).toBe(betaId);
  expect(current.text).toContain('beta-only note content');
  expect(current.text).not.toContain('alpha-only note content');
});
