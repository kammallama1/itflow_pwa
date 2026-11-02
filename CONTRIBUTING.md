# Contributing

Use Node 24, then `npm ci`, `npm test` and `npm run build`. The lockfile is required. Browser tests in `test/` use Python Playwright with synthetic API responses; install Playwright/Chromium in an isolated development environment. No private ITFlow instance or credentials are needed for the automated Node tests.

Include tests for credential isolation, roles, CSRF, uncertain writes and account revocation when changing authentication/integration behavior. Run mobile/desktop browser checks for UI changes. Keep secrets and private data out of fixtures. Contributions use GPL-3.0-only. Document behavioral changes and compatibility limitations. Avoid broad refactors bundled with an unrelated bug fix.
