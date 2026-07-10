# Document Export

Sutra can export the **current note** as a standalone document in several
formats. As of this release every document-export path is **native and fully
offline** — it needs no third-party library and makes no network request. This
replaces an earlier pipeline that loaded converters from a CDN and produced
broken output (blank pages, text on half the page, lost formatting, and failures
when offline).

Export the current note from the editor's export menu or **Settings → Data →
Default export format**. (The full encrypted **`.sutra`** workspace backup and
the unencrypted **JSON** workspace export are separate — see
[`DATA_AND_BACKUPS.md`](../privacy-security/DATA_AND_BACKUPS.md).)

## Formats

| Format | Output | How it is produced |
| --- | --- | --- |
| **PDF** | `.pdf` (via print) | The browser's own **print-to-PDF** pipeline. Opens a print-ready view; choose **Save as PDF**. Real pagination, selectable text, honours `@page` margins. |
| **Word** | `.docx` | A genuine, local OOXML Word package. Sutra includes the sanitized, self-contained note HTML in the document so Microsoft Word can preserve rich note content without a server or CDN. |
| **Word 97-2003** | `.doc` | **Word-compatible HTML** with an MSO `@page Section1` full-page layout for older Word-compatible workflows. |
| **HTML** | `.html` | A clean, self-contained semantic HTML document, readable in any browser and full-page when printed. |
| **Markdown** | `.md` | A deterministic local HTML→Markdown converter (headings, nested lists, blockquotes, code blocks, tables, images, page breaks). |
| **RTF** | `.rtf` | A structure-preserving HTML→RTF converter (headings, bold/italic/underline, lists, blockquotes, code, basic tables). |
| **Plain text** | `.txt` | Visible text content, normalised whitespace. |

### Why PDF opens the print dialog

Native print-to-PDF is the only way to get correct pagination and **selectable
text** that matches the on-screen layout, and it works offline. The previous
"direct download" PDF rasterised the page through an image-capture library, which
mismatched the Letter page width — the cause of the *text-on-half-the-page* and
*blank-page* output — and required a network connection. Saving from the print
dialog (one extra "Save as PDF" click) is the deliberate trade for correct,
offline, selectable PDF.

### Word formats are labeled by their actual extension

**Word (.docx)** creates a real OOXML `.docx` package using Sutra's local ZIP
library—no CDN, account, or server is involved. **Word 97-2003 (.doc)** remains
available for older workflows and contains Word-compatible HTML. The two menu
options now download exactly the extension shown in Sutra.

## Notes & limitations

- **Locked pages** must be unlocked before export.
- **Images** embedded in the note are inlined into the export where possible;
  any that cannot be embedded are reported in the export toast.
- **Document backgrounds**: included in HTML/PDF where the browser allows;
  Markdown and plain text omit them cleanly.
- Markdown/HTML/RTF cover the block types the Notes editor produces; exotic
  embeds (e.g. sandboxed HTML embeds) degrade gracefully.

## Verification

`tests/e2e/document-export.spec.mjs` asserts each builder produces correct,
non-empty output (full-page Word layout, native PDF print doc, deterministic
Markdown/RTF) and that the runtime no longer references the old CDN export
libraries (`html2pdf`, `html-docx-js`, `turndown`).
