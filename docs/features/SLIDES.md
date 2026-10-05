# Slides mode

Slides is a local Create surface for building short class presentations without
leaving Sutra. A Slides deck belongs to one normal Note page and is created from
the New Page dialog. Choose **Slides**, set an optional title and parent
location, then choose **Title slide**, **Blank slide**, **Class presentation**,
**Research report**, or **Project pitch**. The dialog shows the selected starter's
description before you confirm with **Create slides**. Selecting a type or starter
only prepares the dialog; it does not create a page.
The deck lives at `page.slides`, which deliberately keeps ordinary note content
and unknown page fields intact.

## Durable model

`page.slides` normalizes to version 2 while retaining V1 and unknown-field compatibility. It contains the deck-wide `theme`,
`size`, and ordered `slides` list. Every slide and element has a stable local
ID. Elements use normalized percentage geometry and support text, basic shapes,
tables, inline local images, and simple charts. Speaker notes are stored on the slide.

Authored timelines are separate `content-timeline` elements; see
[Authored content timelines](CONTENT_TIMELINES.md) for their editable model and
portable text rendering.

The current interaction state—selected slide, selected element, inspector
visibility, canvas zoom, and presenter position—is session-only. It is never
persisted, so opening a deck does not cause Sync churn.

## Workbench editing

The editor includes session-scoped undo/redo, direct drag and resize for text,
shapes, tables, charts, and local images, plus a selection inspector for text size,
weight, text alignment, image fit/crop-to-fill, text color, fill, layer order, copy, duplicate, and delete. Arrow keys
nudge the selected object; Shift increases the movement. `Ctrl/Cmd+C`, `V`,
`D`, `Z`, and `Y` copy, paste, duplicate, undo, and redo. Page Up/Down and the
toolbar reorder the active slide. Objects snap to slide edges and centers while
dragging, and the inspector can align a selected object to any slide edge or
center line. Click an object to select it and drag its surface to move it.
Double-click text (including a table cell), or press Enter/F2 on a selected object,
to edit; Escape returns to object selection. Typing and Backspace affect text
while editing, rather than deleting the object. Eight corner/edge handles resize
selected objects. Hold Shift while dragging to move along one axis.
Enter and Shift+Enter preserve deliberate line breaks in text, shape labels,
and table cells through autosave, rerendering, reload, and export. These breaks
are stored as plain-text newlines, rather than editable HTML.

Selected objects expose compact Edit text, Duplicate, Delete, and Arrange tools.
The inspector offers exact left, top, width, and height percentages; changes
apply on Enter or when leaving the field. Center snap guides appear during a
drag. A completed drag and each text-edit session have separate undo checkpoints.
Drag geometry is a temporary preview until release; cancellation, ownership
changes, or an intervening page revision discard it. On touch, tap an object
to select it before dragging; unselected objects and text-edit mode allow
scrolling.

These interactions mutate only the owning `page.slides` record through the
canonical workspace bridge. Undo and clipboard data remain editor-session state
and do not become durable fields. Presentation mode uses read-only elements,
supports keyboard navigation, and lets a presenter toggle speaker notes with
`N`.

The compact toolbar groups **Insert**, **History**, and **Slide** actions and
keeps **New slide** and **Present** visible. Only one toolbar menu opens at a
time. Choosing an action, clicking outside the toolbar, or pressing Escape
closes it; Escape returns focus to its heading. Moving focus within a menu does
not close it.
Toolbar menus stay within the visible Slides workbench and viewport, including
after resizing; long menus scroll within the available height.
Slide thumbnails preview their contents and follow the deck's
16:9 or 4:3 ratio. The **Fit**, **−**, and **+** controls size the current slide
within the workspace; zoom is session-only and resets to Fit when another page
opens.

The header and selection guidance identify the current presentation, slide,
and selected object. An empty slide offers **Add text** and **Choose a layout**.
The Slide design disclosure starts open on wide layouts and collapsed on narrow
layouts. Selected object and Import and export disclosures start collapsed.
Speaker notes start collapsed at every size and open when selected. Use
**Rename slide** to edit a title. Changing a layout that would replace existing
slide objects asks for confirmation; the change remains undoable and retains
the slide title, speaker notes, and background.

## Local-first behavior

The deck mutates its owning page through the canonical `flowAtelier.pages`
bridge and schedules the normal `persistAppData` save path. Ordinary slide
edits must never invoke whole-workspace serialize/import or restore behavior.
As a result, deck text, themes, layouts, notes, and inline image data
participate in normal reload, encrypted `.sutra` export/import, duplication,
and workspace Sync without a Slides-specific server or network request.

Page and workspace lock events hide the editor, clear rendered content and
session clipboard/history, and close an active presentation. Unlocking reloads
the canonical deck. Presentation also closes when leaving Create or changing
the owning page; exiting normally returns focus to its opener.

When Slides is the active Note page, Sutra Assistant receives a bounded local
deck context: slide titles, text/shape labels, chart labels and values, and
speaker notes. Locked pages remain excluded. Sync transports the complete
`pages[].slides` record with the existing page conflict handling, so slide
changes and inline image data use the same encrypted, deterministic path as
other Note content.

Slides uses only local image files chosen by the student. V1 stores those image
bytes in the page model so existing workspace backup and Sync transport retain
them. Moving those bytes to the course attachment store is a follow-up needed
before very large decks should be encouraged.

## Exports and presenter

The **Import and export** section offers browser printing for PDF output. This
landscape print view retains slide object positions and fits text to each
object's slide-relative box. It omits inline images; tables and charts print
their available text rather than their native visual layout.
The presenter uses the full viewport, speaker notes, arrow/space navigation,
and Escape to exit.

The PPTX command creates a standards-shaped, local PowerPoint package with a
presentation part, slide master and layout, theme, slide relationships, DrawingML
text and shapes, local image media, table content, and rendered chart bars. Sutra
also stores a private lossless deck part in the package so a PPTX exported by
Sutra can be re-imported without flattening its editable objects. Standard PPTX
files import text and basic positioning; complex themes, SmartArt, transitions,
animations, and unsupported PowerPoint objects are listed in an import warning
instead of being silently discarded. No PPTX path makes a network request.

PPTX remains an interoperability format rather than a backup. Use encrypted
`.sutra` export when the complete workspace and its history must be preserved.

## Public bridge

`window.SutraSlides` is the namespaced integration seam. It provides page
creation, current-deck lookup, add-slide, presenter launch, and local import/export
commands. No remote API or unscoped global is introduced.

The bridge also exposes the reviewed Assistant seam. `slides_create_deck`
creates a local deck from bounded slide specifications, while
`slides_edit_deck` applies up to 24 operations to the current unlocked deck.
Supported operations add or update slides, speaker notes, local text, shapes,
and charts; arrange elements; reorder slides; and change theme or size. The
Assistant cannot create or alter image elements and never accepts a remote image
URL or performs a network fetch.

Operations are validated by the pure
`src/features/workspace/surface-assistant-actions.js` engine before the page is
mutated. A batch commits through the normal page save path as one change and
records a field-level Activity undo patch. Undo is fingerprint-bound to the
touched slides/elements so it fails closed if the student changed them again.
