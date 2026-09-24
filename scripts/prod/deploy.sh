#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"

ENV_FILE=deploy/.env.production
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy deploy/.env.production.example and fill production values." >&2
  exit 1
fi

docker compose --env-file "$ENV_FILE" -f compose.production.yaml config --quiet
docker compose --env-file "$ENV_FILE" -f compose.production.yaml up -d --build
docker compose --env-file "$ENV_FILE" -f compose.production.yaml ps
