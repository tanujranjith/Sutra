import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

const editor = '#editorV2Host .ProseMirror';
async function openNote(page, name = 'Comment document') {
  await page.goto('/Sutra.html');
  await waitForAppReady(page);
  await page.evaluate(() => {
    window.markStudentOnboardingCompleted(true);
    window.setWorkspacePreference('editor.editorV2Enabled', true, {});
    window.applyWorkspacePreferences({});
  });
  await page.locator('.view-tab[data-view="notes"]:visible').first().click();
  await page.evaluate(name => {
    window.createNewPage({ templateId: 'blank' });
    document.getElementById('newPageName').value = name;
    window.confirmNewPage();
  }, name);
  await expect(page.locator('#pageTitle')).toHaveValue(name);
  await expect(page.locator(editor)).toBeVisible();
}
async function selectParagraph(page, index = 0) {
  await page.locator(editor + ' p').nth(index).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await expect.poll(() => page.evaluate(() => window.SutraNotesEditorV2.comments.getSelectionAnchor()?.quote)).not.toBeFalsy();
}
async function addComment(page, text) {
  await page.evaluate(() => { void window.addCommentFromSelection(); });
  await expect(page.locator('#atelierDialogTitle')).toHaveText('New Comment');
  await page.locator('#atelierDialogTextarea').fill(text);
  await page.locator('#atelierDialogConfirm').click();
  await expect(page.locator('#commentsList .comment-text')).toContainText(text);
}
async function threads(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId).comments || [])));
}
async function save(page) {
  await page.evaluate(async () => {
    window.SutraNotesEditorV2.flushPendingEdit();
    await window.saveWorkspaceLocally();
    await window.flowAtelier.flushAppSaveNow('comments-test');
  });
}

test('exact duplicate occurrence stays anchored through edit, reload, resolve and reopen', async ({ page }) => {
  await openNote(page);
  await page.locator(editor).click();
  await page.keyboard.type('Same phrase');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Same phrase');
  await selectParagraph(page, 1);
  await addComment(page, 'Review the second occurrence');
  const original = (await threads(page))[0];
  expect(original.anchor).toMatchObject({ version: 1, quote: 'Same phrase', status: 'attached' });
  expect(original.anchor.from).toBeGreaterThan(11);
  await expect(page.locator(editor + ' p').nth(0).locator('.comment-mark')).toHaveCount(0);
  await expect(page.locator(editor + ' p').nth(1).locator('.comment-mark')).toHaveCount(1);

  await page.locator(editor + ' p').first().click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('Prefix ');
  await expect.poll(async () => (await threads(page))[0].anchor.from).toBe(original.anchor.from + 7);
  await save(page);
  await page.reload();
  await waitForAppReady(page);
  await page.locator('.view-tab[data-view="notes"]:visible').first().click();
  await expect(page.locator(editor + ' .comment-mark')).toHaveText('Same phrase');
  await page.evaluate(() => window.toggleCommentsPanel());
  await page.getByRole('button', { name: 'Resolve', exact: true }).click();
  await expect(page.locator(editor + ' .comment-mark')).toHaveCount(0);
  await page.locator('#commentsFilterBar [data-filter="resolved"]').click();
  await page.getByRole('button', { name: 'Reopen', exact: true }).click();
  await expect(page.locator(editor + ' .comment-mark')).toHaveCount(1);
  await page.locator('#commentsFilterBar [data-filter="open"]').click();
  await page.locator('.comment-anchor').click();
  expect(await page.evaluate(() => window.getSelection().toString())).toBe('Same phrase');
});

test('deleting an entire anchor detaches it and undo/redo restore the correct state', async ({ page }) => {
  await openNote(page);
  await page.locator(editor).click();
  await page.keyboard.type('Delete this passage');
  await selectParagraph(page);
  await addComment(page, 'Retain the discussion');
  await page.locator('.comment-anchor').click();
  await page.keyboard.press('Backspace');
  await expect.poll(async () => (await threads(page))[0].anchor.status).toBe('orphaned');
  await expect(page.locator('.comment-detached')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await threads(page))[0].anchor.status).toBe('attached');
  await expect(page.locator(editor + ' .comment-mark')).toHaveText('Delete this passage');
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await threads(page))[0].anchor.status).toBe('orphaned');
});

test('quote-only migration anchors unique marked text and preserves ambiguous legacy threads', async ({ page }) => {
  await openNote(page);
  await page.evaluate(() => {
    const p = window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId);
    p.content = '<p>A <strong>unique</strong> passage.</p><p>Repeat</p><p>Repeat</p>';
    p.comments = [
      { id: 'unique', text: 'Unique legacy thread', selectedText: 'A unique passage.', replies: [], futureField: 'keep' },
      { id: 'ambiguous', text: 'Ambiguous legacy thread', selectedText: 'Repeat', replies: [] }
    ];
    window.SutraNotesEditorV2.loadDocument(p.content);
    window.toggleCommentsPanel();
  });
  const comments = await threads(page);
  expect(comments[0].anchor.status).toBe('attached');
  expect(comments[0].futureField).toBe('keep');
  expect(comments[1].anchor.status).toBe('orphaned');
  await expect(page.locator(editor + ' .comment-mark')).toHaveCount(3);
  const storage = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(storage).not.toContain('comment-mark');
  expect(storage).not.toContain('data-comment-anchor-id');
  await save(page);
  await page.reload();
  await waitForAppReady(page);
  await page.locator('.view-tab[data-view="notes"]:visible').first().click();
  expect((await threads(page))[1].anchor.status).toBe('orphaned');
});


test('marked multi-block selections retain anchors through formatting and partial deletion', async ({ page }) => {
  await openNote(page);
  const expected = await page.evaluate(() => {
    const pm = document.querySelector('#editorV2Host .ProseMirror').editor;
    pm.commands.setContent('<p>A <strong>bold</strong> passage.</p><p>Second paragraph.</p>');
    pm.commands.setTextSelection({ from: 1, to: pm.state.doc.content.size - 1 });
    return window.SutraNotesEditorV2.comments.getSelectionAnchor().quote;
  });
  expect(expected).toBe('A bold passage.\nSecond paragraph.');
  await addComment(page, 'Check both paragraphs');
  await page.evaluate(() => window.formatText('italic'));
  expect((await threads(page))[0].anchor.quote).toBe(expected);
  await expect(page.locator(editor + ' em')).not.toHaveCount(0);
  await page.evaluate(() => {
    const pm = document.querySelector('#editorV2Host .ProseMirror').editor;
    pm.commands.setTextSelection({ from: 3, to: 7 });
    pm.commands.deleteSelection();
  });
  const anchor = (await threads(page))[0].anchor;
  expect(anchor.status).toBe('attached');
  expect(anchor.quote).toBe('A  passage.\nSecond paragraph.');
  expect(await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml())).not.toContain('comment-mark');
});

test('secondary-pane threads, replies and page switching use their own note', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openNote(page, 'Secondary comments');
  const secondaryId = await page.evaluate(() => window.flowAtelier.currentPageId);
  await page.evaluate(() => {
    window.createNewPage({ templateId: 'blank' });
    document.getElementById('newPageName').value = 'Primary comments';
    window.confirmNewPage();
    document.getElementById('splitNotesToggleBtn').click();
  });
  await page.locator('#splitNoteSelect').selectOption(secondaryId);
  const right = '#editorV2SecondaryHost .ProseMirror';
  await expect(page.locator(right)).toBeVisible();
  await page.locator(right).click();
  await page.keyboard.type('Secondary passage');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.evaluate(() => { void window.addCommentFromSelection(); });
  await page.locator('#atelierDialogTextarea').fill('Right note only');
  await page.locator('#atelierDialogConfirm').click();
  await expect(page.locator('#commentsPageTitle')).toHaveText('Secondary comments');
  await expect(page.locator(right + ' .comment-mark')).toHaveText('Secondary passage');
  await expect(page.locator(editor + ' .comment-mark')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Reply to comment', exact: true }).fill('A useful reply');
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(page.locator('.comment-reply-text')).toHaveText('A useful reply');
  await page.locator(editor).click();
  await expect(page.locator('#commentsPageTitle')).toHaveText('Primary comments');
  await expect(page.locator('#commentsList .comment-item')).toHaveCount(0);
  const state = await page.evaluate(id => ({
    primary: window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId).comments || [],
    secondary: window.flowAtelier.pages.find(p => p.id === id).comments
  }), secondaryId);
  expect(state.primary).toEqual([]);
  expect(state.secondary[0].text).toBe('Right note only');
  expect(state.secondary[0].replies[0].text).toBe('A useful reply');
  await page.locator(right + ' .comment-mark').click();
  await expect(page.locator('#commentsPageTitle')).toHaveText('Secondary comments');
  await page.getByRole('button', { name: 'Delete reply', exact: true }).click();
  await expect(page.locator('.comment-reply')).toHaveCount(0);
  await page.evaluate(() => document.getElementById('splitNotesToggleBtn').click());
  await expect(page.locator('#commentsPageTitle')).toHaveText('Primary comments');
  await save(page);
  await page.reload();
  await waitForAppReady(page);
  const saved = await page.evaluate(id => window.flowAtelier.pages.find(p => p.id === id).comments, secondaryId);
  expect(saved[0].anchor).toMatchObject({ version: 1, quote: 'Secondary passage', status: 'attached' });
});

test('comments reflow the desktop document and remain usable in the phone drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openNote(page);
  await page.locator(editor).click();
  await page.keyboard.type('Review layout');
  await selectParagraph(page);
  await addComment(page, 'Read alongside the document');
  const geometry = await page.evaluate(() => {
    const doc = document.getElementById('editorV2Host').getBoundingClientRect();
    const panel = document.getElementById('commentsPanel').getBoundingClientRect();
    return { right: doc.right, left: panel.left, width: doc.width, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(geometry.right).toBeLessThanOrEqual(geometry.left);
  expect(geometry.width).toBeGreaterThan(300);
  expect(geometry.overflow).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#commentsPanel')).toBeVisible();
  const phone = await page.evaluate(() => {
    const panel = document.getElementById('commentsPanel').getBoundingClientRect();
    return { right: panel.right, left: panel.left, width: panel.width, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(phone.left).toBeGreaterThanOrEqual(0);
  expect(phone.right).toBeLessThanOrEqual(391);
  expect(phone.width).toBeGreaterThan(300);
  expect(phone.overflow).toBe(false);
});

test('anchors round-trip in encrypted backup, Sync projection and version history', async ({ page }) => {
  test.setTimeout(120_000);
  await openNote(page);
  await page.locator(editor).click();
  await page.keyboard.type('Portable review passage');
  await selectParagraph(page);
  await addComment(page, 'Keep the anchor with the document');
  await save(page);
  const before = (await threads(page))[0];
  const portable = await page.evaluate(async () => {
    const id = window.flowAtelier.currentPageId;
    const sync = window.serializeWorkspace({ mode: 'sync', includeSensitiveSettings: false }).pages.find(p => p.id === id);
    const backup = await window.SutraEncryptedBackups.createBackupBlob('comments portable passphrase');
    const bytes = await window.SutraEncryptedBackups.decryptEnvelopeBytes(backup.blob, 'comments portable passphrase');
    const zip = await window.JSZip.loadAsync(bytes);
    const workspace = JSON.parse(await zip.file('workspace.json').async('text'));
    const note = workspace.pages.find(p => p.id === id);
    window.deserializeWorkspace(workspace);
    window.loadPage(id);
    await window.flowAtelier.flushAppSaveNow('comments-backup-roundtrip');
    return { sync: sync.comments, backup: note.comments, content: note.content };
  });
  expect(portable.sync[0]).toEqual(before);
  expect(portable.backup[0]).toEqual(before);
  expect(portable.content).not.toContain('comment-mark');
  expect((await threads(page))[0]).toEqual(before);
  await page.evaluate(() => { void window.saveVersionSnapshotManually(); });
  await page.locator('#atelierDialogInput').fill('Anchored checkpoint');
  await page.locator('#atelierDialogConfirm').click();
  const snapshot = await page.evaluate(() => window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId).versions.find(v => v.label === 'Anchored checkpoint'));
  expect(snapshot.state.comments[0].anchor).toEqual(before.anchor);
  await page.locator(editor).click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('New prefix ');
  await save(page);
  expect((await threads(page))[0].anchor.from).toBe(before.anchor.from + 11);
  await page.evaluate(id => { void window.restoreVersion(id); }, snapshot.id);
  await page.locator('#atelierDialogConfirm').click();
  await expect(page.locator(editor + ' .comment-mark')).toHaveText('Portable review passage');
  expect((await threads(page))[0].anchor).toEqual(before.anchor);
});


test('adjacent and overlapping anchors retain document order and thread actions across themes', async ({ page }) => {
  await openNote(page);
  await page.evaluate(() => document.querySelector('#editorV2Host .ProseMirror').editor.commands.setContent('<p>Alpha Beta Gamma</p>'));
  for (const [from, to, text] of [[7, 11, 'Beta review'], [1, 7, 'Alpha review'], [5, 13, 'Overlap review']]) {
    await page.evaluate(({from, to}) => document.querySelector('#editorV2Host .ProseMirror').editor.chain().focus().setTextSelection({from,to}).run(), {from,to});
    await page.evaluate(() => { void window.addCommentFromSelection(); });
    await page.locator('#atelierDialogTextarea').fill(text);
    await page.locator('#atelierDialogConfirm').click();
    await expect(page.locator('#commentsList .comment-text').filter({hasText:text})).toHaveText(text);
  }
  await expect(page.locator('#commentsList .comment-text')).toHaveText(['Alpha review','Overlap review','Beta review']);
  const initial = await threads(page);
  expect(initial.map(c => [c.anchor.from,c.anchor.to])).toEqual([[7,11],[1,7],[5,13]]);
  for (const theme of ['light','dark']) {
    await page.evaluate(theme => window.applyAtelierTheme(theme, {persist:false}), theme);
    const color = await page.locator(editor+' .comment-mark').first().evaluate(el => getComputedStyle(el).backgroundColor);
    expect(color).not.toBe('rgba(0, 0, 0, 0)');
    await expect(page.locator('#commentsPanel')).toBeVisible();
  }
  const card = page.locator('#commentsList .comment-item').filter({hasText:'Alpha review'});
  await card.getByRole('button',{name:'Edit',exact:true}).click();
  await page.locator('#atelierDialogTextarea').fill('Revised Alpha review');
  await page.locator('#atelierDialogConfirm').click();
  await expect(card.locator('.comment-text')).toHaveText('Revised Alpha review');
  await card.getByRole('button',{name:'Delete',exact:true}).click();
  await page.locator('#atelierDialogConfirm').click();
  await expect(page.locator('#commentsList .comment-item')).toHaveCount(2);
  await page.locator(editor).click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await threads(page)).map(c=>c.anchor.from)).toEqual([6,4]);
  await save(page);
  await page.reload();
  await waitForAppReady(page);
  await page.locator('.view-tab[data-view="notes"]:visible').first().click();
  const reopened = await threads(page);
  expect(reopened).toHaveLength(2);
  expect(reopened.every(c=>c.anchor.status==='attached')).toBe(true);
  expect(reopened.map(c=>c.anchor.from)).toEqual([6,4]);
});

for (const modern of [true, false]) {
  test((modern ? 'modern' : 'classic') + ' comment dock follows page switches and clears unauthorized discussions', async ({ page }) => {
    await openNote(page, 'Visible discussion');
    const ids = await page.evaluate(modern => {
      const source = window.flowAtelier.pages.find(p=>p.id===window.flowAtelier.currentPageId);
      source.comments = [{id:'public-discussion',text:'Visible discussion sentinel',selectedText:'Public text',createdAt:new Date().toISOString(),resolved:false,replies:[]}];
      source.content = '<p>Public text</p>';
      const protectedNote = window.__sutraPublicBetaTestHooks.createNoteInActiveSpace('Protected discussion','<p>Private text</p>');
      protectedNote.comments = [{id:'private-discussion',text:'Private discussion sentinel',selectedText:'Private text',resolved:false,replies:[]}];
      const comparison = window.__sutraPublicBetaTestHooks.createNoteInActiveSpace('Comparison discussion','<p>Comparison text</p>');
      comparison.comments = [{id:'comparison-discussion',text:'Comparison discussion sentinel',selectedText:'Comparison text',resolved:false,replies:[]}];
      if (!modern) {window.setWorkspacePreference('editor.editorV2Enabled',false,{});window.applyWorkspacePreferences({});}
      window.loadPage(source.id);
      window.toggleCommentsPanel();
      return {source:source.id,protected:protectedNote.id,comparison:comparison.id};
    }, modern);
    await expect(page.locator('#commentsList')).toContainText('Visible discussion sentinel');
    await page.evaluate(async id=>{await window.__sutraPublicBetaTestHooks.lockPageWithPin(id,'4826');window.loadPage(id);}, ids.protected);
    await expect(page.locator('#lockedPageScreen')).toBeVisible();
    await expect(page.locator('#commentsPageTitle')).toHaveText('Open a note');
    await expect(page.locator('#commentsList .comment-item')).toHaveCount(0);
    await expect(page.locator('#commentsPanel')).not.toContainText('Private discussion sentinel');
    await page.evaluate(id=>window.loadPage(id),ids.source);
    await expect(page.locator('#commentsList')).toContainText('Visible discussion sentinel');
    await page.evaluate(()=>document.getElementById('splitNotesToggleBtn').click());
    await page.locator('#splitNoteSelect').selectOption(ids.comparison);
    const target = modern ? '#editorV2SecondaryHost .ProseMirror' : '#editorSecondary';
    await page.locator(target).click();
    await expect(page.locator('#commentsPageTitle')).toHaveText('Comparison discussion');
    await expect(page.locator('#commentsList')).toContainText('Comparison discussion sentinel');
    await page.locator('#splitNoteSelect').selectOption(ids.protected);
    await expect(page.locator('#commentsPageTitle')).toHaveText('Open a note');
    await expect(page.locator('#commentsList .comment-item')).toHaveCount(0);
    await expect(page.locator('#commentsPanel')).not.toContainText('Private discussion sentinel');
  });
}
