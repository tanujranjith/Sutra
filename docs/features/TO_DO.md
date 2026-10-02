# To-do

To-do is the existing Homework workspace with a clear place for general tasks. Its route remains `homework`, and existing public APIs and storage identifiers remain compatible.

## Categories and capture

- **All** combines homework and general tasks.
- **Homework** contains assignments, tests, quizzes, and review work. Existing records without a recognized general-task kind remain homework.
- **General** contains rows whose existing `kind` is `task` (`general` is accepted as a compatibility alias). These tasks can be created without a class.

The selected category is temporary view state. Summary counts and date tabs describe that category; search, class, status, priority, completion, and due-date filters remain available. Switching categories resets the class filter so a previous class cannot hide unassigned general tasks.

On wide desktops, categories and date/class views share a row to leave more room
for tasks. Smaller screens keep the groups separate. Desktop cards and task rows
use tighter spacing; phone and touch controls keep their larger targets.

**Add task** opens the canonical Capture composer with General task selected. **Add homework** opens the same composer with Homework selected; a class may be chosen there. Capture previews the destination before adding the record. The Home quick task form and its top Add task button also create general tasks in this same store. The quick form keeps the submitted text until the local write is confirmed. Class-specific add actions continue to create homework. Extracurricular classes, imports, Assignment Studio, attachment tools, scheduling, and class dashboards remain available.

## Persistence and connected views

Both categories use `SutraHomeworkStore` and `appData.homeworkWorkspace.tasks`. There is no new task database or migration of legacy planner tasks. Existing `hwTasks:v2` mirroring, course links, IDs, completion timestamps, unknown row fields, JSON compatibility schema, full-workspace exports, encrypted backups, and Sync collection projection remain in place. The recognized `kind` value is inventoried in the existing row. Unknown kinds are preserved and displayed as homework.

Home receives the existing stable `hw_v2_<id>` projection: general tasks use its existing `general` category; schoolwork uses `school`. A projected row and its authoritative To-do record represent one item. Existing standalone planner tasks retain their prior behavior and are not silently migrated or duplicated.

## Completion feedback

A visible task row or Home task card disintegrates from left to right after a confirmed completion. An intact decorative snapshot holds the row on screen during the save, with its space restored before the list rerender paints, so the row does not disappear and reappear before the dust starts. Its text, badges, and surface then break into small dust grains that fall and fade; a removed To-do row leaves temporary space until the dust settles, then the remaining rows move up. Dust waits for the canonical persistence promise/readback, rechecks the current completion, and skips late responses, hidden anchors, and changed views. Reopening, cancelled clicks, and recurring tasks that only advance their next due date discard the snapshot without animating. Failed or unconfirmed saves expire the snapshot without playing dust.

The visual snapshot is captured before a mouse or keyboard completion click replaces the row. It contains only local colors, text, and Sutra's local icons, stays in memory only while awaiting confirmation or animating, and never loads external images or clones interactive controls. Unused snapshots expire after 2.1 seconds. At most three effects run, with up to 1,400 grains each, lasting about 2.1 seconds. Surface grains blend with the row's ink color so the dust remains visible across themes. Capture uses bounded word measurements and dust sampling to keep completion responsive. The decorative canvas and row spacer ignore pointer input and stay out of the accessibility tree. They clear on navigation, scrolling, resize, locking, page hide, or hidden visibility, and respect system reduced motion and Sutra's motion setting. Completion remains immediate and uses the existing action; animation does not delete task data or own a second completion state. The existing optional time-log card remains skippable.

## Validation handoff

Automated tests, self-tests, and integration/portability suites are deferred under the overnight run's no-local-tests instruction. Before integration, verify category creation/filter counts, reload, legacy import/export and unknown fields, encrypted backup/restore and Sync, completion/reopening from Home and To-do, failed-save suppression, recurring due-date behavior, reduced motion, rapid actions/navigation, and phone/desktop keyboard focus.
