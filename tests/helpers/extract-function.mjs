/*
 * tests/helpers/extract-function.mjs — behavior-level source assertions.
 *
 * Extracts a top-level function declaration body from a classic runtime
 * script (e.g. src/core/app.js) with a string/template/comment-aware brace
 * scanner, so tests can assert on the actual call graph and conditions
 * instead of loose regex fragments. Pure Node module; no runtime deps.
 */
'use strict';

const DECL_PATTERNS = [
  (name) => new RegExp(`\\bfunction\\s+${name}\\s*\\(`, 'g'),
  (name) => new RegExp(`\\basync\\s+function\\s+${name}\\s*\\(`, 'g')
];

function findDeclarationStart(source, name) {
  for (const makePattern of DECL_PATTERNS) {
    const pattern = makePattern(name);
    const match = pattern.exec(source);
    if (match) return { start: match.index, parenAt: pattern.lastIndex - 1 };
  }
  return null;
}

// Scans from a function-declaration start and returns the index of the `{`
// that opens the body (the first brace at paren-depth 0, i.e. after the
// parameter list) plus the matching close brace index.
function locateBody(source, startIndex) {
  let i = startIndex;
  const len = source.length;
  let parenDepth = 0;
  let braceDepth = 0;
  let bodyStart = -1;
  while (i < len) {
    const ch = source[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      while (i < len) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === quote) break;
        i += 1;
      }
    } else if (ch === '`') {
      // Template literal: skip content and nested ${...} expressions.
      i += 1;
      let exprDepth = 0;
      while (i < len) {
        const c = source[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '$' && source[i + 1] === '{') { exprDepth += 1; i += 2; continue; }
        if (c === '{' && exprDepth > 0) { exprDepth += 1; i += 1; continue; }
        if (c === '}' && exprDepth > 0) { exprDepth -= 1; i += 1; continue; }
        if (c === '`' && exprDepth === 0) break;
        i += 1;
      }
    } else if (ch === '/' && source[i + 1] === '/') {
      while (i < len && source[i] !== '\n') i += 1;
    } else if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    } else if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (ch === '{') {
      if (parenDepth === 0 && bodyStart === -1) {
        bodyStart = i;
        braceDepth = 1;
      } else if (bodyStart !== -1) {
        braceDepth += 1;
      }
    } else if (ch === '}' && bodyStart !== -1) {
      braceDepth -= 1;
      if (braceDepth === 0) return { bodyStart, bodyEnd: i + 1 };
    }
    i += 1;
  }
  return null;
}

/**
 * Returns { start, end, body } for the first top-level declaration of
 * `function NAME(` / `async function NAME(` in source, or null.
 * `body` includes the surrounding braces.
 */
function extractFunction(source, name) {
  const declared = findDeclarationStart(source, name);
  if (!declared) return null;
  const located = locateBody(source, declared.start);
  if (!located) return null;
  return {
    start: declared.start,
    end: located.bodyEnd,
    body: source.slice(declared.start, located.bodyEnd)
  };
}

/** Count of `name(` call occurrences inside a body string. */
function callCount(body, name) {
  const pattern = new RegExp(`\\b${name}\\s*\\(`, 'g');
  return (body.match(pattern) || []).length;
}

export { extractFunction, callCount };
