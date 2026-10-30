# Workspace Time Machine

Sutra keeps local safety nets so you can recover earlier work without restoring a
whole backup. Available safety nets include **per-page version history**, local
whole-workspace snapshots, and Trash. Planned additions are listed separately
below (see `docs/FEATURE_WAVE_PROGRESS.md`).

## Page version history (available today)

- Every note keeps up to **20 snapshots** in `page.versions`, captured on save
  with a **5-minute throttle**, plus a forced **"Before restore"** checkpoint so
  restoring is itself reversible.
- Open **Version history** from a note to browse snapshots (newest first) with
  timestamps and a content preview, and **restore** any one. Restore replaces
  **only that note** — never the whole workspace — and is title-hierarchy aware
  (it restores the leaf, keeps the parent path).
- Snapshots are **secret-safe by construction**: they capture only editable
  content fields (`title`, `content`, `icon`, `tags`, layout, comments,
  footnotes, citations, blocks). Identity (`id`, `spaceId`, timestamps) and
  security fields (`isLocked`, `lockHash`, `lockSalt`, `lockDuressVerifier`) are
  **never** captured.
- History survives the `.sutra` round-trip. Invariants are enforced by
  `npm run check:versions` (`scripts/version-history-check.mjs`).

## Whole-workspace snapshots (available today)

- **Snapshot browser** — command palette → "Workspace snapshots"
  (`openSnapshotBrowserModal`). Create/restore/delete up to 3 in-app restore
  points (2.5 MB cap per snapshot; larger workspaces are pointed to `.sutra`
  export). Restoring saves a "Before restore" snapshot first, then replaces the
  workspace and reloads.
- **Diff** — each snapshot can show a summary-level diff (pages/tasks/cards/…
  counts) against the current workspace.
- **Single-note restore (2026-07-07)** — "Notes…" on a snapshot lists the pages
  it holds; "Restore copy" brings one back as a **new** page titled
  "&lt;title&gt; (from snapshot)" — non-destructive, fresh id, lock fields kept
  verbatim so a locked note stays locked.
- **Trash (2026-07-01)** — deleted pages, planner tasks, and homework
  assignments restore from the Trash modal (30-day age purge on top of the
  50-item cap).

## Snapshot browser API and coverage

The registered workspace bridge exposes `createWorkspaceSnapshot`,
`getWorkspaceSnapshots`, `diffWorkspaceSnapshot`, `restoreWorkspaceSnapshot`,
and `deleteWorkspaceSnapshot`. `openSnapshotBrowserModal` opens the browser.
Restore requires a successfully saved “Before restore” safety snapshot, awaits
the canonical restore writes, and reports an incomplete restore instead of
announcing success or reloading when persistence fails.

`tests/e2e/snapshot-browser-wave-d.spec.mjs` contains create/summary, collection
count diff, browser-modal, and three-snapshot-cap coverage. This documents test
scope; it is not a claim that the suite ran during this documentation audit.

## Planned additions (tracked, not yet shipped)

- **Compare view** — a textual diff between two versions of one note (the
  snapshot diff is count-level only).
- **Storage Health settings** — cleanup controls (snapshot cap / age trim) on
  top of the existing `navigator.storage.estimate()` readout.

## Privacy

The snapshot browser stores its restore points device-locally under
`sutra:workspaceSnapshots:v1`. That collection is excluded from workspace
backups and Sync; it is not a portable or encrypted backup. Export a
password-encrypted `.sutra` file separately for portable recovery. Page version
history and Trash are workspace data and follow the workspace backup/restore
path. Optional Sync has its own projection and must not be confused with
keeping independent recovery copies.
