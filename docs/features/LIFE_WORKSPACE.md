# Life workspace

Life contains goals, habits, skills, spending, books, and a calculator. Focus and
ordinary notes remain available in their existing workspaces.

Dedicated wellness features are retired: Wellness/Reset, mood and stress
check-ins, breathing exercises, health trends, Life journals, fitness, sleep,
nutrition/calorie tracking, water, eye-break reminders, and gratitude widgets.
They are absent from navigation, feature pickers, and Assistant retrieval.
The Daily Journal starter template is also retired; existing notes are preserved.

Retirement is not data deletion. Existing retired health and journal records,
including unknown fields, remain opaque, portable compatibility data in
`lifeWorkspace`; existing widget configurations remain in `customTabs`. Local
saves, workspace exports and backups, restores, and encrypted Sync keep those
records. Retired widgets show a neutral notice with no active
controls. The legacy wellness-trends API reports unavailable without analyzing
the records. Old Assistant wellness permission flags cannot re-enable retrieval.
Startup recovery treats saved sleep entries, custom sleep targets, changed
breathing preferences or session history, and unknown nested Life/wellness fields
as workspace data, including unknown `0` and `false` values. The built-in
8-hour sleep target, empty entry lists, and default breathing preferences remain
semantically empty so they do not block recovery of an otherwise empty workspace.

Ordinary scheduling preferences and workload planning are unaffected. In
particular, quiet hours, breaks in a focus session, and availability windows do
not read retired health-tracking records.

Verification includes legacy-record round trips, reload, retired widget notices,
Assistant exclusion, and normal goals/habits/calculator navigation. Automated
regression coverage must run in CI before release.
