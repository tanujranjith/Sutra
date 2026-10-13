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
    await context.clearPermissions();
    await page.evaluate(() => {
      window.__clipboardReadAttempts = 0;
      Object.defineProperty(navigator.clipboard, 'readText', { configurable: true, value: () => {
        window.__clipboardReadAttempts++;
        return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
      } });
    });
    await editor.click();
    await page.keyboard.press('Control+Shift+V');
    await expect(editor).toContainText('First plain line');
    await expect(editor).toContainText('<literal>text</literal>');
    // Catch a second insertion from a competing native input event.
    await page.waitForTimeout(300);
    const pasted = await editor.innerHTML();
    expect((pasted.match(/First plain line/g) || [])).toHaveLength(1);
    expect(pasted).not.toMatch(/<(?:strong|b|h1|a|literal|img)(?:\s|>)/i);
    expect(pasted).not.toContain('Formatted clipboard source');
    expect(await page.evaluate(() => window.__clipboardReadAttempts)).toBe(0);
    await expect(page.getByText('Clipboard access was blocked.', { exact: false })).toHaveCount(0);
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

  for (const delivery of ['paste', 'beforeinput', 'html-only']) {
    test(`Shift-paste uses ${delivery} event data without clipboard permission in ${modern ? 'Modern' : 'classic'} Editor`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Trusted keyboard gesture exercised in Chromium CI.');
      await page.addInitScript(() => {
        window.__clipboardReadAttempts = 0;
        // Keep the real shortcut, but control delivery of its clipboard event.
        document.addEventListener('paste', event => {
          if (!event.isTrusted) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        }, true);
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
          readText: () => { window.__clipboardReadAttempts++; return Promise.reject(new DOMException('Denied', 'NotAllowedError')); }
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
      const emptyPasteAllowed = await editor.evaluate((el, delivery) => {
        const allowed = el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true }));
        const data = new DataTransfer();
        data.setData('text/html', '<p><strong>Permission-free plain text</strong></p><p>Second line</p>');
        if (delivery !== 'html-only') data.setData('text/plain', 'Permission-free plain text\nSecond line');
        if (delivery === 'beforeinput') {
          const input = new InputEvent('beforeinput', { inputType: 'insertFromPaste', bubbles: true, cancelable: true });
          Object.defineProperty(input, 'dataTransfer', { value: data });
          el.dispatchEvent(input);
        } else {
          el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        }
        return allowed;
      }, delivery);
      expect(emptyPasteAllowed).toBe(true);
      await expect(editor).toContainText('Permission-free plain text');
      await expect(editor).toContainText('Second line');
      expect(await editor.innerHTML()).not.toMatch(/<(?:strong|b)(?:\s|>)/i);
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => window.__clipboardReadAttempts)).toBe(0);
      await expect(page.getByText('Clipboard access was blocked.', { exact: false })).toHaveCount(0);
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
