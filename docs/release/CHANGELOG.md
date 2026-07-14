# Changelog

All notable changes to this project are recorded here. Dates use `YYYY-MM`.

## 2026-07 - Onboarding redesign & simplified navigation

Onboarding now follows the student daily loop: capture schoolwork → see what is
due → know what to do next → take notes → schedule work → study → keep data safe.
The default navigation exposes only the core daily surfaces (Today, Homework,
Notes, Timeline, Review, Focus) and hides advanced packs behind progressive
disclosure in Settings. Existing users keep their saved preferences unchanged.

- **Redesigned onboarding steps** (`src/core/app.js`) — replaced the old
  `['welcome','focus','setup','ai','tour']` flow with
  `['welcome','classes','setup','mode','protect','finish']`. New steps: classes
  (collect class names), mode (choose student/academic/life), protect (visible
  backup setup). Removed: intro tour (deferred to empty states) and AI setup
  (deferred to Assistant first use). Existing users who completed onboarding
  never replay it and restart is idempotent.
- **Simplified default navigation** (`src/state/workspace-normalizers.js`) —
  `STUDENT_DEFAULT_ENABLED_VIEWS` narrowed from
  `['today','timeline','notes','homework','apstudy','review','cramhub']` to
  `['today','homework','notes','timeline','review','cramhub']`. AP Study,
  College, Life, Business, Courses, All Due, and Assistant are now opt-in from
  Settings → Feature packs. Existing preferences survive via
  `normalizeEnabledViews`.
- **Navigation tabs reordered** (`Sutra.html`) — primary tabs: Today, Homework,
  Notes, Timeline, Review & Tests, then secondary surfaces (College, Life,
  Business, Courses, All Due, Assistant, Settings).
- **Unit tests** (`tests/unit/workspace-normalizers.test.mjs`) — covers default
  views, advanced-surfaces exclusion, merge behavior, packs, and constants.
- **Assertion updates** (`scripts/smoke-check.mjs`) — guardrails updated for new
  ONBOARDING_STEPS and STUDENT_DEFAULT_ENABLED_VIEWS values.
- **Removed stale render-focus/ai/tour references** (`src/core/app.js`) — cleaned
  up three unreachable render-function calls (`renderFocusStep`, `renderAiStep`,
  `renderTourStep`) from the old retired-step code paths.
- **Updated tutorial status text** (`src/core/app.js`) — `syncOnboardingStatusUi`
  now reflects the new step names instead of the retired "Welcome, Focus, Setup,
  AI & Backups, and Tour" wording.
- **Documentation alignment** (`SUTRA_GUIDE.md`, `README.md`) — onboarding
  section steps match the redesigned flow.
- **Expanded E2E coverage** (`tests/e2e/onboarding-redesign.spec.mjs`) — 13
  tests: full class-entry flow, skip path, Continue later with reopen, keyboard
  Tab/Enter navigation, reduced motion, 200% zoom, and 320px mobile viewport.
- **Playwright config** (`playwright.config.mjs`) — onboarding test added to
  `responsiveTestMatch` so it runs across mobile and narrow-desktop projects.

## 2026-06 - Academic planning upgrade

One coherent semester-planning layer across five fronts. All new state lives in
`appData` (`schoolSchedule`, `gradePlanner`, `semesterSetup`) or existing stores
(homework `task.studio`, `sutraNotifications:v1`), so everything rides the
encrypted `.sutra` backup, JSON export, Drive sync, wipe→restore, and legacy
import paths unchanged. See [`ACADEMIC_PLANNING.md`](../features/ACADEMIC_PLANNING.md).

- **Semester Setup & Syllabus Importer** (`src/features/semester-setup.js`) —
  a wizard (Course Hub header, empty state, and Homework first-run) that parses
  pasted portal text, syllabi, `.csv`, and `.ics` files **locally**, proposes
  classes, teachers, grading weights, assignments, exams, recurring meetings,
  and no-school days, and only writes after per-item review and approval.
  Optional per-draft "Improve with AI" routes through the single intelligence
  core (`performIntelligenceRequest`) with the explicit send disclosure; local
  parsing never makes a network request. Applied items flow into Course Hub,
  Homework, Grade Planner, Timeline, and School Schedule, and are recorded in
  Assistant Activity.
- **Grade Forecasting & GPA Scenario Planner** (`src/features/grade-planner.js`)
  — the Course Hub Grades tab now tracks weighted categories, per-assignment
  scores, missing/pending/excused work, drop-lowest rules, target grades,
  final-score solving ("what do I need on the final?"), what-if projections,
  missing-work impact ranking, and weighted/unweighted GPA. The math engine is
  deterministic, local, and execution-tested (`npm run check:academic`); AI
  never computes grades. Summaries write through to the legacy course record.
- **Assignment Studio** (`src/features/assignment-studio.js`) — any Homework
  assignment expands into a Studio (task-menu "Expand into Studio" or the
  Course Hub assignment row): milestones, subtasks, rubric criteria, linked
  notes/canvases and course files, effort estimates, revision log, progress,
  Timeline scheduling of remaining work, and a one-click assistant handoff.
  The payload lives on the homework task itself (`task.studio`); milestones
  surface in All Due, Deadline Radar, and reminders via
  `collectWorkspaceDeadlines` (new `milestone` source) and a new
  `add_assignment_milestones` assistant action.
- **Rotating School Schedule** (`src/features/school-schedule.js`) — A/B days,
  N-day cycles, weekly timetables, bell schedules, term dates, holidays,
  special schedules/early dismissals, per-day class mappings, and read-only
  calendar subscriptions with a locally cached last-good import (URL refresh
  attempts fail gracefully under the strict CSP; file-based refresh always
  works, scoped per subscription). Today shows a school-day strip (current
  day label, current/next period); Shape My Day and auto-blocking treat class
  periods as busy via `getBusyWindowsForDateKey`; Sutra Intelligence gains a
  `schoolDay` signal.
- **Reliable reminders with honest fallbacks** (`src/features/notifications.js`)
  — new milestone + class-schedule reminder sources, missed-reminder replay on
  reopen ("While you were away"), snooze menu (1 h / 3 h / tomorrow 8 AM),
  optional daily digest, real OS notifications while Sutra is open (when
  permitted), reminder export to a device calendar (`.ics` with `VALARM`) for
  closed-browser alerts, and plain-language platform-limits copy in Settings.
- New validation: `npm run check:academic` executes the rotation, grade-math,
  extraction, and studio engines in Node (now part of `check:all`), plus
  `tests/e2e/academic-upgrade.spec.mjs` covering export round-trip, reload
  persistence, rotation, grade UI, the importer apply path, and Studio.

## 2026-06 - Public-beta hardening

### Persistence health

- Added a centralized Sutra persistence-health pipeline for core workspace saves, localStorage mirrors, IndexedDB writes, attachments, homework, Review data, notes, drawings, timeline, courses, revision history, settings, optional modules, imports, and backups.
- Save failures now classify quota, serialization, IndexedDB transaction, attachment, cache-warming, and partial-write/readback verification failures while preserving the current in-memory workspace.
- Added a non-dismissible save-failure banner with retry, emergency `.sutra` export, technical details, last-confirmed-save time, attachment warnings, and a Storage Health panel with size, attachment, warning, and backup-state summaries.
- `.sutra` emergency export now refuses to export when required attachment blobs are missing instead of producing a misleading incomplete backup.

### Security, network, and exports

- New `.sutra` exports are now password-encrypted `SUTRAENC` binary envelopes
  around the existing internal ZIP package. The envelope uses Web Crypto
  AES-GCM-256, PBKDF2-HMAC-SHA-256 with 600,000 iterations, a fresh salt/IV for
  manual exports, and authenticates the encoded header as AES-GCM additional
  data. Legacy unencrypted `.sutra`, `.atelier`, and supported JSON imports
  remain supported.
- Fixed iPhone/iPad Files picker selection for proprietary workspace files by
  removing restrictive `accept` filters from the hidden workspace and plugin
  file inputs and enforcing content/extension validation after selection.
- Added optional end-to-end encrypted Google Drive sync using Google Identity
  Services and Drive `appDataFolder` only (`drive.appdata` scope). Sutra uploads
  encrypted snapshots named `sutra-sync-current-v1.sutra`, keeps access tokens
  and derived keys in memory only, stores only device-local non-secret sync
  metadata, and enters an explicit conflict state instead of last-write-wins.
- Added strict static CSP metadata plus a local-dev/server CSP header that explicitly limits scripts, forms, images, frames, media, AI-provider connections, approved embeds, local AI endpoints, blob/data images, imports, exports, sandboxed plugins, and iframe/srcdoc behavior.
- Documented the hosting-header follow-up for `frame-ancestors 'none'`, which cannot be enforced by a static HTML meta tag.
- Vendored JSZip locally with MIT attribution and removed the old startup/fallback CDN dependency for core `.sutra` backups.
- Added approved-origin guards so remaining remote dependencies are user-triggered, disclosed, and fail gracefully offline.

### Accessibility and browser coverage

- Added a reusable Sutra modal accessibility primitive that layers dialog semantics, initial focus, Tab/Shift+Tab trapping, Escape behavior, focus restoration, scroll locking, background blocking, and mobile bottom-sheet behavior across existing modal surfaces.
- Added static and Playwright checks for CSP, persistence health, modal keyboard behavior, reduced-motion startup, offline startup, quota failure, IndexedDB failure, attachment failure, retry recovery, banner persistence, last-saved transitions, emergency export, and missing-attachment export refusal.
- Added Chromium, Firefox, and WebKit Playwright projects plus a physical-device QA checklist that must be completed on real hardware before claiming device-specific results.

### Rebrand completion

- Updated GitHub Pages, install/test instructions, Safe Mode, optional-network privacy disclosures, `.sutra` and legacy `.atelier` explanations, and stale hosting assumptions.
- Added a repository-generated `1200x630` Sutra social preview image and pointed Open Graph/Twitter metadata at it.

---

## 2026-06 - Sutra brand assets integration

Approved raster logos for Sutra and Sutra Assistant integrated across the full product surface; favicon fully replaced; stale copy cleaned up; new **Sutra** signature theme added.

### Sutra theme

- New **Sutra** preset theme (`[data-theme="sutra"]`) - a dark, signature brand theme matching the app icon and landing page: deep navy canvas (`#070c18`), Sutra blue accent (`#5d82f5`), and blue-tinted glass/surfaces/glow. Listed as the **3rd** option (after Default and Dark) in both **Settings > Appearance** and onboarding.
- Registered in the `themes` registry, the Settings preset grid, the onboarding theme picker, and the Help & Docs theme list.

### Assistant icon shape

- The Sutra Assistant launcher is now a **rounded-square** app-icon button (`border-radius: 24%`) instead of a circle, with the icon clipped at 18% (its native rim) so it fills the button as a true rounded square - the same opaque-black-corner clip applied to the launcher and panel-header icons so the assistant mark reads as itself everywhere.

### Startup loader fix

- Fixed a "weird outline" around the startup logo. Root cause: the approved master is a **fully opaque square** whose corners are solid black (`0,0,0`) outside a rounded-square rim (radius approximately 19% of the icon). On the dark overlay + navy radial glow, those black corners cast a faint square silhouette around the glowing rim. Fix: clip `.intro-logo-mark` with `border-radius: 18%` (just inside the measured rim) so the black corners are removed and the glow shows through clean rounded corners; also dropped the `image-rendering: crisp-edges` pixel-art hint (was hardening the downscale edge) and added a soft brand-blue drop-shadow that follows the rounded shape. The mark now reads as an intentional app icon on the launch screen.

### Brand assets

- **Approved master PNGs installed** at `assets/brand/sutra/sutra-app-icon-master.png` (main product icon) and `assets/brand/sutra/sutra-assistant-icon-master.png` (assistant icon only). These are the canonical source of truth - never regenerated as SVG.
- **11 main Sutra icon sizes** generated (16 -> 1024 px) plus a multi-resolution `favicon.ico` (16/32/48/64 px).
- **8 Sutra Assistant icon sizes** generated (32 -> 512 px including 44 px for the minimum touch-target launcher).
- **`scripts/generate-sutra-brand-assets.py`** added - rerunnable Python script (Pillow) that reads only the two masters and produces all derivatives with LANCZOS resampling, preserving rounded corners and glow.
- **`scripts/sutra-brand-assets-check.mjs`** added - 56-assertion CI guard verifying masters, derivatives, ICO, HTML references, stale-path removal, `data-sutra-component` hooks, and assistant icon placement.
- **`docs/BRAND_ASSETS.md`** created - comprehensive brand reference: master purpose, all derivatives, favicon/app-shell/loader/assistant/mobile usage, accessibility rules, reduced-motion rules, CSS hooks, regeneration instructions.

### Favicon & metadata

- **Broken `assets/sutra-favicon.svg` reference removed** from `index.html`, `HomePage.html`, and `Sutra.html` - the file was deleted and causing missing favicon in all browsers.
- **Stale `NoteFlow Atelier favicon-64.png` alternate icon removed** from `HomePage.html` and `Sutra.html`.
- **PNG favicons** (32 px, 16 px, ICO, apple-touch-icon 180 px) added to all three HTML entry points.
- `<meta name="application-name" content="Sutra">`, `<meta name="apple-mobile-web-app-title" content="Sutra">`, and `<meta name="theme-color" content="#07111f">` added to all entry points.

### App shell

- **Startup loader** (`#sutraStartupIntro`) updated to use `sutra-icon-256.png` (96 x 96 px CSS) with `data-sutra-component="startup-loader"` hook. Old deleted SVG path removed.
- **Sidebar brand mark** updated to use actual `sutra-icon-64.png` image in place of the letter-S placeholder, with `data-sutra-component="brand-mark"` hook.
- **Landing navbar** (`HomePage.html`) brand logo updated to `sutra-icon-64.png` with `aria-label="Sutra home"` and `data-sutra-component="brand-mark"`.

### Sutra Assistant

- **Launcher button** (`#chatbotBtn`) updated from `Mascot-320.png` to `sutra-assistant-icon-44.png`; `aria-label="Open Sutra Assistant"` and `data-sutra-component="assistant-launcher"` added.
- **Panel header** image updated from `Mascot-320.png` to `sutra-assistant-icon-64.png`; `data-sutra-component="assistant-header"` added to the panel root.
- Button `border-radius` updated to `28%` to complement the logo's own rounded-corner geometry.

### Stale copy

- Quick-action pill labels updated: *Plan my day* -> **Shape my day**, *Next best action* -> **Next step** (in `flow-assistant.js` `QUICK_ACTIONS_BY_VIEW` and `VIEW_FLOW_ROWS`, and context-aware dynamic row).
- Today view **Daily Thread** eyebrow (was "Daily brief") updated.
- Today view and Testing Hub **Next step** label (was "Next best action") updated.
- Welcome page on first launch renamed from "Welcome to NoteFlow" to "Welcome to Sutra" with updated body copy.
- `TUTORIAL.md` updated throughout: title, sections 3/7/16/21, all *Flow Assistant* -> *Sutra Assistant*, *Ask Flow* -> *Ask Sutra*, *Plan My Day* -> *Shape My Day*, *Daily Brief* -> *Daily Thread*, *Next Best Action* -> *Next Step*, *Workspace Modes* -> *Sutra Modes*.

### CSS hooks (CSS Mods Guide)

- **Brand marks & logo placements** section added to `docs/CSS_MODS_GUIDE.md` section 5 documenting `[data-sutra-component="brand-mark"]`, `startup-loader`, `assistant-launcher`, `assistant-header`, and `assistant-intelligence-badge` hooks for custom themes.

### Scripts

- `scripts/smoke-check.mjs` - favicon assertion updated from deleted SVG to new `sutra-icon-32.png` PNG path.

---

## 2026-06 - Rebrand to Sutra + document backgrounds

The app formerly released as **NoteFlow Atelier** is now **Sutra** - a private, local-first workspace for students. This release is a full rebrand plus a new per-document background feature, refreshed AI naming, and a redesigned landing page. **Existing data loads automatically and old backups still import.** See [Rebrand & Compatibility](../features/REBRAND_AND_COMPATIBILITY.md) for the full migration detail.

### Rebrand

- **Full rebrand** from NoteFlow Atelier to **Sutra** across the app shell, landing page, and documentation. Tagline: *Your academic life, woven into one private workspace.* (*Sutra* = Sanskrit for a thread.)
- **NoteFlow Classic** remains a separate legacy app and is unaffected by the rebrand.
- Internal storage identifiers (`noteflow_atelier_db`, `noteflow_attachments_db`, `hwCourses:v2`, `hwTasks:v2`) are **intentionally retained** as legacy-named compatibility identifiers so existing browser data keeps loading with no migration step.

### Backup & plugin formats

- **`.sutra`** is the default full-workspace backup format. Current exports are password-encrypted `SUTRAENC` binary envelopes containing the canonical internal workspace package (`manifest.json`, `workspace.json`, `assets/*`, `metadata/export-summary.json`, `metadata/checksums.json`). Export filename: `sutra_workspace_<YYYY-MM-DD>_<HH-mm-ss>.sutra` (local-timezone date and 24-hour time, zero-padded, colons replaced with hyphens for Windows safety; emergency exports use the `sutra_emergency_workspace_` prefix and Drive downloads use `sutra_drive_workspace_`).
- **Legacy unencrypted `.sutra` and `.atelier` backups still import.** The validator accepts both `sutra-workspace` and legacy `noteflow_atelier_project` manifests, and the dispatcher routes both `.sutra` and `.atelier` to the same package importer after envelope detection.
- **`.sutra-plugin`** is the new plugin export extension; legacy **`.atelier-plugin`** bundles still import. Plugins remain local-only, sandboxed, install disabled, and reviewed before they run.
- API keys, provider credentials, and tokens remain **session-only and never exported**.

### Sutra Assistant + Sutra Intelligence

- **Flow Assistant -> Sutra Assistant** (the contextual chat panel) and **Flow Intelligence -> Sutra Intelligence** (the local `deriveStudentContext` signal layer that reads only your workspace).
- New **Powered by Sutra Intelligence** badge under the panel header, subtitle *"Local signals from your workspace,"* with a stable `data-sutra-component="assistant-intelligence-badge"` hook and an explanatory tooltip/aria-label.
- Canonical window globals are now **`sutraAssistant`** / **`sutraIntelligence`**; legacy **`flowAssistant`** / **`flowIntelligence`** are retained.
- Activity-log key **`flow:activityLog:v1` -> `sutra:activityLog:v1`**, migrated automatically.
- Added a **Custom OpenAI-Compatible Endpoint** (Local endpoint) provider option alongside OpenAI, Anthropic Claude, Google Gemini, Groq, and OpenRouter.

### Per-document backgrounds (Notes)

- New **Document Background** feature: a per-page background image set from the Notes editor toolbar.
- Controls: Upload / Replace / Remove, preview thumbnail + filename, **Background Blur** slider (0-32 px, default 0), **Dim Background** slider (0-80%, default 25%), Reset to Default, and Done. Keyboard- and touch-accessible; controls stack under 520 px.
- Formats `.png` / `.jpg` / `.jpeg` / `.webp`; MIME + size validated; **max 6 MB**; images over 2048 px on the longest side auto-downscale (failing safe to the original). Corrupt / zero-byte / non-image files are rejected non-destructively with a toast.
- Stored as a data URL on `page.documentBackground` (same model as inline note images), so it rides existing persistence, `.sutra`/`.atelier` package export (via recursive inline-asset extraction -> packaged `assets/` file with checksum), and JSON export/import - no separate blob lifecycle.
- Renders on a dedicated layer behind the note surface; the dim overlay tints toward the editor surface color so text stays readable in light, dark, and custom themes, and blur applies only to the image. Works in the standard editor, Page Mode, split view, on mobile/tablet, and under custom CSS. Duplicating a page copies its background. **Locked pages never show their background behind the PIN screen.** Survives refresh, close/reopen, page duplication, and `.sutra` export -> wipe -> restore.

### Landing page

- New **thread scrollytelling** section after the hero: scattered workflow fragments (Notes, Assignments, Timeline, Tasks, Deadline Radar, Review, AP Study, Focus) are connected by a single continuous animated SVG thread that settles into the Sutra dashboard reveal.
- Respects `prefers-reduced-motion` (shows the final connected state, no pinned dead zones) and works with JavaScript disabled (final state visible). Mobile uses a simplified vertical thread.

### Naming map (applied this release)

| Old | New |
| --- | --- |
| Daily Brief | Daily Thread |
| Plan My Day | Shape My Day |
| Next Best Action | Next Step |
| Workspace Modes | Sutra Modes |
| Standard mode | All Tools |
| Business / Freelancer | Projects & Work |
| Flow Assistant | Sutra Assistant |
| Ask Flow | Ask Sutra |
| Flow Intelligence | Sutra Intelligence |
| Flow Activity Log | Assistant Activity |
| Context depth | Workspace Access |
| Stateless / Stateful | Single Request / Conversation Memory |
| Mods & Customization | Customization |
| Progress & Analytics | Momentum |
| Local Data Health | Storage Health |
| Last export / Last import | Last Backup / Last Restore |
| Student Setup | Sutra Setup |
| Rerun Student Setup | Restart Sutra Setup |
| Homework Paste Import | Import from School Portal |

Workspace Access levels are **Current Screen Only / Current Area / Full Workspace Context**.

### File renames

| Old | New |
| --- | --- |
| `NoteflowAtelier.html` | `Sutra.html` |
| `styles/atelier-pro.css` | `styles/sutra-pro.css` |
| `scripts/atelier-persistence-qa.js` | `scripts/sutra-persistence-qa.js` |
| `docs/atelier-save-systems-audit.md` | `docs/sutra-save-systems-audit.md` |

### Compatibility (still works)

- Legacy `.atelier` and `.atelier-plugin` imports.
- Legacy Safe Mode parameter `?atelierSafeMode=1` (canonical is now `?sutraSafeMode=1`).
- Legacy window globals `flowAssistant` / `flowIntelligence`.

### Tests / guards

- New Node guards: `scripts/sutra-docbg-check.mjs` (document-background data model + export), `scripts/sutra-rebrand-check.mjs` (rebrand naming/format guard), and `scripts/sutra-responsive-check.mjs` (responsive guard), alongside the existing `scripts/smoke-check.mjs`, `scripts/round-trip-check.mjs`, and `scripts/version-history-check.mjs`. A `node --check` syntax pass runs over each `src` JS file. Browser QA harness renamed to `scripts/sutra-persistence-qa.js`.

> **Upgrade note:** the rebrand is non-destructive and your data loads automatically, but export a backup before upgrading anyway. See [Rebrand & Compatibility -> Before you upgrade](../features/REBRAND_AND_COMPATIBILITY.md#before-you-upgrade).
