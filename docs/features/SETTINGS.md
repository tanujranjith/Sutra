# Settings

Settings uses a compact, integrated category rail on desktop, with the title and
search above grouped Personalization, Productivity, and Services links. All 16
categories remain available; Business, Advanced, and Customization are under
**Advanced & packs**. The global Sutra navigation remains unchanged.
On phones, choose a category, then use **All Settings** to return to the list.
Keyboard focus follows the selected category and returns to it when going back.
Search is available in either view and shows matching controls across categories;
returning to All Settings clears the search without discarding pending edits.

Preference controls retain their existing staged behavior: review the pending
changes, then choose **Save Changes** or **Revert**. Moving between categories
keeps those pending values. Controls labeled as applying immediately (including
provider credentials) retain that separate behavior. **Choose theme** opens the
existing theme panel, whose selections apply immediately; the palette samples
and current label reflect its actual supported presets and selection.

Appearance starts with flat Theme, Density, and Contrast rows. **Surface & depth**
contains Card style, Corners, Shadow, and Blur. **Interface details** contains Icon
size, Sidebar style, Motion, and Manage quotes. These groups expand on demand;
search opens matching groups and restores their prior disclosure state when
cleared, without discarding pending edits.

On desktop, **Preview workspace** expands inline below the controls for Appearance
and Layout. It reuses the canonical pending-state preview bindings for density,
contrast, material, corners, shadow, blur, sidebar, and icon size, plus the existing
motion and Layout summaries. The miniature Home is illustrative, with no second
timer or preference store. The desktop workspace scrolls as one page, without a
separate preview or controls scrollbar. Save Changes and Revert stay in a clear
bottom bar, and category reset options remain available.

The compact phone layout omits the workspace preview and keeps touch targets at
least 44 pixels.
The pending-changes bar stays above the phone navigation, safe-area inset, and
any active Focus player, so Save Changes and Revert remain reachable.

Settings navigation and disclosure state are presentation state only. They introduce no workspace
fields, migrations, or changes to backup and Sync content.
