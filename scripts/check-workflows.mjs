#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const files = ['.github/workflows/ci.yml', '.github/workflows/deploy.yml'];
const failures = [];
const texts = Object.fromEntries(files.map((file) => [file, readFileSync(file, 'utf8')]));

for (const [file, source] of Object.entries(texts)) {
  for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)) {
    const action = match[1];
    if (!/@[a-f0-9]{40}$/i.test(action)) failures.push(`${file}: action is not pinned to a 40-character commit SHA: ${action}`);
  }
  if (!/concurrency:[\s\S]*cancel-in-progress:\s*true/.test(source)) failures.push(`${file}: superseded runs are not cancelled`);
  if (!/cache:\s*npm/.test(source)) failures.push(`${file}: npm dependency cache is not configured`);
}

const ci = texts['.github/workflows/ci.yml'];
if (!/SUTRA_SERVE_ROOT:\s*\.deploy/.test(ci)) failures.push('ci.yml: browser tests do not serve the generated artifact');
if (!/download-artifact@[a-f0-9]{40}/i.test(ci)) failures.push('ci.yml: browser jobs do not download the build job artifact');
if (!/failure\(\)[\s\S]*playwright/i.test(ci)) failures.push('ci.yml: Playwright failure diagnostics are not retained');

const deploy = texts['.github/workflows/deploy.yml'];
const deployJob = deploy.split(/^  deploy:/m)[1]?.split(/^  live-smoke:/m)[0] || '';
if (/checkout|build:deploy|npm\s/.test(deployJob)) failures.push('deploy.yml: deploy job rebuilds or checks out instead of using the verified Pages artifact');
if (!/SUTRA_SERVE_ROOT:\s*\.deploy/.test(deploy)) failures.push('deploy.yml: release gate does not browser-test .deploy');
if (!/upload-pages-artifact@[a-f0-9]{40}/i.test(deploy)) failures.push('deploy.yml: verified artifact is not uploaded to Pages');
if (!/permissions:\s*\n\s+pages:\s*write\s*\n\s+id-token:\s*write/.test(deployJob)) failures.push('deploy.yml: deploy permissions are missing or not job-scoped');

if (failures.length) {
  failures.forEach((failure) => console.error('FAIL', failure));
  process.exit(1);
}
console.log('Workflow check passed — immutable actions, cached dependencies, exact-artifact browser tests, and no deploy rebuild.');
