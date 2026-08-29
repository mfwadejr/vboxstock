# vSeeBox Stockroom

Version 2.0 adds required sign-in and two server-enforced roles.

## First login

On an installation with no configured users, sign in with username `admin` and password `admin`. Stockroom blocks all other access until that password is changed. New passwords must contain at least 8 characters.

Administrators can receive and sell products, edit records and notes, manage users, view the audit log, and manage database backups. Read-Only users can search and view inventory, sales, customers, and notes, but cannot modify data, download backups, or access Admin pages.

## Emergency administrator recovery

If every administrator is inaccessible, run this from the Unraid terminal, replacing the container name, username, and password if needed:

```sh
docker exec -it vseebox-stockroom node server.mjs reset-admin admin NewPassword123
```

The account is enabled as an administrator and must change the supplied temporary password on its next login. The reset is recorded in the audit log. Password arguments may be visible briefly in process listings; alternatively pass the password through `RESET_ADMIN_PASSWORD` and omit the final argument.

```sh
docker exec -e RESET_ADMIN_PASSWORD=NewPassword123 -it vseebox-stockroom node server.mjs reset-admin admin
```

Database backups contain customer information and password hashes. Store downloaded copies securely. Restoring a database replaces the current users with the users in that backup and signs out every active session.
