#!/bin/sh
# Periodic tar+gzip snapshot of Vault's on-disk file-storage backend
# (storage "file" in vault/config.hcl), mounted read-only at /data here.
# Written to a host-visible directory that is deliberately NOT the
# vault-init volume (unseal keys + root token) or vault-file itself — a
# backup living alongside the keys that unlock it defeats the whole point
# (same reasoning as the vault-init/vault-file volume split, see CLAUDE.md).
# vault-init is intentionally NOT backed up by this or any script — that
# volume's content is meant to be extracted once into a password manager
# per the existing bootstrap docs, not continuously copied to another
# on-host location, which would only widen its exposure.
#
# Caveat, not glossed over: this is a filesystem-level snapshot of a live
# Vault, not an atomic backend-native export — the file storage backend has
# no hot-backup API (unlike the Raft backend's `vault operator raft
# snapshot`, which doesn't apply here since this deployment uses storage
# "file", not "raft"). A backup could in theory land mid-write. Acceptable
# for this deployment's write pattern (cloud connections are created/edited
# rarely, not high-throughput OLTP) — revisit if that ever changes.
#
# Restore: stop vault, extract into a fresh vault-file volume, then start
# vault again — it unseals with the SAME unseal keys that were valid when
# this backup was taken (from vault-init, never included in this archive):
#   tar -xzf vault-file-<timestamp>.tar.gz -C /path/to/vault-file/volume/mountpoint

set -eu

: "${VAULT_BACKUP_INTERVAL_SECONDS:=86400}"
: "${VAULT_BACKUP_RETENTION_DAYS:=7}"

OUT_DIR=/backups
mkdir -p "$OUT_DIR"

while true; do
  STAMP=$(date -u +%Y%m%dT%H%M%SZ)
  FILE="$OUT_DIR/vault-file-${STAMP}.tar.gz"

  echo "vault-backup: archiving to $FILE"
  if tar -czf "$FILE.tmp" -C /data .; then
    mv "$FILE.tmp" "$FILE"
    chmod 600 "$FILE"
    echo "vault-backup: wrote $FILE"
  else
    echo "vault-backup: tar failed, discarding partial file" >&2
    rm -f "$FILE.tmp"
  fi

  find "$OUT_DIR" -name 'vault-file-*.tar.gz' -mtime "+$VAULT_BACKUP_RETENTION_DAYS" -delete

  sleep "$VAULT_BACKUP_INTERVAL_SECONDS"
done
