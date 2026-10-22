# Reliability and workspace investigation — October 22, 2026

Branch: `codex/student-workflow-batch`. Existing isolated candidate reused.
No push, merge, deployment, database or production configuration changes.

## Implementation and verification

1. **Performance:** Settings search caches label/control metadata with mutation
   invalidation, avoids forced label layout reads and repeated group scans, and
   never indexes current input values. Manual repeated-query and exact-focus
   checks passed. The heavy-workspace benchmark now exercises the real global
   search modal; numeric performance results await CI.
2. **Assistant:** Added provider-neutral, on-demand canonical search/read with
   at most three calls, four records per fetch, a 6,000-estimated-token request
   budget including answer reserve, no automatic retries, progress, ambiguity
   selection, Stop, live privacy/scope rechecks and honest aggregate usage.
   No workspace bodies are dumped into its initial request. New live provider
   verification is pending; CI unit/browser regressions are prepared, unrun.
3. **Assistant ownership:** Extracted the shared pure receipt builder into the
   existing Assistant folder. Both chat surfaces keep their canonical harness,
   persistence, approval and Undo integration. This is a targeted consolidation,
   not a wholesale move of closure-coupled core code.
4. **Sync diagnosis:** Session-only stage/opaque references, honest session
   timestamps/skipped-cycle feedback, deliberate retry and non-destructive
   recovery guidance. No persistent fields, key formats or encryption changed.
   Rejected-payload regressions await CI. Live checks were explicitly deferred.
5. **Settings polish:** Supporting text raised to 12px. Manual search field
   geometry at 390px retained 44px height without document-wide overflow.
   Final visual approval remains the user's decision.
6. **Live Sync:** pending at the user's request; no account was connected.
7. **Scheduled backup and full restore:** pending at the user's request.
8. **Connected workflow:** Home capture → Home Radar/To-do → notes and URL edit
   → reload → Timeline prep block passed in the disposable local workspace.
   QA exposed a past-time default; corrected scheduling uses a future local
   quarter-hour and honest next-day fallback. The new future block was observed
   in Timeline. Added CI boundary regressions; the broader slash/@/course/review
   matrix was not repeated in this pass.
9. **Deployment exposure:** confirmed open on the normal GitHub Pages URL:
   development guide, package manifest, a unit test and actual legacy HTML
   returned 200; `.git/HEAD` and `.env` returned 404. The branch's allowlisted
   workflow is not evidence of current production artifact contents.
10. **Production headers:** HSTS present; response CSP, nosniff, referrer,
    permissions and opener/resource policies absent. Existing documented Pages
    limitation; production hosting remains unchanged.

## Additional QA fixes

- Saving Assistant enablement now reconciles the optional pack instead of only
  revealing its tab. Manual disable → Save → re-enable → Save verified permission
  controls disable/recover and retain the previous limited access mode.
- Feature-pack disable now waits for pending asset/init work and cleans late
  effects; concurrent initialization is shared. Main reviewed the lifecycle code
  and four deferred regressions. Final normal disable/re-enable passed in Chrome;
  the forced timing races await CI.

## Evidence and limits

- Main agent independently reviewed the scoped Sol/Luna changes and corrected
  evidence redaction, source identity, usage completeness and lazy fixture setup.
- Required recovery copies retained under ignored `.tmp/recovery/`. Core runtime
  check passed 27 assertions and required integrity/static-server self-tests.
  Staged core hook passed for `e6137b4`. Syntax, guardrails, app-shell, canonical
  CSP, generated asset/cache stamps and Intelligence contract checks passed.
- Automated unit/E2E/benchmark suites were not run locally; latest local changes
  cannot be certified by GitHub CI until a later authorized push.
- Disposable origin: `http://localhost:5298/Sutra.html`. One synthetic task and
  its prep blocks remain there; no personal workspace was imported.
- The requested ChatGPT ↔ Sutra MCP paragraph was saved as a new note under
  Projects → Sutra products → Sutra in the existing official Chrome tab. Its
  paragraph and two official OpenAI source links survived reload. MCP companion,
  pairing, deployment and account/tunnel availability remain future work.

## Live provider checkpoint

The user entered a Gemini key privately in the disposable app. The live catalog
listed Gemini 3.8 Flash; it is selected with Low thinking. No generation request
has been sent. Automatic approval review required specific approval for the
synthetic task text and URL; that question remains pending. The prepared prompt
is unsent, and no personal workspace data is part of the proposed test.