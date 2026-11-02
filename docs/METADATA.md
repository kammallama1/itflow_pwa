# Optional read-only metadata

Standard ITFlow APIs may omit users, statuses, Projects/Racks, calendar appointments, extra asset/document relationships and installed email templates. The core app needs no SSH or database account. Metadata is an optional administrator-operated compatibility provider.

The included `tools/export-metadata.php` runs **locally on your ITFlow host**, reads your existing ITFlow configuration, opens a read-only database transaction and writes JSON to standard output. It never installs or changes ITFlow source. Review the SQL against your installed schema first; an incompatible schema causes export to fail. Do not expose this CLI script through a web server.

```sh
php /path/to/export-metadata.php /path/to/itflow > /private/path/metadata.json
```

Transfer the output privately and import it using Admin → ITFlow sync → Import metadata JSON. It contains internal names, company metadata and templates; do not commit it. General appointments are visible only to the PWA owner, while company-specific inventory/relationships are filtered against each API key's accessible records. User/status lists are shared assignment metadata. Email recipients use the synced ITFlow email for reviewed mappings, otherwise the administrator-invited local account address.

For scheduled imports, run an administrator-managed job that produces JSON and atomically replaces `private/data/metadata.json` with container-readable ownership. Preserve the prior snapshot on failure. Fields: `users`, `statuses`, `projects`, `racks`, `ticketAssets`, `assetDocuments`, `calendar` arrays; `timezone`; `mailTemplates`; `mailBranding`; and ISO `updatedAt`. Look at the exporter for exact field names. The app reloads metadata every ten seconds.

The UI's Sync now button writes `sync-request.json`. It is a signal for an optional external provider, not a built-in database connection. Without such a job, use manual import; do not expect that button to fetch missing upstream APIs. No installation-specific SSH runner or credentials are shipped in this package.
