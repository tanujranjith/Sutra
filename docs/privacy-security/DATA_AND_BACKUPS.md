# Data and Backups

_How Sutra stores your workspace locally, and how the `.sutra` backup format
exports and restores it. For a verified, implementation-level audit of the
persistence and round-trip behavior, see the companion
[`sutra-save-systems-audit.md`](../architecture/sutra-save-systems-audit.md)._

---

## 1. Persistence architecture

Sutra keeps your workspace on your device in a small number of local stores.
Several store names are **legacy-named compatibility identifiers** — retained
unchanged across the rename to Sutra so existing installs keep working. The name
is only an identifier; the data is always local.

### Primary store — the workspace (IndexedDB)

Before defaults and feature normalizers run, stored workspaces pass through the
versioned registry in `src/core/migrations.js`. Each migration is pure and
lossless, preserves unknown fields, and is executed against old-workspace
fixtures by `npm run check:migrations`.

- Your entire workspace is a single `appData` object held in **IndexedDB**.
- **Database:** `noteflow_atelier_db` · **store:** `workspace` · **key:** `root`.
- It is hydrated through one merge/normalize path on load and written through one
  debounced save path, with a synchronous flush on page-hide / unload so
  in-progress edits are not lost.

### Attachments — binary files (IndexedDB)

- Course-file **binaries** live in a separate IndexedDB database,
  `noteflow_attachments_db`, store `blobs`, keyed per file.
- Only the **bytes** live here. Each file's **metadata** lives in the workspace
  (`appData.courseWorkspace.files[]`).

### Homework — localStorage mirror

- Homework is the homework module's own source of truth in **localStorage**:
  `hwCourses:v2` and `hwTasks:v2` (with legacy `:v1` keys read for migration).
- It is **mirrored** into `appData.homeworkWorkspace` at save time and **restored
  to localStorage** on import, so it travels in backups while remaining the live
  source of truth at runtime.
- **Failure handling (storage hardening).** Homework writes go through the shared
  `SutraSafeStorage` wrapper. If a write fails (quota exhausted, private-mode
  security error, etc.), Homework **does not crash and does not lose your change
  in memory**: the new/edited item stays on screen and a **clear, durable warning
  banner** appears (`#sutraStorageWarningBanner`) offering an emergency backup.
  This is **separate** from the catastrophic core IndexedDB save-failure banner
  (`#sutraSaveFailureBanner`), which is reserved for the canonical workspace
  pipeline — a Homework/localStorage hiccup never falsely claims total workspace
  data loss. The warning clears automatically once a write succeeds again.

### Other local data

- A curated allow-list of standalone **localStorage preferences** is embedded in
  exports (focus-timer state, streak settings, AI provider/model **choices**, the
  Assistant Activity log, and a couple of feature flags).
- **Secrets** (AI provider API keys) live in **`sessionStorage` only** — never in
  localStorage, never in IndexedDB, never exported.

---

## 2. The encrypted `.sutra` package

**`.sutra`** is the **default** backup format. Exporting produces a single file
named:

```
sutra_workspace_<YYYY-MM-DD>_<HH-mm-ss>.sutra
```

The date and time are taken from your computer's local timezone (24-hour clock,
zero-padded, hyphens instead of colons so the name is valid on Windows). The
second-level timestamp means repeated exports on the same day no longer collide
or pick up OS-added ` (1)` suffixes.

New exports are not plaintext ZIP files. They are password-encrypted binary
envelopes with this outer format:

```
SUTRAENC                         # 8-byte magic
envelopeVersion                  # 1 byte, currently 1
headerLength                     # 4-byte big-endian unsigned integer
UTF-8 JSON header                # authenticated as AES-GCM additional data
ciphertext                       # AES-GCM ciphertext plus 128-bit tag
```

The outer header contains only decryption metadata: format/version, purpose,
PBKDF2-HMAC-SHA-256 parameters, salt, AES-GCM parameters, IV, tag length, and
payload content type (`application/zip`). It does **not** contain note titles,
asset filenames, course names, settings, counts, or user content.

Encryption parameters:

- AES-GCM with a 256-bit key.
- 128-bit authentication tag.
- Fresh 12-byte IV for every export/upload.
- PBKDF2-HMAC-SHA-256 with 600,000 iterations.
- Fresh 16-byte salt for every manual `.sutra` export.
- `crypto.getRandomValues()` for salt and IV generation.
- The exact encoded header bytes are AES-GCM additional authenticated data.

The ciphertext contains the existing internal ZIP package:

```
manifest.json                     # identifies and describes the backup
workspace.json                    # the full serialized workspace payload
assets/                           # extracted binary/inline assets (deduped)
  <asset files>
metadata/
  export-summary.json             # human-readable summary of what was exported
  checksums.json                  # checksums for integrity verification
```

How assets are handled inside the encrypted package: inline `data:` assets in your workspace — inline note
images and **Document Background** images — are extracted out of the JSON into
the `assets/` folder (deduplicated by content), each with a **checksum**, and
referenced from `workspace.json`. Course-file binaries from the attachments
database are likewise carried in the package. On import the assets are rehydrated
back into the workspace. This keeps the JSON lean and gives every binary an
integrity check.

### Internal manifest fields

`manifest.json` identifies the package as Sutra's and records its format. The
identifying fields include:

```json
{
  "product": "Sutra",
  "format": "sutra-workspace",
  "formatVersion": 1,
  "legacyCompatible": true,
  "appName": "Sutra"
}
```

along with export metadata and a content summary (per-section counts plus asset
and warning counts) and the asset list with per-asset checksum information.

---

## 3. Export vs. import flows

### Export

From **Settings → Data** you can export either:

- **`.sutra`** — the encrypted package described above (default), or
- **JSON** — a single-file projection of the same workspace payload with assets
  inlined (no zip dependency). JSON is unencrypted and should be treated as an
  advanced/recovery format.

Both export paths build the workspace payload **with secrets stripped**: API
keys and other secret-shaped fields are redacted, so credentials are never
written to a backup. Provider/model **choices** (not secrets) are included.

### Import

Importing a backup rebuilds every runtime collection from the file, restores the
course-file binaries into the attachments database, restores the homework
localStorage snapshot, re-applies your theme and preferences, **re-renders every
view**, and writes the result straight back to IndexedDB so the import is durable
across the next reload.

Encrypted `.sutra` import first detects the `SUTRAENC` magic prefix, asks for the
password, derives the key, decrypts with AES-GCM, and only then hands the
recovered internal ZIP bytes to the existing package parser. Package structure,
manifest version, checksums, asset paths, workspace schema, pre-import safety
snapshot, persistence, and render verification all still run. Wrong passwords,
tampered headers, tampered ciphertext, truncated files, and unsupported envelope
versions fail before the current workspace is mutated.

### Legacy `.atelier` import

Older unencrypted **`.sutra`** and **`.atelier`** backups still import. The import
validator accepts **both** the new `sutra-workspace` manifest **and** the legacy
`noteflow_atelier_project` manifest, and the import dispatcher routes legacy
`.sutra` and `.atelier` files to the **same package importer**. Old backups are
never broken.

Plugins follow the same pattern: the new export extension is **`.sutra-plugin`**,
and legacy **`.atelier-plugin`** bundles still import.

---

## 4. Storage Health

> Public-beta hardening note: the app now treats this as **Storage Health**.
> It includes last confirmed save, approximate workspace/localStorage size,
> attachment counts and cached bytes, warnings, and backup state. If a save
> cannot be confirmed, Sutra shows a non-dismissible banner with Retry,
> Emergency `.sutra` Export, Technical Details, last-confirmed-save time, and
> attachment warnings. The live in-memory workspace is preserved; do not close
> the tab until a save recovers or an emergency backup downloads.

Full `.sutra` packaging uses the vendored local JSZip build in
`assets/vendor/jszip/`, so core backups do not require a CDN request. If a
required attachment blob is missing or cannot be warmed from IndexedDB, Sutra
refuses the `.sutra` export instead of creating a partial backup.

Sutra surfaces a small **Storage Health** readout (formerly "Local Data
Health") so you can see your backup posture at a glance:

- **Last Backup** — when you last exported your workspace.
- **Last Restore** — when you last imported a backup.

Use it as a reminder to take fresh encrypted `.sutra` backups periodically.
Optional Google Drive sync is a convenience layer, not a replacement for a
backup you control.

---

## 5. Optional encrypted Google Drive sync

Google Drive sync is optional and disabled by default. Sutra remains local-first:
IndexedDB/localStorage is the working copy, and local saving does not depend on
Drive availability.

When enabled, Sutra requests only:

`https://www.googleapis.com/auth/drive.appdata`

It uses Google Identity Services in the browser and direct Drive REST API calls.
The sync file lives in Drive's hidden application-data folder, not the user's
visible My Drive:

- File name: `sutra-sync-current-v1.sutra`
- Parent: `appDataFolder`
- App properties: `{ "sutraRole": "sync-current", "sutraSyncFormat": "1" }`
- Discovery: `files.list` with `spaces=appDataFolder` and a narrow fields
  projection (`id,name,version,modifiedTime,headRevisionId,size,appProperties`).

Drive receives the same encrypted envelope as manual `.sutra` export, with
`purpose: "google-drive-sync"` and a `vaultId`. The vault salt is stable for that
sync vault so Sutra can keep a derived AES key in memory while the page is open;
every uploaded snapshot still gets a fresh random 12-byte AES-GCM IV.

The cloud-sync password, derived key, OAuth access token, and decrypted package
bytes are never stored. The access token and derived key live in memory only.
Device-local non-secret sync metadata is stored at `sutra:googleDriveSync:v1`
and is deliberately excluded from `.sutra` backups and cloud snapshots.

Conflict behavior is explicit. If this device and the Drive copy both changed,
Sutra enters a conflict state and offers snapshot-level choices: keep this
device, use the Drive version here, download this device backup, download the
Drive backup, or cancel. Sutra does not perform blind last-write-wins merging.

Direct `file://` launch remains fully local but may not support Google OAuth.
Use the hosted HTTPS app or localhost for Drive sync. Deployment setup is
documented in [`GOOGLE_DRIVE_SYNC_SETUP.md`](../features/GOOGLE_DRIVE_SYNC_SETUP.md).

---

## 6. Pre-import safety snapshot

Importing replaces your current workspace, so before applying an import Sutra
takes a **pre-import safety snapshot** of your existing data first. If an import
is not what you expected, this snapshot is your fallback — the import is not a
one-way door that discards your prior state with no recourse.

---

## 7. What travels vs. what's excluded

**Travels in a backup (`.sutra` and JSON):**

- All notes (content, structure, inline images, **Document Backgrounds**, locked-
  page lock data), spaces, pinned pages.
- Tasks, time blocks, homework (courses + assignments), Course Hub metadata
  **and file binaries**.
- Testing Hub, AP Study, Review, College, Academic, Life, Projects & Work data.
- Streaks, habits, cram sessions, focus templates, split-view contexts.
- Settings, themes and custom themes, onboarding state.
- Assistant **preferences** and **provider/model choices**; the **Assistant
  Activity** log (`sutra:activityLog:v1`, migrated from `flow:activityLog:v1`) —
  not a secret, so it travels.

**Excluded by design:**

- **AI provider API keys / secrets** — `sessionStorage` only; redacted from
  exports. Re-enter after import.
- **Backup passwords, Google Drive sync passwords, OAuth access tokens, refresh
  tokens, client secrets, and derived encryption keys** — never exported.
- **Google Drive sync operational metadata** (`sutra:googleDriveSync:v1`) —
  device-local only.
- **Conversation history** — session-local.
- **Regenerable caches** and ephemeral UI state (e.g. scroll position, the
  in-session unlocked-page set) — not exported; locked pages correctly require
  the PIN again after a reload.

---

## 8. Round-trip guarantees

Sutra's persistence and `.sutra`/`.atelier` portability are designed and verified
to round-trip a rich workspace. As documented in the
[save-systems audit](../architecture/sutra-save-systems-audit.md), a full destructive cycle —
**edit → refresh → reopen → clear in-memory state → export → wipe all storage →
import → refresh** — restores notes, inline images, tasks and their note links,
course files **and their binaries**, homework, and the rest of the workspace,
with cross-feature relationships (IDs and links) preserved. Static parity checks
guard against silent field drift, and a behavioral QA harness exercises the live
round-trip in a browser.

---

## 9. Recovery

- **Lost or corrupted workspace:** import your most recent `.sutra` (or JSON, or
  legacy `.atelier`) backup from Settings → Data.
- **Unexpected import:** fall back to the **pre-import safety snapshot** taken
  automatically before the import.
- **App misbehaving (CSS/plugins), data intact:** load in **Safe Mode**
  (`?sutraSafeMode=1`, legacy `?atelierSafeMode=1`, or hold **Shift** on load),
  which skips custom CSS and plugins and **never deletes** anything.
- **Fully offline:** both **JSON** and core **`.sutra`** backup paths are designed
  to work without third-party requests.
  Core `.sutra` backup uses the vendored JSZip library under
  `assets/vendor/jszip/`, so it should not require a third-party request.

---

## 10. Storage names quick reference

| Store | Type | Holds | Note |
|---|---|---|---|
| `noteflow_atelier_db` (store `workspace`, key `root`) | IndexedDB | The whole `appData` workspace | Legacy-named compatibility identifier |
| `noteflow_attachments_db` (store `blobs`) | IndexedDB | Course-file binaries | Legacy-named compatibility identifier |
| `hwCourses:v2`, `hwTasks:v2` | localStorage | Homework (source of truth) | Mirrored into `appData.homeworkWorkspace` |
| Curated preference keys | localStorage | Focus timer, streak settings, provider/model choices, Assistant Activity | Embedded in exports |
| `sutra:googleDriveSync:v1` | localStorage | Non-secret Drive sync metadata | Device-local only; not exported |
| API keys, chat history | sessionStorage | Secrets + conversation | Never persisted, never exported |

For the authoritative, line-referenced behavior and the verification scripts,
read [`sutra-save-systems-audit.md`](../architecture/sutra-save-systems-audit.md).
