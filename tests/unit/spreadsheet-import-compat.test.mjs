import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const require = createRequire(import.meta.url);
const XLSX = require('../../assets/vendor/office/xlsx.full.min.js');
require('../../src/features/workspace/sheets-engine.js');
const Office = require('../../src/features/workspace/office-interoperability.js');
const JSZip = require('jszip');
const coreSource = await readFile(new URL('../../src/core/app.js', import.meta.url), 'utf8');

function compileCoreFunction(name, bindings = {}) {
  const extracted = extractFunction(coreSource, name);
  assert.ok(extracted, `Expected to find ${name} in src/core/app.js`);
  const bindingNames = Object.keys(bindings);
  const prefix = coreSource.includes(`async function ${name}(`) ? 'async ' : '';
  return new Function(...bindingNames, `return (${prefix}${extracted.body});`)(...bindingNames.map(key => bindings[key]));
}

function createSpreadsheetFixture({ omitFormulaCache = false } = {}) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Quiz &amp; Review &lt;Unit&gt;" sheetId="1" r:id="rId1"/>
    <sheet name="Second Sheet" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`);
  zip.file('xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">
  <si><t xml:space="preserve">&lt;b&gt;literal&lt;/b&gt;</t></si>
  <si><t>Score</t></si>
  <si><t>Recorded</t></si>
  <si><t>Text on the second sheet</t></si>
</sst>`);
  zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
      <c r="C1" t="s"><v>2</v></c>
    </row>
    <row r="2">
      <c r="A2" t="n"><v>12.5</v></c>
      <c r="B2" t="n"><f>A2*2</f>${omitFormulaCache ? '' : '<v>25</v>'}</c>
      <c r="C2" s="1" t="n"><v>45292</v></c>
    </row>
  </sheetData>
</worksheet>`);
  zip.file('xl/worksheets/sheet2.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData><row r="1"><c r="A1" t="s"><v>3</v></c></row></sheetData>
</worksheet>`);
  return zip.generateAsync({ type: 'uint8array' });
}

test('spreadsheet importer uses the pinned local parser and renders ordinary OOXML content', async () => {
  const bytes = await createSpreadsheetFixture();
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const loaderCalls = [];
  const loadExternalScript = async (...args) => {
    loaderCalls.push(args);
    return XLSX;
  };
  const readFileAsArrayBuffer = compileCoreFunction('readFileAsArrayBuffer');
  const escapeHtml = compileCoreFunction('escapeHtml');
  const importSpreadsheetFile = compileCoreFunction('importSpreadsheetFile', {
    loadExternalScript,
    readFileAsArrayBuffer,
    escapeHtml,
    window: { SutraOfficeInterop: Office }
  });

  assert.equal(XLSX.version, '0.20.3');
  const html = await importSpreadsheetFile({ arrayBuffer: async () => arrayBuffer });

  assert.deepEqual(loaderCalls, [[
    'assets/vendor/office/xlsx.full.min.js?v=0.20.3',
    'XLSX',
    { local: true }
  ]]);
  assert.match(html, /<h3>Quiz &amp; Review &lt;Unit&gt;<\/h3>/);
  assert.match(html, /<h3>Second Sheet<\/h3>/);
  assert.match(html, /&lt;b&gt;literal&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>literal<\/b>/);
  assert.match(html, />12\.5</);
  assert.match(html, />25</);
  assert.match(html, />2024-01-01</);
  assert.match(html, /Text on the second sheet/);
});

test('general note import calculates an uncached formula instead of showing a blank cell', async () => {
  const bytes = await createSpreadsheetFixture({ omitFormulaCache: true });
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const importSpreadsheetFile = compileCoreFunction('importSpreadsheetFile', {
    loadExternalScript: async () => XLSX,
    readFileAsArrayBuffer: compileCoreFunction('readFileAsArrayBuffer'),
    escapeHtml: compileCoreFunction('escapeHtml'),
    window: { SutraOfficeInterop: Office }
  });
  const html = await importSpreadsheetFile({ arrayBuffer: async () => arrayBuffer });
  assert.match(html, />25</);
  assert.match(html, /Missing formula results were calculated locally/);
  assert.match(html, /static snapshot/);
  assert.match(html, /&lt;b&gt;literal&lt;\/b&gt;/);
});
