# Sutra overnight research and implementation plan

Prepared September 30, 2026. Task numbers refer to the reorganized list agreed in the chat.

**Branch:** `codex/overnight-improvements`

**Current status:** Research completed and recorded in [overnight findings](OVERNIGHT_RESEARCH.md). Implementation is underway in the isolated candidate. Reviewed checkpoints cover tags, the Focus player, backup progress, custom icons, and the phone Week agenda; the remaining workstreams are still active.

**Candidate directory:** `D:\Desktop\Engineering\Coding\Active projects\Sutra\.tmp\overnight-clean-main\.tmp\worktrees\overnight-improvements`. The original checkout is `codex/overnight-plan`; the desired implementation branch lives in the prescribed core candidate. Both the existing dirty main worktree and the user's original changes are preserved.

**Handoff:** Leave the candidate on its branch for the user's local review. Do not merge to `main`, push, deploy, or publish.

**Confirmed scope:** The ten numbered tasks below, plus substantive polish and usability upgrades for Create types other than Notes. The user's timeline clarification applies to #13: insert an editable custom timeline into Notes and other content-bearing Create surfaces, excluding Sheets. Sheets remains included in the separate Create-polish workstream.

## Working agreement

- Research all ten tasks and the expanded Create workstream before changing product code. Inspect current behavior, relevant source, existing tests without executing them, feature documentation, and recent history. Use authoritative external sources for behavior and browser/platform constraints that need research.
- Preserve existing user changes and untracked files. Stage and commit only task-owned files or explicitly reviewed hunks; do not bundle unrelated work.
- Delegate bounded tasks exclusively to **Luna xhigh** (`gpt-6-luna`, reasoning effort `xhigh`). The user explicitly permits multiple Luna workers when useful. Keep concurrency modest and file ownership independent; the primary agent owns integration, three reviews, and commits.
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
| #1 | Backup overlay | Primary | Reviewed; awaiting user validation | Done / Done / Done | Real transient stages; cleanup on every exit; no automatic overlay |
| #6 | Rich links | Primary | Researched | Pending / Pending / Pending | Opt-in local metadata helper; offline fallback |
| #7 | Inline AI slash commands | Primary | Researched | Pending / Pending / Pending | Precise trigger range; existing provider request/review |
| #8 | Page tags | Primary | Reviewed; awaiting user validation | Done / Done / Done | Legacy normalization, input ownership, persistent filter, restored phone controls |
| #9 | To-do section | Primary | Reviewed checkpoint; user validation pending | Complete / Complete / Complete | Shared Capture/Home general tasks; existing canonical rows and aliases |
| #10 | Completion animation | Luna xhigh; primary integration | Reviewed checkpoint; user validation pending | Complete / Complete / Complete | Confirmed save; To-do and Home; viewport-clipped inert effects |
| #11 | Custom icons | Luna xhigh; primary integration | Reviewed; awaiting user validation | Done / Done / Done | Course emoji/presets and Help page icons; existing fields and local Sync preference preserved |
| #13 | Embedded custom timeline | Primary | Researched | Pending / Pending / Pending | One authored model, host adapters, inventory/fallbacks; exclude Sheets |
| #15 | Timer mini-player | Luna xhigh; primary integration | Reviewed; awaiting user validation | Done / Done / Done | Canonical commands, paused-session preservation, focus restoration, overlay suppression |
| #17 | Mobile overhaul | Primary; scoped Luna help | Foundation and Week agenda reviewed; other screens pending | Foundation and agenda: Done / Done / Done | More utilities and phone date-strip agenda; comprehensive screens/widths still pending |
| Added | Non-Notes Create upgrades | Primary; scoped Luna help | HTML/Sheets/Slides drafts; PDF underway | Pending / Pending / Pending | Primary review, visible host integration, and Canvas/folder work remain |

For each active task, append a brief entry with date, files, findings/decisions, three review records, permitted checks actually run, checks deferred, commit, and the next concrete action. Record delegation ownership before starting a worker.

### October 1 — Research checkpoint

- Files: this plan and `OVERNIGHT_RESEARCH.md`; product source still unchanged.
- Isolation: clean main created separately, prescribed `core:worktree` used, plan cherry-picked, core recovery copy hash verified. User instruction copies in the candidate are excluded from task commits.
- Luna xhigh completed read-only research of #9/#10/#11. Primary checked its proposed seams against source and existing contracts.
- Sequential manual baseline: Home, Homework, Notes/tag add and reload, Canvas, Slides, Sheets at 390 × 844; Canvas/Slides at 1280 × 900. Fresh local origin only. No suites or self-tests run.
- Three primary reviews: source-backed correctness, privacy/data/scope safety, final documentation/staged-diff review. Research output retains explicit uncertainty for tags, metadata availability, PDF-native timeline support, physical devices, and deferred automated validation.
- Next ownership: Luna edits only `src/features/workspace/today-focus-timer.js` and `styles/views/today-focus-timer.css` for #15. Primary owns core tags/backup integration, all commits, shared mobile layout, and subsequent work.

### October 1 — Page tags implementation

- Files: `src/core/app.js`, `styles/base/styles.css`, cache stamps in `Sutra.html`, Notes feature guide, and Help & Docs refresh.
- Findings: fresh tag entry worked in the baseline; legacy scalar/non-string names, unfinished input ownership, and independent tree filtering were fragile. Existing phone CSS also hid the entire tag filter. The patch accepts legacy strings, preserves tag-object fields, binds edits to their authorized page, ignores duplicate case variants, honors blocked writes, and shares tag/text filter constraints.
- Review 1: primary read every core edit and traced normalization, input/blur/key events, save calls, tree rerenders, collapsed ancestors, and filter clearing. Review 2: primary reread the complete diff for unknown-field preservation, locked-page authorization, persistence health, IME, cancellation/focus, space scoping, phone visibility, and 44-pixel filter controls. Corrected the Help text to avoid promising a new search UI.
- Sequential manual inspection at 390 × 844: duplicate `research` against `Research` was refused; Escape discarded `cancelled`; blur saved `Planning`; Planning persisted through reload; sidebar Research filtered to the tagged page; creating another blank page refreshed the tree without clearing that filter; All restored the list. The served core cache stamp was changed before checking the updated input label. No console errors observed in the inspected log snapshot.
- Review 3: primary read the full staged core/style diff and integration changes in the shell, feature guide, Help refresh, service worker, and generated metadata. Only task-owned files are staged; instruction copies and the unreferenced backup draft are excluded.
- Permitted checks: leaf core integrity passed all 27 static assertions; guardrails, cache-stamp freshness, manifest freshness, syntax checks for the changed feature scripts, and staged whitespace checks passed. The owning budget generator recorded the narrow 3,014-byte / 37-line increase. Tests, self-tests, portability suites, physical keyboard/device checks, and aggregate validation remain deferred.

### October 1 — Focus player and mobile utility checkpoint

- Luna xhigh owned the Focus presentation module and stylesheet. Primary corrected session classification, reset/first-tick behavior, focus restoration, and full Focus opening after tracing the post-load `audit-fixes.js` wrapper. Opening an active or paused session now preserves its remaining time through the existing `skipPreflight` contract.
- Review 1: primary read the complete contribution and traced canonical command/update events, snapshot rendering, dismissal, reset, completion, and full Focus callers. Review 2: primary reread the revised diff for single timer ownership, accessibility, keyboard suppression, overlay visibility, reduced motion, and phone/desktop spacing. Review 3: primary read the full final staged module/style diff together with shell stamps, docs, and manual observations. Corrections received fresh affected review passes.
- Manual observations: desktop Start, Pause, Hide, Restore, and full Focus preserved the displayed paused time. The full Focus dialog hid the player; Minimize restored it. At 390 × 844, Resume/Pause used the canonical timer; explicit More → Save followed by reload preserved paused 17:14. Timer completion, physical devices, and software-keyboard interaction remain unobserved.
- Primary moved phone Save, Export, Import, Data & Backup, and Report a Problem into the existing More sheet. The sheet displays canonical save status and uses the original controls. Its scrollable layout retains every enabled destination; its initial close-button focus keeps the header/actions visible on short screens. Desktop controls remain in place.
- Three primary reviews of this mobile foundation covered canonical routing/actions, readiness fallback, observer loops, history/focus/scroll locking, safe-area and player spacing, disabled actions, the full final staged diff, and the feature docs. Manual 390 × 844 observations confirmed the utilities, Escape dismissal, canonical Save, and the existing Export Options dialog with the player suppressed.
- This checkpoint uses the permitted static checks listed above and retains the staged-runtime hook. Automated suites, self-tests, full aggregate runtime/deploy gates, broader mobile screens/widths, and portability checks remain deferred or outstanding. The full mobile overhaul is not yet delivered.
- Local commit: `ffc9d08`; staged-runtime hook passed all 27 assertions. Main remains unmerged.

### October 1 — Next bounded delegation

- Luna xhigh worker `homework_research` owns only course-icon additions in `src/features/study/homework.js` and narrowly related `styles/features/homework-redesign.css`. Reuse the existing durable course icon field; primary owns Help & Docs page-icon reconciliation and subsequent task-kind changes.
- A second Luna xhigh worker owns only mobile scheduling presentation in `src/features/workspace/timeline-calendar.js` and `styles/views/timeline-calendar.css`: readable week date strip/selected-day agenda, retained Day/Month controls and canonical block actions. This is separate from the authored timeline embed work.
- Primary owns backup core/lifecycle integration, shell load order/cache stamps, docs/generated metadata, all commits, and three personal reviews of both contributions. Workers do not run tests, install dependencies, mutate Git, or touch other files.

### October 1 — Foreground backup overlay

- Files: core progress seams, `backup-progress.js`/CSS, shell load order/stamps, generated asset/cache metadata, Data and Backups guide, and Help refresh. No durable fields or package/encryption changes.
- Review 1: primary read all edits and traced encrypted/plaintext exports, password cancellation/validation, provider setup/busy/identity exits, retention, background callers, pre-restore snapshots, required-file refusal, and finally cleanup. Review 2: primary reread for plaintext/credential exclusion, ciphertext provider boundaries, optional callback failures, modal focus/scroll lock, concurrent operation IDs, Escape behavior, safe areas, theme tokens, and reduced motion. Review 3: primary read every final staged source/style/doc/shell/generated diff and checked that unrelated instruction copies and Luna files were excluded.
- Sequential manual observation at 390 × 844 in the disposable localhost workspace: after password confirmation, the overlay was focused and showed “Backing up…”, an indeterminate progress indicator, and the actual packaging stage. A later observation showed it hidden and the workspace accessible again. No claim of browser-file durability or successful restore is made from this observation.
- Permitted checks passed: backup-module syntax, leaf core integrity (27 assertions), architecture guardrails, manifest freshness, and cache freshness. The owning core budget generator recorded the 3,418-byte / 63-line seam. The staged-runtime hook remains enabled.
- Deferred: suites/self-tests, encrypted round-trip/required-file failure coverage, provider integration, retention failures, concurrent exports, physical devices, and aggregate runtime/deploy validation. These must be checked before integration; no production/network account was used.

### October 1 — Custom icons and phone Week agenda

- Luna xhigh contributions are restricted to Homework icon presentation and the calendar presentation module/styles. Primary owns Help page reconciliation, authorization, Sync-local preference preservation, cache stamps, documentation, and commits.
- Icons use the existing course/page icon fields. Course presets and the legacy `people-group` alias remain supported; one custom emoji is rendered with `textContent`. Unsupported stored icons and other unknown course fields remain in the model with a safe display fallback. Help content/identity remains protected; its icon can be changed or reset to books and is preserved through local reload/full backups. Sync regenerates Help pages while retaining this device's prior icon preference.
- Review 1: primary read every contribution and traced normalization, canonical Homework storage/mirroring, backup/Sync projection, Help reconciliation, and page authorization. Corrected Luna's normalization so unsupported icon values survive. The calendar now uses canonical day/recurrence/source helpers rather than its parallel interpretation.
- Review 2: primary reread the final core/module/style diffs for DOM safety, unknown-field preservation, locked pages, write blocking, keyboard/touch controls, modal ownership, focus restoration, viewport changes, and desktop behavior. Added the course picker's missing modal registration class and restored focus to a rerendered page icon. Those corrections received fresh source review and manual inspection.
- Manual inspection in the disposable local preview at 390 × 844: Help's rocket icon survived reload; resetting restored books and keyboard focus. Invalid course text stayed in the picker; a test-tube emoji saved, survived reload, and returned focus after selection/Escape. Selecting Friday changed the canonical date input and preserved focus. Adding a long-title time block used the existing form; the agenda wrapped its full title and reopened the existing editor. At 360 × 800 the agenda caused no document overflow. Resizing to 1280 × 900 retained the selected date and restored seven desktop Week columns; Day and Month controls still changed the rendered view.
- Review 3: primary read the complete final staged source/style/shell/docs/generated diffs in bounded chunks, checked the observations against the implemented paths, and excluded unrelated instruction copies. Leaf core integrity (27 assertions), script syntax, architecture guardrails, cache freshness, and manifest freshness passed. The owning core budget records a narrow 2,413-byte / 41-line increase. No suites, self-tests, encrypted restore, provider integration, Sync round-trip, physical-device, or software-keyboard checks have run.
- The phone Week agenda is one milestone of #17; Home, To-do, protected pages, Settings, Review, Create surfaces, and the full width/state matrix remain active work.
- Local commit: `d642bef`; the staged-runtime hook passed all 27 assertions. Main remains unmerged.

### October 1 — Next independent Luna assignments

- Luna xhigh `homework_research` owns only new `src/ui/task-completion-effects.js` and `styles/features/task-completion-effects.css`: transient presentation of the primary-owned `sutra:task-completed` event. It owns no task state, storage, completion actions, shell stamps, or Git operations. Primary supplies events only after successful canonical transitions and includes Home.
- Luna xhigh `mobile_schedule` owns only `src/features/workspace/sheets.js` and `styles/features/sheets.css`: grouped toolbars with every existing operation retained, clear formula/value Apply and Cancel controls, empty/error/status clarity, and desktop/phone editing polish. The formula engine, durable workbook schema, core bridge, shell, docs, and Git remain primary-owned.
- Primary owns #9 To-do categories/labels in the canonical task store and core connections, all integration, cache/generated assets/docs, and three personal review passes for every contribution. Workers do not use browser workers, suites, self-tests, installs, heavy builds, or commits.

### October 1 — Create ownership continuation

- The completion presentation and Sheets drafts are now primary-owned for review and integration. Luna xhigh `homework_research` owns only `html-pages.js` / `html-pages.css` for source/preview and action polish; Luna xhigh `mobile_schedule` owns only `slides.js` / `slides.css` for substantive toolbar, inspector, ordering, and phone editing polish. Host timeline adapters, shared/core seams, docs, shell, generated artifacts, reviews, and commits remain primary-owned.
- A third Luna xhigh worker may own only a new pure `src/domain/content-timeline.js` helper for the shared authored event model and safe portable rendering; primary owns every host adapter and global registration. Its bounded normalization must preserve unknown data and arbitrary user-authored event labels rather than converting them into schedule records.

### October 1 — Shared To-do and completion checkpoint

- Homework and General categories now use the existing canonical Homework task rows. Capture, To-do add actions, the Home quick task form, and Home's top Add task button connect to that store. Legacy planner tasks and existing API/storage identifiers remain compatible. Unknown task fields and kinds survive serialization; summary/date/sidebar counts follow the selected category. Navigation, search, Settings, onboarding, Help, and Assistant labels describe To-do.
- Primary review 1 traced task normalization/serialization, Capture parsing, legacy mirroring, Home projection, save receipts, recurrence, attachments, backup/Sync projection, and compatibility tests as source. Review 2 reread all edited behavior and Luna's complete effect module/style for data preservation, failure feedback, DOM safety, theme/motion support, bounded lifetime, viewport clipping, and focus. Corrections included removing a stale class hint, refreshing the enhanced type label, keeping General's badge inert, connecting Home quick-add, and selecting the visible completion control before an offscreen priority row.
- Primary review 3 read the entire final staged core, Homework, store, effect/style, auxiliary-label, shell, docs, inventory, deferred-test, and generated metadata diffs in bounded chunks. Rechecked corrected capture labels and completion geometry/focus against sequential manual observations. The final service-worker cache version was reviewed against the new asset stamps. Unrelated instruction copies and unfinished Create contributions are excluded.
- Manual inspection: at 390 × 844, class-free General and class-linked Homework capture saved into their respective categories; counts and Add task/Add homework labels followed the category. Completion showed one transient effect and preserved a useful focus target; reopening showed no effect. At 1280 × 900, Home quick-add reported a confirmed save; after reload its record appeared in General. Keyboard Enter on Home completion showed one effect, retained focus on Start Focus, and caused no document overflow. Corrected General capture omitted the class hint; Homework displayed the matching enhanced type and class. The three finished sample tasks stayed distinct in All, Homework, and General.
- Low-cost checks: core leaf integrity passed all 27 static assertions; changed task/store/effect/Assistant script syntax and asset-manifest freshness passed. Cache metadata was generated and verified by its owning tool against an exact staged-source snapshot (174 stamped assets), excluding unreviewed Luna drafts. The working directory still contains those drafts; their later stamps/reviews are pending. The core budget records a narrow 4,637-byte / 59-line increase. Hooks remain enabled.
- Deferred: all suites/self-tests/builds, integration/portability gates, failure injection, legacy import/encrypted restore/Sync round trips, physical devices, rapid completion and reduced-motion interaction coverage. Meaningful store receipt and Home canonical-row assertions were added for later execution; they have not run. Main remains unmerged.

- Local commit: `5c945fe`; staged-runtime hook passed all 27 assertions. Main remains unmerged.

### October 1 — Create editor checkpoint

- Shared New Page chooses Notes, Canvas, Slides, Sheets, HTML Page, or Folder before an explicit Create action. Notes retains its templates; Canvas filters to Canvas templates. Slides, Sheets, and HTML use their existing canonical page models and selected starter. Parent authorization is checked before creation; no new page type/schema/store is introduced.
- Luna xhigh drafted the Sheets, Slides, HTML, and contextual PDF presentation changes. Primary read every contribution and corrected sheet-grid scroll evaluation, zero/false display, unknown cell fields, undo ownership, cross-sheet rename references, inline rename forms, slide duplication/title behavior, layout replacement consent, speaker-note input truncation, stale HTML imports, preview-control refresh, stale PDF render-error generations, and Create-button contrast.
- Primary review 1 traced the complete edited behavior against current source, feature guides, canonical saves/history, read-only/locked-page rules, PDF byte ownership, and sandbox boundaries. Review 2 reread the complete revised source/style/shell/doc diffs, including each correction, for cancellation, ownership, unknown-field preservation, keyboard/focus, phone disclosures, theme tokens, and desktop layout. Review 3 read the complete final staged source/style/shell/docs/generated diffs in bounded chunks; corrected static-markup guardrail annotations were reread in place and preserved the same DOM safety boundary.
- Sequential manual observations: at 390 × 844, selecting Slides did not create early; confirming a blank starter created a truly empty slide. Text editing, inline title rename, duplication, ordering, layout cancellation/replacement/Undo, speaker notes, presentation, and Escape worked; text/order/title persisted after reload. Sheets retained 0 after reload, evaluated =A1+2, cancelled a draft, supported Undo/Redo, and scrolled without an evaluation exception. Renaming Sheet1 to Data source preserved the observed cross-sheet result of 2 and rewrote the formula. HTML edited source and a checklist snippet appeared in its offline preview with separate ready/save feedback. At 1280 × 900, HTML Split showed code and preview together; Sheets Study tracker contained Task, Due date, and Status.
- PDF source review covered visible-page tracking, inspector focus/Escape, and unchanged source-byte/export ownership; this checkpoint does not claim a PDF browser walkthrough. Canvas/folder polish, all authored timeline hosts, rich links, inline AI, and the complete mobile matrix remain active work.
- Permitted checks passed: changed feature-script syntax, staged whitespace, core leaf integrity (27 assertions), manifest freshness, and cache freshness. Architecture guardrails passed against the exact staged runtime snapshot; unfinished helper globals are deliberately excluded and will be registered with their later integration. Cache metadata was generated by its owner against 174 staged stamped assets. The core budget records a narrow 5,151-byte / 57-line increase. Hooks remain enabled.
- Deferred: all tests/self-tests/builds, aggregate runtime/deploy checks, encrypted restore/Sync/import round trips, Office/PDF export fidelity checks, physical devices, software keyboards, and unobserved failure/concurrency paths. New feature documentation and Help & Docs describe actual behavior and the existing simple Slides print limitation.

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
