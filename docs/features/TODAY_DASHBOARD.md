# Customizable Home dashboard

Home composes existing canonical workspace cards; it does not copy task,
calendar, review, homework, habit, or backup data into a separate dashboard
store. `src/features/workspace/today-dashboard.js` owns only presentation
preferences and reorders the existing DOM nodes after their normal renderers run.

The durable preference lives at `settings.preferences.today.dashboard` and is
therefore included in ordinary workspace persistence, encrypted `.sutra`
backups, restore, and the existing atomic Settings Sync record. Its bounded
contract is:

- `version`: preference schema version.
- `preset`: `calm`, `study`, `everything`, or `custom`.
- `order`: every known widget ID exactly once after normalization.
- `hidden`: a deduplicated allowlist of hidden widget IDs.
- `sizes`: a bounded width choice per widget.

The calm preset keeps the daily loop's Next up, Upcoming Radar, quick task
capture, Priorities, and save-confidence surfaces visible on desktop. Duplicate
deadline and schedule snapshots, secondary signals, and advanced planners remain
available through the Study and Everything presets or Home customization; they
are not deleted. An older saved Calm snapshot migrates to the current
essentials-only composition, while custom layouts retain their explicit choices.
Desktop users can customize from the Home toolbar or More actions menu. The
dedicated phone Home shell remains the canonical compact mobile experience and
is not rearranged by desktop widget preferences.

Reordering uses visible buttons in addition to pointer controls, presets are
real buttons with pressed state, and the modal delegates focus containment,
Escape handling, scroll locking, and focus restoration to `SutraModalManager`.

Deadline Radar can mark tasks, homework, timeline blocks, AP exams, College
essay milestones, and College application tracker, essay, recommender, and
scholarship records done using their existing fields. Final essays and submitted
scholarships no longer appear as open deadlines. Checklist and date-only College
deadlines can be marked individually: each marker stores the completed date in
the existing College tracker row, leaving other deadlines and submission status
unchanged. Open **Completed College deadlines** in the Radar to restore one.
Changing a deadline date makes the new date active again. Markers travel with
College tracker backups and its atomic Sync record; unknown row fields remain.
## Your day panel

The Home left surface presents the existing Next Best Action recommendation as
Focus next. The tasks-today subtitle counts open task/homework deadline records
for the local day, deduplicated by normalized item ID. Also today excludes the
featured record, shows at most three remaining tasks, and offers View all for
additional work. Checkboxes use the existing completion action and day-state
semantics; rendering does not change priorities or deadlines.

Overdue Review opens the existing recovery workflow. Other task and planning
actions remain in More and Planning tools disclosures. The existing confirmed-
save quick-task form now lives inside Your day; captured records remain in
To-do and normal persistence/Sync paths. The old separate Tasks widget is hidden
on Home. No workspace schema or storage identifiers change.

On phones, the daily panel and the existing radar stack within the Home content;
canonical mobile navigation stays intact. Navbar markup, radar renderer/filter,
focus timer, and floating controls are unchanged.
