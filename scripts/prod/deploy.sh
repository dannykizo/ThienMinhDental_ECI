#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"

ENV_FILE=deploy/.env.production
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy deploy/.env.production.example and fill production values." >&2
  exit 1
fi

sh scripts/prod/preflight.sh "$ENV_FILE"
if docker compose --env-file "$ENV_FILE" -f compose.production.yaml ps --status running --services | grep -qx postgres; then
  sh scripts/prod/backup.sh
fi
RELEASE_SHA=$(git rev-parse --short=12 HEAD 2>/dev/null || echo unknown)
export RELEASE_SHA
docker compose --env-file "$ENV_FILE" -f compose.production.yaml up -d --build --wait --wait-timeout 180
docker compose --env-file "$ENV_FILE" -f compose.production.yaml ps
