# Create sidebar shortcuts

Website and page shortcuts always appear under **Shortcuts** in the Create
sidebar. Add one from the sidebar plus button or Settings → Web shortcuts.
Choose its name, destination, and optional icon; there is no placement choice.
Settings lists the destination as **Create sidebar**. Website shortcuts open
only when clicked; page shortcuts use the existing page-opening and access
checks.

All existing shortcuts render in the sidebar, including records previously
saved with `placement: "tabs"`. The legacy placement normalizer and import/export
shape remain compatible; displaying a shortcut does not rewrite its record.
New and edited shortcuts save `placement: "sidebar"` through the existing
`settings.customShortcuts` persistence path. No field, store, or migration was
added. The old custom-shortcut tab container is kept empty for compatibility.
