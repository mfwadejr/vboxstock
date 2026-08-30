#!/bin/sh
set -eu

puid="${PUID:-99}"
pgid="${PGID:-100}"

case "$puid:$pgid" in
  *[!0-9:]*|:*|*:) echo "PUID and PGID must be numeric." >&2; exit 1 ;;
esac

mkdir -p "${DATA_DIR:-/data}" "${DATA_DIR:-/data}/backups"
chown -R "$puid:$pgid" "${DATA_DIR:-/data}"

exec su-exec "$puid:$pgid" "$@"
