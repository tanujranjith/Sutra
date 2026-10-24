/* Animate explicit theme choices around their existing canonical UI handlers. */
(function (doc, win) {
    'use strict';
    var replaying = false, active = null, pending = null;
    function enabled() {
        return typeof doc.startViewTransition === 'function' && !doc.hidden && doc.body
            && !doc.body.classList.contains('motion-off') && !doc.body.classList.contains('safe-mode')
            && !win.matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)').matches;
    }
    function run(apply) {
        if (!enabled()) { apply(); return; }
        if (active) { pending = apply; active.skipTransition(); return; }
        var applied = false, transition;
        doc.documentElement.classList.add('sutra-theme-slide');
        try {
            transition = doc.startViewTransition(function () { applied = true; apply(); });
            active = transition;
        } catch (_) {
            doc.documentElement.classList.remove('sutra-theme-slide');
            if (!applied) apply();
            return;
        }
        // Snapshot failures (e.g. a backgrounded tab) must not block theme use.
        transition.ready.catch(function () {});
        transition.finished.catch(function () {}).finally(function () {
            active = null;
            doc.documentElement.classList.remove('sutra-theme-slide');
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
