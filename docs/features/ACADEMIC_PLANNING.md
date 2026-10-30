# Academic Planning

Quick Capture asks for a destination when distinct class/activity names match.
Choosing a class, activity, or explicitly choosing no class resolves the prompt;
a more specific nested name (AP Biology versus Biology) keeps its direct match.
Semester Setup excludes metadata labels such as Teacher and Room from course
headers. Application Sheets checkboxes name their field and college, and college
and major Decision Matrix score edits update rankings without replacing inputs,
so Tab and Shift+Tab keep their normal editing order.
Life → Quick Calculator supports keyboard arithmetic, parentheses, Enter to
evaluate, Backspace to correct, and Escape/Delete to clear. It shares the bounded,
CSP-safe arithmetic parser with custom-tab calculators; this API is resolved
when evaluating a user expression, after the existing custom-tabs script loads.

_The semester-planning layer: Semester Setup, Grade Forecasting & GPA, the
Assignment Studio, the rotating School Schedule, and reliable reminders. One
coherent upgrade that reduces setup friction, improves academic decisions, helps
finish complex work, understands the real school day, and makes reminders
dependable — without leaving Sutra's local-first model._

This is a map. For the broader architecture see
[`SUTRA_ARCHITECTURE.md`](../architecture/SUTRA_ARCHITECTURE.md); for persistence see
[`DATA_AND_BACKUPS.md`](../privacy-security/DATA_AND_BACKUPS.md); for the assistant/intelligence
split see [`SUTRA_ASSISTANT.md`](./SUTRA_ASSISTANT.md).

---

## 1. Where the data lives

All new state rides the **existing** persistence and backup pipeline — no new
storage backend, no parallel data model.

| Surface | Canonical store | Travels in backups via |
|---|---|---|
| School schedule | `appData.schoolSchedule` | full `.sutra` / JSON export, Drive sync |
| Grade planner | `appData.gradePlanner` | full `.sutra` / JSON export, Drive sync |
| Semester Setup drafts | `appData.semesterSetup` | full `.sutra` / JSON export, Drive sync |
| Assignment Studio | `task.studio` on each task in the established Homework store | `homeworkWorkspace` in full workspace exports; preserve legacy compatibility |
| Reminder state | `sutraNotifications:v1` (localStorage) | `notificationsState` in the export payload |

The three `appData.*` workspaces are registered in `src/core/app.js` exactly like
every other workspace: declared in `getDefaultAppData()`, merged in
`mergeAppDataDefaults()`, hydrated in `hydrateStateFromAppData()`, written in
`persistAppData()`, serialized in `serializeWorkspace()` (both the encrypted
package and the JSON payload), read back in `deserializeWorkspace()`, and listed
in `docs/architecture/persistence-inventory.json`. The round-trip guard
(`npm run check:roundtrip`) enforces save/export/import parity, so a missing wire
fails CI.

The **module owns the data model**; the **core owns persistence**. Each feature
module reaches its workspace through a thin bridge the core publishes:

```
window.SutraAcademicState = {
  getSchoolSchedule / setSchoolSchedule,
  getGradePlanner   / setGradePlanner,
  getSemesterSetup  / setSemesterSetup
}
```

Every setter calls `persistAppData()`, so a module never touches IndexedDB or the
export path directly. If a module fails to load, the core's `*Safe()` wrappers
fall back to inert defaults, and imports stay lossless.

---

## 2. Deterministic engines (no AI, no DOM)

Each module splits a **pure engine** from its **browser UI**. The engines export
under `module.exports` for Node and are executed by
`scripts/sutra-academic-engines-check.mjs` (`npm run check:academic`, part of
`check:all`):

- **`school-schedule.js`** — `resolveDayInfo(ws, dateKey)` is the heart: it walks
  the rotation from the anchor counting **school days only** (weekends and, when
  configured, holidays don't consume a cycle day), applies overrides
  (holiday / special / early-dismissal / forced-label), resolves the bell
  schedule and per-period class mapping, and returns periods with minute
  windows. `getBusyWindowsForDate` / `getStudyWindowsForDate` feed planning.
- **`grade-planner.js`** — `computeCourseGrade` (weighted categories or pooled
  points, drop-lowest, missing-as-zero, excused/pending excluded),
  `scoreNeededForTarget` (exact affine solve for "what do I need on the final"),
  `whatIfScore`, `rankImpact` (which missing/pending item moves the grade most),
  and `computeGpa` (weighted/unweighted with honors/AP boosts). Per-course
  credit weights accept 0.5 through 8 credits, preserving legitimate 4- and
  5-credit courses while bounding malformed imports.
- **`semester-setup.js`** — `parseSourceText` / `parseIcsSource` extract courses,
  teachers, grading weights, assignments, exams, recurring meetings, and
  no-school days from free text and calendars, with date/time/day-token parsing
  and confidence scoring.
- **`assignment-studio.js`** — `normalizeStudio` / `computeProgress` (milestones
  weighted double vs. subtasks).
- **`planning-engine.js`** — plans from all open canonical Tasks and Homework due
  by the end of the selected preview, including overdue work. It preserves
  task/homework source IDs and skips items already linked to Timeline blocks;
  intelligence summaries remain attention signals rather than planning inputs.
  Browser previews trim today's free windows to the next available minute.
  Future days retain their full working hours. If a suggested start passes while
  the preview stays open, Add refuses that block and asks for a fresh plan.

Because the engines are deterministic and tested in isolation, the academic
*decisions* never depend on a model being available, online, or correct.

---

## 3. Privacy & AI boundary

- **Local-first by default.** Semester Setup parses every paste and file on the
  device first; that path makes zero network requests.
- **No silent AI.** The optional "Improve with AI" button is per-draft, routes
  through the single intelligence core
  (`window.SutraIntelligenceBridge.extractStructured` →
  `performIntelligenceRequest`), and triggers the same explicit send-disclosure
  modal as every other AI feature. The provider is the one the user already
  configured; API keys are session-only by default, or encrypted in the optional
  device-local credential vault, and are never exported.
- **No silent writes.** Nothing reaches the workspace until the user approves it
  on the review screen. Applied imports are logged to Assistant Activity.
- **Deterministic stays separate from interpretation.** Grades are computed by
  the engine; the assistant may *explain* a result but never produces the number.
- **Saved scores keep their categories.** Semester Setup reuses a category's ID
  when its name uniquely matches an existing category. Categories with scores
  survive an unmatched or ambiguous replacement and remain available for review
  in Course Hub → Grades. Explicit IDs support category renames.
- Application Sheets binds its tabs, Add Row, and editing controls within the
  current College workspace. Task details can edit Homework notes and Reference
  URL; these write through to the existing canonical Homework row (`notes` and
  `sourceUrl`) and its compatibility mirrors rather than a separate task copy.
- SAT/ACT cards format date-only values in local calendar time. Blank essay word
  targets remain unspecified. College and major rankings exclude entries with
  no positive score on a weighted criterion, including legacy all-zero defaults.

---

## 4. How the five features connect to existing systems

```
Semester Setup ──approve──► Course Hub (courses, schedules, files)
                          ├► Homework (assignments + exams)
                          ├► Grade Planner (category weights)
                          ├► Timeline (one-off events)
                          └► School Schedule (no-school overrides)

School Schedule ──► Today (school-day strip)
                 ├► getBusyWindowsForDateKey ─► Shape My Day / auto-block
                 ├► Sutra Intelligence (schoolDay signal)
                 └► Notifications (class reminders)

Grade Planner ──► Course Hub Grades tab  ──writes-through──► course.currentGrade

Assignment Studio ──► task.studio on homework
                   ├► collectWorkspaceDeadlines (milestone source) ─► All Due / Radar / Notifications
                   ├► Timeline (schedule remaining milestones)
                   ├► Notes / Canvas / Course files (linked work)
                   └► Sutra Assistant (add_assignment_milestones action)

Notifications ──► OS notifications (while open) · missed-replay · digest · .ics handoff
```

No new top-level tabs were added. Course Hub gains a Semester Setup entry point
and an upgraded Grades tab; Today gains one compact school-day strip; Homework
assignments gain a Studio. Everything else extends a surface that already exists.

---

## 5. Unified Academic Command Center

Course Hub now starts with a read-only command center built by
`src/features/academic/academic-command-center.js`. It consumes the existing Course Hub,
Homework, Grade Planner, School Schedule, Review, AP Study, Notes, files, and
Timeline stores; it does not persist a parallel model.

The deterministic ranking engine scores open work using due status, priority,
difficulty, grade risk, and whether the work is already scheduled. Review debt
and low-confidence AP subjects can also enter the ranked list. Students get one
top recommendation, a short explained ranking, and direct Open, Schedule, and
Focus actions. The engine is covered by `npm run check:academic` and focused
Playwright tests.

## 6. Platform limits (stated honestly)

Sutra is local-first with no server, which constrains background behavior. The
notification Settings panel says this plainly:

- Reminders fire **while Sutra is open** (in-app toasts, and OS notifications if
  the user grants permission).
- Browsers do not let a page run in the background, so anything that "fires"
  while the tab is closed is **replayed on reopen** rather than delivered live.
- OS notifications are unavailable when Sutra is opened directly from a `file://`
  path.
- For alerts that must arrive when the browser is closed, **export reminders to a
  device calendar** (`.ics` with `VALARM` alarms) — that hands delivery to an app
  that *can* run in the background.
- Calendar **subscriptions** cache the last successful import locally and keep
  working offline; a direct-URL refresh is often blocked by Sutra's strict CSP
  allowlist, so a file-based re-import is always offered as the reliable path.

---

## 7. Tests

- `npm run check:academic` — executes all four engines in Node (rotation math,
  grade math, syllabus extraction, studio progress).
- `tests/unit/planning-engine.test.mjs` — covers the weekly due-date boundary,
  day-five medium-priority work, source-typed Timeline links, completed/deleted
  rows, and planner capacity.
- `tests/e2e/academic-upgrade.spec.mjs` — registration + export round-trip,
  reload persistence, rotation/holiday/study-windows, the Grade Planner UI and
  scenario solver, the Semester Setup local-extract-and-approve path, Studio
  milestone persistence + deadline surfacing + modal a11y, and the Today strip /
  reminder surfaces.
- The shared modal class `.sutra-academic-modal` is registered in
  `SutraModalManager`'s `modalSelector`, so the academic modals inherit the
  focus trap, scroll lock, Escape handling, and focus restoration the
  modal-accessibility guard checks.

## Official exam completion and results

Exam cards distinguish **Upcoming**, **Taken · results pending**, and **Result
recorded**. Mark taken when a sitting is finished; this removes that exam from
automatic upcoming/diagnostic study recommendations. Use **Record official
result** on the card to save its taken date and score or result text. Cancel
leaves both untouched. Practice tests, current/readiness scores, and completed
practice forms stay separate and never imply an official result.

The existing one-date-per-exam model remains: this records one current official
result per exam card, not a history of multiple sittings. Mark not taken reopens
prep without deleting the saved result. A result is shown as current only while
its date matches the taken-date marker; a later sitting stays result-pending.
The prior result remains visible as a dated saved result, including in the AP
overview. Recording another result replaces that card's saved result; multiple
sittings need separate exam cards.
Assistant status actions and Undo preserve the original taken date and do not
change the result. Unknown result fields survive normalization, backup/import,
and the existing atomic Testing Hub Sync record.
