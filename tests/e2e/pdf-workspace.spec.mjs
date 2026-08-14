import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadFixturePdfLib(page) {
  expect(await page.evaluate(() => typeof window.PDFLib)).toBe('undefined');
  await page.evaluate(() => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('assets/vendor/pdf-lib/pdf-lib.min.js?v=1.17.1', document.baseURI).href;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error('PDF fixture generator failed to load.')), { once: true });
    document.head.appendChild(script);
  }));
}

test('native PDF workspace stores once, renders locally, persists annotations, and preserves exact-original export', async ({ page }) => {
  await page.goto('/Sutra.html');
  await expect(page.locator('#view-today')).toBeVisible();
  await page.waitForFunction(() => localStorage.getItem('sutra_startup_sound') !== null);
  await page.waitForFunction(() => window.SutraAttachments && window.SutraPdfWorkspace);
  await loadFixturePdfLib(page);

  const created = await page.evaluate(async () => {
    const documentRecord = await window.PDFLib.PDFDocument.create();
    const pdfPage = documentRecord.addPage([612, 792]);
    pdfPage.drawText('Sutra PDF workspace fixture', { x: 72, y: 710, size: 18 });
    pdfPage.drawText('Selectable local text and a form field.', { x: 72, y: 680, size: 12 });
    const form = documentRecord.getForm();
    const field = form.createTextField('student.name');
    field.setText('Ada');
    field.addToPage(pdfPage, { x: 72, y: 620, width: 220, height: 28 });
    const bytes = new Uint8Array(await documentRecord.save());
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(hashBuffer)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    const file = new File([bytes], 'native-workspace-fixture.pdf', { type: 'application/pdf' });
    const [meta] = await window.SutraAttachments.addFiles([file], { entityType: 'note', entityId: 'note-pdf-e2e' });
    await window.SutraPdfWorkspace.open(meta.id, { entityType: 'note', entityId: 'note-pdf-e2e' });
    return { fileId: meta.id, hash, length: bytes.length };
  });

  await expect(page.locator('.pdfw-root')).toBeVisible();
  await expect(page.locator('.pdfw-page canvas')).toHaveCount(1);
  await expect(page.locator('.pdfw-text-layer')).toContainText('Sutra PDF workspace fixture');
  await expect(page.locator('.pdfw-form-field[name="student.name"]')).toHaveValue('Ada');
  await page.locator('.pdfw-form-field[name="student.name"]').fill('Grace Hopper');
  await page.locator('.pdfw-form-field[name="student.name"]').blur();

  const links = await page.evaluate(() => window.SutraAttachments.listForEntity('note', 'note-pdf-e2e'));
  expect(links).toHaveLength(1);
  expect(links[0].id).toBe(created.fileId);

  await page.evaluate(async fileId => {
    const record = window.SutraPdfData.findByFile(fileId);
    window.SutraPdfData.upsertAnnotation({
      id: 'pdf-e2e-highlight', documentId: record.id, pageId: record.pages[0].id,
      type: 'highlight', geometry: { rects: [{ x: 0.1, y: 0.08, width: 0.45, height: 0.04 }] },
      style: { color: '#facc15', opacity: 0.42 }, text: 'Sutra PDF workspace fixture'
    });
    window.SutraPdfData.upsertAnnotation({
      id: 'pdf-e2e-comment', documentId: record.id, pageId: record.pages[0].id,
      type: 'comment', geometry: { x: 0.7, y: 0.12, width: 0.035, height: 0.035 },
      style: { color: '#2563eb', opacity: 1 }, text: 'Unicode comment: पढ़ाई ✓'
    });
    window.SutraPdfWorkspace.close();
    await window.SutraPdfWorkspace.open(fileId, { entityType: 'note', entityId: 'note-pdf-e2e' });
  }, created.fileId);
  await expect(page.locator('[data-annotation-id="pdf-e2e-highlight"]')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => window.SutraPdfWorkspace.export({ mode: 'original' }));
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const downloaded = await fs.readFile(downloadPath);
  expect(downloaded.length).toBe(created.length);
  expect(crypto.createHash('sha256').update(downloaded).digest('hex')).toBe(created.hash);

  const annotatedDownloadPromise = page.waitForEvent('download');
  await page.evaluate(() => window.SutraPdfWorkspace.export({ mode: 'annotated', includeForms: true, includeCommentSummary: true }));
  const annotated = await annotatedDownloadPromise;
  const annotatedBytes = await fs.readFile(await annotated.path());
  expect(annotatedBytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(annotatedBytes.length).toBeGreaterThan(100);
  const exportedForm = await page.evaluate(async bytes => {
    const documentRecord = await window.PDFLib.PDFDocument.load(new Uint8Array(bytes));
    return documentRecord.getForm().getTextField('student.name').getText();
  }, Array.from(annotatedBytes));
  expect(exportedForm).toBe('Grace Hopper');
});

test('PDF page organizer keeps source bytes and requires references to be removed before deletion', async ({ page }) => {
  await page.goto('/Sutra.html');
  await expect(page.locator('#view-today')).toBeVisible();
  await page.waitForFunction(() => localStorage.getItem('sutra_startup_sound') !== null);
  await page.waitForFunction(() => window.SutraAttachments && window.SutraPdfWorkspace);
  await loadFixturePdfLib(page);
  const result = await page.evaluate(async () => {
    const documentRecord = await window.PDFLib.PDFDocument.create();
    documentRecord.addPage([300, 400]); documentRecord.addPage([300, 400]);
    const file = new File([await documentRecord.save()], 'organizer.pdf', { type: 'application/pdf' });
    const [meta] = await window.SutraAttachments.addFiles([file], { entityType: 'assignment', entityId: 'assignment-pdf-e2e' });
    await window.SutraPdfWorkspace.open(meta.id, { entityType: 'assignment', entityId: 'assignment-pdf-e2e' });
    const pdfRecord = window.SutraPdfData.findByFile(meta.id);
    return { fileId: meta.id, documentId: pdfRecord.id, firstPageId: pdfRecord.pages[0].id };
  });
  await page.locator('[data-action="organizer"]').click();
  await page.locator('.pdfw-organizer-row').first().locator('[data-action="rotate"]').click();
  await expect(page.locator('.pdfw-page canvas')).toHaveCount(2);
  const durable = await page.evaluate(documentId => window.SutraPdfData.getDocument(documentId), result.documentId);
  expect(durable.pages[0].rotation).toBe(90);
  const refused = await page.evaluate(fileId => window.SutraAttachments.remove(fileId), result.fileId);
  expect(refused.removed).toBe(false);
  expect(refused.reason).toBe('referenced');
});

test('Homework and Assignment Studio uploads reuse the canonical attachment bridge', async ({ page }) => {
  await page.goto('/Sutra.html');
  await expect(page.locator('#view-today')).toBeVisible();
  await page.waitForFunction(() => localStorage.getItem('sutra_startup_sound') !== null);
  await page.waitForFunction(() => window.SutraAttachments && window.SutraHomework && window.SutraAssignmentStudio);
  await loadFixturePdfLib(page);
  const ids = await page.evaluate(() => {
    const task = window.SutraHomework.createTask({ title: 'PDF lab report', dueDate: '2026-09-01' });
    return { taskId: task.id };
  });
  await page.evaluate(taskId => window.SutraAssignmentStudio.open(taskId), ids.taskId);
  await page.locator('[data-studio-tab="links"]').click();
  const pdfBytes = await page.evaluate(async () => {
    const documentRecord = await window.PDFLib.PDFDocument.create();
    const pdfPage = documentRecord.addPage([300, 400]);
    pdfPage.drawText('Assignment attachment', { x: 30, y: 340, size: 14 });
    return Array.from(new Uint8Array(await documentRecord.save()));
  });
  await page.locator('[data-studio-upload]').setInputFiles({ name: 'assignment-source.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdfBytes) });
  await expect(page.locator('[data-file-link]')).toContainText('assignment-source.pdf');

  const studioLinks = await page.evaluate(taskId => window.SutraAttachments.listForEntity('assignment', taskId), ids.taskId);
  expect(studioLinks).toHaveLength(1);
  await page.evaluate(({ fileId, taskId }) => window.SutraAttachments.link(fileId, 'homework', taskId), { fileId: studioLinks[0].id, taskId: ids.taskId });
  const homeworkLinks = await page.evaluate(taskId => window.SutraAttachments.listForEntity('homework', taskId), ids.taskId);
  expect(homeworkLinks).toHaveLength(1);
  expect(homeworkLinks[0].id).toBe(studioLinks[0].id);
});

test('direct file mode uses the same-thread local PDF.js fallback', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Direct-file fallback is certified in Chromium; served mode covers the cross-browser matrix.');
  await page.goto(pathToFileURL(path.resolve(process.cwd(), 'Sutra.html')).href);
  await page.waitForFunction(() => window.SutraPdfAdapter && window.pdfjsLib && window.pdfjsWorker);
  await loadFixturePdfLib(page);
  const result = await page.evaluate(async () => {
    const source = await window.PDFLib.PDFDocument.create();
    const sourcePage = source.addPage([320, 480]); sourcePage.drawText('Direct file PDF fallback', { x: 40, y: 400, size: 16 });
    const bytes = new Uint8Array(await source.save());
    const loaded = await window.SutraPdfAdapter.load(bytes);
    const first = await loaded.getPage(1); const text = await first.getTextContent();
    if (loaded.cleanup) await loaded.cleanup();
    return { pages: loaded.numPages, text: text.items.map(item => item.str).join(' ') };
  });
  expect(result.pages).toBe(1);
  expect(result.text).toContain('Direct file PDF fallback');
});
