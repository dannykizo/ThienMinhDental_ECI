#!/usr/bin/env bash
set -euo pipefail

corepack enable
pnpm install
docker compose up -d postgres

if command -v flutter >/dev/null 2>&1; then
  (
    cd mobile
    flutter create --platforms=android,ios .
    flutter pub get
  )
else
  echo 'Flutter was not found. Install Flutter, then run: cd mobile && flutter create --platforms=android,ios .'
fi

