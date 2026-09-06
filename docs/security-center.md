# IP 安全防护中心部署说明

CarRadioWeb 的安全中心默认不要求开发环境安装 CrowdSec。Express 负责管理和可视化，Redis 负责分钟级计数，MongoDB 保存聚合记录、事件、封禁历史和白名单；生产环境建议由 Nginx 和 CrowdSec 在应用层之前拦截恶意流量。

## 真实客户端 IP

应用只在 `TRUSTED_PROXY_IPS` 中配置的反向代理地址发来的请求上信任 `CF-Connecting-IP`、`X-Real-IP` 和 `X-Forwarded-For`。生产环境请把该变量设置为 Nginx/Cloudflare 到 Node 的实际网段，例如：

```env
TRUSTED_PROXY_IPS=127.0.0.1,::1,10.0.0.10
```

不要把任意公网网段加入该变量，否则客户端可以伪造请求头绕过 IP 限制。Nginx 示例：

```nginx
real_ip_header CF-Connecting-IP;
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
# 按 Cloudflare 官方 IP 列表补齐其余网段
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

若不使用 Cloudflare，可移除 `CF-Connecting-IP` 配置并仅信任内网 Nginx 地址。

## CrowdSec（可选）

在 Linux 服务器安装 CrowdSec 后，使用 Nginx 日志采集器和 bouncer：

```bash
sudo apt-get update
sudo apt-get install -y crowdsec
sudo cscli collections install crowdsecurity/nginx
sudo systemctl enable --now crowdsec
sudo cscli metrics
```

根据发行版安装 Nginx bouncer，并将 bouncer 配置到 Nginx `http`/`server` 层。官方 Nginx bouncer 使用 `access_by_lua_file`，命中封禁时返回 `403` 并在本地缓存；请严格按官方文档安装 Lua/OpenResty 依赖，不要把下面的应用层兜底当成 Nginx bouncer 替代品：

- CrowdSec Linux 安装：https://docs.crowdsec.net/u/getting_started/installation/linux
- CrowdSec Nginx bouncer：https://doc.crowdsec.net/docs/bouncers/nginx
- 官方 Nginx bouncer 源码说明：https://github.com/crowdsecurity/cs-nginx-bouncer

应用后台的“安全设置 → CrowdSec 联动”仅表示启用联动记录，不会在开发机执行系统安装或直接修改防火墙。未安装 CrowdSec 时，CarRadioWeb 会使用 Redis/内存缓存和 MongoDB 封禁记录提供应用层兜底；生产环境仍应让 Nginx/CrowdSec 在 Node.js 之前拦截。

## 安全中心接口

- `GET /api/security/dashboard`：概览和 Top IP
- `GET /api/security/ips`、`GET /api/security/ips/:ip`：IP 列表与详情
- `GET /api/security/events`：攻击事件
- `GET/PUT /api/security/settings`：阈值配置（PUT 仅超级管理员）
- `GET/POST/DELETE /api/security/whitelist`：白名单（写操作仅超级管理员）
- `POST /api/security/ban`、`POST /api/security/unban`：封禁/解封（仅超级管理员）

自动规则默认使用每分钟 120 次可疑阈值和 300 次硬封禁阈值，可在后台调整。请求明细只保留 7 天，安全事件保留 90 天；高频请求先进入 Redis，后台每 5 秒批量写入 MongoDB，避免每个请求产生单独数据库写入。

## 后台更新前自动备份

生产环境后台执行一键更新时，更新器会在下载资源包或执行 `git merge` 之前创建独立备份目录，包含：

- MongoDB：优先使用更新器环境中的 `mongodump --archive --gzip`；也可通过 `docker exec` 调用 Mongo 容器内的 `mongodump`。
- Flarum 数据库：优先使用 `mariadb-dump` 或 `mysqldump`，密码通过 `MYSQL_PWD` 传递，不写入命令行日志；也可通过 `docker exec flarum_db` 导出。
- 主站上传文件：默认复制 `backend/uploads`，可用 `UPDATE_UPLOADS_PATH` 指定持久化目录。
- Flarum `/data`：配置 `UPDATE_FLARUM_DATA_PATH` 复制宿主机目录；未配置时可用 `UPDATE_FLARUM_CONTAINER` 通过 `docker cp` 备份。

示例配置：

```env
UPDATE_BACKUP_ENABLED=true
UPDATE_BACKUP_REQUIRED=true
UPDATE_BACKUP_DIR=/var/backups/carradioweb
UPDATE_BACKUP_RETENTION_COUNT=7
MONGODB_URI=mongodb://user:password@127.0.0.1:27017/knowledge-base?authSource=admin
UPDATE_FLARUM_DB_HOST=127.0.0.1
UPDATE_FLARUM_DB_PORT=3306
UPDATE_FLARUM_DB_NAME=flarum
UPDATE_FLARUM_DB_USER=flarum
UPDATE_FLARUM_DB_PASSWORD=change-me
```

备份使用流式导出或文件复制，不会把数据库或上传目录一次性读入 Node.js 内存。每次备份都会写入 `backup-manifest.json`，并按 `UPDATE_BACKUP_RETENTION_COUNT` 清理更新器自己创建的旧目录。生产中必须将 `UPDATE_BACKUP_DIR` 放在持久化挂载盘，并确保更新器进程有写权限；若缺少导出工具或数据库参数，且 `UPDATE_BACKUP_REQUIRED=true`，更新会在代码变更前失败并保留失败清单。该机制不自动恢复数据库，恢复操作应根据清单由管理员执行。
