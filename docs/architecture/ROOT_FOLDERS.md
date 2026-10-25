# Root folder labels

The optional local folders in the primary checkout were renamed, without
deleting their contents:

- `NewLandingPage_UNEEDED/`: standalone landing-page experiment; the current
  Sutra landing page is `HomePage.html`.
- `output_UNEEDED/`: retained local marketing, PDF, browser output, and backlog
  artifacts; not the application source or production artifact.

Both names remain ignored. The primary checkout also has matching local Git
exclusions so these private local files remain excluded before branch integration.
The folders can be restored to their former names if needed.

No operational folder was marked as disposable: `assets`, `src`, `styles`,
`scripts`, `tests`, `tools`, `docs`, `examples`, `extension`, `supabase`, and
`noteflow-classic` retain their project roles. Git/configuration, dependency
caches, `.deploy`, `.tmp`, and worktrees retain their established paths.
