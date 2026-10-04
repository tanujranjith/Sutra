# Rich links in Notes

Use **Insert link**, the selection toolbar, or `/link` in the Modern Notes
editor. Enter display text and a complete HTTP or HTTPS address, then choose
**Save link**. Clicking a saved link opens a small local popover just below it.
The popover shows the address and compact **Copy link**, **Edit link**, and
**Remove link** actions when the note can be edited. Choose the address in the
popover to open the website in a new tab. **Edit link** opens a compact form
anchored to the link; **Apply** saves through the note editor's normal edit
path. Modified clicks retain ordinary browser link behavior. Rendering a saved
link and opening its popover make no network request.

The link is a native inline editor node. Edits, removal, Undo/Redo, autosave,
and reload use the owning note's existing transaction and save path. Its JSON
attribute in `page.content` holds `href`, `label`, and optional `metadataTitle`
and `thumbnail`; unrelated future fields survive edits. Known metadata follows
the reviewed dialog result and is cleared when its address or lookup choice
changes. No helper settings or credentials enter the page record.

## Optional metadata lookup

Title lookup is off by default and requires a manually started local helper:

```powershell
node scripts/rich-link-metadata-helper.mjs --origin http://127.0.0.1:5278 --port 5280
```

Use the exact origin of your served Sutra instance in `--origin`. A `file:`
instance has no supported HTTP origin for the helper. In the link dialog,
expand the lookup controls, enter its port, review the displayed destination,
and choose **Fetch title**. The port stays in memory for this tab only.
If display text is empty or still the original URL, a fetched title fills it
unless you changed it during the request. Otherwise use **Use page title as
display text**. You can always keep your own label or save without lookup.

Checking **Include thumbnail** before fetching explicitly permits the helper
to request the page's advertised public HTTPS image. The helper binds only to
loopback, requires its configured Origin and Host, validates and pins public
DNS addresses at every redirect, refuses private/reserved destinations and
HTTPS downgrades, and limits response size, redirects, concurrency, and time.
Supported bounded PNG, baseline JPEG, or WebP images return as inline data;
saved previews never request the remote image. Unsupported images leave the
title available. This helper is not started by Sutra or shipped as a server.

Cancel, navigation, locking, remote workspace application, and stale editor
ownership discard the draft and abort pending requests. Provider/helper errors
leave the note unchanged. Workspace backup and Sync carry the existing page
content, including approved inline thumbnail data. End-to-end network helper,
encrypted restore, and Sync round-trip validation remain deferred until the
user runs the morning checks.
