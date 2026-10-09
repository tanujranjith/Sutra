# Modern Notes Editor

The Modern Editor is the default rich-text surface for Create notes. The classic
editor remains available in Settings as a compatibility choice. Both surfaces
read and save the same note content and structured block records.

## HTML embeds and drawings

Insert an HTML embed or handwriting block at the caret. Each appears as a live
node inside the Modern Editor, so surrounding text and other blocks keep their
document order. HTML previews use Sutra's existing sanitizer and sandboxed
renderer. The embed menu edits its source or removes it; drag handles resize it. Drawing blocks
use the existing handwriting tools and save vector strokes.

`page.content` contains a lightweight anchor for each structured node, while
`page.blocks` holds its data. Inserting, moving, removing, and undoing a node
reconciles those two records before save. The records use the existing page
schema, history, backup, and Sync paths. Do not store editor-only UI state in
the page. A locked page must not mount a live node until it is unlocked.

## Split View

Split View presents two equal note panes in one workspace. Each header identifies
its note, and the active pane stays outlined with an **Active** marker while the
shared formatting toolbar names that note as its target. The two editor bodies
scroll independently. When the Notes column is narrower than 940px, the panes
stack vertically so both editors keep usable width.

Each pane still owns its editor instance, selection, history, and page context.
Switching the comparison note or closing Split View flushes pending edits before
the next page is loaded. Modern Editor V2 restores the comparison note's scroll
position when switching between notes. A locked note stays read-only in the
comparison pane until it is opened and unlocked in the main pane.

The text-colour and highlight toolbar controls offer preset swatches in the
native colour picker and still allow a custom colour. These choices format the
current selection and do not add editor-only state to the page.

## Page tags

Use **Add tag** below the page title in either editor. Enter or leaving the field
saves the name; Escape cancels. Names are trimmed and limited to 120 characters,
and duplicate names on a page are compared without case sensitivity. Legacy
string tags are accepted alongside tag objects; existing object fields survive.

The Create sidebar lists tags from accessible pages in the current space. A tag
filter stays active while the tree rerenders. The legacy tree-search path also
combines text and tag constraints. Matching nested pages remain visible even under collapsed folders.
Choose **All** to clear the tag filter. Tag entry belongs to the page that opened
it, so changing pages cannot attach an unfinished tag to another page. Locked
pages and blocked persistence writes do not accept tag edits.

## Page icons

Choose **Change icon** in a page's actions, or activate its icon in the Create
sidebar with a click, Enter, or Space. The emoji choices are keyboard buttons.
This also works for **Help & Docs**. Its content, identity, name, and deletion
protection stay built in; refreshing Help preserves its chosen icon. Remove
restores Help's books icon.

Icons use the existing `page.icon` field and travel in workspace backups. Help
pages are generated resources excluded from Sync, so their icon is a local
choice; a remote apply preserves that device's Help icon per space. Locked page
content must be authorized before changing its icon, and blocked workspace
writes prevent icon edits.

## Additional note tools

Notes supports editable rich links, reviewed inline AI drafts, and authored
timeline blocks through native editor transactions. See [Rich links](RICH_LINKS.md),
[Inline AI writing help](INLINE_AI_WRITING.md), and [Authored timelines](CONTENT_TIMELINES.md)
for interaction, privacy, persistence, and cancellation contracts.

## Canvas

Canvas is a freeform board stored on its ordinary page record. Its toolbar is
grouped into navigation, drawing, arrangement, conversion, and view controls;
the selected-object bar exposes the current selection count and arrangement,
layer, and lock actions. The board status shows object and selection counts and
the grid-snap state. Use the zoom percentage to reset the view or **Fit Canvas
content to view** to bring the board into view. The minimap shows the current
viewport when the board extends beyond the stage.

Panning stops immediately when the pointer is released; Canvas does not add
momentum after a drag. Wheel movement applies directly without an additional
animation. Zoom reset and Fit change the viewport without changing objects.

On an empty board, the centered hint points to the available ways to begin.
Canvas controls keep keyboard focus visible and use touch-size targets; on a
small screen, the toolbar and selection actions can scroll horizontally within
their own rows so the board remains usable without widening the page.

Canvas objects, connections, groups, background, viewport, and grid-snap choice
remain on the existing `page.canvas` record and use the existing page save,
backup, and Sync paths. Object edits use the existing undo and redo history.
Selection, active tool, and minimap visibility stay in memory; visual styling
does not add workspace fields or change object data. Locked linked notes remain
subject to the existing page authorization checks.

Text boxes, sticky notes, and shape text save each edit to the current object by
ID. Resizing or resetting the viewport preserves that text. Backspace/Delete,
arrows, selection, and Undo stay with a focused text field; board shortcuts only
act outside text editing. A text-edit session creates one board Undo checkpoint.
Linked-note cards show the opening lines, or an explicit empty/locked-note hint;
their Open action retains the normal note navigation and authorization path.

Both modern and classic slash menus keep the selected command visible during
arrow-key navigation without scrolling the document behind the menu.

An authored timeline is a separate Canvas object from scheduled-item cards.
Read its scrollable body, drag its header to move it, or use **Edit timeline**
to change the local draft before saving. It follows normal Canvas Undo/Redo.

## Compatibility

Stored anchors and block records remain readable in the classic editor. Keep
the classic toggle available for older content and recovery. No new persistent
workspace fields are required for the live nodes.

## Anchored comments

Select text and choose **Comment** in the selection toolbar or **Add comment on selection**. Modern Editor threads attach to the exact selected range, including formatted text and multiple paragraphs. Clicking highlighted text opens its thread; clicking a thread's quote returns to the passage. Open threads follow document order. Replies, editing, resolve, reopen, and deletion stay available.

Each split pane owns its comments. The Comments header identifies the active note. Wide screens reserve a review gutter alongside the document; narrower layouts use the existing drawer. Resolving hides the annotation and reopening restores it. If a passage is completely deleted, its thread remains accessible with a detached-text notice; editor Undo can restore the attachment.

Version-1 anchor metadata (`from`, `to`, `quote`, `prefix`, `suffix`, and `status`) lives inside `page.comments[].anchor`, alongside the existing durable thread. ProseMirror maps positions during edits; the normal page save, version-history, encrypted backup, and Sync paths preserve them. Decorations are never stored in note HTML or copied/exported as document markup. Unknown anchor schemas and comment fields are preserved.

Existing quote-only threads gain anchors only when their passage can be identified uniquely. Ambiguous or missing passages stay detached, without deleting discussion or choosing the first textual match. The classic editor retains quote-based comments and uniquely matched navigation; Modern Editor provides transaction-mapped annotations. The editor keeps a bounded in-memory anchor journal for recent undo/redo; durable restoration validates quote and surrounding context.
