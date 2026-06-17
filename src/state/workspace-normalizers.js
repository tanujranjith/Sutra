/*
 * workspace-normalizers.js — pure workspace-state normalizers, extracted from
 * src/core/app.js as the first incremental step of decomposing the 64k-line
 * global runtime (see docs/architecture/SUTRA_ARCHITECTURE.md → "Staged app.js
 * extraction plan").
 *
 * Loaded as a classic <script> BEFORE app.js in Sutra.html, so these top-level
 * declarations live in the SAME shared global scope they did inside app.js —
 * every existing call site in app.js (and elsewhere) resolves unchanged. There
 * is no DOM, no storage, and no dependency on app.js internals here, so this is
 * the safe end of the extraction seam and can be unit-tested in isolation.
 *
 * Owns:
 *   - OPTIONAL_FEATURE_VIEWS      the registry of optional, toggleable views
 *   - STUDENT_DEFAULT_ENABLED_VIEWS  fresh-install, student-first defaults
 *   - getDefaultEnabledViews()    builds the default enabled-views map
 *   - normalizeEnabledViews(raw)  merges stored prefs over the defaults
 */

const OPTIONAL_FEATURE_VIEWS = ['today', 'timeline', 'notes', 'college', 'homework', 'courses', 'alldue', 'apstudy', 'collegeapp', 'life', 'business', 'review', 'cramhub'];

// Public-beta default: a focused, student-first navigation. Core academic views
// are on; broader optional modules (College planning, Life, Business, Course Hub)
// are off by default and can be enabled from Settings → Feature tabs (Labs).
// Existing users keep their saved selections — normalizeEnabledViews only
// overrides keys actually present in stored preferences. Review/Cram Hub stay
// "enabled" so their consolidated Testing Hub redirects work even though they
// render no standalone tab.
const STUDENT_DEFAULT_ENABLED_VIEWS = new Set(['today', 'timeline', 'notes', 'homework', 'apstudy', 'review', 'cramhub']);

function getDefaultEnabledViews() {
    return OPTIONAL_FEATURE_VIEWS.reduce((acc, view) => {
        acc[view] = STUDENT_DEFAULT_ENABLED_VIEWS.has(view);
        return acc;
    }, {});
}

function normalizeEnabledViews(raw) {
    const normalized = getDefaultEnabledViews();
    if (!raw || typeof raw !== 'object') return normalized;
    OPTIONAL_FEATURE_VIEWS.forEach(view => {
        if (Object.prototype.hasOwnProperty.call(raw, view)) {
            normalized[view] = raw[view] !== false;
        }
    });
    return normalized;
}
