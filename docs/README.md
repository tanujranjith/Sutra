# `docs/` — documentation, by topic

Start here, then follow the topic folders. The canonical map of the whole app is
[`architecture/SUTRA_ARCHITECTURE.md`](architecture/SUTRA_ARCHITECTURE.md).

| Folder | What's inside |
|---|---|
| `architecture/` | `SUTRA_ARCHITECTURE.md` (the map — load order, path-coupling, "where do I edit X", staged extraction plan), `persistence-inventory.json` (the source-of-truth workspace-field inventory the guardrail/round-trip checks read), `sutra-save-systems-audit.md`. |
| `features/` | Per-feature guides: Assistant, academic planning, document backgrounds, handwriting, canvas/timed habits, mods & customization, CSS mods, plugin SDK, Google Drive sync, mobile/responsive behavior, scrollytelling/landing, brand assets, daily-quotes source audit, rebrand & compatibility. |
| `privacy-security/` | `PRIVACY_AND_LOCAL_FIRST.md`, `DATA_AND_BACKUPS.md`. |
| `release/` | `CHANGELOG.md`, `TESTING_AND_RELEASE_CHECKLIST.md`. |
| `archive/` | Point-in-time reports & completion checklists (public-beta, Student-OS upgrade, assistant-upgrade handoff, manual QA). Kept as historical record — **paths/dates inside are not updated** when files move. |

## Conventions
- Cross-doc links are relative (e.g. `../release/CHANGELOG.md`); the
  `npm run check:links` audit validates every local link.
- Files referenced programmatically by checks (`persistence-inventory.json`,
  `TESTING_AND_RELEASE_CHECKLIST.md`, `PRIVACY_AND_LOCAL_FIRST.md`,
  `MODS_AND_CUSTOMIZATION.md`, `PLUGIN_SDK.md`, `HANDWRITING_AND_DRAWING.md`)
  must keep resolving — moving them means updating the check that reads them.
- Production never ships `docs/` (the deploy artifact is allowlisted), so doc
  paths must not be referenced from the runtime HTML.
