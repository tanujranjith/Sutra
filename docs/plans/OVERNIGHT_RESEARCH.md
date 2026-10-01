# Overnight implementation research

Research baseline: `84cbbdf8` (main). Candidate: `codex/overnight-improvements`, created by the prescribed core-worktree command from a separate clean main checkout. The original dirty main checkout and the user's edits remain untouched. The candidate contains the plan commit and copies of the current repository instructions; those instruction copies are excluded from task commits.

This records source inspection, documentation/history review, and a sequential manual browser baseline. It does **not** report automated test results. No suites, self-tests, automated browser tests, dependency installs, or builds were run.

## Shared architecture and dependencies

`Sutra.html` loads classic scripts into a shared global scope. Core data and editor adapters belong to `src/core/app.js`; new feature controllers should use small explicit seams, existing global registration, and the established script/style order. A byte-identical recovery copy of app.js is saved in ignored `.tmp/recovery/app.before-overnight.js` before edits. Required hooks remain enabled; the direct static runtime check is permitted, while aggregate self-tests and integration are deferred.

Pages live in `appData.pages`, homework in the canonical `homeworkWorkspace` store with its legacy mirrors, and attachment bytes in the existing separate IndexedDB. Canvas, Slides, Sheets, and HTML Pages already live on ordinary page records. UI state, selections, open inspectors, and miniature-player visibility should remain session state. Unknown fields must survive normalization.

Read contracts: current AGENTS, architecture, affected subsystem contracts, Modern Notes Editor, Navigation, Mobile Nav Upgrades, design system, Canvas And Timed Habits, Slides, Sheets, HTML Pages, PDF Workspace, Sutra Assistant, Data And Backups, cloud providers, and the relevant source and test contracts. Recent history includes the editor/Homework wrapping fixes and shared cloud hub work; those behaviors are baseline contracts to preserve.

## Numbered tasks

### #1 — Foreground backup feedback

The password dialog disables duplicate submission, then calls `performEncryptedSutraWorkspaceExport`; the operation currently exposes only toasts/button busy state. `buildCanonicalSutraPackageBytes` saves the editor, flushes canonical persistence, warms attachment bytes, refuses missing required blobs, strips sensitive settings, packages the snapshot, and returns bytes. `createEncryptedSutraBackupBlob` encrypts them. Provider and safety-snapshot callers reuse these paths.

Use operation-scoped progress callbacks for actual stages: save, collect/check files, package, encrypt, and deliver/upload. Show a large accessible overlay only for foreground operations, preserve password/destination dialogs and cancellation before starting, and clean up in `finally`. Do not invent percentages. Browser-download dispatch is not confirmation that the file was saved; folder-write confirmation is stronger. Background scheduled backups and Sync must remain unobtrusive and independently usable. Existing encrypted-backup, automatic-backup, completeness, and confidence tests are relevant but deferred.

### #6 — Rich, editable links

The classic insert-link path currently prompts for a destination and inserts an ordinary anchor. Modern Notes has a link mark and delegates the shared toolbar action. Links already survive HTML serialization; changing the label must leave the destination intact. A touch/keyboard-clickable preview card should show title, destination, optional cached thumbnail, explicit Open, Rename/Edit, and Remove link actions. Keep safe plain anchors as fallback.

Google Docs documents separate display text and destination editing, and previews for supported linked documents. Its smart chips offer contextual information on click/hover. This supports the requested interaction; it does not establish that a static client can read every public website. [Google links and bookmarks](https://support.google.com/docs/answer/45893?co=GENIE.Platform%3DDesktop&hl=en-GB), [Google smart chips](https://support.google.com/docs/answer/10710316?hl=en).

There is no existing general metadata service. Current CSP intentionally restricts network/image origins. Cross-origin HTML requires the target's CORS permission; opaque `no-cors` responses cannot supply titles. A public undisclosed proxy or wildcard CSP would violate the product contract. [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

Implementation decision: keep metadata disabled by default; reuse labels from rich clipboard content offline. Offer explicit session opt-in to a user-started local metadata helper, allowed by the existing loopback CSP, with a clear URL/thumbnail disclosure. The helper must bind only to loopback, require a configured caller origin, reject private/internal destinations and credentials, bound requests/redirects/body sizes, and validate every resolved destination. The browser receives safe title text and a local thumbnail data URL. No helper starts automatically and no startup requests occur. Fetch only after an explicit insertion or refresh while enabled, never scan restored notes. Preserve custom labels and discard stale responses. Document setup and honest offline/service-unavailable behavior.

### #7 — Inline AI and mid-sentence slash commands

Modern Notes currently recognizes only a whole paragraph matching `/letters`, with the caret at its end; choosing a command deletes from paragraph start. Extending this without a precise trigger range would destroy preceding text. The editor has independent instances for split view and live structured NodeViews.

Recognize a slash after a text boundary at the caret, excluding code, URL segments, non-empty selections and IME composition. Track the exact slash range; delete only that segment. Add an inline Assistant item that captures page/editor identity and surrounding text, then asks for an instruction and presents a reviewable result. Use the existing `SutraIntelligenceBridge`/`performIntelligenceRequest`, privacy disclosure, configured provider, timeout, and request cancellation. A narrow extension can expose cancellation hooks for the existing structured request and return a bounded text result in JSON. No API keys or duplicate provider logic enter the editor. Require explicit insert/replace, preserve undo, and reject changed/locked/switched editor contexts.

Notion uses slash menus for block commands and an Ask AI entry. This is an interaction reference, not permission to send workspace content automatically. [Notion writing basics](https://www.notion.com/help/writing-and-editing-basics), [Notion slash-command guide](https://www.notion.com/en-gb/help/guides/using-slash-commands).

### #8 — Tags

Manual baseline: an ordinary fresh page successfully added `Research`, displayed its chip, and retained it after reload and reopening Create. No console errors were observed in that flow. The broad report therefore is not reproduced by ordinary text input alone.

Source inspection found real fragile paths: tag normalization accepts an object with any truthy `name`, but duplicate detection blindly calls `name.toLowerCase`; imported non-string names can break adding. String-form legacy tags are discarded. The transient input is not bound to its originating page, has no accessible label or composition guard, and add/remove do not enforce the page-content authorization gate. Repeated openings can create duplicate input wrappers. Repair those paths through the existing tag store/render/save functions; normalize without losing unknown object fields, and preserve existing search consumers. Do not introduce another tags store. Manually verify add, duplicate, Escape, remove, switch, and reload; import/backup suite coverage remains deferred.

### #9 — To-do, Homework, and general tasks

Luna's source-backed research confirms `SutraHomeworkStore` owns all records and legacy adapters mirror them. Course types are class/misc. Current task kinds are assignment/test/quiz/review; unknown kinds collapse to assignment. Unassigned course IDs exist, but the inline composer currently demands a course, so this is not yet a clear general-task workflow.

Recognize a bounded general `task` kind on the same canonical row, add explicit All/Homework/General task category controls and course-optional creation, and preserve assignment kinds/class relations. Update the Home projection so general tasks remain recognizable, while retaining one connected mirror per row. Rename user-facing workspace labels, navigation, accessible names, help, and section settings to To-do; keep Homework for the school category. Retain all legacy keys and public compatibility APIs. Relevant existing Homework store, composer, UX, course merging, and Home completion coverage was inspected, not executed.

### #10 — Completion effect

Homework has `toggleTaskDone`, `markTaskDone`, and `setTaskDone`; Home has a separate adapter path for mirrored rows. The recurring-task branch advances the due date without setting done, so a true API return alone cannot authorize an effect. Trigger only after an actual successful false-to-true transition. Capture a transient visual before rendering removes the row, then animate a small bounded number of inert particles without delaying saves or stealing focus. Reopening does not animate. Honor both `appSettings.motionEnabled` and system reduced motion; cap rapid repeated effects and clean up after navigation. Existing aggregate daily celebration remains separate.

### #11 — Icons

Homework's fixed 16-icon registry, whitelist, persisted `course.icon`, and existing picker can be extended safely with constrained emoji text. The picker currently appears only for misc activities; ordinary class panels need the same affordance. Keep fixed icon defaults and tests' `robot` option. Never accept arbitrary HTML, CSS class strings, or remote images.

Help's existing `page.icon` is already durable, but sidebar customization is blocked for system pages and `applyHelpPageFields` resets the icon every reconciliation. Expose only the icon action for Help and preserve a valid custom icon while retaining the Books fallback. Keep systemRole, builtInId, stable per-space ID, title/content reconciliation, deduplication, and first position intact. Relevant course-icon and Help identity/import fixtures were inspected.

### #13 — Custom content timelines

This is an authored sequence of arbitrary events, not scheduling data. Use one versioned model with stable event IDs, title, orientation/style, ordered events, label/time text, and description. Preserve unknown fields and explicit ordering; do not parse arbitrary labels into calendar records. Build a safe text-only renderer and one accessible event editor with add/remove/move controls, Cancel, and explicit Save.

| Host | Representation and editing/persistence seam |
|---|---|
| Notes (classic/modern/split) | Dedicated `page.blocks` timeline type and anchor; extend the existing structured-block bridge and NodeView schema, extraction, copy/ID normalization, and safe serialization. Provide native editing and a readable export fallback. |
| Canvas | Structured `timeline` object on the existing board; extend the object whitelist/normalizer/renderer and canonical mutation/undo path. Geometry and grouping stay with the object. |
| Slides | Structured timeline element on the existing slide; extend element normalization/rendering/insertion/inspector and existing mutation history. Preserve text fallback for exports that lack native rendering. |
| HTML Page | Local inert component with embedded model and readable semantic HTML; insert/update source through the existing authorized source save path. Preview remains in the offline sandbox. |
| Contextual PDF | Editable timeline annotation associated with a document/page and normalized geometry, if supported without modifying original bytes; otherwise a clearly linked timeline note is the safe integration. Establish the final adapter before claiming PDF-native support. |
| Folders | Organization only: can contain a timeline-bearing page; no fake document editor. |
| Sheets | Explicitly excluded from timeline insertion; included in separate usability polish. |

Inventory the new nested durable fields and host schemas. Trace reload/import/export/encrypted packaging/Sync projection and fallback behavior. No new top-level workspace collection is needed. Inspect existing editor, Canvas, Slides, PDF, serialization and unknown-field tests without executing them. Authoring reference: [Canva timeline guide](https://www.canva.com/online-whiteboard/timeline-chart/) supports editable labeled events and readable sequence; accessible move controls must accompany any drag interaction.

### #15 — Timer miniature player

The existing Home timer controller already sends `sutra:focus-timer-command` and consumes `sutra:focus-timer-updated`; core owns the clock and persistence. Extend that presentation controller with a player showing time, pause/resume, full Focus, and dismiss. Show running/paused sessions across screens, suppress under the full Focus overlay, retain an explicit restore affordance when dismissed, and hide idle/completed state appropriately. No new interval or durable timer fields. Coordinate space with mobile navigation/keyboard and overlays, with quiet time announcements. Canonical timer unification contract tests were read.

### #17 — Mobile design and overlay system

Manual baseline used one fresh loopback origin and one browser. At 390 × 844, Home already has a mobile essentials renderer; preserve its canonical actions and enrich missing task context/focus access. Other workspaces still have the fixed Save/Export/Import/Cloud strip and report button competing with content. Canvas has a narrow icon-only scroller and a minimap overlapping its empty state; Slides shows the speaker notes, thumbnails, and full Design inspector in a long competing stack; Sheets has a very long horizontal tool strip and limited visible cell context. At 1280 × 900, Canvas and Slides preserve usable wide layouts, but controls and hierarchy need the separate Create polish. These are actual rendered observations, not claims about all devices.

Improve the established mobile layer and tokens. Reuse canonical five-item navigation and More sheet. Move persistence actions into a compact status button and a sheet/menu that invokes the existing controls; keep all actions available. Put feedback in More on phones. Reserve one coordinated bottom-chrome region for navigation and timer, adapt to visual viewport/keyboard, and hide transient players beneath modal layers. Use shared spacing/touch/scroll primitives, not repeated arbitrary offsets or document-level overflow masking.

Timeline's current phone Week remains a seven-column time grid. Render a selected-date strip and readable agenda from existing blocks; preserve Day/Week/Month/date/Today/edit actions. Settings already has categories/search and Review already has alternate views; improve those presentations through existing structure. Protected-page actions must keep Unlock primary, duress secondary, permanent removal separate, with all warnings intact.

Keyboard can shrink the visual viewport without shrinking the layout viewport, so anchored menus/player/sheets must account for the available visual area. [MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport), [MDN safe-area env](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env). Modals must contain focus and restore it when dismissed; reuse Sutra's modal manager. [W3C modal-dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

Final sequential inspection must cover 360/375/390/393/414/430 widths, landscape, representative long/empty/populated/error states, and desktop. No physical iOS/Android or native keyboard behavior has been verified; do not claim otherwise.

## Concrete Create audit and delivery checklist

| Surface | Findings and prioritized changes | Canonical behavior to retain |
|---|---|---|
| Shared creation | Type selection for Slides/Sheets immediately creates a page, observed in UI. Unify all types under explicit Create confirmation so title/location can be completed. Put type choice before note-template inventory; add descriptions and type-specific starter choices. | Parent/space authorization, linked-task preview, no unintended creation on cancellation. |
| Canvas | Existing geometry/workbench supports fit, grouping, arrangement and locks; discoverability is weak. Add labeled primary insert controls/overflow for secondary tools, actionable empty starters, clearer selected-object inspector, minimap placement, touch/pan hints, and fit access. | Existing object IDs, linked-note authorization, immutable locked objects, undo, viewport and exports. |
| Slides | Dead-looking Notepad/Canvas labels resemble tabs but are not actions; insertion, deck and object actions share a flat toolbar. Add page/deck context, insertion groups, slide navigation/reorder/duplicate/delete controls distinct from object operations, collapsible Design/speaker-notes panels and selection guidance. | Normalized deck, local image assets, slide/element history, presentation, honest PPTX/PDF warnings. |
| Sheets | Thirty-plus actions compete in a scroller. Group Format/Data/Structure/File controls in accessible disclosure panels while keeping formula/name/commit controls visible. Improve range feedback, formula examples/help, sheet rename/navigation, and selected-value editing with explicit apply/cancel on phones. | Pure formula engine, stable row/column IDs, sparse cells, clipboard/import/export, lock gate, workbook undo. |
| HTML Pages | Source/preview control exists, but editing and import status are sparse. Add useful starter choices, source/preview/split control, explicit preview refresh/loading/error feedback, source size/status and portable source export. Preserve authored source during errors. | 4 MB bound, approved active-local sandbox, no network/popups/parent access, stale-page saves rejected, clear content when locked. |
| Folders | Sidebar supports hierarchy, but folder opening lacks a strong organization workspace. Provide a child-page list with types, breadcrumbs, clear add/move actions and a useful empty state. | Existing parent/title compatibility, move validation/cycle prevention, child IDs, no editor content for folders. |
| PDF/document | Existing tool groups, thumbnails, outline/comments, organizer and honest export modes are substantial. Improve fit/page navigation, contextual selection/tool disclosure, inspector/thumbnail toggles, phone toolbar layout, and clear save/export status. | Original attachment bytes, normalized rotated coordinates, async teardown, annotation history, signed-document warnings and source-byte verification. |

## Ownership and next action

All requested areas now have a researched approach. Implementation may begin; additional host-specific tracing remains necessary immediately before editing a complex seam.

1. Luna xhigh: bounded timer presentation in `today-focus-timer.js` and its existing feature stylesheet; no core edits or commits. Primary owns integration and three reviews.
2. Primary: tags and foreground backup progress core seams, shared shell integration, then To-do/editor/timeline/host work. No worker edits app.js.
3. Subsequent Luna assignment: completion feedback, then icon picker, sequentially with explicit file ownership. Review each before another overlapping assignment.

Research review records (primary, October 1): pass 1 checked findings against source/API ownership and the observed browser states; pass 2 checked data/privacy/authorization and distinguished inference/unverified behavior; pass 3 reread this artifact and the plan together, checked source links and scope matrix. Deferred runtime suites and physical devices remain listed, rather than represented as passed.
