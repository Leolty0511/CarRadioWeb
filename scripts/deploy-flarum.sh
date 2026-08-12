#!/bin/bash
set -e

# Function to echo status updates
update_status() {
  echo "STATUS:$1 LOG:$2"
}

cd "$(dirname "$0")/.."

# Production only: auto-install Docker if missing (requires passwordless sudo for scripts/ensure-docker.sh)
if [[ "$AUTO_INSTALL_DOCKER" = "1" ]]; then
  ENSURE_DOCKER="$(dirname "$0")/ensure-docker.sh"
  if ! sudo -n bash "$ENSURE_DOCKER" 2>/dev/null; then
    update_status "failed" "Docker not installed. On server run once: sudo $ENSURE_DOCKER"
    exit 1
  fi
fi

# Step 1: Generate URL and preserve credentials
update_status "deploying_pull" "Preparing environment..."

# 获取前端访问地址（用于推导论坛域名）
# 优先级：
# 1) backend/config.env 的 FRONTEND_URL（本项目开发默认已有）
# 2) 根目录 .env 的 VITE_APP_URL（可选）
# 3) 环境变量 FRONTEND_URL / VITE_APP_URL（可选）
APP_URL=""

if [[ -f "backend/config.env" ]]; then
  APP_URL=$(grep -E '^FRONTEND_URL=' backend/config.env | head -n 1 | cut -d '=' -f2-)
fi

if [[ -z "$APP_URL" && -f ".env" ]]; then
  APP_URL=$(grep -E '^VITE_APP_URL=' .env | head -n 1 | cut -d '=' -f2-)
fi

if [[ -z "$APP_URL" && -n "$FRONTEND_URL" ]]; then
  APP_URL="$FRONTEND_URL"
fi

if [[ -z "$APP_URL" && -n "$VITE_APP_URL" ]]; then
  APP_URL="$VITE_APP_URL"
fi

if [[ -z "$APP_URL" ]]; then
  update_status "failed" "错误：无法获取前端访问地址。请在 backend/config.env 配置 FRONTEND_URL（例如 http://localhost:3001），或在根目录 .env 配置 VITE_APP_URL。"
  exit 1
fi

FINAL_FLARUM_URL=""

if [[ "$APP_URL" == *"localhost"* ]]; then
  # 本地：Flarum 容器映射在 8888，用 localhost:8888 才能打开论坛；forum.localhost:3001 会落到前端主站
  PROTOCOL=$(echo "$APP_URL" | sed -E 's#(https?)://.*#\1#')
  FINAL_FLARUM_URL="${PROTOCOL}://localhost:8888"
else
  # 线上环境：例如 https://xxx.com 或 https://www.xxx.com => https://forum.xxx.com
  DOMAIN_WITHOUT_PROTOCOL=$(echo "$APP_URL" | sed -e 's,^http://,,' -e 's,^https://,,')
  MAIN_DOMAIN=$(echo "$DOMAIN_WITHOUT_PROTOCOL" | cut -d ':' -f1)
  FINAL_FLARUM_URL="https://forum.${MAIN_DOMAIN}"
fi

# Keep credentials across redeployments. MariaDB only applies MYSQL_PASSWORD on
# first initialization; changing it on every run can disconnect Flarum from an
# existing database. Prefer the existing .env.flarum value, then backend config.
read_env_value() {
  local file="$1"
  local key="$2"
  if [[ -f "$file" ]]; then
    grep -E "^${key}=" "$file" | head -n 1 | cut -d '=' -f2-
  fi
}

DB_PASSWORD="$(read_env_value .env.flarum DB_PASSWORD)"
if [[ -z "$DB_PASSWORD" && -f backend/config.env ]]; then
  DB_PASSWORD="$(read_env_value backend/config.env FLARUM_DB_PASSWORD)"
fi
if [[ -z "$DB_PASSWORD" ]]; then
  # 仅用字母数字，避免 + / = 在表单提交时被误解析导致 Access denied
  DB_PASSWORD=$(openssl rand -base64 18 | tr -d '+/=' | head -c 24)
fi

FORUM_SSO_BRIDGE_SECRET="$(read_env_value backend/config.env FORUM_SSO_BRIDGE_SECRET)"
if [[ -z "$FORUM_SSO_BRIDGE_SECRET" ]]; then
  FORUM_SSO_BRIDGE_SECRET="$(read_env_value backend/config.env FORUM_OAUTH_CLIENT_SECRET)"
fi
FORUM_SSO_BRIDGE_COOKIE_DOMAIN="$(read_env_value backend/config.env FORUM_SSO_BRIDGE_COOKIE_DOMAIN)"
if [[ -z "$FORUM_SSO_BRIDGE_COOKIE_DOMAIN" && "$APP_URL" != *"localhost"* ]]; then
  FORUM_SSO_BRIDGE_COOKIE_DOMAIN=".$(printf '%s' "$MAIN_DOMAIN" | sed -E 's/^www\.//')"
fi
if [[ -n "$FORUM_SSO_BRIDGE_COOKIE_DOMAIN" ]]; then
  FORUM_SSO_BRIDGE_COOKIE_DOMAIN=".$(printf '%s' "$FORUM_SSO_BRIDGE_COOKIE_DOMAIN" | sed -E 's/^\.+//; s/^www\.//')"
fi

cat > .env.flarum << EOL
FLARUM_BASE_URL=${FINAL_FLARUM_URL}
DB_PASSWORD=${DB_PASSWORD}
FORUM_SSO_BRIDGE_SECRET=${FORUM_SSO_BRIDGE_SECRET}
FORUM_SSO_BRIDGE_COOKIE_DOMAIN=${FORUM_SSO_BRIDGE_COOKIE_DOMAIN}
EOL

# Re-deployment must preserve the forum database and uploaded assets.
docker compose -f docker-compose.flarum.yml --env-file .env.flarum down 2>/dev/null || true
sleep 2

# Step 2: Pull Docker images
update_status "deploying_pull" "步骤 1/3: 正在下载所需镜像 (预计 1-3 分钟)..."
docker compose -f docker-compose.flarum.yml --env-file .env.flarum pull

# Step 3: Start the database container
update_status "deploying_db" "步骤 2/3: 正在启动数据库服务..."
docker compose -f docker-compose.flarum.yml --env-file .env.flarum up -d db
sleep 10 # Wait for DB to initialize

# Step 4: Start the Flarum application container
update_status "deploying_app" "步骤 3/3: 正在启动 Flarum 应用服务..."
docker compose -f docker-compose.flarum.yml --env-file .env.flarum up -d flarum

# Final verification: a running container may still be installing Flarum.
FLARUM_HTTP_READY=0
for _ in $(seq 1 45); do
  HTTP_CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8888/ 2>/dev/null || true)
  if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "302" ]]; then
    FLARUM_HTTP_READY=1
    break
  fi
  sleep 2
done

FLARUM_STATUS=$(docker compose -f docker-compose.flarum.yml ps -q flarum)
if [[ -z "$FLARUM_STATUS" || "$FLARUM_HTTP_READY" != "1" ]]; then
  update_status "failed" "Flarum 服务未能在 90 秒内就绪，请检查容器日志。"
  docker compose -f docker-compose.flarum.yml logs --tail 120
  exit 1
else
  update_status "deployed" "部署成功！"
  if [[ -f "scripts/install-forum-bridge.sh" ]]; then
    bash scripts/install-forum-bridge.sh || true
  fi
  DOCKER_BIN=$(command -v docker)
  if [[ -n "$DOCKER_BIN" && -d /etc/cron.d && -w /etc/cron.d ]]; then
    cat > /etc/cron.d/carradioweb-flarum << EOL
* * * * * root ${DOCKER_BIN} exec flarum_app php flarum schedule:run --no-interaction >/dev/null 2>&1
EOL
    chmod 0644 /etc/cron.d/carradioweb-flarum
    "$DOCKER_BIN" exec flarum_app php flarum schedule:run --no-interaction >/dev/null 2>&1 || true
  fi
  echo "FLARUM_URL_IS=${FINAL_FLARUM_URL}" # Final output for service
  exit 0
fi
