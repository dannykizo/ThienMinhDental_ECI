#!/usr/bin/env sh
# Caller holds the operation lock and installs its own cleanup trap.
resume_backup_services() {
  if [ -n "${BACKUP_STOPPED:-}" ]; then
    # Deliberate word splitting of a service-name allow-list, never filesystem paths.
    compose start $BACKUP_STOPPED >/dev/null
    BACKUP_STOPPED=''
  fi
}
create_backup() {
  BACKUP_ID=$(date -u +%Y%m%dT%H%M%SZ)-$$
  export BACKUP_ID
  BACKUP_STOPPED=''
  RUNNING=$(compose ps --status running --services)
  # Stop ingress and every application writer, including the image cleanup worker.
  # DB + evidence then describe the same quiescent application state.
  for SERVICE in proxy backend; do
    if printf '%s\n' "$RUNNING" | grep -qx "$SERVICE"; then BACKUP_STOPPED="$BACKUP_STOPPED $SERVICE"; fi
  done
  if [ -n "$BACKUP_STOPPED" ]; then compose stop -t 30 $BACKUP_STOPPED >/dev/null; fi
  compose --profile operations run --rm --no-deps backup
  compose --profile operations run --rm --no-deps evidence-backup
  docker run --rm --network none -v "${DOCKER_ROOT}/deploy/backups:/backups:ro" postgres:16-alpine pg_restore --list "/backups/thien-minh-${BACKUP_ID}.dump" >/dev/null
  docker run --rm --network none -v "${DOCKER_ROOT}/deploy/backups:/backups:ro" alpine:3.22 tar -tzf "/backups/thien-minh-evidence-${BACKUP_ID}.tar.gz" >/dev/null
  (cd deploy/backups && sha256sum --binary "thien-minh-${BACKUP_ID}.dump" "thien-minh-evidence-${BACKUP_ID}.tar.gz") > "deploy/backups/thien-minh-${BACKUP_ID}.sha256.tmp"
  mv "deploy/backups/thien-minh-${BACKUP_ID}.sha256.tmp" "deploy/backups/thien-minh-${BACKUP_ID}.sha256"
  echo "Backup pair verified: ${BACKUP_ID}"
  # Never prune an old backup before an off-host copy/retention review.
}
