<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="CarRadioWeb — Automotive Electronics Knowledge Base & Product Showcase Platform">
</p>

<br>

<p align="center">
  <img src="./assets/readme/section-features.svg" width="100%" alt="Key capabilities: product catalog, knowledge base, AI assistant, admin panel, forum">
</p>

---

<p align="center">
  <strong>English</strong> · <a href="#中文">中文</a>
</p>

---

<a id="english"></a>

## Overview

**CarRadioWeb** is a modern knowledge base and product showcase platform built for automotive electronics aftermarket brands. Ship product documentation, manage vehicle compatibility, provide AI-powered customer support, and run a support forum — all from one admin panel.

Target products: car head units, CarPlay / Android Auto adapters, dash cameras, and related aftermarket electronics.

### Highlights

| Area | What you get |
|------|-------------|
| **Public site** | Multi-language (en/zh/ru), product catalog with vehicle fitment, knowledge base with search, video tutorials, AI assistant, dark/light theme |
| **Admin panel** | Document management (rich text + video), product CRUD + vehicle matrix, AI config (18+ providers), visitor analytics, RBAC, audit logs |
| **Forum** | One-click Flarum deploy via Docker, plugin install/uninstall, self-hosted extension support |
| **Compliance** | Cookie banner, legal pages (privacy/terms/disclaimer), newsletter + campaign email via SMTP |
| **SEO** | Server-side sitemap, Open Graph, JSON-LD (Organization/Product/FAQ/Breadcrumb/Article), hreflang |

### Public API (no auth)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/legal-versions/public?docType=privacy\|terms\|disclaimer` | Latest legal version |
| `GET /api/legal-versions/content/public?docType=…&locale=en\|zh` | Legal content by locale |
| `POST /api/newsletter/subscribe` | Email newsletter signup |
| `POST /api/newsletter/unsubscribe` | Body: `{ "token": "…" }` |

---

## Quick Start

### Prerequisites

- Node.js >= 18
- MongoDB >= 6
- Redis (optional — falls back to in-memory cache)

### Install

```bash
npm install
cd backend && npm install && cd ..
```

### Configure

```bash
cp .env.example .env.local
cp backend/config.env.example backend/config.env
```

Key backend variables (`backend/config.env`):

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Strong random string |
| `SESSION_SECRET` | Yes | Express session secret |
| `SMTP_HOST` / `SMTP_PORT` | For email | Mailpit locally (`127.0.0.1:1025`), real SMTP in production |
| `OSS_*` | For uploads | Alibaba Cloud OSS credentials |
| `OPENAI_API_KEY` | For AI | OpenAI / DeepSeek API key |
| `CORS_ORIGIN` | Yes | Allowed origins (comma-separated) |

Key frontend variables (`.env.local`):

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | API base path (default `/api`) |
| `VITE_SITE_URL` | Site URL for SEO structured data |
| `VITE_ENABLE_AI_ASSISTANT` | Enable AI chat (`true`/`false`) |

### Development

```bash
# Start both backend + frontend (backend first, frontend waits for port 3000)
npm run dev:all

# Or separately:
npm run dev:backend   # Backend on port 3000
npm run dev           # Frontend on port 3001
```

Vite proxy: `/api` → `localhost:3000`

### Build & Commands

```bash
npm run build         # Frontend + backend
npm run lint          # ESLint
npm run format        # Prettier
npm run type-check    # TypeScript check
npm run test:run      # Vitest
```

---

## Tech Stack

<p align="center">
  <img src="./assets/readme/section-stack.svg" width="100%" alt="Technology stack: React 19, TypeScript, Node.js, Express, MongoDB, Redis, Tailwind CSS, PrimeReact, Docker">
</p>

## Authentication

Admin login uses **email verification code + password** — no OAuth dependencies.

### First deployment

1. Visit `/admin`
2. Enter email + password
3. **The first user becomes `super_admin`** (cannot be deleted)
4. Configure SMTP after login for password reset and invitations

### SMTP

For local dev, the project includes **Mailpit** (UI at `http://127.0.0.1:8025`). No personal mailbox needed.

| Provider | SMTP Host |
|----------|-----------|
| NetEase 163 | `smtp.163.com` |
| QQ Mail | `smtp.qq.com` |
| Gmail | `smtp.gmail.com` |
| Outlook | `smtp.office365.com` |

### Roles

| Role | Access |
|------|--------|
| `super_admin` | Full access, manage other admins, view audit logs |
| `admin` | Granular permissions assigned by super_admin |

Permission strings (`backend/src/config/permissions.ts`) control page visibility (`pages:*`) and resource operations (`documents:read`, `products:update`, etc.). The API returns **403** when the JWT lacks required permissions.

---

## Deployment

### PM2

```bash
npm run build
cd backend && pm2 start dist/index.js --name your-app
```

### One-liner server update

```bash
cd /var/www/your-project && git stash && git pull origin main && \
npm install && cd backend && npm install && cd .. && \
npm run build && pm2 restart your-app
```

### Docker

```bash
cp .env.docker.example .env
docker-compose up -d
```

| Service | Image | Port |
|---------|-------|------|
| `web` | Custom | 3000 |
| `mongo` | mongo:6 | 27017 |
| `redis` | redis:7-alpine | 6379 |
| `nginx` | nginx:alpine | 80/443 |

### Forum (Flarum, optional)

One-click Docker deploy from the admin panel. Install/uninstall extensions, filter by installed status, run one-click fix (permissions + cache + boot repair), view logs. Self-hosted extensions (e.g. [Notify Push](https://github.com/Leo-ttt/Notify-Push)) installable from GitHub without Packagist.

---

## API Routes

| Route | Description |
|-------|-------------|
| `/api/auth` | Login, register, verification codes, password reset |
| `/api/users` | Admin user management (super_admin) |
| `/api/documents` | Document CRUD + search |
| `/api/products` | Product management |
| `/api/categories` | Category management |
| `/api/upload` | File upload (OSS) |
| `/api/ai` | AI chat (18+ providers) |
| `/api/feedback` | Feedback system |
| `/api/visitors` | Visitor analytics |
| `/api/site-settings` | Site configuration |
| `/api/seo-settings` | SEO configuration |
| `/api/audit-logs` | Audit logs (super_admin) |
| `/api/announcements` | Announcements |
| `/api/hero-banners` | Homepage banners |
| `/api/v1/forum/*` | Forum deploy, extensions, logs (super_admin) |
| `/sitemap.xml` | Dynamic sitemap |

## SEO

| Feature | Details |
|---------|---------|
| `robots.txt` | Blocks `/admin`, `/api` |
| `sitemap.xml` | Dynamic — all published docs + static pages |
| `hreflang` | Multi-language alternate links (en + x-default) |
| Open Graph | OG tags + default 1200×630 image |
| JSON-LD | Organization / Product / FAQ / Breadcrumb / Article |

---

## License

This repository is public for transparency and learning. **Making source code public does not grant any license** to use, copy, modify, distribute, or create derivative works without written permission from the copyright holder.

See the [`LICENSE`](LICENSE) file.

---

<a id="中文"></a>

## 概述

**CarRadioWeb** 是为汽车电子售后市场品牌打造的知识库与产品展示平台。在一个系统中管理产品文档、车辆兼容性、AI 客服和论坛支持。

适用产品：车载主机、CarPlay/Android Auto 适配器、行车记录仪等汽车电子设备。

### 核心特性

| 模块 | 说明 |
|------|------|
| **前台** | 多语言（中/英/俄）、产品目录 + 兼容性查询、知识库搜索、视频教程、AI 助手、深色/浅色主题 |
| **管理后台** | 文档管理、产品管理 + 车辆矩阵、AI 配置（18+ 供应商）、访客分析、RBAC 权限、操作日志 |
| **论坛** | 一键 Docker 部署 Flarum、插件安装/卸载、支持自研扩展 |
| **合规与营销** | Cookie 横幅、法律页面、邮件订阅 + 群发活动 |
| **SEO** | 动态 Sitemap、Open Graph、JSON-LD 结构化数据、hreflang |

### 快速开始

```bash
npm install
cd backend && npm install && cd ..
cp .env.example .env.local
cp backend/config.env.example backend/config.env
# 配置 MongoDB 等必要变量后：
npm run dev:all
```

### 部署

```bash
# Docker（推荐）
cp .env.docker.example .env
docker-compose up -d

# PM2
npm run build
cd backend && pm2 start dist/index.js --name your-app
```

---

## 技术栈

前端：**React 19 + TypeScript · Vite 7 · Tailwind 3.4 · PrimeReact 10 · Framer Motion · i18next**  
后端：**Node.js + Express · MongoDB + Mongoose · Redis · 阿里云 OSS · Sentry · Docker**

## 认证

管理后台使用 **邮箱验证码 + 密码** 登录。本地开发内置 Mailpit，无需真实邮箱。

- 首个注册用户自动成为 `super_admin`（不可删除）
- 权限细粒度控制：页面可见性 + 资源操作权限

---

<p align="center">
  <a href="https://github.com/oil-oil/beautify-github-readme">
    <img src="./assets/readme/made-with-beautify.svg" width="300" alt="README made with beautify-github-readme">
  </a>
</p>
