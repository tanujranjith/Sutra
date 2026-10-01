(function (global) {
  'use strict';

  var root = null;
  var activePageId = '';
  var saveTimer = 0;
  var previewTimer = 0;
  var previewLoadTimer = 0;
  var previewRevision = 0;
  var previewHasLoaded = false;
  var lastPreviewSource = null;
  var MAX_SOURCE_BYTES = 4 * 1024 * 1024;
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
    var value = bridge();
    return typeof value.isPageContentAuthorized === 'function'
      ? value.isPageContentAuthorized(page)
      : !!(page && !(page.isLocked && page.lockHash));
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

  function updateSource(source) {
    var page = pageForCurrentRoute();
    if (!page || !page.htmlDocument) return false;
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
    var now = new Date().toISOString();
    page.htmlDocument.source = value;
    page.htmlDocument.updatedAt = now;
    page.updatedAt = now;
    setStatus('Saving…', 'saving');
    setPreviewStatus('Source changed — updating preview…', 'loading');
    global.clearTimeout(saveTimer);
    saveTimer = global.setTimeout(persistCurrentPage, 450);
    schedulePreview();
    return true;
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
      if (editor && updateSource(source)) {
        editor.value = source;
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
      + '<button type="button" data-html-edit-source aria-expanded="false" aria-controls="sutraHtmlPageSource">Edit source</button>'
      + '<button type="button" data-html-refresh aria-label="Refresh the local HTML preview">Refresh preview</button>'
      + '<button type="button" data-html-export>Export .html</button></div></header>'
      + '<div class="html-page-warning" data-html-asset-warning role="note" hidden>Linked or remote assets are blocked in this local preview. Embed assets as data URLs to keep them available offline.</div>'
      + '<div class="html-page-workspace"><section id="htmlPageCodePanel" class="html-page-code" aria-label="HTML source">'
      + '<div class="html-page-source-toolbar"><label for="sutraHtmlPageSource">HTML, CSS, and JavaScript</label>'
      + '<output id="htmlPageSourceSize" data-html-source-size aria-label="Source size">0 B / 4 MB</output>'
      + '<div class="html-page-starter"><select data-html-starter aria-label="Choose a starter snippet"><option value="">Starter snippets</option><option value="section">Content section</option><option value="checklist">Checklist</option><option value="callout">Note callout</option></select><button type="button" data-html-insert-starter>Insert</button></div>'
      + '<label class="html-page-import"><input type="file" accept=".html,.htm,text/html" data-html-import aria-label="Import a local HTML file"><span>Import HTML</span></label></div>'
      + '<textarea id="sutraHtmlPageSource" data-html-source spellcheck="false" autocomplete="off" aria-describedby="htmlPageSafetyNote htmlPageSourceSize"></textarea>'
      + '<p id="htmlPageSafetyNote">Scripts run only inside an isolated offline sandbox. Network requests, forms, popups, downloads, parent access, and top navigation are blocked.</p>'
      + '</section><section id="htmlPagePreviewPanel" class="html-page-preview" aria-label="Live preview"><div data-html-preview></div></section></div>'
      + '<footer class="html-page-status"><span class="html-page-sandbox-status" role="note" aria-label="Offline sandbox; scripts enabled; network, forms, popups, and downloads blocked">Offline sandbox · scripts enabled · network and external actions blocked</span>'
      + '<span class="html-page-preview-status" data-html-preview-status role="status" aria-live="polite">Preview ready · isolated offline sandbox</span>'
      + '<output data-html-save-status role="status" aria-live="polite">Saved locally</output></footer>'; // sutra-allow-html: reviewed static editor chrome; authored HTML only enters the sandbox helper.
    var container = document.getElementById('notesPrimaryPane');
    if (container) container.appendChild(root);
    root.querySelector('[data-html-source]').addEventListener('input', function (event) { updateSource(event.target.value); });
    root.querySelector('[data-html-edit-source]').addEventListener('click', function () { setSourceMode(root.dataset.sourceOpen !== 'true'); });
    root.querySelector('[data-html-refresh]').addEventListener('click', function () { renderPreview(true); });
    root.querySelector('[data-html-export]').addEventListener('click', exportSource);
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
    return root;
  }

  function refresh() {
    var page;
    try { page = pageForCurrentRoute(); } catch (error) { return; }
    var model = documentFor(page);
    var show = !!(page && model);
    if (!show) {
      activePageId = '';
      lastPreviewSource = null;
      previewHasLoaded = false;
      global.clearTimeout(previewTimer);
      global.clearTimeout(previewLoadTimer);
      previewRevision += 1;
      if (root) {
        var sourceEditor = root.querySelector('[data-html-source]');
        var previewHost = root.querySelector('[data-html-preview]');
        if (sourceEditor) sourceEditor.value = '';
        if (previewHost) previewHost.replaceChildren();
        updateSourceSize('');
        setPreviewStatus('Open an HTML Page to see its preview.', 'empty');
        setVisible(false);
      }
      else document.body.classList.remove('html-page-active');
      return;
    }
    mount();
    var changedPage = activePageId !== page.id;
    activePageId = page.id;
    if (!page.htmlDocument || page.htmlDocument.version !== 1) page.htmlDocument = model;
    setVisible(true);
    updateSourceSize(model.source);
    if (changedPage || root.querySelector('[data-html-source]').value !== model.source) {
      global.clearTimeout(previewTimer);
      global.clearTimeout(previewLoadTimer);
      previewRevision += 1;
      root.querySelector('[data-html-source]').value = model.source;
      lastPreviewSource = null;
      previewHasLoaded = false;
      setStatus('Saved locally', 'saved');
      setSourceMode(false);
    }
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
global.addEventListener('sutra:workspace-remote-commit', refresh);
  global.SutraHTMLPages = {
    createPage: createPage,
    createFromNewPageDialog: createFromNewPageDialog,
    getCurrentPage: pageForCurrentRoute,
    getDocument: function () { return documentFor(pageForCurrentRoute()); },
    normalizeDocument: normalizeDocument,
    renderPreview: function () { renderPreview(true); }
  };
}(window));
