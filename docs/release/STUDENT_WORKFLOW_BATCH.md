# Student workflow batch: review checklist

Branch: `codex/student-workflow-batch`, based on `80569e12`.
All commits are local. Do not merge, push, or deploy until the owner validates
the candidate and authorizes that action.

## The agreed 20 items

Numbers below refer to the two original lists, not a newly expanded scope.
Implementation and source review are separate from execution verification.
The listed CI cases have been prepared but have not run for this candidate.

| List / item | Change prepared |
|---|---|
| Wishlist 1 — Assistant effort and Gemini | Existing effort selectors recognize supported Gemini 3 tiers; native PDF/image attachment support and readable attachment errors; thoughts remain unrequested. |
| Wishlist 3 — Emoji choices/search | Full bundled dictionary participates in selection; multiword search combines names, categories, and aliases; accessible labels. |
| Wishlist 4 — Integrations | Remove unimplemented Docs/Calendar/Todoist cards, retain implemented imports and configured Drive, label website launchers as shortcuts. |
| Wishlist 6 — Command palette | Rounded, theme-aware navigation launcher, existing keyboard shortcut and canonical command handlers. Utilities sit outside the scrollable tab row; symmetric space follows their actual width to prevent overlap. |
| Wishlist 7 — Automatic Sync and backup interface | Existing shared Cloud hub retained; two-minute foreground polling, existing return/reconnect/save triggers, independent snapshot and replication guarantees. |
| Wishlist 8 — Plain-text paste | Ctrl/Meta+Shift+V routes plain text through both editor engines before rich content or attachments. |
| Wishlist 9 — Paged mode | Automatic view-only Modern Editor page boundaries, manual-break alignment, one owner for page size/margins, synchronized settings controls. |
| Wishlist 11 — Class/activity recognition | Existing deterministic inference retained; activity labels clarified; submit/manual-override/reload coverage added. |
| Wishlist 12 — Automated backups | Existing encrypted opt-in schedules retained; change-triggered snapshots retry temporary upload/lock contention. |
| Wishlist 14 — Browser notifications | Existing permission-gated browser alerts retained; opt-in, denial, dedupe, and source-opening regression coverage added. |
| Observed 1 — Application Sheets | Bind tabs, fields, and Add Row to the actual Sheets subpage. |
| Observed 2 — SAT/ACT date cards | Parse date-only values as local calendar dates in individual and grouped cards. |
| Observed 3 — Unrated rankings | Exclude blank/all-zero and zero-weight-only entries from ranked picks. |
| Observed 4 — Task notes/URL | Editable imported Homework notes and Reference URLs persist through the canonical store and compatibility mirrors. |
| Observed 5 — Blank essay target | Preserve the existing null/blank distinction and explicit zero; add round-trip regression coverage. |
| Observed 7 — Homework rendering | Escape quoted attributes through the canonical DOM-safety helper, with a null-safe equivalent fallback. |
| Observed 10 — Diagnostic credentials | Scrub modern key formats and nested metadata before logs, toasts, events, diagnostics, or exports; isolate returned copies. |
| Observed 13 — Grade categories | Preserve category IDs by explicit ID or unambiguous name; retain categories referenced by existing scores. |
| Observed 15 — Assistant permissions | Missing/malformed policy denies writes; caller grants only narrow policy; direct and batch writes require review and the canonical permission mode. Import and memory proposals use reviewed controls. Explicit reply buttons remain usable; generated flashcards wait for a review card. |
| Observed 19 — Calculator negatives | Correct unary signs and precedence; reject malformed or partially consumed expressions. |

## Verification and limits

Four Grade Planner unit cases passed before the owner requested GitHub-only
testing. No tests or browser sessions have run afterward. Local commits pass
the existing static staged-core integrity hook; this is not a substitute for
runtime, persistence, security, or browser tests.

Local preparation also regenerated CSP outputs, the offline asset manifest,
and the cache-stamp lock through their owning generators. Changed runtime
assets and the service-worker cache have fresh version identifiers.

The existing GitHub workflow discovers the new unit and Playwright cases and
checks the deploy artifact. It cannot test these local commits until a push is
explicitly authorized. Do not report CI as passed or run CI against another
revision as evidence for this candidate.

Focus CI review on the new `student-*`, `notes-page-layout`,
`browser-notification-opt-in`, `assistant-attachment-errors`,
`grade-planner-categories`, and `custom-tab-calculator` cases, plus affected
Assistant, notes, cloud-provider, encrypted-backup, and cloud-sync suites.

Paged layout is a Modern Editor view feature in the primary pane. Oversized
atomic embeds/images/tables retain their content instead of being clipped;
they may flow continuously across a sheet interval. Classic Editor retains
manual page breaks. Visual typing, paste, zoom, scrolling, and responsive checks
remain pending CI. Browser notification delivery depends on platform permission
and support; no physical-device delivery has been verified in this work.

No new durable workspace schema, provider dependency, or remote database change
is introduced. Existing IDs, unknown metadata, legacy keys, encrypted snapshots,
and Sync payload contracts are preserved. Settings and Help & Docs describe the
changed behavior; feature documents cover academic planning, Modern Editor,
Assistant, integrations, and Cloud Sync.

## Owner review before remote validation

Review the local branch and the changes listed above. Once a push is explicitly
authorized, run the existing GitHub CI against this branch's exact commit.
The optional full-browser matrix should cover Firefox, WebKit, and responsive
projects as well as the regular Chromium shards. Inspect page-gap geometry and
the Assistant review flows in the resulting browser evidence. Keep main and
deployment unchanged until the owner validates the result separately.
