# Sutra overnight research and implementation plan

Prepared September 30, 2026. Task numbers refer to the reorganized list agreed in the chat.

**Branch:** `codex/overnight-improvements`

**Current status:** Research completed and recorded in [overnight findings](OVERNIGHT_RESEARCH.md). Implementation is starting in the isolated candidate; every product task remains subject to its three reviews and the user's later local verification.

**Candidate directory:** `D:\Desktop\Engineering\Coding\Active projects\Sutra\.tmp\overnight-clean-main\.tmp\worktrees\overnight-improvements`. The original checkout is `codex/overnight-plan`; the desired implementation branch lives in the prescribed core candidate. Both the existing dirty main worktree and the user's original changes are preserved.

**Handoff:** Leave the candidate on its branch for the user's local review. Do not merge to `main`, push, deploy, or publish.

**Confirmed scope:** The ten numbered tasks below, plus substantive polish and usability upgrades for Create types other than Notes. The user's timeline clarification applies to #13: insert an editable custom timeline into Notes and other content-bearing Create surfaces, excluding Sheets. Sheets remains included in the separate Create-polish workstream.

## Working agreement

- Research all ten tasks and the expanded Create workstream before changing product code. Inspect current behavior, relevant source, existing tests without executing them, feature documentation, and recent history. Use authoritative external sources for behavior and browser/platform constraints that need research.
- Preserve existing user changes and untracked files. Stage and commit only task-owned files or explicitly reviewed hunks; do not bundle unrelated work.
- Delegate bounded tasks to **Luna xhigh** (`gpt-6-luna`, reasoning effort `xhigh`). Give each assignment a clear contract and file ownership. Use at most one Luna worker at a time to limit resource use; the primary agent owns integration and commits.
- The primary agent personally reviews every coherent change three times, including subagent changes. Record each pass and any corrections; repeat affected reviews after substantive corrections.
- Commit locally after coherent, reviewed changes and permitted validation. Keep commits small enough to inspect and revert, without leaving a checkpoint knowingly broken.
- Do not run local unit/E2E suites, automated browser tests, self-tests, benchmark suites, or aggregate commands that invoke them. Do not install dependencies or run resource-heavy builds by default.
- Lightweight manual browser inspection and low-cost static checks are permitted. Keep browser inspection sequential, with one active preview rather than multiple browser workers.
- Preserve required integrity gates and Git hooks. Do not disable or falsify them. `npm run check:runtime` includes self-tests, so defer that aggregate command under the no-local-tests constraint. The direct static core-integrity check and staged-runtime hook can be used within the permitted static-check scope. Unperformed required checks remain pending; there is no integration into `main` during this run.
- Keep the progress ledger below current. After a context reset, resume from the ledger and inspect the actual branch/diff before making further changes.

## Phase 1: In-depth research

For each task, record: current behavior; relevant code and documentation; canonical APIs/data owners; existing test expectations; the proposed approach; accessibility, privacy, persistence, and compatibility implications; remaining uncertainty; and completion criteria. Link external research sources and distinguish observed behavior from inference.

Start with [the agent guide](../../AGENTS.md), [architecture](../architecture/SUTRA_ARCHITECTURE.md), and affected sections of [subsystem contracts](../architecture/AGENT_SUBSYSTEM_CONTRACTS.md). Read only the deeper documents relevant to each task.

| Area | Research and trace before editing |
|---|---|
| Backup overlay (#1) | Existing export/provider entry points, password and destination dialogs, progress signals, completeness checks, cancellation, errors, and focus handling. Read [backup semantics](../privacy-security/DATA_AND_BACKUPS.md) and [provider contracts](../SUTRA_CLOUD_PROVIDERS.md). |
| Rich links and inline AI (#6, #7) | [Notes/editor contracts](../features/MODERN_NOTES_EDITOR.md), [Assistant behavior](../features/SUTRA_ASSISTANT.md), editor schema/serialization, paste handling, selection, slash menus, existing provider calls, cancellation, and stale responses. Research Google Docs link insertion/preview/editing and Notion-style inline assistance using official sources. Establish browser CORS and CSP limitations before proposing metadata fetching. |
| Page tags (#8) | Existing tag rendering, input events, page selection, saves, normalization, search/filter consumers, imports/exports, and editor modes. The existing tag functions are in `src/core/app.js`; trace the fault rather than assuming a replacement is needed. |
| To-do, completion, icons (#9, #10, #11) | `src/features/study/homework.js`, `src/domain/homework-store.js`, legacy mirroring, existing class/misc categories, current course-icon support, completion paths from Home and Homework, and Help & Docs page identity/reconciliation. Read existing feature docs and tests without running them. |
| Embedded custom timeline (#13) | Existing structured blocks, Canvas objects, slide elements, HTML Page sandboxing, serialization, and host-specific insertion/selection/undo. Research timeline authoring and rendering suitable for arbitrary custom events. Establish an integration matrix for Notes and other content-bearing Create surfaces, excluding Sheets; distinguish custom timeline content from the schedule workspace documented in [Timeline contracts](../features/TIMELINE_CALENDAR.md). |
| Timer mini-player (#15) | `src/features/workspace/today-focus-timer.js`, canonical timer snapshots and command/update events, navigation, paused/completed states, full-screen Focus, and existing overlay layers. |
| Mobile overhaul (#17) | [Navigation](../features/NAVIGATION.md), [design system](../design-system.md), `src/features/workspace/mobile-nav.js`, `src/features/workspace/contextual-shell.js`, `styles/responsive/mobile.css`, stylesheet order, safe areas, keyboard/viewport behavior, and every affected screen. Review supplied mockups/screenshots when available. |
| Expanded Create polish | Audit Canvas, Slides, Sheets, HTML Pages, folder organization, and contextual PDF/document surfaces. Trace each surface's creation, primary editing actions, selection, undo/redo, toolbars, inspectors, imports/exports, saved/error states, accessibility, and desktop/mobile layouts. Read [Canvas](../features/CANVAS_AND_TIMED_HABITS.md), [Slides](../features/SLIDES.md), [Sheets](../features/SHEETS.md), [HTML Pages](../features/HTML_PAGES.md), and [PDF Workspace](../features/PDF_WORKSPACE.md) contracts. |

Research outputs:

- [x] A findings entry for each of the ten tasks in [overnight findings](OVERNIGHT_RESEARCH.md).
- [x] A separate audit and prioritized improvement checklist for each non-Notes Create surface, covering desktop and mobile rather than only responsive CSS.
- [x] A dependency map and proposed file ownership for delegation.
- [x] Current feature behavior and existing data paths documented before edits.
- [x] A host-integration and persistence design for the clarified #13: an editable custom timeline embedded in Notes and other content-bearing Create surfaces, excluding Sheets. PDF adapter choice still requires host-specific implementation tracing.
- [x] A coherent mobile layout/control approach that incorporates the backup overlay, icons, completion effect, To-do naming, inline tools, and mini-player.

## Phase 2: Implementation and completion criteria

### #1 — Backup progress overlay

- Add a prominent, polished overlay connected to the actual backup operation, with wording such as “Backing up — please keep this tab open.”
- Show real operation stages; use indeterminate progress where exact progress is unavailable. Do not invent percentages or imply a browser download is already saved on disk.
- Preserve password/destination review and cancellation. Avoid duplicate submissions, stranded overlays, or success messaging after failure.
- Provide accessible status announcements, appropriate focus behavior, readable mobile layout, and reduced-motion support.
- Keep encryption, secret stripping, asset completeness checks, and provider error handling intact. Background automatic activity must not repeatedly interrupt normal use with a blocking modal.

### #6 — Google Docs-style links

- Support readable display titles that can be renamed independently of the destination URL.
- Once metadata fetching is explicitly enabled, automatically use the fetched page title for inserted plain URLs without overwriting a user's custom label.
- Provide a compact card with the destination, an explicit open action, and title/thumbnail where available; retain a usable plain-link fallback.
- Research how to obtain metadata within the existing static app, browser CORS, and CSP constraints. Make external fetching explicit and opt-in; do not add an undisclosed proxy or contact third parties during ordinary local use.
- Sanitize destinations and fetched content, prevent unsafe schemes, avoid hover-only interactions, and handle offline/failed metadata requests.
- Preserve links and labels through editor serialization, saves, reloads, and portable formats. Avoid turning pasted URLs into unexpected network requests.

### #7 — Inline AI slash commands

- Add an assistant entry in the existing slash-command experience, including valid mid-sentence invocation.
- Preserve ordinary slashes in URLs, code, and prose; do not hijack typing or disturb editor composition/selection to trigger the assistant.
- Reuse the configured AI/provider system. Show a useful disabled/setup state when no provider is available.
- Preserve the selection and surrounding text; present generated material for review and explicit insertion/replacement.
- Support loading, cancellation, failures, keyboard interaction, and undo. Discard stale responses when the page or selection context changes.
- Keep locked-page restrictions, provider disclosure, and consequential-action approval behavior intact.

### #8 — Fix page tags

- Identify and repair the actual failure in existing tag behavior.
- Cover adding/removing tags, duplicate/empty input handling, rendering on page changes, and existing tag search/filter behavior.
- Trace saving and normalization so old tags and unknown page fields survive. Preserve read-only/locked-page behavior.
- Inspect relevant import/export and reload paths; distinguish code review from observed runtime verification.

### #9 — Homework becomes To-do

- Rename the user-facing section consistently across navigation, mobile navigation, headings, accessible names, help, and connected actions.
- Retain Homework as a category and add a clear general-task experience using the canonical assignment store and existing category support where possible.
- Preserve assignments, class relationships, deadlines, completion, filters, import/export, Home connections, and legacy storage identifiers/mirroring.
- If any durable field is necessary, trace defaults, normalization, migrations, serializers, Sync projection, wipe/reset, and the [persistence inventory](../architecture/persistence-inventory.json). Prefer an approach that avoids unnecessary migration.

### #10 — Assignment-completion animation

- Attach a brief shredding/particle effect to successful completion through the existing action path, including connected completion surfaces where practical.
- Do not delay or duplicate the canonical completion operation, delete task data, or prevent undo/reopening.
- Clean up transient elements/listeners and handle rapid repeated actions or navigation.
- Preserve keyboard focus and clear completed-state feedback. Respect reduced motion and avoid expensive effects on phones.

### #11 — Custom Homework and Help & Docs icons

- Extend existing icon selection rather than creating a competing registry. Establish supported customization formats during research.
- Preserve current icons/defaults, labels, and fallbacks. Sanitize custom values and use existing safe asset paths if local images are supported.
- Maintain Help & Docs fixture identity and reconciliation behavior; icon customization must not cause duplicate or overwritten content.
- Trace persistence, reload, normalization, and portability of icon choices. Maintain contrast, touch access, and labels independent of the icon.

### #13 — Insert editable custom timelines into Create content

- The user clarified that this means an insertable custom timeline, not an additional Day/Week/Month schedule view. Support Notes and other content-bearing Create surfaces; exclude Sheets from timeline insertion.
- Provide an obvious insert action plus appropriate slash/menu entries. Let users add, edit, delete, and reorder events with labels, time/date or ordering, and descriptions; provide readable layout/style controls appropriate to each host.
- Use one structured timeline content model with host adapters rather than independent incompatible implementations. Research the appropriate representation as a note block, Canvas object, slide element, and local HTML component. Evaluate contextual PDF insertion/annotation without changing immutable source bytes; folders remain organizational containers rather than content hosts.
- Keep custom events owned by their page/content record. Use existing schedule records only for an explicitly linked behavior; arbitrary custom timeline events must not silently become scheduled work.
- Preserve selection, undo/redo, duplication, locked-page authorization, save/error handling, reloads, import/export, encrypted backup, and Sync projection. Inventory any new durable fields and version normalization/migrations where necessary.
- Make timelines readable and editable on desktop and mobile, with accessible event ordering, keyboard controls, long-label handling, and safe text rendering. Preserve unknown data and useful fallback content in formats that cannot render the native timeline.

### Added scope — Polish and upgrade Create types beyond Notes

This is substantive usability and visual work across desktop and mobile, alongside #17. Notes already works well; preserve its strengths and make the requested targeted changes there without an unnecessary note-editor overhaul. Audit the actual Create inventory before finalizing per-surface implementation decisions.

- **Shared Create experience:** clearer type selection and onboarding, consistent primary actions, contextual toolbars/inspectors, empty states, save/error feedback, accessible labels, and predictable page switching. Preserve each surface's specialized editing capabilities.
- **Canvas:** improve discoverability of tools, selection and object properties, insertion, connectors/grouping, pan/zoom/fit controls, and keyboard/touch interactions. Preserve editor isolation, canonical object ownership, undo, note links, and existing boards.
- **Slides:** improve slide navigation, insertion, layouts/themes, object selection/editing, inspector hierarchy, speaker notes, and presentation controls. Preserve deck normalization/legacy compatibility, local images, undo, and honest import/export limitations.
- **Sheets:** improve the crowded toolbar, formula/value editing, range selection, sheet tabs, formatting, menus/dialogs, and discoverability of common operations. Preserve the existing deterministic formula engine, workbook structure, clipboard, imports/exports, and authorization. Sheets is excluded only from timeline insertion, not from this polish work.
- **HTML Pages:** improve source/preview switching, editing controls, layout, empty/loading/error states, import flow, and clear local-preview status. Preserve sandbox isolation, offline restrictions, safe rendering, confirmed saves, and clearing content when locked.
- **Folders and organization:** polish type setup, hierarchy, page actions, empty states, and movement/organization flows without treating folders as editable documents.
- **PDF/document surfaces used through Create:** improve toolbar grouping, page navigation, zoom, annotations, panels, import/export choices, and status/error clarity. Preserve original-byte ownership, coordinate semantics, teardown/cancellation, password handling, lock boundaries, and accurate export warnings.
- Record concrete observed problems and deliver meaningful fixes for each surface; do not consider a color refresh, smaller fonts, or hidden controls sufficient. Keep layout/session state separate from durable content, and avoid engine rewrites unrelated to an observed defect.

### #15 — Focus Timer mini-player

- Add a compact timer surface across relevant screens with remaining time, running/paused state, start/resume, pause, and access to full Focus controls.
- Use `sutra:focus-timer-command` and `sutra:focus-timer-updated`. Keep the existing timer as the only owner of timing and persistence.
- Preserve consistent state across Home, Create, and full-screen Focus. Define visibility/dismissal for idle, paused, and completed states.
- Coordinate placement with navigation, sheets, toasts, and the keyboard so the player cannot cover content. Provide accessible labels and restrained announcements.

### #17 — Comprehensive mobile redesign

Preserve Sutra's dark navy/near-black foundation, restrained indigo/blue accents, typography, subtle depth, and student-productivity identity. Preserve desktop workflows and avoid unrelated desktop redesign; the separate Create-polish workstream explicitly includes desktop improvements. Allow mobile-specific layouts where appropriate.

- **Shared foundation:** coherent gutters, vertical rhythm, headers, typography, touch targets, surface hierarchy, safe-area spacing, viewport units, scrolling, keyboard behavior, z-index layers, modals, and sheets. Improve existing primitives; avoid unnecessary abstractions, arbitrary offsets, excessive `!important`, and one-off CSS patches.
- **Navigation:** retain five destinations: Home, To-do (the renamed Homework section), Capture, Create, and More. Preserve canonical handlers, focus restoration, dismissal, scroll locking, accessibility, and at least 44-pixel primary touch targets.
- **Persistent controls:** move the large floating save/upload/download/cloud/refresh toolbar into compact status affordances, menus, or contextual sheets without removing actions. Keep the report button, timer player, toasts, sheets, and keyboard from competing for the same space.
- **Home:** emphasize context, Next Up, the primary action, and concise daily status. Preserve overdue work, assignment context, scheduling, Open Details, Focus, Review status, and local/backup status.
- **To-do:** emphasize tasks; preserve All Assignments, By Class, filters, sorting, creation, import/export, due dates, priority/difficulty, details, and class information. Use a mobile-appropriate By Class presentation and consolidate secondary controls.
- **Timeline:** retain Day/Week/Month, date navigation, Today, Add Block, block editing, and schedule data. Replace the compressed week grid with a date strip and agenda experience; provide readable Day and Month presentations.
- **Create/editor:** prioritize writing while preserving formatting, slash commands, navigation, save status, attachments, page actions, locked pages, modals, scrolling, and keyboard interaction.
- **Protected pages:** clearly separate Unlock, duress-PIN configuration, and permanent PIN removal. Preserve warnings, security semantics, and deletion behavior.
- **Settings:** preserve every setting and search; improve grouped navigation, clipped text, scanability, spacing, and the compact Appearance preview.
- **Testing Hub / Review & Tests:** simplify nested statistics while preserving programs, exams, status, upcoming work, practice/review counts, management actions, Add Exam, More Exams, and alternate views.
- **More / All sections:** provide a polished, accessible bottom sheet with close/drag affordances, safe areas, scrolling, and background dimming. Preserve access to every enabled canonical destination, including custom dashboards, Notifications, College, and Life.
- **Accessibility:** preserve contrast, text scaling, semantic controls, labels, keyboard/focus behavior, screen-reader semantics, non-color feedback, and reduced motion.
- **Inspection:** manually inspect representative widths of 360, 375, 390, 393, 414, and 430 px sequentially, suitable phone heights, landscape, long names, empty/populated/loading/error states, locked notes, Sync status, toasts, overflow, safe areas, and overlay interactions. Report physical-device and keyboard behaviors that cannot be observed.

## Phase 3: Work ownership and order

1. Finish research and document decisions before product edits.
2. Establish the shared mobile layout/overlay and Create-tooling approach, then agree narrow file ownership.
3. Delegate suitable bounded animation/icon work to Luna xhigh sequentially. If two tasks need the same file, complete and review one before assigning the next. Delegated work remains subject to primary-agent review.
4. Repair tags and implement the backup overlay and canonical timer presentation through small seams.
5. Implement To-do naming/categories, rich links, and inline AI against the researched contracts. Coordinate changes that share editor or task files.
6. Implement the embedded custom timeline with the researched host adapters and durable-data contracts, excluding Sheets from insertion.
7. Upgrade Canvas, Slides, Sheets, HTML Pages, folder organization, and contextual PDF/document workflows against their individual audit checklists. Delegate additional bounded presentation fixes to Luna only after existing assignments are reviewed and file ownership is clear.
8. Complete each major mobile screen and inspect cross-feature integration, including overlays, embedded timelines, Create workflows, and desktop behavior.
9. Update relevant feature docs, Help & Docs, and canonical contracts for actual changes. Regenerate owned manifests/cache/CSP artifacts only when affected; do not edit generated output by hand.

This is a sustained implementation plan for ten numbered tasks plus the Create upgrades, not a guarantee that all work fits into a fixed number of hours. Do not rush or declare unfinished/unverified work complete to meet an overnight deadline.

## Three personal review passes per change

1. **Correctness:** reread every edit, trace callers and event/data flows, and inspect edge cases, failure cleanup, stale state, and compatibility. This includes every Luna contribution.
2. **Quality and safety:** reread for canonical helper usage, maintainability, data preservation, security/privacy, accessibility, desktop/mobile effects, global/load-order constraints, and unnecessary complexity.
3. **Integration before commit:** inspect the full candidate/staged diff alongside observed UI behavior and permitted static-check output; ensure the three reviews cover the final revision. Verify that only task-owned changes are staged.

Record evidence and corrections for each pass. Automated checks or a subagent's own review do not substitute for these primary-agent reviews.

## Core runtime workflow

Before any `src/core/app.js` edit, satisfy the guide's clean-main-worktree prerequisite without committing, discarding, or hiding unrelated user changes. Use the prescribed `core:worktree` workflow, edit only the resulting `codex/*` candidate, and save a byte-for-byte copy under ignored `.tmp/recovery/` first. Do not use the dirty starting checkout as an excuse to bypass isolation.

Use permitted low-cost static integrity checks and retain the staged-runtime hook for commits. The full runtime command's self-tests and all broader automated validation remain deferred under the user's constraint. Do not run `core:integrate` or merge into `main`; hand the branch to the user with required validation clearly marked pending.

## Progress ledger

Update a row after research, an implementation milestone, a review pass, a commit, or a blocker. Use explicit states such as `planned`, `researched`, `implementing`, `reviewed`, or `awaiting user validation`; do not use `complete` for work with required behavior still missing.

| ID | Task | Owner | Status | Review 1 / 2 / 3 | Commit / remaining work |
|---|---|---|---|---|---|
| #1 | Backup overlay | Primary | Researched | Pending / Pending / Pending | Foreground progress callbacks; background unchanged |
| #6 | Rich links | Primary | Researched | Pending / Pending / Pending | Opt-in local metadata helper; offline fallback |
| #7 | Inline AI slash commands | Primary | Researched | Pending / Pending / Pending | Precise trigger range; existing provider request/review |
| #8 | Page tags | Primary | Researched | Pending / Pending / Pending | Fresh path works; malformed legacy names/input ownership/authorization fragile |
| #9 | To-do section | Primary | Researched | Pending / Pending / Pending | Existing canonical row with general task kind |
| #10 | Completion animation | Luna xhigh; primary integration | Researched | Pending / Pending / Pending | Actual completed transition; include Home bridge |
| #11 | Custom icons | Luna xhigh; primary integration | Researched | Pending / Pending / Pending | Extend course picker; preserve Help icon reconciliation |
| #13 | Embedded custom timeline | Primary | Researched | Pending / Pending / Pending | One authored model, host adapters, inventory/fallbacks; exclude Sheets |
| #15 | Timer mini-player | Luna xhigh; primary integration | Researched; delegated next | Pending / Pending / Pending | Existing controller and stylesheet; no timer state fork |
| #17 | Mobile overhaul | Primary | Researched | Pending / Pending / Pending | Baseline 390 phone, 1280 desktop; all target widths pending |
| Added | Non-Notes Create upgrades | Primary; scoped Luna help | Researched | Pending / Pending / Pending | Per-surface audit in research artifact; shared type selection bug observed |

For each active task, append a brief entry with date, files, findings/decisions, three review records, permitted checks actually run, checks deferred, commit, and the next concrete action. Record delegation ownership before starting a worker.

### October 1 — Research checkpoint

- Files: this plan and `OVERNIGHT_RESEARCH.md`; product source still unchanged.
- Isolation: clean main created separately, prescribed `core:worktree` used, plan cherry-picked, core recovery copy hash verified. User instruction copies in the candidate are excluded from task commits.
- Luna xhigh completed read-only research of #9/#10/#11. Primary checked its proposed seams against source and existing contracts.
- Sequential manual baseline: Home, Homework, Notes/tag add and reload, Canvas, Slides, Sheets at 390 × 844; Canvas/Slides at 1280 × 900. Fresh local origin only. No suites or self-tests run.
- Three primary reviews: source-backed correctness, privacy/data/scope safety, final documentation/staged-diff review. Research output retains explicit uncertainty for tags, metadata availability, PDF-native timeline support, physical devices, and deferred automated validation.
- Next ownership: Luna edits only `src/features/workspace/today-focus-timer.js` and `styles/views/today-focus-timer.css` for #15. Primary owns core tags/backup integration, all commits, shared mobile layout, and subsequent work.

## Morning handoff and user verification

- [ ] Branch name, commit list, and concise change summary supplied; `main` remains unmerged.
- [ ] Existing user changes preserved and unrelated files excluded from task commits.
- [ ] Three primary-agent reviews recorded for each delivered change, including Luna's code.
- [ ] Relevant documentation updated; temporary/debugging artifacts removed.
- [ ] A feature-by-feature manual verification checklist supplied for all implemented tasks.
- [ ] Backup/tag/icon/task/link/timer/timeline/Create persistence and portability checks identified, with unobserved behavior clearly marked unverified.
- [ ] Per-Create-surface improvements and the timeline host-support matrix supplied; Sheets has no timeline insertion action.
- [ ] Mobile and desktop observations supplied, with exact widths/screens checked and limitations disclosed.
- [ ] Automated checks listed as **not run**, with relevant commands/coverage suggested for the user's resource-appropriate validation. Do not claim suite results or CI results that were not observed.
- [ ] Remaining uncertainties, incomplete tasks, regressions, and required gates explicitly listed. Integration into `main` remains a separate user-authorized step after review.
