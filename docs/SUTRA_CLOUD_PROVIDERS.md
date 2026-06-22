# Sutra Cloud — Providers

Sutra Cloud is **provider-based**: the same encrypted-backup flow can store your
locked `.sutra` files in different destinations. This page lists every provider,
its status, what it stores, and its limitations. For step-by-step setup see
[SUTRA_CLOUD_SETUP.md](SUTRA_CLOUD_SETUP.md).

> Every provider receives **ciphertext only**. The choice of provider does **not**
> change the encryption or the passphrase model. Advanced/self-hosted providers
> are **more user-controlled, not automatically safer**.

## Status legend
- ✅ **Implemented** — works today (subject to CSP for custom origins).
- ⚙️ **Needs configuration** — registered, but needs an OAuth app / credentials.
- 🧪 **Preview** — UI + config present; transport is a planned follow-up.

## Provider matrix

| Provider | Category | Status | Auth | Hosted build | Backup list |
|---|---|---|---|---|---|
| Manual encrypted file | Manual | ✅ | none | ✅ always | n/a (file) |
| Supabase | Advanced | ✅ | email code | only if the build pins a ref (public build ships none) | yes |
| WebDAV (Nextcloud/ownCloud) | Advanced | ✅ | app password | 🔒 self-host | yes |
| Custom HTTP | Advanced | ✅ | bearer (opt) | 🔒 self-host | yes |
| Google Drive | Recommended | ⚙️ via Drive sync | OAuth | ✅ | (sync today) |
| OneDrive | Recommended | ⚙️ needs app | OAuth | needs app + CSP | yes (planned) |
| Dropbox | Recommended | ⚙️ needs app | OAuth | needs app + CSP | yes (planned) |
| Box | Advanced | ⚙️ needs app | OAuth | needs app + CSP | yes (planned) |
| S3-compatible | Advanced | 🧪 preview | access keys | 🔒 self-host | yes (planned) |

---

## Recommended

### Google Drive
- **Today:** use Sutra's encrypted **Drive sync** (Settings → Data → Google
  Drive). It uploads encrypted snapshots to Drive's `appdata` folder using only
  the `drive.appdata` scope.
- The Sutra Cloud card points you there; deeper backup-list integration is a
  follow-up.

### OneDrive / Dropbox
- Registered as recommended destinations.
- Connecting requires a **registered OAuth app client ID** (Microsoft Azure app /
  Dropbox app) configured in the build, plus their API origins added to the CSP.
- Until configured, the card shows **"Needs configuration"** with instructions.

---

## Advanced

### Supabase (reframed)
Supabase was Sutra Cloud's original backend; it is **now one advanced provider**,
not a central identity. It stores each backup as a `.sutra` envelope in a private
Storage bucket (`backups/<uid>/…`) with **Row Level Security** isolating users,
plus a small `backup_index` row (no workspace content). Email one-time-code auth.
- **Never paste a `service_role` / secret key** — Sutra rejects keys that look
  like service-role keys; use the public **anon** key.
- A custom Supabase project ref must be in the CSP, so in the hosted build only
  the build's configured project works; others need a self-hosted build.
- Setup + SQL + RLS warnings: [`supabase/README.md`](../supabase/README.md).

### WebDAV (Nextcloud / ownCloud / generic)
- Uses HTTP Basic auth with an **app password** over HTTPS.
- Lists `.sutra` files via `PROPFIND`, uploads via `PUT`, deletes via `DELETE`.
- Your server origin must be in the CSP → generally **self-hosted**.

### S3-compatible (AWS S3, Cloudflare R2, Backblaze B2, Wasabi, DigitalOcean Spaces, MinIO)
- **Preview.** Configuration UI exists; AWS **SigV4** request signing is a planned
  follow-up. Use WebDAV/Custom HTTP today.
- Always use **scoped** keys limited to the backup bucket; never root keys.
- Endpoint/region/path-style notes per provider:
  [SUTRA_CLOUD_SETUP.md](SUTRA_CLOUD_SETUP.md#s3-compatible-storage-aws-s3-cloudflare-r2-backblaze-b2-wasabi-digitalocean-spaces-minio).

### Custom HTTP endpoint
- For developers/self-hosters. Implements Sutra's small backup API (below).
- Optional bearer token. Origin must be in the CSP → **self-hosted**.

---

## Manual encrypted file

- Downloads the encrypted `.sutra` and lets you save it anywhere — a synced
  folder (Drive/OneDrive/Dropbox/**iCloud Drive**), USB, or NAS.
- The simplest, no-account fallback. Restore via the Manual card or the save
  bar's **Import**.

---

## The Custom HTTP / backup API contract

A Custom HTTP endpoint (and the conceptual contract every "list" provider
fulfils) must support:

```
POST   {base}/backups        body: ciphertext (application/octet-stream)
                              headers: X-Sutra-Label, X-Sutra-Device (optional)
                              → 200 { "id": "<backup id>" }

GET    {base}/backups        → 200 [ { id, label, createdAt, sizeBytes, deviceId } ]

GET    {base}/backups/{id}   → 200 ciphertext bytes

DELETE {base}/backups/{id}   → 200/204
```
Optional `Authorization: Bearer <token>` on every request. The server must treat
the body as opaque ciphertext — it is a `.sutra` AES-GCM envelope.

---

## Developer guide — add a new provider adapter

Sutra Cloud providers live in `src/core/app.js` (kept beside the controller so
they can reuse the in-closure encryption/export helpers — extracting those to
separate modules is the documented "landmine" in
[SUTRA_ARCHITECTURE.md §15](architecture/SUTRA_ARCHITECTURE.md)). Each provider is
an object created with `makeSutraCloudAdapter({ ...spec })` and added to the
`SUTRA_CLOUD_PROVIDERS` registry.

**Interface (every method optional except where noted; defaults are provided):**

| Method | Purpose |
|---|---|
| `getProviderId()` / `getDisplayName()` / `getCategory()` | identity + grouping (`recommended`/`advanced`/`manual`) |
| `getSetupStatus()` | `{ ready, needsSetup, cspBlocked, scaffolded, reason }` — **drives the UI** |
| `getSignedInIdentity()` | account/endpoint string for the status card |
| `getConfig()` / `setConfig()` / `clearConfig()` | device-local config via `SutraSafeStorage` |
| `connect()` / `disconnect()` / `endSession()` | session lifecycle (`endSession` = soft sign-out on switch) |
| `testConnection(input)` | `{ ok, message, status }`, **only on user click** |
| `uploadBackup(blob, meta)` | receives **ciphertext only**; `meta = { label, size, deviceId, filename }` |
| `listBackups()` | `[{ id, label, createdAt, sizeBytes, deviceId, provider }]` |
| `downloadBackup(backup)` | returns ciphertext `ArrayBuffer` |
| `deleteBackup(backup)` / `enforceRetention(limit)` | delete one / keep latest N |
| `supportsAutoBackup` / `requiresOAuth` / `requiresCustomCredentials` / `hasBackupList` | capability flags |
| `cspNote` / `getSetupInstructions()` | UI guidance |

**Rules for a new adapter:**
1. **Never** touch plaintext — the controller encrypts once and hands you a blob.
2. **Never** persist or transmit the passphrase.
3. Store credentials **device-local** via `setConfig` (never inside `.sutra`).
4. Reject obvious root/admin secrets (`looksLikeDangerousSecret`).
5. Honor CSP: detect blocked origins with `sutraCloudOriginAllowedByCsp(url)` and
   surface a `cspBlocked` status — don't pretend a blocked origin will work.
6. Make **all** network calls user-triggered; `getSetupStatus()` must be pure
   (no network) so a fresh boot stays at **zero** requests.
7. Add an e2e mock (see `tests/e2e/sutra-cloud-providers.spec.mjs`) that asserts
   uploads contain `SUTRAENC` and **no** plaintext.

The metadata shape stored per backup (when the provider supports it): timestamp,
device id, label, size, provider id.
