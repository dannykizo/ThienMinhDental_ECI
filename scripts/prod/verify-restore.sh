#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"
DUMP_FILE=${1:-}
[ -n "$DUMP_FILE" ] || { echo "Usage: sh scripts/prod/verify-restore.sh deploy/backups/<file>.dump [evidence.tar.gz]" >&2; exit 1; }
case "$DUMP_FILE" in deploy/backups/*.dump) ;; *) echo "Dump must be inside deploy/backups." >&2; exit 1;; esac
[ -f "$DUMP_FILE" ] || { echo "Dump not found: $DUMP_FILE" >&2; exit 1; }

CONTAINER="thien-minh-restore-check-$$"
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=restore-check -e POSTGRES_DB=restore_check -v "${ROOT_DIR}/deploy/backups:/backups:ro" postgres:16-alpine >/dev/null
until docker exec "$CONTAINER" pg_isready -U postgres -d restore_check >/dev/null 2>&1; do sleep 1; done
docker exec "$CONTAINER" pg_restore --exit-on-error --no-owner --no-privileges -U postgres -d restore_check "/backups/$(basename "$DUMP_FILE")" >/dev/null
TABLE_COUNT=$(docker exec "$CONTAINER" psql -U postgres -d restore_check -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','employees','attendance_events','migrations')")
[ "$TABLE_COUNT" -eq 4 ] || { echo "Restore is missing critical tables." >&2; exit 1; }
if [ -n "${2:-}" ]; then
  case "$2" in deploy/backups/*.tar.gz) ;; *) echo "Evidence archive must be inside deploy/backups." >&2; exit 1;; esac
  docker run --rm -v "${ROOT_DIR}/deploy/backups:/backups:ro" alpine:3.22 tar -tzf "/backups/$(basename "$2")" >/dev/null
fi
echo "Restore verification passed: $DUMP_FILE"
