/* Service worker / PWA safety check.
   Verifies the SW is offline-capable but local-first safe: versioned cache,
   network-first navigations (no stale-document footgun), no cross-origin or
   API/Drive caching, no telemetry, and protocol-gated registration that never
   runs under file://. Part of `npm run check:all`. */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok  ', label); }
    else { failures++; console.error('  FAIL', label, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); }
}
function read(p) { return existsSync(resolve(repoRoot, p)) ? readFileSync(resolve(repoRoot, p), 'utf8') : null; }

console.log('Service worker / PWA safety check');
console.log('--------------------------------');

const sw = read('sw.js');
ok(!!sw, 'sw.js exists');
if (sw) {
    ok(/CACHE_VERSION\s*=\s*(?:['"][^'"]+['"]|`[^`]+`)/.test(sw), 'sw uses a versioned cache name');
    ok(/caches\.keys\(\)[\s\S]*caches\.delete/.test(sw), 'sw deletes stale caches on activate');
    ok(/req\.method\s*!==\s*'GET'/.test(sw), 'sw ignores non-GET requests outside explicit local handlers');
    ok(/req\.method\s*===\s*'POST'[\s\S]*\/share-target/.test(sw) && /handleShareTargetRequest\(req\)/.test(sw), 'sw explicitly handles the installed-PWA Share Target POST');
    const shareHandler = sw.match(/async function handleShareTargetRequest\(request\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
    ok(!!shareHandler && !/caches\.|cachePut|fetch\(/.test(shareHandler), 'Share Target POST is retained locally and never cached or forwarded');
    ok(/url\.origin\s*!==\s*self\.location\.origin/.test(sw), 'sw never intercepts cross-origin requests (AI/Drive untouched)');
    ok(/isNavigation[\s\S]*fetch\(req\)[\s\S]*catch\([\s\S]*matchCurrentCache/.test(sw), 'navigations are network-first with a current-cache fallback');
    ok(/res\.type\s*!==\s*'basic'/.test(sw), 'only same-origin (basic) responses are cached — never opaque');
    ok(!/ignoreSearch\s*:\s*true/.test(sw), 'versioned assets never use search-insensitive cache matching');
    ok(/cache\.match\(req,\s*\{\s*ignoreSearch:\s*false\s*\}\)/.test(sw), 'asset lookup is exact and scoped to the current cache');
    ok(/cache\.addAll\(CRITICAL_ASSETS\)/.test(sw), 'critical shell precache is atomic and failures reject install');
    ok(/Promise\.allSettled\(OPTIONAL_ASSETS/.test(sw), 'only optional precache failures degrade gracefully');
    // Strip comments so the keyword-absence checks inspect executable code only.
    const swCode = sw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok(!/analytics|telemetry|sendBeacon|gtag|google-analytics|mixpanel|segment\.io/i.test(swCode), 'sw code contains no telemetry/analytics');
    ok(!/(api\.openai|api\.anthropic|api\.groq|googleapis|openrouter|generativelanguage)/i.test(swCode), 'sw code never references provider/API/Drive hosts');
    ok(!/\.sutra\b/.test(swCode), 'sw code does not special-case .sutra exports (downloads are never fetched/cached)');
}

const reg = read('src/boot/sw-register.js');
ok(!!reg, 'sw-register.js exists');
if (reg) {
    ok(/'serviceWorker'\s*in\s*navigator/.test(reg), 'registration checks for serviceWorker support');
    ok(/http:|https:/.test(reg) && /proto/.test(reg), 'registration is protocol-gated (skips file://)');
    ok(/register\(['"]\.\/sw\.js['"]\)/.test(reg), 'registers the relative ./sw.js (scope-correct on GitHub Pages)');
    ok(/\.catch\(/.test(reg), 'registration failures are swallowed (never block boot)');
    ok(/offline/i.test(reg), 'provides an in-app offline indicator');
}

const html = read('Sutra.html');
ok(!!html && /src=["']src\/boot\/sw-register\.js/.test(html), 'Sutra.html loads sw-register.js');

const manifestText = read('manifest.webmanifest');
let manifest = null;
try { manifest = manifestText ? JSON.parse(manifestText) : null; } catch (error) { /* reported below */ }
ok(!!manifest, 'manifest.webmanifest is valid JSON');
if (manifest) {
    const target = manifest.share_target || {};
    ok(target.method === 'POST' && target.enctype === 'multipart/form-data', 'Share Target uses POST multipart receipt');
    ok(target.params && target.params.title === 'title' && target.params.text === 'text' && target.params.url === 'url', 'Share Target preserves source title, text, and URL');
    ok(Array.isArray(target.params && target.params.files) && target.params.files.some((entry) => entry && entry.name === 'files' && Array.isArray(entry.accept) && entry.accept.includes('application/pdf') && entry.accept.includes('image/png')), 'Share Target declares image, PDF, and document file intake');
}

const shareTarget = read('src/features/workspace/share-target.js') || '';
ok(!/\blocalStorage\b/.test(shareTarget), 'Share Target avoids raw localStorage for temporary or permanent data');
ok(/showShareConfirmModal/.test(shareTarget) && /routeApprovedShare/.test(shareTarget), 'Share Target separates preview from confirmed routing');

if (failures) {
    console.error(`\nService worker check FAILED (${failures} issue${failures === 1 ? '' : 's'}).`);
    process.exit(1);
}
console.log('\nService worker check passed — offline-capable, local-first safe, no telemetry.');
