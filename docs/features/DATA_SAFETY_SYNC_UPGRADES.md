# Data-safety & Sync upgrades

## Trash / restore-deleted (recoverable deletes)

Deleting a page is no longer permanent. Deleted pages are captured into a
**Trash** collection that travels in your `.sutra`/JSON backups, and can be
restored or permanently purged.

- Open Trash via the Command Palette (Ctrl/⌘+K → **Open Trash**) or
  `window.openTrashModal()`.
- Restore puts the page back (with a fresh id if needed and a valid space);
  "Delete forever" purges one item; "Empty Trash" clears all (with confirm).
- Capacity: the 50 most-recent deletions are kept. Help pages are never trashed.
- New persisted top-level collection `trash`, wired through defaults → hydrate →
  persist → serialize → JSON → import → inventory (verified by round-trip).

## Focus session history + time-by-subject

Completed focus-timer sessions are logged to a `focusSessions` history (habit
timers are excluded). Aggregate your time by subject for the last N days:

- `Ctrl/⌘+K → Focus stats (this week)` shows total minutes, session count, and
  the top subjects.
- API: `recordFocusSession({minutes, subject, category})` and
  `getFocusStatsBySubject(days)`. New persisted `focusSessions` collection
  (round-trips like the rest of the workspace).

## Storage-usage gauge

**Settings → Data → Storage Health** now shows browser storage usage via
`navigator.storage.estimate()` (e.g. "12 MB of 2 GB (1%) used") where the browser
supports it — a quick read on how close a media-heavy workspace is to quota.

## Live calendar subscriptions (already supported)

Subscribing to a calendar by **ICS URL** with explicit refresh already exists in
**Settings → School schedule → Calendar subscriptions** (add a name + `.ics` URL,
refresh on demand; cached locally). No change needed.

## Cloud providers (scope note)

Sutra Cloud already supports encrypted backup/restore to Manual file, Supabase,
WebDAV, and a Custom HTTP endpoint, plus encrypted Google Drive sync. OneDrive /
Dropbox / Box remain **scaffolded** — wiring their OAuth requires registering a
public app id per provider and adding the origin to the CSP, so they are left
honestly labelled rather than half-wired. The storage-usage gauge above is the
shipped piece of this item.

## Verification

`tests/e2e/data-safety-upgrades.spec.mjs` covers trash capture/restore/purge,
the Trash modal, and focus-session recording + by-subject aggregation;
`scripts/round-trip-check.mjs` confirms `trash` and `focusSessions` persist.
