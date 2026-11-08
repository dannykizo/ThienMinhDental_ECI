#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"

. scripts/prod/common.sh
. scripts/prod/backup-lib.sh
sh scripts/prod/preflight.sh "$ENV_FILE"
# A commit label must describe deployed source, not uncommitted local changes.
if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
  echo 'Deployment requires a clean committed worktree. Do not deploy unreviewed changes.' >&2
  exit 1
fi
acquire_operation_lock
cleanup() { STATUS=$?; trap - EXIT INT TERM; resume_backup_services || STATUS=1; release_operation_lock || STATUS=1; exit "$STATUS"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
compose build backend frontend
# An existing volume can outlive its deleted container. Start only PostgreSQL
# and inspect the database before any application startup/migration.
compose up -d --wait --wait-timeout 90 postgres
TABLE_COUNT=$(compose exec -T postgres sh -ec 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname=current_schema()"')
if [ "$TABLE_COUNT" -gt 0 ]; then
  create_backup
fi
RELEASE_SHA=$(git rev-parse --short=12 HEAD 2>/dev/null || echo unknown)
export RELEASE_SHA
if ! compose up -d --no-build --wait --wait-timeout 180; then
  # Never reopen public ingress against a failed upgrade. No automatic DB down.
  BACKUP_STOPPED=''
  compose stop proxy >/dev/null 2>&1 || true
  echo 'Deploy failed; ingress remains stopped. Preserve backup, inspect logs and follow the recovery runbook.' >&2
  exit 1
fi
BACKUP_STOPPED=''
compose ps
