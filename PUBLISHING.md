# Publishing this release

The folder is a source-only GitHub repository package. No repository URL, image registry or support address has been invented, and nothing has been published automatically.

1. Create your GitHub repository, upload/commit this folder's contents, and ensure the generated README, LICENSE, CREDITS, dependency notices, SBOM and Docker files are present.
2. Keep `.env`, `private/`, databases, backups, logs and real ticket screenshots out of Git. `.gitignore` and `.dockerignore` cover the documented generated paths.
3. Enable private vulnerability reporting and choose your support/issue policy. Review SECURITY.md and CREDITS.md for your preferred public contact/name.
4. Create a `v0.12.0` release, attach the source archive/checksum if desired, and identify it as a release candidate. The image is built locally by Compose; no prebuilt public registry image is claimed. If you publish an image later, publish the matching source and retain dependency notices/licenses.
5. Replace the final placeholder paragraph in FORUM-POST.md with your real repository URL, then post it yourself. The draft accurately distinguishes API-only features and the optional metadata exporter. Use synthetic screenshots only.

The project is supplied under GPL-3.0-only, with dependencies under their own terms. It is an independent community companion and should not be presented as an official ITFlow release.
