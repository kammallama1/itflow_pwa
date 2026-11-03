# Contributing

From the repository root, run `cd itflow_pwa`. Use Node 24, then `npm ci`, `npm test` and `npm run build`. The lockfile is required. Browser tests in `test/` use Python Playwright with synthetic API responses; install Playwright/Chromium in an isolated development environment. No private ITFlow instance or credentials are needed for the automated Node tests.

Include tests for credential isolation, roles, CSRF, uncertain writes and account revocation when changing authentication/integration behavior. Run mobile/desktop browser checks for UI changes. Keep secrets and private data out of fixtures. Contributions use GPL-3.0-only. Document behavioral changes and compatibility limitations. Avoid broad refactors bundled with an unrelated bug fix.

Before a release, stage the intended source changes, run `node tools/update-manifest.mjs` from `itflow_pwa`, then stage the root `MANIFEST.sha256`. From the repository root, verify with `sha256sum -c MANIFEST.sha256`. The manifest excludes itself and includes tracked source/docs/licenses; generated private files remain ignored.

Validate the distributable image from the repository root with `docker build -f itflow_pwa/Dockerfile .`, or run `docker compose build app` from `itflow_pwa`. The repository-root `.dockerignore` is used by both builds. Then run the Node tests and frontend build from `itflow_pwa`.
