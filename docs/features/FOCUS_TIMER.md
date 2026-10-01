# Focus Timer

Home, Create, full Focus, and the compact player use one canonical timer. Start,
pause, resume, reset, and duration changes use `sutra:focus-timer-command`;
`sutra:focus-timer-updated` carries the authoritative state. Core owns the clock
and existing persisted timer settings. The player adds no interval or storage.

The player appears for a running or paused session and follows navigation. Its
controls pause/resume, open the existing full Focus presentation, and hide the
controls to a restore button. Restoring moves focus to pause/resume. Idle/reset
and finished timers clear the player; a paused timer can be resumed from the
same canonical controls. Dismissal is transient and does not stop the timer.

The player yields to modals, All sections, full Focus, writing Focus mode,
application-update prompts, and critical save-recovery banners.
On phones it also hides when an editable field and a substantially shrunken
visual viewport indicate an open keyboard. Time changes do not announce every
second; running/paused state changes use a polite status. Buttons are at least
44 pixels. Theme tokens, safe-area spacing, and reduced-motion preferences are
preserved. `--sutra-focus-player-height` lets the shared phone layout reserve
room above navigation while the player is visible.

Physical keyboard/viewport behavior and automated timer persistence coverage
remain part of the morning verification handoff for this overnight branch.
