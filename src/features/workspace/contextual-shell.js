/*
 * contextual-shell.js — section-aware application chrome.
 *
 * Sutra has one global navigation shell. Secondary navigation is registered by
 * section and only mounted where it is meaningful. Notes currently owns the
 * canonical page tree; every other major section receives the full workspace.
 */
(function () {
  'use strict';

  if (typeof document === 'undefined') return;

  var CONTEXT_SIDEBARS = Object.freeze({ notes: 'notes' });

  function normalizeView(view) {
    return String(view || '').trim().toLowerCase() || 'today';
  }

  function sidebarFor(view) {
    return CONTEXT_SIDEBARS[normalizeView(view)] || 'none';
  }

  function usesSidebar(view) {
    return sidebarFor(view) !== 'none';
  }

  function syncSidebarDom(view) {
    var sidebar = document.getElementById('sidebar');
    var toggle = document.getElementById('sidebarToggle');
    var overlay = document.getElementById('sidebarOverlay');
    if (!sidebar) return;
    var hasContextSidebar = usesSidebar(view);

    if (!hasContextSidebar) {
      sidebar.dataset.contextHidden = 'true';
      if (sidebar.style.getPropertyValue('display') !== 'none'
          || sidebar.style.getPropertyPriority('display') !== 'important') {
        sidebar.style.setProperty('display', 'none', 'important');
      }
      if (sidebar.getAttribute('aria-hidden') !== 'true') sidebar.setAttribute('aria-hidden', 'true');
      if (!sidebar.hasAttribute('inert')) sidebar.setAttribute('inert', '');
      if (toggle) {
        toggle.hidden = true;
        toggle.setAttribute('aria-hidden', 'true');
      }
      if (overlay) overlay.classList.remove('active');
      return;
    }

    if (sidebar.dataset.contextHidden === 'true') {
      delete sidebar.dataset.contextHidden;
    }
    var compact = window.innerWidth <= 1024;
    var shouldHideCollapsedDrawer = compact && sidebar.classList.contains('collapsed');
    var expectedDisplay = shouldHideCollapsedDrawer ? 'none' : 'flex';
    var expectedAriaHidden = shouldHideCollapsedDrawer ? 'true' : 'false';
    if (sidebar.style.getPropertyValue('display') !== expectedDisplay
        || sidebar.style.getPropertyPriority('display') !== 'important') {
      sidebar.style.setProperty('display', expectedDisplay, 'important');
    }
    if (sidebar.getAttribute('aria-hidden') !== expectedAriaHidden) {
      sidebar.setAttribute('aria-hidden', expectedAriaHidden);
    }
    if (shouldHideCollapsedDrawer && !sidebar.hasAttribute('inert')) sidebar.setAttribute('inert', '');
    if (!shouldHideCollapsedDrawer && sidebar.hasAttribute('inert')) sidebar.removeAttribute('inert');
    if (toggle) {
      toggle.hidden = false;
      toggle.setAttribute('aria-hidden', 'false');
    }
  }

  function sync(view) {
    var root = document.body;
    if (!root) return;
    var resolvedView = normalizeView(view || root.dataset.view);
    var context = sidebarFor(resolvedView);
    root.dataset.contextSidebar = context;
    root.classList.toggle('has-context-sidebar', context !== 'none');
    root.classList.toggle('has-full-workspace', context === 'none');

    if (context === 'none') {
      root.classList.remove('sidebar-open');
      var overlay = document.getElementById('sidebarOverlay');
      if (overlay) overlay.classList.remove('active');
    }
    syncSidebarDom(resolvedView);
  }

  function settleSync(view) {
    var resolvedView = normalizeView(view || (document.body && document.body.dataset.view));
    sync(resolvedView);
    window.requestAnimationFrame(function () { sync(resolvedView); });
    window.setTimeout(function () { sync(resolvedView); }, 120);
  }

  // The canonical page tree is rendered as a flat list. Its existing inline
  // padding is the renderer's depth output, so the guide decoration can follow
  // the same hierarchy without maintaining a second page model in this shell.
  var PAGE_TREE_BASE_PADDING = 12;
  var PAGE_TREE_INDENT = 20;
  var pageTreeObserver = null;

  function pageTreeDepth(row) {
    if (!row) return 0;
    var padding = row.style && row.style.paddingLeft;
    if (!padding && typeof window.getComputedStyle === 'function') {
      padding = window.getComputedStyle(row).paddingLeft;
    }
    var pixels = parseFloat(padding);
    if (!Number.isFinite(pixels)) return 0;
    return Math.max(0, Math.min(64, Math.round((pixels - PAGE_TREE_BASE_PADDING) / PAGE_TREE_INDENT)));
  }

  function directChildWithClass(row, className) {
    if (!row || !row.children) return null;
    for (var index = 0; index < row.children.length; index += 1) {
      var child = row.children[index];
      if (child.classList && child.classList.contains(className)) return child;
    }
    return null;
  }

  function decoratePageTree() {
    var list = document.getElementById('pagesList');
    if (!list) return;

    Array.prototype.forEach.call(list.querySelectorAll('.page-item'), function (row) {
      var depth = pageTreeDepth(row);
      var guides = directChildWithClass(row, 'page-tree-guides');
      if (!guides) {
        guides = document.createElement('span');
        guides.className = 'page-tree-guides';
        guides.setAttribute('aria-hidden', 'true');
        row.insertBefore(guides, row.firstChild);
      }

      while (guides.firstChild) guides.removeChild(guides.firstChild);
      guides.hidden = depth === 0;
      row.setAttribute('data-page-tree-depth', String(depth));
      for (var level = 0; level < depth; level += 1) {
        var line = document.createElement('span');
        line.className = 'page-tree-guide-line';
        line.setAttribute('aria-hidden', 'true');
        line.style.left = (PAGE_TREE_BASE_PADDING + (level * PAGE_TREE_INDENT)) + 'px';
        guides.appendChild(line);
      }
    });
  }

  function initPageTreeGuides() {
    var list = document.getElementById('pagesList');
    if (!list) return;
    decoratePageTree();
    if (pageTreeObserver || typeof MutationObserver !== 'function') return;

    pageTreeObserver = new MutationObserver(decoratePageTree);
    // renderPagesList replaces direct children during ordinary navigation,
    // filtering, import, and restore. Observing only childList changes avoids
    // reacting to the guide nodes that this decorator adds inside each row.
    pageTreeObserver.observe(list, { childList: true });
  }

  function activateView(view) {
    var tab = document.querySelector('.view-tabs > .view-tab[data-view="' + view + '"]')
      || document.querySelector('.view-tab[data-view="' + view + '"]');
    if (tab && typeof tab.click === 'function') tab.click();
  }

  function labelOverflowItem(node, fallback) {
    if (!node || node.querySelector('.notes-overflow-label')) return;
    var label = document.createElement('span');
    label.className = 'notes-overflow-label';
    label.textContent = String(node.getAttribute && (node.getAttribute('aria-label') || node.getAttribute('title')) || fallback || 'More action');
    node.appendChild(label);
  }

  function normalizeToolbarSeparators(toolbar) {
    if (!toolbar) return;
    var visibleContentSeen = false;
    var lastWasSeparator = false;
    Array.prototype.forEach.call(toolbar.children, function (child) {
      if (!child.classList || !child.classList.contains('toolbar-separator')) {
        if (!child.hidden && child.style.display !== 'none') {
          visibleContentSeen = true;
          lastWasSeparator = false;
        }
        return;
      }
      var shouldHide = !visibleContentSeen || lastWasSeparator;
      child.hidden = shouldHide;
      if (!shouldHide) lastWasSeparator = true;
    });
    var children = Array.prototype.slice.call(toolbar.children);
    for (var index = children.length - 1; index >= 0; index -= 1) {
      var item = children[index];
      if (item.hidden || item.style.display === 'none') continue;
      if (item.classList && item.classList.contains('toolbar-separator')) item.hidden = true;
      break;
    }
  }

  function enhanceNotesToolbar() {
    var toolbar = document.getElementById('toolbar');
    if (!toolbar || toolbar.querySelector('.notes-toolbar-overflow')) return;

    var details = document.createElement('details');
    details.className = 'notes-toolbar-overflow';
    var summary = document.createElement('summary');
    summary.className = 'toolbar-btn notes-toolbar-overflow-toggle';
    summary.setAttribute('aria-label', 'Insert and note tools');
    summary.setAttribute('title', 'Insert and note tools');
    summary.setAttribute('aria-haspopup', 'menu');
    var summaryIcon = document.createElement('i');
    summaryIcon.className = 'fas fa-ellipsis';
    summaryIcon.setAttribute('aria-hidden', 'true');
    summary.appendChild(summaryIcon);
    var menu = document.createElement('div');
    menu.className = 'notes-toolbar-overflow-menu';
    menu.setAttribute('role', 'menu');
    menu.id = 'notesToolsMenu';
    summary.setAttribute('aria-controls', menu.id);
    menu.setAttribute('aria-label', 'Insert and note tools');
    menu.hidden = true;
    details.appendChild(summary);

    function section(label) {
      var heading = document.createElement('div');
      heading.className = 'notes-tools-section';
      heading.setAttribute('role', 'presentation');
      heading.textContent = label;
      menu.appendChild(heading);
    }
    section('Insert');
    var inserts = document.getElementById('insertMoreMenu');
    if (inserts) {
      Array.from(inserts.querySelectorAll('button')).forEach(function (control) {
        control.classList.add('notes-overflow-item');
        control.setAttribute('role', 'menuitem');
        menu.appendChild(control);
      });
    }
    var insertToggle = document.getElementById('insertMoreBtn');
    if (insertToggle) { insertToggle.hidden = true; insertToggle.style.display = 'none'; }
    section('Page and view');

    var secondarySelectors = [
      '#splitNotesToggleBtn',
      '#splitNotesPresetsBtn',
      '#pagesToggleBtn',
      'button[onclick*="toggleFindReplacePanel"]',
      'button[onclick*="toggleDocOutlinePanel"]',
      'button[onclick*="toggleCommentsPanel"]',
      'button[onclick*="openVersionHistory"]',
      'button[onclick*="showDocumentStats"]'
    ];
    var labels = ['Split screen', 'Split presets', 'Page layout', 'Find and replace', 'Document outline', 'Comments', 'Version history', 'Document statistics'];
    secondarySelectors.forEach(function (selector, index) {
      var control = toolbar.querySelector(selector);
      if (!control) return;
      control.classList.add('notes-overflow-item');
      control.setAttribute('role', 'menuitem');
      labelOverflowItem(control, labels[index]);
      menu.appendChild(control);
    });

    var zoom = toolbar.querySelector('.toolbar-zoom-controls');
    if (zoom) {
      zoom.classList.add('notes-overflow-zoom');
      var zoomLabel = document.createElement('span');
      zoomLabel.className = 'notes-overflow-label';
      zoomLabel.textContent = 'Editor zoom';
      zoom.insertBefore(zoomLabel, zoom.firstChild);
      menu.appendChild(zoom);
    }

    var wordCount = toolbar.querySelector('.word-count-display');
    toolbar.insertBefore(details, wordCount || null);
    document.body.appendChild(menu);
    normalizeToolbarSeparators(toolbar);

    function positionMenu() {
      var rect = summary.getBoundingClientRect();
      menu.style.top = Math.round(rect.bottom + 8) + 'px';
      menu.style.right = Math.max(10, Math.round(window.innerWidth - rect.right)) + 'px';
      menu.style.maxHeight = Math.min(640, Math.max(120, window.innerHeight - rect.bottom - 18)) + 'px';
    }

    function closeMenu() {
      details.open = false;
      menu.hidden = true;
      summary.setAttribute('aria-expanded', 'false');
    }

    summary.setAttribute('aria-expanded', 'false');
    function syncMenu() {
      var wasHidden = menu.hidden;
      menu.hidden = !details.open;
      summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
      if (details.open) {
        positionMenu();
        if (wasHidden) menu.scrollTop = 0;
        var label = document.getElementById('suggestingModeLabel');
        if (label) label.textContent = document.body.classList.contains('suggesting-mode') ? 'Turn off suggesting' : 'Turn on suggesting';
      }
    }
    details.addEventListener('toggle', syncMenu);
    summary.addEventListener('click', function (event) {
      event.preventDefault();
      details.open = !details.open;
      syncMenu();
    });

    details.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        details.open = true;
        menu.hidden = false;
        positionMenu();
        var items = menu.querySelectorAll('button:not(:disabled)');
        (event.key === 'ArrowDown' ? items[0] : items[items.length - 1])?.focus();
        return;
      }
      if (event.key !== 'Escape') return;
      closeMenu();
      summary.focus();
    });
    menu.addEventListener('keydown', function (event) {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        var items = Array.from(menu.querySelectorAll('button:not(:disabled)'));
        var index = items.indexOf(document.activeElement);
        var next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
        return;
      }
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMenu();
      summary.focus();
    });
    menu.addEventListener('click', function (event) {
      if (event.target.closest('button') && !event.target.closest('.notes-overflow-zoom')) closeMenu();
    });
    menu.addEventListener('mousedown', function (event) {
      if (event.target.closest('button')) event.preventDefault();
    });
    window.addEventListener('resize', function () {
      if (details.open) positionMenu();
    });
    document.addEventListener('pointerdown', function (event) {
      if (details.open && !details.contains(event.target) && !menu.contains(event.target)) closeMenu();
    });
  }

  function initSidebarNotePair() {
    var tree = document.getElementById('pagesList');
    if (!tree) return;
    var section = document.createElement('section');
    section.id = 'notesSidebarPair';
    section.className = 'notes-sidebar-pair';
    section.setAttribute('aria-label', 'Paired notes');
    var hiddenRows = [];
    var observer = new MutationObserver(function (records) {
      if (records.some(function (record) {
        return record.target === tree || record.target.classList?.contains('page-title-text');
      })) render();
    });

    function render() {
      var bridge = window.flowAtelier;
      if (!bridge || !Array.isArray(bridge.pages)) return;
      var pair = bridge.getNotesSplitPair?.();
      var members = pair ? [pair.left, pair.right].map(function (id) {
        return bridge.pages.find(function (p) { return p.id === id; });
      }) : [];
      var space = bridge.getActiveSpaceId();
      observer.disconnect();
      try {
        hiddenRows.forEach(function (entry) { entry.row.hidden = entry.hidden; });
        hiddenRows = [];
        if (members.length !== 2 || members.some(function (p) { return !p || (p.spaceId || 'default') !== space; })) {
          section.remove();
          return;
        }
        var focusedId = section.contains(document.activeElement) ? document.activeElement.dataset.pageId : null;
        section.replaceChildren();
        var rows = Array.from(tree.querySelectorAll('.page-item')).filter(function (row) {
          return members.some(function (p) { return p.id === row.dataset.pageId; });
        });
        members.forEach(function (page) {
          var cell = document.createElement('div');
          cell.className = 'notes-sidebar-pair-cell';
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'notes-sidebar-pair-row';
          button.dataset.pageId = page.id;
          var title = String(page.title || 'Untitled').split('::').pop();
          button.setAttribute('aria-label', title);
          button.title = String(page.title || 'Untitled').split('::').join(' / ');
          var activeId = document.getElementById('notesSecondaryPane')?.classList.contains('is-active-pane') ? pair.right : pair.left;
          if (bridge.currentPageId === pair.left && page.id === activeId) cell.classList.add('active');
          var icon = document.createElement('span');
          icon.className = 'page-icon';
          icon.setAttribute('aria-hidden', 'true');
          icon.textContent = page.isLocked ? '🔒' : (page.icon || '📄');
          var text = document.createElement('span');
          text.className = 'page-title-text';
          text.textContent = title;
          button.append(icon, text);
          button.addEventListener('click', function () { bridge.loadPage(page.id); render(); });
          var close = document.createElement('button');
          close.type = 'button';
          close.className = 'notes-sidebar-unpair';
          close.textContent = '×';
          close.setAttribute('aria-label', 'Unpair ' + title);
          close.title = 'Unpair notes — keep both pages';
          close.addEventListener('click', function () {
            bridge.unpairNotes();
            (document.querySelector('#editorV2Host .ProseMirror') || document.getElementById('editor'))?.focus();
          });
          cell.append(button, close);
          section.appendChild(cell);
        });
        tree.insertBefore(section, rows.find(function (row) { return row.parentNode === tree; }) || tree.firstChild);
        rows.forEach(function (row) {
          var member = members.find(function (p) { return p.id === row.dataset.pageId; });
          // Keep a parent entry when it owns children so its expand/collapse
          // control and original hierarchy remain available.
          if (bridge.pages.some(function (p) { return (p.spaceId || 'default') === (member.spaceId || 'default') && p.title && p.title.startsWith(member.title + '::'); })) return;
          hiddenRows.push({ row: row, hidden: row.hidden });
          row.hidden = true;
        });
        if (focusedId) Array.from(section.querySelectorAll('[data-page-id]')).find(function (b) { return b.dataset.pageId === focusedId; })?.focus({ preventScroll: true });
      } finally {
        // The observer ignores our group and the depth-guide decoration.
        observer.observe(tree, { childList: true, subtree: true });
      }
    }
    section.addEventListener('keydown', function (event) {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      var buttons = Array.from(section.querySelectorAll('button'));
      var index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      var next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    });
    window.addEventListener('sutra:note-page-loaded', render);
    window.addEventListener('sutra:notes-pair-changed', render);
    document.addEventListener('focusin', function (event) {
      if (event.target.closest?.('#notesPrimaryPane, #notesSecondaryPane')) render();
    });
    observer.observe(tree, { childList: true, subtree: true });
    render();
  }

  function init() {
    var brand = document.querySelector('.global-app-brand[data-view-target]');
    if (brand) {
      brand.addEventListener('click', function () {
        activateView(brand.getAttribute('data-view-target') || 'today');
      });
    }
    enhanceNotesToolbar();
    initSidebarNotePair();
    initPageTreeGuides();
    settleSync(document.body && document.body.dataset.view);

    var sidebar = document.getElementById('sidebar');
    if (sidebar && typeof MutationObserver === 'function') {
      var sidebarObserver = new MutationObserver(function () {
        if (!usesSidebar(document.body && document.body.dataset.view)) {
          syncSidebarDom(document.body && document.body.dataset.view);
        }
      });
      sidebarObserver.observe(sidebar, { attributes: true, attributeFilter: ['style', 'aria-hidden', 'inert'] });
    }

    window.addEventListener('resize', function () {
      settleSync(document.body && document.body.dataset.view);
    });

  }

  var createSplitSurface = null;
  window.SutraContextualShell = Object.freeze({ sidebarFor: sidebarFor, usesSidebar: usesSidebar, sync: sync,
    registerCreateSplitSurface: function (controller) { createSplitSurface = controller; },
    getCreateSplitSurface: function () { return createSplitSurface; }
  });

  window.addEventListener('noteflow:view-changed', function (event) {
    settleSync(event && event.detail && event.detail.view);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
