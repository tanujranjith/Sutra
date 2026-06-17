# `tests/` — Playwright end-to-end + benchmarks

Browser tests run against the static app served by
`scripts/serve-static.mjs` (the Playwright `webServer`). They exercise real
behavior the Node static checks can't: rendering, persistence round-trips,
encrypted backups, modal/keyboard a11y, reduced motion, offline boot, and
feature flows.

| Folder | Contents |
|---|---|
| `e2e/` | The Playwright spec suite (`*.spec.mjs`). One file per surface/feature. |
| `bench/` | Heavy-workspace performance benchmark (`playwright.bench.config.mjs`). |
| `fixtures/` | Static input fixtures (e.g. `workspace-v1.json` for migration tests). |

## Running

```bash
npm run test:e2e            # full Chromium + Firefox + WebKit matrix
npm run test:e2e:chromium   # Chromium only (fastest signal)
npm run bench:heavy         # heavy-workspace benchmark
```

Specs load the app by URL (`http://127.0.0.1:5173/Sutra.html`); they do **not**
read source files by path, so they are unaffected by where `src/` files live —
only by runtime behavior. If a restructure breaks load order or a path, these
catch it as a real regression (missing feature, blank view, console error).

> CI runs `test:e2e:chromium` as the release gate; the deploy workflow runs the
> full matrix. Keep `fullyParallel: false` (the suite shares the static server).
