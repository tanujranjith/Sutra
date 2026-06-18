// Public runtime configuration for static Sutra deployments.
// A Google OAuth Web Client ID is public configuration, not a secret.
// Never place OAuth client secrets, access tokens, refresh tokens, or
// cloud-sync passwords in this file.
window.SUTRA_CONFIG = window.SUTRA_CONFIG || {};
window.SUTRA_CONFIG.googleDriveClientId = window.SUTRA_CONFIG.googleDriveClientId || '';

// ── Sutra Cloud (optional encrypted backup, powered by Supabase) ──────────────
// Both values below are PUBLIC, publishable configuration — safe to ship in a
// static build, exactly like the Google client ID above:
//   • supabaseUrl     → your project URL, e.g. https://abcdefgh.supabase.co
//   • supabaseAnonKey → the project "anon"/"publishable" key (NOT service_role)
// NEVER place the service_role key, a database password, or any user passphrase
// here. The service_role key bypasses Row Level Security and must stay server-side.
//
// Sutra Cloud is OFF until BOTH values are set. While they are empty the feature
// shows as "not configured" and makes zero network requests (consent-first).
//
// SETUP: after creating your Supabase project (see supabase/README.md), also add
// your exact project origin (https://<ref>.supabase.co) to the `connect-src` CSP
// in Sutra.html and scripts/serve-static.mjs, replacing the YOUR-PROJECT-REF
// placeholder. CSP cannot read this file, so that step is manual.
window.SUTRA_CONFIG.supabaseUrl = window.SUTRA_CONFIG.supabaseUrl || '';
window.SUTRA_CONFIG.supabaseAnonKey = window.SUTRA_CONFIG.supabaseAnonKey || '';
