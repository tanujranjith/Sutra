# Browser QA checklist — October 15, 2026

Initial candidate tested: e616e71 on codex/student-workflow-batch.
Manual Chrome QA used http://127.0.0.1:5195/Sutra.html, an isolated local origin.
No automated suites, provider requests, pushes, merges, deployments, remote writes,
or source fixes were performed in this pass. Starting the static server runs its
required core-runtime integrity assertion. The server was stopped for cached
loading, then restored. The viewport override was reset.

Struck entries 1–24 retain prior user approval/manual verification; they were not
all repeated in this pass. Newly passed items are 28, 30, 36, and 37.
Open entries remain open even when some subchecks passed. Browser checks do not
replace the pending CI, restore, external-service, or physical-device gates.

Follow-up fixes: landing copy at 7c27546; Settings/planning at d288810.
Manual Chrome checks on the same isolated origin passed items 31, 38, and the
local behavior in 44. Required cache/CSP generators and the staged commit hook
ran; automated unit/E2E suites remain unrun locally and pending GitHub CI.

## Checklist

1. ~~Header layout and navigation.~~
2. ~~Assistant model selection, Gemini handling, and integrated effort control.~~
3. ~~Selective workspace retrieval, task notes/URLs, sources, and reload behavior.~~
4. ~~Emoji search, icons, and persistence.~~
5. ~~Integrations labels and unavailable-service disclosure.~~
6. ~~Command palette access and dismissal.~~
7. Sync: automatic cross-device cycles, reconnect, offline changes, and conflicts. Open: requires an explicitly configured test account and second device/session.
8. ~~Ctrl+Shift+V plain-text paste.~~
9. ~~Paged boundaries, text placement, tables, manual breaks, and editor zoom.~~
10. ~~Class/activity recognition, ambiguity correction, and manual destination choice.~~
11. Backups: scheduled arrival and full restore of notes, tasks, images, and attachments. Open: provider setup/private passphrase and complete encrypted backup round-trip. File uploads now work.
12. ~~Browser/OS notifications: user validated October 18. Follow-up off-switch fixed in `c5e17a9`; local Chrome confirmed turning alerts Off persists across reload and Send test becomes in-app-only. Optional background registration now respects opt-out, including pending registration; prepared automated regressions remain under item 45.~~
13. ~~Application Sheets tabs, Add Row, editing, persistence, and checkbox labels.~~
14. ~~SAT/ACT dates and countdown boundaries.~~
15. ~~College/major rankings, unrated exclusion, and College Matrix input focus.~~
16. ~~Ordinary task notes/Reference URL persistence and cancelled-draft reset.~~
17. ~~Blank essay word targets.~~
18. ~~Homework titles/IDs render quotes and markup literally, including after reload.~~
19. ~~Diagnostic credential scrubbing: controlled fake keys, nested/encoded aliases, and diagnostic/export sinks covered by the successful static/unit CI lane at `d95489e`; no real credentials inspected.~~
20. ~~Grade Planner category/score preservation through Semester Setup and reload.~~
21. ~~Assistant permission safeguards, consented locked-note read, and editor remaining locked.~~
22. ~~Calculator negatives, parentheses, keyboard entry, errors, and recovery.~~
23. ~~HTML-page PIN unlock and source preservation.~~
24. ~~US Letter default and A4 selection.~~
25. ~~Imported task Notes/Reference URL editing, reopen/reload, and unknown fields.~~
26. ~~Stateful follow-up: Gemini read staged task notes/Reference URL, resolved the follow-up correctly, cited the right task, and retained working citations and fields after reload.~~
27. ~~Successful one-time PIN read: Gemini answered the harmless locked-note question correctly; only the consented page appeared in pre-send/post-response sources, with the correct read-once PIN label and no selection/memory/history. Editor stayed locked, source cards withheld the protected excerpt, a later read required fresh consent, and the saved answer/citation/receipt survived reload. QA access restored to Off.~~
28. ~~Major Matrix keyboard editing: lower rows, Tab/Shift+Tab, ranking update, and reload persistence.~~
29. ~~True Chrome zoom at 67%/150% across Home, Create editing, Assistant composer, and Settings search/save. User set real browser zoom; manual QA confirmed layout containment and note persistence on October 17.~~
30. ~~Bundled Sutra icons in light/dark themes, phone navigation, and cached loading with the local server stopped.~~
31. ~~Settings: desktop/phone navigation, search, pending edits, Save, Revert, and reload persistence; phone actions clear the bottom navigation.~~
32. ~~Grammar/spelling/rephrase: live short drafts, editable review, insertion and selected-text replacement, Cancel, and editor Undo passed in Chrome.~~
33. ~~Writing guards: empty /grammar disables Generate; changing the note during generation closes the stale review and preserves the newer text.~~
34. ~~Page PIN protection and management: user validated October 18. Prior manual checks covered wrong/right PIN, relock cleanup, and content after unlock/reload; stale authorization guards are fixed. Prepared automated regressions remain under item 45.~~
35. ~~Workspace lock: user-created local test credential; wrong/right PIN, retry delay, refresh locking, real inactivity locking, background isolation and separate page-lock preservation passed manual Chrome QA on October 17.~~
36. ~~Invalid Capture dates and leap days: February 31/month 13 stay unset; February 29, 2028 parses.~~
37. ~~Official exam Upcoming/Taken/Pending/Recorded states, reopen, reload, and separate practice scores.~~
38. ~~Weekly planning: seven-day coverage, future starts, after-hours rollover, expired-preview rejection, single-tab schedule persistence, and already-scheduled work deduplication.~~
39. ~~Wellness retirement: discovery checks and the recorded successful CI coverage for exclusion, encrypted backup, and synthetic Sync preserve retired records and unknown nested fields. Ordinary goals, notes, and Focus remain available.~~
40. ~~Spreadsheet importer: native Sheets formulas/reload/cached use, plus general XLSX-to-note import displaying the previously blank formula result and retaining it after reload.~~
41. ~~Incomplete restore: manual corrupt/missing-asset checks and successful CI fault-injection coverage verify honest warnings, in-memory recovery, and old-root preservation when workspace or attachment writes fail.~~
42. ~~Synthetic Sync safety: recorded CI coverage verifies rejected/corrupt encrypted content and conflict failures preserve durable data. Live service and device validation remains under item 7.~~
43. ~~Help/tutorial: generated Help retains all 34 table-of-contents targets and native Back to top buttons; mouse/keyboard jumps, heading focus, reload, read-only Help, ordinary same-title note editability, and 390px controls passed. Full 67-screen tour Next/Back/Finish and the six-screen quick tour passed; reopening instructions match current Settings.~~
44. ~~Landing-page copy and local nested recovery paths: punctuation, image descriptions, grade display, logo, and both recovery links.~~
45. CI/hosting: latest recorded matrix at `d95489e` has 16 successful jobs and one WebKit closing-connection fixture failure. Local fix `66bd37f` now waits for canonical startup/save before installing its fake database; parent independently reviewed it. Open: CI rerun of that fix and subsequent local commits, requiring later push authorization. Hosting settings remain unchanged.
46. ~~Save-conflict fix: startup recovery/repair now coordinates conditional writes, journals replaced roots, and identifies accepted writes. Timeline create/edit/reload and genuine two-tab stale-write protection passed manually.~~
47. Settings visual follow-up: original option 3 workflow checks remain recorded. October 18 CSS cleanup fixes nested mobile padding, tablet action/footer and floating-control overlap, mismatched button heights, and duplicate search-clear icons; notification search labels/focus are corrected. Final manual phone/tablet geometry passed. Open: user visual approval of the updated look; automated regressions remain under item 45.
48. ~~Theme creation in Assistant: live Gemini 3.8 Flash + Low generation/refinement, inline palette review, explicit Preview/Revert/Apply, saved palette/reply reload, and local /theme off passed.~~
49. ~~Settings and workspace search upgrade: everyday phrases/typos, relevant field-level results, exact-control focus, shared workspace Settings results, keyboard navigation, draft/disclosure preservation, and phone containment passed manual Chrome QA. Luna diffs and privacy boundaries independently reviewed; automated regressions remain under item 45.~~
50. ~~Assistant response details, receipt labels, and source panels adapt to theme colors; light/dark/custom-light stats contrast checked and faint-label/dark-fallback defects fixed.~~
51. ~~Completed theme replies release the Stop-generating state; connected-provider composer hints refresh correctly after reload.~~
52. ~~Repository documentation audit, applicable consolidation, and obsolete-guide removal; parent reviewed the changes.~~
53. ~~Workspace PIN setup and timeout forms hide irrelevant credential fields; local manual verification passed.~~
54. ~~Homework storage policy reconciled with the existing current-UI IndexedDB store; migration/recovery record explicitly preserves and documents separate legacy v1 mutation paths. No runtime or task data changed.~~

## Remaining-item review and user validation — October 17, 2026

Local commit `de7010f` fixes PIN-management authorization and notification delivery.
The byte-for-byte core recovery copy was verified before editing. Required core
integrity and staged-hook checks passed all 27 assertions without changing the
size allowance; owning asset/cache generators completed. `git diff --check`
passed. No automated unit/E2E suites, installs, provider calls, pushes, merges,
deployments, or cloud configuration changes were performed in this review.

Luna xhigh independently inspected notifications and the relevant Sync/backup
paths. The parent checked the reported defects against source, implemented the
fixes, reviewed the complete diffs, and corrected a milestone routing regression
identified in the second review. A separate review found no concrete regression
in the new PIN guards or their prepared tests. These reviews do not replace CI.

Manual local Chrome QA loaded the new core/notification stamps with canonical
startup ready. With browser alerts off, Send test accurately disclosed that only
an in-app alert was produced. Notification title/help markup now uses canonical
Settings components instead of concatenated text; searching browser notifications
returned one actionable control rather than repeated category labels.
One harmless task, `QA notification routing review`, was added in the disposable
localhost:5287 workspace. It appeared in Notifications, and clicking it opened
Edit Task with that exact title and due date. Cancel closed without editing it.
The staged task remains for optional user testing. No notification permission
was requested, and no new PIN was created or changed by the agent.

The existing CI fixture fix was re-reviewed against the shared canonical startup
and save barrier. It remains unverified on WebKit until the next authorized push
and full browser matrix run. Source spot-checks of live Sync/backup reconnect,
foreground polling, daily scheduling, cross-tab locks, and retry handling found
no additional concrete defect; service-backed behavior remains open.

User validation record (use a disposable workspace; items 34 and 12 closed by
the user's October 18 approval and the local off-switch retest):

- [x] **34: PIN change/removal.** Set/change the PIN yourself; after relock and
  reload, old PIN fails and new PIN works. Cancel removal keeps protection;
  confirmed removal retains content after reload. Check a legacy locked-note
  backup, if available, upgrades on normal unlock and remains readable after reload.
- [x] **12: Windows alerts.** Enable browser permission explicitly, choose Send
  test, and confirm a real Windows notification. Confirm an urgent reminder
  appears once per open session, clicking it opens the correct item, and disabling
  alerts prevents further OS notifications. Also check an already-urgent item
  on opening Sutra and after granting permission.
- [ ] **7: Live Sync.** Use a configured test account and second session/device;
  check automatic transfer, offline edits/reconnect, and conflict preservation.
- [ ] **11: Scheduled backup/restore.** Configure a test destination and enter
  a private backup passphrase yourself. Confirm scheduled arrival; restore into
  a separate disposable workspace and check notes, tasks, images, and attachments.
- [ ] **45: CI approval.** Authorize a later branch push/full browser matrix;
  confirm the WebKit fixture and new PIN/notification regressions pass.

## Paired pages and unified note tools — October 21, 2026

Local implementation commit: `668ad2a`, on `codex/student-workflow-batch`.
The license decision was removed from the active checklist at the user's request;
the effective software license was not changed.

Split View now retains a specific pair rather than replacing its primary member
when another page opens. Paired tabs are adjacent and flat, and an unlink icon
explicitly ends the pairing. Unpairing or closing Split View hides the entire
strip, including ordinary session shortcuts. The pair reuses the existing pane
contexts, secondary-page setting, and canonical split preference; ordinary
visited tabs stay in memory. No new workspace fields or note-format changes.

Manual Chrome checks on the isolated `http://127.0.0.1:5297/Sutra.html` origin:

- Created three harmless QA notes. Pair Beta + Alpha stayed together while Gamma
  opened normally. Returning through Alpha restored Beta on the left and Alpha
  on the right, with its pending secondary edit intact.
- Reload preserved both the exact pairing and each note's distinct body.
- Unpair removed the group and the whole strip (zero rendered height), returning
  to a single editor.
- The unified Insert and note tools menu opened by mouse. Inserting a page break
  while the secondary editor was active changed only that editor; Undo removed
  it. The old plus trigger is hidden; all 22 insert/document actions and zoom
  remain in the shared menu.
- At 390px, document width remained 390px and the menu was contained horizontally,
  scrolled internally, and stayed within the viewport. Escape closed it and
  restored focus to the trigger. The viewport override was reset afterward.

Required core runtime integrity and its integrity/server-guard self-tests passed,
as did the staged runtime hook (27 assertions), targeted JavaScript syntax checks,
cache/asset generation, and diff whitespace checks. Four focused browser
regressions are prepared for CI: pair navigation/reload/unpair, protected member
navigation, Classic editor pending edits, and unified-menu keyboard/insertion.
They were not run locally. Protected-member and Classic-specific behavior still
need those CI runs; the manual pass used Modern Editor without creating PINs.

The normal/official workspace was not edited. No provider requests, dependency
installs, push, merge, deployment, or cloud configuration changes were made.
The requested local server was left running for user review.

A final menu follow-up prevents the delayed native details-toggle event from
resetting an already-open menu's scroll position. Selecting the lower Split View
item through the merged menu then restored Beta + Alpha in Chrome. The prepared
menu regression now exercises that mouse path as well. The preview was left in
the ordinary single-page state, with the strip hidden after unpairing.

## User approval and alert opt-out — October 18, 2026

The user approved items 34 and 12, with one follow-up: browser alerts could not
be disabled after enabling. Local commit `c5e17a9` adds the explicit off action
and distinguishes Sutra opt-in from Chrome's retained permission. It also
unregisters the optional daily background reminder on opt-out/master Off and
rechecks pending registration before/after completion. Settings explains the
behavior. No new workspace fields or core runtime changes were needed.

Manual Chrome QA on localhost:5287 started with the user's opt-in enabled.
The button read Turn off browser alerts with aria-pressed true. Clicking it
changed to Enable browser alerts with aria-pressed false. Reload retained Off,
and Send test accurately reported an in-app-only notification. Browser permission
was not revoked or re-requested; alerts were left Off. Asset/cache generators
and git diff --check passed; automated tests were prepared for CI, not run locally.

## Settings CSS and search follow-up — October 18, 2026

The user reopened Settings appearance after approving PIN and notification
behavior. GPT-6.1 Sol at medium effort inspected the live local UI and changed
only scoped CSS. The parent reviewed its selectors, cascade, and breakpoint
effects, requested bounded notice spacing and canonical navigation clearance,
and independently corrected tablet Save Changes wrapping to a different height.

The final changes remove legacy nested card padding below 768px, keep tablet
actions at the viewport edge with reserved content space, cap the update notice,
hide duplicate floating utilities only within compact Settings, and keep one
accessible search-clear control. No preference model, PIN, or core runtime changed.
The parent also marked dynamic notification rows as semantic Settings rows;
searching quiet hours now names that setting and focuses its actual unchecked
control without changing it.

The subagent checked Appearance, Notifications, Assistant, Data, and search;
its final 768/1024px update-notice footer edge checks passed. Its last phone check
was interrupted by a persisted stale-page warning from concurrent QA tabs.
After the temporary tab was closed, the parent reloaded and used normal Retry
Save; the warning cleared. No force overwrite, storage reset, or data wipe was used.

With final CSS loaded, parent Chrome checks at 390, 639, 768, and 1024px confirmed
document width equals viewport, both action buttons are 44px tall, and left,
center, and right hit targets reach the intended buttons. The parent also
verified the notification search result and actual control focus. These parent
geometry checks initially had no active update notice. When the live update
notice appeared, the parent repeated final checks at 390, 768, and 1024px:
the notice stayed above both buttons and all three hit targets remained clear.
Browser viewport was reset, temporary tab closed, and Settings left open for
the user's visual review. Asset/cache generators and git diff --check passed.
No automated unit/E2E suites, installs, provider requests, pushes, merges, or
deployments ran. Prepared CI coverage expands action-edge checks to tablet sizes
and verifies dynamic notification search labels/focus. User visual approval of
item 47 remains open; items 34 and 12 remain closed by user approval.

## Locked-source fix follow-up — October 17, 2026

Local commit `60c5ac0` fixes the failures below without changing the core runtime,
stored note/PIN formats, provider settings, or approval requirements. A valid
one-request ticket suppresses the generic product-Help fallback, narrows the
note index to the consented page, and builds minimal workspace context without
another open editor, selection, automatic summaries, or memory. Source
exclusions, explicit denials, ticket validation/consumption, and token budgets
remain in force. Minimal still excludes automatic notes; an explicit verified
page request is the exception. Generic read-this-note prompts can use bounded
target excerpts when ordinary keyword search has no match.

Luna xhigh traced and reviewed the relevant paths. The parent independently
checked its findings and fixed the unrelated current-editor scope gap it found.
The parent's code read rejected a subsequent false-positive report about
missing local-search area approval: retrieval already derives that approval
from a validated ticket. Unit and browser cases were prepared for CI, including
an unrelated current note, generic queries, exclusions, Minimal, invalid tickets,
ticket reuse, and editor isolation; they were not executed locally.

Owning asset/cache-stamp generation and its required core-integrity assertion
passed; `git diff --check` passed. No automated suites or dependency install.
In the existing localhost Chrome workspace, the updated script URL was verified.
With local routing On, Gemini 3.8 Flash + Low, Stateless history, and temporary
Notes-only access, the original question passed consent/PIN and reached the
pre-send disclosure. Its expanded receipt listed only `QA Locked Consent`,
locked/read once with PIN for this request, with minimal workspace context,
no selected text, no memory, no prior conversation, and Data transmitted: No.
That was the pre-send checkpoint. The user then explicitly approved the remote-AI
acknowledgement and test submission. The earlier tab was no longer available;
the current local tab contained the original local Help reply and an empty
pending thread, with no completed provider answer to inspect. The test was
repeated with the same exact question, provider/model, Low effort, and fresh
consent/PIN checks. Its expanded pre-send receipt again listed only the target.

The completed live answer correctly said the practice meeting is Thursday at
4 PM and to bring the blue folder, citing `QA Locked Consent`. Its receipt named
Google Gemini / gemini-3.8-flash, minimal workspace context, only Notes, only
the locked/read-once source, no selection/history/memory, and transmission of
message + notes. The source card displayed title and metadata without the raw
protected excerpt. Response details reported 2.0 seconds, 910 input tokens,
37 output tokens, 947 total, reasoning Low. This is observed usage for this
completed call; provider billing and any unobserved earlier submission were
not inspected.

Clicking the answer's citation opened the PIN screen. The protected reminder
was absent from both classic and Modern Editor DOM. A subsequent identical
read required fresh consent and was cancelled before any provider request.
Reload preserved the correct answer, working citation, one-source card, and
informational read-once receipt without retaining a permission grant. The
source card still withheld its protected excerpt after reload.

Workspace access was restored to No workspace access and Notes to Use access
mode. Assistant master/Pack were initially turned Off, then re-enabled only to
show the completed chat at the user's request; workspace access remained Off.
Original Current view depth and local routing On were retained. The harmless
locked note and QA chat remain only in this local workspace. No additional
generation calls were used for reload, citation, fresh-consent checks, or
reopening the saved result. Automated regressions remain pending under item 45.

## Initial locked-source QA and trademark recommendation — October 17, 2026

Manual Chrome checks used only the disposable `http://localhost:5287`
workspace. The user saved a Gemini key and created the PIN for the harmless
`QA Locked Consent` note. The fixture contains only a short practice-meeting
reminder. Gemini's live model catalog loaded 46 entries; the selected model
was `gemini-3.8-flash`, with Low thinking and Stateless history.

The exact test question was:

> Read only the locked note "QA Locked Consent" with one-time permission.
> In one short sentence, when is the practice meeting and what should I bring?

- The consent dialog named the correct page and required its existing PIN.
  Repeated attempts asked for fresh consent and PIN verification.
- With local answers enabled, the completed reply was generic locked-note Help,
  labeled Computed locally / no API key used, rather than the requested answer.
- With that local shortcut temporarily disabled, Workspace-aware and Current
  view pre-send receipts each named both the consented locked note and the
  unrelated `QA Zoom 29 — disposable` note. The locked source was correctly
  labeled as read once with PIN for this request. Those submissions were
  cancelled; this establishes a disclosure/source-selection finding, not proof
  that unrelated content reached a provider.
- Minimal context still requested consent/PIN, but its pre-send receipt listed
  neither sources nor workspace areas. That submission was also cancelled.
  No successful remote answer or post-response disclosure was verified.
- Returning to Create showed the protected page's PIN screen. Its reminder
  text was absent from both the classic editor and Modern Editor DOM.
- Workspace access was restored to No workspace access, Notes to Use access
  mode, context depth to Current view, local answers to On, and Assistant
  master/Pack to Off. Settings and the locked page state survived reload.
  The harmless locked note and QA chats remain locally.

Gemini generation requests submitted: zero; the local reply and cancelled
pre-send receipts are the observed evidence. Provider billing was not inspected.
Model-list lookup is not a generation. No API key value was read, exported,
or recorded. No automated
suites, installs, deployments, pushes, or merges were performed.

For item 55, `TRADEMARK.md` still names NoteFlow Atelier while `NOTICE` and
README already identify Sutra and explain the former name. The recommendation
is to align that brand policy with the current product, retain Apache 2.0 code
licensing, permit truthful references and attribution, and ask distributed
forks to use distinct branding without implying endorsement. This is a proposed
project policy, not a claim of trademark registration or name clearance.
The owner has not yet adopted it, and LICENSE/NOTICE/TRADEMARK.md are unchanged.
Reference: [Apache 2.0, sections 4 and 6](https://www.apache.org/licenses/LICENSE-2.0).

## Real Chrome zoom and storage follow-up — October 17, 2026

Only the disposable `http://localhost:5287/Sutra.html` origin was used.
The user set Chrome to 67% and then 150%; read-only DOM measurements confirmed
pixel ratios approximately 0.667 and 1.5, with CSS viewport widths 2632 and 1170.
Visual viewport scale stayed 1, distinguishing browser zoom from pinch zoom.
At both settings document scroll width equaled client width.

Home navigation/layout, Create note typing and wrapping, the unsent Assistant
composer draft, and Settings search/save were exercised. At 150% the formatting
toolbar exposed its existing scroll controls. The harmless `QA Zoom 29 — disposable`
note, including text added at 150%, survived reload. Assistant drafts were cleared
without sending; no keys or provider calls were used. Assistant master and Pack
were temporarily enabled for composer QA, then both restored to Off and confirmed
after reload. The user subsequently restored 100%; the later item 27 pass
confirmed pixel ratio 1 and no document overflow at a 1755px CSS viewport.
Screenshots were inspected in memory, avoiding additional large disk artifacts.

For item 54, the user delegated the storage-contract choice. History and current
code support retaining the existing canonical store for current Homework UI
writes instead of replaying potentially stale raw localStorage arrays. The
parent corrected the subagent's overbroad single-authority wording and a relative
documentation link after independently reading the v1 reader/mutation paths.
The dedicated record distinguishes schema version 2 from the unnumbered
legacy-import marker and records recovery/downgrade limitations. This resolves
the policy/documentation conflict, not every possible legacy compatibility defect.
No new migration was performed or certified.

Item 45's fixture fix is local only. No automated suites, builds, installs,
pushes, merges, or hosting changes were performed in this follow-up.

## Local PIN follow-up — October 17, 2026

Manual Chrome QA used only `http://127.0.0.1:5287/Sutra.html`, a fresh local
origin serving the existing candidate. The official workspace and GitHub Pages
app were not opened or modified for these checks. The user created both test
PINs through the visible setup forms; their values are not recorded here.

- Page: a wrong PIN showed the incorrect-PIN message and kept the note hidden.
  The correct PIN revealed the original harmless canary. Refresh relocked it;
  its body was absent from both editors until the next successful unlock.
- Page finding: immediately after initial locking and after **Lock again**, the
  canary remained in `#editor` and `#editorV2Host .ProseMirror`, behind
  `display:none` ancestors with zero rendered rectangles. It was not visible in
  the lock screen. Reload removed both retained copies. This contradicts the
  documented page-owned plaintext cleanup contract; no broader bypass or data
  exposure was demonstrated. Item 34 remains open.
- Workspace: a wrong PIN was rejected; the fourth wrong attempt reported a
  one-second retry wait. The correct PIN unlocked successfully afterward.
  Locked background content had a hidden, inert, `aria-hidden` ancestor.
- Changing the inactivity timeout required the existing PIN and relocked the
  workspace. The one-minute selection survived refresh, which started locked.
  After unlocking, 69 seconds of real inactivity produced the lock screen;
  no clock injection or timer mock was used. Unlock succeeded afterward, and
  opening the note still required its independent page PIN.
- Setup UI observation: the workspace setup form displayed a Current PIN field
  while the lock was Off; timeout authorization displayed unused new-PIN fields.
  The actions completed with only their relevant fields filled. These incidental
  presentation issues were not repaired in this verification pass.

The QA workspace was left locked, with its one-minute test timeout enabled and
the local server running. Page PIN change/removal and legacy upgrade remain
unverified manually. No application code, provider requests, automated suites,
remote hosting changes, pushes or merges were performed in this pass.

## PIN fixes verified — October 17, 2026

The follow-up fix clears both the classic mirror and Modern Editor document when
the lock screen opens, resetting Modern Editor undo history. In the isolated
local QA origin, **Lock again** left no canary text in either editor. A wrong PIN
remained blocked; correct unlock restored the intact note, including after
reload. No canonical note fields or PIN verifier formats changed.

Workspace timeout authorization now displays only Current PIN. Setup on a
separate empty `http://localhost:5287` origin displays only New PIN and Confirm;
no new credential was entered or submitted. Both dialogs were cancelled, and the
existing QA workspace retained its one-minute timeout after reload. Hidden setup
and custom-duration controls also stay hidden in their inapplicable states.

The required runtime integrity checks passed. Regression cases were added for
CI but were not executed locally; no push or merge was made. The earlier finding
above remains a dated record of the behavior before this fix.

## Live Gemini follow-up and contrast fixes

All generation requests used the user's selected `gemini-3.8-flash` with Low
thinking. No OpenAI requests. Nine short generation requests were submitted:
five chat calls, three completed writing calls, and one writing call cancelled
when the source note changed. The five chat calls reported:

| Check | Input tokens | Output tokens | Total |
|---|---:|---:|---:|
| Theme generation | 312 | 90 | 402 |
| Theme refinement | 408 | 87 | 495 |
| Minimal-context negative read | 824 | 35 | 859 |
| Selective task read | 859 | 54 | 913 |
| Stateful task follow-up | 935 | 44 | 979 |
| Total reported chat usage | 3338 | 310 | 3648 |

The writing-review UI does not report token totals, and provider billing was not
inspected. The initial 2.5 Flash-Lite send was blocked at disclosure before a
generation response; the user then personally approved the narrowed first-send
disclosure for 3.8 Flash. Google lists 3.8 Flash's current paid standard rates as
$0.75/$3.75 per million input/output tokens; 2.5 Flash-Lite lists $0.10/$0.40.
Low thinking reduces token use, not the published token rate.
Source: https://ai.google.dev/gemini-api/docs/pricing (checked October 15, 2026).

Only the harmless QA Planning task was allowed for retrieval; other areas were
blocked. Minimal context withheld task data as expected. Workspace-aware read
used one task source; the follow-up cited the same task and reported Planning
plus recent conversation, with no saved memory. The task's notes, URL, answer,
and citation navigation survived reload. Workspace access was restored to Off,
area defaults to Use access mode, chat memory to Stateless, and context depth
to Current view. Gemini 3.8 Flash + Low remains selected for the user.

Live theme generation/refinement produced QA Blue and QA Blue Darker Accent.
The second changed the accent from #2563eb to #1d4ed8 while retaining the other
five colors. Preview/Revert/Apply, reload, stored palettes, and /theme off passed.
A live defect left structured replies stuck on Stop generating; the parent
fixed the missing render-completion callback and verified the next live send
returned to Send message. The stale No AI connected hint was also corrected.

Writing QA used a disposable QA Writing Checks note. Grammar draft insertion
and edited review worked; Undo restored the original. Spelling replacement
changed `I recieved the seperate calender.` to `I received the separate calendar.`;
Undo restored it. A changed note closed an in-flight review and retained
`QA NEWER TEXT MUST REMAIN.`. A later rephrase returned `I will join the meeting
at nine.`; cancelling left the original sentence untouched. Empty /grammar
disabled Generate without a remote request.

The parent reviewed Luna's scoped stats CSS/test diff, then strengthened faint
labels and applied the same fix to Sources. Real rendered stats label/value
contrast measured 15.03:1 in Default, 12.94:1 in Dark, and 12.96:1 in QA Blue.
Required core runtime integrity checks and staged hooks passed. Automated
unit/E2E suites remain unrun locally and pending GitHub CI. Commits remain local;
no pushes, merges, or deployments. Token/usage snapshots are ephemeral by design.

Remaining findings: real browser zoom could not be established; Help TOC buttons
are lost during V2 rendering. A separate reviewed recovery fix preserves retired
sleep/breathing and unknown Life fields without treating generated defaults as
user data; its controlled recovery cases await CI. Focus start/pause/resume/reset
passed and the QA timer was returned to Ready. The six-screen essentials tour
finished normally. Private PIN, service Sync, encrypted backup, OS notification,
and controlled storage/security-failure checks remain open as listed above.

## Search follow-up

Two narrowly scoped Luna xhigh agents upgraded Settings and workspace search;
the parent reviewed all diffs and corrected responsive category-label noise,
alias noise, backup-export priority, read-only-control focus, filtering of
unrelated rows/groups, and loss of Settings relevance in the global bridge.
The parent also fixed the app-update notice intercepting Settings Save/Revert.

Manual Chrome checks on isolated origin 5196:

- `turn on dark mode` finds Theme first in Settings; `calender` finds Calendar
  controls, and `backup password` prioritizes Encrypted Workspace Backup.
- `save automatically`, ArrowDown, Enter focuses the visible Autosave selector.
  Selecting an export search result focuses its button without activating it.
- Workspace access remains searchable while its control is unavailable; its
  explanatory row receives keyboard focus without changing access.
- Spacious density remains staged through search/clear; matching disclosures
  open for `glass blur` and return to their prior collapsed state after clear.
  Revert restores Comfortable and clears the pending indicator.
- Workspace search `theem note` ranks and opens QA Theme Note; changing the query
  to an unmatched string and immediately pressing Enter does not open stale
  results. Global Settings: Theme opens Settings and focuses Choose theme.
  Settings' own relevance order survives the global search bridge.
- At a 390 x 844 viewport, search result buttons exceed 44px and document width
  does not exceed the viewport. Desktop and phone Save/Revert receive clicks
  above the real app-update notice. The viewport override was reset.

Search indexes labels/help/metadata rather than current field values. Locked
note bodies remain excluded by the existing collector and engine guards; this
boundary was reviewed, with controlled privacy regressions left to CI. No new
durable workspace fields, credentials, provider requests, or remote actions.
Required core integrity checks passed; unit/E2E suites were prepared but not run.
Screenshots (ignored): .tmp/qa-2026-10-15/settings-search-desktop.png and
settings-search-phone.png.

## Theme chat follow-up

Local commit 7f4869c moves the theme-generation card into a dedicated Assistant
chat with `/theme ` prefilled. Existing provider/model/thinking controls are
used; the brief and bounded theme-only history replace workspace enrichment.
Attachments are neither sent nor consumed by theme requests. Opening the card
and submitting an empty `/theme` make no paid request. Validated replies are
stored in existing message content and render explicit palette review controls;
there are no new durable fields or plugin installations.

Parent independently reviewed both Luna xhigh theme/routing implementations,
corrected ordinary-message rendering of false results, preserved past palette
cards after `/theme off`, guarded chat switching/in-flight requests, closed the
theme panel on navigation, and retained unused attachments. Manual Chrome QA
verified the actual CTA and empty-command response. A harmless JSON fixture,
imported through the visible file chooser into disposable origin 5196, staged
a synthetic reply. Preview changed the appearance temporarily, Revert restored
it, Apply saved QA Paper Theme, and reload listed that custom theme as selected.
The palette card survived reload and remained visible after `/theme off` with
the ordinary-chat acknowledgement. This verifies client review/persistence,
not live AI generation. No provider requests or real credentials were used.
The fixture replaced only earlier disposable QA records, whose prior checks
remain documented above. Required core integrity/self-tests and staged hook
passed; full provider mocks and automated suites remain pending GitHub CI.

## Import and save-conflict fixes

Manual Chrome QA on isolated origin 5196 verified the original exported
`QA Import Workbook.xlsx`: general document import now produces 2, 3, and 5,
with an explicit static-snapshot notice. Reload retains all three values.
The original export omitted formula caches, and SheetJS could fabricate a zero
or omit uncached cells. New exports include typed results; old XLSX files use
bounded source-XML cache metadata plus the canonical local Sheets evaluator.
Supplied caches remain authoritative. CI regressions cover actual file-picker
import, cacheless formulas, cached zero/false/text/errors, and reload.

Reviewed a concrete unsafe startup writer: legacy recovery/onboarding repair
previously replaced the canonical root outside the normal coordinator/CAS path.
It now reads under the writer lock, conditionally commits, journals atomically,
publishes the shared canonical hash, and discards superseded candidates. Boot
and app coordinators in one document share an identity. This fixes that writer;
the exact cause of the earlier warning cannot be proven retrospectively.

Chrome Timeline QA created `QA Save Safety 46`, reloaded, then opened a second
tab and saved `QA Newer Tab 46`. The stale tab was blocked with an attributed
another-page warning. Reloading retained both saved blocks and excluded its
attempted stale block. After closing the second tab and reloading the first,
renaming the original block to `QA Save Safety 46 Edited` saved and survived
another reload without an active conflict warning. Controlled startup
interleaving/failure tests are prepared but remain pending GitHub CI (item 45).

Required runtime integrity and its self-tests passed; its temporary server
self-test required sandbox escalation. Local commits 7207a2c and 7a9d459 record
the initial fixes. No unit/E2E suites, provider requests, pushes, merges,
deployments, or remote changes. Disposable screenshots are under ignored
`.tmp/qa-2026-10-15/import-save-fixes/`.

## Settings and Help follow-up

The parent independently reviewed the GPT-6.1 Sol high implementation and two
Luna xhigh results (read-only Settings review and bounded Help text update).
Visual comparison found sidebar footer overlap and a cramped layout; parent
corrected the rail, typography, inherited gutter, and shrinking navigation.
Manual phone hit testing then caught the redesigned sticky footer below the
visible navigation; parent switched the phone bar to a fixed, clearance-aware
position with reserved document space and added a CI regression at 320x568.

Chrome verification: staged density changed only the preview; Revert restored
the persisted baseline; Save set Compact and reload retained it. Comfortable was
restored by a real phone Save. At 390x844, Save was y706–750; at 320x568 it was
y430–474, above the navigation at y492. Center hit testing returned
settingsApplyBtn at both widths. Expanded controls were at least 44px high, and
document scroll width equaled viewport width. Tablet 960x900 kept all 16
categories and no horizontal overflow. Search revealed Blur inside its closed
disclosure and clearing restored the original state. Global Dark preset rendered
readable Settings, then Default was restored in this QA origin.

The Help compatibility layer now documents the current Settings and explicit
/grammar, /spelling, /rephrase contracts. Parent reviewed the additions and
corrected only the known double-escaped built-in customization label. Chrome
confirmed both heading occurrences display a normal ampersand, with no literal
&amp; remaining in the generated Help text. Its tutorial/TOC review is not complete.

Design comparison and screenshots: ignored .tmp/qa-2026-10-15/settings-option3/.
See design-qa.md for comparison scope and intentional theme/shell differences.
Required CSP/cache/asset generators ran. Core app.js was not edited. Unit/E2E and
broad validation remain for GitHub CI; no provider spending or remote actions.

## Import retry evidence — October 15, 2026

Manual Chrome checks used the fresh isolated origin 5196. The refreshed extension
accepted file uploads. Import first opens a confirmation and then a separate
document-import dialog; only the second Choose File opens the browser picker.

- 25: restored one legacy task from a harmless JSON fixture. Original Notes and
  Reference URL appeared in the edit dialog. Edited both, reopened, reloaded,
  and reopened again: both edits persisted. The actual unencrypted JSON export
  saved by the user in D:/Downloads retained the edited values and the synthetic
  legacyUnknownField portability marker. No personal export was inspected.
- 40: created a disposable Sheets workbook through the UI with A1=2, A2=3,
  A3=SUM(A1:A2), exported XLSX, and imported the saved file through Sheets.
  Formula text and result 5 were retained; A1=7 recalculated A3=10 and survived
  reload. With server 5196 stopped, cached reload, editing/recalculation, and
  another native Sheets XLSX import worked. The server was restarted afterward.
  The general document-import route created a note table containing 2 and 3,
  but its formula-result cell was blank. That limitation is not fixed here.
- 41: invalid pages JSON and invalid package bytes failed before replacement;
  the edited task remained available. A recovery JSON fixture with one indexedDB
  attachment reference and deliberately absent bytes produced the persistent
  attachment failure / Workspace restore incomplete banner. It told the user
  recovered content remains available and to keep the original backup. This
  fixture was applied only to the disposable origin, not the user's workspace.

Screenshots in ignored .tmp/qa-2026-10-15/checklist-pass/: imported-task-reloaded.png,
xlsx-formula-reloaded.png, xlsx-cached-import.png, incomplete-restore-warning.png.
No provider calls, automated suites, pushes, merges, deployments, or remote writes.

## Follow-up fix verification

- 31: corrected the responsive footer selector specificity. At 390×844, Save
  ended at y749 and navigation started at y768; center hit testing identified
  settingsApplyBtn. At 320×568, Save ended at y473 and navigation began at y492.
  Save worked at both widths, Revert restored the draft baseline, and a saved
  Comfortable density survived reload. Viewport override reset.
- 38: the pure engine accepts an injected notBeforeMinute boundary; the browser
  supplies the next minute and rejects elapsed starts immediately before Add.
  A task due October 21 (day seven) appeared at 19:43 on October 15 instead of
  06:00. Once 19:43 passed, Add refused it and kept the button available. With a
  temporary 19:00 day-end setting, the preview rolled to October 16 at 06:00.
  The day-end setting was restored to 22:00. A later single-tab normal plan at
  19:47 appeared in Timeline, survived reload, and was excluded on re-planning.
  Add all uses the same expiry guard and now preserves its failure feedback.
  Controlled boundary/rollover and phone-hit-test regressions were prepared for
  CI only; they were not executed locally.
- 44: independently reviewed Luna's HomePage.html diff. Only corrupted text,
  symbols, alt descriptions, and comments changed; JavaScript ternaries remain.
  Chrome DOM inspection found no question marks in the landing text or image
  labels. An unchanged copy of 404.html served from an ignored nested local
  fixture loaded its root-relative logo; Back to home and Open Sutra reached
  HomePage.html and Sutra.html. This checks browser path resolution, not the
  production HTTP 404 status, /Sutra hosting prefix, or remote deployment.
- 46: the first reload with two QA app tabs did not retain the newly added
  block. A clean single-tab retry persisted. A later edit then showed the
  canonical save-conflict warning: storage no longer matched the page's last
  confirmed save, with no other open Sutra page detected. The app blocked the
  write rather than claiming success. Cancel/reload cleared the active warning,
  though Save Health retained the failed-save diagnostic. Cause was not proven
  and is not fixed by these three scoped changes.

Follow-up screenshots in the same ignored checklist-pass directory:
settings-fixed-phone.png, landing-copy-fixed.png, nested-recovery-fixed.png,
expired-plan-rejected.png, after-hours-plan-fixed.png, future-block-timeline.png.
No secrets, provider calls, remote actions, or schema changes. Two extra harmless
QA tasks and their disposable planning activity were used only in origin 5195.

## Evidence from the initial pass (before the follow-up fixes)

Help follow-up (local origin 5196): the Modern Editor now renders generated,
sanitized Help through its existing preserved-block path and strips the
temporary wrapper when serializing. No durable fields were added. All 34
contents targets exist and were activated; two rapid semantic clicks needed
a fresh activation after browser auto-scroll, and then focused the correct
heading. Distant sections settled at y140 below the desktop toolbar (bottom
y126); the phone Notes section settled at y74 below its toolbar (bottom y60).
Phone controls measured at least 44px high with no document overflow.
Reload retained 68 native navigation buttons. Switching to a regular note,
including temporarily giving it the title Help & Docs, retained editability
and no Help wrapper. The original QA note title was restored.

The full tutorial was walked through all 67 screens with Next, Back, and
Finish. Individual action buttons were not all invoked; their feature-specific
checks remain in the corresponding entries. Luna's CI regression was reviewed
and corrected before acceptance, but was not run locally. Required runtime
integrity and the staged core hook passed; automated suites remain under 45.

- 28: staged major QA Engineering. Real changed keystrokes set lower-row values
  7 and 8; Tab/Shift+Tab moved to adjacent score fields. Both values survived
  reload. Numeric fill alone did not commit the application change; this was
  treated as a tool limitation and retested with changed keyboard input.
- 30: icons visible in light/dark desktop and the 390px All sections sheet.
  With the static server confirmed stopped, reloading the cached app still
  rendered the bundled SVG paths. This is cached localhost availability, not a
  claim of every OS, install, or deployment condition.
- 31: Save button rect at phone width was x37/y781/w306/h44. Read-only hit testing
  at its center returned the fixed Capture icon. Screenshot independently shows
  the action bar under the bottom navigation. Initial apparent tool failure was
  investigated and is now an observed overlap. Pending density change reverted.
- 36: invalid date drafts cancelled without adding tasks.
- 37: SAT marked taken, official result date 2026-10-10 and score 1450 recorded.
  Reload preserved Result recorded with Practice 0. Mark not taken retained
  Saved result (2026-10-10): 1450. Completed exam's next action was Edit result.
- 38: QA Sunday deadline due 2026-10-18 proposed for 2026-10-15 at 06:00–07:00
  while current app time was 19:29. Added one disposable block. A second preview
  said Nothing to schedule. The stale time-window behavior is not fixed here.
- 39: QA Read one chapter goal saved and survived reload; retired wellness
  trackers absent from Life dashboard.
- 44: observed visible landing copy agrees with source HomePage.html, including
  PRIVATE ? LOCAL-FIRST ? STUDENT-BUILT and grade A?.

Screenshots (ignored, local only): .tmp/qa-2026-10-15/checklist-pass/
settings-save-overlap.png, exam-results.png, major-keyboard.png,
phone-icons.png, cached-icons-and-past-plan.png, landing-copy.png.

Disposable data stays only in this QA browser origin: one goal, one major with
two ratings, one SAT result, one task and one linked schedule block. Packs were
enabled and dark theme selected in that origin only. Original user data was not
imported or replaced. Provider requests and AI credit usage: zero.

## October 22: Sidebar split tabs and cross-space moves

- [x] Paired notes occupy one sidebar row with two adjacent tab cells and an unpair control on each. No top tab bar or separate paired-note list. Chrome measured both cells at the same vertical position. Opening Gamma preserved Beta + Alpha; returning restored both panes and the saved secondary edit. Unpair restored the ordinary rows, and reload retained the pair before unpairing.
- [x] Move to space is available from page and folder actions. In the disposable localhost:5297 workspace, a note and HTML page moved between Notes and QA Destination with content/source intact after reload. A parent moved with a child and then with Slides, Sheets, and Canvas children. The spreadsheet formula =2*3 still displayed 6 after move and reload; Slides and Canvas opened in their correct editors. A conflicting title was refused without overwriting either page; Cancel retained the source edit.
- [x] Corrected the stale active-space label after reload. Help & Docs and feature documentation describe the move workflow.

Data impact: existing page records and IDs are retained; spaceId and, for a nested subtree, its title prefix change. No new durable fields or attachment copies. The user's 127.0.0.1 workspace was not edited. QA staging remains only in the separate localhost origin. No provider requests or AI credits used.

Validation: required core runtime checks and staged hook passed 27 assertions; runtime-integrity and static-server guard self-tests passed. Edited JavaScript syntax and whitespace checks passed. Asset manifest and cache-stamp lock regenerated. CI regressions cover mixed models/asset references, unknown fields, PIN/pinned preservation, cancellation, name conflicts, nested moves, pending edits, and sidebar pairing. Those automated browser regressions were prepared but not run locally; latest CI remains pending while no-push applies. Cross-device Sync and full backup/restore are not established by these manual move checks.

## October 22: All Create types in Split View

- [x] Sidebar Split with another page and the comparison selector accept Notes/documents, HTML, Slides, Sheets, Canvas, and folders in the active space. The Chrome-style sidebar pair remains intact when navigating away; existing pair IDs/settings remain the persistence contract.
- [x] Chrome QA at localhost:5297: edited HTML source, added a Slides slide, committed a pending Sheets formula by switching panes, created and edited Canvas text, and opened a folder's children. The main note stayed unchanged. HTML source, the spreadsheet result 56, the Slides count, and separate Canvas edits survived reload.
- [x] Two Canvas pages stayed independent: the left retained Primary Canvas sentinel while the right saved Secondary Canvas changed alone. Canvas + Notes and Slides + Sheets also rendered and remained usable. A new space's Canvas + Note pair chose its local partner instead of a stale page from another space.
- [x] Leaving Create removed the secondary native frame; returning restored it and the same pair. Desktop and 390px checks showed no document-wide horizontal overflow; phone panes stacked. The viewport override was reset. No JavaScript errors were captured in the final QA pass.

Implementation: secondary native editors share canonical host page records and persistence, without booting another Sutra app or database. Canvas reuses one implementation with per-pane DOM/runtime state. Locks, changed page references, and remote applies invalidate stale frames; ordinary switches flush pending edits. The shared rich-text toolbar is disabled when a native editor owns focus. Canvas context follows the active pane. Frame background/grid styling and inherited theme tokens use the existing styles.

Required runtime integrity, staged-runtime validation, and architecture guardrails passed. New CI browser cases cover mixed native surfaces, four same-type pairs, pending drafts, reloads, cross-space fallback, shared data ownership, and native-page PIN gating/relocking. These automated cases have not run locally or in CI yet; PIN behavior for the new native frame is source-reviewed and has prepared CI coverage, not a new manual browser pass. No backup/Sync guarantees are inferred from this QA.

The official/imported 127.0.0.1 workspace was not edited. Harmless QA pages remain only on localhost:5297. Provider requests and credit usage: zero. Server remains available at http://127.0.0.1:5297/Sutra.html. All changes stay local on codex/student-workflow-batch; no push, merge, or deployment.
