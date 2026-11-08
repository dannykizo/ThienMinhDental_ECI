#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"
PROD_ENV_FILE=${1:-${PROD_ENV_FILE:-deploy/.env.production}}
export PROD_ENV_FILE

command -v docker >/dev/null 2>&1 || { echo "Docker is required." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required." >&2; exit 1; }
. scripts/prod/common.sh
APP_DOMAIN=$(env_value APP_DOMAIN)
POSTGRES_PASSWORD=$(env_value POSTGRES_PASSWORD)
JWT_SECRET=$(env_value JWT_SECRET)

case "${APP_DOMAIN:-}" in ""|workforce.example.com|*replace-with*) echo "APP_DOMAIN is missing or still a placeholder." >&2; exit 1;; esac
case "${POSTGRES_PASSWORD:-}" in ""|*replace-with*) echo "POSTGRES_PASSWORD is missing or still a placeholder." >&2; exit 1;; esac
case "${JWT_SECRET:-}" in ""|*replace-with*) echo "JWT_SECRET is missing or still a placeholder." >&2; exit 1;; esac
[ "${#JWT_SECRET}" -ge 48 ] || { echo "JWT_SECRET must have at least 48 characters." >&2; exit 1; }
printf '%s\n' "$APP_DOMAIN" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$' || { echo 'APP_DOMAIN must be a hostname, not a URL/path.' >&2; exit 1; }
case "$POSTGRES_PASSWORD" in *[!a-zA-Z0-9_.~-]*) echo 'POSTGRES_PASSWORD must be URL-safe as documented.' >&2; exit 1;; esac
if [ "$(env_value FIREBASE_PUSH_ENABLED)" = true ]; then
  [ -n "$(env_value FIREBASE_PROJECT_ID)" ] && [ -f deploy/secrets/firebase-service-account.json ] || { echo 'Firebase project/credential file is required for push-enabled deploy.' >&2; exit 1; }
fi

compose config --quiet
echo "Preflight passed for ${APP_DOMAIN}."
