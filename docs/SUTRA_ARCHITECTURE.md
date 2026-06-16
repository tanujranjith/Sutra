# Sutra Architecture

_A high-level map of how Sutra is put together — the entry points, the core, the
feature modules, and how persistence, export/import, and customization wrap
around them. This is a map, not a deep dive; follow the linked docs for detail._

Sutra is a **static web app**: no backend, no build server required to run it. It
loads from static hosting or directly from a local file.

---

## 1. Entry points

- **`Sutra.html`** — the **app shell**. This is the workspace itself (renamed
  from `NoteflowAtelier.html`). It hosts the markup, pulls in the styles and
  scripts, and is where the whole application runs.
- **`HomePage.html`** — the **landing page**. The marketing / introduction
  surface, including the thread-story scrollytelling section.
- **`index.html`** — a thin **redirect** to `HomePage.html`.

> Note: **NoteFlow Classic** is a separate legacy app and is **not** Sutra.

---

## 2. Core

- **`src/core/app.js`** — the **core**, a single large script that runs in
  **global scope**. It owns the data model (`appData`), persistence and
  hydration, the export/import pipeline, the Notes editor (including Document
  Backgrounds, locked pages, Page Mode, split view), and the wiring for most
  views.

  Because `app.js` runs at global scope, top-level names share one namespace —
  worth keeping in mind when reading or extending it.

### Core safety layer (loaded before everything else)

The safety layer also includes **`src/core/migrations.js`**
(`window.SutraMigrations`), a pure versioned workspace migration registry.
Hydration applies each registered `vN -> vN+1` step before defaults and feature
normalizers. Migrations preserve unknown fields so old backups and plugin-owned
data are not silently truncated.

These small, dependency-free classic scripts load right after `safe-storage.js`
in `Sutra.html`, before any feature module or `app.js`, so their globals exist
at first render and can capture boot-time failures. They are also the first
incremental **extraction** of cross-cutting utilities out of `app.js`:

- **`src/core/safe-storage.js`** — `window.SutraSafeStorage`: defensive wrapper
  around `localStorage`/`sessionStorage` (quota/security/serialize handling,
  durable degraded banner). The approved channel for non-canonical storage.
- **`src/core/error-reporter.js`** — `window.reportError(error, context,
  severity)` plus global `error` / `unhandledrejection` nets and an exportable,
  in-memory diagnostics ring buffer (`window.SutraDiagnostics`). One funnel for
  "something went wrong" instead of bare `catch (e) {}`. Never blocks the user;
  toasts only when a `userMessage` is supplied.
- **`src/core/dom-safety.js`** — `window.SutraDOMSafety`: the central
  render/sanitize layer. `setText` (plain text), `setTrustedHTML` (audited,
  developer-only static markup), `sanitizeUserHTML` / `setUserHTML` (allowlist
  sanitizer for user/imported content), `isSafeUrl`, and `renderUserHTMLToFrame`
  (sandboxed-iframe isolation for canvas / htmlEmbed-style blocks). User-authored
  HTML is **never** injected raw — it is sanitized or sandboxed.
- **`src/core/feature-guard.js`** — `window.SutraFeatureGuard.run(name, fn)`:
  feature-level runtime isolation. A broken feature is reported and shown a small
  degraded badge; the rest of the app still boots. The `DOMContentLoaded` boot
  sequence in `app.js` runs each step through this guard.

New unsafe patterns (raw `innerHTML =`, direct `localStorage.setItem`,
unregistered `window.*`, un-inventoried workspace fields) are blocked in CI by
`scripts/sutra-guardrails-check.mjs` — see [section 9](#9-test-scripts).

---

## 3. Feature modules

Self-contained feature areas live in **`src/features/*.js`**:

- `flow-assistant.js` — **Sutra Assistant**, the contextual chat panel and its
  Suggested Actions / Apply-Decline change cards / Assistant Activity.
- `flow-intelligence.js` — **Sutra Intelligence**, the **local** signal layer
  (`deriveStudentContext`) that reads only your workspace; calls no server.
- `homework.js` — the Homework module (its own localStorage source of truth,
  mirrored into `appData`).
- `ap-study.js` — AP Study.
- `review.js` — Review / flashcards (spaced repetition).
- `business-workspace.js` — Projects & Work.
- `handwriting.js` — handwriting / drawing support.
- `customization.js` — the customization engine (themes, CSS overrides).
- `plugin-system.js` — the plugin loader and sandbox.
- `notifications.js` — the notification center (reminders, snooze, digest,
  missed-reminder replay, OS notifications, and `.ics` calendar handoff).
- `school-schedule.js` — the rotating **School Schedule** engine (A/B & cycle
  days, bell schedules, holidays, calendar subscriptions) + Today strip.
- `grade-planner.js` — deterministic **Grade Forecasting & GPA** engine inside
  the Course Hub Grades tab.
- `assignment-studio.js` — the **Assignment Studio** (milestones, subtasks,
  rubric, linked work) layered onto a Homework task.
- `semester-setup.js` — the **Semester Setup** syllabus/calendar importer.

See [`SUTRA_ASSISTANT.md`](./SUTRA_ASSISTANT.md) for the Assistant + Intelligence
split, and [`ACADEMIC_PLANNING.md`](./ACADEMIC_PLANNING.md) for the academic
planning layer (the last four modules above + reminders).

---

## 4. UI enhancers and styles

Large feature styles are being moved out of the app shell. Focus-session styles
now live in `styles/focus-session.css`, and the academic command center uses
`styles/academic-command-center.css`. `npm run check:shell` blocks new large
inline `<style>` blocks and ratchets the remaining explicitly marked legacy
blocks.

- **`src/ui/*.js`** — UI helper / enhancer modules layered on top of the core.
- **`styles/`** — the stylesheets:
  - `styles.css` — base styles.
  - `sutra-pro.css` — the "pro" layer (renamed from `atelier-pro.css`).
  - `mobile.css` — responsive / mobile.
  - `customization.css` — customization surfaces.
  - `microinteractions.css`, `macos26-redesign.css`, `settings-redesign.css` —
    interaction and visual-redesign layers.

---

## 5. The window bridge globals

Feature modules expose canonical globals on `window` so the core and other
modules (and plugins) can reach them. The **legacy aliases point at the same
objects**, so code written against the old names keeps working:

| Canonical | Legacy alias | What it is |
|---|---|---|
| `window.sutraAssistant` | `window.flowAssistant` | Sutra Assistant API |
| `window.sutraIntelligence` | `window.flowIntelligence` | Local signal layer (`deriveStudentContext`) |
| `window.getSutraAssistantContext` | `window.getFlowAssistantContext` | Current assistant context |

The persistence/export/import layer also publishes canonical wrappers on
`window` (for serialize/deserialize, save/load locally, export `.sutra`/JSON,
import, and round-trip verification).

---

## 6. Customization engine + plugin sandbox

- The **customization engine** (`customization.js`) drives themes, density,
  motion, text size, and **CSS Overrides**.
- **Plugins** (`plugin-system.js`) are **local bundles only** — there is no
  marketplace. They run **sandboxed in an iframe** with an explicit permission
  allowlist, install **disabled**, and are **reviewed before they run** (review
  is forced on import). Export extension **`.sutra-plugin`**; legacy
  **`.atelier-plugin`** still imports.
- **Safe Mode** (`?sutraSafeMode=1`, legacy `?atelierSafeMode=1`, or hold
  **Shift** on load) **skips custom CSS and plugins** and **never deletes** data,
  CSS, plugins, or workspace — the safe way to recover from a bad customization.

---

## 7. How persistence, export, and import wrap together

At a glance (full detail in [`DATA_AND_BACKUPS.md`](./DATA_AND_BACKUPS.md)):

- **One workspace object** (`appData`) is the in-memory truth; it persists to
  **IndexedDB** (`noteflow_atelier_db`). Course-file binaries persist separately
  to `noteflow_attachments_db`; homework mirrors to localStorage.
- **One hydrate path** merges stored data over defaults and normalizes it on
  load; **one debounced save path** (with a lifecycle flush) writes it back.
- **One persistence-health pipeline** wraps core saves, localStorage mirrors,
  IndexedDB transactions, attachment cache warming, imports, backups, and
  emergency exports. It records the last confirmed save, classifies quota /
  serialization / transaction / attachment / partial-write failures, preserves
  unsaved in-memory state, and drives the non-dismissible save-failure banner
  plus the Settings -> Data -> Storage Health panel.
- **One serializer/deserializer pair** drives every full-workspace transport:
  manual **`.sutra`**, optional Google Drive sync snapshots, legacy package
  import, and **JSON**. New `.sutra` exports wrap the existing internal ZIP
  (`manifest.json` / `workspace.json` / `assets/` / `metadata/` with checksums)
  in a password-encrypted `SUTRAENC` envelope. JSON remains unencrypted and is an
  advanced/recovery format. JSZip is vendored locally under
  `assets/vendor/jszip/` for core package creation/import.
- **Inline assets** — note images and **Document Backgrounds** — are extracted to
  `assets/` on `.sutra` export and rehydrated on import; **secrets are stripped**
  from every export.
- **Legacy unencrypted `.sutra` and `.atelier`** backups import through the same
  package importer.
- **Optional Google Drive sync** lives in `src/core/app.js` as an explicit sync
  controller. It requests only `https://www.googleapis.com/auth/drive.appdata`,
  stores `sutra-sync-current-v1.sutra` in Drive `appDataFolder`, keeps OAuth
  access tokens and derived keys in memory only, persists only non-secret
  device-local metadata at `sutra:googleDriveSync:v1`, and uses the same
  encrypted envelope with `purpose: "google-drive-sync"`.

Storage names like `noteflow_atelier_db` are **legacy-named compatibility
identifiers**, kept so existing installs keep working.

For the broader privacy stance, see
[`PRIVACY_AND_LOCAL_FIRST.md`](./PRIVACY_AND_LOCAL_FIRST.md).

---

## 8. Security and network policy

- `index.html`, `HomePage.html`, and `Sutra.html` ship CSP meta tags with
  explicit `script-src`, `connect-src`, `frame-src`, `form-action`, `img-src`,
  `media-src`, `worker-src`, and `object-src 'none'` coverage.
- The local static server used by Playwright adds the same CSP plus
  `frame-ancestors 'none'`. Production static hosts must set that directive as
  an HTTP response header because browsers ignore it in CSP meta tags.
- Fresh startup, manual encrypted `.sutra` backup, and JSON backup should make
  zero third-party requests. Remaining remote paths are user-triggered and
  limited to optional Google Drive OAuth/sync, configured AI providers,
  localhost/127.0.0.1 local endpoints, approved feedback/media embeds, AP
  Classroom/resource/help links, ChatGPT/Spotify shortcuts, and disclosed
  optional secondary import/export helpers.
- Custom CSS and local plugins remain local-first. Plugins run in sandboxed
  iframes with an explicit allowlist and are re-reviewed after import.

---

## 9. Test scripts

- `npm run check:shell` - blocks new large inline styles in `Sutra.html`.
- `npm run check:migrations` - executes old-workspace migration fixtures,
  idempotence, and unknown-field preservation.
- `npm run check:syntax` - checks first-party `src/`, `scripts/`, tests, and
  Playwright configs while excluding `.deploy`, build, coverage, vendor, and
  generated documentation output.

Run with Node from the project root:

- `npm run check:csp` - static CSP and hosting-header guard.
- `npm run check:persistence` - centralized persistence-health guard.
- `npm run check:modal` - modal accessibility primitive guard.
- `npm run check:network` - approved-origin and startup-network guard.
- `npm run check:guardrails` - architecture guardrails: fails CI when a change
  adds a new raw `innerHTML =` / `insertAdjacentHTML` / `document.write`, a new
  direct `localStorage.setItem` / `sessionStorage.setItem`, an unregistered
  `window.*` global, or a top-level workspace field missing from
  `docs/persistence-inventory.json`. Baseline lives in
  `scripts/guardrail-baseline.json`; reviewed exceptions use an inline
  `// sutra-allow-html:` / `// sutra-allow-storage:` marker, or
  `npm run check:guardrails:update` to deliberately re-baseline.
  `npm run check:guardrails:selftest` proves the detectors fire on hostile
  fixtures (`scripts/sutra-guardrails.selftest.mjs`).
- `npm run test:e2e` - Chromium, Firefox, and WebKit Playwright matrix for
  persistence, CSP, modal keyboard, reduced-motion, offline-startup,
  encrypted backup/export and mocked Drive sync regressions, the central
  DOM-safety sanitizer against hostile payloads (`dom-safety.spec.mjs`), and
  feature-isolation / error-reporting (`error-isolation.spec.mjs`).

- `node scripts/smoke-check.mjs` — core invariants.
- `node scripts/round-trip-check.mjs` — save/export/import field parity, secret
  redaction, the localStorage allow-list, and the cache-warming guards.
- `node scripts/version-history-check.mjs` — version-history invariants.
- `node scripts/sutra-docbg-check.mjs` — Document Background checks.
- `node scripts/sutra-rebrand-check.mjs` — rebrand guard.
- `node scripts/sutra-responsive-check.mjs` — responsive guard.
- `node --check <file>` — syntax-check each `src` JS file.

Browser QA harness: `scripts/sutra-persistence-qa.js` — paste into the console on
`Sutra.html` and run the round-trip (non-destructive, or full wipe→import). See
[`sutra-save-systems-audit.md`](./sutra-save-systems-audit.md).

---

## 10. Where to go next

| Topic | Doc |
|---|---|
| Assistant + local Intelligence | [`SUTRA_ASSISTANT.md`](./SUTRA_ASSISTANT.md) |
| Document Backgrounds | [`DOCUMENT_BACKGROUNDS.md`](./DOCUMENT_BACKGROUNDS.md) |
| Privacy / local-first | [`PRIVACY_AND_LOCAL_FIRST.md`](./PRIVACY_AND_LOCAL_FIRST.md) |
| Data + backups | [`DATA_AND_BACKUPS.md`](./DATA_AND_BACKUPS.md) |
| Verified persistence audit | [`sutra-save-systems-audit.md`](./sutra-save-systems-audit.md) |
