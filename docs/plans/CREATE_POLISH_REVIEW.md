# Create polish review — 2026-10-03

Working branch: `codex/backup-schedule-choice`. User preview: `http://127.0.0.1:5280/Sutra.html`; disposable manual-QA workspace: port 5290. Main was not merged, and nothing was pushed or deployed.

## Review method

The primary agent manually reviewed the changes in three passes: implementation/data flow, lifecycle and regression edges, then the integrated diff and observed browser behavior. Luna xhigh agents supplied scoped implementation and additional reviews; their reports were not treated as proof of browser success. Follow-up fixes received focused re-review.

No automated test suites, installs, builds, or deployment checks were run, per the resource constraint. Lightweight syntax, static runtime integrity (27 assertions), architecture guardrails, asset manifest, cache-stamp, and whitespace checks passed. Added regression test definitions remain unexecuted.

## Delivered queue and evidence

| Item | Implementation and observed checks |
| --- | --- |
| Daily backup time | Local HH:mm schedule, next-occurrence semantics, missed-slot catch-up, one canonical timer, cross-tab lock, and distinct unchanged-work receipt. Reviewed migration, device-local metadata, export/Sync exclusions, and edit-during-upload guards. Connected-provider scheduling was not exercised. |
| Optional restore safety export | Yes opens encrypted export, No continues without an external file, Cancel keeps current data. Final writer-lock/revision guard protects changes made during the dialogs and after snapshot capture. Reviewed every branch; native file picker was not exposed by the browser tool, so end-to-end restore is a user follow-up. |
| Timeline toolbar | Notes insertion and reload checked; Slides inserted a timeline object; Canvas and HTML toolbar entries opened the correct dialog and cancelled cleanly. Sheets excludes this tool. |
| Link popup | Anchored copy/edit/remove controls checked. Edited label persisted in editor; removing the link kept its text. Fixed missing source-anchor wiring in rich-link NodeViews. |
| Slash commands | Down/up scrolling checked; first-to-last and last-to-first wrap kept selected item inside menu bounds; Enter opened Link; Escape dismissed. |
| Inline AI | Right Assistant panel opened, Back to chat restored existing chat UI, and Close worked. Draft generation was not sent: automatic approval review rejected provider transmission and explicit approval was requested. |
| Slides polish | Five-slide template, readable title/subtitle, thumbnails, text editing with Backspace, zoom/Fit, slide switching, reload persistence, presenter and ArrowRight navigation checked. Responsive/coarse-pointer CSS reviewed; physical phone, export round trips, and native fullscreen were not checked. |
| Canvas text/resize | Text and sticky edits survived selection changes, zoom, native drag resize, and reload. Empty sticky remained an object. |
| Canvas deletion/isolation | Typing Backspace did not delete an object; selected Canvas objects survived navigating to Home and pressing Delete. Lock guards reviewed. |
| Canvas note previews | Inserted note card displayed its opening lines; dragging retained preview. Authorization redaction source reviewed. |
| Slides templates | Title/Blank/Class presentation/Research report/Project pitch catalog reviewed; Class presentation created five editable slides and persisted after reload. |
| Sheets templates | Blank/Study tracker/Assignment tracker/Grade calculator/Study planner catalog reviewed. Grade calculator created successfully; fixed eager-IF division errors using supported IFERROR. Blank scores stayed blank, 18/20 gave 90%, 0/20 gave 0%. |
| Sheets polish | Compact toolbar/formula row, editable cells, formula commit, reload persistence checked. Fixed initial seven-row rendering with measured viewport/ResizeObserver; new workbook immediately rendered a full viewport (21 rows including overscan). Responsive menu containment and touch targets reviewed. |
| Browser miniplayer | Uses Document Picture-in-Picture, canonical timer commands and ranked tasks, five-second refresh while open even paused, and close-on-lock/navigation. Home Start/Pause and launch were exercised with one disposable task; tool could not inspect the separate floating window, so its visual/control behavior needs a normal supported-browser check. |
| HTML compact toolbar | Compact mode group, icon history controls and three-dot secondary menu checked, including Escape/refresh and no desktop document overflow. Embedded page contents were not rewritten. |

## Primary-review follow-up fixes

- Preserved Canvas text against stale object closures; guarded all typing targets and inactive canvases.
- Preserved link labels on unlink; anchored rich-link NodeView popup correctly.
- Fixed Sheets alignment control mounting, menu dismissal, and initial viewport sizing.
- Kept Slides keyboard commands out of fields/buttons and fitted long text within object geometry.
- Made presenter height fit short windows; retained 44px coarse-pointer controls.
- Fixed timeline menu first-click owner-change race and inline AI bridge opening.
- Protected manual restore against local and cross-tab writes during async review/export.
- Kept auto-backup check receipt on current metadata after asynchronous hashing.

## Remaining hands-on checks

1. Daily backup time and optional restore safety export were verified by the user on 2026-10-04, along with the timeline toolbar.
2. Open Miniplayer in a browser with Document Picture-in-Picture support, switch to another app, pause/resume, and change tasks while paused.
3. Optional: connect the intended AI provider and generate/apply a draft, plus a phone/touch and Office export round-trip pass.

Manual screenshots are local ignored artifacts under `.tmp/qa/`: `html-toolbar.png`, `canvas-preserved-text.png`, `link-popup.png`, `inline-ai-panel.png`, `slides-editor.png`, and `sheets-template.png`.

## Pasted-link follow-up — 2026-10-04

The user reopened item 4: newly pasted links required an unchanged Edit/Save
before the popup appeared. Ordinary Tiptap link marks lacked the rich-link
NodeView activation handler. A scoped authoring extension now routes native
link clicks to the same local popup, captures the exact marked range, and uses
guarded native transactions for editing and unlinking. No data fields or
storage paths changed. A new label inherits the first run's formatting;
address-only edits and unlink retain every existing run.

Manual QA on port 5290 reproduced the missing popup before refresh, then
verified a fresh plain-text URL paste with immediate popup, an existing pasted
link after reload, copy, address/label edits, unlink preserving text, Undo/Redo,
mixed bold/italic HTML links and neighboring-link isolation, and popup cleanup
on page switching. The primary agent reviewed the implementation in three
passes; Luna supplied an additional read-only review. Screenshot:
`.tmp/qa/fresh-paste-popup.png`. Keyboard activation of a native editor anchor
could not be exercised through the browser locator, so that check remains
unverified. Automated suites and builds remain unrun under the resource
constraint.

JavaScript syntax, architecture guardrails, the unchanged core's 27 static
integrity assertions, generated asset manifest, cache-stamp freshness, and
whitespace checks passed for this follow-up.

## Assistant commands and Slides manipulation — 2026-10-04

The user verified slash-menu scrolling (item 5), then reopened items 6 and 7.
Modern Notes now lists **Sutra Assistant writing help** (including the /ai
search alias) and **Sutra Assistant general help**. General help closes an open
writing workspace, opens ordinary chat without sending, preserves the composer
draft, and removes only the captured slash query through an owner-checked
transaction. Classic Notes has corresponding panel-opening commands; its
writing command prepopulates an empty composer with a writing prompt.

Slides separates object selection from text editing: click/tap to select and
drag, double-click or Enter/F2 to edit, Escape to select again. Eight handles,
exact geometry fields, axis-constrained movement, center guides, and compact
Edit/Duplicate/Delete/Arrange tools make direct manipulation discoverable.
Text sessions and completed drags create undo checkpoints. Pending drag
geometry stays outside the durable deck until a current-owner/revision-checked
pointerup; interruptions discard the preview.

The primary agent reviewed changes in three passes (implementation, ownership
and history, final integration/browser behavior) and reviewed Luna's scoped
Assistant output. A separate Luna review identified uncommitted drag mutations
and blocked touch scrolling; both were corrected and reviewed again. Touch uses
tap-to-select before dragging. No durable fields, stores, or export paths changed.

Manual CUA checks on isolated port 5290 verified both slash names, /ai filtering,
regular chat opening, writing-workspace opening, switching from writing to chat,
preservation of an unsent composer draft, slash-query removal, text-box dragging,
corner and side resizing, double-click/Enter editing, Escape, Backspace preserving
the object, separate drag undo/redo, consecutive keyboard undo/redo, numeric
placement, table-cell editing/movement, Arrange centering, reload persistence,
and read-only presentation without resize handles. At 390px, the DOM showed no
document-level horizontal overflow. Physical touch and an interruption during a
held drag were not exercised; those paths were reviewed in source.

Proof: .tmp/qa/slides-object-editing.png. Syntax, architecture guardrails,
27 static core-integrity assertions, manifest generation, cache-stamp freshness,
and whitespace checks passed. No automated suites, installs, builds, or provider
requests were run. Changes remain on the local candidate branch; no merge/push.

## Browser Focus miniplayer size — 2026-10-04

Item 14 was reopened after the user showed an oversized browser window.
The initial request is now 320 × 280 rather than 380 × 520, with
preferInitialWindowPlacement so supported browsers do not restore the previous
oversized bounds. Timer and 44-pixel controls share a compact header; up to five
tasks stay in a keyboard-scrollable region whose scroll position survives the
five-second refresh. A narrow-window rule stacks the controls.

Luna diagnosed the unavailable-task message: the existing canonical getter was
exposed only in test hooks, while PiP uses the production flowAtelier bridge.
One production bridge entry now exposes that same getter. No durable fields,
stores, timer state, network paths, or export behavior changed. A byte recovery
copy preceded the core edit; the reviewed core budget grew by one API entry.

The primary agent manually reviewed the diff in three passes: markup and
layout, bridge/privacy/lifecycle behavior, and final integration. Luna provided
an additional read-only review; its narrow-window concern was addressed.
Syntax, architecture guardrails, cache freshness, whitespace, and all 27
static core-runtime assertions passed. Asset manifests were regenerated.
No automated tests, builds, installs, or provider requests ran.

CUA loaded the isolated preview and observed the paused canonical timer and
Miniplayer launcher. The launch action timed out and the separate PiP window
was not available in the browser tool inventory; its layout, populated task
list, and pause/resume behavior were not visually verified. Close the old PiP,
refresh the live preview, and reopen it for the user's hands-on check.

## HTML Preview authoring controls — 2026-10-04

Item 16: HTML Preview now hides Timeline actions and the authored-timeline
picker. Code and desktop Split retain them. Visibility follows the actual
source pane, so narrowing desktop Split into phone Preview also hides the
controls and cancels any pending timeline draft. Existing rendered timelines
and HTML source remain intact. Resize refreshes run only when source-pane
visibility changes, avoiding repeated full-source scans during resizing.

The primary agent reviewed the change in three passes: host visibility and
load order, mode/owner cancellation and source preservation, final integration
and manual browser behavior. Luna added a read-only review; its resize-cost
finding was addressed. No durable fields, export paths, sandbox permissions,
or core-runtime code changed. Feature docs and Help & Docs were updated.

Manual CUA QA on isolated port 5290 verified Preview hiding both controls,
Code/Split restoring them, an inserted timeline continuing to render in
Preview, phone Code/Preview transitions, breakpoint resizing, reload behavior,
and cancellation of an open timeline draft when resizing Split to phone
Preview. Source matched its original value after undoing the temporary QA
timeline and after cancellation. Proof: .tmp/qa/html-preview-clean-toolbar.png.
Syntax, architecture guardrails, cache freshness, manifest regeneration, and
whitespace checks passed. No automated suites, builds, installs, network
provider requests, merge, push, or deployment were performed.

## Follow-up regression review — 2026-10-04

The follow-up patch preserves native Enter/Shift+Enter line breaks in Slides,
keeps toolbar menus inside the workbench, captures native pasted-link clicks,
removes Canvas pan momentum, removes all HTML timeline authoring controls, and
makes the timer player X dismiss the whole in-app player. The browser miniplayer
requests compact bounds and follows Sutra theme tokens through its external CSS.
No workspace schema, storage key, or content migration is added.

Root reviewed the changed implementation in three passes: patch review, ownership
and lifecycle review, then final integration review. Sol 6.1 medium agents handled
Slides, native links, and Focus; root handled Canvas, HTML controls, cache stamps,
asset generation, and live checks.

Observed live in the isolated localhost QA workspace:
- A freshly pasted plain URL opens its popup immediately; Edit and Remove target
  that link. Unlinking a pasted mixed bold/italic link keeps its text formatting.
- Slides preserves native Enter line breaks after reload and blank lines when
  returning to the page. The Slide menu stays inside 1280px and 680px viewports;
  the narrow document has no horizontal overflow and Escape dismisses the menu.
- HTML Code, Split, and Preview offer no timeline actions or picker.
- Canvas stays at the released pan position and returns with a reverse drag.
- The timer X leaves neither a restore chip nor reserved player spacing.
- Both the Sutra and Assistant PNGs load and render in the restarted preview.

Native browser PiP appearance, final browser-controlled sizing, and its task rows
remain unverified because that separate window is not exposed by the available
browser inspection surface. Keep that queue item pending visual confirmation.
Automated test suites, dependency installs, and builds were not run. Syntax,
runtime integrity, cache stamps, and generated assets were checked separately.
Syntax checks, all 27 runtime assertions, 189 cache-stamp entries, architecture
guardrails, brand assets, and whitespace checks passed. Asset manifests were
regenerated. Screenshots: `.tmp/qa/html-no-timeline-20261004.jpg` and
`.tmp/qa/slides-lines-menu-20261004.jpg`.
