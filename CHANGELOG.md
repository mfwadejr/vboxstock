# Changelog

## 3.4.0

- Added multi-item sales so one customer transaction can include multiple available inventory devices.
- Added an individual sale-price field for every selected device and a live transaction total.
- Applied shared customer, payment, fulfillment, warranty, date, and notes to every item in the transaction.
- Made multi-item sales atomic so validation or inventory conflicts leave every selected device unchanged.
- Retained the single-device sale API for backward compatibility.
- Added API coverage for successful multi-item sales and failed-transaction rollback behavior.

## 3.3.1

- Moved automatic-backup scheduling into the Database backups section.
- Renamed the control to **Enable automatic backups**.
- Added Every day and Weekly frequencies with a conditional weekday selector.
- Replaced the numeric hour field with a clearer local-time selection.
- Added last and next automatic-backup status information.
- Renamed new scheduled files to `automatic-*.db` while retaining cleanup compatibility for earlier `scheduled-*.db` files.
- Kept automatic retention isolated from manual, pre-upgrade, and pre-restore backups.

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
