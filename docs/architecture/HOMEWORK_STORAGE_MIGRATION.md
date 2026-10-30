# Homework storage migration and current contract

**Status:** retrospective architecture record. The migration described here was introduced in code in July 2026. This document records the current task decision to keep that design; it does not perform a new migration, modify workspace data, or claim that the migration was newly tested.

## Decision recorded on 2026-10-17

The user delegated the storage-contract choice to the agent. After tracing the current implementation and its history, this task keeps the existing canonical IndexedDB design. It does not add a second writer or backfill localStorage. This is the decision for the current task; it is not evidence that the change was approved when it was introduced in July 2026.

The accompanying edit to this candidate's `AGENTS.md` records the current store contract and requires a dedicated, versioned migration for any future storage-authority change. The primary checkout is unchanged. That current policy resolution is not evidence that the migration was approved when it was introduced in July 2026.

## Historical identity and migration marker

Commit `1388272d95f1fea039d0c6f0fa67ece49fd55cb9` (2026-07-10, “Update Sutra application”) introduced `src/domain/homework-store.js`, `src/compat/legacy-homework.js`, their initial unit tests, and the first `docs/runtime-architecture.md`. That code established the canonical workspace as Homework's writable authority and made the legacy adapter read-only. Commit `21c0ff29` (2026-08-25) later strengthened the durable persistence and restore behavior; it did not change that authority decision.

The current Homework store has `SCHEMA_VERSION = 2`. That number describes the Homework record shape. The legacy localStorage import is not a registered, numbered workspace migration: `mergeLegacy` writes `homeworkWorkspace.migrations.legacyHomework` with `status`, a source fingerprint, and `completedAt`. A completed marker prevents replaying those raw arrays on later startup. `src/core/migrations.js` separately has a numbered migration for older `legacyCourses` and `legacyTasks` fields already inside `homeworkWorkspace`; that is not the localStorage import.

## Current storage behavior

`SutraHomeworkStore` owns current Homework UI writes and the normalized courses and tasks in `appData.homeworkWorkspace`, saved as part of the main workspace in IndexedDB. On workspace hydration, `src/core/app.js` configures the store with the canonical workspace adapter, reads legacy arrays, merges them if the marker is incomplete, and schedules a canonical save. Normal Homework writes use the same store and persistence-health path. Retained v1 paths below are a separate compatibility boundary, so this is not a claim that every legacy mutation already uses the store.

The frozen keys `hwCourses:v2`, `hwTasks:v2`, `homeworkCourses:v1`, and `homeworkTasks:v1` are retained as compatibility identifiers. `SutraLegacyHomework.readSnapshot` reads them as migration inputs; it does not delete or write them. Current v2 compatibility calls through `readLocalArraySafe` and `writeLocalArraySafe` are routed to `SutraHomeworkStore`, so the raw v2 localStorage values are not maintained mirrors and may be stale after migration. Once the completion marker is durable, edits made directly to those raw values are not imported again.

The read-only description applies to the migration adapter. `getHomeworkSnapshotForSync` in `src/core/app.js` still reads v1 arrays, and source-specific task completion, update, and deletion paths still write `homeworkTasks:v1` through the fallback in `writeLocalArraySafe`. These paths do not mirror canonical edits. Changing or removing them needs a separate compatibility review and regression coverage; this record preserves their existing behavior.

Normalization retains source IDs and unknown fields on valid course and task records, normalizes course links, and quarantines invalid records. If the same ID occurs in both sources, the record with the newer update timestamp wins as a whole; fields unique to the older duplicate are not combined into the winner. The workspace inventory stores unlisted workspace data through its `homeworkWorkspace.__rest` record, but the migration marker is not itself an integer schema version.

## Import, backup, reload, and recovery

Current workspace serialization includes `homeworkWorkspace`, and workspace import restores it through the canonical store. The encrypted `.sutra` backup and restore path therefore carries Homework with the main workspace. Existing plaintext `.sutra` and `.atelier` imports remain supported by the backup importer. The adapter reads legacy localStorage arrays at startup; it merges them only when the canonical workspace has no completed import marker.

The source tests cover legacy-array parsing, ID and unknown-field retention, malformed-input quarantine, duplicate-ID selection, and repeated-import idempotence. Browser coverage seeds legacy v2 keys and confirms that startup imports them into the current store. Separate backup coverage exercises canonical Homework reload and encrypted export/restore. Those tests do not establish that localStorage keys are mirrored after current edits or that a downgrade can read changes made after migration.

Before moving a current workspace to an older build that treats raw localStorage as authoritative, create and verify a current encrypted `.sutra` backup. The old arrays may not contain edits made since migration. Restore through the supported current importer; do not treat stale raw values as a current snapshot or replay them over a completed canonical workspace. This record does not delete the old arrays or change any user's data.

## Future data-changing work

Any future change to this authority contract must be a separately versioned, idempotent migration. It must preserve the original legacy arrays until the destination save is durably verified, retain unknown fields and stable IDs, handle same-ID conflicts and deletions without resurrecting work, and give the user a recoverable backup path. Its verification must cover legacy import, canonical edits and deletions, reload, workspace JSON import/export, encrypted backup restore, and connected Homework projections. No such future migration or mirror is implemented by this record.

## Evidence boundary

The latest evidence supplied for the broader candidate was CI run `38997646618` at `d95489e`: 16 lanes succeeded and one WebKit 5 lane failed in a closing-connection persistence test with `WorkspaceConflictError`. Later local commits `22e72fe` and `21554b2` were unpushed. That is historical, limited evidence, not certification of this record or the selected contract. No tests or builds were run while preparing this documentation.
