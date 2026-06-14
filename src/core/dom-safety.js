/*
 * dom-safety.js — central rendering / sanitization layer for Sutra.
 *
 * Loaded before every feature module (right after safe-storage.js) so
 * `window.SutraDOMSafety` is always available at first render. This module is
 * the ONE approved channel for putting markup into the DOM. It exists so that:
 *
 *   - User-authored or imported content is never injected as raw HTML. Note
 *     bodies, titles, task text, workspace fields, assistant output, and
 *     canvas / htmlEmbed-style blocks must flow through `sanitizeUserHTML`
 *     (aggressive allowlist) or `renderUserHTMLToFrame` (sandboxed iframe).
 *   - Developer-authored, static template markup has a single greppable,
 *     auditable entry point (`setTrustedHTML`) instead of hundreds of ad-hoc
 *     `el.innerHTML = ...` sites. The static guardrail
 *     (scripts/sutra-safe-dom-check.mjs) treats these helpers as the approved
 *     channel and fails CI when new raw `innerHTML =` sinks appear.
 *   - Plain text always has a zero-think safe path (`setText`).
 *
 * Design constraints (match safe-storage.js):
 *   - Zero dependencies. Classic script, IIFE, attaches to window.
 *   - Never throws out of a render path. A sanitizer failure must degrade to
 *     escaped text, never to raw markup and never to an exception that drops
 *     the surrounding UI update.
 *   - Works (defensively) when no DOM is present: in a non-browser context
 *     `sanitizeUserHTML` falls back to fully escaping its input, so the value
 *     can never carry active markup. The real allowlist parsing runs in the
 *     browser, where it is exercised by tests/e2e/dom-safety.spec.mjs.
 */
(function () {
  'use strict';

  var hasDom = typeof document !== 'undefined' && !!document.createElement;
  var hasDomParser = typeof DOMParser !== 'undefined';

  // ---- Plain-text escaping --------------------------------------------------

  var ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;'
  };

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"'`]/g, function (ch) {
      return ESCAPE_MAP[ch];
    });
  }

  // ---- Allowlists for sanitizeUserHTML -------------------------------------
  // Conservative by design. Anything not on the tag allowlist is unwrapped
  // (children kept, element dropped) so text survives but structure/behavior
  // cannot smuggle script. Attributes default-deny: only the named globals and
  // per-tag entries survive, and URL-bearing attributes are re-validated.

  var ALLOWED_TAGS = {
    A: 1, ABBR: 1, ADDRESS: 1, AUDIO: 1, B: 1, BLOCKQUOTE: 1, BR: 1, CAPTION: 1,
    CITE: 1, CODE: 1, COL: 1, COLGROUP: 1, DD: 1, DEL: 1, DETAILS: 1, DFN: 1,
    DIV: 1, DL: 1, DT: 1, EM: 1, FIGCAPTION: 1, FIGURE: 1, H1: 1, H2: 1, H3: 1,
    H4: 1, H5: 1, H6: 1, HR: 1, I: 1, IMG: 1, INS: 1, KBD: 1, LI: 1, MARK: 1,
    OL: 1, P: 1, PICTURE: 1, PRE: 1, Q: 1, S: 1, SAMP: 1, SECTION: 1, SMALL: 1,
    SOURCE: 1, SPAN: 1, STRONG: 1, SUB: 1, SUMMARY: 1, SUP: 1, TABLE: 1,
    TBODY: 1, TD: 1, TFOOT: 1, TH: 1, THEAD: 1, TIME: 1, TR: 1, U: 1, UL: 1,
    VAR: 1, VIDEO: 1, WBR: 1
  };

  // Tags whose entire subtree is dangerous and must be removed wholesale
  // (not merely unwrapped) — their text content is not meaningful and may
  // carry executable payloads.
  var DROP_SUBTREE_TAGS = {
    SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, BASE: 1, META: 1,
    LINK: 1, NOSCRIPT: 1, TEMPLATE: 1, FORM: 1, INPUT: 1, BUTTON: 1, TEXTAREA: 1,
    SELECT: 1, OPTION: 1, FRAME: 1, FRAMESET: 1, APPLET: 1, SVG: 1, MATH: 1
  };

  var GLOBAL_ATTRS = {
    'class': 1, 'id': 1, 'title': 1, 'dir': 1, 'lang': 1, 'role': 1,
    'alt': 1, 'width': 1, 'height': 1, 'align': 1, 'valign': 1
  };

  // Per-tag attribute allowlist (in addition to GLOBAL_ATTRS + aria-*/data-*).
  var TAG_ATTRS = {
    A: { href: 1, target: 1, rel: 1, name: 1, download: 1 },
    IMG: { src: 1, srcset: 1, loading: 1, decoding: 1 },
    SOURCE: { src: 1, srcset: 1, type: 1, media: 1, sizes: 1 },
    VIDEO: { src: 1, poster: 1, controls: 1, muted: 1, loop: 1, preload: 1, playsinline: 1 },
    AUDIO: { src: 1, controls: 1, muted: 1, loop: 1, preload: 1 },
    TD: { colspan: 1, rowspan: 1, headers: 1 },
    TH: { colspan: 1, rowspan: 1, headers: 1, scope: 1 },
    COL: { span: 1 },
    COLGROUP: { span: 1 },
    OL: { start: 1, reversed: 1, type: 1 },
    TIME: { datetime: 1 },
    DETAILS: { open: 1 },
    BLOCKQUOTE: { cite: 1 },
    Q: { cite: 1 }
  };

  // Attributes that carry a URL and must be re-validated against a scheme
  // allowlist regardless of which tag they appear on.
  var URL_ATTRS = { href: 1, src: 1, poster: 1, cite: 1, 'xlink:href': 1 };

  var SAFE_URL_SCHEME = /^(?:https?:|mailto:|tel:|sms:|ftp:)/i;
  var SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml);/i;
  // Script-bearing or origin-smuggling schemes. data:/blob:/file: are blocked
  // for generic URL attributes; image data URLs are allowed separately.
  var DANGEROUS_SCHEME = /^(?:javascript|vbscript|data|blob|file):/i;

  // Chars a URL parser ignores when resolving a scheme. DOMParser already
  // decoded HTML entities in attribute values, so the only residual obfuscation
  // is embedded control chars / unicode whitespace, e.g. "java\tscript:".
  var URL_NOISE = /[\u0000-\u0020\u00A0\u1680\u2000-\u200F\u2028\u2029\u202F\u205F\u3000\uFEFF]+/g;

  function normalizeUrlForCheck(raw) {
    return String(raw || '').replace(URL_NOISE, '');
  }

  function isSafeUrl(raw, opts) {
    var url = normalizeUrlForCheck(raw);
    if (!url) return false;
    if (opts && opts.allowImageData && SAFE_IMAGE_DATA_URL.test(url)) return true;
    if (DANGEROUS_SCHEME.test(url)) return false;
    if (SAFE_URL_SCHEME.test(url)) return true;
    // Fragment / query / relative path with no scheme.
    if (url.indexOf(':') === -1) return true;
    // Protocol-relative //host/path.
    if (url.indexOf('//') === 0) return true;
    return false;
  }

  function isUnsafeStyle(value) {
    var css = String(value || '');
    return /expression\s*\(|url\s*\(\s*['"]?\s*(?:javascript|vbscript|data):|behavior\s*:|-moz-binding|@import/i.test(css);
  }

  // ---- Core allowlist sanitizer --------------------------------------------

  function sanitizeUserHTML(rawHtml, options) {
    options = options || {};
    if (rawHtml === null || rawHtml === undefined) return '';
    var source = String(rawHtml);
    if (!source) return '';

    // No DOM (e.g. Node-side usage): cannot safely parse, so escape everything.
    if (!hasDom || !hasDomParser) return escapeHtml(source);

    var parsed;
    try {
      parsed = new DOMParser().parseFromString(source, 'text/html');
    } catch (e) {
      return escapeHtml(source);
    }
    if (!parsed || !parsed.body) return escapeHtml(source);

    var container = document.createElement('div');
    var child = parsed.body.firstChild;
    while (child) {
      var next = child.nextSibling;
      container.appendChild(child); // adopt into our scratch container
      child = next;
    }

    try {
      sanitizeNode(container, options);
    } catch (e) {
      // Any unexpected failure: fall back to fully-escaped text, never raw.
      return escapeHtml(source);
    }

    return container.innerHTML;
  }

  // Recursively sanitize a node's element children in place.
  function sanitizeNode(parent, options) {
    var nodes = [];
    var n = parent.firstChild;
    while (n) {
      nodes.push(n);
      n = n.nextSibling;
    }

    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (node.nodeType === 8 /* comment */) {
        parent.removeChild(node);
        continue;
      }
      if (node.nodeType !== 1 /* element */) continue; // text nodes kept verbatim

      var tag = node.tagName ? node.tagName.toUpperCase() : '';

      if (DROP_SUBTREE_TAGS[tag] && !(tag === 'IFRAME' && options.allowTrustedIframes)) {
        parent.removeChild(node);
        continue;
      }

      if (tag === 'IFRAME' && options.allowTrustedIframes) {
        if (!sanitizeIframe(node, options)) {
          parent.removeChild(node);
        }
        continue;
      }

      if (!ALLOWED_TAGS[tag]) {
        // Unknown / disallowed but harmless tag: unwrap — keep sanitized
        // children, drop the wrapper. This preserves text without trusting
        // the element.
        sanitizeNode(node, options);
        unwrap(node, parent);
        continue;
      }

      sanitizeAttributes(node, tag, options);
      sanitizeNode(node, options); // recurse into kept element
    }
  }

  function sanitizeAttributes(node, tag, options) {
    var attrs = node.attributes;
    if (!attrs) return;
    var tagAttrs = TAG_ATTRS[tag] || {};
    // Iterate over a static copy — we mutate during the loop.
    var list = [];
    for (var i = 0; i < attrs.length; i += 1) list.push(attrs[i]);

    for (var j = 0; j < list.length; j += 1) {
      var attr = list[j];
      var name = String(attr.name || '').toLowerCase();
      var value = String(attr.value || '');
      if (!name) {
        node.removeAttribute(attr.name);
        continue;
      }

      // Event handlers (on*) are always out.
      if (name.indexOf('on') === 0) {
        node.removeAttribute(attr.name);
        continue;
      }
      // srcdoc would re-introduce an un-sandboxed document; style with an
      // expression()/url(javascript:) payload is script-equivalent.
      if (name === 'srcdoc' || (name === 'style' && isUnsafeStyle(value))) {
        node.removeAttribute(attr.name);
        continue;
      }

      var allowed =
        GLOBAL_ATTRS[name] === 1 ||
        tagAttrs[name] === 1 ||
        name === 'style' ||
        name.indexOf('aria-') === 0 ||
        name.indexOf('data-') === 0;

      if (!allowed) {
        node.removeAttribute(attr.name);
        continue;
      }

      if (URL_ATTRS[name]) {
        var allowImageData = tag === 'IMG' || tag === 'SOURCE' || name === 'poster';
        if (!isSafeUrl(value, { allowImageData: allowImageData })) {
          node.removeAttribute(attr.name);
          continue;
        }
      }

      if (name === 'srcset' && !isSafeSrcset(value)) {
        node.removeAttribute(attr.name);
        continue;
      }

      if (name === 'target' && tag !== 'A') {
        node.removeAttribute(attr.name);
      }
    }

    // Harden anchors that open new tabs.
    if (tag === 'A') {
      var target = String(node.getAttribute('target') || '').toLowerCase();
      if (target === '_blank') node.setAttribute('rel', 'noopener noreferrer');
    }
  }

  function isSafeSrcset(value) {
    // srcset is a comma-separated list of "url descriptor" pairs.
    var parts = String(value || '').split(',');
    for (var i = 0; i < parts.length; i += 1) {
      var url = parts[i].trim().split(/\s+/)[0];
      if (url && !isSafeUrl(url, { allowImageData: true })) return false;
    }
    return true;
  }

  function sanitizeIframe(node, options) {
    var src = normalizeUrlForCheck(node.getAttribute('src') || '');
    var ok = typeof options.isTrustedIframeSrc === 'function'
      ? !!options.isTrustedIframeSrc(src)
      : false;
    if (!ok) return false;
    // Strip everything except a minimal, safe attribute set.
    var keep = { src: 1, width: 1, height: 1, title: 1, loading: 1, allow: 1, allowfullscreen: 1, referrerpolicy: 1 };
    var attrs = [];
    for (var i = 0; i < node.attributes.length; i += 1) attrs.push(node.attributes[i]);
    for (var j = 0; j < attrs.length; j += 1) {
      var name = String(attrs[j].name || '').toLowerCase();
      if (!keep[name]) node.removeAttribute(attrs[j].name);
    }
    node.setAttribute('src', src);
    node.removeAttribute('srcdoc');
    node.setAttribute('loading', 'lazy');
    return true;
  }

  function unwrap(node, parent) {
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
  }

  // ---- DOM write helpers ----------------------------------------------------

  function setText(el, value) {
    if (!el) return el;
    el.textContent = value === null || value === undefined ? '' : String(value);
    return el;
  }

  // Developer-authored, static template markup ONLY. This is the audited,
  // greppable replacement for ad-hoc `el.innerHTML = <static template>`. Do
  // NOT pass user/imported content here — use setUserHTML / sanitizeUserHTML.
  function setTrustedHTML(el, html) {
    if (!el) return el;
    el.innerHTML = html === null || html === undefined ? '' : String(html); // sutra-allow-html: this IS the audited trusted-HTML channel
    return el;
  }

  function setUserHTML(el, html, options) {
    if (!el) return el;
    el.innerHTML = sanitizeUserHTML(html, options); // sutra-allow-html: value is allowlist-sanitized first
    return el;
  }

  // ---- Sandboxed iframe rendering for fully-untrusted markup ----------------
  // For canvas / htmlEmbed-style blocks where the user may legitimately author
  // scripts/styles: render inside an isolated, sandboxed iframe instead of the
  // host document. The frame gets a locked-down CSP and a restrictive sandbox
  // by default.

  function buildFrameDocument(markup, options) {
    options = options || {};
    var csp = options.permissive
      ? ''
      : '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
        'style-src \'unsafe-inline\' https: http:; img-src data: blob: https: http:; ' +
        'font-src data: https: http:; media-src data: blob: https: http:; ' +
        'frame-src https: http:; connect-src https: http:; script-src \'unsafe-inline\' https: http: blob:;">';
    return '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      csp +
      '<style>html,body{margin:0;padding:0}*{box-sizing:border-box;max-width:100%}</style>' +
      '</head><body>' + String(markup || '') + '</body></html>';
  }

  function renderUserHTMLToFrame(container, markup, options) {
    if (!container || !hasDom) return null;
    options = options || {};
    var frame = document.createElement('iframe');
    frame.setAttribute('title', options.title || 'Embedded content');
    frame.style.width = '100%';
    frame.style.border = '0';
    frame.style.display = 'block';
    if (options.height) frame.style.height = options.height;
    // Restrictive by default. Callers that genuinely need same-origin/forms
    // must opt in explicitly and own that decision.
    var sandbox = options.sandbox || 'allow-scripts allow-popups allow-popups-to-escape-sandbox';
    if (sandbox !== false) frame.setAttribute('sandbox', sandbox);
    frame.setAttribute('referrerpolicy', options.referrerPolicy || 'no-referrer');
    frame.srcdoc = buildFrameDocument(markup, options);
    container.innerHTML = ''; // sutra-allow-html: clearing host before appending the sandboxed frame
    container.appendChild(frame);
    return frame;
  }

  window.SutraDOMSafety = {
    escapeHtml: escapeHtml,
    setText: setText,
    setTrustedHTML: setTrustedHTML,
    setUserHTML: setUserHTML,
    sanitizeUserHTML: sanitizeUserHTML,
    isSafeUrl: isSafeUrl,
    renderUserHTMLToFrame: renderUserHTMLToFrame,
    // Exposed for the embed/editor paths that want the frame document shell.
    buildFrameDocument: buildFrameDocument,
    _internal: { hasDom: hasDom, hasDomParser: hasDomParser }
  };

  // Back-compat / convenience alias. `escapeHtml` is referenced widely; expose
  // a global only if nothing else has claimed it, to avoid clobbering the
  // in-app definitions during the incremental extraction.
  if (typeof window.sutraEscapeHtml !== 'function') {
    window.sutraEscapeHtml = escapeHtml;
  }
})();
