/*
 * mobile-nav.js — native-feel mobile navigation (window.SutraMobileNav).
 *
 * Adds, on small screens only:
 *   - a fixed bottom tab bar built from the existing top `.view-tab` buttons
 *     (so it always reflects the enabled views / Sutra Mode),
 *   - swipe left/right to move between adjacent views,
 *   - pull-to-refresh at the top of a view to re-render it,
 *   - light haptic feedback (navigator.vibrate) on tap.
 *
 * It is deliberately decoupled from app.js: taps and gestures dispatch a click
 * on the corresponding `.view-tab`, reusing the app's wired view-switch handler,
 * and it stays in sync via the `noteflow:view-changed` event app.js dispatches.
 * Zero dependencies; respects prefers-reduced-motion (no vibration then).
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var ICONS = {
    today: 'fa-house', timeline: 'fa-calendar-days', notes: 'fa-pen-to-square',
    homework: 'fa-book-open', apstudy: 'fa-graduation-cap', collegeapp: 'fa-building-columns',
    college: 'fa-building-columns', life: 'fa-heart', business: 'fa-briefcase',
    courses: 'fa-book', settings: 'fa-gear', progress: 'fa-chart-line', review: 'fa-layer-group'
  };
  var MAX_ITEMS = 5;
  var navEl = null;

  function reducedMotion() {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }
  function isMobile() {
    try { return window.matchMedia && window.matchMedia('(max-width: 640px)').matches; }
    catch (e) { return false; }
  }
  function vibrate() {
    try { if (!reducedMotion() && navigator.vibrate) navigator.vibrate(8); } catch (e) { /* nc */ }
  }
  function activeView() { return (document.body && document.body.dataset.view) || 'today'; }

  function enabledTabs() {
    return Array.prototype.slice.call(document.querySelectorAll('.view-tab'))
      .filter(function (t) { return t && !t.hidden && t.getAttribute('aria-hidden') !== 'true'; });
  }
  function mobileTabs() {
    // The overflow menu contains duplicate .view-tab elements. Deduplicate and
    // put the student daily loop first so Homework never gets pushed behind
    // business/advanced views on a phone.
    var seen = {};
    var tabs = enabledTabs().filter(function (tab) {
      var view = tab.getAttribute('data-view');
      if (!view || seen[view]) return false;
      seen[view] = true;
      return true;
    });
    var order = ['today', 'homework', 'notes', 'timeline', 'apstudy', 'settings'];
    tabs.sort(function (a, b) {
      var ai = order.indexOf(a.getAttribute('data-view'));
      var bi = order.indexOf(b.getAttribute('data-view'));
      if (ai === -1) ai = order.length + 1;
      if (bi === -1) bi = order.length + 1;
      return ai - bi;
    });
    return tabs;
  }
  function shortLabel(tab) {
    var txt = (tab.textContent || '').replace(/\s+/g, ' ').trim();
    return txt.length > 9 ? txt.slice(0, 8).trim() : txt;
  }
  function clickTabForView(view) {
    var tab = document.querySelector('.view-tab[data-view="' + view + '"]');
    if (tab) { vibrate(); tab.click(); }
  }

  function build() {
    if (navEl || !document.body) return;
    navEl = document.createElement('nav');
    navEl.id = 'sutraBottomNav';
    navEl.className = 'sutra-bottom-nav';
    navEl.setAttribute('aria-label', 'Primary navigation');
    document.body.appendChild(navEl);
    navEl.addEventListener('click', function (e) {
      var action = e.target.closest('[data-bn-action]');
      if (action && action.getAttribute('data-bn-action') === 'capture') {
        vibrate();
        try {
          if (window.SutraStudentLoopActions && typeof window.SutraStudentLoopActions.openCapture === 'function') window.SutraStudentLoopActions.openCapture();
          else if (typeof window.openQuickCaptureModal === 'function') window.openQuickCaptureModal('');
        } catch (err) { /* non-critical */ }
        return;
      }
      var btn = e.target.closest('[data-bn-view]');
      if (!btn) return;
      var v = btn.getAttribute('data-bn-view');
      if (v === '__more') {
        var tog = document.querySelector('.view-tabs-toggle');
        if (tog) { vibrate(); tog.click(); }
      } else {
        clickTabForView(v);
      }
    });
    render();
    window.addEventListener('noteflow:view-changed', render);
  }

  function render() {
    if (!navEl) return;
    var tabs = mobileTabs();
    // Reserve one central, always-present slot for Quick Capture. Three views
    // plus More (when needed) keep every target comfortably tappable.
    var overflow = tabs.length > (MAX_ITEMS - 1);
    var items = overflow ? tabs.slice(0, MAX_ITEMS - 2) : tabs.slice(0, MAX_ITEMS - 1);
    var current = activeView();
    navEl.replaceChildren();
    items.forEach(function (tab) {
      var view = tab.getAttribute('data-view');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sutra-bn-item' + (view === current ? ' active' : '');
      b.setAttribute('data-bn-view', view);
      b.setAttribute('aria-label', (tab.textContent || view).trim());
      var i = document.createElement('i');
      i.className = 'fas ' + (ICONS[view] || 'fa-circle');
      i.setAttribute('aria-hidden', 'true');
      var span = document.createElement('span');
      span.textContent = shortLabel(tab);
      b.appendChild(i);
      b.appendChild(span);
      navEl.appendChild(b);
    });
    var capture = document.createElement('button');
    capture.type = 'button';
    capture.className = 'sutra-bn-capture';
    capture.setAttribute('data-bn-action', 'capture');
    capture.setAttribute('aria-label', 'Quick Capture');
    var ci = document.createElement('i');
    ci.className = 'fas fa-bolt';
    ci.setAttribute('aria-hidden', 'true');
    var cs = document.createElement('span');
    cs.textContent = 'Capture';
    capture.appendChild(ci);
    capture.appendChild(cs);
    // Keep the central action between the two most common student destinations.
    var insertBefore = navEl.children.length > 2 ? navEl.children[2] : null;
    if (insertBefore) navEl.insertBefore(capture, insertBefore);
    else navEl.appendChild(capture);
    if (overflow) {
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'sutra-bn-item' + (items.some(function (tab) { return tab.getAttribute('data-view') === current; }) ? '' : ' active');
      more.setAttribute('data-bn-view', '__more');
      more.setAttribute('aria-label', 'More views');
      var mi = document.createElement('i');
      mi.className = 'fas fa-ellipsis';
      mi.setAttribute('aria-hidden', 'true');
      var ms = document.createElement('span');
      ms.textContent = 'More';
      more.appendChild(mi);
      more.appendChild(ms);
      navEl.appendChild(more);
    }
  }

  function moveView(dir) {
    if (!isMobile()) return;
    var tabs = mobileTabs();
    var cur = activeView();
    var idx = tabs.findIndex(function (t) { return t.getAttribute('data-view') === cur; });
    if (idx === -1) return;
    var next = idx + dir;
    if (next < 0 || next >= tabs.length) return;
    clickTabForView(tabs[next].getAttribute('data-view'));
  }

  function refresh() {
    if (!isMobile()) return;
    vibrate();
    var tab = document.querySelector('.view-tab[data-view="' + activeView() + '"]');
    if (tab) tab.click(); // re-trigger the active view's render
    try { if (typeof window.showToast === 'function') window.showToast('Refreshed'); } catch (e) { /* nc */ }
  }

  function setupGestures() {
    var sx = 0; var sy = 0; var tracking = false; var pulling = false;
    function scroller() { return document.scrollingElement || document.documentElement; }
    document.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) { tracking = false; return; }
      var t = e.target;
      // Don't hijack gestures inside editors, modals, inputs, or the nav itself.
      if (t.closest && t.closest('.modal, #editor, .canvas-editor, input, textarea, select, [contenteditable="true"], .sutra-bottom-nav, .review-bigcard')) { tracking = false; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true; pulling = false;
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!tracking || !e.touches || e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - sx;
      var dy = e.touches[0].clientY - sy;
      if (dy > 70 && Math.abs(dy) > Math.abs(dx) * 2 && (scroller().scrollTop || 0) <= 0) pulling = true;
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var ch = (e.changedTouches && e.changedTouches[0]) || null;
      if (!ch) return;
      var dx = ch.clientX - sx;
      var dy = ch.clientY - sy;
      if (pulling) { pulling = false; refresh(); return; }
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.6) moveView(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function init() {
    build();
    setupGestures();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.SutraMobileNav = { render: render };
})();
