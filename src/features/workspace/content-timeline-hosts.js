/* Authored timeline insertion and selection bridge for writable Create pages. */
(function (global) {
  'use strict';

  if (!global || global.SutraContentTimelineHosts) return;

  var DATA_ATTRIBUTE = 'data-sutra-content-timeline';
  var ROOT_CLASSES = Object.create(null);
  var ALLOWED_TAGS = Object.create(null);
  var activeRequestContext = null;
  var toolbar = null;
  var insertButton = null;
  var editButton = null;
  var statusNode = null;
  var actionInProgress = false;
  var actionStatus = '';
  var toolbarOwner = '';
  var refreshTimer = 0;
  var interactionPane = null;

  [
    'sutra-content-timeline', 'sutra-content-timeline--vertical', 'sutra-content-timeline--horizontal',
    'sutra-content-timeline__title', 'sutra-content-timeline__events', 'sutra-content-timeline__event',
    'sutra-content-timeline__event-title', 'sutra-content-timeline__when',
    'sutra-content-timeline__description', 'sutra-content-timeline__fallback'
  ].forEach(function (name) { ROOT_CLASSES[name] = true; });
  ['section', 'h2', 'h3', 'p', 'ol', 'li'].forEach(function (name) { ALLOWED_TAGS[name] = true; });

  function timelineModel() {
    return global.SutraContentTimeline || null;
  }

  function safeText(value) {
    return String(value == null ? '' : value);
  }

  function element(tagName, className, value) {
    var node = global.document.createElement(tagName);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function copyRenderedNode(source, targetDocument) {
    if (source.nodeType === 3) return targetDocument.createTextNode(source.nodeValue || '');
    if (source.nodeType !== 1) return null;

    var tagName = String(source.tagName || '').toLowerCase();
    if (!ALLOWED_TAGS[tagName]) return targetDocument.createTextNode(source.textContent || '');

    var copy = targetDocument.createElement(tagName);
    var classNames = String(source.getAttribute('class') || '').split(/\s+/).filter(function (name) {
      return !!ROOT_CLASSES[name];
    });
    if (classNames.length) copy.className = classNames.join(' ');
    Array.prototype.forEach.call(source.childNodes, function (child) {
      var safeChild = copyRenderedNode(child, targetDocument);
      if (safeChild) copy.appendChild(safeChild);
    });
    return copy;
  }

  function plainFallback(model, helper) {
    var node = element('p', 'sutra-content-timeline__fallback');
    try {
      node.textContent = helper.toPlainText(model);
    } catch (_) {
      node.textContent = 'This timeline could not be displayed safely.';
    }
    return node;
  }

  // The helper renderer escapes all authored text. Parse it into an inert
  // document and copy only its fixed tags/classes before returning live nodes.
  function renderDOM(model) {
    var helper = timelineModel();
    var doc = global.document;
    if (!doc || !helper || typeof helper.renderHTML !== 'function') return null;

    var fragment = doc.createDocumentFragment();
    if (typeof global.DOMParser === 'function') {
      try {
        var parsed = new global.DOMParser().parseFromString(String(helper.renderHTML(model) || ''), 'text/html');
        Array.prototype.forEach.call(parsed.body.childNodes, function (child) {
          var safeChild = copyRenderedNode(child, doc);
          if (safeChild) fragment.appendChild(safeChild);
        });
        if (fragment.childNodes.length) return fragment;
      } catch (_) { /* use the escaped text fallback below */ }
    }
    fragment.appendChild(plainFallback(model, helper));
    return fragment;
  }

  function serializeMarkup(model, options) {
    var helper = timelineModel();
    if (!helper || typeof helper.inspect !== 'function' || typeof helper.normalize !== 'function') return '';
    var status;
    try { status = helper.inspect(model); } catch (_) { return ''; }
    if (!status || !status.supported || status.readOnly) return '';

    var normalized = helper.normalize(model);
    var encoded;
    try { encoded = JSON.stringify(normalized); } catch (_) { return ''; }
    if (typeof encoded !== 'string') return '';
    var fragment = renderDOM(normalized);
    var root = fragment && fragment.firstElementChild;
    if (!root || root.tagName.toLowerCase() !== 'section') return '';
    root.setAttribute(DATA_ATTRIBUTE, encoded);
    if (options && options.nonEditable === true) root.setAttribute('contenteditable', 'false');
    return root.outerHTML;
  }

  function readMarkup(input) {
    var node = null;
    if (!input || !global.document) return null;

    if (typeof input === 'string') {
      if (typeof global.DOMParser !== 'function') return null;
      try {
        var parsed = new global.DOMParser().parseFromString(input, 'text/html');
        node = parsed.querySelector('[' + DATA_ATTRIBUTE + ']');
      } catch (_) {
        return null;
      }
    } else if (input.nodeType === 1) {
      node = input.hasAttribute(DATA_ATTRIBUTE) ? input : input.querySelector('[' + DATA_ATTRIBUTE + ']');
    }
    if (!node) return null;

    var helper = timelineModel();
    var raw = node.getAttribute(DATA_ATTRIBUTE);
    var model;
    try {
      model = JSON.parse(raw);
    } catch (_) {
      return {
        model: null,
        status: { supported: false, readOnly: true, kind: 'malformed', reason: 'invalid-model-json' }
      };
    }
    var status;
    try {
      status = helper && typeof helper.inspect === 'function'
        ? helper.inspect(model)
        : { supported: false, readOnly: true, kind: 'malformed', reason: 'timeline-helper-unavailable' };
    } catch (_) {
      status = { supported: false, readOnly: true, kind: 'malformed', reason: 'invalid-model' };
    }
    return { model: model, status: status };
  }

  function currentBridge() {
    var bridge = global.flowAtelier;
    return bridge && Array.isArray(bridge.pages) ? bridge : null;
  }

  function hostForPage(page) {
    var type = String(page && page.type || 'note').toLowerCase();
    if (type === 'canvas') return 'canvas';
    if (type === 'pdf' || type === 'folder' || page.pdfDocument || page.sheets || page.spreadsheet) return '';
    if (page.htmlDocument && typeof page.htmlDocument === 'object') return 'html';
    if (page.slides && Array.isArray(page.slides.slides)) return 'slides';
    if (type === 'note') return 'note';
    return '';
  }

  function apiForHost(kind) {
    if (kind === 'canvas') return global.SutraCanvas || null;
    if (kind === 'slides') return global.SutraSlides || null;
    if (kind === 'html') return global.SutraHTMLPages || null;
    if (kind === 'note') return global.SutraNotesEditorV2 || null;
    return null;
  }

  function apiHasTimelineMethods(api) {
    return !!(api && typeof api.insertContentTimeline === 'function' &&
      typeof api.getContentTimelineSelection === 'function' &&
      typeof api.updateContentTimeline === 'function');
  }

  function isPageAuthorizedForWrites(bridge, page) {
    if (!bridge || !page || typeof bridge.canWritePageContent !== 'function') return false;
    try { return bridge.canWritePageContent(page) === true; } catch (_) { return false; }
  }

  function resolveContext() {
    var bridge = currentBridge();
    if (!bridge || bridge.activeView !== 'notes' || !bridge.currentPageId) return null;
    var page = bridge.pages.find(function (item) { return item && String(item.id) === String(bridge.currentPageId); }) || null;
    if (!page || page.isSystemPage === true || page.systemRole === 'help-docs' || page.builtInId === 'help-docs') return null;
    var kind = hostForPage(page);
    if (!kind || !isPageAuthorizedForWrites(bridge, page)) return null;
    var pageSpace = String(page.spaceId || 'default');
    var activeSpace = String(bridge.activeSpaceId || 'default');
    if (pageSpace !== activeSpace) return null;

    var api = apiForHost(kind);
    var ready = apiHasTimelineMethods(api);
    var reason = '';
    if (kind === 'note' && api && typeof api.isMounted === 'function' && !api.isMounted()) {
      ready = false;
      reason = 'Timeline editing needs the Modern Notes editor. Enable it in Settings to continue.';
    } else if (!ready) {
      reason = 'Timeline editing is unavailable in this editor right now.';
    }

    if (ready && kind !== 'note' && typeof api.getCurrentPage === 'function') {
      try {
        var hostPage = api.getCurrentPage();
        if (!hostPage || String(hostPage.id) !== String(page.id)) {
          ready = false;
          reason = 'Open this page in its editor before changing timeline content.';
        }
      } catch (_) {
        ready = false;
        reason = 'This editor could not confirm its current page.';
      }
    }

    return {
      kind: kind,
      pageId: String(page.id),
      page: page,
      spaceId: pageSpace,
      api: api,
      ready: ready,
      reason: reason
    };
  }

  function sameContext(first, second) {
    if (!first || !second || first.kind !== second.kind || first.pageId !== second.pageId ||
        first.spaceId !== second.spaceId || first.page !== second.page || first.api !== second.api || !second.ready) return false;
    var bridge = currentBridge();
    var page = bridge && bridge.pages.find(function (item) { return item && String(item.id) === second.pageId; });
    return isPageAuthorizedForWrites(bridge, page);
  }

  function setStatus(message, state) {
    actionStatus = safeText(message);
    if (statusNode) {
      statusNode.textContent = actionStatus;
      if (state) statusNode.dataset.state = state;
      else delete statusNode.dataset.state;
    }
  }

  function currentSelection(context) {
    if (!context || !context.ready) return null;
    try {
      var selected = context.api.getContentTimelineSelection();
      return selected && selected.model && selected.token != null ? selected : null;
    } catch (_) {
      return null;
    }
  }

  function updateToolbarState() {
    mountToolbar();
    if (!toolbar) return;
    var context = resolveContext();
    if (!context) {
      toolbar.hidden = true;
      toolbar.setAttribute('aria-hidden', 'true');
      if (activeRequestContext) cancelPendingRequest();
      toolbarOwner = '';
      actionStatus = '';
      return;
    }

    var owner = context.kind + ':' + context.spaceId + ':' + context.pageId;
    if (toolbarOwner !== owner) {
      toolbarOwner = owner;
      actionStatus = '';
    }
    toolbar.hidden = false;
    toolbar.setAttribute('aria-hidden', 'false');
    insertButton.disabled = actionInProgress || !context.ready;
    var selected = currentSelection(context);
    editButton.disabled = actionInProgress || !context.ready || !selected;
    if (statusNode) {
      statusNode.textContent = context.reason || actionStatus || 'Timelines stay with this page and do not create schedule events.';
      statusNode.dataset.state = context.reason ? 'unavailable' : (actionStatus ? 'result' : 'hint');
    }
  }

  function scheduleToolbarRefresh() {
    if (refreshTimer) global.clearTimeout(refreshTimer);
    refreshTimer = global.setTimeout(function () {
      refreshTimer = 0;
      updateToolbarState();
    }, 0);
  }

  function onPaneInteraction(event) {
    if (toolbar && toolbar.contains(event.target)) return;
    scheduleToolbarRefresh();
  }

  function mountToolbar() {
    var doc = global.document;
    var pane = doc && doc.getElementById('notesPrimaryPane');
    if (!pane) return null;
    var context = resolveContext();
    var hostToolbar = context && context.kind === 'html' ? doc.querySelector('#htmlPageEditor .html-page-toolbar')
      : context && context.kind === 'slides' ? doc.querySelector('#slidesEditor .slides-toolbar') : null;
    var target = hostToolbar || pane;
    if (toolbar && toolbar.isConnected) {
      if (toolbar.parentNode !== target) placeToolbar(target, pane);
      return toolbar;
    }

    toolbar = element('div', 'sutra-content-timeline-host-toolbar');
    toolbar.id = 'sutraContentTimelineHostToolbar';
    toolbar.hidden = true;
    toolbar.setAttribute('aria-hidden', 'true');
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Authored timeline content');
    insertButton = element('button', 'sutra-content-timeline-host-toolbar__button sutra-content-timeline-host-toolbar__insert', 'Insert timeline');
    insertButton.type = 'button';
    editButton = element('button', 'sutra-content-timeline-host-toolbar__button', 'Edit selected timeline');
    editButton.type = 'button';
    statusNode = element('span', 'sutra-content-timeline-host-toolbar__status');
    statusNode.setAttribute('role', 'status');
    statusNode.setAttribute('aria-live', 'polite');
    insertButton.addEventListener('click', insertTimeline);
    editButton.addEventListener('click', editSelectedTimeline);
    toolbar.appendChild(insertButton);
    toolbar.appendChild(editButton);
    toolbar.appendChild(statusNode);

    placeToolbar(target, pane);

    if (interactionPane !== pane) {
      if (interactionPane) {
        interactionPane.removeEventListener('click', onPaneInteraction);
        interactionPane.removeEventListener('pointerup', onPaneInteraction);
        interactionPane.removeEventListener('keyup', onPaneInteraction);
      }
      interactionPane = pane;
      interactionPane.addEventListener('click', onPaneInteraction);
      interactionPane.addEventListener('pointerup', onPaneInteraction);
      interactionPane.addEventListener('keyup', onPaneInteraction);
    }
    return toolbar;
  }

  function placeToolbar(target, pane) {
    if (target !== pane) { target.appendChild(toolbar); return; }
    var tags = global.document.getElementById('tagsContainer');
    var title = global.document.getElementById('pageTitle');
    if (tags && tags.parentNode === pane) pane.insertBefore(toolbar, tags.nextSibling);
    else if (title && title.parentNode === pane) pane.insertBefore(toolbar, title.nextSibling);
    else pane.insertBefore(toolbar, pane.firstChild);
  }

  function cancelPendingRequest() {
    activeRequestContext = null;
    var editor = global.SutraContentTimelineEditor;
    if (editor && typeof editor.cancel === 'function') {
      try { editor.cancel(); } catch (_) { /* the caller still fails closed */ }
    }
  }

  function openForContext(context, options) {
    var current = resolveContext();
    var editor = global.SutraContentTimelineEditor;
    if (!sameContext(context, current) || !editor || typeof editor.open !== 'function') return Promise.resolve(null);

    activeRequestContext = context;
    var result;
    try {
      result = editor.open({
        model: options && options.model,
        title: options && options.title
      });
    } catch (_) {
      if (activeRequestContext === context) activeRequestContext = null;
      return Promise.resolve(null);
    }

    return Promise.resolve(result).then(function (model) {
      if (activeRequestContext === context) activeRequestContext = null;
      if (!model || !sameContext(context, resolveContext())) return null;
      var helper = timelineModel();
      if (!helper || typeof helper.inspect !== 'function' || !helper.inspect(model).supported) return null;
      return helper.normalize(model);
    }, function () {
      if (activeRequestContext === context) activeRequestContext = null;
      return null;
    });
  }

  function request(options) {
    var context = resolveContext();
    if (!context || !context.ready) {
      if (context && context.reason) setStatus(context.reason, 'unavailable');
      return Promise.resolve(null);
    }
    return openForContext(context, options || {});
  }

  function resultSucceeded(result) {
    return result === true || !!(result && typeof result === 'object' && result.ok === true);
  }

  function withAction(action) {
    if (actionInProgress) return Promise.resolve(false);
    actionInProgress = true;
    updateToolbarState();
    return Promise.resolve().then(action).catch(function () {
      setStatus('Timeline changes could not be applied. The page was left unchanged.', 'error');
      return false;
    }).then(function (result) {
      actionInProgress = false;
      updateToolbarState();
      return result;
    });
  }

  function insertTimeline() {
    return withAction(async function () {
      var context = resolveContext();
      if (!context || !context.ready) return false;
      var insertionToken = typeof context.api.captureContentTimelineInsertion === 'function'
        ? context.api.captureContentTimelineInsertion() : null;
      if (!insertionToken) return false;
      var model = await openForContext(context, { title: 'Create timeline' });
      if (!model) return false;
      if (!sameContext(context, resolveContext())) {
        setStatus('The page changed before the timeline could be inserted. Nothing was added.', 'error');
        return false;
      }
      var result = await context.api.insertContentTimeline(model, insertionToken);
      if (!resultSucceeded(result)) {
        setStatus('The timeline was not inserted. The page remains unchanged.', 'error');
        return false;
      }
      setStatus('Timeline added to this page.', 'success');
      return true;
    });
  }

  function editSelectedTimeline() {
    return withAction(async function () {
      var context = resolveContext();
      if (!context || !context.ready) return false;
      var selected = currentSelection(context);
      if (!selected) {
        setStatus('Select a timeline in this editor to edit it.', 'hint');
        return false;
      }
      var model = await openForContext(context, { model: selected.model, title: 'Edit timeline' });
      if (!model) return false;
      if (!sameContext(context, resolveContext())) {
        setStatus('The page changed before the timeline could be updated. Nothing was changed.', 'error');
        return false;
      }
      var result = await context.api.updateContentTimeline(selected.token, model);
      if (!resultSucceeded(result)) {
        setStatus('This timeline changed while the editor was open. Reopen it before trying again.', 'error');
        return false;
      }
      setStatus('Timeline updated.', 'success');
      return true;
    });
  }

  function onViewChanged(event) {
    var nextView = event && event.detail && event.detail.view;
    if (activeRequestContext && nextView !== 'notes') cancelPendingRequest();
    scheduleToolbarRefresh();
  }

  function onPageLoaded() {
    if (activeRequestContext && !sameContext(activeRequestContext, resolveContext())) cancelPendingRequest();
    scheduleToolbarRefresh();
  }

  function onWorkspaceLockChanged() {
    if (activeRequestContext) cancelPendingRequest();
    scheduleToolbarRefresh();
  }

  function onRemoteCommit() {
    if (activeRequestContext) cancelPendingRequest();
    scheduleToolbarRefresh();
  }

  function initialize() {
    if (!global.document) return;
    mountToolbar();
    updateToolbarState();
    global.addEventListener('sutra:flow-bridge-ready', scheduleToolbarRefresh);
    global.addEventListener('sutra:workspace-boot-result', scheduleToolbarRefresh);
    global.addEventListener('noteflow:view-changed', onViewChanged);
    global.addEventListener('sutra:note-page-loaded', onPageLoaded);
    global.addEventListener('sutra:workspace-lock-changed', onWorkspaceLockChanged);
    global.addEventListener('sutra:note-page-locked', onWorkspaceLockChanged);
    global.addEventListener('sutra:workspace-remote-commit', onRemoteCommit);
    global.addEventListener('pagehide', cancelPendingRequest);
  }

  var api = Object.freeze({
    request: request,
    getContext: resolveContext,
    refresh: function () { mountToolbar(); updateToolbarState(); },
    cancel: cancelPendingRequest,
    serializeMarkup: serializeMarkup,
    readMarkup: readMarkup,
    renderDOM: renderDOM
  });

  global.SutraContentTimelineHosts = api;
  if (global.document) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
  }
}(window));
