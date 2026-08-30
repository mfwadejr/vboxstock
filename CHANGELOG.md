# Changelog

## 3.3.0

- Added returning-customer autocomplete and server-side duplicate safeguards using customer IDs, normalized names, and phone numbers.
- Expanded sale correction to include customer, phone, sale date, price, payment method, payment reference, fulfillment, tracking, warranty, and notes.
- Added model, payment, fulfillment, warranty-status, and date-range filters.
- Added CSV exports for inventory, sales, customers, warranties, and the administrator audit log.
- Added configurable daily SQLite backups with local-time scheduling and automatic retention pruning.
- Added an Admin diagnostics panel with application and schema versions, Node.js version, database size, data-directory writability, storage capacity, time zone, and backup health.
- Prevented duplicate sale submissions while a save is in progress.
- Corrected the delivery-exception status value shared by the UI and API.
- Expanded API tests for full sale correction, customer reuse, exports, diagnostics, and backup settings.

## 3.2.0

- Added sale fulfillment methods for Shipped, Dropped Off, Installed At, and Meet with context-sensitive fields and validation.
- Added UPS, FedEx, USPS, and Other carrier records, optional tracking numbers, official carrier tracking links, and editable delivery status.
- Added Admin-managed warranty periods with custom day, month, or year durations, a configurable default, archival, usage protection, and historical sale snapshots.
- Added green in-warranty countdowns and red expired indicators to sales, sale details, and customer purchase history.
- Added post-sale editing for fulfillment, tracking, delivery status, warranty, and transaction notes.
- Kept meetup and drop-off locations separate from permanent customer addresses; only shipping and installation update the customer address.
- Cleared fulfillment and warranty data when a sale is voided and its product is restocked.
- Improved mobile sign-in and form behavior on iPhone and iPad by preventing focus zoom and horizontal overflow without disabling user zoom.
- Added migration safety backups and automated coverage for warranty and fulfillment behavior.

## 3.1.0

- Added an Admin-managed product model catalog.
- Added create, rename, archive, reactivate, and safe-delete model actions.
- Added available and sold usage counts for every model.
- Preserved archived model names throughout inventory, sales, and customer history.
- Added automatic pre-migration database backups for upgrades from the fixed model list.
- Added responsive, light, and dark theme styling for model management.
- Added API and migration regression coverage.
- Added a ZimaOS-specific Compose definition with project metadata, persistent storage defaults, and dashboard icon.
- Added the canonical container icon URL to the ZimaOS and Unraid templates and installation documentation.
- Clarified platform-specific PUID and PGID values for general Docker, Docker Desktop, ZimaOS, and Unraid.
- Changed the recommended host WebUI port to `8269` while retaining internal container port `3000`.

## 3.0.2

- Corrected fresh-install initialization so inventory, sales, and customers begin empty.
