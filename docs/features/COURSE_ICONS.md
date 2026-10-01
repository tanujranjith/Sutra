# Course icons

In Homework's **By Class** group header (including classes with no assignments),
choose the course icon to open its picker. Activity rows expose the same picker.
Choose a preset, enter one custom emoji, or select **Use default icon**. Invalid
input stays in the dialog with a clear message. The controls support keyboard
focus and at least 44-pixel touch targets.

The icon remains in the existing `homeworkWorkspace.courses[].icon` field and
uses the canonical Homework store/save path. Valid emoji is rendered as text;
preset font classes come from the fixed registry. Existing `robot` and
`people-group` presets remain supported. Unsupported imported icon values and
other unknown course fields are preserved, while the UI displays its normal
safe fallback until an explicit choice or reset.

Homework course icons travel through the existing backup, restore, and Sync
record projection. Course Hub currently has a separate presentation and does
not display this Homework icon. No alternate course store or icon preference
was added. If a local write fails, the existing persistent storage warning
applies; an on-screen icon change does not prove it was durably saved.
