# Slides mode

Slides is a local Notes surface for building short class presentations without
leaving Sutra. A Slides deck belongs to one normal Note page and is selected
from the New Page dialog. The deck lives at `page.slides`, which deliberately
keeps ordinary note content and unknown page fields intact.

## Durable model

`page.slides` is versioned (`version: 1`) and contains the deck-wide `theme`,
`size`, and ordered `slides` list. Every slide and element has a stable local
ID. Elements use normalized percentage geometry and support text, basic shapes,
inline local images, and simple charts. Speaker notes are stored on the slide.

The current interaction state—selected slide, selected element, inspector
visibility, and presenter position—is session-only. It is never persisted, so
opening a deck does not cause Sync churn.

## Local-first behavior

The deck is saved through the canonical workspace serializer and local save
path. As a result, deck text, themes, layouts, notes, and inline image data
participate in normal reload, encrypted `.sutra` export/import, duplication,
and workspace Sync without a Slides-specific server or network request.

When Slides is the active Note page, Sutra Assistant receives a bounded local
deck context: slide titles, text/shape labels, chart labels and values, and
speaker notes. Locked pages remain excluded. Sync transports the complete
`pages[].slides` record with the existing page conflict handling, so slide
changes and inline image data use the same encrypted, deterministic path as
other Note content.

Slides uses only local image files chosen by the student. V1 stores those image
bytes in the page model so existing workspace backup and Sync transport retain
them. Moving those bytes to the course attachment store is a follow-up needed
before very large decks should be encouraged.

## Exports and presenter

The Design inspector opens browser printing for PDF output; it preserves slide
order and sets a landscape page size. The presenter uses the full viewport,
speaker notes, arrow/space navigation, and Escape to exit.

The V1 PPTX command creates a local ZIP-based deck package for future
interoperability work. It is intentionally labeled as an experimental export:
it is not yet a standards-complete PowerPoint file and should not be relied on
as the only backup. Use encrypted `.sutra` export for a complete backup.

## Public bridge

`window.SutraSlides` is the namespaced integration seam. It provides page
creation, current-deck lookup, add-slide, presenter launch, and local export
commands. No remote API or unscoped global is introduced.
