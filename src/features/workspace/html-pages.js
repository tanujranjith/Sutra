(function (global) {
  'use strict';

  var root = null;
  var activePageId = '';
  var saveTimer = 0;
  var previewTimer = 0;
  var previewLoadTimer = 0;
  var previewRevision = 0;
  var sourceRevision = 0;
  var previewHasLoaded = false;
  var lastPreviewSource = null;
  var activePageReference = null;
  var activeDocumentReference = null;
  var contentTimelineTokens = new WeakMap();
  var timelinePickerSource = null;
  var timelinePickerEntries = [];
  var selectedTimelineIndex = -1;
  var timelineSelectionMode = 'auto';
  var timelinePickerTimer = 0;
  var timelineSourceWasVisible = false;
  var MAX_SOURCE_BYTES = 4 * 1024 * 1024;
  var MAX_SOURCE_HISTORY_STATES = 40;
  var MAX_SOURCE_HISTORY_BYTES = 9 * 1024 * 1024;
  var sourceHistory = null;
  var CONTENT_TIMELINE_ATTRIBUTE = 'data-sutra-content-timeline';
  var STARTER_SNIPPETS = {
    section: '\n<section>\n  <h2>Section title</h2>\n  <p>Add your content here.</p>\n</section>\n',
    checklist: '\n<section>\n  <h2>Checklist</h2>\n  <ul>\n    <li>First item</li>\n    <li>Second item</li>\n  </ul>\n</section>\n',
    callout: '\n<aside role="note" aria-label="Important note">\n  <strong>Remember</strong>\n  <p>Add a short note here.</p>\n</aside>\n'
  };

  function bridge() {
    var value = global.flowAtelier;
    if (!value || !Array.isArray(value.pages) || typeof value.persistAppData !== 'function') {
      throw new Error('HTML Pages requires the canonical Sutra workspace bridge.');
    }
    return value;
  }

  function id() {
    return 'html_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function authorized(page) {
    if (document.documentElement.getAttribute('data-sutra-workspace-locked') === 'true') return false;
    var value = bridge();
    return typeof value.isPageContentAuthorized === 'function'
      ? value.isPageContentAuthorized(page)
      : !!(page && !(page.isLocked && page.lockHash));
  }

  function canWritePage(page) {
    if (!page || !authorized(page)) return false;
    var value = bridge();
    if (typeof value.canWritePageContent === 'function') {
      try { return value.canWritePageContent(page) === true; } catch (_) { return false; }
    }
    return true;
  }

  function timelineHosts() {
    var hosts = global.SutraContentTimelineHosts;
    return hosts && typeof hosts.serializeMarkup === 'function' && typeof hosts.readMarkup === 'function' ? hosts : null;
  }

  function timelineHelper() {
    var helper = global.SutraContentTimeline;
    return helper && typeof helper.inspect === 'function' && typeof helper.normalize === 'function' ? helper : null;
  }

  function readHTMLTag(source, start) {
    var head = /^<\s*(\/?)\s*([a-z][a-z0-9:-]*)\b/i.exec(source.slice(start, start + 160));
    if (!head) return null;
    var quote = '';
    for (var end = start + head[0].length; end < source.length; end += 1) {
      var character = source.charAt(end);
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") quote = character;
      else if (character === '>') {
        return {
          start: start, end: end + 1, name: head[2].toLowerCase(), closing: !!head[1],
          selfClosing: /\/\s*>$/.test(source.slice(start, end + 1)),
          attributesStart: start + head[0].length
        };
      }
    }
    return null;
  }

  function tagHasTimelineAttribute(source, tag) {
    var index = tag.attributesStart;
    while (index < tag.end - 1) {
      while (index < tag.end && /\s/.test(source.charAt(index))) index += 1;
      if (source.charAt(index) === '/' || source.charAt(index) === '>') break;
      var nameStart = index;
      while (index < tag.end && !/[\s=/>]/.test(source.charAt(index))) index += 1;
      if (index === nameStart) { index += 1; continue; }
      var name = source.slice(nameStart, index).toLowerCase();
      if (name === CONTENT_TIMELINE_ATTRIBUTE) return true;
      while (index < tag.end && /\s/.test(source.charAt(index))) index += 1;
      if (source.charAt(index) !== '=') continue;
      index += 1;
      while (index < tag.end && /\s/.test(source.charAt(index))) index += 1;
      var quote = source.charAt(index);
      if (quote === '"' || quote === "'") {
        index += 1;
        while (index < tag.end && source.charAt(index) !== quote) index += 1;
        if (source.charAt(index) === quote) index += 1;
      } else {
        while (index < tag.end && !/[\s>]/.test(source.charAt(index))) index += 1;
      }
    }
    return false;
  }

  // Locate authored wrappers lexically without evaluating or inserting the
  // source into a live document. Raw-text and template contents are excluded.
  function scanHTMLSource(source) {
    var ranges = [];
    var sections = [];
    var safeText = [];
    var templateDepth = 0;
    var position = 0;
    var textStart = 0;
    var rawTag = '';
    var bodyStart = -1;
    var bodyClose = -1;
    var htmlClose = -1;
    var lower = source.toLowerCase();

    function addSafeText(end) {
      if (!rawTag && templateDepth === 0 && end >= textStart) safeText.push({ start: textStart, end: end });
    }

    while (position < source.length) {
      if (rawTag) {
        var searchFrom = position;
        var rawClose = -1;
        while (searchFrom >= 0) {
          var candidateClose = lower.indexOf('</' + rawTag, searchFrom);
          if (candidateClose < 0) break;
          var candidateTag = readHTMLTag(source, candidateClose);
          if (candidateTag && candidateTag.closing && candidateTag.name === rawTag) { rawClose = candidateClose; break; }
          searchFrom = candidateClose + 2;
        }
        if (rawClose < 0) break;
        addSafeText(rawClose);
        position = rawClose;
        textStart = rawClose;
        rawTag = '';
      }
      var open = source.indexOf('<', position);
      if (open < 0) { addSafeText(source.length); position = source.length; break; }
      addSafeText(open);
      if (source.slice(open, open + 4) === '<!--') {
        var commentEnd = source.indexOf('-->', open + 4);
        if (commentEnd < 0) { position = source.length; textStart = position; break; }
        position = commentEnd + 3;
        textStart = position;
        continue;
      }
      if (source.slice(open, open + 2) === '<!' || source.slice(open, open + 2) === '<?') {
        var declarationEnd = source.indexOf('>', open + 2);
        if (declarationEnd < 0) { position = source.length; textStart = position; break; }
        position = declarationEnd + 1;
        textStart = position;
        continue;
      }
      var tag = readHTMLTag(source, open);
      if (!tag) {
        position = open + 1;
        textStart = position;
        continue;
      }
      if (tag.name === 'template') {
        if (tag.closing) templateDepth = Math.max(0, templateDepth - 1);
        else templateDepth += 1;
      } else if (templateDepth === 0 && tag.name === 'section') {
        if (tag.closing) {
          var section = sections.pop();
          if (section && section.timeline) ranges.push({ start: section.start, end: tag.end });
        } else {
          sections.push({ start: tag.start, timeline: tagHasTimelineAttribute(source, tag) });
        }
      } else if (templateDepth === 0 && !tag.closing && tag.name === 'body' && bodyStart < 0) {
        bodyStart = tag.end;
      } else if (templateDepth === 0 && tag.closing && tag.name === 'body' && bodyClose < 0) {
        bodyClose = tag.start;
      } else if (templateDepth === 0 && tag.closing && tag.name === 'html' && htmlClose < 0) {
        htmlClose = tag.start;
      }
      position = tag.end;
      textStart = position;
      if (!tag.closing && templateDepth === 0 && ['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext'].indexOf(tag.name) >= 0) rawTag = tag.name;
    }

    if (!rawTag && templateDepth === 0 && textStart === source.length) safeText.push({ start: source.length, end: source.length });
    ranges.sort(function (a, b) { return a.start - b.start; });
    return { ranges: ranges, safeText: safeText, bodyStart: bodyStart, bodyClose: bodyClose, htmlClose: htmlClose };
  }

  function isSafeHTMLTextOffset(scan, offset) {
    return scan.safeText.some(function (range) { return offset >= range.start && offset <= range.end; });
  }

  function timelineEntriesForSource(source) {
    var hosts = timelineHosts();
    if (!hosts || typeof global.DOMParser !== 'function') return [];
    var scan = scanHTMLSource(source);
    var parsed;
    try { parsed = new global.DOMParser().parseFromString(source, 'text/html'); } catch (_) { return []; }
    var nodes = Array.prototype.filter.call(parsed.querySelectorAll('section[' + CONTENT_TIMELINE_ATTRIBUTE + ']'), function (node) {
      return node.tagName && node.tagName.toLowerCase() === 'section';
    });
    if (nodes.length !== scan.ranges.length) return [];
    var entries = [];
    for (var index = 0; index < nodes.length; index += 1) {
      var read = hosts.readMarkup(nodes[index]);
      if (!read || !scan.ranges[index]) return [];
      var rawMarkup = source.slice(scan.ranges[index].start, scan.ranges[index].end);
      var isolated;
      try {
        var isolatedDocument = new global.DOMParser().parseFromString(rawMarkup, 'text/html');
        isolated = hosts.readMarkup(isolatedDocument.body);
      } catch (_) { return []; }
      var serializedRead;
      var serializedIsolated;
      try {
        serializedRead = JSON.stringify(read.model);
        serializedIsolated = JSON.stringify(isolated && isolated.model);
      } catch (_) { return []; }
      if (serializedRead !== serializedIsolated) return [];
      entries.push({ model: read.model, status: read.status, start: scan.ranges[index].start, end: scan.ranges[index].end, raw: rawMarkup });
    }
    return entries;
  }

  function canWriteCurrentPage(page) {
    var value = bridge();
    return !!(page && canWritePage(page) && String(value.currentPageId || '') === String(page.id));
  }

  function normalizeDocument(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var now = new Date().toISOString();
    var createdAt = typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : now;
    return Object.assign({}, raw, {
      version: 1,
      source: typeof raw.source === 'string' ? raw.source : String(raw.source || ''),
      createdAt: createdAt,
      updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : createdAt
    });
  }

  function pageForCurrentRoute() {
    var value = bridge();
    var pageId = value.currentPageId || '';
    var page = value.pages.find(function (item) { return item && item.id === pageId; }) || null;
    return page && authorized(page) ? page : null;
  }

  function documentFor(page) {
    return page ? normalizeDocument(page.htmlDocument) : null;
  }

  function setVisible(visible) {
    if (!root) return;
    root.hidden = !visible;
    root.toggleAttribute('inert', !visible);
    root.setAttribute('aria-hidden', visible ? 'false' : 'true');
    document.body.classList.toggle('html-page-active', visible);
  }

  function setStatus(message, state) {
    if (!root) return;
    var output = root.querySelector('[data-html-save-status]');
    if (!output) return;
    output.textContent = message;
    output.dataset.state = state || '';
  }

  function setPreviewStatus(message, state) {
    if (!root) return;
    var output = root.querySelector('[data-html-preview-status]');
    if (!output) return;
    output.textContent = message;
    output.dataset.state = state || '';
    output.setAttribute('role', state === 'error' ? 'alert' : 'status');
  }

  function formatSourceSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function updateSourceSize(source, knownSize) {
    if (!root) return;
    var output = root.querySelector('[data-html-source-size]');
    if (!output) return;
    var size = Number.isFinite(knownSize) ? knownSize : new Blob([String(source == null ? '' : source)]).size;
    output.textContent = formatSourceSize(size) + ' / 4 MB';
    output.dataset.state = size > MAX_SOURCE_BYTES ? 'error' : '';
  }

  function sourceHistoryState(source, editor) {
    var start = 0;
    var end = 0;
    try {
      start = editor ? Number(editor.selectionStart) || 0 : 0;
      end = editor ? Number(editor.selectionEnd) || start : start;
    } catch (_) {}
    return {
      source: String(source == null ? '' : source),
      bytes: new Blob([String(source == null ? '' : source)]).size,
      selectionStart: start,
      selectionEnd: end,
      scrollTop: editor ? Number(editor.scrollTop) || 0 : 0,
      scrollLeft: editor ? Number(editor.scrollLeft) || 0 : 0
    };
  }

  function currentSpaceScope(value) {
    var spaceId = value && value.activeSpaceId;
    try {
      if (value && typeof value.getActiveSpaceId === 'function') spaceId = value.getActiveSpaceId();
    } catch (_) {}
    return String(spaceId || 'default');
  }

  function resetSourceHistory(page, source, editor) {
    if (!page || !page.htmlDocument) {
      sourceHistory = null;
      syncSourceHistoryControls();
      return;
    }
    var value;
    try { value = bridge(); } catch (_) { sourceHistory = null; syncSourceHistoryControls(); return; }
    var state = sourceHistoryState(source, editor);
    sourceHistory = {
      page: page,
      document: page.htmlDocument,
      pageId: String(page.id || ''),
      spaceId: currentSpaceScope(value),
      states: [state],
      cursor: 0,
      bytes: state.bytes
    };
    syncSourceHistoryControls();
  }

  function sourceHistoryMatchesPage(history, page, value) {
    return !!(history && page && page.htmlDocument && value &&
      history.page === page && history.document === page.htmlDocument &&
      history.pageId === String(page.id || '') && history.spaceId === currentSpaceScope(value));
  }

  function ensureSourceHistory(page, editor) {
    var value = bridge();
    var baseline = String(page.htmlDocument.source == null ? '' : page.htmlDocument.source);
    if (!sourceHistoryMatchesPage(sourceHistory, page, value) ||
        !sourceHistory.states[sourceHistory.cursor] || sourceHistory.states[sourceHistory.cursor].source !== baseline) {
      resetSourceHistory(page, baseline, editor);
    }
    return sourceHistory;
  }

  function recordSourceHistory(page, source, editor) {
    var history = ensureSourceHistory(page, editor);
    var current = history.states[history.cursor];
    var next = sourceHistoryState(source, editor);
    if (current && current.source === next.source) return;
    if (history.cursor < history.states.length - 1) {
      history.states.slice(history.cursor + 1).forEach(function (state) { history.bytes -= state.bytes; });
      history.states.length = history.cursor + 1;
    }
    history.states.push(next);
    history.cursor = history.states.length - 1;
    history.bytes += next.bytes;
    while (history.states.length > MAX_SOURCE_HISTORY_STATES || history.bytes > MAX_SOURCE_HISTORY_BYTES) {
      if (history.cursor > 0) {
        var removed = history.states.shift();
        history.bytes -= removed.bytes;
        history.cursor -= 1;
      } else if (history.states.length > 1) {
        var future = history.states.pop();
        history.bytes -= future.bytes;
      } else break;
    }
    syncSourceHistoryControls();
  }

  function currentSourceHistory() {
    try {
      var page = pageForCurrentRoute();
      var editor = root && root.querySelector('[data-html-source]');
      var value = bridge();
      if (!page || !editor || !root || root.hidden || !canWriteCurrentPage(page) ||
          !sourceHistoryMatchesPage(sourceHistory, page, value)) return null;
      var state = sourceHistory.states[sourceHistory.cursor];
      if (!state || String(editor.value || '') !== state.source || String(page.htmlDocument.source || '') !== state.source) return null;
      return { page: page, editor: editor, history: sourceHistory, state: state };
    } catch (_) { return null; }
  }

  function syncSourceHistoryControls() {
    if (!root) return;
    var undo = root.querySelector('[data-html-source-undo]');
    var redo = root.querySelector('[data-html-source-redo]');
    if (!undo || !redo) return;
    var current = currentSourceHistory();
    undo.disabled = !current || current.history.cursor <= 0;
    redo.disabled = !current || current.history.cursor >= current.history.states.length - 1;
  }

  function applySourceHistory(direction, keepEditorFocus) {
    var current = currentSourceHistory();
    if (!current) return false;
    var history = current.history;
    var nextCursor = direction === 'undo' ? history.cursor - 1 : history.cursor + 1;
    if (nextCursor < 0 || nextCursor >= history.states.length) return false;
    var editor = current.editor;
    var priorValue = editor.value;
    var target = history.states[nextCursor];
    editor.value = target.source;
    if (!updateSource(target.source, { history: false })) {
      editor.value = priorValue;
      updateSourceSize(priorValue);
      syncSourceHistoryControls();
      return false;
    }
    history.cursor = nextCursor;
    try {
      editor.setSelectionRange(
        Math.min(target.selectionStart, target.source.length),
        Math.min(target.selectionEnd, target.source.length)
      );
      editor.scrollTop = target.scrollTop;
      editor.scrollLeft = target.scrollLeft;
    } catch (_) {}
    if (keepEditorFocus) editor.focus();
    syncSourceHistoryControls();
    return true;
  }

  function reconcileNativeHistoryInput(source, inputType) {
    if (!sourceHistory || (inputType !== 'historyUndo' && inputType !== 'historyRedo')) return false;
    var page;
    var value;
    try { page = pageForCurrentRoute(); value = bridge(); } catch (_) { return false; }
    if (!sourceHistoryMatchesPage(sourceHistory, page, value)) return false;
    var step = inputType === 'historyUndo' ? -1 : 1;
    for (var index = sourceHistory.cursor + step; index >= 0 && index < sourceHistory.states.length; index += step) {
      if (sourceHistory.states[index].source === source) {
        sourceHistory.cursor = index;
        return true;
      }
    }
    return false;
  }

  function handleSourceInput(event) {
    var source = String(event.target.value || '');
    var previousCursor = sourceHistory && sourceHistory.cursor;
    var reconciled = reconcileNativeHistoryInput(source, event.inputType || '');
    if (!updateSource(source, reconciled ? { history: false } : undefined)) {
      if (reconciled && sourceHistory) sourceHistory.cursor = previousCursor;
      syncSourceHistoryControls();
      return;
    }
    syncSourceHistoryControls();
  }

  function handleSourceHistoryShortcut(event) {
    if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) ||
        String(event.key || '').toLowerCase() !== 'z') return;
    var current = currentSourceHistory();
    if (!current) return;
    event.preventDefault();
    applySourceHistory(event.shiftKey ? 'redo' : 'undo', true);
  }

  function showPreviewMessage(message, state) {
    previewHasLoaded = false;
    var host = root && root.querySelector('[data-html-preview]');
    if (host) {
      var notice = document.createElement('p');
      notice.className = 'html-page-preview-message';
      notice.textContent = message;
      notice.setAttribute('aria-hidden', 'true');
      host.replaceChildren(notice);
    }
    setPreviewStatus(message, state);
  }

  function sourceHasBlockedAssets(source) {
    var attr = /\b(?:src|href|poster|action)\s*=\s*(["'])(.*?)\1/gi;
    var match;
    while ((match = attr.exec(String(source || '')))) {
      var url = String(match[2] || '').trim();
      if (!url || url.charAt(0) === '#' || /^data:/i.test(url)) continue;
      return true;
    }
    var cssUrl = /\burl\(\s*(["']?)(.*?)\1\s*\)/gi;
    while ((match = cssUrl.exec(String(source || '')))) {
      var cssValue = String(match[2] || '').trim();
      if (cssValue && cssValue.charAt(0) !== '#' && !/^data:/i.test(cssValue)) return true;
    }
    return false;
  }

  function updateAssetWarning(source) {
    var warning = root && root.querySelector('[data-html-asset-warning]');
    if (!warning) return;
    warning.hidden = !sourceHasBlockedAssets(source);
  }

  function renderPreview(force) {
    if (!root || root.hidden) return;
    var page = pageForCurrentRoute();
    var model = documentFor(page);
    if (!model) {
      global.clearTimeout(previewLoadTimer);
      previewRevision += 1;
      showPreviewMessage('Open an HTML Page to see its preview.', 'empty');
      return;
    }
    if (!force && model.source === lastPreviewSource && previewHasLoaded) {
      setPreviewStatus('Preview ready · isolated offline sandbox', 'ready');
      return;
    }
    global.clearTimeout(previewLoadTimer);
    var revision = ++previewRevision;
    var editor = root.querySelector('[data-html-source]');
    if (editor && editor.value !== model.source && new Blob([editor.value]).size > MAX_SOURCE_BYTES) {
      setPreviewStatus('Preview shows the last saved source; the current draft exceeds 4 MB.', 'error');
      return;
    }
    lastPreviewSource = model.source;
    previewHasLoaded = false;
    var host = root.querySelector('[data-html-preview]');
    updateAssetWarning(model.source);
    if (!host || !global.SutraDOMSafety || typeof global.SutraDOMSafety.renderUserHTMLToFrame !== 'function') {
      showPreviewMessage('The preview safety layer is unavailable. Your source is still available to edit or export.', 'error');
      return;
    }
    if (!String(model.source || '').trim()) {
      showPreviewMessage('This HTML Page is empty. Edit the source or import an .html file to get started.', 'empty');
      return;
    }
    setPreviewStatus('Updating offline preview…', 'loading');
    var frame;
    try {
      frame = global.SutraDOMSafety.renderUserHTMLToFrame(host, model.source, {
        title: (page.title || 'HTML page') + ' preview',
        mode: 'active-local',
        capabilityAcknowledged: true,
        referrerPolicy: 'no-referrer',
        height: '100%'
      });
    } catch (_) {
      showPreviewMessage('The preview could not be prepared. Your source is unchanged; refresh to try again.', 'error');
      return;
    }
    if (!frame) {
      showPreviewMessage('The preview could not be prepared. Your source is unchanged; refresh to try again.', 'error');
      return;
    }
    frame.addEventListener('load', function () {
      if (revision !== previewRevision || root.hidden) return;
      previewHasLoaded = true;
      global.clearTimeout(previewLoadTimer);
      setPreviewStatus('Preview ready · isolated offline sandbox', 'ready');
    }, { once: true });
    frame.addEventListener('error', function () {
      if (revision !== previewRevision || root.hidden) return;
      previewHasLoaded = false;
      global.clearTimeout(previewLoadTimer);
      setPreviewStatus('Preview failed to load. Your source is unchanged; refresh to try again.', 'error');
    }, { once: true });
    previewLoadTimer = global.setTimeout(function () {
      if (revision !== previewRevision || root.hidden) return;
      setPreviewStatus('Preview is taking longer than expected. Your source is unchanged; refresh to try again.', 'error');
    }, 5000);
  }

  function schedulePreview() {
    global.clearTimeout(previewTimer);
    previewTimer = global.setTimeout(function () { renderPreview(false); }, 260);
  }

  function persistCurrentPage() {
    global.clearTimeout(saveTimer);
    saveTimer = 0;
    try {
      var value = bridge();
      value.persistAppData();
      var result = typeof value.flushAppSaveNow === 'function' ? value.flushAppSaveNow('html-page-edit') : null;
      if (result && typeof result.then === 'function') {
        result.then(function () { setStatus('Saved locally', 'saved'); }).catch(function () {
          setStatus('Not saved — your code is still in the editor', 'error');
        });
      } else {
        setStatus('Saved locally', 'saved');
      }
    } catch (error) {
      setStatus('Not saved — your code is still in the editor', 'error');
    }
  }

  function updateSource(source, options) {
    var page = pageForCurrentRoute();
    if (!page || !page.htmlDocument || !canWriteCurrentPage(page)) return false;
    var value = String(source == null ? '' : source);
    var size = new Blob([value]).size;
    updateSourceSize(value, size);
    global.clearTimeout(previewLoadTimer);
    previewRevision += 1;
    if (size > MAX_SOURCE_BYTES) {
      setStatus('HTML must be 4 MB or smaller', 'error');
      setPreviewStatus('Source is over the 4 MB limit. Shorten it before previewing.', 'error');
      return false;
    }
    if (!options || options.history !== false) {
      var sourceEditor = root && root.querySelector('[data-html-source]');
      recordSourceHistory(page, value, sourceEditor);
    }
    sourceRevision += 1;
    if (!options || options.preserveTimelineSelection !== true) {
      selectedTimelineIndex = -1;
      timelineSelectionMode = 'auto';
    }
    var now = new Date().toISOString();
    page.htmlDocument.source = value;
    page.htmlDocument.updatedAt = now;
    page.updatedAt = now;
    setStatus('Saving…', 'saving');
    setPreviewStatus('Source changed — updating preview…', 'loading');
    global.clearTimeout(saveTimer);
    saveTimer = global.setTimeout(persistCurrentPage, 450);
    schedulePreview();
    scheduleTimelinePickerRefresh();
    syncSourceHistoryControls();
    return true;
  }

  function refreshTimelinePicker() {
    var editor = root && root.querySelector('[data-html-source]');
    var picker = root && root.querySelector('[data-html-timeline-picker]');
    var wrapper = root && root.querySelector('[data-html-timeline-picker-wrap]');
    if (!editor || !picker || !wrapper) return [];
    var source = String(editor.value || '');
    if (timelinePickerSource === source) {
      wrapper.hidden = true;
      return timelinePickerEntries;
    }
    timelinePickerSource = source;
    timelinePickerEntries = timelineEntriesForSource(source);
    if (selectedTimelineIndex >= timelinePickerEntries.length) selectedTimelineIndex = -1;
    wrapper.hidden = true;
    picker.replaceChildren();
    timelinePickerEntries.forEach(function (entry, index) {
      var option = document.createElement('option');
      option.value = String(index);
      var model = entry.model;
      var title = model && typeof model.title === 'string' ? model.title : '';
      option.textContent = 'Timeline ' + (index + 1) + (title ? ' — ' + title.slice(0, 80) : '');
      picker.appendChild(option);
    });
    if (selectedTimelineIndex >= 0) picker.value = String(selectedTimelineIndex);
    else if (timelinePickerEntries.length) picker.selectedIndex = -1;
    return timelinePickerEntries;
  }

  function scheduleTimelinePickerRefresh() {
    global.clearTimeout(timelinePickerTimer);
    timelinePickerTimer = global.setTimeout(function () {
      refreshTimelinePicker();
      inferTimelineFromSourceSelection();
    }, 300);
  }

  function inferTimelineFromSourceSelection() {
    var editor = root && root.querySelector('[data-html-source]');
    var picker = root && root.querySelector('[data-html-timeline-picker]');
    if (!editor || !picker) return -1;
    var start = Number(editor.selectionStart);
    var end = Number(editor.selectionEnd);
    var matching = [];
    timelinePickerEntries.forEach(function (entry, index) {
      var intersects = start === end
        ? start >= entry.start && start <= entry.end
        : start < entry.end && end > entry.start;
      if (intersects) matching.push(index);
    });
    if (matching.length === 1) {
      selectedTimelineIndex = matching[0];
      timelineSelectionMode = 'source';
      picker.value = String(selectedTimelineIndex);
      return selectedTimelineIndex;
    }
    return -1;
  }

  function selectedTimelineEntry() {
    var entries = refreshTimelinePicker();
    if (!entries.length) return null;
    var inferred = timelineSelectionMode === 'picker' ? -1 : inferTimelineFromSourceSelection();
    var index = inferred >= 0 ? inferred : selectedTimelineIndex;
    if (timelineSelectionMode === 'source' && inferred < 0) return null;
    if (index < 0 || index >= entries.length) return null;
    return { entry: entries[index], index: index };
  }

  function captureContentTimelineToken(kind, entry) {
    var page = pageForCurrentRoute();
    var editor = root && root.querySelector('[data-html-source]');
    var value = bridge();
    if (!page || !page.htmlDocument || !editor || root.hidden || !canWriteCurrentPage(page)) return null;
    var source = String(editor.value || '');
    if (page.htmlDocument.source !== source) return null;
    var scan = scanHTMLSource(source);
    var token = {};
    var state = {
      kind: kind, page: page, document: page.htmlDocument, pageId: page.id,
      spaceId: String(value.activeSpaceId || 'default'), source: source,
      sourceRevision: sourceRevision, editor: editor,
      selectionStart: Number(editor.selectionStart), selectionEnd: Number(editor.selectionEnd),
      start: entry ? entry.start : -1, end: entry ? entry.end : -1,
      raw: entry ? entry.raw : '', modelSnapshot: entry ? JSON.stringify(entry.model) : '',
      timelineIndex: entry ? entry.index : -1,
      insertOffset: entry ? -1 : chooseTimelineInsertionOffset(source, scan, editor)
    };
    if (!entry && (state.insertOffset < 0 || !isSafeHTMLTextOffset(scan, state.insertOffset))) return null;
    contentTimelineTokens.set(token, state);
    return token;
  }

  function chooseTimelineInsertionOffset(source, scan, editor) {
    var start = Number(editor.selectionStart);
    var end = Number(editor.selectionEnd);
    var insideTimeline = scan.ranges.some(function (range) { return start > range.start && start < range.end; });
    var insideBody = scan.bodyStart < 0 ? scan.htmlClose < 0 : start >= scan.bodyStart && (scan.bodyClose < 0 || start <= scan.bodyClose);
    if (start === end && start > 0 && insideBody && !insideTimeline && isSafeHTMLTextOffset(scan, start)) return start;
    if (scan.bodyClose >= 0) return scan.bodyClose;
    if (scan.htmlClose >= 0) return scan.htmlClose;
    if (isSafeHTMLTextOffset(scan, source.length)) return source.length;
    return -1;
  }

  function currentTokenState(token, kind) {
    if (!token || typeof token !== 'object' || !contentTimelineTokens.has(token)) return null;
    var state = contentTimelineTokens.get(token);
    if (state.kind !== kind) return null;
    var page = pageForCurrentRoute();
    var editor = root && root.querySelector('[data-html-source]');
    var value = bridge();
    if (!page || page !== state.page || page.htmlDocument !== state.document ||
        String(page.id) !== String(state.pageId) || editor !== state.editor || root.hidden ||
        String(value.activeSpaceId || 'default') !== state.spaceId || !canWriteCurrentPage(page) ||
        sourceRevision !== state.sourceRevision || String(editor.value || '') !== state.source ||
        Number(editor.selectionStart) !== state.selectionStart || Number(editor.selectionEnd) !== state.selectionEnd ||
        page.htmlDocument.source !== state.source) return null;
    if (kind === 'update') {
      var entries = timelineEntriesForSource(state.source);
      var current = entries[state.timelineIndex];
      var snapshot;
      try { snapshot = current && JSON.stringify(current.model); } catch (_) { return null; }
      if (!current || current.start !== state.start || current.end !== state.end ||
          current.raw !== state.raw || snapshot !== state.modelSnapshot) return null;
    }
    return state;
  }

  function captureContentTimelineInsertion() {
    return captureContentTimelineToken('insert', null);
  }

  function insertContentTimeline(model, token) {
    var helper = timelineHelper();
    var hosts = timelineHosts();
    if (!helper || !hosts) return false;
    try { var status = helper.inspect(model); if (!status || !status.supported || status.readOnly) return false; } catch (_) { return false; }
    if (token == null) token = captureContentTimelineInsertion();
    var state = currentTokenState(token, 'insert');
    if (!state || state.insertOffset < 0) return false;
    var markup = hosts.serializeMarkup(model, { nonEditable: true });
    if (!markup) return false;
    var updated = state.source.slice(0, state.insertOffset) + markup + state.source.slice(state.insertOffset);
    if (new Blob([updated]).size > MAX_SOURCE_BYTES) {
      setStatus('This timeline would make the HTML source larger than 4 MB.', 'error');
      return false;
    }
    contentTimelineTokens.delete(token);
    var editor = state.editor;
    editor.setRangeText(markup, state.insertOffset, state.insertOffset, 'end');
    if (!updateSource(editor.value, { preserveTimelineSelection: true })) {
      editor.value = state.source;
      updateSourceSize(state.source);
      return false;
    }
    refreshTimelinePicker();
    var insertedIndex = timelinePickerEntries.findIndex(function (entry) { return entry.start === state.insertOffset; });
    if (insertedIndex >= 0) {
      selectedTimelineIndex = insertedIndex;
      timelineSelectionMode = 'picker';
      var picker = root.querySelector('[data-html-timeline-picker]');
      if (picker) picker.value = String(insertedIndex);
    }
    editor.focus();
    return true;
  }

  function getContentTimelineSelection() {
    var selected = selectedTimelineEntry();
    if (!selected) return null;
    var entry = Object.assign({}, selected.entry, { index: selected.index });
    var token = captureContentTimelineToken('update', entry);
    return token ? { model: selected.entry.model, token: token } : null;
  }

  function updateContentTimeline(token, model) {
    var helper = timelineHelper();
    var hosts = timelineHosts();
    var state = currentTokenState(token, 'update');
    if (!state || !helper || !hosts) return false;
    try { if (!helper.inspect(JSON.parse(state.modelSnapshot)).supported) return false; } catch (_) { return false; }
    try { var status = helper.inspect(model); if (!status || !status.supported || status.readOnly) return false; } catch (_) { return false; }
    var markup = hosts.serializeMarkup(model, { nonEditable: true });
    if (!markup) return false;
    var updated = state.source.slice(0, state.start) + markup + state.source.slice(state.end);
    if (new Blob([updated]).size > MAX_SOURCE_BYTES) {
      setStatus('This timeline would make the HTML source larger than 4 MB.', 'error');
      return false;
    }
    contentTimelineTokens.delete(token);
    var editor = state.editor;
    editor.setRangeText(markup, state.start, state.end, 'end');
    if (!updateSource(editor.value, { preserveTimelineSelection: true })) {
      editor.value = state.source;
      updateSourceSize(state.source);
      return false;
    }
    selectedTimelineIndex = state.timelineIndex;
    timelineSelectionMode = 'picker';
    refreshTimelinePicker();
    var picker = root.querySelector('[data-html-timeline-picker]');
    if (picker && selectedTimelineIndex < timelinePickerEntries.length) picker.value = String(selectedTimelineIndex);
    editor.focus();
    return true;
  }

  function isSourceVisible() {
    var panel = root && root.querySelector('.html-page-code');
    return !!(root && !root.hidden && panel && panel.getClientRects().length);
  }

  function refreshTimelineAuthoringControls() {
    if (!root) return;
    timelineSourceWasVisible = isSourceVisible();
    var picker = root.querySelector('[data-html-timeline-picker-wrap]');
    if (picker) picker.hidden = true;
    var hosts = timelineHosts();
    if (hosts && typeof hosts.refresh === 'function') hosts.refresh();
  }

  function onTimelineAuthoringResize() {
    if (isSourceVisible() !== timelineSourceWasVisible) refreshTimelineAuthoringControls();
  }

  function updateModeControls() {
    if (!root) return;
    var mode = root.dataset.layout || 'preview';
    var labels = { code: 'Code only', preview: 'Preview only', split: 'Split view' };
    root.querySelectorAll('[data-html-layout]').forEach(function (button) {
      var selected = button.dataset.htmlLayout === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    root.querySelectorAll('[data-html-panel]').forEach(function (button) {
      var selected = button.dataset.htmlPanel === root.dataset.mobilePanel;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
    });
    var modeStatus = root.querySelector('[data-html-layout-status]');
    if (modeStatus) modeStatus.textContent = labels[mode] || labels.preview;
    var editButton = root.querySelector('[data-html-edit-source]');
    if (editButton) {
      var sourceVisible = mode !== 'preview';
      editButton.textContent = sourceVisible ? 'Close source' : 'Edit source';
      editButton.setAttribute('aria-expanded', sourceVisible ? 'true' : 'false');
    }
    refreshTimelineAuthoringControls();
  }

  function setLayoutMode(mode, focusEditor) {
    if (!root) return;
    var next = mode === 'code' || mode === 'split' ? mode : 'preview';
    root.dataset.layout = next;
    root.dataset.sourceOpen = next === 'preview' ? 'false' : 'true';
    if (next === 'code') root.dataset.mobilePanel = 'code';
    else root.dataset.mobilePanel = 'preview';
    updateModeControls();
    if (next === 'code' && focusEditor !== false) {
      global.setTimeout(function () {
        var editor = root && root.querySelector('[data-html-source]');
        if (editor) editor.focus();
      }, 0);
    } else {
      renderPreview(true);
    }
  }

  function setMobilePanel(panel, focusEditor) {
    setLayoutMode(panel === 'code' ? 'code' : 'preview', focusEditor);
  }

  function setSourceMode(open) {
    setLayoutMode(open ? 'code' : 'preview');
  }

  function moveMobileTabFocus(event) {
    var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-html-panel]'));
    if (!buttons.length) return;
    var index = buttons.indexOf(event.currentTarget);
    var nextIndex = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % buttons.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = buttons.length - 1;
    if (nextIndex < 0) return;
    event.preventDefault();
    setMobilePanel(buttons[nextIndex].dataset.htmlPanel, false);
    buttons[nextIndex].focus();
  }

  function closeOverflowMenu(returnFocus) {
    var menu = root && root.querySelector('[data-html-overflow]');
    var trigger = menu && menu.querySelector('summary');
    if (!menu || !menu.open) return;
    menu.open = false;
    if (returnFocus && trigger) {
      try { trigger.focus({ preventScroll: true }); } catch (_) { trigger.focus(); }
    }
  }

  function handleOverflowMenuKeydown(event) {
    if (event.key !== 'Escape' || !root) return;
    var menu = root.querySelector('[data-html-overflow]');
    if (!menu || !menu.open || !menu.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    closeOverflowMenu(true);
  }

  function handleOverflowOutsidePointerDown(event) {
    var menu = root && root.querySelector('[data-html-overflow]');
    if (menu && menu.open && !menu.contains(event.target)) closeOverflowMenu(false);
  }

  function handleOverflowFocusOut(menu) {
    global.setTimeout(function () {
      if (menu && menu.open && !menu.contains(document.activeElement)) closeOverflowMenu(false);
    }, 0);
  }

  function importFile(file) {
    if (!file) return;
    var owner = pageForCurrentRoute(); var revision = previewRevision;
    if (!owner || !documentFor(owner) || !root || root.hidden) return;
    if (!/\.html?$/i.test(file.name || '')) {
      setStatus('Choose an .html or .htm file', 'error');
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setStatus('HTML must be 4 MB or smaller', 'error');
      return;
    }
    setStatus('Reading HTML file…', 'saving');
    file.text().then(function (source) {
      if (pageForCurrentRoute() !== owner || previewRevision !== revision || !root || root.hidden) return;
      var editor = root && root.querySelector('[data-html-source]');
      if (editor) {
        var previousSource = editor.value;
        editor.value = source;
        if (!updateSource(source)) {
          editor.value = previousSource;
          updateSourceSize(previousSource);
          return;
        }
        setStatus('Imported — saving…', 'saving');
        renderPreview(true);
      }
    }).catch(function () {
      if (pageForCurrentRoute() !== owner || previewRevision !== revision || !root || root.hidden) return;
      setStatus('Could not read that HTML file', 'error');
    });
  }

  function safeExportFilename(title) {
    var name = String(title || 'html-page').trim()
      .replace(/\.html?$/i, '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 80);
    return (name || 'html-page') + '.html';
  }

  function exportSource() {
    var page = pageForCurrentRoute();
    var model = documentFor(page);
    var editor = root && root.querySelector('[data-html-source]');
    if (!page || !model || !editor) {
      setStatus('Open an HTML Page before exporting its source.', 'error');
      return;
    }
    var source = String(editor.value == null ? model.source : editor.value);
    if (new Blob([source]).size > MAX_SOURCE_BYTES) {
      setStatus('This draft is over 4 MB and cannot be exported yet.', 'error');
      return;
    }
    var objectUrl = '';
    var link = document.createElement('a');
    try {
      objectUrl = global.URL.createObjectURL(new Blob([source], { type: 'text/html;charset=utf-8' }));
      link.href = objectUrl;
      link.download = safeExportFilename(page.title);
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      global.setTimeout(function () { global.URL.revokeObjectURL(objectUrl); }, 1000);
      setStatus('HTML download prepared — check your downloads.', 'saved');
    } catch (_) {
      if (link.parentNode) link.parentNode.removeChild(link);
      if (objectUrl) global.URL.revokeObjectURL(objectUrl);
      setStatus('Could not prepare the HTML download. Your source is unchanged.', 'error');
    }
  }

  function insertStarterSnippet() {
    var editor = root && root.querySelector('[data-html-source]');
    var chooser = root && root.querySelector('[data-html-starter]');
    var snippet = chooser && STARTER_SNIPPETS[chooser.value];
    if (!editor || !snippet) return;

    var source = editor.value;
    var start = editor.selectionStart;
    var end = editor.selectionEnd;
    if (start === end) {
      var bodyEnd = source.toLowerCase().lastIndexOf('</body>');
      start = bodyEnd >= 0 ? bodyEnd : source.length;
      end = start;
    }
    var candidate = source.slice(0, start) + snippet + source.slice(end);
    if (new Blob([candidate]).size > MAX_SOURCE_BYTES) {
      setStatus('That starter would exceed the 4 MB source limit.', 'error');
      return;
    }

    editor.setRangeText(snippet, start, end, 'end');
    editor.focus();
    chooser.value = '';
    if (typeof global.refreshCustomSelects === 'function') global.refreshCustomSelects(chooser);
    if (!updateSource(editor.value)) {
      editor.value = source;
      updateSourceSize(source);
    }
  }

  function mount() {
    if (root) return root;
    root = document.createElement('section');
    root.id = 'htmlPageEditor';
    root.className = 'html-page-editor';
    root.hidden = true;
    root.dataset.layout = 'preview';
    root.dataset.sourceOpen = 'false';
    root.dataset.mobilePanel = 'preview';
    root.setAttribute('inert', '');
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('aria-label', 'HTML Page editor');
    root.innerHTML = '<header class="html-page-toolbar">' // sutra-allow-html: static editor chrome; authored HTML uses the sandbox helper.
      + '<div class="html-page-mode"><span>Create</span><strong>HTML Page</strong></div>'
      + '<div class="html-page-layout-controls" role="group" aria-label="Source and preview layout">'
      + '<button type="button" data-html-layout="code" aria-pressed="false">Code</button>'
      + '<button type="button" data-html-layout="split" aria-pressed="false">Split</button>'
      + '<button type="button" data-html-layout="preview" aria-pressed="true" class="active">Preview</button></div>'
      + '<div class="html-page-mobile-tabs" role="tablist" aria-label="HTML Page view">'
      + '<button type="button" data-html-panel="code" role="tab" aria-controls="htmlPageCodePanel" aria-selected="false" tabindex="-1">Code</button>'
      + '<button type="button" data-html-panel="preview" role="tab" aria-controls="htmlPagePreviewPanel" aria-selected="true" tabindex="0" class="active">Preview</button></div>'
      + '<div class="html-page-actions"><span class="html-page-layout-status" data-html-layout-status aria-live="polite">Preview only</span>'
      + '<label class="html-page-timeline-picker" data-html-timeline-picker-wrap hidden>Timeline to edit<select data-html-timeline-picker aria-label="Choose an authored timeline"></select></label>'
      + '<button type="button" class="html-page-icon-action" data-html-source-undo aria-label="Undo source change" title="Undo" disabled><i class="fas fa-undo" aria-hidden="true"></i></button>'
      + '<button type="button" class="html-page-icon-action" data-html-source-redo aria-label="Redo source change" title="Redo" disabled><i class="fas fa-redo" aria-hidden="true"></i></button>'
      + '<button type="button" data-html-edit-source aria-expanded="false" aria-controls="sutraHtmlPageSource">Edit source</button>'
      + '<details class="html-page-overflow" data-html-overflow><summary class="html-page-overflow-trigger" aria-label="More HTML Page actions" title="More actions" aria-expanded="false"><i class="fas fa-ellipsis-h" aria-hidden="true"></i></summary>'
      + '<div class="html-page-overflow-menu" role="group" aria-label="More HTML Page actions">'
      + '<button type="button" data-html-refresh aria-label="Refresh the local HTML preview">Refresh preview</button>'
      + '<button type="button" data-html-export>Export .html</button>'
      + '<button type="button" data-html-import-trigger>Import HTML</button></div></details>'
      + '<input class="html-page-import-input" type="file" accept=".html,.htm,text/html" data-html-import aria-label="Import a local HTML file" hidden></div></header>'
      + '<div class="html-page-warning" data-html-asset-warning role="note" hidden>Linked or remote assets are blocked in this local preview. Embed assets as data URLs to keep them available offline.</div>'
      + '<div class="html-page-workspace"><section id="htmlPageCodePanel" class="html-page-code" aria-label="HTML source">'
      + '<div class="html-page-source-toolbar"><label for="sutraHtmlPageSource">HTML, CSS, and JavaScript</label>'
      + '<output id="htmlPageSourceSize" data-html-source-size aria-label="Source size">0 B / 4 MB</output>'
      + '<div class="html-page-starter"><select data-html-starter aria-label="Choose a starter snippet"><option value="">Starter snippets</option><option value="section">Content section</option><option value="checklist">Checklist</option><option value="callout">Note callout</option></select><button type="button" data-html-insert-starter>Insert</button></div></div>'
      + '<textarea id="sutraHtmlPageSource" data-html-source spellcheck="false" autocomplete="off" aria-describedby="htmlPageSafetyNote htmlPageSourceSize"></textarea>'
      + '<p id="htmlPageSafetyNote">Scripts run only inside an isolated offline sandbox. Network requests, forms, popups, downloads, parent access, and top navigation are blocked.</p>'
      + '</section><section id="htmlPagePreviewPanel" class="html-page-preview" aria-label="Live preview"><div data-html-preview></div></section></div>'
      + '<footer class="html-page-status"><span class="html-page-sandbox-status" role="note" aria-label="Offline sandbox; scripts enabled; network, forms, popups, and downloads blocked">Offline sandbox · scripts enabled · network and external actions blocked</span>'
      + '<span class="html-page-preview-status" data-html-preview-status role="status" aria-live="polite">Preview ready · isolated offline sandbox</span>'
      + '<output data-html-save-status role="status" aria-live="polite">Saved locally</output></footer>'; // sutra-allow-html: reviewed static editor chrome; authored HTML only enters the sandbox helper.
    var container = document.getElementById('notesPrimaryPane');
    if (container) container.appendChild(root);
    var sourceEditor = root.querySelector('[data-html-source]');
    sourceEditor.addEventListener('input', handleSourceInput);
    sourceEditor.addEventListener('keydown', handleSourceHistoryShortcut);
    root.querySelector('[data-html-source-undo]').addEventListener('click', function () { applySourceHistory('undo', false); });
    root.querySelector('[data-html-source-redo]').addEventListener('click', function () { applySourceHistory('redo', false); });
    root.addEventListener('keydown', handleOverflowMenuKeydown);
    global.document.addEventListener('pointerdown', handleOverflowOutsidePointerDown);
    var overflowMenu = root.querySelector('[data-html-overflow]');
    var overflowTrigger = overflowMenu.querySelector('summary');
    overflowMenu.addEventListener('toggle', function () { overflowTrigger.setAttribute('aria-expanded', overflowMenu.open ? 'true' : 'false'); });
    overflowMenu.addEventListener('focusout', function () { handleOverflowFocusOut(overflowMenu); });
    function onSourceSelectionChange() {
      selectedTimelineIndex = -1;
      timelineSelectionMode = 'source';
      scheduleTimelinePickerRefresh();
    }
    sourceEditor.addEventListener('click', onSourceSelectionChange);
    sourceEditor.addEventListener('keyup', onSourceSelectionChange);
    sourceEditor.addEventListener('select', onSourceSelectionChange);
    root.querySelector('[data-html-timeline-picker]').addEventListener('change', function (event) {
      var index = Number(event.target.value);
      selectedTimelineIndex = Number.isInteger(index) && index >= 0 && index < timelinePickerEntries.length ? index : -1;
      timelineSelectionMode = 'picker';
    });
    root.querySelector('[data-html-edit-source]').addEventListener('click', function () { setSourceMode(root.dataset.sourceOpen !== 'true'); });
    root.querySelector('[data-html-refresh]').addEventListener('click', function () { closeOverflowMenu(true); renderPreview(true); });
    root.querySelector('[data-html-export]').addEventListener('click', function () { closeOverflowMenu(true); exportSource(); });
    root.querySelector('[data-html-import-trigger]').addEventListener('click', function () {
      closeOverflowMenu(true);
      root.querySelector('[data-html-import]').click();
    });
    root.querySelector('[data-html-insert-starter]').addEventListener('click', insertStarterSnippet);
    root.querySelector('[data-html-import]').addEventListener('change', function (event) { importFile(event.target.files && event.target.files[0]); event.target.value = ''; });
    root.querySelectorAll('[data-html-layout]').forEach(function (button) {
      button.addEventListener('click', function () { setLayoutMode(button.dataset.htmlLayout); });
    });
    root.querySelectorAll('[data-html-panel]').forEach(function (button) {
      button.addEventListener('click', function () { setMobilePanel(button.dataset.htmlPanel, true); });
      button.addEventListener('keydown', moveMobileTabFocus);
    });
    updateModeControls();
    updateSourceSize('');
    refreshTimelinePicker();
    return root;
  }

  function refresh() {
    var page;
    try { page = pageForCurrentRoute(); } catch (error) { return; }
    var model = documentFor(page);
    var show = !!(page && model);
    if (!show) {
      if (activePageId || activePageReference || activeDocumentReference) sourceRevision += 1;
      activePageId = '';
      activePageReference = null;
      activeDocumentReference = null;
      resetSourceHistory(null, '', null);
      timelinePickerSource = null;
      timelinePickerEntries = [];
      selectedTimelineIndex = -1;
      timelineSelectionMode = 'auto';
      lastPreviewSource = null;
      previewHasLoaded = false;
      global.clearTimeout(previewTimer);
      global.clearTimeout(previewLoadTimer);
      previewRevision += 1;
      if (root) {
        closeOverflowMenu(false);
        var sourceEditor = root.querySelector('[data-html-source]');
        var previewHost = root.querySelector('[data-html-preview]');
        if (sourceEditor) sourceEditor.value = '';
        if (previewHost) previewHost.replaceChildren();
        updateSourceSize('');
        syncSourceHistoryControls();
        setPreviewStatus('Open an HTML Page to see its preview.', 'empty');
        setVisible(false);
      }
      else document.body.classList.remove('html-page-active');
      return;
    }
    mount();
    var changedPage = activePageId !== page.id || activePageReference !== page || activeDocumentReference !== page.htmlDocument;
    if (changedPage) {
      closeOverflowMenu(false);
      sourceRevision += 1;
      timelinePickerSource = null;
      selectedTimelineIndex = -1;
      timelineSelectionMode = 'auto';
    }
    activePageId = page.id;
    activePageReference = page;
    if (!page.htmlDocument || page.htmlDocument.version !== 1) page.htmlDocument = model;
    activeDocumentReference = page.htmlDocument;
    setVisible(true);
    updateSourceSize(model.source);
    var sourceChanged = root.querySelector('[data-html-source]').value !== model.source;
    if (sourceChanged && !changedPage) {
      sourceRevision += 1;
      timelinePickerSource = null;
      selectedTimelineIndex = -1;
    }
    if (changedPage || sourceChanged) {
      global.clearTimeout(previewTimer);
      global.clearTimeout(previewLoadTimer);
      previewRevision += 1;
      var sourceEditor = root.querySelector('[data-html-source]');
      sourceEditor.value = model.source;
      resetSourceHistory(page, model.source, sourceEditor);
      lastPreviewSource = null;
      previewHasLoaded = false;
      setStatus('Saved locally', 'saved');
      setSourceMode(false);
    }
    if (!sourceHistoryMatchesPage(sourceHistory, page, bridge())) {
      resetSourceHistory(page, model.source, root.querySelector('[data-html-source]'));
    }
    refreshTimelinePicker();
    syncSourceHistoryControls();
  }

  function createPage(title, options) {
    var value = bridge();
    var now = new Date().toISOString();
    var source = options && typeof options.source === 'string' ? options.source : '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>My Sutra page</title>\n  <style>\n    body { font-family: system-ui, sans-serif; padding: 2rem; }\n  </style>\n</head>\n<body>\n  <h1>Hello, Sutra!</h1>\n  <p>Edit this HTML and see the preview update.</p>\n</body>\n</html>';
    if (new Blob([source]).size > MAX_SOURCE_BYTES) throw new Error('HTML must be 4 MB or smaller.');
    var page = {
      id: id(),
      title: String(title || 'HTML Page').trim() || 'HTML Page',
      type: 'note',
      content: '',
      blocks: [],
      icon: '🌐',
      spaceId: value.getActiveSpaceId ? value.getActiveSpaceId() : 'default',
      createdAt: now,
      updatedAt: now,
      htmlDocument: { version: 1, source: source, createdAt: now, updatedAt: now }
    };
    value.pages.push(page);
    value.persistAppData();
    if (typeof value.renderPagesList === 'function') value.renderPagesList();
    if (typeof global.loadPage === 'function') global.loadPage(page.id);
    global.setTimeout(refresh, 0);
    return page;
  }

  function createFromNewPageDialog() {
    var input = document.getElementById('newPageName');
    var modal = document.getElementById('newPageModal');
    if (modal) modal.classList.remove('active');
    return createPage(input && input.value || 'HTML Page');
  }

global.addEventListener('sutra:note-page-loaded', refresh);
global.addEventListener('sutra:note-page-locked', refresh);
global.addEventListener('sutra:workspace-lock-changed', refresh);
global.addEventListener('sutra:workspace-remote-commit', refresh);
  global.addEventListener('resize', onTimelineAuthoringResize);
  global.SutraHTMLPages = {
    createPage: createPage,
    createFromNewPageDialog: createFromNewPageDialog,
    getCurrentPage: pageForCurrentRoute,
    getDocument: function () { return documentFor(pageForCurrentRoute()); },
    isSourceVisible: isSourceVisible,
    normalizeDocument: normalizeDocument,
    renderPreview: function () { renderPreview(true); },
    captureContentTimelineInsertion: captureContentTimelineInsertion,
    insertContentTimeline: insertContentTimeline,
    getContentTimelineSelection: getContentTimelineSelection,
    updateContentTimeline: updateContentTimeline
  };
}(window));
