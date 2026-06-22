# Notes & Search upgrades

## Backlinks / linked references

When you link to a page from another note (insert menu → page link, stored as a
`<span class="page-link" data-page-id="…">` token), the linked-to page now shows a
**Linked references** panel under its editor listing every page that points to it.
Click a reference to jump there.

- Reverse index: `getBacklinksForPage(pageId)` scans page bodies for the page-link
  token (cheap and accurate). Rendered by `renderBacklinksPanel(pageId)` into
  `#notesBacklinksPanel`, refreshed whenever a note loads.
- Panel is built with safe DOM construction (no raw HTML), excludes the page
  itself, and stays hidden on canvas pages and pages with no inbound links.

## Fuzzy, relevance-ranked global search

Global search (Shift+Ctrl+F / "Search everywhere") now:

- **Ranks every category by relevance** (`sutraFuzzyScore`): prefix matches beat
  word-boundary matches beat infix matches beat subsequence matches, so the most
  relevant hits surface first.
- **Matches note titles fuzzily** — an in-order subsequence counts, so `psyn`
  still finds *Photosynthesis*. Note bodies and other categories keep fast
  substring matching, then everything is relevance-ranked.

## Verification

`tests/e2e/notes-search-upgrades.spec.mjs` covers backlink detection (incl.
self-exclusion), the panel container, fuzzy subsequence title matching, and
relevance ordering (exact title before a buried match).
