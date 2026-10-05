# Folders

Folders give Create pages a focused way to browse and add related work without
replacing the existing Notes page tree. A folder's canonical identity is its
page ID; its location in the hierarchy comes from the existing `title` path
(`Course Notes::Unit 1`) and `spaceId`. Folder navigation does not add a
`parentId`, duplicate page list, or other durable state.

## Folder workspace

The contextual view shows only immediate child pages: records in the current
space whose canonical title is exactly one `::segment` below the open folder.
A nested folder opens through the normal page navigation path; its own view
then lists its direct children. Deeper descendants are not flattened into the
parent folder. Child order follows the canonical `pages` array order.

Child cards show the page type, title, and existing update time. PIN-protected
children expose only their title and lock label; opening them goes through the
canonical page-opening route, which owns the unlock screen. Help & Docs is
excluded. Trash is separate from the live `pages` collection and is not shown.
The bridge must supply live pages from the current workspace, and the view
filters those pages to the active space before rendering.

The folder header offers Note, Folder, Canvas, Slides, Spreadsheet, and HTML
page choices. Each choice asks the core bridge to open its existing new-page
dialog with the current folder selected as the parent. The core remains
responsible for validating the parent, applying `title::path`, honoring page
authorization, and creating the canonical record. An unlocked, read-only folder
can display its children but cannot start a create flow. A locked folder uses
the canonical PIN screen before its workspace opens.

The existing sidebar row is also a collapse control. Keep that explicit tree
toggle working; route folder navigation into this workspace through the core's
folder-page routing seam without treating a collapse click as page navigation.

## Integration contract

`window.SutraFolderWorkspace` is a presentation-only classic-script API:

```js
SutraFolderWorkspace.open(page, mountEl, bridge);
SutraFolderWorkspace.close();
```

`open` resolves the live folder by ID from the bridge and mounts a contextual
workspace into the supplied element. The injected bridge supplies:

- `getPages()` — the canonical live page array, excluding `appData.trash`;
- `getCurrentSpaceId()` — the active space ID;
- `openPage(id)` — canonical page navigation, including nested-folder routing;
- `createChild(folderId, type)` — the canonical new-page dialog, prefilled with
  this folder as parent and `type` set to `note`, `folder`, `canvas`, `slides`,
  `sheets`, or `html`;
- `canWritePageContent(pageOrId)` — authorization used to gate child creation.

The view creates DOM nodes and writes user titles with text APIs; it does not
inspect page content, mutate records, or persist selection, navigation, or
presentation state. `close` removes the mounted folder view so the normal Notes
surface can take over. The core route should call `close` when leaving the
folder workspace and call `open` for the selected folder page.

Buttons and links are keyboard reachable, use visible focus, and keep touch
targets at least 44 pixels high. The view uses theme tokens, remains within the
provided mount width on phones, and respects reduced motion and forced-colors
preferences.
