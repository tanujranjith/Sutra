# Mobile Student Workspaces

Sutra keeps Home, To-do, Review, Settings, Capture, protected Notes, and the
phone navigation sheet on their existing canonical controls. The
`styles/responsive/student-workspaces-polish.css` override is intended to load
after the feature and shared mobile styles. It adds
narrow-screen layout refinements without adding screen behavior, hiding
destinations, or changing workspace data.

## Phone layout

- **Home** keeps the existing Next Up, agenda, Review, and save/backup actions.
  At narrow widths, agenda titles and their due context wrap within each row
  instead of being clipped, and the Timeline link keeps a 44-pixel target.
- **To-do** retains the All, Homework, and General category controls. Its inline
  task composer stacks subject, date, difficulty, and repeat controls, and the
  natural-language add field can use the full available width.
- **Review** presents page actions in a two-column grid, then a single column
  below 360 pixels. The card drawer sits above phone bottom chrome. Review
  dialogs keep a single scrollable body and a reachable close control.
- **Settings** continues to use its existing mobile category selector, search,
  settings controls, and Save/Reset actions. Phones and tablets use page-level
  scrolling rather than constrained panel rows. Pending Save/Reset controls
  clear the bottom navigation and Focus player. Inputs use a 16-pixel font and
  touch controls retain at least 44 pixels of height.
- **Create** keeps the page-list button accessible without covering Slides,
  Sheets, HTML Page, or folder headers when the Notes toolbar is hidden.
- **Quick Capture** keeps the existing type, date, optional details, course, and
  confirmation controls in one scrollable card. The footer remains part of
  that scroll surface when the keyboard or a short viewport reduces space.
- **Protected Notes** retains the PIN, unlock, duress, removal, and warning
  content. The lock screen and PIN-management sheet can scroll as a whole and
  keep the primary actions reachable.
- **More** remains a complete list of canonical destinations. Its sheet uses
  the available dynamic viewport height while retaining safe-area padding and
  its existing focus, dismissal, and navigation behavior.

At phone widths, workspace bottom padding uses the shared navigation, Focus
player, and safe-area tokens. A short-landscape rule caps sheets to the dynamic
viewport height. Desktop layout rules remain outside these narrow-screen
overrides. The stylesheet does not mask document overflow or remove horizontal
scroll from intentionally scrollable controls.

## Manual observations and remaining validation

Sequential manual inspection used a disposable localhost workspace: 360 × 800
for Home and To-do, 375 × 812 for Review and Practice, 390 × 844 for Capture and
Create workflows, 393 × 852 for Settings search and pending save controls,
414 × 896 for folders, Sheets, HTML, and a saved timeline Note, and 430 × 932 for
More and the Week agenda. Review's drawer was inspected at 844 × 390; it clears
the top navigation and bottom controls. Desktop Create was inspected at
1280 × 900. No document-level width overflow was observed on these screens.

These observations do not establish a complete device matrix. Morning checks
still include native keyboard-open Capture and PIN dialogs, protected-page
warnings and lock/unlock flows, reduced motion, dark themes, physical safe-area
behavior, rapid state transitions, every advanced destination, and persistence
or automated regression coverage. No physical-device or native-keyboard result
is claimed. See the overnight handoff for the feature-specific checklist.
