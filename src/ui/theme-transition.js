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
        doc.documentElement.classList.remove('sutra-theme-reveal');
        doc.documentElement.classList.remove('sutra-theme-captured');
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
        doc.documentElement.classList.add('sutra-theme-reveal');
        try {
            transition = doc.startViewTransition(function () {
                applied = true; apply();
                // Capture the new-only surface for an equal-and-opposite
                // transform reveal, without animating a viewport-size mask.
                doc.documentElement.classList.add('sutra-theme-captured');
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
    function activate(choice) {
        run(function () {
            if (!choice.isConnected) return;
            replaying = true;
            try { choice.click(); } finally { replaying = false; }
        });
    }
    // Window capture precedes document-level preset dispatchers, so named
    // presets are captured before their active class or palette changes.
    win.addEventListener('click', function (event) {
        if (replaying || event.defaultPrevented || event.button !== 0 || !enabled()) return;
        if (event.target.closest && event.target.closest('[data-custom-theme-action], .custom-theme-add-card')) return;
        var choice = event.target.closest && event.target.closest('#themePanel .preset-card[data-theme], #customThemeGrid .custom-theme-card[data-custom-theme-id], #applyCustomThemeBtn, #view-settings .cc-segment[data-theme]');
        if (!choice || choice.disabled || choice.getAttribute('aria-disabled') === 'true' || choice.classList.contains('active')) return;
        event.preventDefault(); event.stopImmediatePropagation();
        activate(choice);
    }, true);
    win.addEventListener('keydown', function (event) {
        if (replaying || event.defaultPrevented || (event.key !== 'Enter' && event.key !== ' ') || !enabled()) return;
        if (event.target.closest && event.target.closest('[data-custom-theme-action]')) return;
        var choice = event.target.closest && event.target.closest('#customThemeGrid .custom-theme-card[data-custom-theme-id]');
        if (!choice || choice.classList.contains('active')) return;
        event.preventDefault(); event.stopImmediatePropagation();
        activate(choice);
    }, true);
    win.addEventListener('change', function (event) {
        var select = event.target;
        if (replaying || event.defaultPrevented || !enabled() || select.id !== 'customThemeSelect') return;
        // Otherwise this select only stages a choice; its Apply button owns the
        // visible theme change and will animate that action instead.
        if (doc.body.getAttribute('data-theme-key') !== 'custom') return;
        var value = select.value;
        event.preventDefault(); event.stopImmediatePropagation();
        run(function () {
            if (!select.isConnected) return;
            select.value = value;
            replaying = true;
            try { select.dispatchEvent(new win.Event('change', { bubbles: true })); } finally { replaying = false; }
        });
    }, true);
})(document, window);
