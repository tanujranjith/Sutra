# Sutra Cloud — Supabase provider setup

> **Supabase is now one *advanced* Sutra Cloud destination — not Sutra's central
> backend.** Sutra Cloud is provider-based: most users pick a recommended
> destination (Google Drive / OneDrive / Dropbox) or Manual export. Supabase is an
> advanced option for people comfortable with Supabase Auth, Storage, and RLS.
> Overview of all destinations: [`docs/SUTRA_CLOUD_PROVIDERS.md`](../docs/SUTRA_CLOUD_PROVIDERS.md).

Sutra Cloud is an **optional, consent-first, end-to-end-encrypted** backup of your
workspace. It is **off by default** and makes **zero** network requests until you
both configure a destination and explicitly use it. It is **backup/restore, not
live sync** — "cross-device" means *back up here, restore there*.

The server (Supabase) only ever stores the **encrypted `.sutra` file** plus a tiny
bit of non-sensitive metadata (timestamps, labels, sizes). It can never read your
notes, tasks, grades, etc. — the data is locked with your backup passphrase before
it leaves the browser.

There are **two backends**:

| | Official Sutra Cloud | Bring Your Own Supabase |
|---|---|---|
| Who it's for | **Most users (recommended)** | Advanced/technical users |
| Backend | Sutra's configured Supabase project | **Your own** Supabase project |
| Setup | None (just sign in) | You create + configure a project |
| Who's responsible | The Sutra app owner | **You** (billing, uptime, RLS, security) |
| Hosted build | Works | May require a **self-hosted build** (see CSP note) |

Both backends use the **same** encryption, passphrase, retention (last 10), and
restore-overwrite behavior. The choice is only *whose* Supabase project stores the
encrypted files. **Custom Supabase is more user-controlled, not automatically
safer.**

> **Never paste a `service_role` (secret) key into Sutra.** It bypasses Row Level
> Security and must stay server-side. Sutra only ever needs the **public anon
> key**, and refuses keys that look like service-role keys.

---

## Path A — Official Sutra Cloud (for the app owner)

This is the shared backend that normal Sutra Cloud users sign into. Do this once,
as the person deploying Sutra.

### 1. Create the official Supabase project
- Sign up at <https://supabase.com> and create a project (free tier is fine for a
  start; see costs below).

### 2. Apply the schema
- **SQL Editor** → paste [`schema.sql`](./schema.sql) → **Run**. This creates the
  private `backups` bucket, the `backup_index` table, and the RLS policies that
  isolate each user's data. (Idempotent — safe to re-run.)

### 3. Enable passwordless email auth
- **Authentication → Providers → Email**: ensure **Email** is enabled. Sutra uses
  a **6-digit email code (OTP)**, so no redirect URLs are required. (The default
  email template already includes the `{{ .Token }}` code.)

### 4. Wire the public keys into the build
Both values are **public/publishable** (safe in a static build). Find them in
**Project Settings → API**.

- In [`src/config/sutra-runtime-config.js`](../src/config/sutra-runtime-config.js):
  ```js
  window.SUTRA_CONFIG.supabaseUrl     = 'https://YOUR-PROJECT-REF.supabase.co';
  window.SUTRA_CONFIG.supabaseAnonKey = '<your anon / publishable key>';
  ```
- **Never** put the `service_role` key (or a DB password) here.

### 5. Allow the origin in the Content Security Policy
CSP cannot read the JS config, so the exact origin is pinned manually. Replace the
`YOUR-PROJECT-REF` placeholder with your real ref in **both**:

- [`Sutra.html`](../Sutra.html) — the `connect-src` of the CSP `<meta>` tag.
- [`scripts/serve-static.mjs`](../scripts/serve-static.mjs) — the dev/test server CSP.

> A wildcard (`*.supabase.co`) is intentionally **not** allowed — the guard
> `npm run check:csp` rejects connect-src wildcards. Pin the exact ref.

### 6. Verify
```
npm run check:csp
npm run check:network
npm run check:all
```

This backend is then shared by all normal Sutra Cloud users (each isolated by RLS).

---

## Path B — Bring Your Own Supabase (advanced users)

For technical users who want their **own** Supabase project instead of the
official backend. You are responsible for your project's billing, uptime,
configuration, and security rules.

1. **Create a Supabase project** at <https://supabase.com>.
2. **Run [`schema.sql`](./schema.sql)** in the SQL Editor (creates the `backups`
   bucket, `backup_index` table, and RLS policies).
3. **Enable email auth** (Authentication → Providers → Email) — magic-link/OTP.
4. **Copy your Project URL** (`https://<your-ref>.supabase.co`).
5. **Copy your public anon key** (Project Settings → API → `anon` `public`).
6. In Sutra: open **Sutra Cloud** (save bar) → **Storage backend** → expand
   **“Use my own Supabase project (advanced)”** → paste URL + anon key.
7. Click **Test connection**.
8. **Sign in** with email, then **run a manual backup first**. Only enable
   **auto-backup** after you've confirmed manual backup *and* restore work.

The URL + anon key are stored **device-locally** through `SutraSafeStorage`
(`sutra:supabaseCustomBackend:v1`) — they never travel inside a `.sutra` backup,
so each device can choose its own backend.

### ⚠️ Hosted build + CSP limitation (read this)

The hosted Sutra build pins **exact** Supabase origins in its Content Security
Policy, and the CSP guard forbids wildcards. A custom Supabase origin that isn't
in the CSP will be **blocked by the browser** before any request is sent. So:

- **Official Sutra Cloud works in the hosted build.**
- **Custom Supabase generally requires a self-hosted build** where you add your
  own `https://<your-ref>.supabase.co` to the `connect-src` CSP in `Sutra.html`
  (and `scripts/serve-static.mjs` for local runs). Sutra detects a blocked origin
  and tells you this in the panel rather than failing silently.

### Warnings
- **Never paste a `service_role` / secret key.** Sutra only needs the public anon
  key and rejects keys that look like service-role keys.
- **Lost passphrase = unrecoverable backups.** End-to-end encryption means nobody
  — not Sutra, not Supabase, not you-without-the-passphrase — can decrypt them.
  Let your browser's password manager save it.
- **Supabase stores only encrypted `.sutra` files** — never plaintext.
- **Broken RLS policies can block access or create unsafe permissions.** Sutra
  cannot fully verify your project's security rules; run the setup SQL exactly.
- **Restore replaces** your current workspace (it is not a merge), after a
  confirmation.
- Custom Supabase is **more user-controlled, not automatically safer** than the
  official backend.

---

## Costs & limits (free tier)
- Free projects **pause after ~1 week of inactivity**; you get 1 GB file storage /
  5 GB egress / 50k monthly active users, no backups/SLA.
- For real multi-user use of the **official** backend, plan on **Pro (~$25/mo)**
  plus a keep-alive. (For BYO, this is the advanced user's own concern.)

## What gets stored (either backend)
- `storage://backups/<your-uid>/<timestamp>-<label>.sutra` — the encrypted blob.
- `public.backup_index` — one row per backup: path, label, size, device id, time.
  No workspace content. Retention keeps the **last 10** per user.
