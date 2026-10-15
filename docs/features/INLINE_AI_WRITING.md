# Inline AI writing help

## Explicit passage commands

Use `/grammar`, `/spelling`, or `/rephrase` in either Notes editor or Assistant
chat. In Notes, select ordinary text within one paragraph and press `/`, then
choose the command. The selection stays untouched while the menu and review
are open. A command typed at a caret opens a blank **Passage to edit** field;
enter the text explicitly. There is no automatic paragraph or whole-note
fallback for these three commands. In chat, enter `/grammar your passage`
(or the other commands), then Send to open the review.

Edit the passage and instruction, then choose **Generate draft**. This sends
only that passage and instruction through the configured provider. It excludes
chat history, workspace retrieval, and attachments. The limit is 8,000 passage
characters. Opening the review, an empty passage, and Cancel make no provider
generation request. Provider credentials and the normal send disclosure remain
required for generation.

Review or edit the returned plain-text draft, then choose **Apply** or **Cancel**.
In Notes, Apply replaces only the captured selection or slash query and supports
the owning editor's Undo. In chat it returns the reviewed text to the composer;
it does not send a second message. Editing the original text, changing its page
or conversation, locking, or applying remote changes invalidates the review.

To protect authored structure, selection commands reject links, code, embedded
items, mixed formatting, and selections spanning paragraph boundaries. The
Modern Editor preserves the selection's uniform text marks. In Classic Notes,
select within one text run; a selection containing markup is rejected. Existing
general writing help below keeps its separate paragraph-context behavior.

## General writing help

In the Modern Notes editor, open **Sutra Assistant writing help** from the
slash menu (`/ai` remains a search alias), the toolbar, or the selection
toolbar. The writing workspace opens
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

Choose **Sutra Assistant general help** in the slash menu to open the ordinary
Sutra Assistant panel. This only opens the panel; it does not send a message or
contact an AI provider, and it preserves any existing composer draft. The
command removes its slash query through the current note editor transaction
only while that editor still owns the captured note and text range. If the
panel is unavailable, the slash query stays in the note.

General help also returns an open writing workspace to the ordinary chat panel.
In Classic Notes, the same commands open the canonical mini panel: writing help
prepares a writing prompt when the composer is empty, and general help preserves
the composer. Neither command sends a message.
