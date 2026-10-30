#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const files = ['.github/workflows/ci.yml', '.github/workflows/deploy.yml'];
const failures = [];
const texts = Object.fromEntries(files.map((file) => [file, readFileSync(file, 'utf8')]));
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const expectedNodeVersion = '24';
const expectedNodeRange = '>=24 <25';

if (packageJson.engines?.node !== expectedNodeRange) {
  failures.push(`package.json: Node engine must be ${expectedNodeRange}`);
}

for (const [file, source] of Object.entries(texts)) {
  for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)) {
    const action = match[1];
    if (!/@[a-f0-9]{40}$/i.test(action)) failures.push(`${file}: action is not pinned to a 40-character commit SHA: ${action}`);
  }
  if (!/concurrency:[\s\S]*cancel-in-progress:\s*true/.test(source)) failures.push(`${file}: superseded runs are not cancelled`);
  if (!/cache:\s*npm/.test(source)) failures.push(`${file}: npm dependency cache is not configured`);
  const nodeVersion = source.match(/^\s+NODE_VERSION:\s*["']?(\d+)["']?\s*$/m)?.[1];
  if (nodeVersion !== expectedNodeVersion) failures.push(`${file}: NODE_VERSION must be ${expectedNodeVersion}`);
  if (!source.includes('node-version: ${{ env.NODE_VERSION }}')) failures.push(`${file}: setup-node must use the declared NODE_VERSION`);
}

function readIncludedMatrixRows(job) {
  const includeIndex = job.indexOf('        include:');
  if (includeIndex < 0) return [];
  const matrixBlock = job.slice(includeIndex + '        include:'.length);
  const stepsIndex = matrixBlock.search(/^    steps:/m);
  const includeBlock = stepsIndex < 0 ? matrixBlock : matrixBlock.slice(0, stepsIndex);
  return includeBlock
    .split(/(?=^          - (?:label|id):)/m)
    .filter((row) => /^          - (?:label|id):/m.test(row));
}

function matrixValue(row, key) {
  return row.match(new RegExp(`^\\s+(?:-\\s+)?${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() || '';
}

function matrixProjectNames(row) {
  return [...matrixValue(row, 'project_args').matchAll(/--project=([a-z-]+)/g)].map((match) => match[1]);
}

function checkResponsiveProjects(file, rows) {
  const responsiveRows = rows.filter((row) => matrixValue(row, 'id') === 'responsive');
  if (responsiveRows.length !== 1) {
    failures.push(`${file}: browser matrix must contain exactly one complete responsive lane`);
    return;
  }

  const expected = ['mobile-chromium', 'mobile-webkit', 'tablet', 'narrow-desktop'];
  const actual = matrixProjectNames(responsiveRows[0]);
  if (actual.length !== expected.length || actual.some((project, index) => project !== expected[index])) {
    failures.push(`${file}: responsive lane must retain ${expected.map((project) => `--project=${project}`).join(' ')}`);
  }
}

const ci = texts['.github/workflows/ci.yml'];
if (!/SUTRA_SERVE_ROOT:\s*\.deploy/.test(ci)) failures.push('ci.yml: browser tests do not serve the generated artifact');
if (!/download-artifact@[a-f0-9]{40}/i.test(ci)) failures.push('ci.yml: browser jobs do not download the build job artifact');
if (!/failure\(\)[\s\S]*playwright/i.test(ci)) failures.push('ci.yml: Playwright failure diagnostics are not retained');

const ciBrowserJob = ci.split(/^  browser-tests:/m)[1]?.split(/^  browser-compatibility-matrix:/m)[0] || '';
if (!ciBrowserJob.includes('shard: [1, 2, 3]') || !ciBrowserJob.includes('--shard=${{ matrix.shard }}/${{ strategy.job-total }}')) {
  failures.push('ci.yml: normal Chromium coverage is not split into parallel verified-artifact shards');
}
if (!ciBrowserJob.includes('playwright-chromium-failure-${{ github.sha }}-${{ matrix.shard }}')) {
  failures.push('ci.yml: Chromium shard failure diagnostics need unique artifact names');
}
if (!ci.includes('PLAYWRIGHT_BROWSERS_PATH: ${{ runner.temp }}/ms-playwright')) {
  failures.push('ci.yml: Playwright browser path is not pinned to the runner temp directory');
}
if (!ci.includes('browser_install:') || !ci.includes('npx playwright install --with-deps ${{ matrix.browser_install }}')) {
  failures.push('ci.yml: compatibility lanes install a fixed browser set instead of their matrix browser set');
}
const ciCompatibilityJob = ci.split(/^  browser-compatibility-matrix:/m)[1] || '';
const ciCompatibilityRows = readIncludedMatrixRows(ciCompatibilityJob);
if (ciCompatibilityRows.length !== 13) failures.push('ci.yml: compatibility matrix must contain twelve desktop shards and one responsive lane');
const desktopProjects = {
  chrome: { project: 'chrome', label: 'Desktop Chrome', total: '3', shards: ['1', '2', '3'] },
  firefox: { project: 'firefox', label: 'Desktop Firefox', total: '3', shards: ['1', '2', '3'] },
  webkit: { project: 'webkit', label: 'Desktop WebKit', total: '6', shards: ['1', '2', '3', '4', '5', '6'] }
};
for (const [engine, expected] of Object.entries(desktopProjects)) {
  const engineRows = ciCompatibilityRows.filter((row) => matrixValue(row, 'id') === engine);
  const shards = engineRows.map((row) => matrixValue(row, 'shard')).sort();
  if (engineRows.length !== expected.shards.length || shards.join(',') !== expected.shards.join(',')) {
    failures.push(`ci.yml: ${engine} compatibility coverage must contain each expected shard exactly once`);
  }
  if (engineRows.some((row) => matrixValue(row, 'shard_total') !== expected.total)) {
    failures.push(`ci.yml: ${engine} compatibility shards must declare total ${expected.total}`);
  }
  if (engineRows.some((row) => matrixValue(row, 'label') !== `${expected.label} shard ${matrixValue(row, 'shard')}`)) {
    failures.push(`ci.yml: ${engine} compatibility shard labels must match their shard numbers`);
  }
  if (engineRows.some((row) => matrixValue(row, 'project_args') !== `--project=${expected.project}` || matrixValue(row, 'browser_install') !== expected.project)) {
    failures.push(`ci.yml: ${engine} shards must all test and install the ${expected.project} browser project`);
  }
}
checkResponsiveProjects('ci.yml', ciCompatibilityRows);
const ciResponsiveRow = ciCompatibilityRows.find((row) => matrixValue(row, 'id') === 'responsive');
if (ciResponsiveRow && (matrixValue(ciResponsiveRow, 'shard') !== 'full' || matrixValue(ciResponsiveRow, 'shard_total') !== 'full')) {
  failures.push('ci.yml: responsive compatibility coverage must remain an unsharded full lane');
}
if (!ciCompatibilityJob.includes('--shard=${{ matrix.shard }}/${{ matrix.shard_total }}') || !ciCompatibilityJob.includes('--workers=1')) {
  failures.push('ci.yml: desktop compatibility shards must use their declared totals and run serially');
}
if (!ciCompatibilityJob.includes("key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-${{ matrix.id }}")) {
  failures.push('ci.yml: compatibility browser cache must be shared by engine across its shards');
}
if (!ciCompatibilityJob.includes('playwright-compatibility-failure-${{ github.sha }}-${{ matrix.id }}-${{ matrix.shard }}')) {
  failures.push('ci.yml: compatibility shard failure diagnostics need unique artifact names');
}
if (Object.values(texts).some((source) => source.includes('~/.cache/ms-playwright'))) {
  failures.push('workflows: Playwright cache still uses the ineffective literal ~/.cache/ms-playwright path');
}

const deploy = texts['.github/workflows/deploy.yml'];
const deployJob = deploy.split(/^  deploy:/m)[1]?.split(/^  live-smoke:/m)[0] || '';
const browserJob = deploy.split(/^  browser-tests:/m)[1]?.split(/^  package-pages:/m)[0] || '';
const deployMatrixRows = readIncludedMatrixRows(browserJob);
const packageJob = deploy.split(/^  package-pages:/m)[1]?.split(/^  deploy:/m)[0] || '';
if (!/needs:\s*release-gate/.test(browserJob) || !/--workers=1/.test(browserJob)) failures.push('deploy.yml: browser lanes must depend on the build and run serially');
if (!browserJob.includes('browser_install:') || !browserJob.includes('npx playwright install --with-deps ${{ matrix.browser_install }}')) {
  failures.push('deploy.yml: browser lanes install a fixed browser set instead of their matrix browser set');
}
if (!browserJob.includes('path: ${{ runner.temp }}/ms-playwright')) {
  failures.push('deploy.yml: Playwright cache is not stored in the runner temp directory');
}
for (const project of ['chromium', 'chrome', 'firefox', 'webkit', 'mobile-chromium', 'mobile-webkit', 'tablet', 'narrow-desktop']) {
  if (!new RegExp(`--project=${project}(?=\\s|$)`).test(browserJob)) failures.push(`deploy.yml: missing browser project ${project}`);
}
checkResponsiveProjects('deploy.yml', deployMatrixRows);
for (const [label, job] of [['browser', browserJob], ['packaging', packageJob]]) {
  if (!/download-artifact@[a-f0-9]{40}/i.test(job) || !/name:\s*deploy-candidate-\$\{\{ github.sha \}\}/.test(job)) failures.push(`deploy.yml: ${label} must download the original candidate artifact`);
  if (/build:deploy/.test(job)) failures.push(`deploy.yml: ${label} must not rebuild the candidate`);
}
if (!/needs:\s*\[release-gate, browser-tests\]/.test(packageJob) || /^\s+if:/m.test(packageJob)) failures.push('deploy.yml: Pages packaging must require all release checks to succeed');
if (!/needs:\s*package-pages/.test(deployJob)) failures.push('deploy.yml: deploy must depend on verified Pages packaging');
if (/checkout|build:deploy|npm\s/.test(deployJob)) failures.push('deploy.yml: deploy job rebuilds or checks out instead of using the verified Pages artifact');
if (!/SUTRA_SERVE_ROOT:\s*\.deploy/.test(deploy)) failures.push('deploy.yml: release gate does not browser-test .deploy');
if (!/upload-pages-artifact@[a-f0-9]{40}/i.test(deploy)) failures.push('deploy.yml: verified artifact is not uploaded to Pages');
if (!/permissions:\s*\n\s+pages:\s*write\s*\n\s+id-token:\s*write/.test(deployJob)) failures.push('deploy.yml: deploy permissions are missing or not job-scoped');

if (failures.length) {
  failures.forEach((failure) => console.error('FAIL', failure));
  process.exit(1);
}
console.log('Workflow check passed — immutable actions, cached dependencies, exact-artifact browser tests, and no deploy rebuild.');
