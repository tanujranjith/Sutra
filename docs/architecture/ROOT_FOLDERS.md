# Root folder labels

The optional local folders in the primary checkout were renamed, without
deleting their contents:

- `UNEEDED - NewLandingPage/`: standalone landing-page experiment; the current
  Sutra landing page is `HomePage.html`.
- `output_UNEEDED/`: subsequently deleted at the owner's request.

The retained experiment remains ignored. The primary checkout also has matching local Git
exclusions so these private local files remain excluded before branch integration.
The retained folder can be restored to its former name if needed.

No operational folder was marked as disposable: `assets`, `src`, `styles`,
`scripts`, `tests`, `tools`, `docs`, `examples`, `extension`, `supabase`, and
`noteflow-classic` retain their project roles. Git/configuration, dependency
caches, `.deploy`, `.tmp`, and worktrees retain their established paths.
