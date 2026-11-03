# ITFlow PWA

A self-hosted, installable mobile and desktop companion for [ITFlow](https://itflow.org). Work tickets in the field, track time, receive push/email notifications and export scheduled work to Microsoft 365 calendars.

Independent community project by Matt Kammeraad. Not an official ITFlow product. Local PWA accounts are separate from ITFlow accounts.

## Features

- Responsive ticket workspace: create tickets, select company/contact/assignee, update assignment/contact, add internal notes or public replies with email, paste/attach images, track time and mark tickets billable.
- Daily calendar, knowledge browsing, primary asset/document references and API-supported inventory. Public without email and company transfers remain in ITFlow.
- Browser push with app logo, ticket deep links, preferences and delivery state. Opt-in email for assignments, replies and edits, with SMTP/sender controls. Notification polling uses local Node/API calls.
- Local owner/admin/technician accounts, invitations, password reset links, authenticator MFA, recovery codes, device/session revocation and optional persistent sign-in.
- One ITFlow instance per deployment. Separate encrypted personal API keys; no fallback to another user's key. Owner-reviewed user mapping gates writes, notifications and calendar export.
- Shared Microsoft Entra setup in Admin; each user connects their own Microsoft account/calendar under More. One-way ITFlow → Outlook export. See [Microsoft setup](docs/MICROSOFT.md).
- Admin branding, app title/logo, notifications, SMTP, instance/API mapping, account recovery and optional metadata import.

 ## Screenshots

<img width="342" height="247" alt="home" src="https://github.com/user-attachments/assets/48299a8f-dff5-47c8-9ed5-aeba70c3a5fc" /> <img width="346" height="252" alt="knowledge" src="https://github.com/user-attachments/assets/a304d49d-2a71-406f-aa2c-6af03a7a0ca2" />

<img width="342" height="247" alt="more" src="https://github.com/user-attachments/assets/1bf93ba5-365e-4222-8945-a338da42dd90" /> <img width="347" height="247" alt="admin" src="https://github.com/user-attachments/assets/9b17dd0e-07f6-4c36-962e-9e8e073c677e" />

<img width="290" height="671" alt="home-mobile" src="https://github.com/user-attachments/assets/c0ed364a-2704-4ac5-9ac5-2953dd6d0970" /> <img width="290" height="657" alt="knowledge-mobile" src="https://github.com/user-attachments/assets/39e9d493-3ed6-4cdf-a007-44fee86674f6" />

<img width="290" height="640" alt="more-mobile" src="https://github.com/user-attachments/assets/4471dfc9-ce45-406c-a886-2d32d9636f71" /> <img width="290" height="647" alt="admin-mobile" src="https://github.com/user-attachments/assets/eb450ed7-47ab-4c6c-b0a9-a0e6830b9ef7" />

### API compatibility

This app uses existing ITFlow APIs and does not modify ITFlow source. Endpoint availability and permissions vary by installation. API reads prove key access, **not user identity**; an owner must independently review each ITFlow user ID before approving its mapping. Review does not expand the key's ITFlow permissions.

Users, statuses, Projects/Racks, general appointments, additional asset relationships and exact installed email templates may require the optional read-only [metadata provider](docs/METADATA.md). API-only installations still support tickets, knowledge, time/notes, scheduled-ticket calendars, push and SMTP email. Built-in email templates are used until installed ITFlow templates are imported. Note status and assignment choices depend on configured metadata.

## Docker installation

Requirements: Docker Engine with Compose v2, a domain pointing to this host, ports 80/443 available for HTTPS, and reachable ITFlow HTTPS/API access. No paid service or AI API key is needed. Microsoft export is optional and requires your own tenant/app registration.

1. Download/clone this repository and enter its itflow_pwa directory. Set your actual domain and email:

   ```sh
   cp .env.example .env
   # Edit .env: APP_DOMAIN and ACME_EMAIL
   docker compose build app
   mkdir -m 700 private
   ```

2. Generate private deployment secrets. Replace the example URL with the same domain as `.env`:

   ```sh
   docker run --rm --user "$(id -u):$(id -g)" \
     -v "$PWD/private:/setup" --entrypoint node itflow-pwa:0.12.0 \
     cli.mjs init --directory /setup --origin https://pwa.example.com --proxy 172.31.250.2
   sudo chown -R 1000:1000 private/config.json private/data
   docker compose up -d
   docker compose ps
   ```

   The initializer refuses to overwrite an existing config. The Compose example uses subnet `172.31.250.0/24`; if it conflicts with your network, change both static addresses/subnet and the initializer's trusted proxy IP together.

3. Read `private/bootstrap-token` **privately** and open your HTTPS URL. Use that deployment verification value to create the owner. It is not a default password. Choose your own local password and enable MFA.
4. In **Admin → Instance and API connections**, save your ITFlow origin, then test/save your personal API key. Independently confirm the key's ITFlow user ID and approve the mapping. Never share an owner's broad key with technicians.
5. Import optional metadata for user/status choices and other unsupported APIs. Configure branding, SMTP and optional Microsoft integration. Invite colleagues; each links their own key. Review each mapping in Admin.
6. Under **More**, enable push on each device and choose email preferences. New installations start with no subscriptions. On iPhone use Safari → Share → Add to Home Screen, then enable notifications from the installed app. Chrome/Brave may show an install icon when browser requirements are met. Brave may require its Google push-messaging setting.

The bundled Caddy proxy obtains HTTPS certificates. For an existing Nginx/Caddy/Traefik proxy, omit the bundled proxy and adapt the network: configure the app's trusted proxy to its actual TCP peer, preserve the external `Host`, and set `X-Forwarded-Proto: https`. The app rejects untrusted direct access. See [operations](docs/OPERATIONS.md).

## Everyday use

Select a ticket to add notes/time, change assignment or view linked assets/documents. A public reply with email requires confirmation; ITFlow determines ticket contact/watcher recipients. Separate PWA event emails follow the user's preferences. Uncertain writes are not retried automatically—check ITFlow before submitting again.

Admin recovery requires the administrator's own password and fresh MFA code. A password reset revokes sessions and generates a one-use password setup link; share it privately. The existing MFA factor is retained. MFA reset revokes sessions and requires new enrollment. Change your own credentials in the local account/security sections.

Persistent sign-in lasts until logout/revocation while the browser retains its cookie; browser storage policies can still end a session. Ticket/document contents are not cached for offline use. Push is not a guaranteed emergency alerting service: browser/OS delivery and notification duration vary. API polling defaults to ten seconds and can miss intermediate changes.

## Upgrade, backup and troubleshooting

See [operations](docs/OPERATIONS.md), [security](SECURITY.md), [feature/acceptance notes](docs/RELEASE.md) and [contributing](CONTRIBUTING.md). Version 0.12.0 is a community release candidate; clean installation and synthetic isolation tests do not establish compatibility with every ITFlow version.

## License and credits

Copyright © 2026 Matt Kammeraad and contributors. Licensed under [GNU GPL version 3](LICENSE), SPDX `GPL-3.0-only`, without warranty. Dependencies retain their own licenses; see [credits](CREDITS.md), [third-party notices](THIRD_PARTY_NOTICES.md) and `THIRD_PARTY_LICENSES/`. ITFlow's name belongs to its project; no endorsement is implied.
