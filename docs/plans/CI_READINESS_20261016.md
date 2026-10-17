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

## Full compatibility follow-up

The user authorized checklist 45: full browser/device CI, repair of discovered
failures, small branch commits, and no merge. The initial full run is
`38980869674` at `ceed5e3`; the earlier normal Chromium run `38945216157` passed
all static/unit/build/artifact gates and all three Chromium shards.

CI annotations identified Node 20 action runtimes and an upcoming change to the
`ubuntu-latest` image. Direct action pins were independently checked against
official immutable manifests and updated to Node 24 versions; runners use
`ubuntu-24.04`. Desktop Chrome and Firefox retain three one-worker shards each;
WebKit now has six one-worker shards for full coverage with shorter wall time.
Responsive projects remain in one complete
lane. Browser caches remain shared per engine, and failure artifact names now
include the shard to avoid upload collisions. The workflow guard checks that
desktop shards and responsive projects are neither lost nor duplicated.

A CI-only supplementary reporter prints bounded assertion details when a test
fails, rather than waiting for the end of a long compatibility job. The normal
Playwright summary and retained failure artifacts remain available. No unit or
browser suite, dependency install, browser download, or deploy build ran locally.
No production workflow was dispatched and no main merge was performed.

The user also requested a hosting subagent. Read-only Vercel inspection found a
Ready preview for repository `tanujranjith/Sutra`, branch
`codex/student-workflow-batch`, and commit `ceed5e3`, at
`sutra-git-codex-student-workflow-batch-tanuj-ranjith-s-projects.vercel.app`.
The deployment detail identifies the immutable host
`sutra-cojvrpqrv-tanuj-ranjith-s-projects.vercel.app`. The parent independently
verified the source commit after the subagent verified landing-page availability.
No hosting setting or protection was changed. The precise normal public URL is
still being clarified; a working preview is not proof of production promotion.

Full run `38982196006` at `f68673a` passed static/unit/build/artifact gates and
all three normal Chromium shards. The expanded matrix exposed a WebKit Drive
restore prompt that remains disabled, a narrow WebKit Settings control obscured
by floating UI, and two Firefox synthetic clipboard-event failures. Investigation
and repair validation remain in progress; this run is not a full compatibility
pass. A separate Firefox browser-page setup timeout passed its retry and is
recorded as infrastructure flakiness rather than a failed application assertion.

The Drive investigation also found that locking left a previously scheduled save
timer active. Commit `35e92de` cancels that timer and its queued-upload flag while
preserving dirty local changes. Its required local runtime integrity gate and
staged hook passed; browser regression execution remains on GitHub. Password
prompt diagnostics report only field lengths and dialog state, never passphrases.
WebKit Drive checks now run before the long shard for earlier failure evidence.
The Firefox fixture now attaches its prepared DataTransfer to the synthetic
event explicitly; formatting and reload checks remain unchanged. Settings layout
tests isolate live service-worker state, and a separate mocked-update regression
checks visible-banner disclosure reachability through the actual phone scroller.
The parent corrected an initial bottom-navigation/header assumption before
accepting that regression. Focused Settings and paste checks also precede their
long compatibility shards. These changes still await GitHub execution.
The completed Firefox second shard additionally exposed the same synthetic-paste
issue in pagination and a first-selection timeout in the writing-review fixture.
The pagination transfer is now explicit. Writing review checks visible and
serialized text before focused keyboard selection, retaining the full-selection
requirement and reporting its actual value. Both checks precede Firefox's long
second shard on the next run.
WebKit also reproduced the writing-selection timeout and failed a header geometry
predicate. Header assertions now preserve their thresholds while reporting exact
viewport, control/text rectangles, font status, and original source stacks. Their
production causes remain unproven. The reviewed repair batch supersedes the old
run's remaining WebKit jobs with the complete six-shard matrix; completed results
and observed failures from the old run remain recorded above. No compatibility
failure has been hidden by a new skip or relaxed assertion.

Follow-up run `38986929179` at `7f314ec` passed static/unit/build/artifact gates.
Its targeted Firefox paste (both editors), writing review, and pagination checks
passed, as did WebKit writing review, header geometry, and the new Drive-lock
regression. The Drive restore check exposed an author CSS grid rule overriding
the confirmation label's `hidden` attribute in WebKit and Chromium. Commit
`e4ac3d2` adds the owning password-field hidden backstop and updates generated
cache references; no password or encryption validation was relaxed.

The dedicated visible-update-banner Settings test still failed its reachability
predicates. It now waits for ordinary layout to settle and reports actual scroll
owners, limits, and rectangles on failure, preserving all three predicates.
Settings source forces vertical scroll behavior to auto; smooth scrolling is not
a proven cause. A browser artifact-download request stalled and reset its control
session; no matching artifact was found in Downloads, and that route was stopped.
Remaining transient page/setup or visibility failures that passed retry are
tracked separately from repeated application/fixture failures.

The immutable branch app finished loading to Today with onboarding and no console
errors or warnings. An anonymous HEAD received a Vercel-protection redirect, so
live application headers remain unverified. The installed CLI can inspect the
project with the bundled Node runtime's Windows CA trust; no certificate check
was disabled. No hosting restoration or production promotion was performed.

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
