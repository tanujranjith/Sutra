/*
 * error-reporter.js — structured error handling for Sutra.
 *
 * Loaded right after safe-storage.js so `window.SutraReportError` and the global
 * error/rejection handlers exist before any feature module or app.js runs and
 * can therefore capture boot-time failures.
 *
 * Goals:
 *   - One funnel for "something went wrong" so failures are observable instead
 *     of swallowed by bare `catch (e) {}`. Replaces silent catches in the
 *     paths that matter (persistence, import/export, assistant, rendering,
 *     feature boot).
 *   - Useful context in development (console with severity + context), quiet in
 *     production. NEVER a blocking `alert()`.
 *   - Optional, non-blocking toast for recoverable, user-visible failures —
 *     only when the caller asks for it (context.toast / context.userMessage).
 *   - Exportable diagnostics for beta debugging: a bounded in-memory ring
 *     buffer the user can export from Settings. Local-only; never sent anywhere.
 *
 * Zero dependencies. Classic script, IIFE, attaches to window. Must never throw.
 */
(function () {
  'use strict';

  var MAX_ENTRIES = 250;
  var DEDUPE_MS = 4000;
  var entries = [];
  var lastSeen = Object.create(null);
  var counter = 0;

  function isDevHost() {
    try {
      var h = location.hostname || '';
      return (
        location.protocol === 'file:' ||
        h === 'localhost' ||
        h === '127.0.0.1' ||
        h === '[::1]' ||
        /\.local$/.test(h)
      );
    } catch (e) {
      return false;
    }
  }

  var DEV = isDevHost();

  // Monotonic-ish timestamp without relying on Date in a way that breaks tests;
  // performance.now is fine here (this module is browser-only at runtime).
  function now() {
    try {
      return Date.now();
    } catch (e) {
      return 0;
    }
  }

  // Defense-in-depth: strip credentials before they reach any diagnostic sink.
  // Error messages, stacks, context, and location.href can carry credentials as
  // fields, query parameters, or request headers. Diagnostics are user-exportable.
  function normalizeFieldName(name) {
    var normalized = String(name == null ? '' : name).replace(/\+/g, ' ');
    if (normalized.length > 128) return '';
    try {
      // Each successful percent-decoding layer shortens the label. Bound the
      // loop by its original length so deeply encoded aliases still terminate.
      var maxDecodePasses = normalized.length;
      for (var i = 0; i < maxDecodePasses; i++) {
        var decoded = decodeURIComponent(normalized);
        if (decoded === normalized) break;
        normalized = decoded;
      }
    } catch (e) { /* malformed encoding is not a sensitive-name alias */ }
    return normalized.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function isSensitiveFieldName(name) {
    var normalized = normalizeFieldName(name);
    if (!normalized) return false;
    return normalized === 'key'
      || /(?:passphrases?|passwords?|secrets?|credentials?|authorization|cookies?|tokens?|apikeys?)$/.test(normalized)
      || /(?:recovery|vault|wrapped|session|private|encryption|signing|wrapping)keys?$/.test(normalized)
      || /(?:openai|anthropic|claude|google|gemini|groq|xai|grok|openrouter|mistral|together|deepseek|perplexity|nvidia|cohere|azure|provider)keys?$/.test(normalized);
  }

  function findCredentialValueEnd(text, start, fieldName) {
    var first = text.charAt(start);
    if (first === '"' || first === "'") {
      for (var quoted = start + 1; quoted < text.length; quoted++) {
        var current = text.charAt(quoted);
        if (current === '\\') { quoted += 1; continue; }
        if (current === first) return { end: quoted + 1, quote: first };
        if (current === '\n' || current === '\r') return { end: quoted, quote: first };
      }
      return { end: text.length, quote: first };
    }

    var normalized = normalizeFieldName(fieldName);
    var allowSpaces = /(?:passphrase|password|secret|authorization|cookie|recoverykey|vaultkey|wrappedkey|privatekey|sessionkey)$/.test(normalized);
    var end = start;
    while (end < text.length) {
      var ch = text.charAt(end);
      if (ch === '&' || ch === '#' || ch === ',' || ch === ';' || ch === '\n' || ch === '\r' || ch === '}' || ch === ']') break;
      if (!allowSpaces && /\s/.test(ch)) break;
      end += 1;
    }
    while (end > start && /\s/.test(text.charAt(end - 1))) end -= 1;
    return { end: end, quote: '' };
  }

  function scrubLabeledValues(value) {
    // Capture bounded field labels followed by `:` or `=`. The value boundary
    // is scanned linearly so quoted passphrases and multi-word header values
    // are redacted without a backtracking-heavy expression.
    var labels = /(^|[?&#\s,;:{(\[])(["']?)([a-z0-9_%+.\- \t]{1,96}?)\2[ \t]*[:=]/gi;
    var result = '';
    var copiedThrough = 0;
    var match;
    while ((match = labels.exec(value))) {
      var fieldName = match[3];
      if (!isSensitiveFieldName(fieldName)) {
        // Revisit only the final delimiter of an ordinary label; it can expose
        // a credential label, as in `Error:passphrase=...` or `Error: passphrase=...`.
        labels.lastIndex = match.index + match[0].length - 1;
        continue;
      }
      var valueStart = labels.lastIndex;
      while (valueStart < value.length && /[ \t]/.test(value.charAt(valueStart))) valueStart += 1;
      var valueEnd = findCredentialValueEnd(value, valueStart, fieldName);
      if (valueEnd.end <= valueStart) continue;
      result += value.slice(copiedThrough, valueStart);
      if (valueEnd.quote) result += valueEnd.quote + '[redacted]' + valueEnd.quote;
      else result += '[redacted]';
      copiedThrough = valueEnd.end;
      labels.lastIndex = valueEnd.end;
    }
    return copiedThrough ? result + value.slice(copiedThrough) : value;
  }

  var SECRET_SCRUBBERS = [
    [/([?&](?:key|api[_-]?key|access_token|token)=)[^&#\s"']+/gi, '$1[redacted]'],
    [/\bBearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]'],
    [/\bAIza[0-9A-Za-z._\-]{10,}/g, 'AIza[redacted]'],
    [/\b(sk|gsk|xai|pplx|sess|nvapi)[-_][A-Za-z0-9_-]{6,}/gi, '$1-[redacted]']
  ];
  function scrubSecrets(value) {
    if (typeof value !== 'string' || !value) return value;
    var out = scrubLabeledValues(value);
    try {
      for (var i = 0; i < SECRET_SCRUBBERS.length; i++) {
        out = out.replace(SECRET_SCRUBBERS[i][0], SECRET_SCRUBBERS[i][1]);
      }
    } catch (e) { /* regex is static; never let scrubbing throw */ }
    return out;
  }
  function scrubDeep(value, depth) {
    depth = depth || 0;
    if (depth > 12) return '[unserializable]';
    if (typeof value === 'string') return scrubSecrets(value);
    if (Array.isArray(value)) return value.map(function (item) { return scrubDeep(item, depth + 1); });
    if (value && typeof value === 'object') {
      var out = Object.create(null);
      try {
        Object.keys(value).forEach(function (k) {
          var sensitive = isSensitiveFieldName(k);
          out[scrubSecrets(k)] = sensitive ? '[redacted]' : scrubDeep(value[k], depth + 1);
        });
      } catch (e) { return '[unserializable]'; }
      return out;
    }
    return value;
  }

  function normalizeError(error) {
    if (!error) return { message: 'Unknown error', name: 'Error', stack: '' };
    if (typeof error === 'string') return { message: error, name: 'Error', stack: '' };
    var message = '';
    try { message = String(error.message || error.reason || error); } catch (e) { message = 'Unstringifiable error'; }
    var name = '';
    try { name = String(error.name || 'Error'); } catch (e) { name = 'Error'; }
    var stack = '';
    try { stack = error.stack ? String(error.stack) : ''; } catch (e) { stack = ''; }
    return { message: message, name: name, stack: stack };
  }

  // Chromium and Safari can surface these ResizeObserver delivery notices as
  // window error events while a complex layout settles. They do not identify a
  // thrown application exception, and treating them as one creates a false
  // "Something went wrong" prompt over otherwise usable editor screens.
  // Keep the match deliberately exact so real errors still reach diagnostics.
  function isBenignBrowserLayoutNotice(message) {
    var normalized = String(message || '').trim().replace(/\.$/, '').toLowerCase();
    return normalized === 'resizeobserver loop limit exceeded'
      || normalized === 'resizeobserver loop completed with undelivered notifications';
  }

  function normalizeContext(context) {
    if (!context) return {};
    if (typeof context === 'string') return { where: context };
    if (typeof context === 'object') {
      // Shallow, defensive copy of plain fields only.
      var out = Object.create(null);
      try {
        Object.keys(context).forEach(function (k) {
          var v = context[k];
          if (v === null || v === undefined) return;
          if (typeof v === 'object') {
            try { out[k] = JSON.parse(JSON.stringify(v)); } catch (e) { out[k] = '[unserializable]'; }
          } else if (typeof v === 'function') {
            out[k] = '[function]';
          } else {
            out[k] = v;
          }
        });
      } catch (e) { /* return what we have */ }
      return out;
    }
    return { where: String(context) };
  }

  function maybeToast(message) {
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(message);
        return true;
      }
    } catch (e) { /* toast subsystem not ready */ }
    return false;
  }

  /**
   * SutraReportError(error, context, severity)
   *   error    — Error | string | unknown
   *   context  — string (a "where") OR object. Recognized object fields:
   *                where:        short location label
   *                feature:      feature name (for feature-guard correlation)
   *                userMessage:  if set, shows a non-blocking toast with this text
   *                toast:        true to toast `userMessage` (defaults true when
   *                              userMessage is present and severity !== 'debug')
   *   severity — 'debug' | 'info' | 'warning' | 'error' | 'critical' (default 'error')
   *
   * Returns the recorded entry (also useful in tests). Never throws.
   */
  function reportError(error, context, severity) {
    try {
      var info = scrubDeep(normalizeError(error));
      var ctx = scrubDeep(normalizeContext(context));
      var sev = ['debug', 'info', 'warning', 'error', 'critical'].indexOf(severity) >= 0 ? severity : 'error';

      // Dedupe identical (message+where) bursts so a render loop can't flood.
      var dedupeKey = sev + '|' + info.message + '|' + (ctx.where || ctx.feature || '');
      var t = now();
      if (lastSeen[dedupeKey] && t - lastSeen[dedupeKey] < DEDUPE_MS) {
        return null;
      }
      lastSeen[dedupeKey] = t;

      counter += 1;
      var entry = {
        id: counter,
        at: t,
        severity: sev,
        name: info.name,
        message: scrubSecrets(info.message),
        stack: scrubSecrets(info.stack),
        context: scrubDeep(ctx)
      };
      entries.push(entry);
      if (entries.length > MAX_ENTRIES) entries.shift();

      // Console output: noisy in dev, minimal in prod.
      try {
        var tag = '[Sutra:' + sev + ']';
        var loc = ctx.where || ctx.feature || '';
        if (DEV) {
          var fn = sev === 'warning' || sev === 'info' || sev === 'debug' ? 'warn' : 'error';
          if (sev === 'debug' && console.debug) fn = 'debug';
          (console[fn] || console.log).call(console, tag, loc, info.message, scrubDeep(info), scrubDeep(ctx));
        } else if (sev === 'critical' || sev === 'error') {
          (console.error || console.log).call(console, tag, loc, info.message);
        }
      } catch (e) { /* console may be unavailable */ }

      // Optional non-blocking toast for recoverable, user-visible failures.
      var wantsToast = ctx.toast === true || (ctx.userMessage && ctx.toast !== false);
      if (wantsToast && sev !== 'debug') {
        maybeToast(String(ctx.userMessage || info.message));
      }

      // Broadcast for any listener (e.g. a diagnostics panel) without coupling.
      try {
        window.dispatchEvent(new CustomEvent('sutra:error-reported', { detail: scrubDeep(entry) }));
      } catch (e) { /* CustomEvent always present in supported browsers */ }

      return scrubDeep(entry);
    } catch (fatal) {
      // The reporter itself must never break a caller.
      try { (console.error || console.log).call(console, '[Sutra:reporter-failed]', scrubDeep(normalizeError(fatal))); } catch (e) {}
      return null;
    }
  }

  // Convenience: run a thunk, report+swallow any throw, return a fallback.
  function guard(fn, context, severity, fallback) {
    try {
      return fn();
    } catch (e) {
      reportError(e, context, severity);
      return fallback;
    }
  }

  // ---- Diagnostics export (beta debugging) ---------------------------------

  function buildReport() {
    var env = {};
    try {
      env = {
        href: scrubSecrets(location.href),
        userAgent: navigator.userAgent,
        language: navigator.language,
        viewport: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
        dev: DEV
      };
    } catch (e) { /* best-effort */ }
    return {
      generatedAt: now(),
      schema: 'sutra-diagnostics@1',
      environment: scrubDeep(env),
      entryCount: entries.length,
      entries: scrubDeep(entries)
    };
  }

  function exportText() {
    try {
      return JSON.stringify(buildReport(), null, 2);
    } catch (e) {
      return '{"error":"could not serialize diagnostics"}';
    }
  }

  function download() {
    try {
      var blob = new Blob([exportText()], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'sutra-diagnostics.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 1000);
      return true;
    } catch (e) {
      reportError(e, 'SutraDiagnostics.download', 'warning');
      return false;
    }
  }

  // ---- Global safety nets ---------------------------------------------------
  // Capture otherwise-unhandled failures so they land in diagnostics instead of
  // only the console. These are last-resort; most code paths should call
  // reportError directly with real context.

  try {
    window.addEventListener('error', function (ev) {
      // Resource load errors (img/script) surface as Event with no .error.
      if (ev && ev.message) {
        var context = {
          where: 'window.onerror',
          source: ev.filename,
          line: ev.lineno,
          col: ev.colno
        };
        if (isBenignBrowserLayoutNotice(ev.message)) {
          // Preserve a development breadcrumb without showing the user an
          // issue prompt for a browser layout-delivery notification.
          context.benignBrowserLayoutNotice = true;
          reportError(ev.error || ev.message, context, 'debug');
          return;
        }
        reportError(ev.error || ev.message, context, 'error');
      }
    });
    window.addEventListener('unhandledrejection', function (ev) {
      var reason = ev && (ev.reason !== undefined ? ev.reason : ev);
      reportError(reason, { where: 'unhandledrejection' }, 'warning');
    });
  } catch (e) { /* addEventListener always present in supported browsers */ }

  // `window.reportError` is a browser platform API. Never replace it: doing so
  // changes native error-reporting semantics for third-party and browser code.
  window.SutraReportError = reportError;
  window.SutraErrorGuard = guard;
  window.SutraDiagnostics = {
    report: reportError,
    guard: guard,
    getEntries: function () { return scrubDeep(entries); },
    buildReport: buildReport,
    exportText: exportText,
    download: download,
    scrubSecrets: scrubSecrets,
    clear: function () { entries.length = 0; }
  };
})();
