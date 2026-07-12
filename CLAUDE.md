# CLAUDE.md

## 项目定位
CPS 分销/结算平台（网易有道 CPS）。**已正式上线，生产使用中。**

## 技术栈与结构
- 前端：React 19 + TypeScript + Vite 6 + Tailwind 4 + react-router-dom 7，代码在 `src/`（路由入口 `src/App.tsx`，路由级 lazy 拆包）
- 后端：NestJS 11 + Prisma 6，代码在 `server/`（独立 package.json）
- 数据库：本地默认 SQLite（`server/prisma/schema.prisma`），生产 PostgreSQL（`server/prisma/schema.postgres.prisma`）。**双 schema 模型体必须手工保持同步**（Prisma 不允许 provider 用 env()）
- 前端 API 模式：`VITE_API_MODE`，默认 `mock`（纯前端演示数据，见 `src/lib/auth.ts` DEMO_USERS）；`real` 调后端（默认 `http://localhost:3001`，可用 `VITE_API_BASE` 覆盖）
- 部署：Docker（根目录与 server/ 各有 Dockerfile，docker-compose.yml / docker-compose.pg.yml，nginx.conf）

## 常用命令
前端（仓库根）：
- `npm run dev` — mock 模式开发；`npm run dev:real` — 连真后端
- `npm run build` — tsc -b + vite build
- `npm test` — vitest；`npm run test:e2e` — Playwright（自动起 dev 服务器，baseURL localhost:5273）

后端（`cd server`）：
- `npm run start:dev` — NestJS watch 模式
- `npm run prisma:generate` / `prisma:push` / `prisma:migrate`（SQLite）；PG 用 `generate:pg` / `db:push:pg` / `migrate:pg`
- `npm run seed` — 灌演示数据（生产环境拒绝执行，除非 SEED_DEMO=true；生产建管理员用 `npm run bootstrap:admin`）
- `npm test` — vitest；`npm run test:e2e`

## 三类用户入口
| 角色 | 登录页 | 登录后首页 | scope |
|---|---|---|---|
| 平台管理员 | `/login` | `/`（根仪表盘） | platform |
| 品牌方 | `/portal/login` | `/portal/brand/*` | brand，scopeId=youdao |
| 代理商 | `/portal/login` | `/portal/agent/*` | agent，scopeId 如 A-2041 |

- `RequireScope`（src/App.tsx）按 scopeType 做路由保护：越区弹回自己的家区，未知 scopeType 一律送回登录页（防死循环）
- `homeForScope()`（src/pages/PortalLogin.tsx）决定登录后默认首页
- seed 测试账号（密码均为 `demo`）：平台 admin / finance / risk / ops / audit / teamadmin；品牌 brand / brandaudit；代理 agent

## 红线（必须遵守）
**本项目生产在线使用中。任何改动必须做全量验证后才算完成：**
1. 三类角色分别登录（平台 /login、品牌与代理 /portal/login），确认各自落到正确首页且越区被拦
2. 核心流程冒烟（订单、结算、合约等被改动波及的页面实际点开验证）
3. **禁止只跑单测就宣布完工**；构建（`npm run build`）必须通过

## 已知坑
- SQLite 与 PostgreSQL 双 schema：改模型必须同步改 `schema.prisma` 和 `schema.postgres.prisma` 两份
- 前端默认 mock 模式：改后端后在 mock 模式下看不到效果，必须用 `dev:real` 验证前后端联调
- 前端 mock 数据（src/lib/auth.ts 等）与后端 seed 数据（server/src/rbac/permissions.ts、server/prisma/seed.ts）是两套，改账号/角色时两边都要看
- 用户 `mustChangePassword`、`tokenVersion` 参与登录流程，动 auth 相关必须实测登录/登出
- `server/prisma/` 下有多个 .db 测试库文件，勿误删 `prod.db` / `dev.db`
