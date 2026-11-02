# Operations

## Configuration and proxy

`private/config.json` contains the external origin, trusted reverse-proxy IP, cookie/credential encryption material, VAPID keys and Microsoft encryption key. Keep it mode 0600 and readable by container UID 1000. `private/data` stores SQLite databases, preferences, SMTP settings, encrypted API keys and OAuth tokens, audit records and the mutation journal. Treat the entire directory as sensitive; SMTP configuration is protected by filesystem permissions, not a separate vault.

Never delete or regenerate configuration during an upgrade. Encryption material loss makes protected credentials/tokens unrecoverable. VAPID changes require push re-registration. Changing the origin requires proxy/DNS, Entra redirect and PWA reinstall/subscription review.

Use valid upstream TLS certificates. For a private CA, mount its PEM certificate read-only and set `NODE_EXTRA_CA_CERTS` in Compose. Do not disable TLS verification. Existing proxies must preserve Host and supply HTTPS scheme from a trusted peer. The optional `trustedProxyScheme: "https"` is only for an already-trusted HTTPS-only ingress that cannot forward scheme; it does not make arbitrary peers trusted.

## Backup and restore

For a simple consistent backup, stop the app (leave the proxy running), then archive the complete private directory:

```sh
docker compose stop app
sudo tar -czf /secure/offline/location/itflow-pwa-backup.tgz private
docker compose start app
```

Protect/encrypt the archive separately, keep an offline copy, and test restoring to an isolated host. Do not commit/upload it. SQLite WAL files must remain with the databases unless using SQLite's backup API. Back up the Caddy certificate volume separately if desired.

Restore with the app stopped, restore matching configuration and data from the same backup, fix UID 1000 ownership, then start the matching image. Avoid restoring an obsolete mutation journal to a live instance: prior uncertain submissions must not be replayed. A cloned origin can produce duplicate notifications/calendar sync—test in isolation with background integrations disabled.

## Upgrade and rollback

Back up first. Keep the previous image tag, configuration and database copy. Build the new source (`docker compose build app`) and replace only the app container (`docker compose up -d --no-deps app`). Check `docker compose ps`, `/healthz` and your login/MFA, a read-only ticket and notification settings. Use an explicitly designated test ticket before testing writes. Never restore pre-MFA server code against MFA-enabled accounts. Schema migrations in future releases may require restoring the matching pre-upgrade data backup.

## Troubleshooting

- **403 at the app:** compare configured trustedProxy with the actual Docker TCP peer, external Host and forwarded HTTPS scheme. Direct access is intentionally rejected.
- **No tickets:** configure the instance and link the current user's personal key. Check its ITFlow permissions; another user's key is never used as a fallback.
- **Read-only / no push:** the owner must review the ITFlow user mapping. This is a manual attestation, not automatic identity verification.
- **Assignment or note failure:** check the inline error. Numeric vendor-reference preservation and upstream attribution are verified; unsupported vendor references must be edited in ITFlow. Never automatically retry an uncertain write.
- **No assignment/status choices:** import user/status metadata. Closed-ticket lifecycle changes remain in ITFlow.
- **Push missing:** reopen the installed PWA, inspect device registration/preferences and test from that device. Permission alone is not a subscription. OS focus/battery/browser policies affect delivery.
- **SMTP:** verify sender, TLS mode, credentials and recipient; use Send email test. Event emails use imported ITFlow templates or built-in defaults. Ambiguous SMTP submissions are not retried.
- **Calendar:** verify mapping, tenant consent, redirect URI, secret expiry, personal connection, target calendar, timezone and export enabled state.
- **Lost owner access:** use an existing admin to reset password/MFA. If every admin is locked out, restore a verified backup or perform a reviewed offline recovery; no unauthenticated reset endpoint is provided.
