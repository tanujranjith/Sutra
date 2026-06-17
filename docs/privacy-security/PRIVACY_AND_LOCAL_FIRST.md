# Privacy and Local-First

_Sutra is a private, local-first workspace for students. This document is the
plain statement of what that means: where your data lives, what never leaves
your device, and how to take it with you or wipe it completely._

`PRIVATE * LOCAL-FIRST * STUDENT-BUILT`

---

## 1. The local-first philosophy

Sutra is built so that **your workspace belongs to you and stays on your
device.** It is a **static web app** - it runs from static hosting or directly
from a local file, with:

- **no backend** of Sutra's own,
- **no required accounts** - there is nobody to sign up with,
- **no telemetry** - Sutra does not phone home or track usage,
- **optional cloud sync off by default** - nothing is silently copied to a server.

Your notes, tasks, homework, study data, and settings are read and written locally. Optional Google Drive sync, if you explicitly enable it, uploads only browser-encrypted snapshots to your own Drive app-data folder. **Once Sutra has loaded, it needs no network connection to read or edit
your workspace** - every data operation is local. How reliably the app itself
*reopens* without a network depends on where you run it; see
[section 11 Offline behavior](#11-offline-behavior-and-deployment-headers) for the
precise guarantee.

---

## 2. What stays on your device

**Everything.** Your entire workspace - every note (including inline images and
**Document Background** images), task, time block, homework course and
assignment, Testing Hub and AP Study data, Review decks, College and Life and
Projects & Work data, streaks and habits, focus templates, themes, preferences,
and onboarding state - is stored locally in your browser. None of it is sent
anywhere by Sutra unless you explicitly export it, send it to an AI provider, or
enable optional encrypted Google Drive sync.

---

## 3. What is never exported

Some things are deliberately kept out of every backup file:

- **AI provider API keys / credentials / tokens.** These live in
  **`sessionStorage` only** (this browser session) and are **never written to
  long-term storage and never included in any export** - `.sutra` or JSON. When
  you export your workspace, the exporter actively **redacts** any nested
  secret-shaped field (keys, tokens, passwords) so credentials cannot ride along
  by accident.
- **Conversation history** with the Assistant is session-local and not exported.
- **Backup passwords, Google Drive sync passwords, OAuth access tokens, refresh
  tokens, client secrets, and derived encryption keys** are never exported.
- **Google Drive sync metadata** (`sutra:googleDriveSync:v1`) is device-local
  operational state and is deliberately excluded from workspace backups.

Your provider and model **choices** (which are not secrets) do travel, so a
restored workspace keeps its setup and only needs the key re-entered.

---

## 4. Where your data lives

Sutra uses your browser's local storage facilities:

- **IndexedDB** holds the bulk of your workspace and your binary attachments.
- **localStorage** holds homework data, a small set of preferences, and the
  Storage Health/save-failure banner state needed to warn you after a reload if
  IndexedDB could not confirm a save.
- **sessionStorage** holds only session-scoped, never-persisted items -
  principally your AI API keys and chat history.

Some of these stores carry **legacy-named compatibility identifiers** - for
example the workspace database is named `noteflow_atelier_db` and the
attachments database `noteflow_attachments_db`. These names are **retained on
purpose so existing installs keep working** across the rename to Sutra; the name
is just an identifier and does not change where the data lives (still your
device). For the full layout, see [`DATA_AND_BACKUPS.md`](./DATA_AND_BACKUPS.md).

---

## 5. AI requests: browser -> the provider you choose

Sutra Assistant can use a language model, but **Sutra runs no model servers of
its own.** When a reply needs a model, the request goes **directly from your
browser to the AI provider you have chosen** (OpenAI, Anthropic Claude, Google
Gemini, Groq, OpenRouter, or a Custom OpenAI-Compatible / Local endpoint). There
is no Sutra relay in the middle.

The local signal layer - **Sutra Intelligence** - that reads your workspace to
understand overdue work, workload, conflicts, weak areas, review backlog, and
next steps **runs entirely on your device and calls no server.** Only the
content you actually send in a message (bounded by your **Workspace Access**
setting) reaches the provider. See [`SUTRA_ASSISTANT.md`](../features/SUTRA_ASSISTANT.md)
for details and the always-visible privacy badge.

If you want even the AI side to stay on your own machine or network, point Sutra
at a **Local / Custom OpenAI-Compatible endpoint**.

Fresh startup, manual encrypted `.sutra` backup, and JSON backup are designed to complete with **zero third-party requests**. Optional network calls happen only after a user action: Google Drive OAuth/sync, AI provider calls, configured localhost/127.0.0.1 local endpoints, approved feedback-form embeds, approved media embeds (YouTube, Vimeo, Spotify, SoundCloud, CodePen, Figma, and YouTube thumbnails), AP Classroom resource links, AI-console help links, ChatGPT/Spotify launch shortcuts, and optional secondary document import/export helper libraries. If those optional helpers are offline, Sutra should fail gracefully and keep the workspace in memory.

---

## 6. Document Background images are local

A note's **Document Background** is stored as image data on the page itself
(an inline data URL), alongside your other content on your device. It is never
uploaded by Sutra and only leaves your device if **you** export a backup or a
note that includes it. A **locked page never reveals its background behind the
PIN screen.** See [`DOCUMENT_BACKGROUNDS.md`](../features/DOCUMENT_BACKGROUNDS.md).

---

## 7. Locked pages

Sutra can **PIN-lock individual pages.** A locked page requires the PIN to be
re-entered after a reload - the in-session "unlocked" state is intentionally
**not persisted** - and its content (including any Document Background) stays
gated behind the lock screen. The lock is part of the page's stored data and
travels in backups, so a restored page is still locked.

---

## 8. How to export and own your data

By default, **you** hold the master copy. From **Settings -> Data** you can export
your whole workspace as a portable file:

- **`.sutra`** - the default backup format, a password-encrypted package of your
  workspace plus its assets (with checksums).
- **JSON** - a single-file projection with assets inlined.

Both round-trip your data so you can move between browsers or machines, or keep
offline copies. Legacy **`.atelier`** backups still import, so older archives are
never stranded. Full details - package structure, what travels, and recovery -
are in [`DATA_AND_BACKUPS.md`](./DATA_AND_BACKUPS.md).

Optional Google Drive sync is a convenience layer. It encrypts complete Sutra
snapshots in your browser before uploading them to Drive `appDataFolder`, uses
only the `https://www.googleapis.com/auth/drive.appdata` scope, and runs while
the app is open, online, unlocked, and authorized.

Keep your backups somewhere you trust: encrypted `.sutra` backups still depend
on the password you choose, and JSON exports are unencrypted. Neither contains
your API keys, which are never exported.

---

## 9. How to fully wipe your data

Because everything is local, wiping Sutra is a matter of clearing this site's
local storage:

1. **Export a backup first** (Settings -> Data) if you might want your data back -
   once cleared, it is gone, as there is no server copy.
2. In your browser's site-data controls (for example DevTools -> Application ->
   **Clear storage**, or the browser's per-site "clear data" option), clear the
   storage for the Sutra page. This empties the IndexedDB databases
   (`noteflow_atelier_db`, `noteflow_attachments_db`) and the localStorage keys.
3. Reload. Sutra comes back **empty / at defaults**, as a fresh workspace.

Session-only items (API keys, chat history) also clear automatically when the
browser session ends.

> Tip: if Sutra ever misbehaves and you only want to disable custom CSS and
> plugins **without** deleting anything, use **Safe Mode** instead of wiping -
> add `?sutraSafeMode=1` to the URL (or hold **Shift** while loading). Safe Mode
> **never deletes** data, CSS, plugins, or your workspace.

---

## 10. Privacy at a glance

| Question | Answer |
|---|---|
| Is there a Sutra server storing my data? | No. Static app, no Sutra backend. Optional Drive sync uses your Google account and encrypted app-data snapshots. |
| Do I need an account? | No. |
| Does Sutra track me / send telemetry? | No. |
| Where does my workspace live? | Locally - IndexedDB + localStorage in your browser. |
| Do AI requests go through Sutra? | No. Browser -> the provider you choose. Sutra runs no model servers. |
| Are my API keys saved or exported? | No. Session-only, never persisted, never exported (and actively redacted from exports). |
| Does the local Intelligence layer call a server? | No. It computes signals on-device. |
| Can I take my data with me? | Yes - export encrypted `.sutra` or JSON; legacy `.atelier` still imports. |
| Can I delete everything? | Yes - clear this site's storage; nothing remains on any server. |

---

## 11. Offline behavior and deployment headers

**What is guaranteed offline.** Your *data* is fully local: once Sutra has
loaded, reading and editing your workspace, manual `.sutra`/JSON backup and restore, and
the on-device Sutra Intelligence layer all work with **no network at all**. A
locally-saved copy of the app (the `Sutra.html` file and its assets opened from
disk) also opens offline every time.

**What is not guaranteed (today).** Sutra ships **no service worker**, so when you
run the *hosted* app, reopening it offline after a full browser restart relies on
the **browser's ordinary HTTP cache**. That usually works for a recently-used
tab, but it is **not a guarantee** - a cold start with no network may fail to
fetch the app shell. We deliberately prefer this honest behavior over bolting on
last-minute cache infrastructure that could pin a stale shell. If you need
dependable offline reopen, keep a local copy of the app or a `.sutra` backup.
(Optional Google Drive sync, AI provider calls, and optional document
import/export helper libraries require a network when used, and fail gracefully
when offline.)

**Deployment & response headers.** Sutra ships the strongest practical
**meta-tag** Content-Security-Policy in every HTML entry point (it scopes
`script`, `style`, `connect`, `frame`, `img`, etc.). However, some hardening
directives are **header-only** and cannot be set from a `<meta>` tag - most
notably **`frame-ancestors`** (clickjacking/framing protection). **GitHub Pages
cannot send custom response headers**, so on Pages those header-only protections
are unavailable; this is a real, documented limitation, not something the meta
CSP solves.

If the public beta needs header-level CSP or `frame-ancestors 'none'`, deploy
behind a host that can send response headers - e.g. **Cloudflare Pages**,
**Netlify** (`_headers`), or an **Nginx/Caddy** front - and emit, at minimum:

```
Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

The local dev server (`scripts/serve-static.mjs`) already sends a full CSP
**including `frame-ancestors 'none'`**, so this behavior can be verified locally.
**Recommendation:** GitHub Pages is fine for the controlled beta; moving to a
header-capable host is advised before a wider public launch.
