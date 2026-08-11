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
  echo "Forum bridge secret is missing or shorter than 32 characters; skipping setup."
  exit 0
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
if ! docker exec flarum_app composer show carradioweb/forum-bridge >/dev/null 2>&1; then
  docker exec flarum_app composer require carradioweb/forum-bridge:1.0.0 --with-dependencies --no-interaction --no-progress
fi
docker exec flarum_app php flarum extension:enable carradioweb-forum-bridge
docker exec flarum_app php flarum migrate --force
docker exec flarum_app php flarum cache:clear

echo "Forum bridge extension is installed and enabled."
