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
    summary.setAttribute('aria-label', 'More note tools');
    summary.setAttribute('title', 'More note tools');
    var summaryIcon = document.createElement('i');
    summaryIcon.className = 'fas fa-ellipsis';
    summaryIcon.setAttribute('aria-hidden', 'true');
    summary.appendChild(summaryIcon);
    var menu = document.createElement('div');
    menu.className = 'notes-toolbar-overflow-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'More note tools');
    menu.hidden = true;
    details.appendChild(summary);

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
    }

    function closeMenu() {
      details.open = false;
      menu.hidden = true;
      summary.setAttribute('aria-expanded', 'false');
    }

    summary.setAttribute('aria-expanded', 'false');
    details.addEventListener('toggle', function () {
      menu.hidden = !details.open;
      summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
      if (details.open) positionMenu();
    });

    details.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      closeMenu();
      summary.focus();
    });
    menu.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      closeMenu();
      summary.focus();
    });
    menu.addEventListener('click', function (event) {
      if (event.target.closest('button')) closeMenu();
    });
    window.addEventListener('resize', function () {
      if (details.open) positionMenu();
    });
    document.addEventListener('pointerdown', function (event) {
      if (details.open && !details.contains(event.target) && !menu.contains(event.target)) closeMenu();
    });
  }

  function init() {
    var brand = document.querySelector('.global-app-brand[data-view-target]');
    if (brand) {
      brand.addEventListener('click', function () {
        activateView(brand.getAttribute('data-view-target') || 'today');
      });
    }
    enhanceNotesToolbar();
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

  window.SutraContextualShell = Object.freeze({ sidebarFor: sidebarFor, usesSidebar: usesSidebar, sync: sync });

  window.addEventListener('noteflow:view-changed', function (event) {
    settleSync(event && event.detail && event.detail.view);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
