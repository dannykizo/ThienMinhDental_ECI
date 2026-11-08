#!/usr/bin/env sh
# Sourced by operational commands, never evaluates the environment file as code.
ENV_FILE=${PROD_ENV_FILE:-deploy/.env.production}
DOCKER_ROOT=$ROOT_DIR
case "$ROOT_DIR" in /[a-zA-Z]/*) DOCKER_ROOT=$(cygpath -m "$ROOT_DIR"); export MSYS_NO_PATHCONV=1 ;; esac
[ -f "$ENV_FILE" ] || { echo "Missing production environment file." >&2; exit 1; }
env_value() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r' | sed 's/^['\"'\'']\(.*\)['\"'\'']$/\1/'; }
compose() {
  if [ -n "${PROD_COMPOSE_OVERRIDE:-}" ]; then
    if [ "$(env_value FIREBASE_PUSH_ENABLED)" = true ]; then
      docker compose --env-file "$ENV_FILE" -f compose.production.yaml -f deploy/compose.firebase.yaml -f "$PROD_COMPOSE_OVERRIDE" "$@"
    else
      docker compose --env-file "$ENV_FILE" -f compose.production.yaml -f "$PROD_COMPOSE_OVERRIDE" "$@"
    fi
  elif [ "$(env_value FIREBASE_PUSH_ENABLED)" = true ]; then
    docker compose --env-file "$ENV_FILE" -f compose.production.yaml -f deploy/compose.firebase.yaml "$@"
  else
    docker compose --env-file "$ENV_FILE" -f compose.production.yaml "$@"
  fi
}
acquire_operation_lock() {
  umask 077
  mkdir -p deploy/backups
  if ! mkdir deploy/backups/.operation-lock 2>/dev/null; then
    echo 'Another backup/deploy is in progress. If its process died, inspect the lock before removing it.' >&2
    exit 1
  fi
  OPERATION_LOCKED=1
}
release_operation_lock() {
  if [ "${OPERATION_LOCKED:-0}" = 1 ]; then rmdir deploy/backups/.operation-lock; fi
}
