#!/bin/sh
set -eu

repository_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repository_dir"

printf 'Email Admin production: '
IFS= read -r bootstrap_email
printf 'Mật khẩu mới (không hiển thị): '
restore_terminal() {
  stty echo 2>/dev/null || true
  unset bootstrap_password
}
trap restore_terminal EXIT HUP INT TERM
stty -echo
IFS= read -r bootstrap_password
stty echo
printf '\n'

docker compose \
  --env-file deploy/.env.production \
  -f compose.production.yaml \
  exec \
  -e BOOTSTRAP_ADMIN_EMAIL="$bootstrap_email" \
  -e BOOTSTRAP_ADMIN_PASSWORD="$bootstrap_password" \
  backend node dist/database/bootstrap-production-admin.js
