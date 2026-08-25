import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForFunction(() => !!window.flowAtelier && !!window.JSZip && !!window.SutraOfficeInterop);
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('office-offline-ready'));
}

test('a fresh installed app can import DOCX and XLSX after going offline', async ({ page, context }) => {
  await openApp(page);
  const cacheState = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const names = await caches.keys();
    const cache = await caches.open(names.find((name) => name.startsWith('sutra-cache-')));
    const docx = await cache.match('/assets/vendor/office/mammoth.browser.min.js?v=1.8.0');
    const xlsx = await cache.match('/assets/vendor/office/xlsx.full.min.js?v=0.18.5');

    const zip = new window.JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Offline DOCX evidence</w:t></w:r></w:p></w:body></w:document>');
    const docxBlob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    const engine = window.SutraSheetsEngine;
    const book = engine.createWorkbook('Offline sheet');
    engine.setCell(book.sheets[0], 0, 0, { value: 'Offline XLSX evidence' });
    const xlsxBlob = await window.SutraOfficeInterop.exportXlsx(book);
    window.__sutraOfflineOfficeFiles = {
      docx: new File([docxBlob], 'offline-evidence.docx', { type: docxBlob.type }),
      xlsx: new File([xlsxBlob], 'offline-evidence.xlsx', { type: xlsxBlob.type })
    };
    return { docx: !!docx, xlsx: !!xlsx };
  });
  expect(cacheState).toEqual({ docx: true, xlsx: true });

  await context.setOffline(true);
  try {
    const result = await page.evaluate(async () => {
      const docxOk = await window.importWorkspaceFile(window.__sutraOfflineOfficeFiles.docx);
      const xlsxOk = await window.importWorkspaceFile(window.__sutraOfflineOfficeFiles.xlsx);
      const pages = window.flowAtelier.pages;
      return {
        docxOk,
        xlsxOk,
        docxContent: pages.find((item) => item.title === 'Imported::offline-evidence')?.content || '',
        importedBodies: pages.filter((item) => item.title === 'Imported::offline-evidence').map((item) => item.content)
      };
    });
    expect(result.docxOk).toBe(true);
    expect(result.xlsxOk).toBe(true);
    expect(result.importedBodies.some((body) => body.includes('Offline DOCX evidence'))).toBe(true);
    expect(result.importedBodies.some((body) => body.includes('Offline XLSX evidence'))).toBe(true);
  } finally {
    await context.setOffline(false);
  }
});
