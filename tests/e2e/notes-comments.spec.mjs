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

