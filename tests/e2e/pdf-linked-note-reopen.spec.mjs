import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

async function completeOnboarding(page) {
  await page.evaluate(() => {
    if (typeof window.markStudentOnboardingCompleted === 'function') {
      window.markStudentOnboardingCompleted(true);
    }
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.setProperty('display', 'none', 'important');
    }
  });
}

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await page.waitForFunction(() => window.flowAtelier && window.SutraAttachments
    && window.SutraPdfWorkspace && window.SutraNotesEditorV2);
  await waitForAppReady(page);
  await completeOnboarding(page);
  await page.evaluate(() => {
    window.setWorkspacePreference('editor.editorV2Enabled', true, {});
    window.applyWorkspacePreferences({});
  });
  await page.waitForFunction(() => window.SutraNotesEditorV2.isMounted());
  await page.locator('.view-tabs > .view-tab[data-view="notes"]').click();
  await expect(page.locator('#view-notes')).toBeVisible();
}

async function loadFixturePdfLib(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('assets/vendor/pdf-lib/pdf-lib.min.js?v=1.17.1', document.baseURI).href;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error('PDF fixture generator failed to load.')), { once: true });
    document.head.appendChild(script);
  }));
}

test('PDF import preserves its linked card through Editor V2 and reopens after navigation and reload', async ({ page }) => {
  await openApp(page);
  await loadFixturePdfLib(page);

  const imported = await page.evaluate(async () => {
    const pdf = await window.PDFLib.PDFDocument.create();
    const sheet = pdf.addPage([612, 792]);
    sheet.drawText('Linked PDF reopen fixture', { x: 72, y: 710, size: 18 });
    const bytes = new Uint8Array(await pdf.save());
    const originalDigest = await crypto.subtle.digest('SHA-256', bytes);
    const originalHash = Array.from(new Uint8Array(originalDigest), byte => byte.toString(16).padStart(2, '0')).join('');
    const existingIds = new Set(window.flowAtelier.pages.map(note => note.id));
    const accepted = await window.importWorkspaceFile(new File([bytes], 'Linked reopen fixture.pdf', { type: 'application/pdf' }));
    const note = window.flowAtelier.pages.find(entry => !existingIds.has(entry.id));
    if (!accepted || !note) throw new Error('The PDF import did not create its Note.');

    window.SutraNotesEditorV2.flushToMirror();
    await window.flowAtelier.flushAppSaveNow('pdf-linked-note-editor-roundtrip');
    const editorCard = document.querySelector('#editorV2Host .sutra-linked-pdf-card[data-sutra-pdf-card]');
    const linkedFile = window.SutraAttachments.listForEntity('note', note.id).find(file => file.kind === 'pdf');
    if (!linkedFile) throw new Error('The imported PDF is missing its Note attachment link.');
    return {
      noteId: note.id,
      fileId: linkedFile.id,
      originalHash,
      noteContentHasCard: note.content.includes(`data-sutra-pdf-card="${linkedFile.id}"`),
      editorHasCard: !!editorCard && editorCard.getAttribute('data-sutra-pdf-card') === linkedFile.id
    };
  });

  expect(imported.noteContentHasCard).toBe(true);
  expect(imported.editorHasCard).toBe(true);
  await expect(page.locator('.pdfw-root')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.SutraPdfWorkspace.getContext()?.fileId || '')).toBe(imported.fileId);

  const otherNoteId = await page.evaluate(() => window.__sutraPublicBetaTestHooks
    .createNoteInActiveSpace('PDF reopen destination', '<p>Destination note.</p>').id);
  await page.evaluate(id => window.loadPage(id), otherNoteId);
  await expect(page.locator('.pdfw-root')).toHaveCount(0);

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page.evaluate(id => window.loadPage(id), imported.noteId);
    await expect(page.locator('.pdfw-root')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.SutraPdfWorkspace.getContext()?.fileId || '')).toBe(imported.fileId);
    await page.evaluate(id => window.loadPage(id), otherNoteId);
    await expect(page.locator('.pdfw-root')).toHaveCount(0);
  }

  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await page.waitForFunction(() => window.flowAtelier && window.SutraAttachments && window.SutraPdfWorkspace);
  await waitForAppReady(page);
  await completeOnboarding(page);
  await page.evaluate(() => window.SutraPdfWorkspace.close());
  await expect(page.locator('.pdfw-root')).toHaveCount(0);
  await page.locator('.view-tabs > .view-tab[data-view="notes"]').click();
  await expect(page.locator('#view-notes')).toBeVisible();
  await page.locator(`#pagesList .page-item[data-page-id="${imported.noteId}"] .page-title-text`).click();
  await expect(page.locator('.pdfw-root')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.SutraPdfWorkspace.getContext()?.fileId || '')).toBe(imported.fileId);

  const afterReload = await page.evaluate(async fileId => {
    const bytes = await window.SutraAttachments.readBytes(fileId);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }, imported.fileId);
  expect(afterReload).toBe(imported.originalHash);
  await expect(page.locator('.pdfw-root')).toHaveCount(1);
});

test('only linked-PDF wrappers reopen from their attachment identity', async ({ page }) => {
  await openApp(page);
  await loadFixturePdfLib(page);

  const linked = await page.evaluate(async () => {
    const pdf = await window.PDFLib.PDFDocument.create();
    pdf.addPage([612, 792]).drawText('Attachment relationship fixture', { x: 72, y: 710, size: 18 });
    const bytes = new Uint8Array(await pdf.save());
    const makeFile = name => new File([bytes], name, { type: 'application/pdf' });
    const hooks = window.__sutraPublicBetaTestHooks;
    const ordinary = hooks.createNoteInActiveSpace('Ordinary note with one PDF attachment', '<p>Ordinary note remains readable.</p>');
    const [ordinaryFile] = await window.SutraAttachments.addFiles([makeFile('ordinary-attachment.pdf')], {
      entityType: 'note', entityId: ordinary.id
    });
    const legacyCard = hooks.createNoteInActiveSpace('Markerless linked-PDF wrapper', '<aside class="sutra-linked-pdf-card"><p>Legacy linked PDF.</p></aside>');
    const [legacyFile] = await window.SutraAttachments.addFiles([makeFile('legacy-linked.pdf')], {
      entityType: 'note', entityId: legacyCard.id
    });
    const ambiguous = hooks.createNoteInActiveSpace('Two PDFs in a markerless wrapper', '<aside class="sutra-linked-pdf-card"><p>Ambiguous linked PDFs.</p></aside>');
    const ambiguousFiles = await window.SutraAttachments.addFiles([
      makeFile('ambiguous-a.pdf'), makeFile('ambiguous-b.pdf')
    ], { entityType: 'note', entityId: ambiguous.id });
    await window.flowAtelier.flushAppSaveNow('pdf-linked-note-recovery-fixture');
    return {
      ordinaryId: ordinary.id,
      ordinaryFileId: ordinaryFile.id,
      legacyCardId: legacyCard.id,
      legacyFileId: legacyFile.id,
      ambiguousId: ambiguous.id,
      ambiguousFileCount: ambiguousFiles.length
    };
  });

  expect(linked.ambiguousFileCount).toBe(2);
  await page.evaluate(id => window.loadPage(id), linked.ordinaryId);
  await expect(page.locator('.pdfw-root')).toHaveCount(0);
  expect(await page.evaluate(() => window.SutraPdfWorkspace.getContext())).toBeNull();

  await page.evaluate(id => window.loadPage(id), linked.legacyCardId);
  await expect(page.locator('.pdfw-root')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.SutraPdfWorkspace.getContext()?.fileId || '')).toBe(linked.legacyFileId);

  await page.evaluate(id => window.loadPage(id), linked.ambiguousId);
  await expect(page.locator('.pdfw-root')).toHaveCount(0);
  expect(await page.evaluate(() => window.SutraPdfWorkspace.getContext())).toBeNull();
});

test('Convert to Note keeps extracted text readable and explicit Open PDF still works', async ({ page }) => {
  await openApp(page);
  await loadFixturePdfLib(page);

  const imported = await page.evaluate(async () => {
    const pdf = await window.PDFLib.PDFDocument.create();
    pdf.addPage([612, 792]).drawText('PDF conversion should stay readable', { x: 72, y: 710, size: 18 });
    const bytes = new Uint8Array(await pdf.save());
    const existingIds = new Set(window.flowAtelier.pages.map(note => note.id));
    await window.importWorkspaceFile(new File([bytes], 'Convertible linked PDF.pdf', { type: 'application/pdf' }));
    const note = window.flowAtelier.pages.find(entry => !existingIds.has(entry.id));
    const file = window.SutraAttachments.listForEntity('note', note.id).find(entry => entry.kind === 'pdf');
    return { noteId: note.id, fileId: file.id };
  });

  await expect(page.locator('.pdfw-root')).toHaveCount(1);
  await page.evaluate(() => window.SutraPdfWorkspace.close());
  await expect(page.locator('.pdfw-root')).toHaveCount(0);
  await expect(page.locator(`#editorV2Host .sutra-linked-pdf-card[data-sutra-pdf-card="${imported.fileId}"]`)).toBeVisible();
  await page.locator(`#editorV2Host [data-sutra-pdf-action="convert"][data-file-id="${imported.fileId}"]`).click();

  const converted = page.locator(`#editorV2Host .sutra-linked-pdf-card[data-sutra-pdf-card="${imported.fileId}"]`);
  await expect(converted).toHaveAttribute('data-sutra-pdf-auto-open', 'false');
  await expect(page.locator('#editorV2Host')).toContainText('PDF conversion should stay readable');
  await expect(page.locator('.pdfw-root')).toHaveCount(0);
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('pdf-convert-readable-regression'));

  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await page.waitForFunction(() => window.flowAtelier && window.SutraPdfWorkspace);
  await waitForAppReady(page);
  await completeOnboarding(page);
  await page.evaluate(() => window.SutraPdfWorkspace.close());
  await page.locator('.view-tabs > .view-tab[data-view="notes"]').click();
  await page.locator(`#pagesList .page-item[data-page-id="${imported.noteId}"] .page-title-text`).click();
  await expect(page.locator('.pdfw-root')).toHaveCount(0);
  await expect(page.locator('#editorV2Host')).toContainText('PDF conversion should stay readable');
  await page.locator(`#editorV2Host [data-sutra-pdf-action="open"][data-file-id="${imported.fileId}"]`).click();
  await expect(page.locator('.pdfw-root')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.SutraPdfWorkspace.getContext()?.fileId || '')).toBe(imported.fileId);
});
