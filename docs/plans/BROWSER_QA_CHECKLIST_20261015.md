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
11. Backups: scheduled arrival and full restore of notes, tasks, images, and attachments. Open: provider setup/private passphrase and file-upload blocker.
12. Browser/OS notifications: delivery, correct destination, and deduplication. Partial: in-app Send test toast appeared. Actual Windows notification delivery was not observed.
13. ~~Application Sheets tabs, Add Row, editing, persistence, and checkbox labels.~~
14. ~~SAT/ACT dates and countdown boundaries.~~
15. ~~College/major rankings, unrated exclusion, and College Matrix input focus.~~
16. ~~Ordinary task notes/Reference URL persistence and cancelled-draft reset.~~
17. ~~Blank essay word targets.~~
18. ~~Homework titles/IDs render quotes and markup literally, including after reload.~~
19. Diagnostic credential scrubbing with controlled synthetic secrets and exported diagnostics. Open: requires controlled CI fixtures; no real credentials were inspected.
20. ~~Grade Planner category/score preservation through Semester Setup and reload.~~
21. ~~Assistant permission safeguards, consented locked-note read, and editor remaining locked.~~
22. ~~Calculator negatives, parentheses, keyboard entry, errors, and recovery.~~
23. ~~HTML-page PIN unlock and source preservation.~~
24. ~~US Letter default and A4 selection.~~
25. Imported task Notes/Reference URL editing, reopen/reload, and unknown fields. Blocked: Chrome extension file chooser did not deliver the import selection.
26. Stateful follow-up: correct task/URL and matching citations. Open: no provider key in this separate QA origin.
27. Successful one-time PIN read: accurate source disclosure and editor stays locked. Open: needs user-entered QA PIN plus a provider.
28. ~~Major Matrix keyboard editing: lower rows, Tab/Shift+Tab, ranking update, and reload persistence.~~
29. True browser zoom at 67%/150% across Home/Create/Assistant/Settings, plus narrow screens. Open: viewport resizing is not browser zoom; the available controls did not establish true zoom coverage.
30. ~~Bundled Sutra icons in light/dark themes, phone navigation, and cached loading with the local server stopped.~~
31. ~~Settings: desktop/phone navigation, search, pending edits, Save, Revert, and reload persistence; phone actions clear the bottom navigation.~~
32. Grammar/spelling/rephrase: cheap generation, editable review, Apply, Cancel, and Undo. Partial: empty grammar review and Cancel were checked; live generation/Apply/Undo remain open.
33. Writing guards: empty input makes no request and stale original text cannot be overwritten. Partial: empty passage disabled Generate; stale-text behavior needs a provider or CI fixture.
34. Strengthened page PIN: wrong/right PIN, change/remove, legacy upgrade, and reload. Open: new credential entry must be performed privately by the user.
35. Workspace lock: refresh/inactivity and retry delay. Open: user-entered QA credential required.
36. ~~Invalid Capture dates and leap days: February 31/month 13 stay unset; February 29, 2028 parses.~~
37. ~~Official exam Upcoming/Taken/Pending/Recorded states, reopen, reload, and separate practice scores.~~
38. ~~Weekly planning: seven-day coverage, future starts, after-hours rollover, expired-preview rejection, single-tab schedule persistence, and already-scheduled work deduplication.~~
39. Wellness retirement: navigation/widgets/commands/Help and legacy data preservation; normal goals/habits/notes/Focus remain usable. Partial: Life dashboard omitted retired tools, and an ordinary goal saved/reloaded. Legacy portability and all discovery surfaces remain open.
40. Spreadsheet importer: XLSX values/formulas and cached offline use. Blocked by the Chrome file-upload limitation.
41. Incomplete restore: missing required assets and durable-save failure report failure without presenting success. Open: controlled CI fault fixtures required; no deliberate faults injected into the user workspace.
42. Sync safety: unauthenticated/corrupt encrypted content and conflict storms preserve data. Open: controlled CI/service fixtures required; remote data/configuration not changed.
43. Help/tutorial: current instructions, rendering, and navigation. Partial: Help opens and contains current workspace contracts; visible raw &amp; text and coverage of new writing commands still need review. No comprehensive link/tutorial pass completed.
44. ~~Landing-page copy and local nested recovery paths: punctuation, image descriptions, grade display, logo, and both recovery links.~~
45. CI/hosting: Node 24, required suites, allowlisted artifact, offline resources, and security headers. Open: no push authorized; broad automated checks remain for GitHub CI.
46. Save-conflict investigation: a later disposable Timeline edit raised a storage-mismatch warning. Its writer/source is unconfirmed. A single-tab planned block survived reload, but concurrent-tab save safety remains open.

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
