# Student OS Upgrade Report

Date: 2026-06-16

## Scope Completed

Phase 1 was implemented against Sutra's current static, local-first architecture. The work keeps Sutra as a single static app, preserves the existing Homework localStorage keys, keeps Course Hub as the richer metadata layer over the existing homework course/task store, and routes new homework writes through `SutraSafeStorage`.

## Changes

- Added a unified All Due / Student Inbox in Course Hub that aggregates homework, planner tasks, Assignment Studio milestones, AP exams and prep signals, review debt, college deadlines, timeline items/conflicts, overloaded-day signals, stale-note signals, and work/project deadlines.
- Added inbox filters for all, overdue, today, this week, high risk, unscheduled, review, AP, college, course, and timeline.
- Added safe inbox actions: open source, schedule, mark done for mutable task types, defer/reschedule, and create study block.
- Expanded Course Hub overview into a central academic dashboard with next actions, assignments, files/resources, linked notes, review decks, AP linkage, school schedule periods, Grade Planner summary, and quick actions.
- Surfaced the deterministic Grade Planner engine inside Course Hub grade snapshots, including current score, target, missing-work count, and missing-work impact. Grade math remains local and deterministic; assistant actions can request local grade calculations but do not compute grades directly.
- Added an Assistant Action Review Center for multi-action batches with batch controls, risk labels, selected apply/decline, before/after summaries, high-risk confirmation, activity access, and grouped activity history.
- Added Backup Health / Data Safety cards in Settings for last export, storage health, degraded storage, Drive sync status, and quick export/restore/diagnostic actions.
- Expanded universal search coverage for courses, course resources, assistant activity, and settings/data-safety surfaces.
- Added Phase 1 UI styling for inbox filters/actions, course next-action cards, grade-engine notes, data-safety cards, and assistant review-center batches.

## Files Touched For This Pass

- `Sutra.html`
- `src/core/app.js`
- `src/features/flow-assistant.js`
- `styles/sutra-pro.css`
- `tests/e2e/student-os-phase1.spec.mjs`
- `docs/STUDENT_OS_UPGRADE_REPORT.md`

The working tree already contained broader uncommitted changes outside this pass, including academic command-center, glass styling, migration/check scripts, and other docs/tests. Those were not reverted.

## Tests Added

Added `tests/e2e/student-os-phase1.spec.mjs` covering:

- Student Inbox aggregation across homework, planner tasks, milestones, review, AP, college, timeline, business/work deadlines, filters, safe mark-done action, and `SutraSafeStorage` usage.
- Course Hub linking for assignments, resources, notes, review decks, next actions, school schedule, and deterministic Grade Planner math.
- Grade calculations for weighted categories, missing/pending/excused status, final-score solver, missing-work impact, and GPA projection.
- Assistant Action Review Center high-risk batch confirmation behavior and grouped activity/search coverage.
- Backup round-trip coverage for the new `courseWorkspace.settings.studentInboxFilter` persisted field.
- Mobile Student Inbox layout/action visibility.
- Expanded search indexing for course resources, review cards, assistant activity, and settings.

## Verification Pass (follow-up)

The initial Phase 1 pass could not run the gated checks. A follow-up pass ran them
to completion and fixed three real defects surfaced by the previously-unrunnable
checks/tests:

1. **Guardrail violations** (`npm run check:all` was failing). `flow-assistant.js`
   had 4 new `innerHTML` sinks over baseline and 6 unregistered `cw*` globals.
   - The 4 sinks are reviewed-safe (empty/static markup or `esc()`-escaped
     interpolation); added `// sutra-allow-html:` markers. This dropped the
     file's sink budget from 24 to 19.
   - Registered the 6 new namespaced `cw*` globals via `--update`; the ratchet
     also tightened several budgets downward (net improvement).
2. **Grade engine** (`computeCourseGrade`) returned `missingCount`/`gradedCount`
   but not `pendingCount`/`excusedCount`, which Course Hub and the spec rely on
   for the documented "missing/pending/excused" status. Added both counts.
   Math remains deterministic and local.
3. **Mobile Student Inbox CSS blowout.** The inbox row reuses the `.ad-row`
   class and inherited the legacy `.ad-row` mobile child `grid-column`
   placements, forcing an implicit 2nd column; the `.ad-main-grid` track also
   let the panel overflow below its min-content. Reset inbox child placements in
   the mobile breakpoint and added `min-width: 0` to `.ad-main-grid` items so
   wide tables wrap instead of overflowing.

## Checks Run

- `npm run check:syntax` — passed (92 JS files validated).
- `npm run check:all` — **passed** (syntax, app-shell, migrations, smoke,
  round-trip, version-history, rebrand, compat, CSP, persistence, modal-a11y,
  network, encoding, responsive, brand, docbg, academic engines, guardrail
  self-test, architecture guardrails).
- `npx playwright test --project=chromium tests/e2e/student-os-phase1.spec.mjs`
  — **4 passed** (Student Inbox aggregation/guarded storage, Course Hub linking +
  deterministic grade math, Assistant Action Review Center high-risk gating +
  search, backup round-trip + mobile inbox layout).

## Phase 2 — #8 Generate Review Deck (implemented)

Implemented the Generate Review Deck workflow end-to-end on top of the existing
`review.js` create-set editor (no new persisted fields — generated cards reuse
the card model's existing `sourceType`/`sourceId`/`sourceNoteId`/`sourceApClassId`/
`sourceProjectId` fields, so the `.sutra` round-trip is unchanged).

- Added a deterministic, AI-free generation engine in `src/features/review.js`:
  - `generateReviewCandidates(raw)` parses pasted material line-by-line,
    recognizing tab / ` - ` / ` = ` / `,` / `Term: definition` separators,
    stripping bullet and numbering prefixes, and de-duplicating within the batch.
  - `markDuplicateCandidates(candidates, {deckId})` flags candidates whose prompt
    already exists (defaults to scanning every deck; pass `deckId` to narrow).
  - `openReviewGenerator(opts)` opens the existing editable create-set table
    pre-filled with generated rows, duplicate badges, a generation banner, and a
    "Remove duplicates" action — nothing saves until the student confirms.
  - Extracted the shared `splitCardLine()` helper and refactored `bulkImportCards`
    to use it (identical legacy behavior; less duplication — goal #15).
- Public API: `window.SutraReviewGen = { generate, markDuplicates, openGenerator }`
  (namespaced, registered in the guardrail inventory) so the assistant and other
  surfaces can drive it.
- UI entry points: a "✨ Generate cards" button in the Review library and an
  in-view paste panel (`open-generate` / `create-generate-from-text`) that appends
  generated rows to the editable table, de-duping against the draft and saved decks.
- Styling in `styles/styles.css` for the paste panel, generation banner, and
  duplicate badge/row treatment.
- Tests: `tests/e2e/student-os-phase2-reviewgen.spec.mjs` (4 tests) covering
  mixed-format generation + intra-batch de-dupe, cross-deck duplicate detection,
  the editable review table + remove-duplicates + save + `.sutra` round-trip, and
  the visible library/paste entry point. All pass in Chromium.

Files touched this pass: `src/features/review.js`, `src/features/grade-planner.js`,
`src/features/flow-assistant.js`, `styles/styles.css`, `styles/sutra-pro.css`,
`scripts/guardrail-baseline.json`, `tests/e2e/student-os-phase2-reviewgen.spec.mjs`,
`docs/STUDENT_OS_UPGRADE_REPORT.md`.

## Incomplete Work

Remaining Phase 2 and Phase 3 work:

- First-run setup and school-portal import review upgrades (a student onboarding
  overlay already exists; the editable import review table is still pending).
- Stronger Assignment Studio project workspace fields and scheduling remaining work.
- Plan/Fix My Week proposals that respect school schedule and existing timeline blocks.
- Deeper School Schedule setup/Today polish.
- Full universal-search polish beyond the Phase 1 expanded sources.
- Mobile-first capture mode and compact mobile command rail.
- Capped object-level revision history.
- Full design-system pass and remaining visible "Liquid Glass" rename cleanup if any legacy copy remains in older surfaces.

## Known Risks

- The new e2e spec has parser coverage but could not be executed in Chromium because Playwright output cleanup was blocked by the sandbox and escalation was rejected by the usage-limit gate.
- `npm run check:all` could not complete after the new test was added for the same child-spawn sandbox reason. The targeted modified JS files parse cleanly, and a full syntax suite passed earlier before the final test file was added.
- Student Inbox depends on existing Sutra Intelligence signals when available. Base deadline aggregation still works without those signals, but stale-note, conflict, and overload quality follows the current intelligence heuristics.
- Course Hub grade summaries intentionally read Grade Planner data when present and fall back to legacy course-local grade fields when a course has no planner model.
