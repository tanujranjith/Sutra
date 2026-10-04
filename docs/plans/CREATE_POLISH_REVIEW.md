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

1. In a connected backup session, choose a daily time, reload, and confirm the next scheduled run; also try switching frequency and disabling it.
2. Restore a disposable backup through Yes, No and Cancel; cancel the password form and confirm original work remains. Do not use the only copy of important data.
3. Open Miniplayer in a browser with Document Picture-in-Picture support, switch to another app, pause/resume, and change tasks while paused.
4. Optional: connect the intended AI provider and generate/apply a draft, plus a phone/touch and Office export round-trip pass.

Manual screenshots are local ignored artifacts under `.tmp/qa/`: `html-toolbar.png`, `canvas-preserved-text.png`, `link-popup.png`, `inline-ai-panel.png`, `slides-editor.png`, and `sheets-template.png`.
