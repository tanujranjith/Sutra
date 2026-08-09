/*
 * Remember whether startup sound already had an explicit browser preference
 * before the legacy app runtime hydrates its default settings. The marker is
 * DOM-local so this bridge adds no new window global and does not own storage.
 */
(function () {
    'use strict';

    var raw = null;
    try {
        if (window.SutraSafeStorage && typeof window.SutraSafeStorage.get === 'function') {
            raw = window.SutraSafeStorage.get('sutra_startup_sound', { parseJson: false, fallback: null });
        }
    } catch (_) { raw = null; }
    var explicit = raw === '0' || raw === '1';
    try {
        document.documentElement.setAttribute('data-sutra-startup-sound-explicit', explicit ? '1' : '0');
    } catch (_) { /* best effort */ }
}());
