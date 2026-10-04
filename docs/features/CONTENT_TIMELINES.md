# Authored content timelines

An authored timeline is a sequence students create to explain stages, milestones,
or ideas. Its `when` values are display text chosen by the author. Sutra does not
parse them, schedule them, or connect them to calendar blocks.

## Model

The version 1 model is:

```json
{
  "version": 1,
  "title": "Research project",
  "layout": "vertical",
  "events": [
    {
      "id": "event-start",
      "label": "Choose a question",
      "when": "Week one",
      "description": "Write down what you want to find out."
    }
  ]
}
```

Each event has a stable, unique string ID and text fields for its label, display
timing, and description. Layout is `vertical` or `horizontal`. The pure model
helper defaults missing supported fields deterministically, preserves unknown
top-level and event fields, and returns new records from edits. It does not
regenerate IDs while normalizing or rendering. New events receive unique IDs.
Text and event arrays are not silently shortened.

Supported records can be edited through the shared timeline editor. Malformed
records and versions newer than the current helper are read-only; future data is
kept intact rather than rewritten as version 1. Renderers show a safe fallback
for records they cannot interpret.

## Create surfaces

The **Timeline actions** button appears in the existing editor toolbar for a
writable current Note, Canvas, Slides, or HTML Page. Its menu offers **Insert
timeline** and **Edit selected timeline**; editing is available when a timeline
is selected in that editor. The menu keeps action results and editor
availability messages beside those choices. Timeline actions require canonical
page write authorization. When the Modern Notes editor is unavailable, Sutra
explains that limitation instead of inserting through the classic editor.
Folders, Help & Docs, Sheets, and PDF workspaces do not embed authored
timelines. A PDF can link to a Note that contains one.

For HTML Pages, the source editor must be visible: Code or desktop Split shows
the actions and timeline picker; Preview hides them without changing content.

Insertion captures the editor's current caret or text selection before the
timeline editor opens, then inserts through the host's normal editor action.
Selection tokens also prevent an edit from changing a timeline after its page
or selected content has changed.

The model stays in each host's existing page record:

- Notes store an inert timeline section with its JSON model in `page.content`.
  The Modern Notes editor treats it as an atomic node so ordinary typing does
  not alter its model metadata.
- Canvas stores it as a `content-timeline` object with a `contentTimeline` model
  in `page.canvas.objects`. This type is separate from Canvas's existing
  `timeline` object, which represents a scheduled item.
- Slides store it as a `content-timeline` element with a `contentTimeline` model
  in `page.slides.slides[].elements`. The model remains authoritative; the
  ordinary slide text field is only a compact title fallback and is subject to
  the existing text limit. Sutra's print/PDF output and standard PPTX shapes
  derive a complete plain-text rendering of the events from the model. A
  Sutra-exported PPTX also retains the complete editable model in its private
  deck part.
- HTML Pages store an inert section with an escaped JSON model attribute and safe
  rendered content in `page.htmlDocument.source`. When one or more wrappers are
  present, a native picker in the HTML Page toolbar lets you choose which one to
  edit. Selecting its source range also selects that timeline when the range is
  unambiguous. Source is parsed only with an inert DOM parser; the preview
  continues through the existing isolated sandbox.

These placements add no page-level field or second persistence store. Notes,
Canvas, and Slides updates use their normal undo and save paths. HTML Page
updates use the existing source-size check, preview refresh, and save path. Its
Undo/Redo controls and source-editor Ctrl/Cmd+Z shortcuts retain bounded,
session-only full-source snapshots for typed source input and timeline
insertions/replacements, so later typing is included in the undo sequence.
Selection tokens reject updates if the page or selected timeline changed while
the editor was open. The helper's HTML contains fixed tags and classes and
escaped text. Host markup parsing uses an inert DOM parser and does not execute
or interpret scripts.

Because the data remains inside the existing page record, it follows the normal
workspace save, encrypted `.sutra` backup/restore, and encrypted Sync paths. Host
normalizers preserve unknown timeline model fields. HTML source retains its
existing size limit and isolated offline preview behavior.
