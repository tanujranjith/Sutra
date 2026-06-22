# Sutra Codebase Hardening Report

_Maintenance, QA & reliability pass — 2026-06-20._

This report covers a full-repository reliability, security, and testability pass
over the Sutra local-first static student workspace. It records the baseline,
every issue found (ranked), the exact fixes, the new tests/checks added and what
they protect against, the manual smoke testing performed, the validation
commands run with results, pre-existing failures (kept separate from anything
introduced here), remaining risks, and an evidence-based merge recommendation.

**Local-first guarantees preserved.** No backend was added, no account required,
no telemetry/analytics introduced, no framework/bundler/dependency added, and no
breaking change to saved data, storage keys, imports, exports, encrypted `.sutra`
backups, themes, plugins, shortcuts, URLs, or static-file behavior. The separate
`noteflow-classic/` legacy app was not touched.

---

## 1. Executive summary

Sutra is already a mature, unusually well-defended codebase: 21 static check
scripts (smoke-check alone carries 900+ structural assertions), a layered safety
architecture (`safe-storage` / `error-reporter` / `dom-safety` / `feature-guard`
/ `migrations`), a centralized persistence-health pipeline, an architecture
guardrail ratchet, and a 32-file Playwright matrix across Chromium/Firefox/WebKit.

A four-front audit (Sutra Cloud, the uncommitted "feature wave", boot/shell/PWA,
and persistence/accessibility/export-privacy) found **no Critical or High
severity bugs**. The code holds against secret-leakage, XSS, data-loss, modal
a11y, CSP, and unexpected-network invariants. Two genuine **Low** bugs were found
and fixed, each with a regression guard.

The highest-value hardening contribution is a new **runtime startup health
layer**: a proactive, false-alarm-resistant watchdog that detects a catastrophic
boot failure (the one gap the existing reactive layers didn't cover) and offers
the user *data-safety recovery* (Reload / Safe Mode / emergency export) instead
of a dead shell. Two new static checks (startup-health wiring; duplicate DOM
id / duplicate `<script>` guard), new Playwright coverage, and a deterministic
`npm run verify` umbrella round out the pass.

**Merge recommendation: safe to merge.** All static checks, the deploy artifact
build/validate, the new tests, and the deterministic `verify` pass are green. The
only e2e "failures" observed were a pre-existing Windows parallel-contention
flake that fully clears when the same specs run serially (proven below).

---

## 2. Scope reviewed

| Area | Coverage |
|---|---|
| Entry points & shell | `index.html`, `HomePage.html`, `Sutra.html`, `404.html`, manifest, `sw.js`, boot scripts, runtime config |
| Core runtime | `src/core/app.js` (66k lines) — persistence, hydrate, export/import, migrations, Sutra Cloud, feature wave, modal manager |
| Safety layer | `safe-storage`, `error-reporter`, `dom-safety`, `feature-guard`, `migrations`, `issue-prompt` |
| Feature wave (uncommitted WIP) | Starter Packs, Review Generator, All Due, Course Hub, Workspace Time Machine |
| Sutra Cloud | provider registry (Supabase/WebDAV/Custom HTTP/S3/manual), session/secret handling, network policy |
| Persistence/import/migration | hydrate path, normalizers, import validation order, migration idempotence/field-preservation |
| Accessibility | `SutraModalManager` Escape/focus-trap/restore, ARIA, accessible names |
| Privacy/security | export secret-redaction, CSP, service-worker, unexpected-network |
| Validation system | `package.json` scripts, `scripts/**` checks, Playwright config |

> **Working-tree note:** the repo already contained a large body of *uncommitted*
> work before this pass (the "feature wave" + the Supabase→"Sutra Cloud" provider
> rename; `git diff` shows `src/core/app.js` +1.9k lines, plus new docs/specs).
> The baseline below was taken **with that work in place**, and every hardening
> change here is **additive** on top of it. Attribution of which edits are mine is
> in §5.

---

## 3. Baseline validation results (before changes)

| Command | Result |
|---|---|
| `npm install` | clean (exit 0) |
| `npm run check:all` (21 checks) | **PASS** — all green (syntax, app-shell, migrations, smoke, round-trip, version-history, rebrand, compat, csp, persistence, modal, network, encoding, responsive, brand, docbg, academic-engines, sw, guardrails self-test, guardrails, links) |
| `npx playwright test --project=chromium` (full, parallel) | 155 passed / **33 failed** |

**The 33 chromium failures are a pre-existing environmental flake, not real
bugs.** Evidence: they affected the *first wave* of tests almost uniformly at
~1.1–1.2 min each (CPU/memory saturation from many headless browsers each loading
the 2.5 MB `app.js` simultaneously), while later tests in the same run passed.
Re-running the 11 affected spec files **serially** (`--workers=1`) produced
**71 passed / 0 failed (exit 0)**. The single faster outlier
(`public-beta-hardening.spec.mjs:109`, ~24.7 s) also passes serially at ~3.2 s.
This matches the project's own documented guidance to run the suite batched on
Windows. See §8.

---

## 4. Issues found (ranked)

No Critical or High issues were found across four independent audit fronts.

| # | Severity | Issue | File(s) | Fix | Verification |
|---|---|---|---|---|---|
| 1 | **Low** | `undoStarterPack` over-counted removed decks: the deck branch incremented its "removed" tally unconditionally because `deleteReviewDeck` always returned `true`, even when the deck was already gone — so the "Removed N items" toast could overstate. | `src/core/app.js`, `src/features/study/review.js` | `deleteDeck` now returns whether a deck actually existed; `deleteReviewDeck` propagates it; `undoStarterPack` counts only real removals. | New e2e `hardening-regressions.spec.mjs` asserts the truthful return contract. |
| 2 | **Low** | S3 Sutra Cloud provider used the Font Awesome **brand** glyph `fa-aws` with the implicit solid (`fas`) prefix, so the icon never rendered. (The card renderer only honors a `fa-brands` prefix.) | `src/core/app.js` | Declared `icon: 'fa-brands fa-aws'`. | `smoke-check.mjs` asserts the brand-prefixed value. |
| 3 | Informational | `Sutra.html` CSP `connect-src` ships the literal placeholder `https://YOUR-PROJECT-REF.supabase.co`. | — | **No change** — intentional and documented; Sutra Cloud is dormant until a real Supabase ref is configured, and an unresolvable `connect-src` host is inert. | Recorded for awareness. |
| 4 | Informational | "Due This Week" grouping uses a strict `< weekEnd` boundary, so an item due *exactly* 7 days out lands in "Next Week". | — | **No change** — a rolling days-0–6 window is a defensible product choice; flagged, not a defect. | Recorded for awareness. |

Areas explicitly verified **clean** (read, not assumed): Sutra Cloud secret
handling (passphrase/derived-key/tokens stay in-memory or session-only; never
exported), zero-network fresh startup, `SutraSafeStorage` method-name correctness
(the previously-shipped Starter Packs `.getItem`/`.setItem` no-op is already
fixed), starter-pack apply/undo deep-copy + id-slug safety, Workspace Time Machine
snapshot/restore, hydrate-never-clobbers-populated-data, import-validates-before-
replacing, migration idempotence + unknown-field preservation, modal
Escape/focus-trap/restore, export secret-redaction, duplicate-id/script-include
absence, and service-worker stale-cache safety.

---

## 5. Exact fixes & files changed (attribution)

**Bug fixes (mine, layered on the existing working tree):**
- `src/core/app.js` — (a) `undoStarterPack` deck branch now `if (window.deleteReviewDeck && window.deleteReviewDeck(obj.id)) removed++;`; (b) S3 provider `icon: 'fa-brands fa-aws'`.
- `src/features/study/review.js` — `deleteDeck` returns a boolean (deck existed?); `deleteReviewDeck` propagates it. (This file was otherwise untouched in the working tree, so the diff is entirely this fix.)

**New runtime health layer (new files + wiring):**
- `src/core/startup-health.js` (**new**, 331 lines) — `window.SutraStartupHealth`.
- `Sutra.html` — one `<script>` include in the head safety bundle (before `app.js`), with a `?v=` cache-bust.
- `scripts/sutra-guardrails-check.mjs` — added the file to `SCAN_FILES`.
- `scripts/guardrail-baseline.json` — registered the `SutraStartupHealth` global and 0/0 sink/storage budgets.

**New validation:**
- `scripts/sutra-startup-health-check.mjs` (**new**, 31 assertions).
- `scripts/sutra-dom-integrity-check.mjs` (**new**) — duplicate id / duplicate `<script src>` guard.
- `scripts/smoke-check.mjs` — +6 assertions (health-layer wiring + S3 brand-icon regression).
- `package.json` — `check:startup-health`, `check:dom`, `test:e2e:smoke`, `verify`; both new checks added to `check:all`.
- `tests/e2e/startup-health.spec.mjs` (**new**, 5 tests).
- `tests/e2e/hardening-regressions.spec.mjs` (**new**, 1 test).

**Docs (drift prevention):**
- `docs/architecture/SUTRA_ARCHITECTURE.md` — documented the startup-health module (§2 safety layer) and the new checks + `verify` (§9).

---

## 6. New runtime startup health layer (detail)

`src/core/startup-health.js` → `window.SutraStartupHealth`.

**Why it was needed.** The existing safety layers are *reactive*: they catch
thrown errors (`error-reporter`), isolate a broken *feature* (`feature-guard`),
or nudge the user to *file an issue* (`issue-prompt`). None answers "did the app
actually come up, and if a *core* subsystem failed to initialize, can the user
recover their data?" A catastrophic early throw in `app.js` (before it wires
save/serialize/export) previously left a half-dead shell with no guidance.

**What it does.**
- A boot **watchdog** (armed on `DOMContentLoaded`) verifies the *critical*
  subsystems came up: workspace save/serialize runtime, `SutraSafeStorage`, the
  persistence-health pipeline, and the app-shell DOM. Warnings (dom-safety,
  migrations, feature/storage degradation) are recorded but never block.
- For a confirmed critical failure **only**, it renders one small, dismissible
  recovery banner offering the **data-safety actions**: Reload, Open in Safe Mode
  (`?sutraSafeMode=1`), and Export emergency backup (shown only if that path is
  reachable). It never traps the user and never blocks normal use.

**Guarantees (enforced by `check:startup-health`).** No network, no storage
writes, no telemetry, no workspace-data exposure, DOM built with
`createElement`/`textContent` only (no innerHTML sink), and it never throws out
of the health layer. **False-alarm resistant:** a generous watchdog plus
confirmation rechecks means a slow-but-healthy boot (globals present) never trips
the banner — it only fires when a critical subsystem is genuinely absent. A
healthy startup does effectively zero extra work and shows nothing.

It complements `issue-prompt.js` (reporting) rather than duplicating it, and is
registered in the guardrail known-globals so the architecture ratchet accepts it.

---

## 7. New tests, checks & runtime coverage — what each protects

| Added | Protects against |
|---|---|
| `scripts/sutra-startup-health-check.mjs` (31 assertions) | The health layer being dropped/mis-wired, losing its recovery actions, or regressing its no-network/no-storage/no-unsafe-sink safety invariants. |
| `scripts/sutra-dom-integrity-check.mjs` | Duplicate element ids (silent `getElementById` mis-wiring + a11y violation) and duplicate `<script src>` includes (double init / double listeners) in the HTML entry points. Currently: 1193 ids + 40 scripts scanned, zero dups. |
| `tests/e2e/startup-health.spec.mjs` (5 tests) | Healthy boot must report ok with **no** banner; a critical failure must surface a dismissible recovery banner naming the failed subsystem with the right actions; a warning-only state must **never** false-alarm; recovery rendering is idempotent. |
| `tests/e2e/hardening-regressions.spec.mjs` (1 test) | The deck over-count fix: `deleteReviewDeck` returns `true` only when a deck actually existed. |
| `smoke-check.mjs` +6 assertions | Health-layer wiring/severity/recovery presence and the S3 brand-icon regression. |
| `npm run verify` umbrella | Provides a single, deterministic "strongest practical local pass" gate. |

---

## 8. Validation commands run & results

| Command | Result |
|---|---|
| `npm install` | exit 0 |
| `npm run check:all` (now 23 checks incl. the 2 new) | **PASS** — 314 references audited, 35 files scanned, 248 known globals |
| `node scripts/sutra-startup-health-check.mjs` | **PASS** — 31 assertions |
| `node scripts/sutra-dom-integrity-check.mjs` | **PASS** — 1193 ids / 40 scripts, no dups |
| `npm run build:deploy` | **PASS** — 109 files, 13.66 MB; new module auto-included |
| `npm run check:deploy` | **PASS** — clean, self-consistent runtime surface |
| `npx playwright test --project=chromium startup-health hardening-regressions --workers=1` | **PASS** — 6/6 |
| `npm run verify` | **PASS (exit 0)** — check:all + build:deploy + check:deploy + **51 serial Chromium e2e smoke tests passed (3.7m)** |
| `npx playwright test --project=firefox startup-health hardening-regressions dom-safety modal-accessibility encrypted-backups --workers=1` | **PASS** — 23/23 (incl. all new startup-health tests cross-browser) |
| `npx playwright test --project=webkit …` | **BLOCKED — environmental** (see below) |
| `npx playwright test --project=chromium` (full, parallel) | 155 passed / 33 failed — **the 33 are the pre-existing Windows contention flake; all pass serially** (§3, §8) |

**WebKit blocker (documented per instructions).** The WebKit browser binary
cannot be installed in this environment: `npx playwright install webkit` fails
repeatedly with `Failed to download WebKit 26.4 (playwright webkit v2287) …
Download failure, code=1`, and runs error with
`browserType.launch: Executable doesn't exist at …\webkit-2287\Playwright.exe`.
This is an environment/network download failure, **not** a code or test defect.
Chromium and Firefox (both real, independent engines) exercise the full critical
surface — including every new test — green. The WebKit project remains in
`playwright.config.mjs` and will run wherever its binary is available.

### Pre-existing failures (NOT introduced here)

The full parallel chromium run shows ~33 failures; **all are the Windows
parallel-contention flake described in §3** — they pass 100% serially. This is
environmental (host CPU/memory saturation under default worker fan-out), pre-dates
this work, and matches the project's documented "run batched on Windows"
guidance. No failure traces to a real defect, and none was introduced by these
changes. The new `npm run verify` runs the e2e smoke **serially** precisely so
the reliability gate is deterministic.

---

## 9. Manual smoke testing performed

Driven through the Playwright-served app and the exposed runtime hooks
(serial, deterministic):

- First-run onboarding dismissal + normal startup of `Sutra.html` (shell mounts, no fatal console errors).
- Notes / tasks / homework / review create + persist round-trips (existing suites + round-trip check).
- Modal keyboard behavior: dialog semantics, symmetric Tab-trap, Escape close, focus restoration, no listener growth (modal-accessibility suite).
- Export & restore: encrypted `.sutra` round-trip, wrong-password rejection without mutation, legacy `.atelier`/JSON import, tamper rejection (encrypted-backups suite).
- Malformed import refused without replacing the workspace (public-beta-hardening suite).
- Emergency export refuses on missing required attachment and surfaces the banner (now confirmed green serially).
- Storage degradation banners + retry recovery (storage-hardening / persistence suites).
- Theme switching + reduced-motion startup (existing suites).
- **New:** startup-health — healthy boot shows nothing; simulated critical failure shows the recovery banner with Reload/Safe Mode/Dismiss and clears on dismiss; warning-only never alarms.
- Service-worker registration is protocol-gated and offline-safe (`check:sw`, 17 assertions).

---

## 10. Remaining risks & recommended later refactors

- **e2e parallel flake on resource-constrained hosts.** Not a product bug, but it
  makes the *full* matrix non-deterministic locally. The new serial
  `test:e2e:smoke`/`verify` sidesteps it; a fuller fix would cap default workers
  in CI config or split the matrix into batches. (Left as config judgment.)
- **`app.js` size (66k lines).** Continued extraction per the architecture doc's
  staged plan would improve testability; out of scope for a non-churn pass.
- **Optional guard (recommended, not done):** extend `check:modal` to assert every
  `role="dialog"` / `.modal` element is covered by `SutraModalManager`'s selector,
  so a future dialog added outside the manager can't silently lose its focus-trap.
- **S3 Sutra Cloud provider** is scaffolded ("coming soon"); its setup form will
  persist device-local credentials that are not yet used. Consistent with the
  documented preview state; revisit when S3 ships.

---

## 11. Merge recommendation

**Safe to merge.** Evidence:

- `npm run check:all` (23 deterministic checks) — **green**.
- `npm run verify` (check:all + build:deploy + check:deploy + 51 serial Chromium
  e2e) — **exit 0, all green**.
- New work validated cross-engine: Chromium (6/6 new) and Firefox (23/23 smoke,
  including all 5 startup-health tests + the deck regression).
- Deploy artifact builds clean and self-consistent with the new module included.
- The two Low bugs are fixed with regression guards; no Critical/High issues exist.
- The only e2e "failures" anywhere are the pre-existing Windows parallel-contention
  flake, which passes 100% serially and was not introduced by this work.

**One documented blocker, non-code:** the WebKit browser binary cannot be
downloaded in this environment, so the WebKit project could not be executed here.
It is unrelated to these changes and will run where the binary is available. This
does not affect mergeability — the changes are static-app, no-build, local-first,
and backwards-compatible, and are validated on two independent browser engines.

All local-first guarantees are preserved (no backend, no account, no telemetry,
no new dependency, no breaking change to saved data / storage / exports /
encrypted `.sutra` / themes / plugins / shortcuts / URLs). The repository is
materially harder to break: a proactive boot-integrity layer with data-safety
recovery, two new static guards, cross-engine regression tests, and a single
deterministic `verify` gate.
