#!/usr/bin/env node
/**
 * build-deploy-artifact.mjs
 *
 * Stages a clean, allowlisted GitHub Pages production artifact under .deploy/.
 *
 * Why: the previous deploy workflow uploaded the entire repository root
 * (`path: "."`), shipping tests, scripts, internal docs, .github, package
 * metadata, legacy pages, and unreferenced assets to production. This script
 * copies ONLY the runtime surface, preserving relative paths so the live app
 * loads identically to local `npm run serve`.
 *
 * Guarantees:
 *  - .deploy/ is removed and rebuilt from scratch every run (deterministic).
 *  - Only allowlisted files/dirs are copied (deny-by-default).
 *  - The build FAILS if a required runtime entry point is missing from source.
 *  - No dev-only content (.git, .github, node_modules, tests, scripts, docs,
 *    examples, package metadata, legacy NoteFlow pages, stale assets) is copied.
 *
 * Verification of the staged result is a separate step: scripts/sutra-deploy-artifact-check.mjs.
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { assertCoreRuntimeIntegrity } from './lib/core-runtime-integrity.mjs';
import { getDeployPathProblem } from './lib/deploy-path-policy.mjs';

const repoRoot = resolve(process.cwd());
const outDir = join(repoRoot, '.deploy');

function assertPlainSourcePath(relPath) {
  // lstat on the final file still follows linked ancestors. Check from the
  // trusted checkout root outward before reading/copying an allowlisted path.
  let source = repoRoot;
  for (const component of relPath.split(/[\\/]/)) {
    if (!component || component === '.' || component === '..') fail(`invalid source path: ${relPath}`);
    source = join(source, component);
    const info = lstatSync(source, { throwIfNoEntry: false });
    if (!info) fail(`missing source path: ${relPath}`);
    if (info.isSymbolicLink()) fail(`symbolic source path: ${relPath}`);
  }
}

const outputInfo = lstatSync(outDir, { throwIfNoEntry: false });
if (outputInfo && (outputInfo.isSymbolicLink() || !outputInfo.isDirectory())) {
  fail('existing .deploy must be a plain directory; nothing was removed.');
}
assertPlainSourcePath('src/core/app.js');

try {
  assertCoreRuntimeIntegrity({ appPath: join(repoRoot, 'src/core/app.js') });
} catch (error) {
  console.error(error.message);
  console.error('build:deploy FAILED — existing .deploy artifact was preserved.');
  process.exit(1);
}

assertPlainSourcePath('src/config/asset-manifest.generated.json');
const assetManifest = JSON.parse(readFileSync(join(repoRoot, 'src/config/asset-manifest.generated.json'), 'utf8'));

/**
 * Allowlist of runtime files and directories, relative to the repo root.
 * `filterExt` (optional) restricts a directory copy to specific extensions.
 */
const FILES = [
  'index.html',
  'HomePage.html',
  'Sutra.html',
  '404.html',
  'oauth-callback.html', // OAuth popup redirect target for Sutra Cloud backup providers
  'manifest.webmanifest',
  'robots.txt', // SEO: allows crawling + points at the sitemap
  'sitemap.xml', // SEO: canonical public URLs for search engines
  'sw.js',
  'LICENSE' // HomePage.html footer links to ./LICENSE (Apache 2.0)
];

const DIRS = [
  { path: 'styles', filterExt: ['.css'] },
  { path: 'src', excludeReadmes: true }, // runtime JS + generated data modules, not contributor docs
  { path: 'assets/brand/sutra/generated' }, // icons, favicon, social preview
  { path: 'assets/vendor', excludeReadmes: true }, // vendored runtime + licenses, not contributor docs
  { path: 'assets/screenshots' } // marketing screenshots used by HomePage.html
];

/**
 * Required runtime entry points. If any of these are missing from the SOURCE
 * tree the build aborts — we never want to publish a half-broken artifact.
 */
const REQUIRED_SOURCE = [...new Set([
  'index.html',
  'HomePage.html',
  'Sutra.html',
  '404.html',
  'oauth-callback.html',
  'manifest.webmanifest',
  'robots.txt',
  'sitemap.xml',
  'src/core/app.js',
  'assets/brand/sutra/generated/favicon.ico',
  'assets/brand/sutra/generated/social-preview.png',
  'assets/vendor/jszip/jszip.min.js',
  'assets/vendor/office/mammoth.browser.min.js',
  'assets/vendor/office/xlsx.full.min.js',
  'sw.js',
  ...assetManifest.critical.map((asset) => asset.replace(/^\.\//, '').replace(/[?#].*$/, '')),
  ...assetManifest.optional.map((asset) => asset.replace(/^\.\//, '').replace(/[?#].*$/, '')),
  ...assetManifest.lazy.map((asset) => asset.replace(/^\.\//, '').replace(/[?#].*$/, ''))
])];

function fail(message) {
  console.error(`build:deploy FAILED — ${message}`);
  process.exit(1);
}

function countFiles(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countFiles(full);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(full).size;
    }
  }
  return { files, bytes };
}

// 0. Pre-flight: required source assets must exist.
const missingSource = REQUIRED_SOURCE.filter((p) => !existsSync(join(repoRoot, p)));
if (missingSource.length) {
  fail(`missing required source asset(s): ${missingSource.join(', ')}`);
}
for (const relPath of new Set([...REQUIRED_SOURCE, ...FILES.filter(file => existsSync(join(repoRoot, file))), ...DIRS.map(dir => dir.path)])) {
  assertPlainSourcePath(relPath);
}

// 1. Clean slate.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 2. Copy allowlisted top-level files.
let copiedFiles = 0;
for (const file of FILES) {
  const from = join(repoRoot, file);
  if (!existsSync(from)) {
    // LICENSE-class files are optional-but-expected; entry points are enforced above.
    console.warn(`  (skip) ${file} not found in source`);
    continue;
  }
  const to = join(outDir, file);
  assertPlainSourcePath(file);
  const sourceInfo = lstatSync(from);
  const problem = getDeployPathProblem(file, { isDirectory: sourceInfo.isDirectory(), isSymbolicLink: sourceInfo.isSymbolicLink() });
  if (problem) fail(`unsafe source entry ${file}: ${problem}`);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  copiedFiles += 1;
}

// 3. Copy allowlisted directories (optionally filtered by extension).
for (const dir of DIRS) {
  const from = join(repoRoot, dir.path);
  if (!existsSync(from)) {
    fail(`allowlisted directory missing from source: ${dir.path}`);
  }
  const to = join(outDir, dir.path);
  assertPlainSourcePath(dir.path);
  cpSync(from, to, {
    recursive: true,
    filter(src) {
      // Apply the same recursive policy used to verify the final artifact.
      let isDir = false;
      try {
        const info = lstatSync(src);
        isDir = info.isDirectory();
        if (getDeployPathProblem(relative(repoRoot, src), { isDirectory: isDir, isSymbolicLink: info.isSymbolicLink() })) return false;
      } catch {
        return false;
      }
      if (isDir) return true;
      if (dir.excludeReadmes && /(?:^|[\\/])README\.md$/i.test(src)) {
        return false;
      }
      if (dir.filterExt && !dir.filterExt.some((ext) => src.toLowerCase().endsWith(ext))) {
        return false;
      }
      return true;
    }
  });
}

// 4. Summary.
const { files, bytes } = countFiles(outDir);
const topLevel = readdirSync(outDir).sort();
console.log('build:deploy — staged clean production artifact at .deploy/');
console.log(`  top-level: ${topLevel.join(', ')}`);
console.log(`  files: ${files}  size: ${(bytes / (1024 * 1024)).toFixed(2)} MB`);
console.log(`  (copied ${copiedFiles} top-level allowlisted file(s) + ${DIRS.length} dir tree(s))`);

// 5. Sanity: required entry points must have landed in the artifact.
const missingOut = REQUIRED_SOURCE.filter((p) => !existsSync(join(outDir, p)));
if (missingOut.length) {
  fail(`required asset(s) did not reach .deploy/: ${missingOut.join(', ')}`);
}
