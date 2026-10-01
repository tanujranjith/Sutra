# Sutra overnight handoff

Prepared October 1, 2026. Implementation is ready for local review on
`codex/overnight-improvements`. All ten agreed tasks and the expanded non-Notes
Create workstream are implemented. Integration remains pending user validation.
No merge to main, push, deployment, publication, dependency install, automated
browser test, unit suite, self-test, or heavy build was performed.

## Open the candidate

The implementation checkout is:

```text
D:\Desktop\Engineering\Coding\Active projects\Sutra\.tmp\overnight-clean-main\.tmp\worktrees\overnight-improvements
```

The original checkout remains `codex/overnight-plan`. Both main worktrees and
the original user changes were preserved. The candidate's copies of `AGENTS.md`,
`SUTRA_ARCHITECTURE.md`, and `AGENT_SUBSYSTEM_CONTRACTS.md` are excluded from task
commits. Do not discard those copies or use a blanket stage/reset/clean.

From the candidate, use the existing static server:

```powershell
node scripts/serve-static.mjs 5278
```

Open `http://127.0.0.1:5278/Sutra.html`. Check the working directory and branch
before editing. The overnight inspection used a disposable localhost workspace;
sample pages are browser-local review data, not shipped product defaults.
Use an isolated browser profile/origin for experiments with real backups.

## Delivered scope and morning walkthrough

| Task | Delivered behavior | Morning verification |
|---|---|---|
| #1 Backup overlay | Prominent actual packaging/encryption/provider stages, accessible indeterminate status, finally cleanup, foreground-only presentation. | Export an encrypted workspace; confirm cancellation/failure cleanup and restore it into an isolated workspace. Check required attachments and backgrounds; incomplete exports must refuse success. |
| #6 Rich links | Editable display label and URL, inline preview, explicit Open/Edit/Remove, native editor history/save. Optional explicit local title/thumbnail lookup. | Insert, rename, preview, remove, Undo/Redo, reload, export/import. Separately start the helper only if desired and inspect lookup/cancel/error/thumbnail cases. |
| #7 Inline AI | `/ai` including mid-sentence, toolbar/selection entry, shown exact context, canonical configured provider, reviewed plain-text Insert/Replace. | Cancel without losing the slash query; generate using your configured provider; cancel/retry; edit and approve multiline text; Undo. Change page or lock during generation and confirm no stale insertion. |
| #8 Page tags | Legacy normalization, duplicate/empty handling, page-owned input, filter persistence, phone tag controls. | Add/remove tags, Enter/blur/Escape, duplicate case variants, reload, filter through tree refresh, import legacy tags, check read-only/locked pages. |
| #9 To-do | Consistent user-facing name, All/Homework/General categories, shared canonical task records, Capture/Home connections. | Capture class-linked homework and a class-free task; check category counts/filtering/Home, edit/complete/reopen, reload and restore old assignment data. |
| #10 Completion effect | Brief bounded decorative effect after confirmed successful completion in To-do and Home, focus retained, reduced-motion support. | Complete with mouse and keyboard, reopen, complete rapidly, navigate, enable reduced motion. Failed saves must not show a success effect. |
| #11 Icons | Existing course presets plus one custom emoji; customizable Help & Docs icon with fixture identity/content retained. | Change/reload/reset icons; check invalid input and unknown old icons, backup portability, per-device Help preference under Sync. |
| #13 Authored timelines | Shared custom event model/editor, vertical/horizontal layouts, add/edit/remove/reorder, four native content hosts and PDF-linked Note. | Insert/edit/Undo/duplicate/reload in each host below; retain long labels and unknown model fields through encrypted backup and Sync. No calendar event should appear. |
| #15 Focus player | Canonical active/paused timer across views, Pause/Resume/Open/Hide/Restore, dialog/keyboard clearance. | Start/pause/navigate/resume, hide/restore, open/minimize full Focus, reload, reset/finish; ensure only one timer owns the countdown. |
| #17 Mobile workspaces | Complete More utilities, phone Week agenda, Home/To-do/Review/Settings/Capture/Create/protected-page layout refinements and landscape clearance. | Use the device matrix below, including native keyboard, safe areas, PIN warnings, dark themes and reduced motion. |

## Create upgrades and timeline support

| Surface | Create upgrade | Authored timeline |
|---|---|---|
| Notes | Targeted native link/AI/timeline tools; existing Notes templates/editor retained. | Atomic editable block; `/timeline` or Insert timeline. |
| Canvas | Grouped tools, empty-board guidance, selection/object/grid status, Fit/zoom/minimap clarity, phone-contained control rows. | Separate `content-timeline` object; header dragging, readable body, native Undo/Redo. Existing scheduled-item objects remain separate. |
| Slides | Grouped Insert/History/Slide tools, inline rename, ordering/duplication, explicit layout replacement review, improved inspector/notes and presentation lifecycle. | Selectable editable element; full model survives native deck normalization. Print/PDF and standard PPTX use complete event text; Sutra's private PPTX deck part retains editable data. |
| Sheets | Grouped common/Format/Data/Structure/File tools, formula draft Apply/Cancel, selected range/result/status, rename with recognized cross-sheet references, phone grid/tool polish. | Excluded as requested; no insertion action. |
| HTML Pages | Code/Split/Preview, phone Code/Preview tabs, starters, separate preview/save feedback, bounded source Undo/Redo, source-size feedback. | Inert source section; native timeline picker or source-range selection; isolated offline preview. |
| Folders | Immediate child cards, breadcrumbs, six type-specific create actions through the existing parent-confirmed dialog. | Organizational container; no content embed. |
| PDF/document workspace | Contextual actions, reader/inspector clarity, stale render protection, source-lock cleanup, explicit Create timeline note. | Separate linked Note with PDF title/source attribution; original PDF bytes remain unchanged. |

In New Page, selecting a type prepares its controls and starter. It does not
create immediately: the final Create button confirms the chosen type/location.
Try each starter, Cancel, parent selection, empty content, and reopen/reload.

The existing Slides Print / PDF remains a simple text print view; it does not
reproduce images or slide placement. Full export fidelity is unverified.

## Data and privacy decisions

- Existing canonical page/task/timer/attachment storage and legacy aliases stay
  in use. No second task store, parent hierarchy field, account requirement,
  remote script, telemetry, background link lookup, or schedule conversion was
  added.
- Rich-link and timeline models live inside existing page content/source,
  Canvas objects, or Slides elements. Their embedded/nested contracts are
  recorded in the [persistence inventory](../architecture/persistence-inventory.json).
  Unknown fields survive supported edits; malformed/future timelines remain
  read-only and preserved. Portability is source-reviewed, not proven by a
  completed encrypted restore or Sync run.
- Optional metadata is off by default. The helper is a separately invoked
  local development script with Origin/Host and public destination validation,
  pinned DNS, redirect/size/time/concurrency bounds, and bounded image formats.
  It is not started by Sutra or included as a deployed server. Approved images
  are inline data; saved link rendering does not fetch remote thumbnails.
- AI opening sends nothing. Generation uses the existing configured provider
  and disclosure, with only the shown passage/instruction. Acceptance is an
  explicit native editor transaction; provider output is plain text.
- Open HTML, Slides, and Sheets now hide and clear rendered plaintext,
  session drafts/clipboard/history on canonical page/workspace-lock signals.
  Slides closes its presenter; PDF source/workspace locks close its reader and
  cancel a pending embedded open. Test and real credential/device validation
  are still pending. No page or workspace lock credential was created during
  manual inspection.

## Observations actually made

The primary agent personally reviewed every contribution and correction three
times. Luna xhigh provided bounded implementation and independent read-only
audits; it did not replace those personal reviews. See the dated
[progress ledger](OVERNIGHT_IMPLEMENTATION_PLAN.md) and
[research findings](OVERNIGHT_RESEARCH.md).

Sequential manual browser inspection observed:

- Tag duplication/cancellation/blur save/filter/reload; Help/course icon change,
  reset, keyboard focus and reload; canonical General/Homework Capture and Home
  quick-add; successful completion feedback and reopening.
- Canonical Focus pause/resume/hide/restore/full-dialog/minimize and paused time
  after explicit save/reload; backup overlay packaging-stage focus and cleanup.
- Rich-link insert/preview/edit label/reload; mid-sentence slash heading and AI
  cancellation with surrounding text retained.
- Timeline insertion/edit/Undo and saved content in Notes, Canvas, Slides, and
  HTML. Slides timeline, title and notes persisted after reload; presentation
  Escape returned focus to Present. A valid local PDF rendered and created its
  separately linked timeline Note, which persisted after reload.
- Sheets zero/formula result, draft cancellation, Undo/Redo, cross-sheet rename,
  grid scrolling, and Study tracker starter; HTML source/snippet/offline preview
  and desktop Split; folder immediate child creation/navigation and six actions.
- Phone portrait sizes 360×800, 375×812, 390×844, 393×852, 414×896, 430×932;
  landscape 844×390; desktop 1280×900. The inspected Home, To-do, Review/Practice,
  Settings, Capture, Create, More and calendar states caused no document-width
  overflow. Review drawers cleared viewport chrome, Settings used one page
  scroll with pending actions above Focus/navigation, and Create headers cleared
  the page-list button. Folder create buttons measured 48–60 pixels high at
  414×896 after the cascade correction.

These observations cover specific actions and states, not exhaustive device,
accessibility, persistence, concurrency, export, or failure coverage. Native
keyboards, physical safe areas, dark themes, PIN lock/unlock/warnings, reduced
motion interactions, and all advanced destinations still need inspection.

## Validation boundary

Only lightweight static syntax/integrity/metadata/link checks and sequential
manual UI inspection are permitted for this run. The staged-runtime hook stays
enabled. Final permitted checks passed:

- `node --check` for 19 changed scripts, including the new deferred test files;
- `node scripts/sutra-core-runtime-check.mjs`: all 27 static assertions,
  4,946,269 bytes / 86,836 lines;
- architecture guardrails in the candidate and exact staged runtime snapshot;
- generated asset-manifest freshness: 366 critical, 6 optional, 16 lazy assets;
- owner-generated cache freshness from the staged snapshot: 188 stamped assets;
- local-link audit: 591 references across 898 files;
- scoped and staged whitespace review.

The architecture baseline registers the new namespaced APIs and zero-sink
modules, lowers the core sink budget by two, and adds no raw storage allowances.
Asset/cache metadata was regenerated by its owners. Full deploy validation is
pending; those static results are not suite or portability results.

Deferred before integration, on a machine with sufficient resources:

```powershell
npm run check:runtime
npm run check:all
npm run test:unit
npm run build:deploy
npm run check:deploy
npm run test:e2e:smoke
npm run test:e2e:sync
```

`npm run verify` combines the broad gates. These commands are suggestions for
later validation; none was run overnight. Meaningful new pure-model, Sync
metadata and actual-module VM lock regression coverage was added as source,
without executing it. The VM stub cannot establish real DOM focus, CSS or inert
behavior. Check targeted Notes/editor, Canvas, Slides, Sheets, HTML, PDF,
Homework, backup, mobile and modal coverage as well as encrypted restore/Sync
round trips before authorizing integration.

## Local checkpoints

| Commit | Scope |
|---|---|
| `5a0782b` | Agreed plan and Create scope. |
| `d20858a` | In-depth research and canonical seams. |
| `ffc9d08` | Tags, canonical Focus player, phone utility foundation. |
| `fd34057` | Actual foreground backup progress. |
| `d642bef` | Custom icons and phone Week agenda. |
| `5c945fe` | Canonical To-do categories, Home/Capture and completion feedback. |
| `5b63cc6` | Create type confirmation and Slides/Sheets/HTML/PDF editor polish. |
| `a93184b` | Native rich links, inline AI, authored timelines, Canvas/folders, lock cleanup and final mobile refinements. |

The final implementation commit retained the staged-runtime hook, which passed
all 27 static assertions. A final documentation checkpoint records this handoff.
Task-owned files are committed; only the three preserved instruction/document
copies listed above remain outside the commits. The manual preview server was
stopped and the inspection tab was closed.

Main remains at `84cbbdf80b299cf495d3e7eefd9408ef4ceb16f0`. Browser
notifications, licensing and task #18 remain excluded. Main integration is a
separate user-authorized step after local verification.
