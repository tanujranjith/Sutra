# Student workflow branch: local implementation handoff

Branch: `codex/student-workflow-batch`. All checkpoints are local. No push,
merge, deployment, production setting, or remote database change was performed.
The unrelated primary checkout remains on `codex/overnight-plan`.

## Implemented locally

- Backup retry/backoff and incomplete-asset restore reporting (`4b73d52`).
- Node 24 CI configuration, nested recovery paths, landing copy (`1303c6d`).
- Full-week canonical planning and scheduled-work deduplication (`81d0274`).
- Diagnostic credential aliases and bounded encoded-label scrubbing (`781a79a`).
- Safe Sync pauses on unauthenticated/inconsistent remote records (`c6dfc55`).
- Wellness retirement with legacy fields preserved for portability (`cdcadaf`).
- Dedicated Assistant script consolidation with load order preserved (`2700316`).
- Desktop/phone Settings refinement and vendored SheetJS 0.20.3 (`ef1ab88`).
- Official exam results, pending states, exact Undo state, and active Help/docs
  updates (`504b677`).
- Explicit passage-only `/grammar`, `/spelling`, `/rephrase`; editable review,
  Cancel, and guarded Apply; Classic slash-menu click repair (`d3a9fa4`).
- Versioned page PINs, legacy upgrade, stale authorization rejection, and
  tab-local workspace unlock backoff (`84470a2`).
- Original bundled daily-loop icons with existing labels/targets (`c653c02`).
- Inactive Homework quick-add parser/UI cleanup (`1c0966b`).
- Active Capture/portal calendar validation, including fallback paths and leap
  years (`bb30a1e`).
- Restore completion delayed until both stores finish, combined save/file
  failure reporting, and required file-key readback for metadata-only recovery
  (`20e042a`).
- Imported legacy task Notes/Reference URL save/reopen/reload regression,
  including unknown-field preservation (`d788fa6`, prepared for CI only).
- Conflict-storm review preservation before the cycle pauses (`c909622`).
- Shared recursive deployment path policy, source-ancestor/root link rejection,
  and CI regression coverage (`4b59361`).

Shared editor adapters and closure-coupled core routing remain with their owners;
Assistant consolidation is not a wholesale runtime extraction. Sync and backups
retain independent guarantees. No code attempts to repair unauthenticated cloud
content by replacing a key, overwriting a record, or discarding local work.

## Observed manual Chrome checks

The local disposable origin was `http://127.0.0.1:5194/Sutra.html`.

- A normal Life habit still saves and survives reload after wellness retirement.
- Phone Settings categories and Back preserve pending edits; primary category
  controls measure 44px, the decorative preview is hidden, and there is no
  document overflow at the checked phone width.
- SAT mark-taken, pending-result, Cancel, explicit QA result, reopen, and reload
  preserve the recorded result. The grouped exam list renders normally.
- Modern/Classic selected passage commands preserve text on open and Cancel.
  Empty explicit passages disable Generate. A no-key attempt reports an error
  without changing the note. Full-chat Cancel retains its original draft and
  creates no conversation message. Classic pointer activation was rechecked
  after repairing hover replacement of the clicked row.
- Phone All sections shows the bundled icons; measured viewport and document
  width were both 390px. The temporary viewport override was reset.
- Major Matrix excludes the staged unrated major. Ratings 9×5 and 8×4 with total
  criterion weight 38 produce 2.03. Scores and exclusion survive reload.
  Programmatic numeric fill did not commit a native change; actual changed
  keystrokes followed by Tab did. No product workaround was added for that
  browser-control artifact.
- Active Capture previews “tomorrow 11pm” as 2026-10-16 at 23:00. Cancel left no
  task behind after the legacy parser cleanup.
- Active Capture leaves “February 31st 2026” unset and recognizes
  “February 29, 2028” as 2028-02-29. Both drafts were cancelled; a screenshot is
  retained as `calendar-validation.png` in the candidate QA directory.

Screenshots are retained under ignored `.tmp/qa-2026-10-15/` in the candidate;
earlier Life, Settings, and exam proof is in the primary root's same ignored
path. Staging includes a QA habit, SAT result, QA Passage Writing note, and two
QA majors. These records belong to the disposable browser origin.

## Verification limits and remaining gates

- The approved `npm run check:runtime` gate and staged core hook passed for core
  changes, including the latest icon-reference checkpoint. This covers the
  27 runtime assertions and runtime/static-server guard self-tests only.
- One sandboxed static-server self-test could not start its localhost server;
  the same approved gate passed with the necessary local-server permission.
- Owning CSP/asset/cache/guardrail generators were run and their diffs reviewed.
  No sink/storage ceiling was increased. Generation is not a claim that the
  full static/asset/deploy verification suite passed.
- New/updated unit and Playwright regressions have been written and reviewed,
  but **not executed**. They are queued for GitHub CI under the user's testing
  restriction. CI cannot test unpublished local commits without a later
  user-authorized push. Local installed Node is 20; Node 24 CI is still pending.
- Live Sync bootstrap/conflicts/recovery, automatic backup upload/restore with
  required assets, current deployment artifact/headers, and credential exclusion
  across real export paths still require their automated/integration gates.
- No live provider generation requests were made during this implementation.
  Stateful follow-ups, successful one-time PIN reads, and writing Apply/Undo with
  a real provider remain pending; the isolated QA origin has no provider keys.
- The new PIN crypto/legacy upgrade/throttling and stale authorization cases
  require CI execution plus a user-entered disposable PIN for manual UI QA.
- Manual imported-task verification could not select the disposable fixture
  through Chrome's file chooser. Extension file-URL access remains a browser
  prerequisite; the imported-task CI regression has been reviewed, not run.
- Physical OS notifications and true browser zoom at 67%/150% remain unverified.
  The browser-control zoom shortcut did not change observed viewport geometry;
  a resized viewport is not evidence of browser zoom.

The follow-up restore audit was read-only Luna work. The main agent independently
confirmed both original reporting gaps, traced all affected callers, implemented
the fixes, and reviewed the added tests. A second review identified the empty
attachment-write-queue case, which was fixed through database-key readback.
The final review found no further issue in those changed paths. The latest local
runtime gate and staged hook passed at 4,913,039 bytes / 85,666 lines; this is
still not evidence that the pending unit/E2E suites or live restore checks pass.

The automatic-Sync audit traced enabled/unlocked engine construction, immediate
catch-up, confirmed-save debounce, foreground/reconnect triggers, the visible-tab
two-minute poll, same-tab single-flight, and cross-tab locks/lease fallback. This
is source review, not a new live multi-device test. It found the conflict-storm
ordering exception: the pause happened before review records were written. The
main agent confirmed it, moved the pause after durable review writes while
retaining the apply/push/cursor barrier, and added assertions for both branches,
the pending count, UI notification, and failure to write review records.

The deployment audit found that directory-level copying and scattered reject
rules did not consistently cover nested local files or symbolic links. Staging
and verification now share one recursive path policy. Review also caught linked
artifact roots and linked source ancestors; both are rejected before reading or
clearing the artifact. The main agent checked the corrections and CI test
assertions. Current vendor license/runtime names were checked against the rules;
the actual build/artifact checks remain unexecuted pending CI.

## Plan completion audit

The following is an implementation/evidence map, not release approval. Every
automated gate still needs execution against these exact local commits.

| Approved requirement | Current local evidence | Remaining proof |
| --- | --- | --- |
| Sync integrity, scheduling, single-flight, conflict preservation | Engine/app source, Sync protocol, engine and cloud-sync regressions; storm ordering repaired | CI and live multi-device/offline/conflict checks |
| Backup backoff/catch-up, honest completion, incomplete recovery | Canonical app paths and backup schedule/restore regressions; required-key readback | CI, real destination upload, full restore with assets |
| Credential scrubbing and PIN safeguards | Reporter, versioned PIN helper, workspace lock, authorization regressions | CI, synthetic diagnostic export, user-entered PIN flow |
| Weekly planning and exam lifecycle | Canonical planning engine, official-result state, reviewed tests; exam UI/reload observed | CI and broader workflow regressions |
| Imported task notes/URL persistence | Actual import/editor paths reviewed; file-import regression added | CI; manual file selection blocked |
| Escaping, parser, 404, landing copy, dependencies, Node, deployment/headers | Local code/config, vendored bytes, path policy; Capture calendar cases observed | Node 24 CI, artifact build/check, deployed response headers |
| Wellness removal with portable legacy data; Assistant consolidation | Retired surfaces/compatibility fields and loaders reviewed; habit reload observed | CI round-trip and offline/load-order gates |
| Settings desktop/phone and preserved edits | Scoped styles/behavior; phone navigation, pending edits, width and targets observed | CI and true zoom/theme regression matrix |
| Explicit reviewed writing commands and original icons | Passage-only command/adapters/tests; open/Cancel/no-key and phone icon views observed | CI and low-cost live Apply/Undo |
| Remaining focused caveats | Major Matrix ratings/reload observed; follow-up/source/PIN regression coverage prepared | Live Stateful/PIN disclosure, OS notifications, true 67%/150% zoom |
| Help/current docs/changelog; proposals and license recommendation | Local documentation commits and connected-feature proposal | CI links/contracts; owner decides license and separate projects |

No remaining gate is treated as passed merely because a test exists or a source
review found no defect. Completion remains unproven until the pending evidence
is available. Uploading the branch for CI, remote service setup, new secrets/PIN
entry, and physical notification/zoom observations need the corresponding user
action or authorization; current no-push/no-merge constraints remain in force.

Do not treat local implementation or these narrow manual checks as release
approval. Validate the branch before authorizing push, merge, or deployment.

## Decisions prepared, not implemented

See [connected-feature proposals](CONNECTED_FEATURES_PROPOSAL_20261015.md) for
ChatGPT plan access, Calendar, API/MCP, hosted quotas, automations, and licensing.
The proposal recommends keeping Apache-2.0 for now; the owner makes the decision.
