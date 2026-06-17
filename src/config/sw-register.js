/* ==========================================================================
   Sutra service worker registration + offline indicator
   ==========================================================================
   Registration is PROTOCOL-GATED: the SW is only registered over http(s).
   Under file:// (the common "just open the file" path) service workers are
   unavailable/disallowed, so we skip silently and Sutra keeps working exactly
   as before. No telemetry; failures are swallowed.
   ========================================================================== */

(function () {
    'use strict';

    var proto = (typeof location !== 'undefined' && location.protocol) || '';
    var canRegister = typeof navigator !== 'undefined'
        && 'serviceWorker' in navigator
        && (proto === 'http:' || proto === 'https:');

    if (canRegister) {
        window.addEventListener('load', function () {
            try {
                navigator.serviceWorker.register('./sw.js').catch(function () { /* offline support is best-effort */ });
            } catch (e) { /* never block boot on SW issues */ }
        });
    }

    // Lightweight, theme-respecting offline indicator. In-app only, no network.
    function setOffline(isOffline) {
        var id = 'sutraOfflineIndicator';
        var el = document.getElementById(id);
        if (isOffline) {
            if (!el) {
                el = document.createElement('div');
                el.id = id;
                el.setAttribute('role', 'status');
                el.setAttribute('aria-live', 'polite');
                el.textContent = 'Offline — your work is saved locally and will keep working.';
                document.body.appendChild(el);
            }
            el.hidden = false;
        } else if (el) {
            el.hidden = true;
        }
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('online', function () { setOffline(false); });
        window.addEventListener('offline', function () { setOffline(true); });
        // Reflect initial state once the DOM is ready.
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { if (!navigator.onLine) setOffline(true); });
        } else if (!navigator.onLine) {
            setOffline(true);
        }
    }
}());
