# Open issues handoff — 2026-10-09

All six issues open at intake are implemented locally on **codex/open-issues-2026-10-09**. Base: **6e59d5b91c9c4655d33377be6704d6697e013e9f**. Implementation checkpoint: **f769bb2**; comprehensive Sync fixture checkpoint: **52c8c69**.

Work stayed in the isolated core-runtime worktree. Recovery copies are under ignored .tmp/recovery/. Main and unrelated primary-checkout changes were preserved. Nothing was pushed, merged into main, deployed, or changed on GitHub; the remote issues remain open.

## Completed behavior

| Issue | Result | Main implementation |
| --- | --- | --- |
| [#74: By Class overflow and history](https://github.com/tanujranjith/Sutra/issues/74) | Current unfinished assignments remain visible; past-due unfinished work and completed work have separate collapsed collections. Expanded history retains class grouping, accurate counts, search/filter visibility, course actions, and keyboard focus when rows move. Intermediate widths scroll within the table; mobile retains grouped cards and 44px controls. | [Homework](../../src/features/study/homework.js), [Homework styles](../../styles/features/homework-redesign.css) |
| [#73: Stray Notes entries](https://github.com/tanujranjith/Sutra/issues/73) | Hidden or disconnected Split View controls close their body-portaled dropdowns. Closed menus are inert and hidden from assistive technology. Sidebar operations target the actual page tree; active modal dropdowns remain usable. | [Select enhancer](../../src/ui/select-enhancer.js), [core](../../src/core/app.js) |
| [#72: Linked PDFs reopen as Notes](https://github.com/tanujranjith/Sutra/issues/72) | Modern Editor preserves linked-PDF cards as atomic blocks. Reopening verifies attachment identity and supports legacy single-PDF wrappers. Ordinary attachments and converted text notes keep their intended behavior. Entry and deferred-open authorization checks protect locked notes; original PDF bytes survive repeated reopen and reload. | [Modern Editor](../../src/features/notes/editor-v2.js), [core](../../src/core/app.js) |
| [#70: Edit classes and activities](https://github.com/tanujranjith/Sutra/issues/70) | Dashboard and Homework controls open canonical Course Hub Settings for name, type, location, and other existing fields. Empty/duplicate names are rejected appropriately; the original course ID, linked work, Homework mirror, and unknown metadata are retained. Existing merge and removal flows remain covered. | [Dashboard actions](../../src/features/study/class-dashboard-actions.js), [Homework](../../src/features/study/homework.js), [core](../../src/core/app.js) |
| [#69: Anchored comment threads](https://github.com/tanujranjith/Sutra/issues/69) | Modern Editor selections become persistent range annotations that map through edits, formatting, partial deletion, and recent undo/redo. Threads follow document order with replies, editing, resolve/reopen, deletion, and passage navigation. Split panes own their discussions independently. Wide screens reserve a gutter; narrow screens use the drawer. Locked notes clear unauthorized discussion. Ambiguous legacy quotes remain detached without losing their discussion. | [Modern Editor](../../src/features/notes/editor-v2.js), [core](../../src/core/app.js), [comment styles](../../styles/features/notes-comments.css) |
| [#68: Integrated Split View](https://github.com/tanujranjith/Sutra/issues/68) | Equal pane headers and titles identify the active note; the shared toolbar targets that note. Panes retain independent scrolling and pending edits. The responsive layout deliberately stacks on phones, keeps both panes reachable, and preserves lock protection. Conflicting legacy pane styling was consolidated. | [Workspace styles](../../styles/views/contextual-shell.css), [core](../../src/core/app.js) |

## Data and compatibility

- Comment version-1 anchors live inside the existing page.comments record. Inventory entries document the thread and anchor contract. Version history, encrypted backup, import/export, and canonical page Sync preserve the metadata; annotations are not serialized into document HTML. Unknown thread and anchor fields survive.
- Classic Editor retains quote-based comments and uniquely matched passage navigation. Modern Editor supplies transaction-mapped annotations. Recent anchor undo/redo uses a bounded in-memory journal; durable restoration validates quote and surrounding context.
- Classes keep canonical IDs and Homework mirroring. History grouping adds no durable assignment store. PDF fixes preserve original attachment bytes. No storage identifier rename, workspace reset, or backend migration was introduced.

## Verification

- Full static checks passed, including the 27-assertion runtime gate, syntax, cache stamps, manifests, guardrails, migrations, workspace/version round trips, CSP, local-first behavior, responsiveness, and documentation links.
- All **661 unit tests passed**. The comprehensive Sync fixture now contains an anchored comment with replies and unknown metadata; the added protocol test checks anchor changes, version snapshots, and detached/resolved discussion transfer.
- Deploy artifact build and validation passed. The local artifact contains the allowlisted runtime surface.
- Final targeted Chromium run: **22 passed**, retries disabled, covering class editing/history/merge/removal and all ten comment scenarios.
- Integrated Split View/comment run: **7 passed**. Integrated PDF/privacy/modal/sidebar run: **8 passed**.
- Focused comment assertions in Firefox and WebKit: **8 passed** (four per browser).
- Full npm run verify completed successfully (exit 0) at checkpoint **52c8c69**: **71 smoke tests passed** and **23 Sync browser tests passed**, in addition to all static/unit/build/deploy checks above. The comprehensive browser Sync parity case includes the new anchored-comment fixture.

The subsequent in-app Help & Docs text refresh (**99b9ad5**) passed its JavaScript syntax check, four existing Help identity unit tests, three existing Help browser regressions (retries disabled), cache freshness, manifest, and app-shell checks. The deploy artifact was rebuilt and validated again after that refresh. The handoff itself passed the local link audit.

Evidence is retained in ignored .tmp/final-verify2.log, .tmp/final-issues.log, .tmp/split-comments-integrated.log, .tmp/pdf-privacy-modal-integrated.log, .tmp/comments-cross-browser.log, and .tmp/help-final.log.

An earlier broader installed-Chrome matrix hit an environment timeout. Focused Firefox/WebKit assertions passed; a WebKit worker lingered after completing its assertions and was stopped after its ownership was verified, allowing the runner to report success. This is focused browser coverage, not a claim that every project in the browser matrix passed. No physical-device or remote CI run was performed.

## Documentation and checkpoints

Updated [Modern Notes Editor](../features/MODERN_NOTES_EDITOR.md), [PDF Workspace](../features/PDF_WORKSPACE.md), [Course Hub](../features/COURSE_HUB.md), [Homework](../features/TO_DO.md), [Navigation](../features/NAVIGATION.md), [Mobile and responsive behavior](../features/MOBILE_AND_RESPONSIVE_BEHAVIOR.md), [persistence inventory](../architecture/persistence-inventory.json), and [in-app Help & Docs](../../src/features/workspace/help-docs-refresh.js). Generated cache/runtime/asset metadata was refreshed through its owning scripts.

Significant changes were checkpointed locally: 5eff48e, 6c6d4ab, 70b3786, dfab88d, d5dd254, a511e1b, f09955a, b062a0f, f769bb2, 52c8c69, and 99b9ad5, followed by this handoff commit. Luna agents ran at X High; their changes were reviewed, corrected where needed, and independently exercised on the combined branch.
