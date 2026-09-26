#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"
ENV_FILE=${1:-deploy/.env.production}

command -v docker >/dev/null 2>&1 || { echo "Docker is required." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required." >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE." >&2; exit 1; }

env_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | sed 's/^['\"'\'']\(.*\)['\"'\'']$/\1/'
}
APP_DOMAIN=$(env_value APP_DOMAIN)
POSTGRES_PASSWORD=$(env_value POSTGRES_PASSWORD)
JWT_SECRET=$(env_value JWT_SECRET)

case "${APP_DOMAIN:-}" in ""|workforce.example.com|*replace-with*) echo "APP_DOMAIN is missing or still a placeholder." >&2; exit 1;; esac
case "${POSTGRES_PASSWORD:-}" in ""|*replace-with*) echo "POSTGRES_PASSWORD is missing or still a placeholder." >&2; exit 1;; esac
case "${JWT_SECRET:-}" in ""|*replace-with*) echo "JWT_SECRET is missing or still a placeholder." >&2; exit 1;; esac
[ "${#JWT_SECRET}" -ge 48 ] || { echo "JWT_SECRET must have at least 48 characters." >&2; exit 1; }

docker compose --env-file "$ENV_FILE" -f compose.production.yaml config --quiet
echo "Preflight passed for ${APP_DOMAIN}."
