#!/usr/bin/env sh
set -eu
umask 077
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"
DOCKER_ROOT=$ROOT_DIR
case "$ROOT_DIR" in /[a-zA-Z]/*) DOCKER_ROOT=$(cygpath -m "$ROOT_DIR"); export MSYS_NO_PATHCONV=1 ;; esac
DUMP_FILE=${1:-}
case "$DUMP_FILE" in deploy/backups/thien-minh-*.dump) ;; *) echo 'Expected deploy/backups/thien-minh-<id>.dump.' >&2; exit 1;; esac
BACKUP_ID=$(basename "$DUMP_FILE" .dump | sed 's/^thien-minh-//')
printf '%s\n' "$BACKUP_ID" | grep -Eq '^[0-9]{8}T[0-9]{6}Z(-[A-Za-z0-9]+)?$' || { echo 'Invalid backup ID.' >&2; exit 1; }
[ "$DUMP_FILE" = "deploy/backups/thien-minh-${BACKUP_ID}.dump" ] || { echo 'Nested/traversal backup path refused.' >&2; exit 1; }
EVIDENCE_FILE="deploy/backups/thien-minh-evidence-${BACKUP_ID}.tar.gz"
[ -z "${2:-}" ] || [ "$2" = "$EVIDENCE_FILE" ] || { echo 'DB and evidence must be the same backup pair.' >&2; exit 1; }
MANIFEST="deploy/backups/thien-minh-${BACKUP_ID}.sha256"
for FILE in "$DUMP_FILE" "$EVIDENCE_FILE" "$MANIFEST"; do
  [ -f "$FILE" ] && [ ! -L "$FILE" ] || { echo 'Backup pair/manifest missing or symlink refused.' >&2; exit 1; }
done
# An edited manifest must not ask sha256sum to read arbitrary host paths.
awk -v db="thien-minh-${BACKUP_ID}.dump" -v images="thien-minh-evidence-${BACKUP_ID}.tar.gz" '
  {sub(/\r$/, ""); name=$2; sub(/^\*/, "", name)}
  NF!=2 || length($1)!=64 || $1~/[^0-9a-f]/ {bad=1}
  name==db {d++} name==images {i++}
  name!=db && name!=images {bad=1}
  END {exit(bad || NR!=2 || d!=1 || i!=1)}' "$MANIFEST" || { echo 'Invalid checksum manifest.' >&2; exit 1; }
(cd deploy/backups && sha256sum --check --strict "thien-minh-${BACKUP_ID}.sha256") >/dev/null
CONTAINER="thien-minh-restore-check-$(date -u +%Y%m%dT%H%M%SZ)-$$"
REF_FILE="${ROOT_DIR}/deploy/backups/.restore-refs-$$.tmp"
SQL_FILE="${ROOT_DIR}/deploy/backups/.restore-queries-$$.tmp"
cleanup() { STATUS=$?; trap - EXIT INT TERM; rm -f "$REF_FILE" "$SQL_FILE"; docker rm -fv "$CONTAINER" >/dev/null 2>&1 || true; exit "$STATUS"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# No published ports/network and no production volume. rm -v removes only the
# disposable container's anonymous PostgreSQL volume, never the source backup.
docker run -d --network none --name "$CONTAINER" -e POSTGRES_PASSWORD=restore-check -e POSTGRES_DB=restore_check \
  -v "${DOCKER_ROOT}/deploy/backups:/backups:ro" postgres:16-alpine >/dev/null
ATTEMPTS=0
until docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres -d restore_check >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS+1))
  [ "$ATTEMPTS" -lt 60 ] || { echo 'Restore database readiness timeout.' >&2; exit 1; }
  sleep 1
done
docker exec "$CONTAINER" pg_restore --exit-on-error --no-owner --no-privileges -h 127.0.0.1 -U postgres -d restore_check "/backups/$(basename "$DUMP_FILE")" >/dev/null
TABLE_COUNT=$(docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d restore_check -Atc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','employees','attendance_events','schema_migrations')")
[ "$TABLE_COUNT" -eq 4 ] || { echo 'Restore is missing critical tables.' >&2; exit 1; }
# Reject links and traversal before extracting into the temporary container.
docker exec "$CONTAINER" sh -eu -c '
  archive=$1
  tar -tzf "$archive" > /tmp/evidence-list
  if grep -Eq "^(/|.*(^|/)\.\.(/|$))" /tmp/evidence-list; then exit 1; fi
  tar -tvzf "$archive" > /tmp/evidence-details
  if grep -Ev "^[-d]" /tmp/evidence-details | grep -q .; then exit 1; fi
  mkdir /tmp/restored-evidence
  tar -xzf "$archive" -C /tmp/restored-evidence
' sh "/backups/$(basename "$EVIDENCE_FILE")"
# Validate image references, not merely a readable archive header.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d restore_check -Atc "
  SELECT 'SELECT evidence_image_reference FROM ' || quote_ident(table_name) || ' WHERE evidence_image_reference IS NOT NULL'
  FROM information_schema.columns WHERE table_schema='public' AND column_name='evidence_image_reference'
    AND table_name IN ('attendance_explanation_requests','business_trip_members','attendance_events')
  " > "$SQL_FILE"
: > "$REF_FILE"
while IFS= read -r SQL; do
    docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d restore_check -Atc "$SQL"
done < "$SQL_FILE" >> "$REF_FILE"
while IFS= read -r REF; do
  case "$REF" in
    /api/attendance/evidence/*) FOLDER=attendance; NAME=${REF#/api/attendance/evidence/} ;;
    /api/business-trips/evidence/*) FOLDER=business-trips; NAME=${REF#/api/business-trips/evidence/} ;;
    *) echo 'Legacy/external image reference requires separate operator review.' >&2; continue ;;
  esac
  printf '%s\n' "$NAME" | grep -Eq '^[a-fA-F0-9-]+\.(jpg|png|webp)$' || { echo 'Invalid owned evidence filename.' >&2; exit 1; }
  docker exec "$CONTAINER" test -s "/tmp/restored-evidence/$FOLDER/$NAME" || { echo 'Restored DB references missing evidence.' >&2; exit 1; }
done < "$REF_FILE"
echo "Restore verification passed (DB + extracted evidence + references): ${BACKUP_ID}"
