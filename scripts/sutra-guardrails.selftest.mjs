#!/usr/bin/env node
/*
 * sutra-guardrails.selftest.mjs — proves the guardrail scanners actually fire
 * on intentionally-unsafe fixtures (and correctly honor the allow-markers).
 * Required by the hardening spec: "the new guardrails fail on intentionally
 * unsafe test fixtures."
 *
 * This exercises the pure scanner lib directly, so it never touches the real
 * source tree and cannot be defeated by baseline drift.
 */
import {
  scanSinks,
  scanStorage,
  scanWindowGlobals,
  extractWorkspaceFields
} from './lib/guardrail-scan.mjs';

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    console.error(`  FAIL ${label}`);
    failures += 1;
  }
}

console.log('Guardrail scanner self-test');
console.log('---------------------------');

// 1) Unsafe DOM sinks are detected.
const hostileDom = [
  'el.innerHTML = userTitle;',
  'node.outerHTML = markup;',
  'host.insertAdjacentHTML("beforeend", payload);',
  'document.write(injected);',
  'win.document.writeln(injected);'
].join('\n');
const domScan = scanSinks(hostileDom);
assert(domScan.total === 5, `detects 5 unsafe DOM sinks (got ${domScan.total})`);
assert(domScan.byKey.innerHTML === 1, 'classifies innerHTML');
assert(domScan.byKey.outerHTML === 1, 'classifies outerHTML');
assert(domScan.byKey.insertAdjacentHTML === 1, 'classifies insertAdjacentHTML');
assert(domScan.byKey['document.write'] === 2, 'classifies document.write/writeln');

// 2) The allow-marker suppresses a reviewed line.
const annotatedDom = 'el.innerHTML = STATIC_TEMPLATE; // sutra-allow-html: developer markup';
assert(scanSinks(annotatedDom).total === 0, 'sutra-allow-html marker suppresses the sink');

// 3) Direct storage writes are detected.
const hostileStorage = [
  'localStorage.setItem("k", v);',
  'sessionStorage.setItem("k", v);',
  'localStorage["k"] = v;'
].join('\n');
const storageScan = scanStorage(hostileStorage);
assert(storageScan.total === 3, `detects 3 direct storage writes (got ${storageScan.total})`);
assert(
  scanStorage('localStorage.setItem("k", v); // sutra-allow-storage: intentional').total === 0,
  'sutra-allow-storage marker suppresses the write'
);

// 4) window.* global assignments are collected; comparisons are NOT.
const globals = scanWindowGlobals([
  'window.NewFeature = {};',
  "window['BracketGlobal'] = 1;",
  'if (window.NotAGlobal === 2) {}',
  'window.Other == 3;'
].join('\n'));
assert(globals.has('NewFeature'), 'collects window.NewFeature');
assert(globals.has('BracketGlobal'), "collects window['BracketGlobal']");
assert(!globals.has('NotAGlobal'), 'ignores === comparison');
assert(!globals.has('Other'), 'ignores == comparison');

// 5) Workspace-field extraction picks up persisted + exported fields.
const fakeApp = `
function persistAppData() {
  appData.pages = pages;
  appData.brandNewField = thing;
}
function buildWorkspaceExportPayload(options = {}) {
  if (mode === 'json') {
    const jsonPayload = {
      pages: payload.pages,
      brandNewField: payload.brandNewField,
      exportedAt
    };
    return jsonPayload;
  }
}
`;
const fields = extractWorkspaceFields(fakeApp);
assert(fields.persistFields.includes('brandNewField'), 'extracts persisted field');
assert(fields.exportFields.includes('brandNewField'), 'extracts exported field');

console.log('');
if (failures) {
  console.error(`Self-test FAILED (${failures} assertion${failures === 1 ? '' : 's'}).`);
  process.exit(1);
}
console.log('Guardrail scanner self-test passed (all detectors fire on hostile fixtures).');
