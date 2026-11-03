# Validation — 2026-11-02

Version 0.12.1 was built from the allowlisted public source, not from a private deployment directory.

- 41 Node tests passed, including clean setup, role checks, encrypted credentials, per-user ticket read/write isolation, owner-reviewed mappings, revoked links, separate push snapshots/deliveries, MFA/recovery, CSRF, durable submission protection and Microsoft account isolation.
- TypeScript/Vite production build passed. Production npm audit reported no vulnerabilities.
- Chromium synthetic-data checks passed at 320/390/1440px, including dark mode, ticket creation/layout, image paste, inline assignment failure/success, navigation and offline/cache exclusions.
- Local authentication/MFA/invitation/session flows passed at 390/1440px. Unified setup/API-linking and personal Microsoft controls passed for owner/technician views, including absence of the preview banner.
- Docker Compose configuration and Caddy configuration validated. A fresh image initialized private configuration, created an owner, locked setup, rejected the wrong proxy host and exposed a usable unlinked workspace/Admin. A stopped-volume backup/restore retained initialization state.
- Source export was allowlisted and checked against live configuration secret values. Private operational notes, configuration, databases, keys, journals and live screenshots were excluded. Dependency inventory, license texts and a CycloneDX SBOM are included.

Real browser push delivery, SMTP delivery and Microsoft consent depend on each deployment's devices, services and permissions. The maintainer's existing installation is operational, but that does not validate every ITFlow version or client permission model. See RELEASE.md for release-candidate acceptance and limitations.
