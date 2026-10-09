# Sutra Native PDF Workspace

## Contract

The PDF workspace is a contextual surface, not a top-level Files section. A PDF is stored once in the existing `courseWorkspace.files` metadata store and `noteflow_attachments_db` byte store, then linked to courses, notes, homework, assignments, private documents, or PDF page sources through `attachmentLinks`.

The feature is default-on and gated by `settings.preferences.workspace.pdfWorkspaceEnabled`. When a user disables it or when the native runtime cannot start, Sutra retains its safe browser preview and download path.

An open PDF owns its toolbar, observers, PDF.js documents, and in-flight render tasks. Starting another open makes the newest request the only one allowed to mount; leaving Notes or loading a different note cancels a pending or active embedded workspace. Teardown removes the PDF controls, restores the Notes toolbar, cancels rendering, and releases opened PDF.js documents. Canvas and thumbnail surfaces start with an opaque white background so transparent PDF regions render consistently.

## Local runtime

- PDF.js 6.1.200 is vendored under `assets/vendor/pdfjs` and handles rendering, text extraction, outlines, search, forms, and metadata.
- pdf-lib 1.17.1 is vendored under `assets/vendor/pdf-lib` and handles assembly and generated exports.
- A local Liberation Sans font and PDF.js character maps/standard fonts are included. The feature makes no runtime CDN request.
- Served Chromium and WebKit pages use the vendored PDF.js worker. Direct `file://` use and Firefox use the tested same-thread vendored runtime because the worker path is not reliable for the current form fixture there; browser preview remains the final fallback.
- Embedded PDF JavaScript is never evaluated. External links are not opened automatically.

## Workspace context and status

The top bar groups the document name and visible-page count, search, zoom, and
document actions. The annotation toolbar groups markup, document, and selected
text actions. When those selection actions are available, the footer reports
the selected word count and page. The page count follows the most visible page
while scrolling.

The reader begins with a local-copy loading message. Page-render failures show
an inline alert and a workspace status message; they do not change the original
PDF bytes. An empty page arrangement explains that the original remains intact
and points to the Pages organizer or reopening the exact original. On wide
screens, the inspector stays beside the reader. On narrower screens, **Inspector**
opens a closable bottom panel for the outline, bookmarks, comments, and reading
text; Escape closes it and returns focus to the Inspector button. Phone layouts
hide thumbnails and keep the current page count visible while the reader scrolls.

## Data ownership

`pdfDocuments` stores page plans, stable page IDs, rotations, bookmarks, and bounded durable checkpoints. `pdfAnnotations` stores independent stable records with normalized coordinates in the unrotated page coordinate system. Form values are annotation records with `type: "form"` and a `fieldKey`.

Zoom, selection, scroll position, open panels, and undo/redo stacks are session-only. The original attachment bytes are immutable. Removing a PDF from one context removes only that link. Byte removal is allowed only when no attachment link or PDF page source still refers to the file.

Capture/Notes insert linked PDF cards and keep **Convert to Note** explicit.
Courses, Homework, Assignment Studio, private documents, and the PWA Share
Target all route bytes and links through the same attachment bridge. Homework
and Assignment Studio provide contextual upload actions; an Assignment Studio
file can also be linked to its Homework record without duplicating bytes.

An imported PDF Note keeps its identity through the `attachmentLinks` record;
the linked-PDF card remains a compatibility affordance and is preserved by
Modern Editor V2. Reopening honors only a linked-PDF wrapper card that names a
PDF attached to that Note. A legacy wrapper without its marker may recover a
single unambiguous PDF through the canonical relationship; ordinary Notes with
PDF attachments and ambiguous multi-PDF wrappers remain Notes until a student
opens a PDF explicitly. **Convert to Note** keeps the source card and exact
attachment available, marks the card as non-auto-opening, and leaves extracted
text editable after navigation and reload. Import uses the page load performed
by `createImportedPage()` once so an editor hydration snapshot cannot replace
the new card immediately.

The PDF document actions include **Create timeline note**. It opens the shared
timeline editor and creates a separate Notes page through the canonical
workspace bridge; the PDF document and its original attachment bytes are not
changed. When the PDF is open inside a source note, the new page keeps that
source reference and PDF title. A standalone attachment creates a timeline note
with the PDF title as its source label and no page link. The action rechecks the
open PDF, source page, current view, and write access after the editor closes;
cancellation leaves the PDF unchanged and stale source context refuses the
creation. Locking the source page or workspace closes the reader and cancels a
pending embedded open; original attachment bytes remain unchanged.

## Editing boundary

V1 supports highlights, underline, strikeout, ink, erasing, text boxes, comments, stamps, visual signatures, bookmarks, form values, page reorder/rotation/removal, splitting/merging plans, and PDF/image assembly. Visual signatures are ink; they are not cryptographic signatures. Existing page text cannot be arbitrarily replaced, and scanned PDFs are not searchable without future OCR.

## Export

The export dialog always distinguishes:

1. Exact original bytes.
2. Current page arrangement without visual annotations.
3. Current page arrangement with flattened visual annotations.

Form answers have separate include and flatten choices. Comments become numbered page markers and may include an appended summary. Every generated export is reopened with PDF.js before download. Exact-original output is compared byte-for-byte with its stored source.

Encrypted PDFs may be opened after a memory-only password prompt when PDF.js can decrypt them. Edited export remains disabled because pdf-lib cannot safely modify encrypted sources. A source digital signature is preserved only by exact-original export; modified-copy export displays a signature-validity warning.

## Public bridges

- `window.SutraAttachments.addFiles/readBytes/readDataUrl/link/unlink/listForEntity/list/get/download/remove/validate`
- `window.SutraPdfWorkspace.open/createFromFiles/export/getContext/close/isEnabled`
- `window.SutraPdfAdapter.load/extractText`
- Internal durable seam: `window.SutraPdfData`

The runtime emits `sutra:attachment-added`, `sutra:attachment-links-changed`, and `sutra:pdf-saved`.
