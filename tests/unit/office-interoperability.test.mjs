import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
globalThis.JSZip = JSZip;
const Sheets = require('../../src/features/workspace/sheets-engine.js');
const Office = require('../../src/features/workspace/office-interoperability.js');

test('CSV parser handles quoted separators, escaped quotes, and newlines', () => {
  assert.deepEqual(Office.parseDelimited('Name,Note\r\nAda,"Hello, world"\r\nLin,"A ""quote"""', ','), [
    ['Name', 'Note'],
    ['Ada', 'Hello, world'],
    ['Lin', 'A "quote"']
  ]);
});

test('CSV import/export preserves values and formulas', () => {
  const workbook = Office.workbookFromDelimited('Item,Score\nQuiz,8\nTotal,=SUM(B2:B2)', { delimiter: ',', title: 'Grades' });
  const sheet = workbook.sheets[0];
  assert.equal(workbook.version, 2);
  assert.equal(Sheets.cellAt(sheet, 1, 1).value, 8);
  assert.equal(Sheets.cellAt(sheet, 2, 1).formula, '=SUM(B2:B2)');
  assert.match(Office.exportDelimited(workbook, sheet.id, ','), /Total,=SUM\(B2:B2\)/);
});

test('XLSX export creates a standards-shaped local Office package', async () => {
  const workbook = Sheets.createWorkbook('Lab results');
  const sheet = workbook.sheets[0];
  sheet.name = 'Data';
  Sheets.setCell(sheet, 0, 0, { value: 'Trial' });
  workbook.styles.score = { fontWeight: '700', textAlign: 'center', backgroundColor: '#DBEAFE', numberFormat: 'currency', border: '1px solid #9ca3af' };
  Sheets.setCell(sheet, 0, 1, { value: 12, styleId: 'score' });
  Sheets.setCell(sheet, 1, 1, { formula: '=B1*2' });
  sheet.frozen.rows = 1;
  sheet.merges.push('A3:B3');
  const blob = await Office.exportXlsx(workbook);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  assert.ok(zip.file('[Content_Types].xml'));
  assert.ok(zip.file('xl/workbook.xml'));
  assert.ok(zip.file('xl/worksheets/sheet1.xml'));
  assert.ok(zip.file('xl/styles.xml'));
  const worksheet = await zip.file('xl/worksheets/sheet1.xml').async('text');
  assert.match(worksheet, /state="frozen"/);
  assert.match(worksheet, /mergeCell ref="A3:B3"/);
  assert.match(worksheet, /<f>B1\*2<\/f>/);
  assert.match(worksheet, /<f>B1\*2<\/f><v>24<\/v>/);
  assert.match(worksheet, /r="B1" s="1"/);
  const styles = await zip.file('xl/styles.xml').async('text');
  assert.match(styles, /horizontal="center"/);
  assert.match(styles, /FFDBEAFE/);
  assert.match(styles, /numFmtId="164"/);
});

test('XLSX formula cells include typed cached results and preserve formulas', async () => {
  const workbook = Sheets.createWorkbook('Cached formula results');
  const sheet = workbook.sheets[0];
  Sheets.setCell(sheet, 0, 0, { value: 2 });
  Sheets.setCell(sheet, 1, 0, { value: 3 });
  Sheets.setCell(sheet, 2, 0, { formula: '=SUM(A1:A2)' });
  Sheets.setCell(sheet, 0, 1, { formula: '="Ready & set"' });
  Sheets.setCell(sheet, 0, 2, { formula: '=A1>0' });
  Sheets.setCell(sheet, 0, 3, { formula: '=1/0' });

  const blob = await Office.exportXlsx(workbook);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const worksheet = await zip.file('xl/worksheets/sheet1.xml').async('text');

  assert.match(worksheet, /<c r="A3" t="n"><f>SUM\(A1:A2\)<\/f><v>5<\/v><\/c>/);
  assert.match(worksheet, /<c r="B1" t="str"><f>"Ready &amp; set"<\/f><v>Ready &amp; set<\/v><\/c>/);
  assert.match(worksheet, /<c r="C1" t="b"><f>A1&gt;0<\/f><v>1<\/v><\/c>/);
  assert.match(worksheet, /<c r="D1" t="e"><f>1\/0<\/f><v>#DIV\/0!<\/v><\/c>/);
  assert.equal(Sheets.cellAt(sheet, 2, 0).formula, '=SUM(A1:A2)');
});

test('XLSX formula caches use the Sheets engine for cross-sheet and named-range references', async () => {
  const workbook = Sheets.createWorkbook('Connected formula results');
  const inputs = workbook.sheets[0];
  inputs.name = 'Inputs';
  const summary = Sheets.createSheet('Summary');
  workbook.sheets.push(summary);
  workbook.namedRanges.BaseValue = "'Inputs'!A1";
  Sheets.setCell(inputs, 0, 0, { value: 6 });
  Sheets.setCell(summary, 0, 0, { formula: '=Inputs!A1*2' });
  Sheets.setCell(summary, 1, 0, { formula: '=BaseValue*3' });

  const blob = await Office.exportXlsx(workbook);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const worksheet = await zip.file('xl/worksheets/sheet2.xml').async('text');
  const workbookXml = await zip.file('xl/workbook.xml').async('text');

  assert.match(worksheet, /<f>Inputs!A1\*2<\/f><v>12<\/v>/);
  assert.match(worksheet, /<f>BaseValue\*3<\/f><v>18<\/v>/);
  assert.match(workbookXml, /<definedName name="BaseValue">'Inputs'!A1<\/definedName>/);
});

test('SheetJS formula-cache repair fills missing sums and cross-sheet names without replacing supplied caches', () => {
  const parsed = {
    SheetNames: ['Inputs', 'Summary'],
    Sheets: {
      Inputs: {
        A1: { t: 'n', v: 6 },
        A2: { t: 'e', v: 7, w: '#DIV/0!' },
        '!ref': 'A1:A2'
      },
      Summary: {
        A1: { t: 'n', f: 'SUM(Inputs!A1:A1)' },
        A2: { t: 'n', f: 'BaseValue*3' },
        B1: { t: 'n', f: '1+1', v: 0, w: 'stale zero' },
        B2: { t: 'b', f: 'TRUE', v: false, w: 'stale false' },
        B3: { t: 'str', f: '"cached"', v: '', w: 'stale string' },
        C1: { t: 'n', f: 'SUM(Inputs!A2:A2)' },
        D1: { t: 'n', f: 'SUM(Inputs!A1:A1)+Inputs!B250' },
        E1: { t: 'str', f: '"ready"' },
        F1: { t: 'b', f: 'TRUE' },
        '!ref': 'A1:C1'
      }
    },
    Workbook: { Names: [{ Name: 'BaseValue', Ref: "'Inputs'!$A$1" }] }
  };
  const report = Office.fillMissingFormulaResults(parsed);

  assert.deepEqual(report, { calculated: 6, unavailable: 0 });
  assert.equal(parsed.Sheets.Summary.A1.v, 6);
  assert.equal(parsed.Sheets.Summary.A1.t, 'n');
  assert.equal(parsed.Sheets.Summary.A1.f, 'SUM(Inputs!A1:A1)');
  assert.equal(parsed.Sheets.Summary.A2.v, 18);
  assert.equal(parsed.Sheets.Summary.C1.v, '#DIV/0!');
  assert.equal(parsed.Sheets.Summary.C1.t, 'e');
  assert.equal(parsed.Sheets.Summary.D1.v, 6);
  assert.equal(parsed.Sheets.Summary.E1.v, 'ready');
  assert.equal(parsed.Sheets.Summary.E1.t, 'str');
  assert.equal(parsed.Sheets.Summary.F1.v, true);
  assert.equal(parsed.Sheets.Summary.F1.t, 'b');
  assert.deepEqual(parsed.Sheets.Summary.B1, { t: 'n', f: '1+1', v: 0, w: 'stale zero' });
  assert.deepEqual(parsed.Sheets.Summary.B2, { t: 'b', f: 'TRUE', v: false, w: 'stale false' });
  assert.deepEqual(parsed.Sheets.Summary.B3, { t: 'str', f: '"cached"', v: '', w: 'stale string' });
});

test('SheetJS formula-cache repair leaves unsupported results as formula text and reports them', () => {
  const parsed = {
    SheetNames: ['Data'],
    Sheets: { Data: { A1: { t: 'n', f: 'MYSTERY(1)' }, '!ref': 'A1' } }
  };

  const report = Office.fillMissingFormulaResults(parsed);

  assert.deepEqual(report, { calculated: 0, unavailable: 1 });
  assert.equal(parsed.Sheets.Data.A1.f, 'MYSTERY(1)');
  assert.equal(parsed.Sheets.Data.A1.v, '=MYSTERY(1)');
  assert.equal(parsed.Sheets.Data.A1.t, 's');
  assert.equal(parsed.Sheets.Data.A1.w, '=MYSTERY(1)');
});

test('SheetJS formula-cache repair declines unsafe ranges and oversized sheet sets', () => {
  const hugeRange = {
    SheetNames: ['Data'],
    Sheets: { Data: { A1: { t: 'n', f: 'SUM(B1:B2)' }, '!ref': 'A1:XFD1048576' } }
  };
  const hugeReport = Office.fillMissingFormulaResults(hugeRange);
  assert.deepEqual(hugeReport, { calculated: 0, unavailable: 1 });
  assert.equal(hugeRange.Sheets.Data.A1.v, '=SUM(B1:B2)');

  const manySheets = { SheetNames: [], Sheets: {} };
  for (let index = 0; index < 33; index += 1) {
    const name = `Sheet${index + 1}`;
    manySheets.SheetNames.push(name);
    manySheets.Sheets[name] = { A1: index === 0 || index === 32 ? { t: 'n', f: '1+1' } : { t: 'n', v: index }, '!ref': 'A1' };
  }
  const sheetsReport = Office.fillMissingFormulaResults(manySheets);
  assert.deepEqual(sheetsReport, { calculated: 0, unavailable: 2 });
  assert.equal(manySheets.Sheets.Sheet1.A1.v, '=1+1');
  assert.equal(manySheets.Sheets.Sheet33.A1.v, '=1+1');
});

test('PPTX export creates a standards-shaped PowerPoint package and losslessly reimports Sutra decks', async () => {
  const deck = {
    version: 2,
    title: 'Biology review',
    size: 'widescreen',
    theme: 'sutra',
    slides: [{
      id: 'slide-1',
      title: 'Cell structure',
      background: '#FFFFFF',
      speakerNotes: 'Explain the diagram before the table.',
      elements: [
        { id: 'title', type: 'text', text: 'Cell structure', x: 8, y: 8, width: 80, height: 14, fontSize: 6, fontWeight: 'bold', color: '#173D2B' },
        { id: 'table', type: 'table', rows: [['Part', 'Role'], ['Nucleus', 'DNA']], text: 'Part\tRole\nNucleus\tDNA', x: 10, y: 30, width: 50, height: 30 },
        { id: 'chart', type: 'chart', chart: { labels: ['A', 'B'], values: [3, 7] }, x: 65, y: 30, width: 25, height: 35 }
      ]
    }]
  };
  const blob = await Office.exportPptx(deck);
  const bytes = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file('ppt/presentation.xml'));
  assert.ok(zip.file('ppt/slideMasters/slideMaster1.xml'));
  assert.ok(zip.file('ppt/slideLayouts/slideLayout1.xml'));
  assert.ok(zip.file('ppt/theme/theme1.xml'));
  assert.ok(zip.file('ppt/slides/slide1.xml'));
  assert.ok(zip.file('ppt/sutra-deck.json'));
  assert.match(await zip.file('ppt/presentation.xml').async('text'), /presentationml\/2006\/main/);
  assert.match(await zip.file('ppt/slides/slide1.xml').async('text'), /Cell structure/);
  const imported = await Office.importPptx(bytes);
  assert.deepEqual(imported.deck, deck);
  assert.deepEqual(imported.report.warnings, []);
});

test('macro-enabled Office packages fail explicitly', async () => {
  const zip = new JSZip();
  zip.file('xl/vbaProject.bin', new Uint8Array([1, 2, 3]));
  const blob = await zip.generateAsync({ type: 'blob' });
  const bytes = await blob.arrayBuffer();
  await assert.rejects(() => Office.importXlsx(bytes), /Macro-enabled workbooks are not supported/);
});

test('macro-enabled PowerPoint packages fail explicitly', async () => {
  const zip = new JSZip();
  zip.file('ppt/vbaProject.bin', new Uint8Array([1, 2, 3]));
  const bytes = await (await zip.generateAsync({ type: 'blob' })).arrayBuffer();
  await assert.rejects(() => Office.importPptx(bytes), /Macro-enabled presentations are not supported/);
});

test('Office imports reject oversized files and suspicious ZIP expansion before parsing content', () => {
  assert.throws(
    () => Office._test.validateOfficeInput({ byteLength: (25 * 1024 * 1024) + 1 }),
    /25 MB or smaller/
  );
  assert.throws(
    () => Office._test.validateOfficePackage({
      files: { 'xl/workbook.xml': { _data: { uncompressedSize: (100 * 1024 * 1024) + 1 } } }
    }),
    /100 MB safety limit/
  );
  const files = {};
  for (let index = 0; index < 2501; index += 1) files[`part-${index}.xml`] = { _data: { uncompressedSize: 1 } };
  assert.throws(() => Office._test.validateOfficePackage({ files }), /too many parts/);
});
