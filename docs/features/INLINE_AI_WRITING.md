# Inline AI writing help

In the Modern Notes editor, open **AI writing help** from the /ai slash
command, the toolbar, or the selection toolbar. The writing workspace opens
inside the existing right-docked Sutra Assistant panel. It keeps the Assistant
header and provider settings available while temporarily hiding the
conversation and composer so the note request is easy to review. **Back to
chat** returns to the same conversation and leaves any existing composer text
untouched.

The workspace shows the instruction, the exact note passage, and any selected
text included in the request. A selected passage is limited to 16,000
characters; without a selection, context comes from the current paragraph, up
to 6,000 characters. Opening writing help sends nothing. **Generate draft**
uses the canonical configured Assistant provider and its existing send
confirmation. Only the displayed passage/selection and instruction are sent;
the request does not ask for workspace categories or other note context.

The returned draft is plain text. Review or edit it, then choose **Insert at
selection** or **Replace selected text**. Replace is available only for a
nonempty selection. A slash invocation replaces only its captured slash query;
the text before it stays intact. Accepted text uses native text/break nodes
and the owning editor's history/save path, so the usual Undo command remains
available. Provider output is never parsed as HTML.

**Cancel request** aborts generation and permits a retry. **Back to chat**
closes the writing workspace without changing the note or clearing the chat
composer. Page navigation, locking, remote application, and lost editor
ownership discard pending results. A failed request is visible and never
applies a partial result. Sutra remains usable without a configured provider.
The writing workspace stores no separate workspace state.

The source change was checked with Node syntax validation. No provider request,
automated test, or browser review was performed for this update.
