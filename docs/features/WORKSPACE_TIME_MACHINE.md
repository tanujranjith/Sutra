# Workspace Time Machine

Sutra keeps local safety nets so you can recover earlier work without restoring a
whole backup. Today this is built on **per-page version history**; this doc also
records the planned additions (see `docs/FEATURE_WAVE_PROGRESS.md`).

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
  security fields (`isLocked`, `lockHash`, `lockSalt`) are **never** captured.
- History survives the `.sutra` round-trip. Invariants are enforced by
  `npm run check:versions` (`scripts/version-history-check.mjs`).

## Planned additions (tracked, not yet shipped)

These are documented honestly as follow-ups so the feature isn't overclaimed:

- **Restore deleted page/task** — a local trash/recycle bin with a retention
  window. (New persisted collection; must be wired through defaults → hydrate →
  serialize → `.sutra` → migrations, and excluded from secrets.)
- **Snapshot browser** — browse/restore whole-workspace safety snapshots.
- **Single-note restore from a snapshot** — pull one page out of a snapshot
  without replacing the workspace.
- **Compare view** — title/date/word-count and a simple textual diff between two
  versions.
- **Storage Health** — measure snapshot/workspace size (via
  `navigator.storage.estimate()`), warn when large, and offer cleanup settings
  (snapshot cap / age trim).

## Privacy

Nothing here leaves the device. Snapshots are local and, like the rest of the
workspace, only ever exported inside an **encrypted** `.sutra` backup — never to a
network endpoint on their own.
