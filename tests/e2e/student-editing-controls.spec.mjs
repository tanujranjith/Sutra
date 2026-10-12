import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

async function openNotes(page) {
  await page.goto('/Sutra.html');
  await waitForAppReady(page);
  await page.evaluate(() => {
    window.markStudentOnboardingCompleted?.(true);
    document.body.classList.remove('onboarding-open');
    document.getElementById('sutraStartupIntro')?.remove();
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) { overlay.hidden = true; overlay.classList.remove('active'); overlay.style.display = 'none'; }
    window.setActiveView('notes');
    window.createNewPage({ templateId: 'blank' });
    document.getElementById('newPageName').value = 'Editing controls regression';
    window.confirmNewPage();
  });
  await page.waitForFunction(() => window.SutraNotesEditorV2.isMounted()
    && window.flowAtelier.pages.find(item => item.id === window.flowAtelier.currentPageId)?.title === 'Editing controls regression');
}

for (const modern of [true, false]) {
  test(`plain-text paste strips source formatting in ${modern ? 'Modern' : 'classic'} Editor`, async ({ page }) => {
    await openNotes(page);
    await page.evaluate(modern => {
      window.setWorkspacePreference('editor.editorV2Enabled', modern);
      window.applyWorkspacePreferences({});
    }, modern);
    const editor = page.locator(modern ? '#editorV2Host .ProseMirror' : '#editor');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.evaluate(el => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true, bubbles: true }));
      const data = new DataTransfer();
      data.setData('text/html', '<p><strong>Plain paste control</strong></p>');
      data.setData('text/plain', 'Plain paste control');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(editor).toContainText('Plain paste control');
    const html = await editor.innerHTML();
    expect(html).not.toMatch(/<(?:strong|b)(?:\s|>)/i);
    await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-plain-paste'));
    await page.reload();
    await waitForAppReady(page);
    await page.evaluate(() => window.setActiveView('notes'));
    await expect(page.locator(modern ? '#editorV2Host .ProseMirror' : '#editor')).toContainText('Plain paste control');
  });
}

test('emoji names support multiple-word search and the command launcher opens the palette', async ({ page }) => {
  await openNotes(page);
  await page.evaluate(() => window.openEmojiPicker(window.flowAtelier.currentPageId));
  await page.locator('#emojiSearch').fill('red heart');
  const results = page.locator('#emojiGrid .emoji-option');
  await expect(results.first()).toBeVisible();
  expect(await results.count()).toBeGreaterThan(0);
  await expect(results.filter({ hasText: '❤️' }).first()).toBeVisible();
  await results.filter({ hasText: '❤️' }).first().click();
  await expect(page.locator('#emojiPicker')).not.toHaveClass(/active/);
  await page.evaluate(() => window.setActiveView('today'));
  await page.locator('#commandPaletteLauncher').click();
  await expect(page.locator('#commandPaletteModal')).toBeVisible();
  await expect(page.locator('#commandPaletteInput')).toBeFocused();
  await page.locator('#commandPaletteInput').fill('Open Review');
  await expect(page.locator('#commandPaletteList')).toContainText('Open Review');
  await page.keyboard.press('Escape');
  await expect(page.locator('#commandPaletteModal')).toBeHidden();
});
