# Sutra Agent Source of Truth

> This file is the required starting point for every coding agent, reviewer, and human contributor working on Sutra. Read it before changing code. Use it to understand the product, architecture, completed foundation, current objective, and non-negotiable constraints.
>
> **Last verified:** 2026-07-12  
> **Branch:** `main`  
> **Verified against commit:** `1388272d95f1fea039d0c6f0fa67ece49fd55cb9`

## How to use this file

1. Read this file before planning or editing.
2. Read the linked architecture and feature documentation for the area being changed.
3. Inspect the current implementation and tests. Do not rely only on documentation.
4. Preserve the product principles and compatibility rules below.
5. Update this file only when product direction, architectural boundaries, or major invariants change. Do not turn it into a per-task activity log.
6. Do not push, merge, deploy, publish, or change remote infrastructure unless the task explicitly authorizes that action.

## Source-of-truth order

Different sources are authoritative for different questions:

1. **Product direction and non-negotiable principles:** this `AGENTS.md`.
2. **Architecture, load order, path coupling, and extraction constraints:** [`docs/architecture/SUTRA_ARCHITECTURE.md`](docs/architecture/SUTRA_ARCHITECTURE.md).
3. **Persistent workspace fields and export parity:** [`docs/architecture/persistence-inventory.json`](docs/architecture/persistence-inventory.json), migrations, serializers, and round-trip tests.
4. **Actual runtime behavior:** current code and executable tests.
5. **Feature-specific behavior:** current documents under [`docs/features/`](docs/features/) and the relevant source files.
6. **Historical context:** [`docs/release/CHANGELOG.md`](docs/release/CHANGELOG.md) and [`docs/archive/`](docs/archive/). Archived documents are historical and may contain stale paths or assumptions.

If two sources conflict, do not silently choose one. Inspect the implementation, determine the intended behavior, fix the inconsistency, and update the stale source.

---

# 1. What Sutra is building and why

## Product definition

Sutra is a private, local-first student command center. It combines schoolwork capture, deadlines, planning, notes, review, focus, academic tools, and backups in one workspace that can run as a static web app without a required account, backend, build server, or telemetry.

The product should help a normal high-school or college student complete one clear daily loop:

**Capture schoolwork -> see what is due -> know what to do next -> take notes -> schedule work -> study and review -> keep the workspace safely backed up.**

A student opening Sutra should be able to answer these questions quickly:

1. What is due?
2. What should I work on first?
3. Where are my notes?
4. How do I study or review this?
5. Am I forgetting anything?
6. Is my work saved and backed up?

## Why Sutra exists

Students usually split their academic life across a learning-management system, notes app, calendar, reminders, flashcards, grade calculator, focus timer, and cloud storage. Those tools often duplicate data, hide relationships between tasks, or require a hosted account. Sutra aims to make those separate threads behave like one coherent workspace while preserving user ownership of the data.

## Product principles

### Local-first and private by default

- Core use must not require a Sutra account or Sutra-operated backend.
- Workspace data stays on the user's device by default.
- Fresh startup and ordinary local use should not make third-party requests.
- Optional network features must be explicit, disclosed, user-triggered, and failure-tolerant.
- Secrets, API keys, OAuth tokens, passphrases, and provider credentials must never enter workspace exports.

### Calm default, depth on demand

- The default experience should expose the small set of surfaces most students use every day.
- Advanced academic, assistant, college, life, work, cloud-provider, plugin, and customization systems should remain available through progressive disclosure, packs, settings, or deliberate entry points.
- Do not remove mature advanced capabilities merely to simplify navigation.
- Avoid adding another top-level surface when an existing surface, modal, tab, widget, or command can contain the capability cleanly.

### One connected workspace

- Data should flow between capture, Homework, Today, All Due, Timeline, Notes, Assignment Studio, Review, AP Study, Course Hub, reminders, and the Assistant where appropriate.
- Reuse canonical data and ranking engines. Do not create competing sources of truth for the same concept.
- A feature is stronger when it creates useful connections, not when it merely adds another isolated dashboard.

### Deterministic core before AI

- Deadlines, grade calculations, scheduling logic, migrations, persistence, backup integrity, and other correctness-sensitive behavior must be deterministic and testable.
- Sutra Intelligence may summarize, explain, suggest, or prepare actions, but it must not silently replace deterministic calculations.
- AI actions must be reviewable, consent-based, and reversible where practical.
- No-API-key paths should remain useful through local product knowledge, deterministic intelligence, and guided choices.

### Data safety over convenience

- Never trade backup integrity, migration safety, or legacy compatibility for a cleaner implementation.
- Never produce a backup that appears complete when required data or attachments are missing.
- Unknown fields must survive migrations and normalization unless a documented migration intentionally changes them.
- Destructive operations must be explicit and recoverable when practical.

### Accessible, responsive, and understandable

- Primary workflows must work with keyboard, touch, narrow mobile viewports, zoom, reduced motion, and assistive technology.
- Interface text should use literal student language such as Today, Notes, Homework, Timeline, Review, and Focus.
- Prefer a visible next action over a dense wall of metrics.

---

# 2. Structure and architecture

## Runtime model

Sutra is a static, no-build browser application. The runtime is made of classic scripts and styles loaded directly by `Sutra.html`.

- **No framework runtime is required.**
- **No bundler or ES-module graph is required for the main application.**
- **No backend is required for core use.**
- **Script load order is part of the architecture.**
- Many scripts share global scope and communicate through registered `window` APIs.

Do not begin a framework rewrite, module-system conversion, TypeScript migration, or backend migration unless a task explicitly authorizes a separately planned architectural project with compatibility and deployment analysis.

## Entry points

- `index.html`: redirect to the landing page.
- `HomePage.html`: public landing and product-introduction surface.
- `Sutra.html`: application shell, markup, script order, style order, and runtime entry point.
- `manifest.webmanifest` and `sw.js`: installability and offline behavior.

`noteflow-classic/` is a separate legacy application. It is not the current Sutra runtime and must not be treated as a place to implement new Sutra features.

## Repository map

- `src/boot/`: startup intro and service-worker registration.
- `src/core/`: the main runtime and safety layer.
  - `app.js`: large global runtime containing `appData`, hydration, persistence, export/import, Notes, Timeline, many views, cloud controllers, and controllers that still depend on in-closure helpers.
  - `safe-storage.js`: approved defensive storage wrapper.
  - `error-reporter.js`: centralized diagnostics and runtime error funnel.
  - `dom-safety.js`: text, trusted markup, sanitization, URL checks, and sandboxed user HTML.
  - `feature-guard.js`: feature-level failure isolation.
  - `startup-health.js`: catastrophic startup detection and recovery actions.
  - `migrations.js`: versioned workspace migration registry.
- `src/state/`: pure defaults and workspace normalizers extracted from `app.js`.
- `src/config/`: runtime configuration and generated asset manifests.
- `src/features/assistant/`: Assistant, local Intelligence, model capabilities, and related integrations.
- `src/features/academic/`: school schedule, grades, planning, Assignment Studio, Semester Setup, and command-center engines.
- `src/features/study/`: Homework, AP Study, and Review.
- `src/features/customization/`: themes, CSS overrides, and sandboxed plugins.
- `src/features/workspace/`: notifications, business/work views, handwriting, starter-pack data, and other workspace services.
- `src/ui/`: reusable input and interface enhancers.
- `styles/`: styles grouped by responsibility, but actual cascade order is the order of `<link>` elements in `Sutra.html`.
- `scripts/`: static checks, validation, deployment tooling, asset generation, and local server utilities.
- `tests/`: unit, Playwright end-to-end, fixtures, and benchmarks.
- `docs/`: architecture, feature, privacy, security, cloud, testing, release, and historical documentation.
- `assets/`: brand files, screenshots, vendored runtime dependencies, and generated assets.

Read [`src/README.md`](src/README.md), [`src/features/README.md`](src/features/README.md), and [`styles/README.md`](styles/README.md) before moving files or changing load order.

## Shared global scope and load order

Classic scripts share a global namespace. A new top-level name can collide with another script even when the files are in different folders.

Rules:

- Check for existing names before adding a top-level function, variable, or constant.
- Register intentional `window.*` APIs through the established guardrail inventory.
- Preserve canonical and legacy aliases that point to the same object, including Sutra/Flow-era bridge names.
- A script defining a global required by another script's top-level code must load first.
- Moving or renaming a source file may require changes to `Sutra.html`, guardrail scan lists, static assertions, generated manifests, tests, and documentation.

## State and persistence

- `appData` is the primary in-memory workspace object.
- Canonical workspace persistence uses IndexedDB.
- Course-file binaries use a separate attachment database.
- Homework retains its established localStorage source and mirrors into `appData` for connected-workspace behavior.
- Non-canonical storage must use `SutraSafeStorage` rather than direct browser-storage writes.
- Storage identifiers such as `noteflow_atelier_db`, `noteflow_attachments_db`, `hwCourses:v2`, and `hwTasks:v2` are frozen compatibility identifiers. Their old names are intentional.
- Migrations must be versioned, idempotent, and preserve unknown fields.
- New persistent fields must be normalized, serialized, imported, exported, migrated if necessary, inventoried, and tested as one change.

## Backup and restore

The `.sutra` file is the canonical portable full-workspace backup.

- Current `.sutra` exports use a password-encrypted `SUTRAENC` envelope around the internal workspace package.
- Legacy plaintext `.sutra` and `.atelier` backups remain importable.
- JSON is an advanced or recovery format and is not encrypted.
- Required note assets, document backgrounds, and attachments must round-trip correctly.
- Secrets and provider credentials must be stripped from every export path.
- Restore conflicts must be shown rather than silently using last-write-wins behavior.
- Backup providers receive ciphertext only.

For provider status and adapter rules, use [`docs/SUTRA_CLOUD_PROVIDERS.md`](docs/SUTRA_CLOUD_PROVIDERS.md). For data semantics, use [`docs/privacy-security/DATA_AND_BACKUPS.md`](docs/privacy-security/DATA_AND_BACKUPS.md).

## Safety layer and prohibited shortcuts

Do not introduce:

- raw user-controlled `innerHTML` injection;
- direct `localStorage.setItem` or equivalent non-canonical storage writes;
- unregistered `window.*` globals;
- silent catch blocks that hide consequential failures;
- user-data fields absent from the persistence inventory and transport path;
- remote scripts for core backup, persistence, or startup behavior;
- a network request during ordinary fresh startup;
- hidden destructive migrations or restore behavior.

Use `SutraDOMSafety`, `SutraSafeStorage`, `reportError`, feature guards, migrations, and the existing persistence-health pipeline.

## Styling

- The stylesheet folder does not determine precedence. `Sutra.html` link order determines the cascade.
- Reuse design tokens and existing component patterns before adding new hard-coded values.
- Keep responsive rules in the established responsive layer unless a feature requires tightly scoped local behavior.
- Do not reintroduce large inline style blocks into `Sutra.html`.
- Preserve readable contrast across Default, Dark, Sutra, and custom themes.
- Custom CSS and plugins must remain recoverable through Safe Mode.

## Deployment model

Production is built from an allowlisted deploy artifact. The tested artifact should be the artifact that is deployed. Do not assume every repository file ships to production. `docs/`, tests, local scripts, secrets, editor metadata, and unrelated files must not leak into the deploy artifact.

---

# 3. What has been built so far and why

This section is a high-level foundation map, not an exhaustive feature list.

## Core student workspace

Sutra already includes Notes, Homework, Today, All Due, Timeline, Review, AP Study, Testing Hub, Course Hub, Focus, college planning, life tracking, project/work tools, settings, customization, backups, and onboarding. The purpose of the next phase is not to prove that Sutra can contain more features. It is to make the existing system feel coherent and obvious to ordinary students.

## Rebrand and compatibility

The product was rebranded from NoteFlow Atelier to Sutra. User-facing names, entry points, brand assets, and documentation were updated while old storage identifiers, aliases, backup formats, and compatibility paths were retained. This allows existing users to upgrade without losing data.

## Repository reorganization

Source, styles, tests, scripts, and documentation were reorganized by responsibility. This improved navigation without changing the classic-script runtime model. Path-coupled checks and documentation now guard future moves.

## Public-beta hardening

The repository has substantial safety infrastructure:

- centralized persistence-health reporting;
- last-confirmed-save tracking;
- emergency export and missing-attachment refusal;
- strict CSP and approved-network checks;
- DOM-safety and storage guardrails;
- modal accessibility primitives;
- startup-health recovery;
- cross-browser Playwright coverage;
- allowlisted deployment artifacts and post-deploy smoke checks.

These systems exist because a local-first app must make data loss visible and recoverable rather than silently failing.

## Encrypted backup and Sutra Cloud

Sutra supports encrypted `.sutra` backups and a provider-based cloud layer. Manual encrypted files remain the simplest universal option. Google Drive, OneDrive, Dropbox, Supabase, WebDAV, Custom HTTP, and preview/self-hosted provider paths are documented according to implementation and configuration status. Provider adapters receive ciphertext only and must not handle plaintext workspace data.

## Connected academic planning

The academic foundation includes:

- Semester Setup and local syllabus/portal import;
- rotating school schedules;
- deterministic grade and GPA forecasting;
- Assignment Studio milestones, rubrics, subtasks, linked work, effort, and revisions;
- a deterministic planning engine;
- deadline collection and ranking across workspace surfaces;
- reminders, snooze, digest, calendar handoff, and missed-reminder replay;
- AP Study, Testing Hub, review-card generation, and mistake-based study paths.

These systems were built to turn isolated assignments and dates into a connected plan.

## Today and Custom Tabs

Today has evolved into a command-center surface with Next Up/Next Step, schedule context, deadline counts, an upcoming radar, and a plan for the day. Custom Tabs allow user-composed dashboards with imported data widgets and self-contained interactive widgets. These capabilities should support personalization without making the default navigation more complicated.

## Sutra Assistant and Sutra Intelligence

The Assistant includes provider-backed chat, contextual actions, approval cards, retries, activity history, citations/deep links, voice input/read-aloud, local product knowledge, model capability routing, and consent-based local memory. Sutra Intelligence also provides deterministic local context and no-key guidance.

The governing rule remains: the Assistant proposes and explains; users approve consequential changes.

## Notes evolution

The established Notes system supports hierarchical pages, rich editing, page mode, split view, version history, locked pages, document backgrounds, handwriting, templates, and linked content. A newer vendored Notes Editor v2 exists behind an `editor.editorV2Enabled` feature flag. Treat flagged editor work as an incremental migration path, not permission to break the stable editor or stored note content.

## Verification and release system

The project has static checks for syntax, app-shell integrity, migrations, round-trip parity, versions, compatibility, CSP, production headers, workflows, persistence, accessibility, network policy, encoding, responsive behavior, assets, document backgrounds, academic engines, Intelligence, service workers, startup health, DOM integrity, links, and guardrails. It also has unit tests, Playwright coverage, deploy-artifact checks, live smoke checks, and benchmarks.

A change is not complete merely because the edited screen appears to work.

---

# 4. Current goal

## Primary objective

Make Sutra feel like a simple, powerful student command center rather than a very large application with every advanced surface exposed at once.

The default experience should revolve around:

- **Today** as the command center;
- **Capture** as the universal intake path;
- **Homework** as the canonical schoolwork list;
- **Notes** as the canonical knowledge and writing surface;
- **Timeline** as the canonical schedule;
- **Review** as the canonical active-recall surface;
- **Focus** as the execution surface;
- **Data and Backup** as a visible trust and safety surface.

Advanced systems should remain available through deliberate entry points such as Academic, Assistant, College, Life, Work, and Customization packs or settings.

## What the default student experience should do

### Today

Today should answer, in order:

1. What needs attention now?
2. What is the single best next step?
3. What is due soon or at risk?
4. What is already scheduled today?
5. What can be scheduled, opened, reviewed, or completed directly?
6. Is the workspace saved and protected?

Avoid filling the first viewport with low-priority analytics, decorative cards, or duplicate summaries.

### Capture

A student should be able to quickly capture an assignment, test, note, reminder, study session, or time block without first deciding which subsystem owns it. The capture flow should classify the item, preview the destination, allow correction, and then create canonical data used throughout the workspace.

### Navigation and progressive disclosure

- Keep the default navigation small and literal.
- Preserve advanced features behind packs, settings, sub-tabs, modals, command-palette actions, or contextual links.
- Do not hide essential daily features so deeply that normal students cannot discover them.
- Do not use progressive disclosure as an excuse to duplicate a feature in multiple places.

### Connected actions

Every major deadline should support useful next actions such as Open, Schedule, Start Focus, Create Plan, Add Review Cards, or Mark Complete when appropriate. Reuse existing action infrastructure and canonical IDs rather than creating unlinked copies.

### Trust

Students should understand whether their latest work saved, when the last confirmed save occurred, how to export a backup, and whether cloud backup is configured. Data safety should be visible without turning every screen into a warning panel.

## Current priority order

1. Simplify onboarding, modes/packs, navigation, and default information hierarchy.
2. Make Today, Capture, Homework, Notes, Timeline, Review, and Focus operate as one daily loop.
3. Reduce duplicate concepts and competing summaries while preserving advanced capability.
4. Improve backup confidence, restore clarity, and export completeness.
5. Polish mobile, keyboard, accessibility, performance, and empty states.
6. Continue decomposing risky portions of `app.js` only through small, tested seams.
7. Add new features only when they materially strengthen the daily loop or resolve a demonstrated student need.

## Explicit non-goals

Unless a task specifically changes the project direction, do not:

- replace Sutra with a hosted SaaS architecture;
- require accounts for core use;
- remove mature advanced features solely to make the app appear smaller;
- perform a broad framework rewrite;
- rename legacy storage identifiers;
- discard unknown workspace fields;
- weaken encryption, CSP, Safe Mode, backup checks, or approval flows;
- make AI mandatory for planning, grades, reminders, or data access;
- add telemetry or advertising;
- fabricate physical-device testing results.

---

# Agent implementation protocol

## Before editing

1. Read this file.
2. Inspect the relevant code, markup, styles, tests, and current docs.
3. Search for existing helpers, data models, actions, components, and terminology.
4. Identify persistence, migration, export/import, CSP, accessibility, and responsive implications.
5. Check recent commits when working in an area that has changed recently.
6. Define a bounded implementation plan and the validation required.

Do not implement from a prompt alone without first reconciling it with the repository.

## While editing

- Prefer the smallest coherent change that solves the underlying problem.
- Reuse canonical data and UI patterns.
- Preserve file and storage compatibility.
- Keep deterministic logic pure where possible so it can run in Node tests.
- Treat errors explicitly and route them through established diagnostics.
- Keep optional-network behavior user-triggered and offline-safe.
- Update migrations and persistence inventory with schema changes.
- Update feature docs and Help & Docs when user-facing behavior changes.
- Add or update automated tests for regressions and critical paths.
- Avoid drive-by rewrites unrelated to the task unless a nearby defect blocks correctness or safety.
- Do not edit generated files manually. Run the generator that owns them.

## Required validation

Choose targeted checks during development, then run the broadest practical gate before completion.

Baseline commands:

```bash
npm ci
npm run check:all
npm run test:unit
npm run build:deploy
npm run check:deploy
```

For browser-visible or workflow changes, run relevant Playwright tests. For release-level or wide architectural work, use:

```bash
npm run verify
```

When appropriate, also verify:

- direct `file://` startup and served startup;
- no new console errors;
- save, reload, export, wipe, import, and restore;
- legacy backup compatibility;
- offline or failed-network behavior;
- keyboard and screen-reader semantics;
- 200 percent zoom and reduced motion;
- narrow mobile and tablet layouts;
- Safe Mode with custom CSS and plugins disabled;
- no secrets or plaintext workspace content in encrypted provider uploads;
- the exact allowlisted deploy artifact rather than only the repository root.

Do not claim a test passed unless it was actually run. Do not claim physical-device coverage unless it was performed on that device.

## Definition of done

A task is complete only when:

- the intended workflow works end to end;
- existing data and legacy imports remain safe;
- new persistent data survives reload and full backup round-trip;
- failure states are visible and non-destructive;
- responsive and accessible behavior is acceptable;
- relevant tests and checks pass;
- docs match the implementation;
- no secrets, private configuration, debug artifacts, or unrelated files are added;
- the final report states what changed, why, files affected, tests run, remaining limitations, and any follow-up work.

---

# Known architectural landmines

1. **`src/core/app.js` is large and closure-coupled.** Some controllers remain there because they need private helpers. Extract only after tracing dependencies and adding tests.
2. **Global names can collide.** Folder boundaries do not create module boundaries.
3. **Style order is semantic.** Moving a stylesheet can change the interface even when selectors are untouched.
4. **Paths are checked.** Renaming files can break app-shell, guardrail, manifest, academic-engine, smoke, link, and deployment checks.
5. **Legacy names protect user data.** Old database, localStorage, alias, and backup-format names are not unfinished rebranding.
6. **Workspace schema changes are cross-cutting.** Defaults, normalizers, migrations, persistence, export, import, snapshots, cloud, wipe, tests, and inventory may all require updates.
7. **Homework has historical storage behavior.** Do not create another assignment store or remove mirroring without a dedicated migration plan.
8. **CSP limits optional providers.** A transport being implemented does not mean every hosted build can reach an arbitrary origin.
9. **The service worker and generated asset manifest must match shipped files.** Use the existing generators and checks.
10. **Flagged systems are migration seams.** Notes Editor v2 and preview cloud providers must not silently replace stable paths before compatibility is proven.
11. **Archive documents are not current instructions.** Use them for history, not path or implementation truth.
12. **The app can appear functional while losing data.** Persistence and export round-trip testing is mandatory for stateful changes.

---

# Required handoff format for agents

At the end of a task, report:

1. **Outcome:** what changed in user terms.
2. **Reasoning:** why this approach fits Sutra's current goal and architecture.
3. **Files changed:** exact paths and their role.
4. **Data impact:** schema, migration, storage, export/import, or compatibility effects.
5. **Validation:** exact commands and manual checks actually completed.
6. **Limitations:** known gaps, untested environments, or deferred work.
7. **Source-of-truth updates:** whether this file or another canonical document needed revision.

Keep the report factual. Separate completed work from recommendations.