#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const files = ['index.html', 'HomePage.html', 'Sutra.html'];
const required = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  'https://accounts.google.com',
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  'https://api.groq.com',
  'https://api.openai.com',
  'https://api.anthropic.com',
  'https://generativelanguage.googleapis.com',
  'https://openrouter.ai',
  'https://www.googleapis.com',
  'http://localhost:*',
  'http://127.0.0.1:*',
  'https://docs.google.com',
  'https://www.figma.com',
  'https://i.ytimg.com',
  'worker-src',
  'form-action'
];

let failures = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const match = text.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  if (!match) {
    console.error(`FAIL ${file}: missing CSP meta tag`);
    failures += 1;
    continue;
  }
  const csp = match[1];
  for (const token of required) {
    if (!csp.includes(token)) {
      console.error(`FAIL ${file}: CSP missing ${token}`);
      failures += 1;
    }
  }
  if (/frame-src[^;]*\*/.test(csp) || /connect-src[^;]*\*/.test(csp.replace(/localhost:\*/g, '').replace(/127\.0\.0\.1:\*/g, ''))) {
    console.error(`FAIL ${file}: CSP contains an arbitrary frame/connect wildcard`);
    failures += 1;
  }
}

for (const file of ['Sutra.html', 'HomePage.html', 'index.html']) {
  const text = readFileSync(file, 'utf8');
  if (/fonts\.googleapis|fonts\.gstatic/.test(text)) {
    console.error(`FAIL ${file}: eager Google Fonts startup request remains`);
    failures += 1;
  }
}

const docs = readFileSync('docs/release/TESTING_AND_RELEASE_CHECKLIST.md', 'utf8');
if (!docs.includes('frame-ancestors') || !docs.includes('hosting header')) {
  console.error('FAIL docs/release/TESTING_AND_RELEASE_CHECKLIST.md: hosting-header CSP follow-up is not documented');
  failures += 1;
}

if (failures) {
  console.error(`CSP check FAILED (${failures} issue${failures === 1 ? '' : 's'}).`);
  process.exit(1);
}
console.log('CSP check passed.');
