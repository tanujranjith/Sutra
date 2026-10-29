import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

const IMPORT_TITLE = 'formula-cache-regression';

async function openDataSettings(page) {
  await page.addInitScript(() => { sessionStorage.setItem('sutra_intro_played', '1'); });
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await waitForAppReady(page);
  await page.waitForFunction(() => !!window.JSZip && !!window.SutraOfficeInterop);
  await page.evaluate(() => {
    try { window.markStudentOnboardingCompleted?.(true); } catch {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) { overlay.classList.remove('active'); overlay.hidden = true; overlay.style.setProperty('display', 'none', 'important'); }
    window.setActiveView('settings');
  });
  await expect(page.locator('#view-settings')).toBeVisible();
  await page.locator('[data-settings-nav="data"]').click();
  await expect(page.locator('#importWorkspaceBtn')).toBeVisible();
}

async function makeUncachedFormulaWorkbook(page) {
  const bytes = await page.evaluate(async () => {
    const zip = new window.JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Cache Check" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.file('xl/worksheets/sheet1.xml', '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="n"><v>2</v></c><c r="B1" t="n"><f>10+2</f><v>0</v></c><c r="C1" t="b"><f>TRUE()</f><v>0</v></c><c r="D1" t="str"><f>&quot;recomputed text&quot;</f><v>cached text</v></c><c r="E1" t="e"><f>1+1</f><v>#DIV/0!</v></c></row><row r="2"><c r="A2" t="n"><v>3</v></c></row><row r="3"><c r="A3"><f>SUM(A1:A2)</f></c><c r="B3"><f>AVERAGE(A1:A4)</f></c><c r="C3"><f>IFERROR(XIRR(A1:A2,A3:A4),0)</f></c><c r="D3"><f>B3+1</f></c></row></sheetData></worksheet>');
    return Array.from(await zip.generateAsync({ type: 'uint8array' }));
  });
  return Buffer.from(bytes);
}

async function importedTableValues(page) {
  return page.evaluate((title) => {
    const note = window.flowAtelier.pages.find((item) => item.title === title);
    if (!note) return null;
    const documentNode = new DOMParser().parseFromString(String(note.content || ''), 'text/html');
    return {
      content: String(note.content || ''),
      cells: Array.from(documentNode.querySelectorAll('table td, table th')).map((cell) => String(cell.textContent || '').trim())
    };
  }, IMPORT_TITLE);
}

test('Settings imports uncached XLSX formulas and preserves supplied formula caches in the saved note', async ({ page }) => {
  await openDataSettings(page);

  const fileBuffer = await makeUncachedFormulaWorkbook(page);
  await page.locator('#importWorkspaceBtn').click();
  await expect(page.locator('#customConfirmModal')).toHaveClass(/active/);
  await page.locator('#customConfirmAcceptBtn').click();
  await expect(page.locator('#importDropModal')).toHaveClass(/active/);

  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#importDropBrowseBtn').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: `${IMPORT_TITLE}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: fileBuffer
  });

  await expect.poll(async () => (await importedTableValues(page))?.content || '').toContain('Missing formula results were calculated locally');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('formula-cache-import-e2e'));
  await page.reload();
  await waitForAppReady(page);

  const imported = await importedTableValues(page);
  expect(imported).not.toBeNull();
  expect(imported.content).toContain('static snapshot');
  expect(imported.content).toContain('formula result(s) could not be calculated');
  expect(imported.cells).toContain('5');
  expect(imported.cells).toContain('0');
  expect(imported.cells.some((value) => /^false$/i.test(value))).toBe(true);
  expect(imported.cells).toContain('cached text');
  expect(imported.cells).toContain('#DIV/0!');
  expect(imported.cells).toContain('=AVERAGE(A1:A4)');
  expect(imported.cells).toContain('=IFERROR(XIRR(A1:A2,A3:A4),0)');
  expect(imported.cells).toContain('=B3+1');
});
