# Browser QA checklist — October 15, 2026

Candidate tested: e616e71 on codex/student-workflow-batch.
Manual Chrome QA used http://127.0.0.1:5195/Sutra.html, an isolated local origin.
No automated suites, provider requests, pushes, merges, deployments, remote writes,
or source fixes were performed in this pass. Starting the static server runs its
required core-runtime integrity assertion. The server was stopped for cached
loading, then restored. The viewport override was reset.

Struck entries 1–24 retain prior user approval/manual verification; they were not
all repeated in this pass. Newly passed items are 28, 30, 36, and 37.
Open entries remain open even when some subchecks passed. Browser checks do not
replace the pending CI, restore, external-service, or physical-device gates.

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
31. Settings: desktop/phone navigation, search, pending edits, Save, and Revert. NEEDS FIX: at 390×844, bottom navigation covers Save Changes. Desktop Save/Revert and reload passed; phone Back/search retained pending edits with no horizontal overflow.
32. Grammar/spelling/rephrase: cheap generation, editable review, Apply, Cancel, and Undo. Partial: empty grammar review and Cancel were checked; live generation/Apply/Undo remain open.
33. Writing guards: empty input makes no request and stale original text cannot be overwritten. Partial: empty passage disabled Generate; stale-text behavior needs a provider or CI fixture.
34. Strengthened page PIN: wrong/right PIN, change/remove, legacy upgrade, and reload. Open: new credential entry must be performed privately by the user.
35. Workspace lock: refresh/inactivity and retry delay. Open: user-entered QA credential required.
36. ~~Invalid Capture dates and leap days: February 31/month 13 stay unset; February 29, 2028 parses.~~
37. ~~Official exam Upcoming/Taken/Pending/Recorded states, reopen, reload, and separate practice scores.~~
38. Weekly planning: full-week coverage and already-scheduled work deduplication. Partial / NEEDS INVESTIGATION: Sunday task appeared, and re-planning excluded its added block; the first plan proposed 06:00–07:00 today when the app clock showed 19:29.
39. Wellness retirement: navigation/widgets/commands/Help and legacy data preservation; normal goals/habits/notes/Focus remain usable. Partial: Life dashboard omitted retired tools, and an ordinary goal saved/reloaded. Legacy portability and all discovery surfaces remain open.
40. Spreadsheet importer: XLSX values/formulas and cached offline use. Blocked by the Chrome file-upload limitation.
41. Incomplete restore: missing required assets and durable-save failure report failure without presenting success. Open: controlled CI fault fixtures required; no deliberate faults injected into the user workspace.
42. Sync safety: unauthenticated/corrupt encrypted content and conflict storms preserve data. Open: controlled CI/service fixtures required; remote data/configuration not changed.
43. Help/tutorial: current instructions, rendering, and navigation. Partial: Help opens and contains current workspace contracts; visible raw &amp; text and coverage of new writing commands still need review. No comprehensive link/tutorial pass completed.
44. Landing-page copy and nested 404 recovery paths. NEEDS FIX: unintended question marks remain in landing copy, image descriptions, separators, and grade A?. Direct local 404 → Home navigation works; nested hosting behavior remains unverified.
45. CI/hosting: Node 24, required suites, allowlisted artifact, offline resources, and security headers. Open: no push authorized; broad automated checks remain for GitHub CI.

## Evidence from this pass

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
