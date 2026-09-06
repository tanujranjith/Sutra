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

## Cross-browser fixtures

- Run targeted local batches with `--workers=1` to keep memory bounded.
- Before ordinary fixture mutations, use `e2e/helpers/app-ready.mjs` to await
  canonical hydration through the public save seam. Attached markup is not a
  ready workspace. Fault-injection tests must establish their own readiness.
- Network-mocked suites block service workers in their contexts so WebKit cannot
  bypass Playwright routes. Keep the dedicated offline/service-worker suites
  enabled; never disable browser network security to make mocks pass.
- When inspecting mocked Blob uploads, use `inspectable-blob-requests.mjs` with
  an explicit list of mocked URL prefixes. It preserves upload bytes and MIME
  types as ArrayBuffers because WebKit omits Blob bodies from interception.
  Keep ciphertext/envelope and restore assertions; never substitute fake bytes.
- After seeding a note, wait for the actual editor to display its content before
  invoking a low-level hook that saves or locks it. Hydration and editor mounting
  are separate readiness boundaries.
- Keep independent PIN setup and non-deletion scenarios in separate tests so
  repeated key derivation and modal transitions do not share one timeout budget.
- Firefox does not retain constructor-supplied synthetic clipboard contents.
  Define `clipboardData` on the dispatched test event; still run the real paste
  handler and assert the resulting document and persistence contracts.
