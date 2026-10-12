import { expect, test } from '@playwright/test';
import { waitForAppHydrated } from './helpers/app-ready.mjs';

async function completeOnboarding(page) {
  await page.evaluate(() => {
    try { window.markStudentOnboardingCompleted?.(true); } catch {}
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

async function openNotes(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await page.waitForFunction(() => window.SutraNotesEditorV2 && window.flowAtelier &&
    typeof window.flowAtelier.flushAppSaveNow === 'function' &&
    typeof window.setWorkspacePreference === 'function' &&
    typeof window.applyWorkspacePreferences === 'function');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-app-ready'));
  await completeOnboarding(page);
  await waitForAppHydrated(page);
  await page.evaluate(() => {
    window.setWorkspacePreference('editor.editorV2Enabled', true, {});
    window.applyWorkspacePreferences({});
  });
  await page.locator('.view-tab[data-view="notes"]:visible').first().click();
  await page.waitForFunction(() => document.getElementById('view-notes') &&
    getComputedStyle(document.getElementById('view-notes')).display !== 'none');
  await page.evaluate(() => {
    window.createNewPage({ templateId: 'blank' });
    const name = document.getElementById('newPageName');
    if (name) {
      name.value = 'Paged layout regression';
      name.dispatchEvent(new Event('input', { bubbles: true }));
    }
    window.confirmNewPage();
  });
  await page.waitForSelector('#editorV2Host .ProseMirror');
  await page.waitForFunction(() => window.SutraNotesEditorV2.isMounted());
}

async function togglePagesMode(page) {
  await page.locator('.notes-toolbar-overflow-toggle').click();
  await page.locator('#pagesToggleBtn').click();
}

async function waitForAutoBreaks(page, minimum = 1) {
  await expect.poll(() => page.locator('#editorV2Host [data-notes-auto-page-break]').count(), { timeout: 15000 })
    .toBeGreaterThanOrEqual(minimum);
}

async function reloadSavedNote(page) {
  await page.evaluate(async () => {
    window.SutraNotesEditorV2.flushToMirror();
    await window.saveWorkspaceLocally();
    await window.flowAtelier.flushAppSaveNow('e2e-notes-page-layout-roundtrip');
  });
  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await completeOnboarding(page);
  await waitForAppHydrated(page);
  await page.locator('.view-tab[data-view="notes"]:visible').first().click();
  await page.waitForFunction(() => document.getElementById('view-notes') &&
    getComputedStyle(document.getElementById('view-notes')).display !== 'none');
  await page.waitForSelector('#editorV2Host .ProseMirror');
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const pane = document.querySelector('#notesPrimaryPane');
    const editor = document.querySelector('#editorV2Host .ProseMirror');
    const paneRect = pane.getBoundingClientRect();
    const style = getComputedStyle(pane);
    const pageHeight = parseFloat(style.getPropertyValue('--notes-page-height'));
    const gapHeight = parseFloat(style.getPropertyValue('--notes-page-auto-gap-height')) || 60;
    const paneScale = pane.offsetHeight ? paneRect.height / pane.offsetHeight : (parseFloat(style.zoom) || 1);
    const gaps = [...editor.querySelectorAll('.notes-page-auto-break-gap')].map(element => {
      const rect = element.getBoundingClientRect();
      return {
        top: (rect.top - paneRect.top) / paneScale,
        bottom: (rect.bottom - paneRect.top) / paneScale,
        height: rect.height / paneScale,
        clientTop: rect.top,
        clientBottom: rect.bottom
      };
    });
    let textIntersections = 0;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let text;
    while ((text = walker.nextNode())) {
      if (!text.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const rect of range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        for (const gap of gaps) {
          const top = gap.clientTop;
          const bottom = gap.clientBottom;
          if (rect.bottom > top + 1 && rect.top < bottom - 1 && rect.right > paneRect.left && rect.left < paneRect.right) {
            textIntersections += 1;
          }
        }
      }
    }
    return {
      pageHeight,
      gapHeight,
      paneScale,
      gaps,
      textIntersections,
      manualWidgets: editor.querySelectorAll('[data-notes-auto-page-reason="manual"]').length
    };
  });
}

function expectPageBoundaries(layout) {
  for (let index = 0; index < layout.gaps.length; index += 1) {
    const expectedTop = layout.pageHeight + index * (layout.pageHeight + layout.gapHeight);
    expect(Math.abs(layout.gaps[index].top - expectedTop)).toBeLessThanOrEqual(2);
    expect(Math.abs(layout.gaps[index].height - layout.gapHeight)).toBeLessThanOrEqual(2);
  }
}

test('Pages mode paginates long paragraphs and keeps auto gaps out of stored content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openNotes(page);
  const longText = 'A long paragraph keeps flowing as the page width changes and should never sit in the gray paper gap. '.repeat(220);
  const manualBreak = '<div class="atelier-page-break" data-atelier-block="page-break" contenteditable="false" role="separator" aria-label="Page break"></div>';
  await page.evaluate(({ text, manual }) => {
    window.SutraNotesEditorV2.setContent('<p>Opening notes before a manual break.</p>' + manual + '<p>' + text + '</p>');
  }, { text: longText, manual: manualBreak });
  await togglePagesMode(page);
  await expect(page.locator('body')).toHaveClass(/notes-pages-mode/);
  await waitForAutoBreaks(page, 2);

  const desktop = await inspectLayout(page);
  expect(desktop.manualWidgets).toBe(1);
  expect(desktop.gaps.length).toBeGreaterThanOrEqual(2);
  expect(desktop.textIntersections).toBe(0);
  expectPageBoundaries(desktop);

  const initialStorage = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(initialStorage).toContain('atelier-page-break');
  expect(initialStorage).toContain(longText);
  expect(initialStorage).not.toContain('notes-page-auto-break');

  const proseMirror = page.locator('#editorV2Host .ProseMirror');
  await proseMirror.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' typed-after-layout');
  await expect.poll(() => page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml()))
    .toContain('typed-after-layout');
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml()))
    .not.toContain('typed-after-layout');

  const pastedText = 'Pasted words trigger the same layout refresh. '.repeat(90);
  await page.evaluate(text => {
    const pm = document.querySelector('#editorV2Host .ProseMirror').editor;
    pm.commands.focus();
    pm.commands.setTextSelection(pm.state.doc.content.size - 1);
    const transfer = new DataTransfer();
    transfer.setData('text/plain', text);
    pm.view.dom.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer
    }));
  }, pastedText);
  await expect.poll(() => page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml()))
    .toContain('Pasted words trigger the same layout refresh.');
  const beforeResize = await page.locator('#editorV2Host [data-notes-auto-page-break]').count();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await inspectLayout(page)).textIntersections).toBe(0);
  await expect.poll(() => page.locator('#editorV2Host [data-notes-auto-page-break]').count()).toBeGreaterThanOrEqual(beforeResize);
  expect((await inspectLayout(page)).textIntersections).toBe(0);

  await togglePagesMode(page);
  await expect(page.locator('body')).not.toHaveClass(/notes-pages-mode/);
  await expect(page.locator('#editorV2Host [data-notes-auto-page-break]')).toHaveCount(0);
  await expect(page.locator('#editorV2Host .atelier-page-break')).not.toHaveCSS('height', '0px');
  await togglePagesMode(page);
  await expect(page.locator('body')).toHaveClass(/notes-pages-mode/);
  await waitForAutoBreaks(page, 2);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => (await inspectLayout(page)).textIntersections).toBe(0);
  await reloadSavedNote(page);
  await page.waitForFunction(text => {
    const editor = document.querySelector('#editorV2Host .ProseMirror');
    return editor && editor.textContent.includes(text);
  }, longText.slice(0, 80));
  if (!(await page.locator('body').evaluate(element => element.classList.contains('notes-pages-mode')))) {
    await togglePagesMode(page);
  }
  await waitForAutoBreaks(page, 2);
  const restored = await page.evaluate(async () => {
    const workspace = await window.loadWorkspaceLocally();
    const current = workspace?.pages?.find(note => note.id === window.flowAtelier.currentPageId);
    return {
      storage: window.SutraNotesEditorV2.getStorageHtml(),
      text: document.querySelector('#editorV2Host .ProseMirror')?.textContent || '',
      persistedContent: current?.content || ''
    };
  });
  expect(restored.storage).toContain(longText);
  expect(restored.storage).toContain('atelier-page-break');
  expect(restored.storage).not.toContain('notes-page-auto-break');
  expect(restored.persistedContent).toContain(longText);
  expect(restored.persistedContent).toContain('atelier-page-break');
  expect(restored.persistedContent).not.toContain('notes-page-auto-break');
  expect(restored.text).toContain(pastedText.slice(0, 40));
  expect(await page.locator('#editorV2Host .atelier-page-break').count()).toBe(1);
  const reloaded = await inspectLayout(page);
  expect(reloaded.textIntersections).toBe(0);
  expectPageBoundaries(reloaded);

  await page.locator('#editorZoomDisplay').click();
  await expect(page.locator('#editorZoomDisplay')).toHaveText('100%');
  await page.locator('.toolbar-zoom-controls button[onclick="adjustEditorZoom(10)"]').click();
  await expect(page.locator('#editorZoomDisplay')).toHaveText('110%');
  await expect.poll(async () => (await inspectLayout(page)).textIntersections).toBe(0);
  const zoomed = await inspectLayout(page);
  expect(zoomed.gaps.length).toBeGreaterThanOrEqual(2);
  expectPageBoundaries(zoomed);
  const zoomedStorage = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(zoomedStorage).toContain(longText);
  expect(zoomedStorage).toContain('atelier-page-break');
  expect(zoomedStorage).not.toContain('notes-page-auto-break');
});
