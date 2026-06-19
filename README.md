# 聚联 · LINKVE — CPS 会员联运清结算平台

基于《CPS 会员联运 & 投流 SaaS 平台计划方案》落地的**多品牌、开放代理、混合资金、SaaS 化**平台。
定位：**业务层（会员联运分发）在上，投流 SaaS 底座在下**。设计语言：高级、简约、商业化（精密仪表风格），网易有道品牌红点缀 + 语义色。

本仓库是**全栈单体**：

```
cps-platform/
├── src/                前端（Vite 6 + React 19 + TS + Tailwind v4）— 16 个页面
├── server/             后端（NestJS 11 + Prisma + SQLite）— 鉴权/RBAC/审计/业务 API
├── docker-compose.yml  一键启动（web + server）
└── *.md                计划方案 v1 / 升级计划 v2·v3 / 后端方案 v4 / 商业化清单
```

---

## 一、快速开始

### 方式 A：本地双进程（已在本机验证通过）

```bash
# 1) 后端（终端 1）
cd server
npm install
npx prisma db push      # 建表
npm run seed            # 灌演示数据（5 账户/5 角色/品牌/代理/号池…）
npm run start:dev       # http://localhost:3001  · API 文档 /docs

# 2) 前端（终端 2）
cd ..
npm install
npm run dev:real        # 真实后端模式 → http://localhost:5273
# 或 npm run dev         # 纯前端演示模式（不连后端，localStorage mock）
```

登录：`admin / demo`（超管）。其它演示账户：`finance` `risk` `ops` `audit`，密码均为 `demo`。

### 方式 B：Docker 一键起（需本机装有 Docker）

```bash
docker compose up --build
# 打开 http://localhost:8080   （前端 Nginx，/api 反代到后端；首启自动建表+灌种子）
```

> ⚠️ 当前开发沙箱未安装 Docker，故 compose **未做实机构建验证**；Dockerfile / compose / nginx 配置已按标准编写并通过静态核对。在装有 Docker 的机器上 `docker compose up --build` 即可。本地双进程（方式 A）已完整跑通验证。

---

## 二、技术栈与能力

**前端**：Vite 6 · React 19 · TypeScript（strict）· Tailwind v4 · react-router 7 · lucide-react。图表为自研轻量 SVG（无图表库）。
**后端**：NestJS 11 · Prisma 6 · SQLite · argon2 · JWT（access）+ httpOnly 刷新令牌 · class-validator · pino 日志 · Swagger/OpenAPI。

**双运行模式**（前端 `VITE_API_MODE`）：
- `real` — 调真实后端：登录态/权限/审计皆服务端权威。账户菜单切角色、成员/角色矩阵、审计日志均落库。
- `mock` — 纯前端演示：localStorage + 内存 store，无需后端，便于独立预览。

接口形态两端一致 —— 切换模式 UI 无需改动。

## 三、后端 API（24 端点，详见 `/docs` 与 `server/openapi.json`）

| 域 | 端点 | 说明 |
|---|---|---|
| 鉴权 | `POST /auth/login` `POST /auth/refresh` `GET /auth/me` `POST /auth/logout` | argon2 校验 + JWT + 刷新令牌轮转 |
| RBAC | `GET /permissions` `GET /roles` `PATCH /roles/:id` `GET /members` `PATCH /members/:id` | 21 权限点 · 5 角色 · 服务端三级控制 |
| 审计 | `GET /audit-logs` | 写操作统一拦截落库，append-only，可按类别筛选 |
| 业务读 | `GET /brands /agents /merchants /orders /settlements /tickets /summary` | 受权限点保护 |
| 业务写 | `POST /settlements/:id/clear` `/reconcile` · `/tickets/:id/refund` · `/merchants/:id/state` · `/agents/:id/status` | 资金/风控动作，落审计 |
| 健康 | `GET /health` `GET /ready` | 存活/就绪探针（含 DB 连通） |

**核心联动**（服务端事务）：工单退款 → 逆向冲账（冲减代理分润）→ 代理待结算↓/信用分↓/可能限流 → 写审计。实测验证：A-4410 信用分 712→708、结算单冲账 +10、审计落 2 行。

## 四、前端模块地图（16 页）

| 路由 | 模块 | 权限点 |
|---|---|---|
| `/` 经营总览 · `/brands(/:id)` 品牌 · `/marketplace` 选品 · `/agents` 代理 | 业务 | dashboard.view / brand.* / agent.* / market.view |
| `/orders` 订单 · `/settlement` 清结算 · `/merchants` 号池 | 交易与资金 | order.* / settlement.* / merchant.* |
| `/risk` 风控 · `/complaints` 工单 · `/compliance` 合规 | 风控与合规 | risk.* / ticket.* / compliance.view |
| `/analytics` 数据归因 | 数据 | analytics.view |
| `/members` 成员与角色 · `/audit` 操作审计 · `/settings` 配置中心 | 系统后台 | member.manage / audit.read / config.write |
| `/login` 登录 | — | 公开 |

侧边栏按权限**动态隐藏**菜单与空分组；路由级 + 操作级 + 数据级三级 RBAC。

## 五、质量与测试

```bash
# 后端
cd server && npm run build && NODE_ENV=test npm test   # 7 个 e2e：鉴权/RBAC拒绝/退款联动/健康
# 前端
npm run build                                           # tsc strict + vite build
```

后端：统一错误过滤器（`{code,message}`）· DTO 校验（whitelist）· pino 结构化日志 · `/health` `/ready` 探针 · OpenAPI。

## 六、计划方案对应（关键风险内建为产品能力）

- **二清规避** → `/compliance` 双路径 + `/settlement` 双路径结算（平台不碰资金本体）
- **号池污染隔离 + 熔断** → `/merchants` 状态机 + 智能路由
- **退款拒付逆向冲账 / 账期冻结** → `/settlement` + `POST /tickets/:id/refund` 服务端联动
- **投诉率反向控投放（人在环）** → `/risk` + `/complaints`
- **个人佣金税务（灵活用工）** → `/agents` 开票方式 + `/settings`
- **账户/RBAC/审计/后台** → 真实后端 + `/members` `/audit` `/settings`

## 七、商业化就绪边界

工程层面已尽（真后端打通、可部署化、测试、可观测）。**真正"商业 100 分"仍有不可由代码替代的线下必办项**（支付/持牌分账签约、ICP/等保、法律意见、真实风控数据源、生产部署与安全审计）——详见 [商业化就绪清单](商业化就绪清单-v5.md)。
