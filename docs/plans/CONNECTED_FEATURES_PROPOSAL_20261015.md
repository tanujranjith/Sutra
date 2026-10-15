# Connected features: proposals and decisions

Status: proposals only, 2026-10-15. No accounts, registrations, remote services,
cloud settings, billing, licenses, or deployments were changed for this work.
Core Sutra remains usable locally without sign-in or an AI provider.

## ChatGPT subscription access

Current official documentation supports eligible ChatGPT plan use in
participating open-source local apps, through a dedicated authorization flow.
Identity sign-in alone does not grant inference permission. This makes an
optional local integration worth investigating; it does not make an ordinary
OpenAI API key consume a ChatGPT subscription. See the
[Sign in with ChatGPT quickstart](https://developers.openai.com/siwc/quickstart).

The official example uses a desktop runtime for OAuth callbacks, protected
credential storage, and provider requests. It limits the described local-app
integration to open-source tools/personal projects; paid or remotely hosted apps
must request access. See the
[official integration example](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt).

Recommended next step: a separately approved local prototype, keeping the
static Sutra app intact. Use supported registration, PKCE, state/nonce and token
validation, explicit plan-usage consent, model discovery, a usage-management
link, disconnect/reconnect, and request cancellation. Keep credentials outside
workspace data, exports, diagnostics, and Sync. Never reuse Codex's credentials
or represent a normal API-key connection as subscription access. Test one cheap
request only after the user connects. Confirm the supported client shape and
eligibility before committing to a desktop helper or hosted implementation.

## Calendar

Start with an optional, read-only Google Calendar connection. Preview selected
calendars and proposed Timeline entries, preserving provider event IDs and
source labels. Reuse Timeline and existing calendar import conventions rather
than creating a second schedule. Show last successful refresh, disconnected,
offline, and authentication states separately.

Before two-way changes, define recurrence/time-zone behavior, deletion handling,
conflict review, duplicate prevention, credential exclusion, and a disconnect
that leaves local work intact. Account registration and any hosted callback
configuration require separate authorization. ICS import/export stays useful
without this feature. Acceptance needs actual provider changes, offline edits,
reconnect, and daylight-saving checks, not a connection badge alone.

## API or MCP

First expose a small, permissioned read interface: search permitted notes,
retrieve a specific note, list tasks with filters, and retrieve task details.
Resolve canonical records through the same authorization and source-disclosure
boundaries as Sutra Assistant. Locked content requires separate consent; secrets,
raw storage, and whole-workspace dumps are not read tools.

A static web server cannot read a user's live browser workspace by itself.
Choose an explicit browser-to-local-adapter connection before choosing a
transport. Authenticate callers, bind capabilities to the current workspace and
session, reject unexpected origins, and make connection/disconnect visible.
Keep it off by default. Later write tools should prepare existing reviewable
Sutra actions; they should not bypass approval, persistence, Undo, or backups.
Acceptance includes blocked areas, locked notes, stale sessions, injection-like
source text, and rejected writes as well as successful reads.

## Hosted backup storage allowances

Keep local encrypted backups independent. A hosted allowance needs authenticated
account ownership, server-enforced ciphertext-byte limits, retention rules,
accurate usage reporting, deletion semantics, and recovery tests. Decide who
pays for storage and bandwidth before advertising a number of gigabytes.

Quota exhaustion must report that the upload failed while local saving continues.
Never delete the last recoverable snapshot silently to make room. Enforce limits
at the service boundary; a front-end counter is insufficient. Provisioning or
changing a hosted service is outside this local branch work.

## Automations

Begin with deterministic, explicitly enabled rules while Sutra is open: trigger,
conditions, previewable action, last run, next run, retry state, and disable.
Reuse existing backup/notification/scheduling systems and stable operation IDs
to avoid duplicate actions after retries or reloads. Start with a useful narrow
rule such as creating a review reminder from an explicitly completed task.

AI generation remains separately disclosed, bounded, and optional; automation
does not grant broader workspace access or spending permission. Destructive
actions and external communications require explicit review. Always-running
jobs while the browser is closed need a separately designed optional runtime.

## Open source and license

Recommendation: retain the repository's current Apache-2.0 license for now.
It fits a local-first product whose data and security behavior users can inspect,
and avoids making a licensing change part of a reliability release. A hosted
service can have its own product and access decisions without silently changing
the existing source license.

Before any change, review contributor ownership, third-party licenses, brand
rights, distribution expectations, and the intended commercial model. Apache
2.0 grants rights subject to its stated conditions; changing future licensing
does not by itself retract those existing grants. See the
[Apache license text](https://www.apache.org/licenses/LICENSE-2.0).
The owner makes the final licensing decision; this proposal changes no license.

## Order after reliability validation

1. Validate the current branch and its backup/Sync boundaries.
2. Assess the supported local ChatGPT connection shape and choose the API/MCP
   adapter architecture.
3. Prototype read-only Calendar and one deterministic automation independently.
4. Design hosted quotas only after storage ownership and costs are decided.

Each prototype needs its own narrow acceptance criteria and review. None of
these proposals is a claim that the corresponding feature has shipped.
