/*
 * persistence-state.js — pure persistence-health state policy, extracted from
 * src/core/app.js as part of the incremental decomposition of the global
 * runtime (see docs/architecture/SUTRA_ARCHITECTURE.md → staged extraction).
 *
 * Loaded as a classic <script> BEFORE app.js in Sutra.html, so these top-level
 * declarations live in the SAME shared global scope they did inside app.js —
 * every existing call site resolves unchanged. There is no DOM, no storage,
 * and no dependency on app.js internals here, so this seam is unit-testable
 * in isolation (tests/unit/persistence-state.test.mjs).
 *
 * Owns:
 *   - SUTRA_PERSISTENCE_HEALTH_VERSION  schema version of the health record
 *   - SUTRA_EXPORT_FAILURE_PHASES       failure phases a later save cannot clear
 *   - normalizePersistenceState(raw)    canonical shape of the health record
 */

const SUTRA_PERSISTENCE_HEALTH_VERSION = 1;

// A successful workspace save does not restore a missing attachment or prove
// that a complete backup can be produced. Export-class failures stay visible
// until a complete encrypted export succeeds; routine autosaves may clear the
// rest. Owned here so exporters, importers, and the health UI agree on one list.
const SUTRA_EXPORT_FAILURE_PHASES = new Set(['attachment-export', 'cache-warming', 'sutra-export', 'emergency-export']);

function normalizePersistenceState(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        version: SUTRA_PERSISTENCE_HEALTH_VERSION,
        lastConfirmedSaveAt: source.lastConfirmedSaveAt || null,
        lastAttemptAt: source.lastAttemptAt || null,
        lastFailureAt: source.lastFailureAt || null,
        lastFailure: source.lastFailure && typeof source.lastFailure === 'object' ? source.lastFailure : null,
        lastSerializedBytes: Number(source.lastSerializedBytes) || 0,
        lastLocalStorageBytes: Number(source.lastLocalStorageBytes) || 0,
        lastAttachmentCount: Number(source.lastAttachmentCount) || 0,
        lastAttachmentBytes: Number(source.lastAttachmentBytes) || 0,
        lastAttachmentWarnings: Array.isArray(source.lastAttachmentWarnings) ? source.lastAttachmentWarnings.slice(0, 12) : [],
        backupState: String(source.backupState || 'No recent backup'),
        retryCount: Number(source.retryCount) || 0
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SUTRA_PERSISTENCE_HEALTH_VERSION, SUTRA_EXPORT_FAILURE_PHASES, normalizePersistenceState };
}
