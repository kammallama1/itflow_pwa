# Release candidate 0.12.1

One codebase combines the field ticket/PWA interface with single-instance setup, local accounts, personal API keys and personal Microsoft calendar connections. The test-preview banner has been removed. The former separate read-only community prototype is historical; do not use its database/config as a drop-in replacement without a reviewed migration.

Supported: ticket creation, notes/public replies with email, inline images, time/billing, assignment/contact/primary asset/document links, daily scheduled-ticket calendar, knowledge/inventory, push/email, branding/SMTP, personal API linking, account recovery/MFA/persistent sessions and one-way Microsoft export. Optional metadata adds unsupported upstream lists/templates/appointments/projects/racks.

Limitations: no direct ITFlow login, OIDC, public reply without email, company transfer, automatic API identity proof, offline ticket cache or two-way Microsoft sync. API-only installations need metadata for user/status choices. Microsoft deletions/unassignments require manual cleanup. General metadata appointments are owner-only. The optional provider's SQL/schema must match the installed ITFlow version.

Release acceptance should include a designated noncritical ticket, two real technician keys with different client scopes, independent push/email devices and mailboxes, MFA/password reset, disable/revoke behavior, restart/backup/restore, and your own ITFlow/API version. Synthetic tests are evidence of the tested cases, not a certification for all upstream deployments.

Patch 0.12.1 restores status-name resolution for personal API-key ticket lists. Regression coverage checks labels remain scoped to the requesting key. Compose uses the repository root build context, and README links reflect the nested application directory.
