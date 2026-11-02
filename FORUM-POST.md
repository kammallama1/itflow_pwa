# ITFlow PWA — self-hosted field companion (release candidate)

I've been building an independent installable PWA for ITFlow, aimed at working tickets from a phone while still having a useful desktop layout.

It includes ticket creation and updates, pasted images, time tracking/billable status, company/contact selection, asset/document references, daily scheduled work, knowledge browsing, browser push with ticket deep links, optional email notifications, and one-way ITFlow-to-Microsoft calendar export.

It runs in Docker with local accounts, MFA, persistent sign-in and admin account recovery; Authentik isn't required. Each user links a personal ITFlow API key. The admin configures the shared Microsoft app, and users connect their own calendars. One ITFlow instance per deployment is supported initially.

Some ITFlow APIs don't expose users/statuses, general calendar appointments, Projects/Racks or email templates on every version. Those use an optional read-only metadata exporter; no production ITFlow source changes are required. API reads don't prove identity, so the owner reviews user mappings before enabling writes/notifications/calendar export.

This is a release candidate, and I'd appreciate testing/feedback—especially different ITFlow versions and technician client scopes. The repository includes Docker Compose, HTTPS proxy setup, backup/upgrade instructions and known limitations. It uses GPL v3, with credits to the ITFlow project and the open-source dependencies. Development was AI-assisted with Codex; running it doesn't require an AI service.

Before posting: insert your actual GitHub repository link here and attach only synthetic-data screenshots. No repository URL or public support address is assumed in this draft.
