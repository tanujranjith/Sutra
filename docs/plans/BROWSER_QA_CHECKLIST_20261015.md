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
12. Browser/OS notifications: delivery, correct destination, and deduplication. Partial: in-app Send test toast appeared. Actual Windows notification delivery was not observed.
13. ~~Application Sheets tabs, Add Row, editing, persistence, and checkbox labels.~~
14. ~~SAT/ACT dates and countdown boundaries.~~
15. ~~College/major rankings, unrated exclusion, and College Matrix input focus.~~
16. ~~Ordinary task notes/Reference URL persistence and cancelled-draft reset.~~
17. ~~Blank essay word targets.~~
18. ~~Homework titles/IDs render quotes and markup literally, including after reload.~~
19. Diagnostic credential scrubbing with controlled synthetic secrets and exported diagnostics. Ready for CI: existing student-security-boundaries tests cover modern fake keys, nested/encoded aliases, and report/export sinks; independently reviewed. No real credentials inspected; execution remains pending.
20. ~~Grade Planner category/score preservation through Semester Setup and reload.~~
21. ~~Assistant permission safeguards, consented locked-note read, and editor remaining locked.~~
22. ~~Calculator negatives, parentheses, keyboard entry, errors, and recovery.~~
23. ~~HTML-page PIN unlock and source preservation.~~
24. ~~US Letter default and A4 selection.~~
25. ~~Imported task Notes/Reference URL editing, reopen/reload, and unknown fields.~~
26. ~~Stateful follow-up: Gemini read staged task notes/Reference URL, resolved the follow-up correctly, cited the right task, and retained working citations and fields after reload.~~
27. Successful one-time PIN read: accurate source disclosure and editor stays locked. Open: needs user-entered QA PIN plus a provider.
28. ~~Major Matrix keyboard editing: lower rows, Tab/Shift+Tab, ranking update, and reload persistence.~~
29. True browser zoom at 67%/150% across Home/Create/Assistant/Settings. Open: another Chrome shortcut attempt left the measured viewport at 1751px and pixel ratio 1. Available controls did not establish actual zoom. Narrow-screen checks passed separately.
30. ~~Bundled Sutra icons in light/dark themes, phone navigation, and cached loading with the local server stopped.~~
31. ~~Settings: desktop/phone navigation, search, pending edits, Save, Revert, and reload persistence; phone actions clear the bottom navigation.~~
32. ~~Grammar/spelling/rephrase: live short drafts, editable review, insertion and selected-text replacement, Cancel, and editor Undo passed in Chrome.~~
33. ~~Writing guards: empty /grammar disables Generate; changing the note during generation closes the stale review and preserves the newer text.~~
34. Strengthened page PIN: wrong/right PIN, change/remove, legacy upgrade, and reload. Open: new credential entry must be performed privately by the user.
35. Workspace lock: refresh/inactivity and retry delay. Open: user-entered QA credential required.
36. ~~Invalid Capture dates and leap days: February 31/month 13 stay unset; February 29, 2028 parses.~~
37. ~~Official exam Upcoming/Taken/Pending/Recorded states, reopen, reload, and separate practice scores.~~
38. ~~Weekly planning: seven-day coverage, future starts, after-hours rollover, expired-preview rejection, single-tab schedule persistence, and already-scheduled work deduplication.~~
39. Wellness retirement: live Life navigation, widget/template pickers, Settings/workspace search and command discovery passed additional retirement checks; ordinary goals, notes and Focus work. Ready for CI: enhanced encrypted-backup and full Sync fixtures cover retired sleep/wellness records and unknown nested 0/false values, with direct restore/transfer/reload assertions. Automated portability/exclusion checks remain pending.
40. ~~Spreadsheet importer: native Sheets formulas/reload/cached use, plus general XLSX-to-note import displaying the previously blank formula result and retaining it after reload.~~
41. Incomplete restore: malformed/corrupt files preserve existing data and missing attachments show an incomplete-restore warning. Ready for CI: new restore-write-failure browser cases cover failed workspace/attachment writes, honest warnings, in-memory recovery and old-root preservation where applicable. Independently reviewed; not yet executed.
42. Sync safety: unauthenticated/corrupt encrypted content and conflict storms preserve data. Ready for CI: added durable-state preservation cases for auth rejection and corrupt ciphertext; existing crypto, conflict-store, storm and session-binding cases reviewed. Execution/service checks remain pending; remote data/configuration unchanged.
43. ~~Help/tutorial: generated Help retains all 34 table-of-contents targets and native Back to top buttons; mouse/keyboard jumps, heading focus, reload, read-only Help, ordinary same-title note editability, and 390px controls passed. Full 67-screen tour Next/Back/Finish and the six-screen quick tour passed; reopening instructions match current Settings.~~
44. ~~Landing-page copy and local nested recovery paths: punctuation, image descriptions, grade display, logo, and both recovery links.~~
45. CI/hosting: Node 24, required suites, allowlisted artifact, offline resources, and security headers. Vercel inspected: production tracks main; all other branches auto-build previews with Standard Authentication. Node 24.x confirmed. No settings changed and no push authorized; automated checks remain for GitHub CI.
46. ~~Save-conflict fix: startup recovery/repair now coordinates conditional writes, journals replaced roots, and identifies accepted writes. Timeline create/edit/reload and genuine two-tab stale-write protection passed manually.~~
47. ~~Settings option 3 redesign: independently reviewed, compared with the selected mockup, and checked in Chrome on desktop, tablet, and 390px/320px phones; staged preview, Revert, Save/reload, searchable disclosures, and Dark theme verified.~~
48. ~~Theme creation in Assistant: live Gemini 3.8 Flash + Low generation/refinement, inline palette review, explicit Preview/Revert/Apply, saved palette/reply reload, and local /theme off passed.~~
49. ~~Settings and workspace search upgrade: everyday phrases/typos, relevant field-level results, exact-control focus, shared workspace Settings results, keyboard navigation, draft/disclosure preservation, and phone containment passed manual Chrome QA. Luna diffs and privacy boundaries independently reviewed; automated regressions remain under item 45.~~
50. ~~Assistant response details, receipt labels, and source panels adapt to theme colors; light/dark/custom-light stats contrast checked and faint-label/dark-fallback defects fixed.~~
51. ~~Completed theme replies release the Stop-generating state; connected-provider composer hints refresh correctly after reload.~~

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
