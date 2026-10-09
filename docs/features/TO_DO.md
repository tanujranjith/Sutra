# To-do

To-do is the existing Homework workspace with a clear place for general tasks. Its route remains `homework`, and existing public APIs and storage identifiers remain compatible.

## Categories and capture

- **All** combines homework and general tasks.
- **Homework** contains assignments, tests, quizzes, and review work. Existing records without a recognized general-task kind remain homework.
- **General** contains rows whose existing `kind` is `task` (`general` is accepted as a compatibility alias). These tasks can be created without a class.

The selected category is temporary view state. Summary counts and date tabs describe that category; search, class, status, priority, completion, and due-date filters remain available. Switching categories resets the class filter so a previous class cannot hide unassigned general tasks.

The Class view in All keeps existing classes visible when there are no tasks, including their add and removal actions. Activities alone do not show a ready-class empty state. General retains its own empty task state.

Class groups and extracurricular rows expose **Edit class** and **Edit
activity** actions in their dots menus. The extracurricular menu also contains
**Remove activity**; add-task and schedule shortcuts remain on the row. Activity
deadlines sit below the activity details so the narrow sidebar stays readable.
The Edit actions open the existing Course Hub Settings editor for the
same stable course ID. Homework keeps only its compact course lane; rich details
stay in Course Hub. Renaming updates the linked Homework label while retaining
assignment IDs and relationships. Activities remain Course Hub `activity`
records linked to Homework `misc` lanes. Assignment editing remains a separate
task-level workflow.

On wide desktops, categories and date/class views share a row to leave more room
for tasks. Smaller screens keep the groups separate. Desktop cards and task rows
use tighter spacing; phone and touch controls keep their larger targets.

**Add task** opens the canonical Capture composer with General task selected. **Add homework** opens the same composer with Homework selected; a class may be chosen there. Capture previews the destination before adding the record. The Home quick task form and its top Add task button also create general tasks in this same store. The quick form keeps the submitted text until the local write is confirmed. Class-specific add actions continue to create homework. Extracurricular classes, imports, Assignment Studio, attachment tools, scheduling, and class dashboards remain available.

## By Class history

By Class keeps unfinished assignments due today or later in the main class groups. Undated unfinished assignments remain there too. Unfinished assignments with due dates before today appear in a collapsed **Past-due tasks** section; completed assignments appear in a separate collapsed **Completed tasks** section regardless of due date. Each section keeps its own class grouping and counts only the tasks shown there.

Searching or applying a task filter shows every matching assignment directly in the filtered class groups so a collapsed section cannot hide a result. Completing, reopening, or changing a due date moves the assignment to the section that matches its current state. All Tasks keeps its existing collapsed Completed tasks section.

## Persistence and connected views

Both categories use `SutraHomeworkStore` and `appData.homeworkWorkspace.tasks`. There is no new task database or migration of legacy planner tasks. Existing `hwTasks:v2` mirroring, course links, IDs, completion timestamps, unknown row fields, JSON compatibility schema, full-workspace exports, encrypted backups, and Sync collection projection remain in place. The recognized `kind` value is inventoried in the existing row. Unknown kinds are preserved and displayed as homework.

An explicit Boolean `done` is authoritative for completion. Legacy `completed`
and `status: "done"` values supply the initial completion state only when no
Boolean `done` exists. Their metadata remains portable, but cannot undo a
student's explicit reopening of a task.
Homework JSON imports also retain their historical acceptance of truthy
non-Boolean `done` or `completed` values when no Boolean `done` is present.

Home receives the existing stable `hw_v2_<id>` projection: general tasks use its existing `general` category; schoolwork uses `school`. A projected row and its authoritative To-do record represent one item. Existing standalone planner tasks retain their prior behavior and are not silently migrated or duplicated.

## Completion feedback

A visible task row or Home task card disintegrates from left to right as soon as the canonical action accepts the local completion. Home's replaced completion control signals that handoff without waiting for the homework mirror to catch up. An intact decorative snapshot bridges the synchronous list rerender, with its space restored before the browser paints, so the row does not disappear and reappear or pause while waiting for disk I/O. Its text, badges, and surface break into small dust grains that fall and fade; a removed row leaves temporary space until the dust settles, then the remaining rows move up. Reopening, rejected local actions, and recurring tasks that only advance their next due date discard the snapshot without animating. Save-confirmation callbacks never restart or replay an animation. The effect acknowledges the local action; save confirmation and failures remain visible through canonical persistence health. Homework completion rebuilds its board once, while still notifying connected surfaces immediately. The collapsed Completed tasks section renders its rows when expanded, so finishing an open task does not rebuild hidden history; counts, search results, and the Completed view still include every task.

The visual snapshot is captured before a mouse or keyboard completion click replaces the row. It contains only local colors, text, and Sutra's local icons, stays in memory only while awaiting the local action or animating, and never loads external images or clones interactive controls. Unused snapshots expire after 2.1 seconds. At most three effects run, with up to 1,400 grains each, lasting about 2.13 seconds from the first animation frame: a 1,100 ms sweep, 850 ms fall, and 180 ms collapse. Surface grains blend with the row's ink color so the dust remains visible across themes. Capture uses bounded word measurements, raster pixel budgets, and dust sampling to keep completion responsive; wide or tall visible cards use a scaled snapshot instead of skipping the animation. The decorative canvas and row spacer ignore pointer input and stay out of the accessibility tree. A list refresh or another completion rebuilds removed spacers without cancelling or restarting active effects. Home spacers follow surviving task controls and active spacers to preserve their order. Automatic scroll adjustments during a rerender move the snapshot with its content slot. User wheel, touch, scroll keys, or scrollbar input clears effects, as do navigation, resize, locking, page hide, or hidden visibility. Effects respect system reduced motion and Sutra's motion setting. Completion remains immediate and uses the existing action; animation does not delete task data or own a second completion state. The existing optional time-log card remains skippable.

## Validation

Changes to these workflows should keep category/filter counts, course and task
IDs, reload behavior, legacy import/export, unknown fields, and Home/To-do
projections intact. For completion changes, cover delayed saves, visible save
failures, recurring due dates, reduced motion, rapid actions/navigation, and
keyboard focus. For course editing, cover canonical Course Hub name/details,
Homework lane synchronization, linked assignments and relationships, reload,
and phone-sized dashboard actions. Verify that a populated Course Hub list
keeps its cards readable and every course reachable through scrolling on both
desktop and phone layouts. Run the focused Homework E2E tests and the
relevant unit, portability, backup, or Sync checks for any affected contract.
