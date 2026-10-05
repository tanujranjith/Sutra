# Create authoring manual QA — 2026-10-01

## Environment and scope

Manual UI verification was performed in the isolated detached checkout at `D:\Desktop\Engineering\Coding\Active projects\Sutra\.tmp\qa-20261001\create-authoring`, based on `4200e2a` and updated with the approved authoring fixes through `3bd6bf9` (including Canvas timeline persistence, Capture labels, 44 px mobile controls, Review labels/actions, and Timeline/landscape touch sizing). The static server is `node scripts/serve-static.mjs 5282`, running in exec session `81293`; the Chrome tab is `2129982950` at `http://127.0.0.1:5282/Sutra.html#view=notes`. The live tab was left on the isolated workspace for follow-up. No product code was edited during this QA pass.

Three separate manual passes were performed through the visible UI. No automated test suites, browser test runners, builds, installs, provider requests, authentication settings, or lock setup were used. Browser console inspection returned no errors or warnings. Screenshot capture was attempted but the browser screenshot API timed out, so there are no screenshot artifacts.

The isolated workspace contains disposable QA pages created during the checks: `QA Notes Alpha`, `QA Canvas Alpha`, `QA Slides Alpha`, `QA HTML Alpha`, `QA Folder`, `QA Folder Child`, `QA Sheet Alpha`, and `QA PDF Source`. No real user files or external provider data were used.

## Pass 1 — Native host happy paths

The New Page dialog exposed Notes, Canvas, Slides, Sheets, HTML Page, and Folder types, with All, Student Workflows, Planning, Review, Personal, and Blank categories. Folder creation changed the form to a Folder Name field and a Create folder action. I created `QA Folder`, then created `QA Folder Child` with `QA Folder` explicitly selected as Parent Location. The child page displayed the parent breadcrumb. Opening the folder showed the child under Pages here and offered create-inside-folder actions; a spreadsheet created there inherited the folder as its parent.

In Notes, I inserted a rich link to the public example URL `https://example.org/research` and verified the link label and destination text. I then inserted an authored timeline, edited its title and event fields, reordered events, and used Undo/Redo. The existing rich link remained in the note.

In Canvas, I inserted a timeline and reordered events. Before the Canvas fix was cherry-picked, two distinct edit attempts appeared to succeed in the dialog but were absent when the stage was reopened. After applying the approved fix at parent commit `66415fd` (QA cherry-pick `163b8ccd`), I changed the title to `Canvas QA fixed reload pass` and description to `Capture the rubric and outline evidence first.`; the stage showed the edit, Undo/Redo reverted and restored it, reopening showed the saved value, and a page reload retained it.

In Slides, I created a title-slide starter, inserted a timeline, and observed the empty state text `No events yet. Add an event to start your sequence.` before adding events. Reordering and editing updated the stage. Undo/Redo moved between old and new content, presenter mode showed the timeline, and Escape closed presenter mode and returned focus to the editing view. Reload retained the edited timeline.

In HTML Pages, I created a simple HTML starter and inserted a timeline with a long title and literal HTML-looking event text, including `<b>` and `<em>` tags. Preview displayed those strings as text rather than interpreting them as markup. The source wrapper contained encoded timeline data and the preview showed the authored title and event content. I edited the timeline, changed it to horizontal layout, and verified Undo/Redo restored the previous and edited source/model. I also appended `<!-- QA manual note retained -->` through the source editor; it remained after reload. Code, Preview, and Split modes were observed; Split showed source and preview together.

In Sheets, no timeline action was visible in the workbook toolbar or accessibility tree; the timeline host toolbar existed only as hidden DOM. I edited a formula/value draft and used Cancel, which restored the cell to empty. I then applied `42` in A1, added a second sheet, renamed it to `Evidence`, switched back to Sheet1, and verified A1 still displayed `42`.

## Pass 2 — Undo/Redo, reload, and owner navigation

Notes Undo/Redo preserved the rich link while reverting and restoring the authored timeline. Canvas Undo/Redo and reopen/reload preserved the corrected authored timeline after the fix described above. Slides Undo/Redo restored the earlier and revised timelines, and reloading the page retained the revised title and event content. HTML Undo/Redo retained the timeline in source and preview, and reload preserved both the saved timeline and the separately appended source comment.

I navigated away from and back to the Slides and HTML owner pages using the app's Create/navigation UI. Their authored content remained on the owning pages. Folder navigation retained the parent-child relationship, and the spreadsheet remained under the selected folder.

The original Canvas edit failure is recorded as a pre-fix finding; post-fix passes exercised distinct content through stage, reopen, Undo/Redo, and reload. The approved fix reacquires the normalized current Canvas object after preparing undo history, avoiding an update to an orphaned reference.

## Pass 3 — Long content, empty states, cancel, keyboard, and host boundaries

The long HTML timeline title and literal tag-like label/description survived source serialization and preview rendering as text. Slides showed a useful empty timeline message before insertion. In HTML, canceling an unsaved edit left the previously saved timeline unchanged. In the final touch-size check, I opened a new HTML timeline, added one blank event, then explicitly canceled; the dialog closed and the current page still showed the prior saved timeline.

At landscape viewport 844×390 after the final approved touch-size change (`f29804b`, QA commit `3bd6bf9`), the timeline editor's Add event, Cancel, Save timeline, Move up, Move down, and Remove event controls each reported a computed height and client rectangle of 44 px. The empty-event state and its event controls remained readable at this viewport. An earlier 390×844 check found the Create footer's CSS height/min-height at 44 px but a 40.92 px rectangle while its modal ancestor was still at `transform: matrix(0.93, 0, 0, 0.93, 0, 9.3)`. This was the frozen entrance-animation scale in the browser tooling; the parent independently measured settled Folder and Canvas controls at approximately 44 px. Treat the transient measurement as an animation/tooling limitation, not a confirmed touch-target defect.

I attempted to dismiss an HTML timeline edit with Escape using the visible focused field through the browser locator API (`press('Escape')`), and the dialog stayed open in my Chrome session. An explicit Cancel closed it without changing saved source. The root agent separately reproduced the HTML edit in a fresh host, pressed Escape on the focused title field, observed the dialog close, and verified the saved iframe content remained intact. Therefore my Escape observation is an environment-specific discrepancy and is not a confirmed product defect.

The Sheets timeline host remained invisible to users during the visible workbook session; there was no Sheets timeline button to activate. PDF timeline-note behavior was not exercised. Although a synthetic PDF existed in the original candidate checkout, it was not present in this isolated checkout, and I did not find an obvious PDF attach/import path in the visible staged UI. No backup-import workaround or file upload was attempted. The PDF feature contract says the timeline action creates a linked Note rather than changing PDF bytes; that contract remains unverified by this manual run.

## Results and limits

The authored timeline insert/edit/reorder flows worked in Notes, Canvas, Slides, and HTML after the Canvas fix; content persisted through each host's observed undo/reload flow. Sheets exposed no visible timeline control. Folder parent selection and breadcrumbs worked. HTML rendered tag-like text safely, and its source, preview, and split modes retained the authored content. Console inspection returned no errors or warnings.

Not covered: PDF attachment and linked-note creation, workspace-lock lifecycle, Sync/remote applies, backup export/import round-trip, a real mobile device, and post-reload Sheets cell verification. The check was manual UI QA only, not a substitute for persistence, migration, backup, or Sync automated coverage.
