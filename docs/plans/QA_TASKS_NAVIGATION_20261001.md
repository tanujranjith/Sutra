# Tasks and Navigation Manual QA

Date: 2026-10-01

This report records three manual UI passes in an isolated checkout and browser origin. It is based on CUA accessibility snapshots and actions. No automated tests, browser test runners, builds, installs, provider requests, credentials, Sync, or settings/security changes were used.

Environment: worktree `D:\Desktop\Engineering\Coding\Active projects\Sutra\.tmp\qa-20261001\tasks-navigation`, detached HEAD `e2a6e1a`; localhost server `http://127.0.0.1:5281/Sutra.html` (exec session 44158, kept running); Chrome session `🧪 Tasks QA`, tab `2129982953`. The checkout includes reviewed follow-up commits for Canvas timeline undo, Capture type refresh, mobile Create touch targets, and mobile Review labels/actions. Synthetic records were created at this port's origin and were not deleted.

## Pass 1 — Happy paths

- Closed the first-run welcome overlay without choosing a profile or setup options.
- Created course `QA Biology`, set its icon to `🧬`, and added homework `QA Biology reading`. The To-do Homework category showed the task and class. Added General task `QA return library book`; the General category showed it separately, and Home surfaced it as a captured task.
- Marked the homework complete. Sutra showed the completion follow-up asking for an effort estimate; submitting 30 minutes produced “Logged 30m — future estimates will adapt.” Marking it incomplete returned it to Not Started.
- In Create, changed Help & Docs to `📘`; the picker closed with “Icon updated!” and the page title/content remained available. The picker also accepted the course emoji with an “Icon updated” message.
- Created page `QA Tags`, added tag `Lab`, and tried lowercase `lab`. The duplicate produced “Tag already exists” and only one Lab chip remained. Selecting Lab in the sidebar filter narrowed the page list to QA Tags.

Expected/observed: Homework and General were separate categories, completion/reopen worked, the feedback prompt appeared, icon pickers accepted custom emoji, and tag duplicate/filter behavior matched expectations. Icon glyph rendering and the completion particle effect could not be checked visually in this CUA session.

## Pass 2 — Reload, navigation, cancellation

- Reloaded the page. Home retained `QA return library book`; To-do retained `QA Biology reading`, the Homework selection, and the `QA Biology` course in its class picker. Create retained the Lab chip/filter and QA Tags page.
- Entered an unsaved tag `Scratch`. Escape did not clear it through this browser input path; after reload it was absent while saved `Lab` remained. This does not distinguish input delivery from tag-field Escape behavior.
- Reproduced the Capture selector reopen cases after applying the reviewed Capture fix:
  1. Selected Homework in Quick Capture, canceled, then opened Home Add Task. Before typing, the modal said ADD TASK and the selector’s accessible name/value were “Type General task” / “General task.” A neutral title parsed to To-do · General.
  2. Opened To-do with Homework selected and chose Add homework. Before typing, the modal said ADD HOMEWORK and the selector’s accessible name/value were “Type Homework” / “Homework.” A neutral title parsed to Homework assignment.
  3. Selected Test / quiz in generic Capture and canceled, then reopened generic Capture. It started with “Type General task” / “General task” and QUICK CAPTURE. A title mentioning a test parsed as Test / quiz; replacing it with a neutral title parsed to To-do · General and updated the header to ADD TASK. These drafts were canceled; no test drafts were saved.
- Started the canonical Home timer. The new-version banner was visible and the mini-player was suppressed. Choosing Later dismissed the banner; To-do then exposed the running player and its Pause, Open full Focus, and Hide controls.
- The first reload comparison used a timer that had run for roughly three minutes before it was paused, so its 20:59 → 17:54 change was elapsed running time. A tighter follow-up paused it at 17:45, navigated To-do → Create → Home over about 18 seconds (value stayed 17:45), then reloaded. After closing the welcome overlay and choosing Later on the update banner, Home and the restored player both still showed 17:45 / Paused.

Expected/observed: saved task, course, and tag state survived reload. Capture type labels, selected values, modal headlines, and parsed destinations aligned after each reopen. The update notice suppressed the player until dismissed, and a paused timer value remained unchanged during idle navigation and across reload.

## Pass 3 — Keyboard and Focus edge cases

- On To-do, opened Add homework and pressed Escape. The modal closed and keyboard focus returned to the originating Add homework button.
- With the timer visible on To-do, Pause changed status to Paused and exposed Resume. Resume changed it to Running and exposed Pause. Hide replaced the player with “Show focus timer player”; clicking that restored the player and left focus on its Resume control.
- Open full Focus displayed the full-session surface with PAUSED, remaining/elapsed/planned time, progress, and Start. Minimize returned to Sutra with “Focus view closed — the timer keeps its state.” The Home timer card remained usable and reflected the same session.

Expected/observed: timer controls stayed synchronized, full Focus opened and minimized without resetting the session, modal Escape worked, and modal visibility suppressed the player until dismissal.

## Limits and follow-up

- No screenshot files were captured, so icon appearance, particle animation, exact layout overlap, and actual pixel bounds remain unverified. The available CUA surface returned AX snapshots but no viewport dimensions or read-only computed DOM bounds; mobile/short-landscape layouts and the mobile More sheet were not exercised.
- Browser console logs were not exposed in this session.
- The tag-entry Escape result is inconclusive; its unsaved value did disappear on reload. All other stated results were observed through rendered UI text/accessibility state.
- Synthetic QA course, tasks, and page remain in the isolated `127.0.0.1:5281` origin. No user data or other browser-origin storage was touched.


## Supplemental pass — Inline AI on QA Tags

- On the synthetic QA Tags note, opened AI writing help. The dialog focused its instruction field and disclosed: “Generate sends your instruction and the note text shown here to your configured AI provider. Review any provider send confirmation before continuing. Your note changes only after you approve a draft.” It showed “Text context included,” “No separate selection included,” and “Ready when you are.”
- Did not click Generate. No provider request was initiated by this check, no provider or credential was configured, and no security setting was saved. As a result, the actual missing-provider request/error branch remains unverified; the disclosure and pre-generation state were checked.
- In this Chrome CUA pass, Escape with the instruction field focused left the dialog open. Clicking Cancel closed it without changing QA Tags; focus was reported on Create, but the native pointer action had not focused the opening toolbar button, so this focus result is inconclusive. In a distinct IAB keyboard check, root reports Enter on AI writing help opened the dialog and Cancel restored the trigger aria-label; a second Enter followed by Escape closed the dialog (0 helper dialogs) and restored the trigger. The Chrome CUA Escape discrepancy remains inconclusive across input surfaces.



## Browser handoff limitation

At final handoff, Chrome inventory listed the 5281 page as tab `2129982963`; the original bound tab `2129982953` was gone. Rebinding the current tab timed out, so the agent could not reapply its handoff mark. The server remains running in session `44158`; retaining this Chrome tab after the turn is not confirmed. The primary preview tab on port 5280 was marked as a deliverable.
