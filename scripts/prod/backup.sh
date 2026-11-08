#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"

. scripts/prod/common.sh
. scripts/prod/backup-lib.sh
acquire_operation_lock
cleanup() { STATUS=$?; trap - EXIT INT TERM; resume_backup_services || STATUS=1; release_operation_lock || STATUS=1; exit "$STATUS"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
create_backup
