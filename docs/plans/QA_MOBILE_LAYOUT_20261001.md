# Mobile layout manual QA — 2026-10-01

This report records three manual UI passes against the isolated local Sutra checkout. The final source under inspection was the parent-reviewed QA worktree at detached HEAD `ef74a3f` (includes the reviewed Canvas/Capture/mobile-footer/Review/touch-target fixes and final Focus/navigation touch-target fix `6af909e`).

## Environment and coverage

- Worktree: `D:\Desktop\Engineering\Coding\Active projects\Sutra\.tmp\qa-20261001\mobile-layout`
- Local server: `node scripts/serve-static.mjs 5283`, live exec session `17030`; left running for review.
- Browser: Chrome, tab `2129982960`, origin `http://127.0.0.1:5283/Sutra.html`; all browser actions stayed on this tab and port. The viewport override was reset before handoff.
- Synthetic UI-created data: `QA Mobile — Synthetic task` and `QA Mobile Folder` with child `QA Mobile Child Note`. No storage reset or direct app-data injection was used.
- Console: the tab’s captured error log was empty at the final read.

## Pass 1 — portrait widths

Checked Home, To-do, Capture, Create/folder, More, Review, Settings, and Timeline at 360×800, 390×844, 414×896, and 430×932 across the pass. At each checked state, document `clientWidth` equaled `scrollWidth`; no document-level horizontal overflow was observed. To-do’s summary cards use an internal horizontal strip, while the document stayed within the viewport.

- Home displayed the synthetic task, due summary, agenda entries, Review entry, and saved-locally status. At 360px the Home shell measured about 318px wide; at 430px it measured 380px. The 430px bottom navigation buttons measured about 80×56px.
- To-do retained All/Homework/General filters, Filter, Add task, Export, and the synthetic task. Primary controls and row actions measured at least 44px high at the inspected phone widths.
- Capture was checked expanded at 360px and through Quick Capture at 430px. The main Capture action measured 304×44px at 360px; the 430px quick-capture action measured 183×44px. The dialog stayed within the viewport width.
- Create showed the folder’s contextual “new page in this folder” actions and child note. At 430px, the folder actions were 162×48px or 162×60px. The 414px New Canvas dialog’s controls had computed 44px minimum height; Chrome reported a 40.92px transformed rectangle while its modal parent was scaled by 0.93, so this was recorded as a CSS-transform measurement limitation rather than a confirmed undersized target.
- More exposed Save locally, Export, Import, Data & Backup, Report a problem, Focus timer, New dashboard, Notifications, and workspace sections. The 390px Chrome pass reported a persistent `translateY(24px)` and a sheet bottom 24px below the viewport; Settings and Assistant rows ended 7px below the viewport, with the Settings center still inside it. A parent-run IAB observation at 430px showed the settled sheet fully visible, so this conflicting Chrome measurement remains unconfirmed and screenshot-level appearance is not asserted.
- Review was opened through Home. After the reviewed route fix, Home’s Review card opened `#view=apstudy` with the mobile view selector set to Review; Start review opened `#view=review` and showed the expected “No cards due right now” state. At 360/390/430px, the selector measured 98×44px and the active Start review button measured about 131×44px. Document width equaled viewport width.
- Settings Appearance was staged and reverted at phone size. At 430px, the action bar stayed above the bottom navigation and its Revert control was 44px high. The final landscape recheck is recorded in Pass 2.
- Timeline Week was populated by the synthetic task and its focus block. After the final touch-target patch, the 390px view showed all seven date-strip choices at 44×69px, selected Thursday, and a selected-day agenda with two blocks. Today, previous/next date, date field, Add Block, and More timeline controls each measured at least 44px. Document width was 390/390.

## Pass 2 — landscape phone and desktop

At 844×390, Timeline retained its desktop seven-day hour grid, time labels, and two scheduled synthetic items. The timeline view filled the available vertical region (x=0, y=66, 844×324); document width remained 844/844. After `f29804b`, Today measured 405×50px, date arrows 44×44px, the date field 131×44px, Add Block 818×44px, and More timeline 44×44px.

Opening More workspace sections exposed Assistant; Escape closed the menu and returned keyboard focus to its toggle. After `6af909e`, visible `.top-nav .view-tab` controls computed a 44px minimum height. At 844×390, To-do, Create, Timeline, and Settings each measured 44px high; selected Home measured 41.36px under an observed scale(0.94) transform. Root independently measured settled navigation controls at approximately 43.991px with a 44px computed minimum. Chrome screenshot capture was unavailable and its transformed measurements can reflect frozen transitions, so the size difference is recorded as an environment-specific observation rather than a confirmed visual defect.

Settings was opened at 844×390 and Appearance density was staged then reverted. With the final CSS, Reset Appearance, Revert, and Save Changes each measured 44px high. The sticky action bar occupied y=308–378 within the 390px viewport. The accessibility tree included a Timer Finished element, but its visual visibility and bounds were not verified. Revert restored “Saved” and “No pending changes.”

At 1280×900, the existing desktop Week grid fit inside the viewport: calendar bounds x=11, y=155, 1248×684; its client and scroll sizes matched. Document width was 1280/1280. The phone-only touch-size rules did not change the desktop grid.

## Pass 3 — motion, focus dialog, and populated content

The Appearance Motion control was changed from Full to Reduced, applied, and then changed back to Full and saved. The final state reported Motion full, Saved, and no pending changes. The More → Focus timer flow opened “Plan your focus session” with a 25-minute default; it was canceled without starting a session. At 390×844, Cancel and Open Focus each computed a 44px minimum height. Chrome measured each transformed box at 40.92px while `.modal-content` remained at matrix(0.93, 0, 0, 0.93, 0, 9.3) and opacity 0 after a 500ms wait; this appears to be a frozen transition measurement, not a confirmed target-size defect. The document client and scroll widths matched at 380px. The accessibility tree exposed a Timer Finished element, but its visual visibility and bounds were not verified. No focus-player surface was available in this profile, so the player-plus-modal interaction could not be evaluated. The synthetic task provided populated schedule content; a long editor document was not created.

## Evidence limits

Chrome screenshot capture timed out in this environment, so this checkout contains no screenshots and visual claims beyond captured DOM/accessibility facts are unverified. The parent’s IAB observations are separate evidence and are not screenshots from this tab. Physical-device safe areas were not tested. No automated tests, browser runners, builds, installs, or external requests were used.
