# Reliability and workspace investigation — October 22, 2026

Branch: `codex/student-workflow-batch`. Existing isolated candidate reused.
No push, merge, deployment, database or production configuration changes.

## Changes and verification

- Settings supporting text raised to 12px by scoped Luna work; main agent
  reviewed the complete CSS diff. Manual viewport/theme checks pending.
- Settings search caches label/control metadata while section-root mutation
  observers invalidate structural, label and control-state changes. Search-owned
  visibility/result updates do not invalidate the cache. Input values are never
  indexed. Ranking behavior is retained; repeated group scans are eliminated.
- Corrected heavy-workspace benchmark to use the actual search-modal collector
  and rendered canary rather than the legacy search shortcut. Main reviewed
  the Luna patch. The benchmark is prepared for CI, not executed locally.
- Sync exposes session-only verification stage/opaque reference, accurate
  session success wording, deliberate retry, and honest skipped-cycle feedback.
  Existing recovery guidance no longer presumes a safety backup already exists
  and hides after recovery. No persistent fields or crypto formats changed.
- Required core recovery copy verified byte-for-byte; runtime check passed all
  27 assertions and its integrity/static-server self-tests. Syntax and diff checks
  passed for Sync changes. New functional regressions await GitHub CI.

## Remaining work in this pass

Assistant investigation integration/review, safe ownership extraction, local
Chrome QA, live disposable Sync/scheduled encrypted backup round-trip, connected
student workflows, and read-only deployment/header verification.

Provider requests have not been made during this pass. Automated suites remain
CI-only; new local commits cannot be certified by CI until a later authorized
push. Final Settings appearance approval remains the user's decision.
