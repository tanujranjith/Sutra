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
  test(`real Ctrl+Shift+V pastes multiline text once in ${modern ? 'Modern' : 'classic'} Editor`, async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Real system clipboard permissions are exercised in Chromium CI.');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openNotes(page);
    await page.evaluate(modern => {
      window.setWorkspacePreference('editor.editorV2Enabled', modern);
      window.applyWorkspacePreferences({});
    }, modern);
    const editor = page.locator(modern ? '#editorV2Host .ProseMirror' : '#editor');
    const text = 'First plain line\n\n<literal>text</literal>\nhttps://example.com/plain';
    await page.evaluate(async text => {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob(['<h1><strong>Formatted clipboard source</strong></h1><a href="https://example.com">link</a>'], { type: 'text/html' })
      })]);
    }, text);
    await editor.click();
    await page.keyboard.press('Control+Shift+V');
    await expect(editor).toContainText('First plain line');
    await expect(editor).toContainText('<literal>text</literal>');
    // Give the competing native event/readText promise time to reveal duplication.
    await page.waitForTimeout(300);
    const pasted = await editor.innerHTML();
    expect((pasted.match(/First plain line/g) || [])).toHaveLength(1);
    expect(pasted).not.toMatch(/<(?:strong|b|h1|a|literal|img)(?:\s|>)/i);
    expect(pasted).not.toContain('Formatted clipboard source');
    expect(await editor.innerText()).toMatch(/First plain line\n\n/);
    await page.keyboard.press('Control+Z');
    await expect(editor).not.toContainText('First plain line');
    await page.keyboard.press('Control+Shift+Z');
    await expect(editor).toContainText('First plain line');
    await page.evaluate(() => window.flowAtelier.flushAppSaveNow('real-plain-paste'));
    await page.reload();
    await waitForAppReady(page);
    await page.evaluate(() => window.setActiveView('notes'));
    await expect(page.locator(modern ? '#editorV2Host .ProseMirror' : '#editor')).toContainText('<literal>text</literal>');

    // Ordinary Ctrl+V still retains rich clipboard content.
    await page.locator(modern ? '#editorV2Host .ProseMirror' : '#editor').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Control+V');
    await expect(page.locator(modern ? '#editorV2Host strong' : '#editor strong').first()).toHaveText('Formatted clipboard source');
  });

  for (const navigateBeforeRead of [false, true]) {
    test(`plain paste clipboard fallback ${navigateBeforeRead ? 'drops a stale read' : 'inserts when native paste supplies nothing'} in ${modern ? 'Modern' : 'classic'} Editor`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Trusted clipboard shortcut exercised in Chromium CI.');
      await page.addInitScript(() => {
        // Model the reported failure: a keyboard shortcut without usable native paste.
        window.__blockNativePaste = true;
        document.addEventListener('paste', event => {
          if (!window.__blockNativePaste) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        }, true);
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
          readText: () => new Promise(resolve => { window.__resolvePlainClipboard = resolve; })
        } });
      });
      await openNotes(page);
      await page.evaluate(modern => {
        window.setWorkspacePreference('editor.editorV2Enabled', modern);
        window.applyWorkspacePreferences({});
      }, modern);
      const editor = page.locator(modern ? '#editorV2Host .ProseMirror' : '#editor');
      await editor.click();
      await page.keyboard.press('Control+Shift+V');
      await page.waitForFunction(() => typeof window.__resolvePlainClipboard === 'function');
      if (navigateBeforeRead) {
        await page.evaluate(() => {
          const other = window.flowAtelier.pages.find(item => item.id !== window.flowAtelier.currentPageId);
          window.loadPage(other.id);
        });
      }
      await page.evaluate(() => window.__resolvePlainClipboard('Clipboard fallback text'));
      if (navigateBeforeRead) {
        await page.waitForTimeout(150);
        await expect(page.locator('#view-notes')).not.toContainText('Clipboard fallback text');
      } else {
        await expect(editor).toContainText('Clipboard fallback text');
        await editor.evaluate(el => {
          window.__blockNativePaste = false;
          const data = new DataTransfer();
          data.setData('text/plain', 'Clipboard fallback text');
          el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        });
        expect(((await editor.innerHTML()).match(/Clipboard fallback text/g) || [])).toHaveLength(1);
      }
    });
  }

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
