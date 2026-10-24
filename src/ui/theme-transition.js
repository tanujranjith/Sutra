/* Animate explicit theme choices around their existing canonical UI handlers. */
(function (doc, win) {
    'use strict';
    var replaying = false, active = null, pending = null;
    function backdrop() {
        var style = win.getComputedStyle(doc.body);
        var color = style.getPropertyValue('--bg-primary').trim() || style.backgroundColor;
        if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') doc.documentElement.style.setProperty('--sutra-theme-backdrop', color);
    }
    function cleanup() {
        doc.documentElement.classList.remove('sutra-theme-slide');
        doc.documentElement.style.removeProperty('--sutra-theme-backdrop');
    }
    function enabled() {
        return typeof doc.startViewTransition === 'function' && !doc.hidden && doc.body
            && !doc.body.classList.contains('motion-off') && !doc.body.classList.contains('safe-mode')
            && !win.matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)').matches;
    }
    function run(apply) {
        if (!enabled()) { apply(); return; }
        if (active) { pending = apply; active.skipTransition(); return; }
        var applied = false, transition;
        backdrop();
        doc.documentElement.classList.add('sutra-theme-slide');
        try {
            transition = doc.startViewTransition(function () {
                applied = true; apply();
                // Let canonical theme/identity observers finish, then flush final
                // colors while element-level transitions are suppressed.
                return Promise.resolve().then(backdrop);
            });
            active = transition;
        } catch (_) {
            cleanup();
            if (!applied) apply();
            return;
        }
        // Snapshot failures (e.g. a backgrounded tab) must not block theme use.
        transition.ready.catch(function () {});
        transition.finished.catch(function () {}).finally(function () {
            active = null;
            cleanup();
            var next = pending; pending = null;
            if (next) run(next);
        });
    }
    doc.addEventListener('click', function (event) {
        if (replaying || event.defaultPrevented || event.button !== 0 || !enabled()) return;
        var choice = event.target.closest && event.target.closest('#themePanel .preset-card[data-theme], #view-settings .cc-segment[data-theme]');
        if (!choice || choice.disabled || choice.getAttribute('aria-disabled') === 'true' || choice.classList.contains('active')) return;
        event.preventDefault(); event.stopImmediatePropagation();
        run(function () {
            if (!choice.isConnected) return;
            replaying = true;
            try { choice.click(); } finally { replaying = false; }
        });
    }, true);
})(document, window);
