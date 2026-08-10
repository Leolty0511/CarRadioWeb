<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="CarRadioWeb — 汽车电子知识库与产品展示平台">
</p>

<p align="center">
  <strong>English</strong> · <a href="#中文">中文</a>
</p>

---

<a id="english"></a>

<br>

<p align="center">
  <img src="./public/images/default-hero.png" width="100%" alt="CarRadioWeb frontend preview">
</p>

<br>

**CarRadioWeb** is a knowledge-base and product showcase platform for automotive-electronics aftermarket brands (frontend React + TypeScript, backend Node.js + TypeScript). It supports product documentation, vehicle compatibility, AI assistant integration and an admin CMS with multilanguage support.

> Note: This README was updated (2026-08-10) to reflect recent codebase additions — security hardening, monitoring, rate limiting, automatic update service and additional API routes. Please read the "运维与安全注意" section below.

---

## Features (high level)

- Multi-language site (i18n: en / zh / ru)
- Product catalog with vehicle compatibility matrix
- Knowledge base: structured documents, rich editor, video tutorials
- AI Assistant (multiple providers support)
- Admin Panel (content, products, categories, AI configuration, hero banners, analytics, audit logs)
- Forum integration (Flarum)
- Public API for documents, products, search and more

---

## 最近代码更新与重要改动（2026-08-10）

以下为代码中已添加或强化但 README 旧版本可能未详细说明的要点（建议运维人员与管理员重点阅读）：

- 安全性与监控
  - Sentry 已集成并在启动时初始化（错误追踪与请求追踪）。
  - CSRF 防护中间件已启用（双提交 Cookie 模式）。
  - Helmet 与自定义安全头、全局输入清洗（express-mongo-sanitize / securityFilters）。
  - JWT_SECRET / SESSION_SECRET 在生产环境有严格校验（长度与弱字符串检查）。

- 限流与防滥用
  - 全局与局部限流策略（publicApiLimiter、trackVisitRateLimit 等），防止爬虫滥用或 DoS。

- 缓存与性能
  - Redis 支持（initRedis），当 REDIS_URL 配置后会启用缓存/会话改进。
  - 启用了 gzip/brotli 压缩（compression），并使用 Pino 结构化日志。

- 路由与功能扩展
  - 新增 /api/v1 版本化路由和 /api/forum（Flarum 管理）接口。
  - 新增/明确的路由：products、heroBanners、seo、faq、search、userManual、pageContent、resourceLinks、siteImages、visitors、canbusSettings 等。

- 运维自动化与自更新
  - 后端包含自动更新检查与触发逻辑（backend/src/services/projectUpdateService.ts）。
  - 自动检查默认每 72 小时执行一次，管理员可通过后台触发更新任务，更新进度写入状态文件（可配置 UPDATE_STATUS_FILE）。
  - 自更新依赖 runner 脚本（scripts/projectUpdateRunner.js），部署时需包含该 runner 并确保 PM2 配置（pm2 重启支持）。

- 其它改进
  - 健康与就绪探针支持（isSystemReady、/health/ready）。
  - 动态本地上传路径以数据库中 StorageSettings 为准（提高灵活性）。
  - 启动时会确保 admin 索引并创建默认管理员（ensureAdminIndexes, ensureDefaultAdmin）。

---

## 快速开始（开发）

### 前置条件

- Node.js >= 18
- MongoDB >= 6
- Redis（可选，但推荐）

### 安装

```bash
npm install
cd backend && npm install && cd ..
```

### 配置（示例）

```bash
cp .env.example .env.local
cp backend/config.env.example backend/config.env
```

### 开发运行

```bash
# 启动前后端（backend 会等待端口）
npm run dev:all

# 或分别启动：
npm run dev:backend   # 后端（默认 :3000）
npm run dev           # 前端（Vite，默认 :3001）
```

Vite 的开发代理会把 `/api` 转发到 `localhost:3000`。

### 构建（生产）

```bash
npm run build
```

---

## 必要的环境变量（重点，需在生产环境确认）

后端（backend/config.env 或在部署环境中设置）：

- MONGODB_URI (必须) — MongoDB 连接字符串
- JWT_SECRET (必须，生产) — 用于 JWT 签名，建议最少 32 字符并避免常见弱字符串
- SESSION_SECRET (必须，生产) — Express 会话签名
- SMTP_HOST / SMTP_PORT — 邮件（本地开发可用 Mailpit）
- OSS_* — 阿里云 OSS / 对象存储相关配置（若使用对象存储）
- CORS_ORIGIN (生产必须) — 允许的前端域名（逗号分隔）

新增/与自更新相关的环境变量：

- SELF_UPDATE_ENABLED — 是否允许自更新（默认在 production 下启用，设置为 'false' 可禁用）
- UPDATE_BRANCH — 要检查/更新的分支（默认 `main`）
- UPDATE_GITHUB_TOKEN — 用于访问 GitHub API / 下载私有 release 的 token（建议最小权限）
- UPDATE_ARTIFACT_URL — 可覆盖的发布 artifact 下载地址（可选）
- UPDATE_STATUS_FILE — 自更新状态文件路径（建议在持久化目录下）
- PM2_PROCESS_NAME — PM2 进程名，用于自动重启（若使用 pm2）
- FRONTEND_PM2_PROCESS_NAME — 前端 PM2 进程名（可选）
- UPDATE_HEALTH_URL — 更新后探测健康的 URL（默认 http://127.0.0.1:<PORT>/health/ready）

前端（.env.local）：

- VITE_API_BASE_URL — API 根路径（默认 `/api`）
- VITE_SITE_URL — 站点 URL（用于 SEO）
- VITE_ENABLE_AI_ASSISTANT — 是否启用 AI 聊天（true/false）

安全建议：在生产环境请把所有敏感信息（如 API key/GitHub token）通过部署系统的 secrets 管理，不要直接写入仓库。

---

## 部署建议与自更新注意事项

项目支持两种更新检测模式：

1. 有 `.git` 的部署（开发、git checkout 部署）：使用 git 比较 HEAD 与 origin/<branch>，在可 fast-forward 的情况下自动或手动触发更新；
2. 无 `.git` 的生产构建（artifact 部署）：通过发布的 release 元数据（release.json）和 GitHub API 检查远端是否有新版本，并可下载 release artifact 完成替换。

重要安全/运维建议：

- UPDATE_GITHUB_TOKEN 只授予必要最小权限（建议 read-only，例如 repo:public_repo 或更细分的权限），并使用部署环境的 secret 存储。
- 下载 artifact 后应校验完整性（建议在 CI 中生成并提供校验和或签名），避免中间人注入被替换的包。
- 在触发更新前务必做好备份（可备份 release.json、dist、uploads 及数据库快照），并在 README 中记录回滚步骤。
- Runner（scripts/projectUpdateRunner.js）必须被包含在部署包中，否则触发更新会失败（会返回 update_runner_not_built）。
- 默认状态文件写到系统临时目录（/tmp），建议在生产中把 UPDATE_STATUS_FILE 指向持久化目录并保证进程权限可写。
- 自更新重启依赖 PM2（或设置 PM2_PROCESS_NAME），请确保进程管理器配置正确。

---

## API 路由 （摘录 — 以代码为准）

- /api/auth — 认证（邮箱验证码 + 密码）
- /api/users — 管理员用户（受保护）
- /api/documents — 文档 CRUD / 前端只读（权限控制）
- /api/products — 产品管理
- /api/categories — 分类管理
- /api/upload — 上传接口（受保护）
- /api/ai — AI 聊天与配置
- /api/feedback、/api/document-feedback — 反馈系统
- /api/visitors — 访客统计（部分接口公开）
- /api/hero-banners、/api/seo、/api/faq、/api/search 等 — 前端展示与管理
- /api/forum — Flarum 一键部署与管理接口
- /api/v1/* — 版本化的 API 路由（推荐新客户端使用）

---

## 运行与运维快速命令

开发环境：

```bash
npm run dev:all
# or
export PORT=3000
cd backend && npm run dev
```

生产构建与 PM2：

```bash
npm run build
cd backend && pm2 start dist/index.js --name your-backend
```

Docker（推荐）:

```bash
cp .env.docker.example .env
docker-compose up -d
```

一键拉取并更新（示例，取决于自更新配置）：

```bash
# 在服务器上：
cd /var/www/your-project && git stash && git pull origin main && \
  npm install && cd backend && npm install && cd .. && \
  npm run build && pm2 restart your-backend
```

---

## 运维与安全检查清单（建议）

- 确保生产环境设置 JWT_SECRET 与 SESSION_SECRET（长度 >= 32 且不是常用词）。
- 在生产环境设置 CORS_ORIGIN（只允许可信域名）。
- 使用 UPDATE_STATUS_FILE 指向可持久化路径并限制写权限。
- 用最小权限的 GitHub token（UPDATE_GITHUB_TOKEN），并通过部署系统的 secrets 注入。
- 在 CI 中为发布 artifact 生成校验和并在更新时校验。
- 配置 Sentry、日志轮转与集中日志（便于追踪 updater 异常）。

---

## 许可

本仓库公开以便学习与参考。请参阅根目录 LICENSE 文件了解许可细节。

---

<a id="中文"></a>

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="CarRadioWeb — 汽车电子知识库与产品展示平台">
</p>

<br>

## 简体中文（精简版）

CarRadioWeb 是面向汽车电子售后市场的知识库与产品展示平台，包含前台展示、文档知识库、AI 助手与后台 CMS，用于产品经理、技术支持与站点管理员。

### 主要功能

- 多语言站点（i18n）
- 产品目录与车辆兼容性矩阵
- 文档管理（富文本、视频、草稿、版本）
- AI 聊天与知识索引
- 管理后台（权限、审计日志、站点配置、轮播图等）
- 社区论坛（Flarum）集成

### 部署要点（中文）

- Node 18+, MongoDB 6+。Redis 推荐用于缓存与会话。
- 生产环境强制配置 JWT_SECRET 与 SESSION_SECRET、CORS_ORIGIN。
- 若启用自更新（SELF_UPDATE_ENABLED），请配置 UPDATE_GITHUB_TOKEN 并保证 runner 脚本在部署包中。

---

如需我代为提交一个 PR 更新 README（包含更完整的环境变量表、运维步骤与自更新安全策略），我可以直接把上面的改动提交到仓库（或者先把改动做成一个 Draft PR 供你审阅）。你希望我直接提交更新并创建 PR，还是先把 README 内容在这里再调整一次？