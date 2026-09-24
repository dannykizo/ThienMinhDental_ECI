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
docker compose --env-file "$ENV_FILE" -f compose.production.yaml --profile operations run --rm backup
docker compose --env-file "$ENV_FILE" -f compose.production.yaml --profile operations run --rm evidence-backup
find deploy/backups -maxdepth 1 -type f \( -name 'thien-minh-*.dump' -o -name 'thien-minh-evidence-*.tar.gz' \) -print
