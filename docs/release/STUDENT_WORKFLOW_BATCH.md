# Student workflow batch: review checklist

Branch: `codex/student-workflow-batch`, based on `80569e12`.
All Git commits remain local. Do not merge, push to GitHub, or deploy to
production until the owner validates the candidate and authorizes that action.

## Authorized QA preview — October 13, 2026

The owner authorized a Vercel preview for personal-assistant QA and later
authorized a shareable link so reviewers can open it without signing in.

- App: https://sutra-8lhn0qstc-tanuj-ranjith-s-projects.vercel.app/Sutra.html
- Project: `tanuj-ranjith-s-projects/sutra`; environment: Preview.
- Deployed source: `61eca9b921ab4c93f9579543127558063133996c` from this branch.
- Vercel deployment: `dpl_AkqFedmAdWF6tWK34D1u7auyjCY9`, reported Ready.
- Vercel ran the allowlisted artifact build and `check:deploy` successfully.
  Chrome opened the app at its fresh-workspace onboarding screen. This is a
  deployment availability check, not completion of the remaining QA checklist.
- The deployment's Share dialog is set to “Anyone with the link can view” and
  Vercel confirmed that a shareable link was generated. Its Hobby warning said
  continuing may revoke another shareable link; no specific prior link was
  identified. Use the generated share URL; the plain deployment URL still
  requires sign-in. Production, main, and GitHub remain unchanged.
- Browser-local workspace content and API keys are not part of the preview.
  Unit and workflow/browser regression suites remain pending GitHub CI.

## The agreed 20 items

Numbers below refer to the two original lists, not a newly expanded scope.
Implementation and source review are separate from execution verification.
The listed CI cases have been prepared but have not run for this candidate.

| List / item | Change prepared |
|---|---|
| Wishlist 1 — Assistant effort and Gemini | Existing effort selectors recognize supported Gemini 3 tiers; native PDF/image attachment support and readable attachment errors; thoughts remain unrequested. |
| Wishlist 3 — Emoji choices/search | Full bundled dictionary participates in selection; multiword search combines names, categories, and aliases; accessible labels. |
| Wishlist 4 — Integrations | Remove unimplemented Docs/Calendar/Todoist cards, retain implemented imports and configured Drive, label website launchers as shortcuts. |
| Wishlist 6 — Command palette | Rounded, theme-aware navigation launcher, existing keyboard shortcut and canonical command handlers. Brand, destinations, and utilities share the header's normal flex layout. Destinations use all remaining space instead of duplicating the utility width as a left margin. |
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

Validation follow-ups repair the header's mirrored-space clipping, stale custom
model overrides, provider catalog refresh/pagination, and missing GPT-6 effort
controls. The owner-approved Thinking effort pill is inside the full Assistant
composer beside Send, with an upward-opening menu and keyboard navigation.
CI coverage includes menu selection, dismissal, persistence and 320/390px layout;
these functional and visual checks remain unrun pending authorized remote CI.
The effort backing value uses a hidden input, which the shared select enhancer
cannot turn into another dropdown; CI asserts one effort trigger before selection
and after reload.
Task-list questions read canonical task stores locally; other full-Assistant questions
select matching workspace records under the existing privacy and token-budget
boundaries. Model selection, reload, catalog pagination, permissions, and selective
context regressions are authored for CI; they have not run locally.

The owner's chat export exposed missed task-list phrasing: "can u summarize my
todos" and "check my homework". Local routing now recognizes those requests;
selective provider context recognizes them independently when local routing is
disabled. Notes-only permission failures are labeled with their area and must
not be interpreted as missing tasks. Existing privacy settings remain intact.

Owner validation also exposed an older migration's retained Off permission mode
with no visible way to change it. Settings → Assistant now displays Workspace
access and per-area choices using the existing permission API. Context depth
copy explicitly distinguishes search scope from access. No permission is enabled
automatically, and sensitive/locked-note settings remain unchanged. The composer
now uses a hidden input instead of a hidden select for its backing value, removing
the source of the duplicate styled dropdown. UI persistence and access regressions
are authored for GitHub CI and remain unrun locally.

HTML page PIN validation exposed a missing Create lifecycle signal: unlocking
or removing a PIN restored only the ordinary note editor. Both PIN-screen paths
and removal from page settings now refresh the specialized surface immediately.
The existing authorization gate still clears HTML source and iframe while locked.
CI coverage includes incorrect PINs, unlock, source editing and durable saving,
navigation relocking, PIN removal, reload, and unknown HTML document fields.
These functional checks remain unrun until an authorized push allows GitHub CI.

Owner validation found Ctrl+Shift+V could paste nothing in Create. Modern Notes
now intercepts plain paste before rich clipboard parsing and inserts text in one
undoable transaction. Both editors use native paste/beforeinput event data;
empty paste events do not cancel subsequent native input. HTML-only clipboard
data is converted to text through the canonical sanitizer and an inert template.
The Clipboard Read API fallback has been removed after owner validation exposed
its additional permission requirement; Shift-paste needs no extra read permission.
CI coverage uses a real system clipboard shortcut, multiline/literal text,
undo/redo, reload, normal rich paste, input-event delivery, HTML-only data, and
an API-denial sentinel asserting no clipboard read or blocked-access toast. No functional tests
were run locally; owner validation and GitHub CI remain pending.

### October 14 local QA follow-up

Six confirmed problems have local fixes: capture draft details reset between
items; blank new essay targets stay null; standard/custom exam countdowns share
local-calendar-day logic; Life calculator errors are visible and editable;
unconfigured Drive connection is disabled and session actions stay gated; and
Assistant requests use bounded selective context and relevant action schemas.
No persisted workspace schema changed.

The token audit found the full Actions Bank and lengthy repeated instructions
in every request, automatic note/memory enrichment even at Minimal depth,
pretty-printed context/read metadata, and a budget reconstruction bug that keyed
note excerpts by note ID and repeated one excerpt for each chunk match. The
request builder now keys excerpts by chunk ID, excludes generated Help & Docs
from ordinary searches, and bounds final serialized context/history as well as
individual candidates. Conversation compression preserves message roles.

Chrome on the local server confirmed canceled drafts reopen blank, a new essay
shows the Words placeholder, SAT hub/detail both show 52 days to December 5,
Drive exposes only a disabled unavailable control when unconfigured, invalid
calculator input shows Error, and 2×−3 still gives −6. One cheap Gemini
gemini-3.5-flash-lite/Low check returned QA OK with 2,568 input tokens, compared
with 9,961 in the earlier Gemini smoke check (about 74% lower). It retrieved no
Help & Docs. An additional literal-reply rule then removed incidental workspace
matches for exact-output requests without workspace references; that refinement
was not followed by another paid call.

Only the owner-approved runtime integrity gates, staged hook, syntax validation,
and generated-cache refresh ran locally. New regression tests were reviewed and
syntax checked but not executed; GitHub CI remains pending authorization to push.
The runtime gate initially rejected the small size increase; its budget was
explicitly reviewed with the six-fix rationale and the full gate then passed.
Temporary feature-pack visibility changes were restored. One additional
synthetic essay, QA Blank Target Regression, and one cheap Assistant chat remain
in the local QA workspace. No remote changes, push, merge, or deployment occurred.

Review the local branch and the changes listed above. Once a push is explicitly
authorized, run the existing GitHub CI against this branch's exact commit.
The optional full-browser matrix should cover Firefox, WebKit, and responsive
projects as well as the regular Chromium shards. Inspect page-gap geometry and
the Assistant review flows in the resulting browser evidence. Keep main and
deployment unchanged until the owner validates the result separately.
