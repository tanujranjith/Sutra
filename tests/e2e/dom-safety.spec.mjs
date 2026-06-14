import { expect, test } from '@playwright/test';

// Architecture hardening — central DOM-safety layer (src/core/dom-safety.js).
// Exercises window.SutraDOMSafety in a real browser against the hostile payload
// classes the hardening spec calls out: <script>, on*= handlers, javascript:
// URLs, SVG payloads, iframe payloads, style injection, and malformed HTML.
// Asserts BOTH that the sanitized string carries no active markup AND that the
// sanitized output, once inserted, does not execute.

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForFunction(() => !!window.SutraDOMSafety, null, { timeout: 20000 });
}

const HOSTILE = [
  { name: '<script> tag', payload: '<script>window.__xss=1<\/script><b>ok</b>' },
  { name: 'img onerror handler', payload: '<img src=x onerror="window.__xss=1">' },
  { name: 'svg onload payload', payload: '<svg/onload=window.__xss=1><b>ok</b>' },
  { name: 'svg nested script', payload: '<svg><script>window.__xss=1<\/script></svg>' },
  { name: 'javascript: anchor', payload: '<a href="javascript:window.__xss=1">click</a>' },
  { name: 'javascript: anchor (tab-obfuscated)', payload: '<a href="java\tscript:window.__xss=1">x</a>' },
  { name: 'entity-encoded javascript: anchor', payload: '<a href="&#106;avascript:window.__xss=1">x</a>' },
  { name: 'iframe javascript src', payload: '<iframe src="javascript:window.__xss=1"></iframe>' },
  { name: 'iframe external src', payload: '<iframe src="https://evil.example/x"></iframe>' },
  { name: 'style url(javascript:)', payload: '<div style="background:url(javascript:window.__xss=1)">x</div>' },
  { name: 'style expression()', payload: '<div style="width:expression(window.__xss=1)">x</div>' },
  { name: 'inline <style> tag', payload: '<style>*{color:red}</style><p>text</p>' },
  { name: 'body onload', payload: '<body onload="window.__xss=1">x</body>' },
  { name: 'mixed-case ScRiPt', payload: '<ScRiPt>window.__xss=1</ScRiPt>' },
  { name: 'malformed unclosed tags', payload: '<div><img src=x onerror=window.__xss=1><b>bold' },
  { name: 'srcdoc reintroduction', payload: '<iframe srcdoc="<script>window.__xss=1<\/script>"></iframe>' },
  { name: 'object/embed', payload: '<object data="javascript:window.__xss=1"></object><embed src="x">' },
  { name: 'form with formaction', payload: '<form><button formaction="javascript:window.__xss=1">go</button></form>' }
];

const FORBIDDEN = [/<script\b/i, /<svg\b/i, /<iframe\b/i, /<object\b/i, /<embed\b/i, /\son\w+\s*=/i, /javascript:/i, /vbscript:/i, /srcdoc/i, /expression\s*\(/i];

test('sanitizeUserHTML strips every hostile payload class (string level)', async ({ page }) => {
  await openApp(page);
  for (const { name, payload } of HOSTILE) {
    const out = await page.evaluate((p) => window.SutraDOMSafety.sanitizeUserHTML(p), payload);
    for (const re of FORBIDDEN) {
      expect(out, `[${name}] output should not match ${re} — got: ${out}`).not.toMatch(re);
    }
  }
});

test('sanitized output does not execute when inserted into the DOM', async ({ page }) => {
  await openApp(page);
  const fired = await page.evaluate((payloads) => {
    window.__xss = 0;
    const results = [];
    for (const p of payloads) {
      const clean = window.SutraDOMSafety.sanitizeUserHTML(p);
      const host = document.createElement('div');
      document.body.appendChild(host);
      host.innerHTML = clean; // insert sanitized markup into the live document
      results.push({ p, clean });
      host.remove();
    }
    return { xss: window.__xss, results };
  }, HOSTILE.map((h) => h.payload));
  expect(fired.xss, `XSS sentinel fired; offending: ${JSON.stringify(fired.results)}`).toBe(0);
});

test('sanitizeUserHTML preserves safe, expected markup', async ({ page }) => {
  await openApp(page);
  const out = await page.evaluate(() =>
    window.SutraDOMSafety.sanitizeUserHTML(
      '<p class="x">Hello <strong>world</strong> <a href="https://example.com" target="_blank">link</a></p>'
      + '<img src="https://example.com/a.png" alt="pic"><ul><li>one</li></ul>'
    )
  );
  expect(out).toContain('<strong>world</strong>');
  expect(out).toContain('Hello');
  expect(out).toContain('href="https://example.com"');
  expect(out).toMatch(/rel="noopener noreferrer"/); // _blank hardened
  expect(out).toContain('<li>one</li>');
  expect(out).toContain('alt="pic"');
});

test('setText never parses HTML; escapeHtml encodes metacharacters', async ({ page }) => {
  await openApp(page);
  const res = await page.evaluate(() => {
    const el = document.createElement('div');
    window.SutraDOMSafety.setText(el, '<img src=x onerror=alert(1)>');
    return {
      hasImg: !!el.querySelector('img'),
      text: el.textContent,
      escaped: window.SutraDOMSafety.escapeHtml('<a href="b">&\'`</a>')
    };
  });
  expect(res.hasImg).toBe(false);
  expect(res.text).toBe('<img src=x onerror=alert(1)>');
  expect(res.escaped).toBe('&lt;a href=&quot;b&quot;&gt;&amp;&#39;&#96;&lt;/a&gt;');
});

test('isSafeUrl allows benign schemes and blocks script-bearing ones', async ({ page }) => {
  await openApp(page);
  const verdicts = await page.evaluate(() => {
    const f = window.SutraDOMSafety.isSafeUrl;
    return {
      https: f('https://example.com'),
      mailto: f('mailto:a@b.com'),
      relative: f('/notes/1'),
      fragment: f('#anchor'),
      js: f('javascript:alert(1)'),
      jsTab: f('java\tscript:alert(1)'),
      jsCase: f('JavaScript:alert(1)'),
      vbscript: f('vbscript:msgbox(1)'),
      dataHtml: f('data:text/html,<script>alert(1)<\/script>'),
      dataImg: f('data:image/png;base64,iVBOR', { allowImageData: true })
    };
  });
  expect(verdicts.https).toBe(true);
  expect(verdicts.mailto).toBe(true);
  expect(verdicts.relative).toBe(true);
  expect(verdicts.fragment).toBe(true);
  expect(verdicts.js).toBe(false);
  expect(verdicts.jsTab).toBe(false);
  expect(verdicts.jsCase).toBe(false);
  expect(verdicts.vbscript).toBe(false);
  expect(verdicts.dataHtml).toBe(false);
  expect(verdicts.dataImg).toBe(true);
});

test('renderUserHTMLToFrame isolates content in a sandboxed iframe', async ({ page }) => {
  await openApp(page);
  const res = await page.evaluate(() => {
    const host = document.createElement('div');
    const frame = window.SutraDOMSafety.renderUserHTMLToFrame(host, '<b>hi</b><script>parent.__xss=1<\/script>', { height: '120px' });
    return {
      isIframe: frame && frame.tagName === 'IFRAME',
      sandbox: frame ? frame.getAttribute('sandbox') : null,
      hasSrcdoc: !!(frame && frame.getAttribute('srcdoc')),
      hostOnlyHasFrame: host.children.length === 1 && host.firstChild === frame,
      noScriptInHost: !/<script/i.test(host.innerHTML.replace(/srcdoc="[^"]*"/i, ''))
    };
  });
  expect(res.isIframe).toBe(true);
  expect(res.sandbox).toContain('allow-scripts');
  expect(res.sandbox).not.toContain('allow-same-origin'); // cannot reach parent origin
  expect(res.hasSrcdoc).toBe(true);
  expect(res.hostOnlyHasFrame).toBe(true);
});
