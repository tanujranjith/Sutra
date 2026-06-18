#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const files = [
  'Sutra.html',
  'HomePage.html',
  'index.html',
  'src/core/app.js',
  'src/features/customization/plugin-system.js',
  'docs/privacy-security/PRIVACY_AND_LOCAL_FIRST.md',
  'docs/release/TESTING_AND_RELEASE_CHECKLIST.md',
  'NOTICE'
];

const approved = [
  'https://api.groq.com',
  'https://api.openai.com',
  'https://api.anthropic.com',
  'https://generativelanguage.googleapis.com',
  'https://openrouter.ai',
  'https://accounts.google.com',
  'https://www.googleapis.com',
  'https://docs.google.com',
  'https://aistudio.google.com',
  'https://myap.collegeboard.org',
  'https://chatgpt.com',
  'https://www.youtube.com',
  'https://www.youtube-nocookie.com',
  'https://i.ytimg.com',
  'https://player.vimeo.com',
  'https://open.spotify.com',
  'https://w.soundcloud.com',
  'https://codepen.io',
  'https://www.figma.com',
  'https://cdnjs.cloudflare.com',
  'https://unpkg.com',
  'https://console.groq.com',
  'https://platform.openai.com',
  'https://console.anthropic.com',
  // Provider documentation links (Assistant guide / provider registry).
  // Rendered as user-clicked anchors only — never fetched by the app.
  'https://docs.anthropic.com',
  'https://ai.google.dev',
  'https://local.sutra.invalid',
  'https://tanujranjith.github.io',
  // SEO/canonical + structured-data references (metadata only, never fetched).
  'https://sutra-two.vercel.app',
  'https://note-flow-atelier.vercel.app',
  'https://schema.org',
  'https://github.com',
  'http://www.w3.org/2000/svg',
  'http://localhost',
  'http://127.0.0.1'
];

let failures = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const urls = Array.from(text.matchAll(/https?:\/\/[^"'\s<>)]+/g)).map(match => match[0]);
  for (const url of urls) {
    if (
      url.startsWith('https://example.com') ||
      url === 'https://...' ||
      url === 'https://…' ||
      url.startsWith('https://${') ||
      url.includes('${')
    ) {
      continue;
    }
    // Sutra Cloud: any project on the Supabase platform is an approved family.
    // The exact project origin is pinned in the CSP (no wildcard there); this
    // lint only needs to confirm the host belongs to *.supabase.co.
    if (/^https:\/\/[a-z0-9-]+\.supabase\.co\b/i.test(url)) {
      continue;
    }
    if (!approved.some(origin => url.startsWith(origin))) {
      console.error(`FAIL ${file}: unapproved URL ${url}`);
      failures += 1;
    }
  }
}

const app = readFileSync('src/core/app.js', 'utf8');
if (!app.includes('APPROVED_EXTERNAL_SCRIPT_ORIGINS')) {
  console.error('FAIL app.js: approved external script origin guard missing');
  failures += 1;
}
if (/loadExternalScript\('https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip/.test(app)) {
  console.error('FAIL app.js: core .sutra JSZip path still uses CDN');
  failures += 1;
}
if (!readFileSync('Sutra.html', 'utf8').includes('assets/vendor/jszip/jszip.min.js')) {
  console.error('FAIL Sutra.html: local JSZip vendor script missing');
  failures += 1;
}

if (failures) {
  console.error(`Network/CDN check FAILED (${failures} issue${failures === 1 ? '' : 's'}).`);
  process.exit(1);
}
console.log('Network/CDN check passed.');
