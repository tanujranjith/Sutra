/* Secondary Create editors use isolated DOM/session state and the host's
   canonical page records. This is not another app, database, or save owner. */
(function (global) {
  'use strict';
  var current = null;
  var pane = document.getElementById('notesSecondaryPane');
  if (!pane || !global.SutraContextualShell) return;
  var host = document.createElement('div');
  host.className = 'create-split-surface';
  host.hidden = true;
  pane.appendChild(host);

  function bridge() { return global.flowAtelier; }
  function owner(record) {
    if (!record || current !== record || !record.frame.isConnected
      || document.body.dataset.view !== 'notes'
      || document.documentElement.getAttribute('data-sutra-workspace-locked') === 'true') return null;
    var value = bridge();
    var page = value && value.getSecondaryPage();
    return page && page === record.page && value.isPageContentAuthorized(page)
      && value.canWritePageContent(page) ? page : null;
  }
  function flush() {
    var record = current;
    if (!owner(record) || !record.ready) return;
    var win = record.frame.contentWindow;
    var active = win.document.activeElement;
    if (active && typeof active.blur === 'function') active.blur();
    if (win.SutraSheets && win.SutraSheets.flushPendingEdit) win.SutraSheets.flushPendingEdit();
    if (win.SutraHTMLPages && win.SutraHTMLPages.flushPendingEdit) win.SutraHTMLPages.flushPendingEdit();
  }
  function hide(options) {
    if (!options || options.flush !== false) flush();
    if (current && current.canvasAPI) current.canvasAPI.dispose();
    current = null;
    host.replaceChildren();
    host.hidden = true;
    pane.classList.remove('has-create-surface');
  }
  function syncTheme() {
    if (!current || !current.ready) return;
    var doc = current.frame.contentDocument;
    var styles = global.getComputedStyle(document.body);
    for (var i = 0; i < styles.length; i += 1) {
      var key = styles[i];
      if (key.indexOf('--') === 0) doc.documentElement.style.setProperty(key, styles.getPropertyValue(key));
    }
    doc.documentElement.style.colorScheme = global.getComputedStyle(document.documentElement).colorScheme;
    doc.documentElement.lang = document.documentElement.lang || 'en';
  }
  function loadScript(record, path) {
    return new Promise(function (resolve, reject) {
      if (!owner(record)) { reject(new Error('Page changed before its editor loaded.')); return; }
      var source = Array.from(document.scripts).find(function (script) {
        return script.getAttribute('src') && script.getAttribute('src').split('?')[0] === path;
      });
      if (!source) { reject(new Error('The page editor is unavailable offline.')); return; }
      var script = record.frame.contentDocument.createElement('script');
      script.src = source.src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('The page editor could not load.')); };
      record.frame.contentDocument.head.appendChild(script);
    });
  }
  function renderFolder(record, root) {
    var prefix = record.page.title + '::';
    var heading = root.ownerDocument.createElement('h3');
    heading.textContent = 'Pages in this folder';
    root.appendChild(heading);
    bridge().pages.filter(function (page) {
      return (page.spaceId || 'default') === (record.page.spaceId || 'default')
        && page.title.indexOf(prefix) === 0 && page.title.slice(prefix.length).indexOf('::') < 0;
    }).forEach(function (page) {
      var button = root.ownerDocument.createElement('button');
      button.type = 'button';
      button.textContent = (page.icon || '📄') + ' ' + page.title.slice(prefix.length);
      button.addEventListener('click', function () { if (owner(record)) bridge().loadPage(page.id); });
      root.appendChild(button);
    });
    if (root.children.length === 1) {
      var empty = root.ownerDocument.createElement('p');
      empty.textContent = 'This folder is empty.';
      root.appendChild(empty);
    }
  }
  async function initialize(record) {
    if (!owner(record)) return;
    var win = record.frame.contentWindow;
    var doc = win.document;
    doc.documentElement.setAttribute('data-create-pane', 'true');
    var base = doc.createElement('base');
    base.href = document.baseURI;
    doc.head.appendChild(base);
    // Reuse shipped local styles; user content is never copied into this frame.
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
      var url = new URL(link.href, document.baseURI);
      if (url.origin === global.location.origin) doc.head.appendChild(doc.importNode(link, false));
    });
    var root = doc.createElement('main');
    root.id = 'notesPrimaryPane';
    var title = doc.createElement('input');
    title.id = 'pageTitle'; title.value = record.page.title.split('::').pop(); title.hidden = true;
    var mirror = doc.createElement('div'); mirror.id = 'editor'; mirror.hidden = true;
    root.append(title, mirror); doc.body.appendChild(root);
    var value = Object.create(bridge());
    Object.defineProperties(value, {
      currentPageId: { get: function () { return record.page.id; } },
      getCurrentPage: { value: function () { return owner(record); } },
      isPageContentAuthorized: { value: function (page) { return page === record.page && !!owner(record); } },
      canWritePageContent: { value: function (page) { return page === record.page && !!owner(record); } },
      persistAppData: { value: function () { if (owner(record)) bridge().persistAppData(); } },
      flushAppSaveNow: { value: function (reason) { return owner(record) ? bridge().flushAppSaveNow(reason) : Promise.reject(new Error('This pane no longer owns the page.')); } },
      getActiveEditor: { value: function () { return mirror; } }
    });
    win.flowAtelier = value;
    ['SutraDOMSafety', 'SutraSheetsEngine', 'SutraOfficeInterop', 'SutraCanvasWorkbench',
      'SutraContentTimeline', 'SutraContentTimelineHosts', 'SutraContentTimelineEditor',
      'SutraSurfaceAssistantActions'].forEach(function (key) { win[key] = global[key]; });
    win.loadPage = function (id) { if (owner(record)) bridge().loadPage(id); };
    win.showToast = function (text) { bridge().showToast(text); };
    var activate = function () { if (owner(record)) bridge().activateSecondaryPane(); };
    doc.addEventListener('pointerdown', activate, true);
    doc.addEventListener('focusin', activate, true);
    record.ready = true;
    syncTheme();
    try {
      if (record.page.type === 'canvas') {
        var template = document.getElementById('canvasEditor');
        var canvas = doc.importNode(template, true);
        canvas.hidden = false;
        canvas.removeAttribute('data-bound');
        ['canvasObjects', 'canvasSvgLayer', 'canvasMinimapItems'].forEach(function (id) {
          var node = canvas.querySelector('#' + id); if (node) node.replaceChildren();
        });
        canvas.querySelectorAll('[data-bound]').forEach(function (node) { node.removeAttribute('data-bound'); });
        root.appendChild(canvas);
        var api = bridge().createCanvasPane(doc, win, function () {
          var page = owner(record); return page && page.type === 'canvas' ? page : null;
        });
        Object.keys(api).forEach(function (name) { win[name] = api[name]; });
        record.canvasAPI = api;
        api.bindCanvasSurfaceOnce(); api.showCanvasEditorForPage(record.page);
      } else if (record.page.type === 'folder') {
        renderFolder(record, root);
      } else {
        var path = record.page.htmlDocument ? 'html-pages' : record.page.slides ? 'slides' : 'sheets';
        await loadScript(record, 'src/features/workspace/' + path + '.js');
        if (!owner(record)) return;
        win.dispatchEvent(new win.CustomEvent('sutra:note-page-loaded', { detail: { pageId: record.page.id } }));
      }
      if (owner(record)) record.frame.removeAttribute('aria-busy');
    } catch (error) {
      if (current !== record) return;
      hide({ flush: false });
      host.hidden = false;
      var message = document.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = error.message + ' Open this page in the main pane or retry.';
      var retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry';
      retry.addEventListener('click', function () { show(record.page.id); });
      host.append(message, retry);
    }
  }
  function show(pageId) {
    var page = bridge().getSecondaryPage();
    if (!page || page.id !== pageId) { hide(); return; }
    if (current && current.page === page && owner(current)) return;
    hide();
    var frame = document.createElement('iframe');
    frame.className = 'create-split-frame';
    frame.title = 'Comparison page: ' + page.title.split('::').pop();
    frame.setAttribute('aria-busy', 'true');
    var record = { frame: frame, page: page, ready: false };
    current = record;
    frame.addEventListener('load', function () { initialize(record); }, { once: true });
    host.hidden = false; pane.classList.add('has-create-surface'); host.appendChild(frame);
  }
  // Invalidate without committing old DOM after a lock or imported/remote apply.
  ['sutra:note-page-locked', 'sutra:workspace-lock-changed', 'sutra:workspace-remote-commit'].forEach(function (name) {
    global.addEventListener(name, function () {
      hide({ flush: false });
      var page = bridge() && bridge().getSecondaryPage();
      if (page && bridge().isPageContentAuthorized(page)) show(page.id);
    });
  });
  var themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  global.SutraContextualShell.registerCreateSplitSurface({ show: show, hide: hide, flush: flush });
}(window));
