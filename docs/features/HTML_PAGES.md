# HTML Pages

HTML Pages are a dedicated Create surface for one local HTML source document. A page stores only:

```json
{
  "htmlDocument": {
    "version": 1,
    "source": "<!doctype html>…",
    "createdAt": "ISO timestamp",
    "updatedAt": "ISO timestamp"
  }
}
```

Selection, scroll position, preview DOM, and script runtime state are session-only. The document follows the normal page persistence, version-history, encrypted backup, restore, and Sutra Sync paths. Missing `htmlDocument` fields normalize to `null`, so existing pages need no migration.

The import boundary also recognizes early HTML Page records whose explicit page
type was `html`, `html-page`, or `html_page` and whose source was stored in the
legacy `content`, `html`, or `source` field. Those records are converted to the
canonical `htmlDocument` shape during migration; ordinary `note` pages are not
inferred from HTML-looking content.

## Create, editing, and import

- In **New Page**, choose **HTML Page**, set an optional title and parent location, and choose **Simple HTML page** or **Empty source**. Confirm with **Create HTML page**; selecting the type alone does not create a page.
- Paste or type HTML, CSS, and JavaScript in the source editor. The layout controls show **Code**, **Split**, or **Preview**, with the current mode named in the workspace. Phones use Code and Preview tabs.
- The compact toolbar keeps the view tabs, **Edit source**, and icon-only **Undo** and **Redo** actions visible. Open **More HTML Page actions** for **Refresh preview**, **Import HTML**, and **Export .html**. Escape closes the menu and returns focus to its button; clicking elsewhere closes it.
- Insert a **Content section**, **Checklist**, or **Note callout** starter at the current selection, or before `</body>` when the editor has no selection.
- Use **Undo** and **Redo** in the HTML Page toolbar, or Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z while the source editor is focused, to move through source edits. Each accepted source input and each starter, import, or authored timeline change is captured as a local full-source snapshot. History is session-only, bounded to 40 states or 9 MiB of snapshots, and resets when the page/document/space changes, the page closes or locks, or Sutra reloads. When the byte cap is reached, oldest undo states are discarded; the current source remains available.
- Import local `.html` and `.htm` files up to 4 MB, or export the current source as an `.html` download up to 4 MB. That download contains the HTML source only, not the page record or workspace backup.
- The source-size display and save status report the 4 MB limit and local save state. Source edits update the canonical page record and autosave through the workspace bridge; if saving fails, the code remains available in the editor with an error status.
- **Refresh preview** explicitly retries rendering. Empty source, sandbox preparation failures, load failures, and slow preview loads have visible status feedback; the authored source remains available for editing or export.

## Preview security boundary

Preview rendering must always go through `SutraDOMSafety.renderUserHTMLToFrame` in acknowledged `active-local` mode. The iframe grants only `allow-scripts`; it never grants same-origin access, forms, popups, downloads, parent access, top navigation, external frames, or network connections. Data URLs remain local. Linked and remote assets are blocked and produce a visible warning.

HTML Pages use the canonical page authorization gate. Once a page is locked, the source textarea is cleared and the preview iframe is removed so neither remains exposed in the live DOM.

## Integration seam

`window.SutraHTMLPages` is the registered feature bridge. It creates and opens pages through `window.flowAtelier`, never through a second store or remote service.
