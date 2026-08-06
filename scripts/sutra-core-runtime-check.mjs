#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCoreRuntime } from './lib/core-runtime-integrity.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const explicitPath = process.argv.find((arg) => arg.startsWith('--app='));
const appPath = explicitPath
  ? resolve(repoRoot, explicitPath.slice('--app='.length))
  : resolve(repoRoot, 'src/core/app.js');
const result = checkCoreRuntime({ appPath });

console.log('Core runtime integrity check');
console.log('----------------------------');
console.log(`  source: ${result.appPath}`);
console.log(`  size:   ${result.bytes} bytes / ${result.lines} lines`);

if (!result.ok) {
  result.failures.forEach((failure) => console.error(`  FAIL ${failure}`));
  console.error(`\nCore runtime integrity check FAILED (${result.failures.length} issue${result.failures.length === 1 ? '' : 's'}).`);
  process.exit(1);
}

console.log(`Core runtime integrity check passed (${result.passes.length} assertions).`);
