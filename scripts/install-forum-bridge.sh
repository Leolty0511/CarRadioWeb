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
if [[ -n "$COOKIE_DOMAIN" ]]; then
  COOKIE_DOMAIN=".$(printf '%s' "$COOKIE_DOMAIN" | sed -E 's/^\.+//; s/^www\.//')"
fi

touch .env.flarum
grep -v -E '^(FORUM_SSO_BRIDGE_SECRET|FORUM_SSO_BRIDGE_COOKIE_DOMAIN)=' .env.flarum > .env.flarum.tmp || true
{
  cat .env.flarum.tmp
  printf 'FORUM_SSO_BRIDGE_SECRET=%s\n' "$BRIDGE_SECRET"
  printf 'FORUM_SSO_BRIDGE_COOKIE_DOMAIN=%s\n' "$COOKIE_DOMAIN"
} > .env.flarum
rm -f .env.flarum.tmp

FORUM_STATE_DIR="${FORUM_STATE_DIR:-.forum-state}"
FORUM_ENABLED_STATE_FILE="$FORUM_STATE_DIR/enabled-extensions.json"
PRESERVE_FORUM_ENABLED_STATE=0

fix_forum_runtime_permissions() {
  docker exec flarum_app sh -lc '
    chown 1000:1000 /opt/flarum/composer.json /opt/flarum/composer.lock 2>/dev/null || true
    chmod 0644 /opt/flarum/composer.json /opt/flarum/composer.lock 2>/dev/null || true
    chown -R 1000:1000 /opt/flarum/vendor /data/storage /data/assets /opt/flarum/storage /opt/flarum/public 2>/dev/null || true
  '
}

save_forum_composer_state() {
  mkdir -p "$FORUM_STATE_DIR"
  if docker cp flarum_app:/opt/flarum/composer.json "$FORUM_STATE_DIR/composer.json.tmp" >/dev/null 2>&1; then
    mv "$FORUM_STATE_DIR/composer.json.tmp" "$FORUM_STATE_DIR/composer.json"
  fi
  if docker cp flarum_app:/opt/flarum/composer.lock "$FORUM_STATE_DIR/composer.lock.tmp" >/dev/null 2>&1; then
    mv "$FORUM_STATE_DIR/composer.lock.tmp" "$FORUM_STATE_DIR/composer.lock"
  fi
}

save_forum_enabled_state() {
  mkdir -p "$FORUM_STATE_DIR"
  local state_tmp="${FORUM_ENABLED_STATE_FILE}.tmp"
  if docker exec flarum_app php -r '
    $host=getenv("DB_HOST") ?: "flarum_db";
    $name=getenv("DB_NAME") ?: "flarum";
    $user=getenv("DB_USER") ?: "flarum";
    $password=getenv("DB_PASSWORD") ?: "";
    $prefix=getenv("DB_PREFIX") ?: "flarum_";
    if ($password === "") exit(1);
    try {
      $pdo=new PDO("mysql:host=".$host.";dbname=".$name.";charset=utf8mb4", $user, $password);
      $query=$pdo->query("SELECT `value` FROM `".$prefix."settings` WHERE `key` = \"extensions_enabled\" LIMIT 1");
      $row=$query ? $query->fetch(PDO::FETCH_ASSOC) : null;
      $list=$row ? json_decode((string) $row["value"], true) : null;
      if (!is_array($list)) exit(1);
      echo json_encode(array_values(array_filter($list, "is_string")), JSON_UNESCAPED_SLASHES);
    } catch (Throwable $error) {
      exit(1);
    }
  ' > "$state_tmp" 2>/dev/null; then
    mv "$state_tmp" "$FORUM_ENABLED_STATE_FILE"
    echo "Saved the current forum extension enable state."
  else
    rm -f "$state_tmp"
    echo "Could not save the current forum extension enable state; keeping the previous snapshot if available."
  fi
}

restore_forum_enabled_state() {
  if [[ ! -s "$FORUM_ENABLED_STATE_FILE" ]]; then
    return 1
  fi

  local state_b64
  state_b64="$(base64 < "$FORUM_ENABLED_STATE_FILE" | tr -d '\r\n')"
  if [[ -z "$state_b64" ]]; then
    return 1
  fi

  if docker exec -e EXTENSIONS_STATE_B64="$state_b64" flarum_app php -r '
    $raw=base64_decode(getenv("EXTENSIONS_STATE_B64") ?: "", true);
    $list=is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($list)) exit(1);
    $list=array_values(array_filter($list, "is_string"));
    foreach (["fof-passport", "carradioweb-forum-bridge"] as $required) {
      if (!in_array($required, $list, true)) $list[]=$required;
    }
    $host=getenv("DB_HOST") ?: "flarum_db";
    $name=getenv("DB_NAME") ?: "flarum";
    $user=getenv("DB_USER") ?: "flarum";
    $password=getenv("DB_PASSWORD") ?: "";
    $prefix=getenv("DB_PREFIX") ?: "flarum_";
    if ($password === "") exit(1);
    try {
      $pdo=new PDO("mysql:host=".$host.";dbname=".$name.";charset=utf8mb4", $user, $password);
      $update=$pdo->prepare("UPDATE `".$prefix."settings` SET `value`=? WHERE `key`=\"extensions_enabled\"");
      $update->execute([json_encode($list, JSON_UNESCAPED_SLASHES)]);
    } catch (Throwable $error) {
      exit(1);
    }
  ' >/dev/null 2>&1; then
    echo "Restored the forum extension enable state from the previous deployment."
    return 0
  fi

  echo "Could not restore the saved forum extension enable state."
  return 1
}

restore_forum_composer_state() {
  if [[ ! -s "$FORUM_STATE_DIR/composer.json" || ! -s "$FORUM_STATE_DIR/composer.lock" ]]; then
    return 1
  fi

  echo "Restoring the saved forum extension set..."
  docker cp "$FORUM_STATE_DIR/composer.json" flarum_app:/opt/flarum/composer.json
  docker cp "$FORUM_STATE_DIR/composer.lock" flarum_app:/opt/flarum/composer.lock
  fix_forum_runtime_permissions
  docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer install \
    --no-dev --prefer-dist --no-interaction --no-progress --optimize-autoloader
  fix_forum_runtime_permissions
}

# The image keeps Composer packages inside the container. Save the exact
# dependency files before Compose has any chance to recreate that container.
save_forum_composer_state
save_forum_enabled_state
if [[ -s "$FORUM_ENABLED_STATE_FILE" ]]; then
  PRESERVE_FORUM_ENABLED_STATE=1
fi

# Older artifact updates replaced the bind-mounted directory inode. Docker
# keeps serving that detached (and now empty) inode until the container is
# recreated, even though the current host directory contains the extension.
FORUM_BRIDGE_MOUNT_STALE=0
if [[ -f forum-extensions/carradioweb-forum-bridge/composer.json ]] && \
   ! docker exec flarum_app test -f /extensions/carradioweb-forum-bridge/composer.json 2>/dev/null; then
  FORUM_BRIDGE_MOUNT_STALE=1
  echo "Forum extension mount is stale; recreating the container after saving its Composer state."
fi

# Keep the existing container when its configuration is unchanged. The update
# runner preserves the mounted forum-extensions directory inode, so normal
# application updates no longer need to recreate Flarum or reinstall plugins.
CONTAINER_ID_BEFORE="$(docker inspect -f '{{.Id}}' flarum_app 2>/dev/null || true)"
COMPOSE_UP_ARGS=(-d --no-deps)
if [[ "$FORUM_BRIDGE_MOUNT_STALE" == "1" ]]; then
  COMPOSE_UP_ARGS+=(--force-recreate)
fi
docker compose -f docker-compose.flarum.yml --env-file .env.flarum up "${COMPOSE_UP_ARGS[@]}" flarum
CONTAINER_ID_AFTER="$(docker inspect -f '{{.Id}}' flarum_app 2>/dev/null || true)"
CONTAINER_RECREATED=0
if [[ -n "$CONTAINER_ID_BEFORE" && "$CONTAINER_ID_BEFORE" != "$CONTAINER_ID_AFTER" ]]; then
  CONTAINER_RECREATED=1
fi

for _ in $(seq 1 30); do
  if docker exec flarum_app php flarum info >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

# Keep FoF Passport aligned with the backend after secret rotation or restore.
# A stale forum setting makes the token exchange return invalid_client.
OAUTH_CLIENT_ID="$(read_env_value backend/config.env FORUM_OAUTH_CLIENT_ID)"
OAUTH_CLIENT_SECRET="$(read_env_value backend/config.env FORUM_OAUTH_CLIENT_SECRET)"
OAUTH_REDIRECT_URI="$(read_env_value backend/config.env FORUM_OAUTH_REDIRECT_URI)"
FRONTEND_URL="$(read_env_value backend/config.env FRONTEND_URL)"
OAUTH_CLIENT_ID="${OAUTH_CLIENT_ID:-carradioweb-forum}"
FRONTEND_URL="${FRONTEND_URL%/}"
if [[ ${#OAUTH_CLIENT_SECRET} -ge 32 && -n "$FRONTEND_URL" && -n "$OAUTH_REDIRECT_URI" ]]; then
  docker exec \
    -e CARRADIOWEB_OAUTH_CLIENT_ID="$OAUTH_CLIENT_ID" \
    -e CARRADIOWEB_OAUTH_CLIENT_SECRET="$OAUTH_CLIENT_SECRET" \
    -e CARRADIOWEB_OAUTH_REDIRECT_URI="$OAUTH_REDIRECT_URI" \
    -e CARRADIOWEB_FRONTEND_URL="$FRONTEND_URL" \
    flarum_app php -r '
      $pdo = new PDO(
        "mysql:host=" . getenv("DB_HOST") . ";port=" . getenv("DB_PORT") . ";dbname=" . getenv("DB_NAME"),
        getenv("DB_USER"),
        getenv("DB_PASSWORD")
      );
      $table = getenv("DB_PREFIX") . "settings";
      $key = chr(96) . "key" . chr(96);
      $sql = "INSERT INTO " . $table . " (" . $key . ", value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value)";
      $statement = $pdo->prepare($sql);
      $base = rtrim(getenv("CARRADIOWEB_FRONTEND_URL"), "/");
      $settings = [
        "fof-passport.app_id" => getenv("CARRADIOWEB_OAUTH_CLIENT_ID"),
        "fof-passport.app_secret" => getenv("CARRADIOWEB_OAUTH_CLIENT_SECRET"),
        "fof-passport.app_auth_url" => $base . "/api/member-auth/forum/oauth/authorize",
        "fof-passport.app_token_url" => $base . "/api/member-auth/forum/oauth/token",
        "fof-passport.app_user_url" => $base . "/api/member-auth/forum/oauth/user",
        "fof-passport.app_oauth_scopes" => "read",
        "fof-passport.button_title" => "Main site login",
        "fof-passport.button_icon" => "",
        "display_name_driver" => "nickname",
      ];
      foreach ($settings as $setting => $value) {
        $statement->execute([$setting, $value]);
      }
    '
  echo "FoF Passport settings synchronized with the backend."
else
  echo "Forum OAuth settings are incomplete; skipping Passport synchronization."
fi

COMPOSER_STATE_RESTORED=0
if [[ "$CONTAINER_RECREATED" == "1" ]] && restore_forum_composer_state; then
  COMPOSER_STATE_RESTORED=1
fi

docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer config repositories.carradioweb-forum-bridge path /extensions/carradioweb-forum-bridge
if ! docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer show fof/passport >/dev/null 2>&1; then
  docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer require fof/passport:1.1.1 --with-all-dependencies --no-interaction --no-progress
fi
if ! docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer show carradioweb/forum-bridge >/dev/null 2>&1; then
  docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer require carradioweb/forum-bridge:1.0.0 --with-dependencies --no-interaction --no-progress
fi
docker exec flarum_app php flarum extension:enable fof-passport
docker exec flarum_app php flarum extension:enable carradioweb-forum-bridge
docker exec flarum_app php flarum migrate --no-interaction
docker exec flarum_app php flarum cache:clear
# The bridge source is bind-mounted; restart PHP workers so opcache loads the
# newly pulled middleware immediately.
docker restart flarum_app >/dev/null

# First-install fallback and explicit repair mode. Normal container recreation
# uses the exact saved Composer state above so intentionally removed plugins
# are not brought back by a later main-site update.
restore_project_extensions() {
  if [[ ! -f backend/dist/data/forumExtensions.js ]] || ! command -v node >/dev/null 2>&1; then
    echo "Forum extension metadata is unavailable; skipping extension restore."
    return 1
  fi

  local manifest_file
  manifest_file="$(mktemp)"
  if ! node --input-type=module -e '
    const { FORUM_EXTENSIONS = [] } = await import("./backend/dist/data/forumExtensions.js");
    for (const extension of FORUM_EXTENSIONS) {
      console.log([extension.id, extension.composerPackage, extension.vcsUrl || ""].join("\t"));
    }
  ' > "$manifest_file"; then
    rm -f "$manifest_file"
    echo "Forum extension metadata could not be read."
    return 1
  fi

  local composer_backup_dir
  composer_backup_dir="$(mktemp -d)"
  docker cp flarum_app:/opt/flarum/composer.json "$composer_backup_dir/composer.json"
  docker cp flarum_app:/opt/flarum/composer.lock "$composer_backup_dir/composer.lock"

  local pending=0
  while IFS=$'\t' read -r extension_id composer_package vcs_url; do
    [[ -z "$extension_id" || -z "$composer_package" ]] && continue
    if docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer show "$composer_package" >/dev/null 2>&1; then
      if [[ "$PRESERVE_FORUM_ENABLED_STATE" != "1" ]]; then
        docker exec flarum_app php flarum extension:enable "$extension_id" >/dev/null 2>&1 || true
      fi
      continue
    fi

    if [[ -n "$vcs_url" ]]; then
      docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer config "repositories.carradioweb-${extension_id}" vcs "$vcs_url" --no-interaction >/dev/null 2>&1 || true
      docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer require "${composer_package}:dev-main" --no-update --no-interaction --no-progress || true
    else
      docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer require "${composer_package}:*" --no-update --no-interaction --no-progress || true
    fi
    pending=$((pending + 1))
  done < "$manifest_file"

  if [[ "$pending" -gt 0 ]]; then
    echo "Restoring $pending forum extensions..."
    if ! docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer update --prefer-dist --no-interaction --no-progress; then
      echo "Bulk forum extension restore failed; retrying packages individually."
      docker cp "$composer_backup_dir/composer.json" flarum_app:/opt/flarum/composer.json
      docker cp "$composer_backup_dir/composer.lock" flarum_app:/opt/flarum/composer.lock
      docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer install --no-dev --prefer-dist --no-interaction --no-progress

      while IFS=$'\t' read -r extension_id composer_package vcs_url; do
        [[ -z "$extension_id" || -z "$composer_package" ]] && continue
        if docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer show "$composer_package" >/dev/null 2>&1; then
          continue
        fi
        if [[ -n "$vcs_url" ]]; then
          docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer config "repositories.carradioweb-${extension_id}" vcs "$vcs_url" --no-interaction >/dev/null 2>&1 || true
          docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer require "${composer_package}:dev-main" --with-all-dependencies --prefer-dist --no-interaction --no-progress || true
        else
          docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer require "${composer_package}:*" --with-all-dependencies --prefer-dist --no-interaction --no-progress || true
        fi
      done < "$manifest_file"
    fi
  fi

  while IFS=$'\t' read -r extension_id composer_package vcs_url; do
    [[ -z "$extension_id" || -z "$composer_package" ]] && continue
    if docker exec -e COMPOSER_MEMORY_LIMIT=-1 flarum_app composer show "$composer_package" >/dev/null 2>&1; then
      if [[ "$PRESERVE_FORUM_ENABLED_STATE" != "1" ]]; then
        docker exec flarum_app php flarum extension:enable "$extension_id" >/dev/null 2>&1 || true
      fi
    fi
  done < "$manifest_file"

  docker exec flarum_app php flarum migrate --no-interaction >/dev/null 2>&1 || true
  docker exec flarum_app php flarum cache:clear >/dev/null 2>&1 || true
  docker exec flarum_app php flarum assets:publish >/dev/null 2>&1 || true
  docker exec flarum_app sh -lc 'chown -R 1000:1000 /data/storage /data/extensions /data/assets /opt/flarum/storage /opt/flarum/vendor /opt/flarum/public 2>/dev/null || true'
  rm -f "$manifest_file"
  rm -rf "$composer_backup_dir"
}

if [[ "${FORUM_RESTORE_ALL:-0}" == "1" ]]; then
  restore_project_extensions
elif [[ "$CONTAINER_RECREATED" == "1" && "$COMPOSER_STATE_RESTORED" != "1" ]]; then
  restore_project_extensions
else
  docker exec flarum_app php flarum cache:clear >/dev/null 2>&1 || true
fi

# Restoring Composer packages or running the fallback extension repair can
# change Flarum's extensions_enabled setting. Put it back exactly as it was
# before the update, while keeping the two extensions required for the bridge.
restore_forum_enabled_state || true

# Composer files restored with docker cp are owned by root. The Flarum web
# process must be able to read them when it discovers extensions and compiles
# locale assets, otherwise forum-en.js is generated as an empty translation set.
fix_forum_runtime_permissions
docker exec --user 1000:1000 flarum_app php flarum cache:clear >/dev/null
docker exec --user 1000:1000 flarum_app php flarum assets:publish >/dev/null
fix_forum_runtime_permissions

save_forum_composer_state

echo "Forum bridge extension is installed and enabled."
