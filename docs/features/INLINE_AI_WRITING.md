# Inline AI writing help

In the Modern Notes editor use `/ai`, **AI writing help** in the toolbar, or
the selection toolbar. The dialog shows the instruction and exact note text
included. A selected passage is limited to 16,000 characters; without a
selection, context comes from the current paragraph, up to 6,000 characters.
Opening the dialog sends nothing. **Generate draft** uses the canonical
configured provider and its existing send disclosure; it sends only the shown
passage/selection and instruction, without requesting workspace categories.

The returned draft is plain text. Review or edit it, then choose **Insert at
selection** or **Replace selected text**. Replace is available only for a
nonempty selection. A slash invocation replaces only its captured slash query;
the text before it stays intact. Accepted text uses native text/break nodes and
the owning editor's history/save path. Provider output is never parsed as HTML.

**Cancel request** aborts generation and permits a retry; **Cancel** closes the
dialog without changing the note or slash query. Changing the instruction
invalidates an earlier draft. Page navigation, locking, remote application,
and lost editor ownership reject or discard pending results. A failed request
is visible and never applies a partial result. Sutra remains usable without a
configured provider. This dialog stores no separate workspace state.

Manual review covered opening and cancellation; no provider request was sent
during the constrained overnight run. Generation, provider cancellation,
selected-text replacement, and multiline approval need morning validation.
