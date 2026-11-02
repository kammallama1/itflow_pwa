# Security

Do not put API keys, config files, SQLite databases, push subscription endpoints, tokens, recovery codes or real ticket content in GitHub issues. Use your repository's private vulnerability-reporting feature after enabling it; do not publish exploit details before review. A public support email is intentionally not invented here.

Local accounts use scrypt password hashes, encrypted authenticator seeds, single-use recovery codes, Secure/HttpOnly/SameSite cookies, CSRF checks and rate limits. Personal API credentials and Microsoft tokens are encrypted; their keys live in private deployment configuration. Upstream permissions remain authoritative. No direct ITFlow password login or automatic API identity proof is claimed.

An administrator can recover another administrator or owner with password plus MFA step-up. Invite and grant administrator roles only to people trusted with account recovery. The owner can configure the upstream target and review API mappings. Manual review is a compatibility mechanism; it must be performed independently and correctly.

PWA notification content is generic, but browser subscriptions and delivery state are sensitive. Email can contain ticket details. Configure appropriate SMTP, mailbox, retention and device policies for your organization. Already-dispatched push, SMTP or Microsoft requests cannot be recalled by revoking an account.
