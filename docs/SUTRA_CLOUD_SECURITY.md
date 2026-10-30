# Sutra Cloud — Security model

Sutra Cloud encrypts backups locally so **backup providers cannot read their
workspace contents**. Sutra itself reads the unlocked workspace on your device;
no central Sutra service is required. This page describes the backup security model.

## Encryption (local-first)
- Your workspace is packaged into a `.sutra` envelope and **encrypted on your
  device before upload**, using the same pipeline as a manual `.sutra` export:
  **AES-GCM-256** with a key derived by **PBKDF2-SHA-256, 600,000 iterations**,
  a random 16-byte salt, and a fresh random 12-byte IV per backup.
- The provider adapter only ever receives the **encrypted bytes**. Encryption is
  never duplicated per provider.

## Passphrase model
- The **backup passphrase** is what unlocks your backups.
- **Sutra never stores it.** It lives in memory only for the session (so optional
  auto-backup can run after one manual backup) and is wiped on sign-out/switch.
- The passphrase is **never sent** to Sutra or to any provider.
- **If you lose the passphrase, your cloud backups cannot be recovered.** This is
  the cost of true end-to-end encryption. Let your **browser password manager**
  save it (the passphrase fields are wired for that).

## What the provider can and cannot see
- **Can see:** the encrypted `.sutra` blob, and minimal metadata when supported
  (label, size, timestamp, device id, file name).
- **Cannot see:** your notes, tasks, grades, files, settings, or your passphrase.

## Restore safety
- **Restore replaces your current workspace — it does not merge.**
- Sutra asks for confirmation and takes a **pre-import safety snapshot** before
  applying a restore.
- A **wrong passphrase fails safely**: decryption fails and your current
  workspace is left untouched.

## Retention
- Sutra keeps the **latest 10 backups per provider** by default and deletes older
  ones after a successful upload. Deleting a cloud backup is permanent on that
  provider.

## Credential storage (advanced providers)
- WebDAV / S3 / Custom HTTP credentials are stored **device-locally** via
  `SutraSafeStorage` (keys like `sutra:cloudProvider:<id>:v1`) — **never** inside
  a `.sutra` backup or workspace export, so each device chooses its own
  destination.
- Supabase session persistence and its explicit encrypted device-local Remember me
  option are documented in [Sutra Cloud](features/SUTRA_CLOUD.md#whats-protected).
  The **anon key** is public configuration.

## Never paste powerful keys
- **Supabase:** never paste the `service_role` / secret key — it bypasses Row
  Level Security. Use the public **anon** key. Sutra rejects keys that look like
  service-role keys.
- **S3-compatible:** never paste root/account keys. Create a **scoped** access key
  limited to the backup bucket.
- **WebDAV / Custom HTTP:** use an **app password** / scoped token, not your main
  account password.
- Sutra refuses obviously-dangerous secrets where detectable
  (`looksLikeDangerousSecret`).

## Consent-first guarantees
- A **fresh profile makes zero cloud-provider requests.**
- Opening Sutra does not enable providers. Previously enabled automatic backup
  may run while its provider and session passphrase remain ready.
- **Saving a provider configuration uploads nothing.**
- **Test connection** runs only when you click it.
- **Auto-backup is off by default** and only runs after you explicitly enable it,
  with a connected provider and the passphrase unlocked for the session. Turning
  it off stops automatic uploads immediately.

## CSP / hosted-build security
- The hosted policy permits reviewed origins and a bounded set of wildcard
  host families. Arbitrary custom origins cannot be added dynamically.
- The canonical destination matrix and reviewed wildcard exceptions are in
  [Setup → Hosted vs self-hosted](SUTRA_CLOUD_SETUP.md#hosted-vs-self-hosted).
  Add other origins only through the self-hosted CSP workflow described there.

## Threat-model summary
| Threat | Mitigation |
|---|---|
| Provider reads your data | Client-side encryption; ciphertext only |
| Backup provider or central service compromise | Remote backups contain ciphertext; the local app reads unlocked data and decrypts only with your passphrase |
| Stolen encrypted backup file | Cannot decrypt without the passphrase; this does not encrypt live browser storage |
| Forgotten passphrase | Unrecoverable by design — warned clearly |
| Wrong passphrase on restore | Fails safely; workspace untouched |
| Unapproved network origin | Canonical CSP restricts connections to reviewed origins and host families |
| Pasted admin/root key | Rejected where detectable; warned in UI |

See also: [Setup](SUTRA_CLOUD_SETUP.md) · [Providers](SUTRA_CLOUD_PROVIDERS.md) ·
[Troubleshooting](SUTRA_CLOUD_TROUBLESHOOTING.md) ·
[Privacy & local-first](privacy-security/PRIVACY_AND_LOCAL_FIRST.md).
