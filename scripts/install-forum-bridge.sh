#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1 || ! docker inspect flarum_app >/dev/null 2>&1; then
  echo "Forum container is not installed; skipping forum bridge setup."
  exit 0
fi

read_env_value() {
  local file="$1"
  local key="$2"
  if [[ -f "$file" ]]; then
    grep -E "^${key}=" "$file" | head -n 1 | cut -d '=' -f2- || true
  fi
}

BRIDGE_SECRET="$(read_env_value backend/config.env FORUM_SSO_BRIDGE_SECRET)"
if [[ -z "$BRIDGE_SECRET" ]]; then
  BRIDGE_SECRET="$(read_env_value backend/config.env FORUM_OAUTH_CLIENT_SECRET)"
fi
if [[ ${#BRIDGE_SECRET} -lt 32 ]]; then
  if command -v openssl >/dev/null 2>&1; then
    BRIDGE_SECRET="$(openssl rand -hex 32)"
  else
    BRIDGE_SECRET="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 64)"
  fi
  printf '\nFORUM_SSO_BRIDGE_SECRET=%s\n' "$BRIDGE_SECRET" >> backend/config.env
  echo "Generated and persisted a forum bridge secret."
fi

COOKIE_DOMAIN="$(read_env_value backend/config.env FORUM_SSO_BRIDGE_COOKIE_DOMAIN)"
if [[ -z "$COOKIE_DOMAIN" ]]; then
  FRONTEND_URL="$(read_env_value backend/config.env FRONTEND_URL)"
  FRONTEND_HOST="$(printf '%s' "$FRONTEND_URL" | sed -E 's#^https?://##; s#[:/].*$##')"
  COOKIE_DOMAIN=".$(printf '%s' "$FRONTEND_HOST" | sed -E 's/^www\.//')"
fi

touch .env.flarum
grep -v -E '^(FORUM_SSO_BRIDGE_SECRET|FORUM_SSO_BRIDGE_COOKIE_DOMAIN)=' .env.flarum > .env.flarum.tmp || true
{
  cat .env.flarum.tmp
  printf 'FORUM_SSO_BRIDGE_SECRET=%s\n' "$BRIDGE_SECRET"
  printf 'FORUM_SSO_BRIDGE_COOKIE_DOMAIN=%s\n' "$COOKIE_DOMAIN"
} > .env.flarum
rm -f .env.flarum.tmp

docker compose -f docker-compose.flarum.yml --env-file .env.flarum up -d --no-deps flarum

for _ in $(seq 1 30); do
  if docker exec flarum_app php flarum info >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker exec flarum_app composer config repositories.carradioweb-forum-bridge path /extensions/carradioweb-forum-bridge
if ! docker exec flarum_app composer show fof/passport >/dev/null 2>&1; then
  docker exec flarum_app composer require fof/passport:1.1.1 --with-all-dependencies --no-interaction --no-progress
fi
if ! docker exec flarum_app composer show carradioweb/forum-bridge >/dev/null 2>&1; then
  docker exec flarum_app composer require carradioweb/forum-bridge:1.0.0 --with-dependencies --no-interaction --no-progress
fi
docker exec flarum_app php flarum extension:enable fof-passport
docker exec flarum_app php flarum extension:enable carradioweb-forum-bridge
docker exec flarum_app php flarum migrate --no-interaction
docker exec flarum_app php flarum cache:clear

# The Flarum application directory is recreated when the forum container is
# updated; only the database and /data volume are persistent. Restore every
# extension declared by the project after each deployment so installed
# extensions do not disappear while their settings remain in the database.
restore_project_extensions() {
  local manifest_script
  manifest_script='const { FORUM_EXTENSIONS = [] } = require("./backend/dist/data/forumExtensions.js"); for (const e of FORUM_EXTENSIONS) console.log([e.id, e.composerPackage, e.vcsUrl || ""].join("\t"));'

  if [[ ! -f backend/dist/data/forumExtensions.js ]] || ! command -v node >/dev/null 2>&1; then
    echo "Forum extension metadata is unavailable; skipping extension restore."
    return 0
  fi

  local pending=0
  while IFS=$'\t' read -r extension_id composer_package vcs_url; do
    [[ -z "$extension_id" || -z "$composer_package" ]] && continue
    if docker exec flarum_app composer show "$composer_package" >/dev/null 2>&1; then
      docker exec flarum_app php flarum extension:enable "$extension_id" >/dev/null 2>&1 || true
      continue
    fi

    if [[ -n "$vcs_url" ]]; then
      docker exec flarum_app composer config "repositories.carradioweb-${extension_id}" vcs "$vcs_url" --no-interaction >/dev/null 2>&1 || true
      docker exec flarum_app composer require "${composer_package}:dev-main" --no-update --no-interaction --no-progress || true
    else
      docker exec flarum_app composer require "${composer_package}:*" --no-update --no-interaction --no-progress || true
    fi
    pending=$((pending + 1))
  done < <(node -e "$manifest_script")

  if [[ "$pending" -gt 0 ]]; then
    echo "Restoring $pending forum extensions..."
    if ! docker exec flarum_app composer update --no-interaction --no-progress; then
      echo "Bulk forum extension restore failed; retrying packages individually."
      while IFS=$'\t' read -r extension_id composer_package vcs_url; do
        [[ -z "$extension_id" || -z "$composer_package" ]] && continue
        docker exec flarum_app composer show "$composer_package" >/dev/null 2>&1 || continue
        docker exec flarum_app php flarum extension:enable "$extension_id" >/dev/null 2>&1 || true
      done < <(node -e "$manifest_script")
    fi
  fi

  while IFS=$'\t' read -r extension_id composer_package vcs_url; do
    [[ -z "$extension_id" || -z "$composer_package" ]] && continue
    if docker exec flarum_app composer show "$composer_package" >/dev/null 2>&1; then
      docker exec flarum_app php flarum extension:enable "$extension_id" >/dev/null 2>&1 || true
    fi
  done < <(node -e "$manifest_script")

  docker exec flarum_app php flarum migrate --no-interaction >/dev/null 2>&1 || true
  docker exec flarum_app php flarum cache:clear >/dev/null 2>&1 || true
  docker exec flarum_app php flarum assets:publish >/dev/null 2>&1 || true
}

restore_project_extensions

echo "Forum bridge extension is installed and enabled."
