# Modern Notes Editor

The Modern Editor is the default rich-text surface for Create notes. The classic
editor remains available in Settings as a compatibility choice. Both surfaces
read and save the same note content and structured block records.

### Grammar, spelling and rephrasing

At a caret, `/grammar`, `/spelling` and `/rephrase` preload eligible text from
the current note into the writing review instead of opening an empty passage.
The slash query is consumed immediately on activation, including with Enter.
Selecting text first limits the command to that selection. The visible scope
identifies the included blocks: links, code, embeds and mixed-format blocks stay
unchanged. Classic whole-note fallback includes plain-text blocks only.
Nothing is sent before **Generate draft**. Only the displayed passage and
instruction are sent; chat history and other workspace data are excluded.
Review or edit the draft and choose **Apply**, or Cancel without changing the
note. Whole-note drafts must retain the number/order of paragraphs (blank-line
separators), so applying preserves existing block structure and attributes.
An invalid draft stays open for correction. Source edits pause the review with
a warning; navigation, locking or remote replacement close it. Equivalent
same-note refreshes keep the session open. Accepted changes use the owning editor's
normal history/save path and support Undo.

The Assistant now opens as a full-height right sidebar below navigation. On
desktop the editor makes room for it and floating Focus, Feedback, and storage
controls move left with it. On phones it covers the workspace and hides those
controls until closed. The provider and thinking controls use the existing
Assistant configuration.

Modern Editor writing reviews show only changed words as temporary inline
suggestions. These are editor decorations, excluded from saved note HTML,
exports, and Sync. **View or edit full draft** expands the complete draft.
Apply commits exact changed spans through the owning editor; Cancel clears the
preview. Writing help uses this same review flow. The Sutra logo glides above
visible affected words; reduced motion and narrow layouts show suggestions
without the travelling character. Classic Notes retains its draft review.
The logo starts at the Assistant header, reaches the original word before the
suggestion appears, and returns after the pass; a single comma receives the
same entrance and editing pause. Scrolling or resizing ends the travel and
reveals the remaining suggestions. The writing composer uses a visible **Send**
label, Enter to send, and Shift+Enter for a new line.

## HTML embeds and drawings

Insert an HTML embed or handwriting block at the caret. Each appears as a live
node inside the Modern Editor, so surrounding text and other blocks keep their
document order. HTML previews use Sutra's existing sanitizer and sandboxed
renderer. The embed menu edits its source or removes it; drag handles resize it. Drawing blocks
use the existing handwriting tools and save vector strokes.

The HTML source dialog focuses untouched input when it opens. Deferred autofocus
preserves a selection or edit already made by the user and does not run after
that dialog has been closed or replaced.

`page.content` contains a lightweight anchor for each structured node, while
`page.blocks` holds its data. Inserting, moving, removing, and undoing a node
reconciles those two records before save. The records use the existing page
schema, history, backup, and Sync paths. Do not store editor-only UI state in
the page. A locked page must not mount a live node until it is unlocked.

Relocking saves pending authorized edits before removing session access, then
clears the classic mirror and Modern Editor document. This resets editor undo
history as well as rendered content; clearing the locked surface must never
overwrite the canonical note with an empty body.

## Split View

Split View supports every user-created Create page: Notes/documents, HTML,
Slides, Sheets, Canvas, and folders, including two pages of the same type.
Use **Split with another page** in a sidebar page's actions, then choose its
partner with the comparison selector. Candidates belong to the active space;
the protected generated Help page is excluded. Folder panes list their children.

Split View presents two equal page panes in one workspace. Each header identifies
its note, and the active pane stays outlined with an **Active** marker while the
shared formatting toolbar names that note as its target. The two editor bodies
scroll independently. Split View fills the available Notes workspace width and
height, with aligned editor starts in both editor modes. Long titles truncate;
the main note's tags scroll within their header row. When the Notes column is
narrower than 940px, the panes stack vertically so both editors keep usable width,
and the pane container scrolls when needed to reach the comparison note.

Each pane still owns its editor instance, selection, history, and page context.
Switching the comparison note or closing Split View flushes pending edits before
the next page is loaded. Modern Editor V2 restores the comparison note's scroll
position when switching between notes. A locked note stays read-only in the
comparison pane until it is opened and unlocked in the main pane.

Split View pairs specific pages. The Create sidebar shows one compact split-tab
row with both notes side by side, like a browser's paired tabs. Each half opens
its note; its × control unpairs the notes without deleting either page. Opening or
creating another page shows that page normally without replacing either member.
Select either sidebar shortcut to return to the same two panes; choosing the right page
activates its editor. A protected right-hand page opens in the primary pane for
the normal PIN flow. The comparison selector explicitly changes the partner.
Unpair or Close Split View ends the pairing and restores the separate sidebar rows; deleting or expiring a member also
ends it instead of silently substituting another page. Focus mode temporarily
hides the split without unpairing it.

The pair uses the existing split-pane contexts, secondary-page setting, and
split-view preference, so it survives reload and the existing backup paths.
There is no top tab strip or separate Paired notes list. The shared row occupies
the first member's existing sidebar position. Leaf members' ordinary rows are
hidden while paired and restored on unpair; a parent entry stays available if
it owns children, preserving its expand/collapse controls. This is presentation
only: original pages keep their folders and saved ordering.
Only the active space's pair is shown; no new workspace fields are added.
Pending edits in both panes save through their existing paths before navigation.

Non-note comparison editors run the existing first-party editor scripts in a
same-origin blank iframe with independent DOM, selection, history, and controls.
It does not boot another Sutra app, open a database, or own a workspace snapshot.
Its bridge resolves the exact live secondary page and delegates saves to the
host's canonical persistence path. Pending HTML source, spreadsheet input, and
inline edits flush before a normal switch. A lock, remote apply, or changed page
reference invalidates the old frame without committing stale DOM. Locked pages
do not mount a frame; use the normal main-pane PIN flow first. Authored HTML
continues to run only in its nested offline sandbox, without parent access.

Canvas uses one implementation instantiated with pane-specific DOM, page
resolution, and runtime state. Its primary aliases remain compatible. The
primary native editor hides only its own inactive note surface; it must not
hide the sibling split pane. The shared rich-text toolbar is disabled while a
native page owns focus; that editor supplies its own tools. Theme tokens and
local styles apply inside the comparison frame. No new durable fields are added.

The toolbar's **Insert and note tools** menu combines the former plus dropdown
and three-dot menu. Its Insert and Page and view sections retain all actions,
including page breaks, split controls, document tools, and zoom. It scrolls
within the viewport and supports arrow keys, Home/End, and Escape.

The text-colour and highlight toolbar controls offer preset swatches in the
native colour picker and still allow a custom colour. These choices format the
current selection and do not add editor-only state to the page.

## Pages mode

Enable **Pages** from the note toolbar's More menu, or in editor settings. The
primary Modern Editor inserts automatic visual gaps before overflowing text
lines and small blocks. Stored manual page breaks still start a new sheet.
Page size and margins use the same settings in both controls; editing, paste,
zoom, width changes, and font loads recalculate the layout.

Automatic gaps are view decorations, excluded from saved HTML, history,
copy/export, backups, and Sync. The comparison pane keeps its own continuous
editor. Oversized atomic images, embeds, drawings, and tables remain intact
and can span sheet intervals; they are never clipped to manufacture a gap.
The Classic Editor retains authored manual page breaks.

After decorations mount, each spacer adjusts from its own line or block's
rendered position so inline layout offsets do not accumulate across sheets.
Painted gaps then align to the measured sheet boundary. The spacer remains
view-only and does not change stored note content.

## Moving pages between spaces

Choose **Move to space** from a page or folder's sidebar actions, select a
destination, then confirm **Move**. Notes/documents, HTML pages, Slides, Sheets,
Canvas, and pages with attachments use the same action. The moved page opens in
the destination space. Help & Docs stays protected in its own space.

A parent moves with its descendants. A nested page becomes a top-level page in
the destination; its children's relative hierarchy remains intact. Conflicting
titles stop the move and ask for a rename or another destination; nothing is
overwritten. IDs, type-specific records, unknown fields, attached asset references,
links, PIN protection, and pinned status remain with the pages. Pending editor
changes flush before metadata changes. No new durable fields or attachment copies
are introduced. Moving both split members together preserves the pair; moving
only one member explicitly warns that confirming will unpair them.

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

## Help & Docs

The generated **Help & Docs** reference is read-only in the Modern Editor.
Its table-of-contents and **Back to top** buttons retain their section targets
and keyboard navigation in both panes. Jumps focus the destination heading
and account for the fixed toolbar. Ordinary notes still use the editable
document model; Help navigation adds no workspace fields or persistence path.
Rendered Help anchor IDs are scoped to their editor host to avoid collisions
with the hidden Classic mirror or a second pane. Serialization restores the
canonical Help IDs and targets. Its read-only textbox exposes `aria-readonly`.

## Page icons

Choose **Change icon** in a page's actions, or activate its icon in the Create
sidebar with a click, Enter, or Space. The emoji choices are keyboard buttons.
This also works for **Help & Docs**. Its content, identity, name, and deletion
protection stay built in; refreshing Help preserves its chosen icon. Remove
restores Help's books icon.

All icons includes every emoji in the bundled offline keyword dictionary as
well as curated categories. Search accepts glyphs, names, aliases, and multiple
keywords (for example, "red heart"). Buttons include keyword labels for screen
readers. Ctrl/⌘+Shift+V pastes plain text in both editors, retaining line breaks
while bypassing rich HTML, smart links, and clipboard images.
The shortcut uses data from the browser's native paste or input event, then a
text-only editor insertion. It does not call the Clipboard Read API or request
additional clipboard permission. If the clipboard supplies HTML without a text
format, Sutra extracts text from sanitized, inert markup. Empty paste events
remain available for the browser's subsequent native input event.
Ordinary Ctrl/⌘+V keeps its rich-paste behavior.
Classic plain-text paste is one Undo step, with Ctrl/⌘+Shift+Z available for Redo
in either note pane.

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

Each split pane owns its comments. The Comments header identifies the active note in both editor modes. Switching to a locked note clears its discussion from the dock until it is authorized. Wide screens reserve a review gutter alongside the document; narrower layouts use the existing drawer. Resolving hides the annotation and reopening restores it. If a passage is completely deleted, its thread remains accessible with a detached-text notice; editor Undo can restore the attachment.

Version-1 anchor metadata (`from`, `to`, `quote`, `prefix`, `suffix`, and `status`) lives inside `page.comments[].anchor`, alongside the existing durable thread. ProseMirror maps positions during edits; the normal page save, version-history, encrypted backup, and Sync paths preserve them. Decorations are never stored in note HTML or copied/exported as document markup. Unknown anchor schemas and comment fields are preserved.

Existing quote-only threads gain anchors only when their passage can be identified uniquely. Ambiguous or missing passages stay detached, without deleting discussion or choosing the first textual match. The classic editor retains quote-based comments and uniquely matched navigation; Modern Editor provides transaction-mapped annotations. The editor keeps a bounded in-memory anchor journal for recent undo/redo; durable restoration validates quote and surrounding context.
