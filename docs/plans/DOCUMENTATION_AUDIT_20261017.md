# Repository documentation audit — 2026-10-17

Full text coverage and parent diff review completed. This manifest records full reads, not keyword-search coverage. No local automated unit/browser suite, deploy build, deployment, provider request, or remote check was run for this documentation audit. The parent ran the required core-runtime integrity gates and owning generators for in-app Help copy. Existing historical validation claims remain dated records.

## Scope and boundaries

Inventory: tracked Markdown, MDX, reStructuredText, and text files from `git ls-files`. Legal and vendor documents are classified separately and preserved. Runtime Help source and additional non-Markdown contracts/notices are listed separately. Primary `AGENTS.md` was read as current policy; candidate `AGENTS.md` remains unchanged.

## Findings at audit completion

- Candidate Homework source (`src/domain/homework-store.js`, `src/compat/legacy-homework.js`) and `docs/runtime-architecture.md` define canonical workspace storage and read-only legacy keys; primary AGENTS says Homework retains localStorage and mirroring. This contract conflict requires owner reconciliation; no policy or runtime change is made here.

Follow-up resolution (October 17): the user delegated the storage choice, and
the parent retained existing canonical persistence for current Homework UI
writes. Candidate policy and feature guides now link the
[migration/recovery record](../architecture/HOMEWORK_STORAGE_MIGRATION.md).
The parent checked and documented retained v1 connected-view mutation paths,
which are separate from the read-only migration adapter; an unqualified claim
that all old keys are read-only would be inaccurate. No runtime, stored task,
or primary checkout was changed. The findings below remain the audit's dated
record; the authority conflict is resolved by this subsequent documented
decision. Trademark policy remains an owner decision.

## Per-file coverage

| Path | Classification | Coverage |
|---|---|---|
| `AGENTS.md` | first-party | read in full |
| `README.md` | first-party | read in full |
| `SUTRA_GUIDE.md` | first-party | read in full |
| `TRADEMARK.md` | legal / notice | read in full |
| `TUTORIAL.md` | first-party | read in full |
| `assets/vendor/VENDORED_DEPENDENCIES.md` | third-party / vendor | read in full |
| `assets/vendor/editor/LICENSE.md` | legal / notice | read in full |
| `assets/vendor/editor/README.md` | third-party / vendor | read in full |
| `assets/vendor/pdf-fontkit/LICENSE.md` | legal / notice | read in full |
| `assets/vendor/pdf-lib/LICENSE.md` | legal / notice | read in full |
| `design-qa.md` | first-party | read in full |
| `docs/FEATURE_WAVE_PROGRESS.md` | first-party | read in full |
| `docs/README.md` | first-party | read in full |
| `docs/SEO_INDEXING_REPORT.md` | first-party | read in full |
| `docs/SUTRA_CLOUD_PROVIDERS.md` | first-party | read in full |
| `docs/SUTRA_CLOUD_SECURITY.md` | first-party | read in full |
| `docs/SUTRA_CLOUD_SETUP.md` | first-party | read in full |
| `docs/SUTRA_CLOUD_TROUBLESHOOTING.md` | first-party | read in full |
| `docs/SUTRA_INTELLIGENCE.md` | first-party | read in full |
| `docs/architecture/SUTRA_ARCHITECTURE.md` | first-party | read in full |
| `docs/architecture/SYNC_PROTOCOL.md` | first-party | read in full |
| `docs/architecture/WORKSPACE_ENTITY_REGISTRY.md` | first-party | read in full |
| `docs/architecture/sutra-save-systems-audit.md` | first-party | read in full |
| `docs/archive/ASSISTANT_UPGRADE_HANDOFF.md` | historical first-party | read in full |
| `docs/archive/CLAUDE_LOCAL_PUBLIC_BETA_IMPLEMENTATION_REPORT.md` | historical first-party | read in full |
| `docs/archive/CLAUDE_LOCAL_PUBLIC_BETA_MASTER_CHECKLIST.md` | historical first-party | read in full |
| `docs/archive/CODEX_PUBLIC_BETA_COMPLETION_CHECKLIST.md` | historical first-party | read in full |
| `docs/archive/CODEX_PUBLIC_BETA_COMPLETION_REPORT.md` | historical first-party | read in full |
| `docs/archive/PUBLIC_BETA_MANUAL_QA.md` | historical first-party | read in full |
| `docs/archive/STUDENT_OS_UPGRADE_REPORT.md` | historical first-party | read in full |
| `docs/archive/audits/2026-08-24/ChatGPT Sol Pro_2026-08-24.txt` | historical first-party | read in full; preserved dated evidence |
| `docs/archive/audits/2026-08-24/GLM 5.3_2026-08-24.txt` | historical first-party | read in full; preserved dated evidence |
| `docs/archive/audits/2026-08-24/GPT 5.6 sol high codex_2026-08-24.txt` | historical first-party | read in full; preserved dated evidence |
| `docs/archive/audits/2026-08-24/Grok 4.5_2026-08-24.txt` | historical first-party | read in full; preserved dated evidence |
| `docs/archive/audits/2026-08-24/OX Alpha_2026-08-24.txt` | historical first-party | read in full; preserved dated evidence |
| `docs/archive/audits/2026-08-24/README.md` | historical first-party | read in full |
| `docs/audits/UI_UX_POLISH_AUDIT_2026-06.md` | historical first-party | read in full |
| `docs/brand/README.md` | first-party | read in full |
| `docs/design-system.md` | first-party | read in full |
| `docs/features/ACADEMIC_PLANNING.md` | first-party | read in full |
| `docs/features/ALL_DUE_COMMAND_CENTER.md` | first-party | read in full |
| `docs/features/BACKGROUND_REMINDERS_WAVE_E.md` | first-party | read in full |
| `docs/features/BRAND_ASSETS.md` | first-party | read in full |
| `docs/features/BUSINESS_WORKSPACE.md` | first-party | read in full |
| `docs/features/CANVAS_AND_TIMED_HABITS.md` | first-party | read in full |
| `docs/features/CLOUD_SYNC.md` | first-party | read in full |
| `docs/features/CONTENT_TIMELINES.md` | first-party | read in full |
| `docs/features/COURSE_HUB.md` | first-party | read in full |
| `docs/features/COURSE_ICONS.md` | first-party | read in full |
| `docs/features/CSS_MODS_GUIDE.md` | first-party | read in full |
| `docs/features/CUSTOM_QUOTES.md` | first-party | read in full |
| `docs/features/DAILY_QUOTES_SOURCE_AUDIT.md` | first-party | read in full |
| `docs/features/DASHBOARDS_WAVE_C.md` | first-party | read in full |
| `docs/features/DATA_SAFETY_SYNC_UPGRADES.md` | first-party | read in full |
| `docs/features/DOCUMENT_BACKGROUNDS.md` | first-party | read in full |
| `docs/features/DOCUMENT_EXPORT.md` | first-party | read in full |
| `docs/features/FOCUS_TIMER.md` | first-party | read in full |
| `docs/features/FOLDERS.md` | first-party | read in full |
| `docs/features/GLOBAL_SEARCH.md` | first-party | read in full |
| `docs/features/GOOGLE_DRIVE_SYNC_SETUP.md` | first-party | read in full |
| `docs/features/HANDWRITING_AND_DRAWING.md` | first-party | read in full |
| `docs/features/HTML_PAGES.md` | first-party | read in full |
| `docs/features/INLINE_AI_WRITING.md` | first-party | read in full |
| `docs/features/INTEGRATIONS.md` | first-party | read in full |
| `docs/features/LIFE_WORKSPACE.md` | first-party | read in full |
| `docs/features/MOBILE_AND_RESPONSIVE_BEHAVIOR.md` | first-party | read in full |
| `docs/features/MOBILE_NAV_UPGRADES.md` | first-party | read in full |
| `docs/features/MOBILE_WORKSPACES.md` | first-party | read in full |
| `docs/features/MODERN_NOTES_EDITOR.md` | first-party | read in full |
| `docs/features/MODS_AND_CUSTOMIZATION.md` | first-party | read in full |
| `docs/features/NAVIGATION.md` | first-party | read in full |
| `docs/features/NOTES_SEARCH_UPGRADES.md` | first-party | read in full |
| `docs/features/NOTES_SEARCH_WAVE_B.md` | first-party | read in full |
| `docs/features/PDF_WORKSPACE.md` | first-party | read in full |
| `docs/features/PLANNING_ASSISTANT_UPGRADES.md` | first-party | read in full |
| `docs/features/PLUGIN_SDK.md` | first-party | read in full |
| `docs/features/REBRAND_AND_COMPATIBILITY.md` | first-party | read in full |
| `docs/features/REVIEW_GENERATOR.md` | first-party | read in full |
| `docs/features/RICH_LINKS.md` | first-party | read in full |
| `docs/features/SCROLLYTELLING_AND_LANDING_PAGE.md` | first-party | read in full |
| `docs/features/SETTINGS.md` | first-party | read in full |
| `docs/features/SHARE_TARGET_AND_TIMELINE_SCHEDULING.md` | first-party | read in full |
| `docs/features/SHEETS.md` | first-party | read in full |
| `docs/features/SHORTCUTS.md` | first-party | read in full |
| `docs/features/SLIDES.md` | first-party | read in full |
| `docs/features/SNAPSHOT_BROWSER_WAVE_D.md` | first-party | read in full; deleted after consolidation |
| `docs/features/STARTER_PACKS.md` | first-party | read in full |
| `docs/features/STUDY_REVIEW_UPGRADES.md` | first-party | read in full |
| `docs/features/STUDY_WAVE_A.md` | first-party | read in full |
| `docs/features/SUTRA_ASSISTANT.md` | first-party | read in full |
| `docs/features/SUTRA_CLOUD.md` | first-party | read in full |
| `docs/features/TIMELINE_CALENDAR.md` | first-party | read in full |
| `docs/features/TODAY_DASHBOARD.md` | first-party | read in full |
| `docs/features/TO_DO.md` | first-party | read in full |
| `docs/features/WORKSPACE_PRIVACY_LOCK.md` | first-party | read in full |
| `docs/features/WORKSPACE_TIME_MACHINE.md` | first-party | read in full |
| `docs/plans/BROWSER_QA_CHECKLIST_20261015.md` | first-party | read in full |
| `docs/plans/CI_READINESS_20261016.md` | first-party | read in full |
| `docs/plans/CONNECTED_FEATURES_PROPOSAL_20261015.md` | first-party | read in full |
| `docs/plans/CREATE_POLISH_REVIEW.md` | first-party | read in full |
| `docs/plans/OPEN_ISSUES_HANDOFF_20261009.md` | first-party | read in full |
| `docs/plans/OVERNIGHT_HANDOFF.md` | first-party | read in full |
| `docs/plans/OVERNIGHT_IMPLEMENTATION_PLAN.md` | first-party | read in full |
| `docs/plans/OVERNIGHT_RESEARCH.md` | first-party | read in full |
| `docs/plans/QA_CREATE_AUTHORING_20261001.md` | historical first-party | read in full |
| `docs/plans/QA_MOBILE_LAYOUT_20261001.md` | historical first-party | read in full |
| `docs/plans/QA_SWARM_20261001.md` | historical first-party | read in full |
| `docs/plans/QA_TASKS_NAVIGATION_20261001.md` | historical first-party | read in full |
| `docs/plans/STUDENT_WORKFLOW_HANDOFF_20261015.md` | first-party | read in full |
| `docs/privacy-security/DATA_AND_BACKUPS.md` | first-party | read in full |
| `docs/privacy-security/PRIVACY_AND_LOCAL_FIRST.md` | first-party | read in full |
| `docs/release/AUDIT_REMEDIATION_CERTIFICATION_2026-08-30.md` | historical first-party | read in full |
| `docs/release/CHANGELOG.md` | first-party | read in full |
| `docs/release/CLOUD_SYNC_AUDIT_2026-07-22.md` | historical first-party | read in full |
| `docs/release/LOCAL_CHECKLIST_AUDIT_2026-09-18.md` | historical first-party | read in full |
| `docs/release/STUDENT_WORKFLOW_BATCH.md` | first-party | read in full |
| `docs/release/SUPABASE_ACCOUNT_ISOLATION_CHECKLIST.md` | first-party | read in full |
| `docs/release/SUPABASE_MANUAL_ACCEPTANCE_2026-07-30.md` | first-party | read in full |
| `docs/release/SYNC_BETA_RELEASE_READINESS_2026-08-06.md` | first-party | read in full |
| `docs/release/TESTING_AND_RELEASE_CHECKLIST.md` | first-party | read in full |
| `docs/runtime-architecture.md` | first-party | read in full |
| `docs/security-headers.md` | first-party | read in full |
| `extension/README.md` | first-party | read in full |
| `info.md` | first-party | read in full; deleted after consolidation |
| `robots.txt` | first-party | read in full |
| `scripts/README.md` | first-party | read in full |
| `src/README.md` | first-party | read in full |
| `src/components/icons/README.md` | first-party | read in full |
| `src/features/README.md` | first-party | read in full |
| `styles/README.md` | first-party | read in full |
| `supabase/README.md` | first-party | read in full |
| `tests/README.md` | first-party | read in full |

## Generated in-app Help source

- `src/features/workspace/help-docs-refresh.js` — read in full by the auditor; copy corrections applied and reviewed by the parent.
- `src/core/app.js` Help generator — read in full (`buildHelpPageContentV2` and wrapper); copy corrections applied and reviewed by the parent.

## Verified corrections

- Snapshot browser recovery points are device-local, excluded from workspace backups/Sync (`src/core/app.js` snapshot functions and `persistence-inventory.json` deviceLocal decision). Corrected `WORKSPACE_TIME_MACHINE.md`.
- Link checker validates local file targets after removing query/fragment; it does not check anchors or remote URLs (`scripts/check-links.mjs`). Corrected `docs/README.md`.

## Additional verified corrections and consolidation

- `docs/features/DOCUMENT_BACKGROUNDS.md`: direct PDF background behavior now matches `src/features/workspace/direct-pdf-export.js` (background opacity and explicit CSS-blur warning); network portability text includes separately enabled encrypted backup destinations and Sync.
- `docs/SUTRA_CLOUD_SECURITY.md` and `docs/SUTRA_CLOUD_TROUBLESHOOTING.md`: duplicate CSP destination policy now links to Setup's canonical hosted/self-hosted matrix. `scripts/lib/csp-policy.mjs` contains bounded approved wildcard families, contradicting the former “no wildcards” claim. Live browser storage is not encrypted by the backup passphrase; the local app decrypts backups only with the supplied passphrase. Restore guidance distinguishes a pre-apply failure from an incomplete durable restore; S3 remains preview.
- `docs/features/PLUGIN_SDK.md`: final install example now follows the experimental opt-in location already documented at the top, rather than contradicting it with the ordinary Customization screen.
- `docs/features/ACADEMIC_PLANNING.md`: corrected persistence inventory path to `docs/architecture/persistence-inventory.json`.

## Owner follow-up / reserved material

- `TRADEMARK.md` names NoteFlow Atelier throughout. It was read and preserved as a legal/brand-policy document; owner should decide whether to extend the stated policy to Sutra.
- Homework authority discrepancy also affects `src/features/README.md`, `docs/features/TO_DO.md`, `docs/features/GLOBAL_SEARCH.md`, and `docs/features/ACADEMIC_PLANNING.md`. Proposed neutral description until resolved: “Homework writes through the established Homework store; legacy storage identifiers and import compatibility remain supported.” Do not treat that wording as authorization to remove the user-required mirroring contract.
- Parent reconciled completion wording in both Help sources with the accepted-local-action path in `src/ui/task-completion-effects.js`; persistence confirmation remains separate.
- No test status in historical reports has been promoted to current certification. Parent supplied current CI context: run 38997646618 at d95489e had 16 successful lanes and one WebKit5 failure in the closing-connection persistence test (`WorkspaceConflictError`); local commits 22e72fe and 21554b2 were unpushed. This audit did not query CI.
## Deleted obsolete documentation

| Deleted path | Canonical replacement | Reason / reference handling |
|---|---|---|
| `docs/features/SNAPSHOT_BROWSER_WAVE_D.md` | `docs/features/WORKSPACE_TIME_MACHINE.md` | Obsolete duplicate snapshot-browser summary; retained unique API and test-scope details in canonical Time Machine guide. Repository Markdown/JS/MJS/JSON reference search found no inbound references outside this audit inventory. No redirect stub needed. |

- Additional implementation evidence: `src/core/migrations.js` declares CURRENT_VERSION 8; `src/core/app.js` Cloud metadata declares schemaVersion 3; `package.json` verify includes unit and Sync suites; guardrail `SCAN_FILES` is built through runtime-source discovery. Architecture and source-feature README corrections follow these facts. Homework authority conflict also appears in Data and Backups; left for parent resolution.

## Reserved privacy / generated Help corrections for parent

- Completed after parent released non-PIN edits: `PRIVACY_AND_LOCAL_FIRST.md` now includes enabled encrypted Sync/provider transfers, canonical Assistant history, optional accounts, and the limits of clearing local data. PIN sections were preserved.
- Parent reports applied generated Help corrections: Past-due grouping, completion acknowledgement, Timeline views, hosted Supabase CSP, enabled Sync/provider network paths, and provider CSP messages. Parent owns runtime review and validation; this audit did not edit generated Help.
## Current checkpoint

- 132 baseline inventory entries read in full; zero pending. Deleted entries remain represented in the table. Generated Help source was read separately as recorded below. All baseline paths, including deleted entries, remain listed in the coverage table.
- Generated Help runtime sources were fully read separately.
- Manual changed-document reference review resolved 61 local Markdown file targets; one regex-in-code false positive (Plugin SDK ID syntax) was inspected and ignored. No missing real file target was observed. This is not anchor, remote URL, or full repository link certification.
- `git diff --check` passed at this checkpoint. No automated suite or build run.
- No unread or missing text documentation remains in the baseline. Dated history and raw audit transcripts were retained as evidence, with no historical test claim promoted to current certification.

## Inventory accounting clarification

The initial `git ls-files '*.md' '*.mdx' '*.rst' '*.txt'` inventory contains **132 tracked paths**. Earlier conversational estimates of 140 and 133 were counting errors, not scope exclusions. The original 132-row coverage table remains intact, including deleted files; totals must be counted only from that table, not later prose or the deletion table. New audit Markdown itself is additional documentation, not part of the baseline. Generated Help sources are two additional runtime-source reads, not `.md` inventory entries. Legal/vendor notices remain in the baseline and preserved. No archive/transcript was excluded. Tracked deleted paths still appear in `git ls-files` until integration/staging, so filesystem presence is a separate condition from tracked inventory membership.

| Deleted path | Canonical replacement | Reason / reference handling |
|---|---|---|
| `info.md` | `README.md`, `SUTRA_GUIDE.md`, and linked feature contracts | Redundant product overview with obsolete active wellness/journal claims. Current overview and guides already preserve the useful product/workflow descriptions. Complete tracked Markdown/HTML/JS/MJS/JSON reference search found no inbound references except this audit manifest. |

README PIN wording now matches the fully read `src/core/page-pin-crypto.js` PBKDF2 format; candidate AGENTS was preserved and current user policy remains controlling. `DAILY_QUOTES_SOURCE_AUDIT.md` now accurately labels its partial historical source ledger and unconfirmed attribution caveats rather than claiming every shipped quote was independently verified.
## Additional tracked documentation and assets

| Path | Classification | Coverage / action |
|---|---|---|
| `LICENSE` | legal | Read in full; preserved |
| `NOTICE` | legal/third-party attribution | Read in full; preserved |
| `docs/architecture/persistence-inventory.json` | normative machine-readable documentation | Read in full in bounded chunks; preserved (no schema/contract edits) |
| `docs/brand/sutra-brand-board.png` | binary documentation illustration | Classified as illustration, retained; not represented as a text read |

The baseline is 132 text-extension paths; additional coverage is eight text documents plus two Help runtime-source regions. The binary brand board is a retained asset. Legal/vendor rows in the baseline remain preserved. The audit manifest itself is new documentation outside that original baseline.

## Final reconciliation and combinations

- Canonical Supabase schema/migration setup remains `supabase/README.md#2-apply-the-schema`; Cloud Sync and the Account A/B checklist now link there instead of maintaining an incomplete July-only chain. Added the distinct backup-index privilege reconciliation link. No SQL or remote state changed.
- Root Guide/Tutorial privacy, mobile navigation, first-launch, settings, Timeline, optional safety-export, and portable-vs-device-local descriptions were corrected against current feature/source evidence. Existing headings were retained to preserve inbound anchors.
- CSS guide now distinguishes Modern Editor and classic fallback hooks and the 640px phone navigation boundary. Custom CSS is not described as unable to request assets; CSP remains the network boundary.
- The save-systems audit is explicitly historical. Current Data and Backups links it as dated evidence, preserving unique historical detail rather than silently rewriting it.
- Release checklist now distinguishes selected Node checks, executable unit/browser verification, full gates, host-specific header evidence, and historical certification. No listed check was executed by this audit.
- `info.md` unique-content review: its still-current workflow relationships, Local Help/memory, starter packs, extension interoperability, and product boundaries already have current root-guide/feature coverage. It added no independent contract; retired wellness/journal claims were obsolete. Its deletion removes redundant overview maintenance without removing implementation or historical evidence.
- Unresolved: Homework authority conflict at the source paths above; candidate AGENTS policy drift; legal owner decision for `TRADEMARK.md`. These remain explicit owner decisions, not silently adopted contracts.
- Parent review replaced contradictory current Homework authority claims with established-store/legacy-compatibility descriptions and one explicit discrepancy in Data and Backups. No storage implementation, migration, legacy key, or agent policy changed. Parent also corrected the proposed Tutorial safety-export encryption wording against the actual restore helper before accepting it.
Baseline classification totals: 105 first-party, 21 historical first-party, 4 legal/notice, 2 third-party/vendor = 132. Two first-party files were deleted after consolidation;130 baseline paths remain on disk. Additional LICENSE/NOTICE remain preserved. Final changed-document local-file target review checked 157 target occurrences; no missing actual local file target was found. Fragment anchors and remote URLs were not certified. Final git diff --check passed. No local automated suite/build/provider request was run.

Link-review implementation note: the first final pass mishandled root-document relative paths; corrected the base directory and repeated the same bounded changed-document review. The corrected pass checked 157 occurrences with zero missing local file targets. No source or file changes were made by the reviewer script.

## Supplemental vendor notices outside the extension inventory

The tracked-name check for LICENSE/NOTICE/README variants found five additional vendor licenses outside `.md`/`.txt`; each was read in full (long JSZip text in bounded chunks) and preserved:

- `assets/vendor/jszip/LICENSE.markdown`
- `assets/vendor/office/LICENSE.mammoth`
- `assets/vendor/office/LICENSE.sheetjs`
- `assets/vendor/pdfjs/LICENSE`
- `assets/vendor/pdfjs/cmaps/LICENSE`

Final accounting:132 baseline text paths +8 supplemental text documents =140 text documents read, plus2 generated Help source regions. Two baseline obsolete first-party documents were deleted; all legal/vendor notices remain unchanged. Binary illustration classification is separate. No unread/missing text document remains in this defined tracked inventory.
