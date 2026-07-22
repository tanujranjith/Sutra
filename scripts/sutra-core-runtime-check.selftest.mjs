#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkCoreRuntime } from './lib/core-runtime-integrity.mjs';

const sourcePath = resolve('src/core/app.js');
const source = readFileSync(sourcePath, 'utf8');
const tempRoot = mkdtempSync(join(tmpdir(), 'sutra-runtime-check-'));
const failures = [];

function expectRejected(name, mutate, expectedFailure) {
  const path = join(tempRoot, `${name}.js`);
  const mutated = mutate(source);
  if (mutated === source) {
    failures.push(`${name}: mutation did not change the fixture`);
    return;
  }
  writeFileSync(path, mutated, 'utf8');
  const result = checkCoreRuntime({ appPath: path });
  if (result.ok) failures.push(`${name}: corrupted fixture was accepted`);
  if (!result.failures.some((item) => expectedFailure.test(item))) {
    failures.push(`${name}: expected failure ${expectedFailure}, got ${result.failures.join(' | ')}`);
  }
}

try {
  const baseline = checkCoreRuntime({ appPath: sourcePath });
  if (!baseline.ok) failures.push(`baseline failed: ${baseline.failures.join(' | ')}`);

  expectRejected(
    'syntax-corruption',
    (text) => text.replace('const orderedTopLevelPages = [', 'const orderedTopLevelPages = [)'),
    /parser rejected/
  );
  expectRejected(
    'cross-section-splice',
    (text) => text.replace(
      "if (page.theme && page.theme !== 'default') {",
      "if (page.theme && page.theme !== 'default') {\n             \"g readable from script. Opt-in only"
    ),
    /parser rejected/
  );
  expectRejected(
    'truncation',
    (text) => text.slice(0, Math.floor(text.length * 0.7)),
    /parser rejected|unexpectedly small|unexpectedly short/
  );
  expectRejected(
    'missing-persistence',
    (text) => text.replace('function serializeWorkspace(', 'function serializeWorkspaceRemoved('),
    /workspace serializer is missing/
  );
  expectRejected(
    'missing-sync-bridge',
    (text) => text.replace('window.SutraSync = {', 'window.SutraSyncRemoved = {'),
    /Sync public bridge is missing/
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

if (failures.length) {
  failures.forEach((failure) => console.error(`  FAIL ${failure}`));
  console.error(`Core runtime integrity self-test FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}).`);
  process.exit(1);
}

console.log('Core runtime integrity self-test passed — syntax, persistence, and Sync corruption were rejected.');
