#!/bin/sh
# Periodic gzipped pg_dump of the cirrus database, over the network
# (pg_dump -h postgres) — never touches the pgdata volume directly, so a
# corrupted/lost pgdata volume can't take the backups down with it.
# Sleep-loop instead of cron, matching this codebase's existing preference
# for a hand-rolled timer over a new dependency (see rbac/src/scheduler.ts:
# "check everything every N seconds has no day/hour semantics a hand-rolled
# timer can't already express").
#
# Restore (into a FRESH/empty database — this is a plain SQL dump, not
# pg_restore custom format, and doesn't include CREATE DATABASE):
#   gunzip -c cirrus-<timestamp>.sql.gz | psql -h postgres -U cirrus -d cirrus

set -eu

: "${PG_BACKUP_INTERVAL_SECONDS:=86400}"
: "${PG_BACKUP_RETENTION_DAYS:=7}"

OUT_DIR=/backups
mkdir -p "$OUT_DIR"

export PGPASSWORD="$POSTGRES_PASSWORD"

while true; do
  STAMP=$(date -u +%Y%m%dT%H%M%SZ)
  DUMP_TMP="$OUT_DIR/.cirrus-${STAMP}.sql"
  FILE="$OUT_DIR/cirrus-${STAMP}.sql.gz"

  echo "postgres-backup: dumping to $FILE"
  # Captured explicitly rather than relying on `set -o pipefail` (not
  # guaranteed on every /bin/sh — this image's is busybox ash) — a
  # pg_dump failure must not silently produce a "successful" empty/partial
  # gzip from the pipe's own exit status.
  if pg_dump -h postgres -U cirrus -d cirrus --no-owner --no-privileges >"$DUMP_TMP" 2>/tmp/pg_dump.err; then
    gzip -c "$DUMP_TMP" >"$FILE.tmp"
    mv "$FILE.tmp" "$FILE"
    chmod 600 "$FILE"
    echo "postgres-backup: wrote $FILE"
  else
    echo "postgres-backup: pg_dump failed: $(cat /tmp/pg_dump.err)" >&2
  fi
  rm -f "$DUMP_TMP" "$FILE.tmp"

  find "$OUT_DIR" -name 'cirrus-*.sql.gz' -mtime "+$PG_BACKUP_RETENTION_DAYS" -delete

  sleep "$PG_BACKUP_INTERVAL_SECONDS"
done
