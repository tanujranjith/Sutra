# Sutra Intelligence & Sutra Assistant

Sutra Intelligence is the local-first "thinking" layer inside Sutra. Sutra
Assistant is the chat surface you talk to. Together they form a maintainable
intelligence system built from small registries, schemas, adapters, and a local
router — not one giant prompt or one monolithic file.

This document explains what runs locally, when (and only when) a provider is
called, how Local Help works without an API key, what the assistant can do, how
action proposals / confirmation / Activity / Undo work, what Assistant Memory is
and how to manage it, and exactly what a `.sutra` export includes and excludes.

---

## 1. Architecture — the Sutra Intelligence Harness

| Concern | Module / owner | Global |
| --- | --- | --- |
| Product knowledge (verified facts) | `src/features/assistant/sutra-product-knowledge.js` | `window.SutraProductKnowledge` |
| Certified-action metadata (domain, scope, flags) | `src/features/assistant/sutra-capability-registry.js` | `window.SutraCapabilityRegistry` |
| Local signals + Activity log + import parsing | `src/features/assistant/flow-intelligence.js` | `window.sutraIntelligence` / `window.flowIntelligence` |
| Action catalog, validate / preview / apply / undo, intent router | `src/features/assistant/flow-assistant.js` | `window.sutraAssistant` / `window.flowAssistant`, `window.SutraAssistantActions` |
| Long-term memory store + retrieval + manager UI | `src/features/assistant/sutra-assistant-memory.js` | `window.SutraAssistantMemory` |
| Local Help decision tree + UI | `src/features/assistant/sutra-local-help.js` | `window.SutraLocalHelp` |
| Local Help / Memory styling | `styles/features/sutra-assistant-help.css` | — |

The registry-style modules load **before** `flow-assistant.js`; the memory and
Local Help modules load **after** it (they call its one action pipeline at
runtime). Legacy `flow*` globals are preserved as aliases.

**Why this shape:** adding a feature = one structured registry entry, not edits
scattered across prompts. Parsing, validation, preview, execution, logging, and
undo are independently testable (`scripts/sutra-intelligence-harness-check.mjs`,
`tests/e2e/assistant-intelligence-upgrade.spec.mjs`).

---

## 2. What runs locally vs. what calls a provider

**Sutra Intelligence makes no server calls itself.** These always work offline,
with **no API key**:

- Product/help answers (Product Knowledge Registry).
- Local Help decision-tree flows.
- Navigation and supported direct commands.
- Deterministic workspace summaries: overdue, due-today, schedule conflicts,
  review debt, grade math, daily briefing, recovery plans.
- Assistant Memory (create, retrieve, edit, disable, delete) and the Memory
  manager.

A request only goes to the **AI provider you configured** when it genuinely
needs generation — drafting, explaining, transforming, extracting, or open-ended
planning reasoning that local systems can't do.

The Local Intent Router (in `flow-assistant.js`) decides this **before** any
provider call. Locally-answered results are clearly labeled — Local Help cards
show an **"Answered locally / No API key required"** badge, memory recalls are
tagged as coming from saved memory, and proposals render as confirmation cards.

---

## 3. Local Help (no API key required)

Local Help is a click-through, multiple-choice help mode for non-generative
features. It works when no provider is selected, no key is entered, or you are
offline.

- Open it from the assistant empty state ("Browse Local Help" / "Open Local
  Help"), or type `help` / `local help`.
- Pick an option → Sutra shows a local answer card (pulled from the verified
  Product Knowledge registry), optional numbered steps, follow-up choices, an
  **"Open in Sutra"** button for navigation, **Back** / **Help menu** /
  **Never mind** controls, and — only where a generative follow-up could help —
  a **"Use provider instead"** option that fires *only* if you choose it.
- It never calls a provider on its own, adds no analytics/telemetry, and does
  not create long-term memory.

Each help topic is one data entry in `sutra-local-help.js`, usually referencing a
Product Knowledge id so help text and product facts stay in lockstep.

---

## 4. Workspace Access (context depth)

Workspace Access controls how much of your workspace the assistant can read when
you send an AI request:

- **Minimal** — almost nothing beyond your message.
- **Current view** — only the active screen / current area.
- **Full workspace** — broad context across your workspace.

Locked-note contents and API keys are **never** included at any setting. Each
certified action also declares a required scope in the Capability Registry, so
the registry knows which actions a given depth permits. Change it in
**Settings ▸ Assistant** or by asking the assistant to change context depth.

---

## 5. What Sutra Assistant can do — certified actions

Actions are defined once in the action catalog (`flow-assistant.js`) and enriched
with declarative metadata (domain owner, required scope, read-only / reversible /
destructive flags) in the Capability Registry. Covered domains: navigation;
planner tasks; Homework; notes & pages; Canvas; Course Hub; Timeline; Review &
flashcards; Cram/AP study; plans (day/week/study/exam/recovery/triage); Grade
Planner (read-only, deterministic local math); College; focus & utilities;
themes (via the dedicated theme pipeline); and Assistant Memory.

**Action protocol:** providers may only propose certified action types. The
registry — not the model — is authoritative. Proposals render as Apply / Decline
**preview cards**; previews never mutate state. High-risk and destructive actions
(e.g. deleting a timeline block, forgetting a memory) always require explicit
confirmation. Unknown action types or invalid values fail safely before an Apply
button appears, and ambiguous targets trigger a clarifying question.

**Activity & Undo:** every applied action is written to the local Activity log
and most actions support Undo ("undo that", or the Undo button in the Activity
log). Undo restores prior state where technically safe.

---

## 6. Assistant Memory

Assistant Memory is persistent, local, user-controlled long-term memory, separate
from short-term conversation memory (which stays session-only).

### What it remembers

Stable, useful facts you ask it to keep: study hours, planning style, recurring
commitments, course preferences, academic goals, upcoming exams, preferred
explanation level, assistant-behavior preferences, project context.

Categories: `profile_preferences`, `study_preferences`, `schedule_constraints`,
`academic_goals`, `course_context`, `recurring_commitments`,
`assistant_preferences`, `project_context`, `user_notes`, `temporary_context`.

### What it will NEVER store

Passwords, API keys, authentication/credentials, financial data, medical data,
precise location, locked-note content, private note content, full chat
transcripts, provider responses, or security configuration. A deterministic
sensitivity classifier **blocks** such content at write time, so it can never be
saved (and therefore never exported).

### Consent & control

- Saved only on explicit request ("remember that …") or when you accept a
  suggestion (Save / Edit / Decline).
- View, search, edit, enable/disable, delete, and **forget** any memory in the
  Memory manager (**Settings ▸ Assistant ▸ Manage Memory**). "Forget X" and
  "delete that memory" take effect immediately; deleted/disabled memories stop
  being retrieved at once. Batch deletes confirm first.
- Turn **"Use saved memory"** off to ignore memory without deleting it.
- Memory actions (`create_memory`, `update_memory`, `enable_memory`,
  `disable_memory`, `delete_memory`, `clear_expired_memories`,
  `clear_temporary_memories`, `open_memory_manager`) flow through the same
  validate → preview → confirm → apply → Activity → Undo pipeline as every other
  action.

### Retrieval

Deterministic and explainable — keyword + category + linked-object + recency +
confidence ranking. No embeddings, no cloud, no telemetry. Only a small, relevant
set of **enabled, non-expired** memories is retrieved; expired, disabled, and
deleted records are excluded. When a provider request is made, only those compact
snippets are attached (never a dump of everything), and the records used are
recorded.

---

## 7. `.sutra` export / import — a complete workspace backup

A `.sutra` export is a **full workspace backup**, not just notes. Export/import
coverage is tracked in `docs/architecture/persistence-inventory.json` and
enforced by `scripts/round-trip-check.mjs` and `scripts/sutra-guardrails-check.mjs`.

**Included** (every persistent, non-secret store), among others: notes/pages,
folders/spaces, tags, templates, Canvas, locked-note metadata; planner tasks +
order; Homework; Course Hub (courses, assignments, linked notes/resources,
dashboards, archives); Timeline blocks; Review decks + spaced-repetition state;
AP Study; Assignment Studio; Grade Planner; Semester Setup; School Schedule;
College / Life / Business; themes + custom themes; UI preferences and settings;
onboarding state; pinned pages; notifications state; the Assistant **Activity
log**; and **Assistant Memory** (`sutra:assistantMemory:v1`, which rides along in
the localStorage snapshot).

**Never exported** (deliberate security exclusions): AI provider **API keys**,
access/refresh tokens, client secrets, passwords, `.sutra` passphrases, derived
encryption keys, Google Drive device-local sync metadata, transient chat history,
in-session unlocked-page state, and regenerable caches. API keys remain
session-only and never appear in `.sutra`, JSON, Activity logs, Memory,
diagnostics, prompts, or cloud snapshots.

**Import** restores into the correct authoritative store, migrates older exports,
tolerates missing or newer sections, validates before writing, avoids partial
overwrites on failure, and avoids duplicating mirrored data (e.g. planner-task ↔
Homework mirrors). Old workspaces with no memory store import cleanly.

**Encrypted backups:** an encrypted `.sutra` is AES-256-GCM with a PBKDF2-derived
key from your passphrase. Optional cloud backup (Google Drive / OneDrive /
Dropbox / Supabase) is consent-first and encrypts on-device before upload.

Where: **Settings ▸ Backups & Export** → Export (optionally encrypted) / Import.

---

## 8. Provider compatibility & instructions

Supported providers: OpenAI, Anthropic, Gemini, Groq, OpenRouter, DeepSeek, xAI,
Perplexity, and OpenAI-compatible local endpoints (Ollama, LM Studio, …). For
provider-bound requests the system prompt is built dynamically from the
registries — relevant product knowledge, relevant certified action schemas, the
allowed workspace context, and the small set of retrieved memories — and instructs
the model to: never invent Sutra features/screens/settings/actions/memories;
never claim a feature not present in provided product knowledge; never write
memory except via a `create_memory` proposal; never infer sensitive memories from
chat; ask for clarification when ambiguous; and use Sutra's deterministic local
systems for grade math and schedule-conflict detection.

---

## 9. Privacy & security invariants

- Sutra Intelligence is local-first and makes no server calls itself.
- Product Knowledge, Local Help, Memory, and deterministic intelligence work
  fully offline.
- API keys are session-only and never enter Memory, exports, Activity logs,
  prompts, diagnostics, or UI text.
- Locked-note contents are never read by the assistant.
- No analytics, tracking, telemetry, or Sutra backend.
- CSP, DOM safety (`SutraDOMSafety`), safe storage (`SutraSafeStorage`),
  encryption, export/import safeguards, and architecture guardrails are
  preserved — the new modules add zero raw DOM/storage sinks.

---

## 10. Limitations & intentionally unsupported behaviors

- The assistant has **no task-delete action** by design; complete/archive
  instead. Timeline-block deletion exists but requires explicit user intent and
  a destructive confirmation.
- Homework assignments cannot be archived (complete or reschedule them).
- Grade math, GPA, and required-score calculations are always local — the model
  never computes them.
- Memory never stores secrets/credentials/financial/medical/precise-location or
  locked/private content, and never saves full chat transcripts or provider
  responses. Vague requests cannot trigger bulk deletion, provider/security
  changes, backup/export, cloud sync, or mass overwrite.
- The assistant never runs arbitrary JavaScript/HTML or model-generated code, and
  never uses `eval`.
