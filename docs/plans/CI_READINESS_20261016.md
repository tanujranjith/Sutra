# Local QA and CI readiness — October 16, 2026

Branch: `codex/student-workflow-batch`. The initial inspection and preparation
below preceded push authorization. On October 16 the user authorized uploading
this branch for GitHub CI after preflight review. No merge, production promotion,
or remote configuration change is authorized. Prepared coverage is not a claim
that pending automated tests have passed.

## Initial CI execution

- The branch was pushed at `b28b216`; GitHub confirmed `main` remained at
  `80569e1`. Vercel reported a successful protected branch preview build.
- Initial encoding and intelligence-harness gates exposed intentional encoding
  examples and stale prompt wording. Narrow checker/expectation corrections were
  reviewed and committed at `ded63c8` and `8a3e6e4`.
- All static checks passed in CI at `8a3e6e4`. Node 24 did not discover unit tests
  from the old directory argument; `9b8e839` uses an explicit quoted test glob.
- CI run `38917983086` executed 867 unit tests: 846 passed, 21 failed, none skipped.
  Repairs cover async extraction fixtures, canonical Sync identities/source
  inventory samples, calculator dependency setup, XML-escaping expectations,
  recovery-adapter discovery, missing icon mappings, and nested credential labels
  in diagnostic error stacks. Those repairs require another CI run.
- One security-fix subagent inadvertently ran a synthetic reporter reproduction
  and an intermediate syntax check locally. Further local execution was stopped;
  no unit or browser suite was run on the user's PC. Required asset/CSP/cache
  generation remains within the earlier local-integrity exception.

## Browser failure repairs

Run `38919181517` at `ff02520` passed the static, unit, build, and artifact
gates, but Chromium reported 46 failures, 674 passes, one flaky test, and three
skips. Repairs on this branch preserve the original safety assertions:

- Assistant fixtures configure providers through `SutraProviderMeta`, rather
  than changing hidden legacy controls. Approved actions are explicitly enabled
  in the test that reviews and applies them; standard-model fixtures exercise
  the `max_tokens` compatibility retry without changing reasoning-model rules.
- Saved-memory permission is checked before retrieval, denied memory selection
  metadata is removed, and usage is recorded only for authorized memories that
  survive both prompt budgets. Unit and browser regressions cover denial.
- Classic plain-text paste creates an immediate undo history entry; Shift+Z
  redo handles the uppercase browser key value.
- Help & Docs uses namespaced live Modern Editor anchors and canonical stored
  anchors, with explicit read-only accessibility state. Painted page gaps are
  aligned after the editor's gap widgets enter the DOM.
- Settings and academic fixtures use the current disclosures, category labels,
  and pack opt-in. Backup rollback tests retain detailed failure assertions while
  expecting the deliberately safe public status message.
- The retained legacy theme modal is tested through its explicit API. The Themes
  card's approved Assistant `/theme` entry has separate end-to-end coverage.

All test data and provider responses are synthetic. No unit or browser suite was
run locally for these repairs. Required runtime integrity checks (including the
temporary static-server guard), the staged core hook, and owned asset/CSP/cache
generators ran locally. The browser result for the final revision remains pending
until its GitHub CI run completes. No main merge or production promotion occurred.

Run `38939631344` at `51c0393` passed all non-browser gates and reported 719
Chromium passes, two failures, and three skips. The remaining failures were the
stale Themes-card/modal expectation (corrected in `7a512ff`) and long-paragraph
pagination: painted gaps aligned, but 32 text rectangles still intersected them.
The next CI revision checks that pagination regression before the full editor
shard; the original no-intersection, boundary, and persistence assertions remain.

## Vercel inspection

Read the signed-in dashboard for project `sutra` in `tanuj-ranjith-s-projects`:

- Connected Git repository: `tanujranjith/Sutra`.
- Production branch tracking: `main` (`sutra-two.vercel.app`).
- Preview branch tracking: enabled for all unassigned Git branches.
- Ignored Build Step: Automatic; no production-only or skip-all rule selected.
- Build Node version: 24.x.
- Deployment Protection: Require Log In enabled, Standard Protection selected.
- Preview environment: no project environment variables displayed.
- No deploy hooks or deployment checks configured in the inspected project.

Consequently, pushing this branch would normally trigger both GitHub CI and a
Vercel preview build. It would not update this project's production branch.
Preview authentication remains enabled. No settings were changed. If the user
wants CI without a preview, obtain approval for a separate preview-tracking or
branch-specific deployment-rule change before making it.

The CLI inspection failed on certificate trust; it was not bypassed. Inspection
completed through Chrome. No credential values or environment files were read.

## Prepared checks

| Checklist | Coverage reviewed/prepared | Remaining gate |
|---|---|---|
| 19 | Existing `tests/unit/student-security-boundaries.test.mjs`: fake modern provider keys, nested credential aliases, encoded query/text labels, report/export sinks, returned-copy isolation, ordinary diagnostic preservation. No duplicate test added. | Execute in CI. |
| 39 | Existing retirement/migration tests cover opaque data and Assistant/search exclusion. Enhanced `everything-workspace.mjs` feeds actual diff/merge and two-device/snapshot/reload Sync tests; enhanced encrypted-backup cases assert sleep/wellness preservation after restore/reload and no plaintext leakage. Unknown nested `0`/`false` values are included. | Execute the enhanced backup/Sync and exclusion regressions in CI. |
| 41 | New `tests/e2e/restore-write-failure.spec.mjs`: attachment-write failure produces incomplete-restore warnings and missing-blob metadata; workspace-write failure preserves the old durable root. Both preserve recovered content in memory and do not report import success. | Execute in CI. |
| 42 | New `tests/unit/sync-safety-qa.test.mjs`: rejected authentication or corrupted ciphertext preserves workspace, acknowledged baseline/cursor, queued local edit and earlier conflict data; no remote apply/push/acknowledgement. Existing crypto, conflict-store-failure, conflict-storm and session-binding regressions retained. | Execute in CI; live service fixtures remain separate. |

All new tests use synthetic data and existing production seams. The restore
fault injection is confined to the CI browser fixture and restored after the
attempt. It awaits the canonical restore promise rather than an arbitrary delay.
No production source or safety hooks were changed. Luna findings and new test
diffs were independently reviewed and corrected before acceptance.
Portability assertions inspect actual transferred/restored Life records before
projection canonicalization, so a projection dropping the same field from both
comparison inputs cannot hide the loss.

Existing CI discovers the new unit and Chromium tests automatically. No new
workflow, real provider key, paid model call, or remote database is required for
these synthetic cases. No automated suite was run locally.

## Manual Chrome follow-up

Used the disposable `http://127.0.0.1:5196` QA workspace only:

- Life exposes goals, habits, spending, skills, calculator and books.
- Widget picker contains no wellness, mood, gratitude, breathing, calorie,
  fitness, sleep, water or eye-break controls.
- Settings searches for wellness, sleep, mood and calorie return zero matches.
- Command searches expose no retired health actions. Ordinary fuzzy matches
  and descriptive Help & Docs results are not health-tracking controls.
- Global workspace searches for wellness and gratitude return zero results
  in this QA fixture; legacy record exclusion also has synthetic unit coverage.
- Create's All-template list contains no Daily Journal or health templates.
- Life Pack was temporarily enabled and restored to Off. One empty
  `QA Retirement Discovery` tab remains for review; no health records were added.
- Chrome zoom shortcuts did not alter the measured 1751px viewport or pixel
  ratio of 1. Actual 67%/150% browser zoom remains unverified; viewport resizing
  is not a substitute.

Provider spending in this follow-up: zero. User-entered PIN/passphrase, actual
Windows notification, backup destination and second-device checks remain open.
