#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"

ENV_FILE=deploy/.env.production
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE." >&2
  exit 1
fi

mkdir -p deploy/backups
BACKUP_ID=$(date -u +%Y%m%dT%H%M%SZ)
export BACKUP_ID
docker compose --env-file "$ENV_FILE" -f compose.production.yaml --profile operations run --rm backup
docker compose --env-file "$ENV_FILE" -f compose.production.yaml --profile operations run --rm evidence-backup
DB_BACKUP="deploy/backups/thien-minh-${BACKUP_ID}.dump"
EVIDENCE_BACKUP="deploy/backups/thien-minh-evidence-${BACKUP_ID}.tar.gz"
docker run --rm -v "${ROOT_DIR}/deploy/backups:/backups:ro" postgres:16-alpine pg_restore --list "/backups/thien-minh-${BACKUP_ID}.dump" >/dev/null
docker run --rm -v "${ROOT_DIR}/deploy/backups:/backups:ro" alpine:3.22 tar -tzf "/backups/thien-minh-evidence-${BACKUP_ID}.tar.gz" >/dev/null
sha256sum "$DB_BACKUP" "$EVIDENCE_BACKUP" > "deploy/backups/thien-minh-${BACKUP_ID}.sha256"
RETENTION_DAYS=$(sed -n 's/^BACKUP_RETENTION_DAYS=//p' "$ENV_FILE" | tail -n 1 | tr -d '\r')
RETENTION_DAYS=${RETENTION_DAYS:-14}
case "$RETENTION_DAYS" in *[!0-9]*|'') echo "BACKUP_RETENTION_DAYS must be a non-negative integer." >&2; exit 1;; esac
find deploy/backups -maxdepth 1 -type f -name 'thien-minh-*' -mtime "+${RETENTION_DAYS}" -delete
echo "Backup verified: ${BACKUP_ID}"
