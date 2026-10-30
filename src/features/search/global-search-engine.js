/*
 * global-search-engine.js — pure, local ranking/normalization engine for
 * Sutra's workspace-wide search modal. No DOM, no storage, no network.
 *
 * Input: flat "records" collected from live canonical workspace state by
 * src/core/app.js (collectGlobalSearchRecords). The engine never reads
 * workspace state itself, so it stays deterministic and Node-testable.
 *
 * Privacy contract: a record flagged `locked: true` is searched by title
 * only. The engine additionally ignores `body` for locked records so a
 * misbehaving collector can never turn locked content into a snippet.
 *
 * Exposed as window.SutraGlobalSearchEngine (browser) / module.exports (Node).
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  var DEFAULT_LIMIT_ALL = 60;
  var DEFAULT_LIMIT_FILTERED = 40;
  var SNIPPET_LENGTH = 180;
  var SNIPPET_CONTEXT = 44;
  var MAX_RANGES = 12;
  var MAX_BODY_WORDS = 6;
  var MAX_QUERY_CHARS = 256;
  var MAX_QUERY_TOKENS = 12;
  var MIN_FUZZY_WORD_LENGTH = 4;
  var MAX_FUZZY_WORD_LENGTH = 64;
  var MAX_FUZZY_FIELD_CHARS = 20000;
  var MAX_FUZZY_BODY_CHARS = 20000;

  var TYPE_LABELS = {
    page: 'Page',
    note: 'Note',
    homework: 'To-do',
    task: 'Task',
    timeline: 'Timeline event',
    attachment: 'Attachment',
    course: 'Course',
    apstudy: 'AP Study',
    college: 'College',
    review: 'Review',
    tracker: 'Tracker',
    assistant: 'Assistant',
    setting: 'Setting'
  };

  // Filter chips. Pages = the page matched by title/location; Notes = the
  // page matched inside its note body. Both chips address the same Create
  // pages collection, so one page never appears twice within a view.
  // Each predicate receives the evaluated hit (record + match flags).
  var FILTERS = {
    all: null,
    pages: function (r) { return r.record.type === 'page' && r.titleMatched === true; },
    notes: function (r) { return r.record.type === 'page' && r.bodyMatched === true; },
    homework: function (r) { return r.record.type === 'homework'; },
    tasks: function (r) { return r.record.type === 'task'; },
    timeline: function (r) { return r.record.type === 'timeline'; },
    attachments: function (r) { return r.record.type === 'attachment'; }
  };

  function text(value) { return String(value == null ? '' : value); }

  function normalizeQuery(query) {
    var phrase = text(query).trim().toLowerCase();
    var tokenSource = phrase.slice(0, MAX_QUERY_CHARS);
    if (phrase.length > MAX_QUERY_CHARS && tokenSource && !/\s$/.test(tokenSource)) {
      var partialTokenStart = tokenSource.search(/\s+\S*$/);
      tokenSource = partialTokenStart < 0 ? '' : tokenSource.slice(0, partialTokenStart);
    }
    var words = [];
    var tokenPattern = /\S+/g;
    var match;
    while (words.length < MAX_QUERY_TOKENS && (match = tokenPattern.exec(tokenSource))) {
      words.push(match[0]);
    }
    return { phrase: phrase, words: words };
  }

  // Score one field against one query word.
  // Direct prefix/boundary/infix > one-edit token > loose subsequence > no match.
  function scoreLowerField(h, fuzzyText, word) {
    if (!h || !word) return 0;
    var idx = h.indexOf(word);
    if (idx === 0) return 1000;
    if (idx > 0) {
      var prev = h.charAt(idx - 1);
      var boundary = !/[a-z0-9]/.test(prev);
      return (boundary ? 700 : 500) - Math.min(idx, 100);
    }
    if (word.length > MAX_FUZZY_WORD_LENGTH) return 0;
    // Only literal matching scans the full field. Fuzzy and subsequence work
    // stays within a bounded prefix so large fields cannot multiply CPU cost.
    // In-order subsequence so "apbio" still finds "AP Biology".
    var hi = 0, gaps = 0, matched = 0;
    for (var qi = 0; qi < word.length; qi += 1) {
      var found = fuzzyText.indexOf(word.charAt(qi), hi);
      if (found < 0) break;
      if (found > hi) gaps += found - hi;
      hi = found + 1;
      matched += 1;
    }
    var subsequenceScore = matched === word.length
      ? Math.max(1, 120 - gaps - (fuzzyText.length - matched))
      : 0;
    // A one-character insertion, deletion, substitution, or adjacent swap
    // against a complete token is useful typo recovery. The score stays below
    // direct matches and above loose subsequences when both are possible.
    var typoMatch = findTypoToken(fuzzyText, word, MAX_FUZZY_FIELD_CHARS);
    return typoMatch ? 150 : subsequenceScore;
  }

  function scoreFieldMatches(value, words) {
    if (!words.length) return [];
    var source = text(value);
    var lower = source.toLowerCase();
    var fuzzyText = boundedFuzzySource(source, MAX_FUZZY_FIELD_CHARS).toLowerCase();
    return words.map(function (word) { return scoreLowerField(lower, fuzzyText, word); });
  }

  function maxScore(scores) {
    return scores.reduce(function (best, score) { return Math.max(best, score); }, 0);
  }

  function countPositiveScores(scores) {
    return scores.reduce(function (total, score) { return total + (score > 0 ? 1 : 0); }, 0);
  }

  function scoreField(haystack, word) {
    return scoreFieldMatches(haystack, [word])[0] || 0;
  }

  function bestFieldScore(value, words) {
    return maxScore(scoreFieldMatches(value, words));
  }

  function bodyWordMatches(value, words, lowerValue) {
    if (!words.length) return [];
    var body = text(value);
    var lower = lowerValue == null ? body.toLowerCase() : lowerValue;
    var fuzzyText = boundedFuzzySource(body, MAX_FUZZY_BODY_CHARS).toLowerCase();
    var fuzzyTokens = [];
    var tokenPattern = /[a-z0-9]+/g;
    var match;
    while ((match = tokenPattern.exec(fuzzyText))) {
      if (match[0].length >= 3 && match[0].length <= MAX_FUZZY_WORD_LENGTH + 1) {
        fuzzyTokens.push(match[0]);
      }
    }
    return words.map(function (word) {
      if (!word) return false;
      // Keep literal matches across the complete body. Only the typo scan is
      // bounded, so older deep-body search behavior remains intact.
      if (lower.indexOf(word) >= 0) return true;
      if (word.length < MIN_FUZZY_WORD_LENGTH || word.length > MAX_FUZZY_WORD_LENGTH) return false;
      return fuzzyTokens.some(function (candidate) { return isOneEditTokenMatch(word, candidate); });
    });
  }

  // Accept one clear spelling slip on a complete token. Direct substring
  // matches remain stronger, while typo recovery outranks loose subsequences.
  // Short words are excluded so common one- and two-letter queries stay precise.
  function isOneEditTokenMatch(left, right) {
    var a = text(left).toLowerCase();
    var b = text(right).toLowerCase();
    if (a.length < MIN_FUZZY_WORD_LENGTH || a.length > MAX_FUZZY_WORD_LENGTH
      || Math.min(a.length, b.length) < 3 || Math.abs(a.length - b.length) > 1) return false;

    if (a.length === b.length) {
      var mismatches = [];
      for (var sameIndex = 0; sameIndex < a.length; sameIndex += 1) {
        if (a.charAt(sameIndex) !== b.charAt(sameIndex)) mismatches.push(sameIndex);
        if (mismatches.length > 2) return false;
      }
      if (mismatches.length === 1) return true;
      return mismatches.length === 2
        && mismatches[1] === mismatches[0] + 1
        && a.charAt(mismatches[0]) === b.charAt(mismatches[1])
        && a.charAt(mismatches[1]) === b.charAt(mismatches[0]);
    }

    var longer = a.length > b.length ? a : b;
    var shorter = a.length > b.length ? b : a;
    var longIndex = 0;
    var shortIndex = 0;
    var skipped = false;
    while (longIndex < longer.length && shortIndex < shorter.length) {
      if (longer.charAt(longIndex) === shorter.charAt(shortIndex)) {
        longIndex += 1;
        shortIndex += 1;
      } else if (!skipped) {
        skipped = true;
        longIndex += 1;
      } else {
        return false;
      }
    }
    return true;
  }

  function boundedFuzzySource(value, maxChars) {
    var source = text(value);
    var limit = Math.max(1, Number(maxChars) || MAX_FUZZY_FIELD_CHARS);
    if (source.length <= limit) return source;
    source = source.slice(0, limit);
    // Do not treat the partial token at the scan boundary as a complete word.
    var index = source.length - 1;
    if (/[a-z0-9]/i.test(source.charAt(index))) {
      while (index >= 0 && /[a-z0-9]/i.test(source.charAt(index))) index -= 1;
      source = index < 0 ? '' : source.slice(0, index + 1);
    }
    return source;
  }

  function findTypoToken(value, word, maxChars) {
    if (!word || word.length < MIN_FUZZY_WORD_LENGTH || word.length > MAX_FUZZY_WORD_LENGTH) return null;
    var source = boundedFuzzySource(value, maxChars);
    var lower = source.toLowerCase();
    var pattern = /[a-z0-9]+/g;
    var match;
    while ((match = pattern.exec(lower))) {
      if (isOneEditTokenMatch(word, match[0])) {
        return { start: match.index, end: match.index + match[0].length };
      }
    }
    return null;
  }

  function findSubsequencePositions(value, word) {
    if (!word || word.length > MAX_FUZZY_WORD_LENGTH) return [];
    var haystack = text(value).toLowerCase();
    var positions = [];
    var from = 0;
    for (var i = 0; i < word.length; i += 1) {
      var found = haystack.indexOf(word.charAt(i), from);
      if (found < 0) return [];
      positions.push(found);
      from = found + 1;
    }
    return positions;
  }

  function appendPositionRanges(ranges, positions) {
    if (!positions.length) return;
    var start = positions[0];
    var end = start + 1;
    for (var i = 1; i < positions.length; i += 1) {
      if (positions[i] === end) {
        end += 1;
      } else {
        appendRangeIfFree(ranges, start, end);
        start = positions[i];
        end = start + 1;
      }
    }
    appendRangeIfFree(ranges, start, end);
  }

  function appendRangeIfFree(ranges, start, end) {
    if (ranges.length >= MAX_RANGES) return;
    var overlaps = ranges.some(function (range) { return start < range[1] && end > range[0]; });
    if (!overlaps) ranges.push([start, end]);
  }

  // A long query should not turn every record containing one common token
  // into a result. Keep single-token typo recovery, but require meaningful
  // query-term coverage once the user supplies a more specific query.
  function countCoveredWords(record, words, titleScores, pathScores, metaScores, bodyMatches) {
    return words.reduce(function (total, word, index) {
      var covered = titleScores[index] > 0
        || pathScores[index] > 0
        || (!record.locked && bodyMatches[index] === true)
        || (record.type !== 'page' && metaScores[index] > 0);
      return total + (covered ? 1 : 0);
    }, 0);
  }

  function requiredWordCoverage(wordCount) {
    if (wordCount <= 1) return 1;
    if (wordCount === 2) return 2;
    return Math.ceil(wordCount * 0.65);
  }

  // Earliest position (case-insensitive) of any query word inside text.
  function firstMatchPosition(value, words, fuzzyLimit) {
    var source = text(value);
    var h = source.toLowerCase();
    var fuzzyText = boundedFuzzySource(source, fuzzyLimit).toLowerCase();
    var best = -1;
    for (var i = 0; i < words.length; i += 1) {
      var found = words[i] ? h.indexOf(words[i]) : -1;
      if (found < 0 && words[i]) {
        var typo = findTypoToken(fuzzyText, words[i], fuzzyLimit);
        if (typo) found = typo.start;
        else {
          var positions = findSubsequencePositions(fuzzyText, words[i]);
          if (positions.length) found = positions[0];
        }
      }
      if (found >= 0 && (best < 0 || found < best)) best = found;
    }
    return best;
  }

  // Bounded contextual snippet with non-overlapping [start, end) match
  // ranges relative to the returned snippet text.
  function buildSnippet(value, words, maxLength, fuzzyLimit) {
    var source = text(value);
    var maxLen = Math.max(60, Number(maxLength) || SNIPPET_LENGTH);
    if (!source) return null;
    if (source.length <= maxLen) {
      return { text: source, ranges: collectRanges(source, words) };
    }
    var pos = firstMatchPosition(source, words, fuzzyLimit);
    var start = pos < 0 ? 0 : Math.max(0, pos - SNIPPET_CONTEXT);
    var end = Math.min(source.length, start + maxLen);
    if (end - start < maxLen) start = Math.max(0, end - maxLen);
    var slice = source.slice(start, end);
    // Trim partial words at the edges when we cut mid-token.
    if (start > 0) {
      var firstSpace = slice.indexOf(' ');
      if (firstSpace > 0 && firstSpace < SNIPPET_CONTEXT) slice = slice.slice(firstSpace + 1);
    }
    if (end < source.length) {
      var lastSpace = slice.lastIndexOf(' ');
      if (lastSpace > slice.length - SNIPPET_CONTEXT && lastSpace > 0) slice = slice.slice(0, lastSpace);
    }
    var prefix = start > 0 ? '…' : '';
    var suffix = (start + slice.length) < source.length ? '…' : '';
    var snippet = prefix + slice.trim() + suffix;
    return { text: snippet, ranges: collectRanges(snippet, words) };
  }

  // Collect non-overlapping [start, end) ranges for every query word inside
  // the final snippet text, so highlight offsets are correct by construction.
  function collectRanges(snippet, words) {
    var ranges = [];
    var lower = text(snippet).toLowerCase();
    var fuzzyText = boundedFuzzySource(snippet, MAX_FUZZY_FIELD_CHARS).toLowerCase();
    for (var w = 0; w < words.length; w += 1) {
      var word = words[w];
      if (!word) continue;
      var from = 0;
      while (ranges.length < MAX_RANGES) {
        var found = lower.indexOf(word, from);
        if (found < 0) break;
        var end = found + word.length;
        var overlaps = ranges.some(function (r) { return found < r[1] && end > r[0]; });
        if (!overlaps) ranges.push([found, end]);
        from = end;
      }
      if (lower.indexOf(word) < 0 && ranges.length < MAX_RANGES) {
        var typo = findTypoToken(fuzzyText, word, MAX_FUZZY_FIELD_CHARS);
        if (typo) appendRangeIfFree(ranges, typo.start, typo.end);
        else {
          var positions = findSubsequencePositions(fuzzyText, word);
          if (positions.length) appendPositionRanges(ranges, positions);
        }
      }
    }
    return ranges.sort(function (a, b) { return a[0] - b[0]; });
  }

  function metadataText(record) {
    var meta = record && record.metadata;
    if (!meta || typeof meta !== 'object') return '';
    var parts = [];
    Object.keys(meta).forEach(function (key) {
      if (key === 'context' || key === 'locked') return;
      var value = meta[key];
      if (value == null || value === '' || typeof value === 'boolean') return;
      if (Array.isArray(value)) { parts.push(value.join(' ')); return; }
      if (typeof value === 'object') return;
      parts.push(text(value));
    });
    return parts.join(' ');
  }

  function recencyBonus(timestamp, now) {
    if (!timestamp) return 0;
    var ageDays = Math.max(0, (now - timestamp) / 86400000);
    if (ageDays <= 7) return 8;
    if (ageDays <= 30) return 4;
    return 0;
  }

  function urgencyBonus(record, now) {
    if (record.type !== 'homework' && record.type !== 'task') return 0;
    var meta = record.metadata || {};
    if (meta.completed === true || meta.done === true) return -15;
    var due = text(meta.due || meta.date);
    if (!due) return 0;
    var parsed = Date.parse(due.length === 10 ? due + 'T23:59:59' : due);
    if (!Number.isFinite(parsed)) return 0;
    var diffDays = (parsed - now) / 86400000;
    if (diffDays < 0) return 10;
    if (diffDays <= 2) return 6;
    if (diffDays <= 7) return 3;
    return 0;
  }

  function normalizeRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var type = text(raw.type);
    if (!TYPE_LABELS.hasOwnProperty(type)) return null;
    var id = text(raw.sourceId || raw.id);
    if (!id) return null;
    var locked = raw.locked === true;
    var title = text(raw.title).trim();
    if (!title) return null;
    var settingsSearchScore = null;
    if (type === 'setting' && raw.settingsSearchScore != null && raw.settingsSearchScore !== '') {
      var parsedSettingsScore = Number(raw.settingsSearchScore);
      if (Number.isFinite(parsedSettingsScore)) {
        settingsSearchScore = Math.max(0, Math.min(300, parsedSettingsScore));
      }
    }
    return {
      sourceId: id,
      type: type,
      title: title,
      body: locked ? '' : text(raw.body),
      breadcrumb: text(raw.breadcrumb).trim(),
      metadata: (raw.metadata && typeof raw.metadata === 'object') ? raw.metadata : {},
      timestamp: Number(raw.timestamp) || 0,
      locked: locked,
      prematched: raw.prematched === true,
      settingsSearchScore: settingsSearchScore,
      action: typeof raw.action === 'function' ? raw.action : null
    };
  }

  function evaluateRecord(record, query, now) {
    var words = query.words;
    var phrase = query.phrase;
    var metadata = metadataText(record);
    var titleScores = scoreFieldMatches(record.title, words);
    var pathScores = scoreFieldMatches(record.breadcrumb, words);
    var metaScores = scoreFieldMatches(metadata, words);
    var titleBest = maxScore(titleScores);
    var titleHits = countPositiveScores(titleScores);
    var pathBest = maxScore(pathScores);
    var metaBest = maxScore(metaScores);
    var bodyLower = record.locked ? '' : record.body.toLowerCase();
    var bodyMatches = record.locked ? [] : bodyWordMatches(record.body, words, bodyLower);
    var bodyHitCount = bodyMatches.reduce(function (total, matched) { return total + (matched ? 1 : 0); }, 0);
    var bodyHits = Math.min(bodyHitCount, MAX_BODY_WORDS);
    var phraseInTitle = !!phrase && record.title.toLowerCase().indexOf(phrase) >= 0;
    var phraseInBody = !record.locked && !!phrase && bodyLower.indexOf(phrase) >= 0;

    var titleMatched = titleBest > 0 || pathBest > 0 || phraseInTitle;
    var bodyMatched = bodyHits > 0 || phraseInBody;
    var metaMatched = metaBest > 0;

    if (record.prematched) {
      // Already filtered by the owning module; never dropped, never ranked
      // above a strong direct match.
      var preScore = 30 + Math.round(bestFieldScore(record.title, [phrase]) * 0.5);
      if (record.type === 'setting' && Number.isFinite(record.settingsSearchScore)) {
        var directTitleScore = titleBest;
        if (phraseInTitle) {
          directTitleScore = Math.max(directTitleScore, bestFieldScore(record.title, [phrase]));
        }
        preScore = Math.max(record.settingsSearchScore, directTitleScore >= 400 ? directTitleScore : 0);
      }
      return {
        record: record,
        score: preScore,
        titleMatched: true,
        bodyMatched: false,
        matchKind: 'title',
        snippet: null
      };
    }

    // Qualification contract: pages qualify through title/location or note
    // body only (Pages=title/location, Notes=body). Other record types also
    // qualify through metadata alone — due dates, priority, category, time,
    // kind, MIME, and size are real search fields, not just ranking boosts.
    var qualified = titleMatched || bodyMatched || (record.type !== 'page' && metaMatched);
    if (!qualified) return null;

    var coveredWords = countCoveredWords(record, words, titleScores, pathScores, metaScores, bodyMatches);
    if (words.length > 1 && coveredWords < requiredWordCoverage(words.length)) return null;
    var allWords = coveredWords === words.length;

    var score = titleBest
      + (titleHits > 1 ? (titleHits - 1) * 40 : 0)
      + Math.min(pathBest * 0.35, 200)
      + Math.min(metaBest * 0.25, 150)
      + bodyHits * 22
      + (phraseInTitle ? 80 : 0)
      + (phraseInBody ? 25 : 0)
      + (allWords ? 45 : 0)
      + recencyBonus(record.timestamp, now)
      + urgencyBonus(record, now);

    var snippet = null;
    if (bodyMatched && !record.locked && record.body) {
      snippet = buildSnippet(record.body, words, SNIPPET_LENGTH, MAX_FUZZY_BODY_CHARS);
    }

    return {
      record: record,
      score: Math.round(score),
      titleMatched: titleMatched,
      bodyMatched: bodyMatched,
      matchKind: titleMatched ? 'title' : (bodyMatched ? 'body' : 'meta'),
      snippet: snippet
    };
  }

  function labelFor(hit, filter) {
    var record = hit.record;
    if (record.type === 'page') {
      if (filter === 'notes') return TYPE_LABELS.note;
      if (filter === 'pages') return TYPE_LABELS.page;
      return hit.matchKind === 'body' ? TYPE_LABELS.note : TYPE_LABELS.page;
    }
    return TYPE_LABELS[record.type] || 'Result';
  }

  function search(records, query, options) {
    var opts = options || {};
    var filter = FILTERS.hasOwnProperty(opts.filter) ? opts.filter : 'all';
    var limitDefault = filter === 'all' ? DEFAULT_LIMIT_ALL : DEFAULT_LIMIT_FILTERED;
    var limit = Math.max(1, Math.min(200, Number(opts.limit) || limitDefault));
    var now = Number(opts.now) || Date.now();
    var parsedQuery = normalizeQuery(query);

    if (!parsedQuery.phrase) {
      return { query: text(query), filter: filter, total: 0, results: [], counts: {} };
    }

    var seen = Object.create(null);
    var evaluated = [];
    var counts = Object.create(null);
    var source = Array.isArray(records) ? records : [];

    for (var i = 0; i < source.length; i += 1) {
      var record = normalizeRecord(source[i]);
      if (!record) continue;
      var key = record.type + ':' + record.sourceId;
      if (seen[key]) continue;
      seen[key] = true;
      var hit = evaluateRecord(record, parsedQuery, now);
      if (!hit) continue;
      counts[record.type] = (counts[record.type] || 0) + 1;
      if (filter !== 'all' && !FILTERS[filter](hit)) continue;
      evaluated.push(hit);
    }

    evaluated.sort(function (a, b) {
      return b.score - a.score
        || (b.record.timestamp || 0) - (a.record.timestamp || 0)
        || a.record.title.localeCompare(b.record.title);
    });

    var results = evaluated.slice(0, limit).map(function (hit) {
      var record = hit.record;
      return {
        id: record.type + ':' + record.sourceId,
        sourceId: record.sourceId,
        type: record.type,
        typeLabel: labelFor(hit, filter),
        title: record.title,
        breadcrumb: record.breadcrumb,
        snippet: hit.snippet,
        metadata: record.metadata,
        score: hit.score,
        matchKind: hit.matchKind,
        locked: record.locked,
        prematched: record.prematched,
        timestamp: record.timestamp,
        action: record.action
      };
    });

    return { query: text(query), filter: filter, total: evaluated.length, results: results, counts: counts };
  }

  var api = {
    VERSION: VERSION,
    search: search,
    buildSnippet: buildSnippet,
    scoreField: scoreField,
    normalizeQuery: normalizeQuery,
    TYPE_LABELS: TYPE_LABELS,
    FILTERS: Object.keys(FILTERS)
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SutraGlobalSearchEngine = api;
}(typeof window !== 'undefined' ? window : globalThis));
