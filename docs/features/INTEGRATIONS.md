# Optional imports and connections

Settings → Integrations lists implemented text import, local file import,
portable `.ics` calendar files, and the encrypted Google Drive backup transport.
Drive requires deployment OAuth configuration before its connection can open.
Opening Settings or viewing the registry does not contact a provider.

Unimplemented Google Docs, live Google Calendar, and Todoist cards have been
removed. Configuring a Google Drive client ID does not imply that Google Docs
import is implemented. Text/file import remains the fallback.

Spotify and ChatGPT are website shortcuts, labeled **Shortcuts** in the dock.
Their toggles change launcher visibility; they do not connect accounts or send
workspace content. Existing preference keys remain compatible.

Sync and encrypted snapshots share the Sutra Cloud hub under Data & Backup;
their independent guarantees are described in [Cloud Sync](CLOUD_SYNC.md).
