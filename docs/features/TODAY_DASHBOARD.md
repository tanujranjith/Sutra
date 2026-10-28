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
## Restrained task and radar layout

Home uses a 40/60 task/radar layout on desktop and stacks the same canonical
controls on phones. Next Up retains the existing ranking policy; completion
uses the existing deadline mutation path. Additional actions remain in the
Next Up menu and Planning tools disclosure. Today's tasks groups overdue,
upcoming, and undated captured work inline without creating another store.

Radar markers and the chronological Upcoming agenda share the canonical
normalized deadline source and selected category filter. Markers retain fixed
time bands, bounded density, overflow access, and source-opening callbacks.
Hover or keyboard focus reveals item details. The agenda is titled Upcoming
because it may include dates beyond seven days. The focus panel continues to
use the canonical timer command/update bridge.
