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
    ok(/CACHE_VERSION\s*=\s*['"][^'"]+['"]/.test(sw), 'sw uses a versioned cache name');
    ok(/caches\.keys\(\)[\s\S]*caches\.delete/.test(sw), 'sw deletes stale caches on activate');
    ok(/req\.method\s*!==\s*'GET'/.test(sw), 'sw ignores non-GET requests (no POST caching)');
    ok(/url\.origin\s*!==\s*self\.location\.origin/.test(sw), 'sw never intercepts cross-origin requests (AI/Drive untouched)');
    ok(/isNavigation[\s\S]*fetch\(req\)[\s\S]*catch\([\s\S]*caches\.match/.test(sw), 'navigations are network-first with a cache fallback');
    ok(/res\.type\s*!==\s*'basic'/.test(sw), 'only same-origin (basic) responses are cached — never opaque');
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

if (failures) {
    console.error(`\nService worker check FAILED (${failures} issue${failures === 1 ? '' : 's'}).`);
    process.exit(1);
}
console.log('\nService worker check passed — offline-capable, local-first safe, no telemetry.');
