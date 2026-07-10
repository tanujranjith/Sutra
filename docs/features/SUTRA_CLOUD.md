# Sutra Cloud

**Sutra Cloud** is Sutra's user-facing backup/sync system. It is **provider-based**:
the same encrypted `.sutra` envelope can be stored in different destinations.
Choosing a provider does **not** mean Sutra runs a backend — Manual encrypted
file needs no account or network at all.

Open it from **Settings → Data → Sutra Cloud**.

## Providers

| Provider | Category | Status |
|---|---|---|
| Manual encrypted `.sutra` file | Manual | ✅ first-class (no account, no network) |
| Google Drive | Recommended | ✅ works after a public OAuth client ID is configured |
| OneDrive | Recommended | ✅ works after a public SPA client ID is configured |
| Dropbox | Recommended | ✅ works after a public App-folder app key is configured |
| Supabase | Advanced | ✅ works after configuration; a custom project needs a CSP-pinned origin |
| WebDAV (Nextcloud/ownCloud) | Advanced | ✅ works in a self-hosted build with its origin in CSP |
| Custom HTTP endpoint | Advanced | ✅ works in a self-hosted build with its origin in CSP |
| Box | Advanced | 🔒 not available in the static build; use Manual or a self-hosted token proxy |
| S3-compatible | Advanced | preview — config UI present, SigV4 signing is a follow-up |

The provider card distinguishes **works now**, **needs configuration**,
**self-host only**, and **preview**. A provider is never shown as active merely
because a configuration form exists.

Full provider matrix, setup, security model, and troubleshooting live in:

- [`docs/SUTRA_CLOUD_PROVIDERS.md`](../SUTRA_CLOUD_PROVIDERS.md)
- [`docs/SUTRA_CLOUD_SETUP.md`](../SUTRA_CLOUD_SETUP.md)
- [`docs/SUTRA_CLOUD_SECURITY.md`](../SUTRA_CLOUD_SECURITY.md)
- [`docs/SUTRA_CLOUD_TROUBLESHOOTING.md`](../SUTRA_CLOUD_TROUBLESHOOTING.md)

## What's protected

- Every provider receives **ciphertext only** — the controller encrypts once and
  hands adapters an opaque `.sutra` AES-GCM blob. Adapters never see plaintext or
  the passphrase.
- Cloud passwords / derived keys stay **in memory** (session) only.
- Secrets, API keys, OAuth tokens, backup passwords, and conversation history are
  **never** included in an export.
- `getSetupStatus()` is pure (no network), so a fresh boot makes **zero**
  requests — Sutra stays local-first.

## Strict CSP

Custom origins (WebDAV / Custom HTTP / S3 / arbitrary providers) only work when
their exact origin is in the Content-Security-Policy `connect-src`. In the hosted
build the CSP pins specific origins, so arbitrary endpoints require a
**self-hosted/advanced build**. Sutra detects blocked origins
(`sutraCloudOriginAllowedByCsp`) and surfaces a `cspBlocked` status rather than
pretending a blocked origin will work.

## Developer surface

`window.SutraCloudSync` exposes the provider registry (`listProviders`,
`getActiveProvider`, `switchProvider`), per-provider config, `backupNow`,
`listBackups`, `restore`, and the credential/CSP helpers. New provider adapters
are built with `makeSutraCloudAdapter({ ... })` (see
`docs/SUTRA_CLOUD_PROVIDERS.md` → "add a new provider adapter").
