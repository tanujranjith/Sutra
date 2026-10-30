import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { getDeployPathProblem } from '../../scripts/lib/deploy-path-policy.mjs';
import { extractFunction } from '../helpers/extract-function.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'sutra-deploy-path-'));
  t.after(() => {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('sutra-deploy-path-')) throw new Error('Unexpected cleanup target');
    rmSync(root, { recursive: true, force: true });
  });
  const outside = join(root, 'outside'), checkout = join(root, 'checkout');
  mkdirSync(outside); mkdirSync(checkout);
  return { outside, checkout, linkType: process.platform === 'win32' ? 'junction' : 'dir' };
}

test('deployment policy keeps runtime assets and vendor licenses', () => {
  for (const path of ['Sutra.html', 'oauth-callback.html', 'LICENSE', 'src/config/asset-manifest.generated.json',
    'src/core/app.js', 'styles/base/styles.css', 'assets/brand/sutra/generated/favicon.ico', 'assets/marketing/screenshots/home.png',
    'assets/vendor/pdfjs/build/pdf.min.mjs', 'assets/vendor/pdfjs/cmaps/78-EUC-H.bcmap', 'assets/vendor/fonts/FoxitSerif.pfb',
    'assets/vendor/fonts/local.woff2', 'assets/vendor/editor/LICENSE.md', 'assets/vendor/office/LICENSE.mammoth',
    'assets/vendor/office/LICENSE.sheetjs', 'assets/vendor/pdfjs/LICENSE_FOXIT']) assert.equal(getDeployPathProblem(path), null, path);
  for (const path of ['assets', 'assets/brand', 'assets/brand/sutra', 'assets/vendor', 'src/core']) assert.equal(getDeployPathProblem(path, { isDirectory: true }), null, path);
});

test('deployment policy rejects nested local/development files and links', () => {
  for (const path of ['../Sutra.html', '/Sutra.html', 'C:\\private\\Sutra.html', 'src/.env', 'src/.git/config',
    'assets/vendor/.credentials/token.json', 'assets/vendor/secret.pem', 'assets/vendor/vault.key', 'assets/vendor/backup.sqlite',
    'assets/vendor/package.json', 'assets/vendor/src.map', 'assets/vendor/noteflow-classic/index.html', 'src/tests/helper.js',
    'assets/vendor/node_modules/index.js', 'src/core/app.spec.mjs', 'src/core/app.test.js', 'src/core/mock-fixture.js',
    'src/README.md', 'assets/vendor/VENDORED_DEPENDENCIES.md', 'AGENTS.md', 'unrelated.html']) assert.ok(getDeployPathProblem(path), path);
  assert.equal(getDeployPathProblem('Sutra.html', { isSymbolicLink: true }), 'symbolic link');
  assert.equal(getDeployPathProblem('assets/vendor', { isDirectory: true, isSymbolicLink: true }), 'symbolic link');
});

test('builder rejects a linked ancestor before inspecting its contents', t => {
  const { outside, checkout, linkType } = fixture(t);
  writeFileSync(join(outside, 'private.js'), 'QA_ONLY_PRIVATE_SOURCE');
  symlinkSync(outside, join(checkout, 'src'), linkType);
  const build = readFileSync(new URL('../../scripts/build-deploy-artifact.mjs', import.meta.url), 'utf8');
  const declaration = extractFunction(build, 'assertPlainSourcePath');
  assert.ok(declaration);
  const seen = [];
  const inspect = path => { seen.push(path); return lstatSync(path, { throwIfNoEntry: false }); };
  const check = new Function('repoRoot', 'join', 'lstatSync', 'fail', declaration.body + '; return assertPlainSourcePath;')(
    checkout, join, inspect, message => { throw new Error(message); }
  );
  assert.throws(() => check('src/private.js'), /symbolic source path/);
  assert.deepEqual(seen, [join(checkout, 'src')]);
});

test('builder and verifier reject a linked artifact root without reading or removing its target', t => {
  const { outside, checkout, linkType } = fixture(t);
  const privateFile = join(outside, 'Sutra.html');
  writeFileSync(privateFile, 'QA_ONLY_PRIVATE_ARTIFACT');
  symlinkSync(outside, join(checkout, '.deploy'), linkType);
  for (const script of ['build-deploy-artifact.mjs', 'sutra-deploy-artifact-check.mjs']) {
    const tool = fileURLToPath(new URL('../../scripts/' + script, import.meta.url));
    const result = spawnSync(process.execPath, [tool], { cwd: checkout, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.status, 1, script);
    assert.match(result.stderr, /\.deploy.*plain directory/, script);
    assert.doesNotMatch(result.stdout + result.stderr, /QA_ONLY_PRIVATE_ARTIFACT/, script);
    assert.equal(lstatSync(join(checkout, '.deploy')).isSymbolicLink(), true);
    assert.equal(readFileSync(privateFile, 'utf8'), 'QA_ONLY_PRIVATE_ARTIFACT');
  }
});
