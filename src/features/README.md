# `src/features/` — feature modules, grouped by domain

Each feature is a self-contained classic `<script>` loaded by `Sutra.html`.
Features communicate through **`window` globals**, never through imports — so a
file's folder is purely an organizational hint, not a module boundary. Canonical
globals have legacy aliases that point at the same object (e.g. `sutraAssistant`
↔ `flowAssistant`); keep both.

## Groups

| Folder | Modules | Responsibility |
|---|---|---|
| `assistant/` | `flow-assistant.js`, `flow-intelligence.js`, `model-capabilities.js` | The Sutra Assistant chat panel + Suggested Actions, the **local** Intelligence signal layer (`deriveStudentContext`), and the provider/model capability registry. |
| `academic/` | `school-schedule.js`, `grade-planner.js`, `assignment-studio.js`, `semester-setup.js`, `planning-engine.js`, `academic-command-center.js`, `command-center.js` | The academic-planning engines: rotating schedule, grade/GPA forecasting, Assignment Studio, Semester Setup importer, planning engine, and the command-center ranking surfaces. Several of these are `require()`-loaded for execution by `scripts/sutra-academic-engines-check.mjs`. |
| `study/` | `ap-study.js`, `review.js`, `homework.js` | AP Study, spaced-repetition Review, and the Homework module (own localStorage source of truth mirrored into `appData`). |
| `customization/` | `customization.js`, `plugin-system.js` | The theme/CSS-override engine and the sandboxed local plugin loader. |
| `workspace/` | `business-workspace.js`, `handwriting.js`, `notifications.js`, `daily-lock-in-quote.js`, `starter-packs.data.js` | Projects & Work, handwriting/drawing, the notification center, the daily quote, and the **Starter Packs** local seed data (`window.SUTRA_STARTER_PACKS`; the preview/apply/undo controller lives in `src/core/app.js`). |

## When adding a feature

1. Put the file in the closest group (or add a new group folder + update this table).
2. Add the `<script src="src/features/<group>/<file>.js?v=…">` to `Sutra.html` in
   the correct **load-order position** (most features load just before `app.js`).
3. If it must be scanned for unsafe sinks, add its path to `SCAN_FILES` in
   `scripts/sutra-guardrails-check.mjs`, then `npm run check:guardrails:update`.
4. Expose any cross-module API on `window` with a clear, namespaced name (the
   guardrail check blocks unregistered globals).
5. Run `npm run check:all` and `npm run check:links`.

> Moving a feature file updates: `Sutra.html`, the guardrail `SCAN_FILES` +
> baseline, possibly `scripts/sutra-academic-engines-check.mjs` (require paths)
> and `scripts/smoke-check.mjs` (content assertions). The link checker catches
> the `Sutra.html` path; `check:all` catches the rest.
