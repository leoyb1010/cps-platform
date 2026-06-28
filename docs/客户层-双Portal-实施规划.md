# 客户层 · 双 Portal 实施规划（品牌方 + 代理商）

> 面向 `cps-platform`。在现有"内部控制台"之外，新增面向外部客户的双 portal：品牌方 portal + 代理商 portal，共用一套参数化 ClientLayout 壳。
> 本文档是工程级实施规划，不含代码改动。所有路径为仓库内绝对路径。

---

## 0. 背景与全局架构判断

### 为什么做这件事
当前 `cps-platform` 是**内部控制台**：运营/财务/风控/审计用，对客户不可见。它暴露全平台聚合数据、平台净收入、抽成比例、风控规则、所有品牌/代理的明细——这些**绝不能给外部客户看**。但品牌方、代理商作为平台的真实客户，需要自己的界面看"我的"数据。因此需要在内部控制台之外，长出第二张、第三张面孔。

### 关键事实：隔离地基已存在约 60-70%
- **身份模型已有**：`User` 表已有 `scopeType('platform'|'brand'|'agent')` + `scopeId`（指向 Brand.id/Agent.id）。种子里已有品牌方账户（U-006）、代理账户（U-007）。
- **后端数据隔离已有**：`server/src/business/business.controller.ts:131-164` 的 `scope()`/`scopeOwned()` + `DENY={id:'__scope_denied__'}` 默认拒绝语义，已覆盖 brands/agents/merchants/orders/settlements/tickets 读端点。
- **认证基建完整**：JWT access + httpOnly refresh + tokenVersion 吊销 + argon2 + 登录限流，可复用 `/auth/login`。
- **菜单已按权限过滤**：`nav.ts` NavItem 带 `perm`，Sidebar 按 `can(perm)` 过滤，空组自动隐藏。
- **已有客户视角雏形**：`Marketplace.tsx` 已是代理视角，有"我的投放计划"第一人称。

### 四个全局架构判断（后续所有阶段围绕它们）

| 判断 | 选择 | 理由 |
|---|---|---|
| **A 工程边界** | 单 SPA、单部署、HashRouter 不动。Portal 走 `/#/portal/brand/*`、`/#/portal/agent/*` | 真正的安全边界在后端 ScopeGuard，不在前端工程边界。拆工程只会复制已调好的鉴权-刷新-镜像机制 |
| **B 权限单一源** | 权限点/角色定义下沉到后端，前端编译期消费 | 现状前后端两份手抄，新增客户角色会抄错，借机消灭漂移 |
| **C 隔离优先** | 声明式 ScopeGuard 是阶段 0 核心，先于一切 portal 工作 | 审计/summary 端点现在根本没接 scope，写端点不校验归属——客户上线即真实越权 |
| **D 真实 API only** | 客户 portal 默认走真实 API，演示态(mock)只给内部控制台 | mock 态 store 是全平台 seed，客户复用 = 把别家数据明文发给客户浏览器 |

---

## 1. 角色与权限模型

### 1.1 为什么品牌方绝不能复用 `ops`
`ops` 持有 `brand.read/write, agent.read/write, market.view, analytics.view...`。即便 scope 把数据收窄到自己品牌，**菜单可见性按权限点算，不按 scope 算**——品牌方会看到"代理商""选品市场""数据归因"等不该有的入口。**品牌方需要的是一个功能集更小的角色，不是一个数据被收窄的全功能角色。**

### 1.2 新增两个客户角色 + 客户专属权限点
**决策：新增客户专属权限点，而非复用内部权限点**——让"客户能打哪些端点"在路由表上一眼可见，且 ScopeGuard 可强约束"带客户权限点的端点必须声明 `@ScopeBy`"。

新增权限点（`group: '客户门户'`）：

| 品牌方 | 代理商 |
|---|---|
| `portal.brand.home` 首页 | `portal.agent.home` 首页 |
| `portal.brand.orders` 我的订单 | `portal.agent.market` 选品市场 |
| `portal.brand.settlement` 我的结算单(脱敏) | `portal.agent.plans` 我的投放计划 |
| `portal.brand.onboarding` 我的入驻 | `portal.agent.payouts` 我的分润 |
| `portal.brand.tickets` 我的工单 | `portal.agent.credit` 我的信用分 |
| `portal.brand.contracts` 我的增长合约 | `portal.agent.contracts` 我的接单 |
| `portal.brand.barter` 资源置换 | |

两个新角色：`brand` = 7 个品牌权限点；`agent` = 6 个代理权限点。**完全不持有任何内部权限点**——即便客户伪造前端路由进内部页，拉数端点（标内部权限点）会被 PermsGuard 直接 403（第二道纵深防御）。

### 1.3 前后端两份角色定义的同步（把"单一可信源"做掉）
- **方案甲（推荐）**：新建 `server/src/rbac/permissions.shared.ts` 为唯一源 + `npm run gen:perms` 生成 `src/lib/perms.generated.ts`，CI 加 `--check` 比对（类似已有 `check-schema-sync.sh`）。
- **方案乙（工期紧时先用）**：承认前端本地 ROLES 只服务 mock 态，真实态完全以后端下发的 `user.permissions` 为准（`permsOf` 已优先用它）。
- **推荐：阶段 0 先用乙保证安全，方案甲作为阶段 1 收尾。**

---

## 2. 数据隔离加固（安全优先 · 阶段 0 必须全做完）

### 2.1 声明式 ScopeGuard + `@ScopeBy` 装饰器
把逐端点手写的 `this.scope(user,...)` 变成"端点上声明一次，Guard 统一执行，漏声明即默认拒绝"。

新增 `server/src/rbac/scope.ts`（装饰器）+ `scope.guard.ts`（Guard）。Guard 链顺序：
```
ThrottlerGuard → AuthGuard(注入 req.user) → PermsGuard(校验权限点) → ScopeGuard(算 req.scope.where)
```
**关键语义**：端点未声明 `@ScopeBy` 时，platform 用户放行（`where={}`），**非 platform 用户硬拒绝**——让"新端点忘了加 scope"对客户默认不可达，而非默认全放。platform 用户全程 `where={}` 透传，零行为变化（保护现有 55 测试）。

迁移策略：6 个已 scope 读端点（brands/agents/merchants/orders/settlements/tickets）从手写改为 `@ScopeBy + @Scoped`，行为完全等价，改完删除私有 `scope()`/`scopeOwned()`。

### 2.2-2.5 堵 4 个真实越权漏洞

| # | 漏洞 | 改法 |
|---|---|---|
| 1 | **审计端点无 scope**（`audit.controller.ts:14` 品牌方审计账户可见全平台流水） | 客户角色不给 `audit.read` + 审计端点对非 platform 用户 `@ScopeBy` 硬约束 DENY（纵深防御，不依赖"记得不给权限"） |
| 2 | **summary 端点无 scope**（`business.controller.ts:204` 品牌方可见全平台聚合） | 内部 `/summary` 维持 `dashboard.view`（客户不持有）；新建 `/portal/summary` scoped + 只聚合客户该看口径 |
| 3 | **写端点不校验归属**（setBrandConfig/refundOrder 不验证目标 brandId === scopeId） | 新增 `@ScopeOwns` 装饰器，Guard 预取目标行断言归属；platform 用户跳过。先给内部写端点加防御，客户写端点上线时强制带 |
| 4 | **scopeId 无外键约束** | 应用层校验（建号时校验存在 + 登录 `toAuthUser` 校验仍指向存活对象，失活拒登）。**不加 DB 外键**（多态 scopeId 无法建真外键，改 schema 触发双写风险） |

---

## 3. 客户身份与开户流程

### 3.1 三种建号路径
| 路径 | 适用 | 工程量 |
|---|---|---|
| 内部邀请制（运营建号） | 阶段 1-3 起步（最快最安全） | 小 |
| 入驻审核通过自动建号 | 阶段 5 | 大 |
| 自助注册 | 阶段 5（最后，配合审核+限流） | 大 |

**推荐：阶段 1 用内部邀请制，阶段 5 才做自助。** 自助注册引入"陌生人建号"攻击面，放最后。

### 3.2 内部邀请制建号（阶段 1）
新增 `POST /members`（标 `member.manage`，仅 super）：入参 `{name, account, roleId, scopeType, scopeId}`。**关键校验**：scopeId 必须存在于对应表；客户角色强制 scopeType 匹配（防建出"brand 角色却 platform scope"的越权号）。生成随机临时密码（argon2），不明文回传。落审计。

### 3.3 客户登录入口
新建 `src/pages/PortalLogin.tsx`，路由 `/#/portal/login`。共用 `login()` 打同一 `/auth/login`，但：不渲染 DEMO_USERS（不泄漏内部账户）、文案可定制、登录后按 scopeType 分流（brand→`/portal/brand`，agent→`/portal/agent`，platform→`/`）。内部 `/login` 保持不动（e2e 依赖）。

### 3.4 种子账户调整
U-006 `ops`→`brand`，U-007 `ops`→`agent`；U-008 brandaudit 保留为 platform 内部夹具（或靠审计端点 ScopeBy 兜底）。会影响现有 e2e scope 断言，需同步改测试（§8.2）。

---

## 4. 前端架构：双 Portal 外壳 + 路由

### 4.1 ClientLayout（全新，不改 AppLayout）
**取舍：全新 ClientLayout，不重构 AppLayout。** AppLayout 耦合命令面板/演示角色切换/视图模式/内部 NAV，客户都不该有；参数化到能同时服务内外会长出十几个 `if(isClient)` 分支，既危险（破内部 e2e）又难读。复用在更细粒度做——抽取 Sidebar 渲染骨架/Topbar 到 `src/components/layout/shell/` 无业务 primitives。

```ts
interface ClientLayoutProps {
  branding: { logo: string; name: string; sub: string }
  navConfig: NavGroup[]   // BRAND_NAV 或 AGENT_NAV
}
```
去掉：模式切换、演示角色切换、命令面板、"生产环境"徽标。保留：Sidebar 按 perm 过滤 + 空组隐藏、退出登录。

### 4.2 客户 nav 配置
新建 `src/components/layout/portalNav.ts`，导出 `BRAND_NAV`（我的经营/订单/结算单/入驻/工单/增长合约/资源置换）与 `AGENT_NAV`（我的投放/选品市场/投放计划/分润/信用分/接单）。

### 4.3 路由结构与守卫升级
```
/portal/login                  → PortalLogin(公开)
/portal/brand/*  → RequireScope('brand')    → ClientLayout(BRAND_NAV) → 品牌页
/portal/agent/*  → RequireScope('agent')    → ClientLayout(AGENT_NAV) → 代理页
/login           → Login(内部,不动)
/*               → RequireScope('platform') → AppLayout(内部,不动)
```
`RequireAuth` 升级为 `RequireScope`：未登录按区分流到正确登录页；越区访问弹回自己的家区。HashRouter 下 `loc.pathname` 不含 `#`，`startsWith('/portal')` 成立。

### 4.4 前端数据层（关键安全决策）
**客户 portal 不复用全局 `store.ts`，改用 per-page `useApi` 直打 scoped 端点 + 真实 API only。**
- 数据只来自后端 scoped 响应，不进全局 store——杜绝"全局可见 + seed 兜底泄漏"。
- mock 态 `useApi` 返回 `fallback=null`，UI 显示"演示态不可用，请连接真实后端"。
- 复用 `cps-auth-v1`（同一 session store），**不复用 `cps-store-v2`**。

---

## 5. 页面矩阵（两套 Portal）

### 5.1 品牌方 Portal
| 页面 | 路由 | 数据来源 | 与内部页差异（去掉什么） | 复用/新建 |
|---|---|---|---|---|
| 我的经营 | `/portal/brand` | 新 `/portal/summary` scoped | 只显示我的 GMV/活跃订阅/续费率/投诉率/待处理工单。**去掉**平台净收入、跨品牌对比、抽成、号池熔断 | 新建 BrandHome |
| 我的订单 | `/portal/brand/orders` | `/orders`（scopeOwned→brandId） | 只见自己。**去掉** agentId 明文、mid | 复用表格组件 |
| 我的结算单(脱敏) | `/portal/brand/settlement` | 新 `/portal/brand/settlements`（字段裁剪） | **最敏感页**。只显示 gross/brandShare/reserve/状态/账期。**绝对去掉** platformFee/agentPayout/抽成/占池瀑布 | **必须新建** BrandSettlement |
| 我的入驻 | `/portal/brand/onboarding` | `/brands`（scoped→自己一条） | 只见自己入驻进度+配置。**去掉**其他品牌、完整 mid | 新建 BrandOnboarding |
| 我的工单 | `/portal/brand/tickets` | `/tickets`（scopeOwned→brandId） | 只读自己工单。**不给** ticket.handle | 复用表格，只读壳 |
| 我的增长合约 | `/portal/brand/contracts` | 新 `/portal/contracts`（scoped→brandId=我发的单） | 只见我发起的合约。**去掉**别家合约 | 复用 Drawer/列 |
| 资源置换 | `/portal/brand/barter` | 新表+新端点 | 对手是真实 Brand。**当前后端无 Barter 模型** | 新建表+页（阶段 4） |

### 5.2 代理商 Portal
| 页面 | 路由 | 数据来源 | 与内部页差异 | 复用/新建 |
|---|---|---|---|---|
| 我的投放 | `/portal/agent` | 新 `/portal/summary` scoped→agentId | 只显示我的消耗/首单/待结分润/信用分/接单数 | 新建 AgentHome |
| 选品市场 | `/portal/agent/market` | 新 `/portal/market/brands`（公开 live 目录脱敏） | 复用 Marketplace。`addClaim` 的 agentId 硬编码 'A-2041' → **改取 user.scopeId** | **复用 Marketplace** |
| 我的投放计划 | `/portal/agent/plans` | 新 `/portal/agent/claims`（scoped→agentId） | 后端 scoped claims（需 claims 持久化） | 新建页+表 |
| 我的分润 | `/portal/agent/payouts` | `/agents`（scoped→自己）+ reserve-releases | 只见自己分润/待提现/准备金释放。**去掉**别家代理、处置按钮 | 新建 AgentPayouts |
| 我的信用分 | `/portal/agent/credit` | `/agents`（scoped→自己 creditScore） | 只见自己信用分+变动原因。**绝对去掉**风控规则全文（暴露即被规避） | 新建 AgentCredit |
| 我的接单 | `/portal/agent/contracts` | 新 `/portal/contracts`（scoped→agentId=我接的单） | 只见我接的合约。可接挂单态（`@ScopeOwns`） | 复用组件 |

> **代理选品市场 scope 调整**：当前 `scope(agent,'id-brand')` 对 agent 返回 DENY。但选品市场不是 scope-owned 资源，是"对所有代理公开的 live 品牌目录"。新建 `/portal/market/brands` **不按 scope 收窄**，返回 live 品牌脱敏目录（只含投放字段，**不含** gmvMtd/activeSubs）。

### 5.3 复用矩阵
- **纯展示组件可参数化复用**：primitives（Card/Table/Badge/Stat/PageHeader）、charts、Contracts 的 Drawer/列、Orders/Complaints 表格行。
- **必须全新建**（敏感口径或 store 耦合）：BrandSettlement（脱敏）、所有 *Home（scoped 聚合）、AgentCredit（去规则全文）、BrandOnboarding。
- **Marketplace 直接复用**（已是代理视角），仅改 addClaim 的 agentId 来源 + 走真实 API。

---

## 6. 后端端点缺口

### 6.1 可复用（已有 scope）
`/orders`、`/tickets`、`/settlements`、`/agents`、`/brands`。给 `@RequirePerms` **追加**客户权限点（PermsGuard 任一满足即放行）；需字段裁剪的（品牌脱敏结算）则新建端点。

### 6.2 必须新增
| 端点 | 权限点 | scope |
|---|---|---|
| `GET /portal/summary` | portal.brand.home / portal.agent.home | `@ScopeBy('owned')` |
| `GET /portal/brand/settlements` | portal.brand.settlement | scoped + 字段白名单 |
| `GET /portal/market/brands` | portal.agent.market | 不收窄（公开 live 目录） |
| `GET /portal/agent/claims` | portal.agent.plans | scoped agentId |
| `GET /portal/contracts` | portal.brand.contracts / portal.agent.contracts | scoped(品牌→brandId, 代理→agentId) |
| `POST /portal/contracts/:id/claim` | portal.agent.contracts | `@ScopeOwns` + 条件更新防并发 |
| `POST /members` | member.manage(super) | — |

### 6.3 数据模型补充
- **GrowthContract 已建表**，单方视图直接 scoped 查询，代理接单 = 更新 `agentId:null` 的 open 合约。无需改 schema。
- **Barter 当前无表**，需新增 `BarterDeal`（initiatorBrandId/counterpartyBrandId/status/quota/terms）。**必须双 schema 同步**。scope 需支持 OR 语义（"我发起或待我确认"）。放阶段 4（最复杂）。

---

## 7. 分阶段交付计划

> 依赖：阶段 0 是所有后续前提。阶段 1 是 2/3 前提。阶段 2/3 可并行。

### 阶段 0 · 安全加固（地基，必须先行，可独立交付）
- **做什么**：ScopeGuard + `@ScopeBy`/`@ScopeOwns`；6 读端点迁移到声明式（行为等价）；堵 4 漏洞。
- **改哪些**：新建 `scope.ts`/`scope.guard.ts`；改 `app.module.ts`/`business.controller.ts`/`audit.controller.ts`/`auth.service.ts`。
- **验证**：现有 55 测试全绿（platform 零变化）+ 新增 scope 隔离测试。
- **风险**：Guard 链顺序错会收窄 platform → 先写"platform 全透传"测试。

### 阶段 1 · 客户角色 + 登录分流（依赖 0，可独立交付）
- **做什么**：brand/agent 角色 + 客户权限点；种子 U-006/007 改角色；`POST /members` 建号；PortalLogin + RequireScope 守卫 + portal 路由骨架（内容先空壳）。
- **改哪些**：`permissions.ts`/`auth.ts`/`members.controller.ts`；新建 `PortalLogin.tsx`；改 `App.tsx`；新建 `ClientLayout.tsx` 骨架。
- **验证**：客户登录按 scopeType 落对应 portal；越区弹回；内部 e2e 不破。
- **风险**：改 U-006/007 角色破现有 scope 断言 → 同步改测试。客户权限点**不进** super 的 ALL（否则破 25 perms 断言）。

### 阶段 2 · 品牌 Portal 最小链路（依赖 1，可独立交付）
- **做什么**：品牌首页 + 我的订单 + 我的工单(只读) + 我的入驻 + 脱敏结算。
- **改哪些**：新建 BrandHome/BrandSettlement/BrandOnboarding + 复用表格页壳；`business.controller.ts` 加 `/portal/summary`、`/portal/brand/settlements`；portalNav。
- **验证**：品牌 A 只见自己；结算页无 platformFee/抽成（DOM 断言）；品牌 B 拿不到。
- **风险**：脱敏结算复用内部组件易漏字段 → 强制新建页 + 字段白名单。

### 阶段 3 · 代理 Portal（依赖 1，与阶段 2 并行）
- **做什么**：代理首页 + 选品市场(复用) + 投放计划 + 分润 + 信用分 + 接单(读)。
- **改哪些**：复用并改 Marketplace（agentId 取 scopeId）；`store.ts:699` addClaim；新建 AgentHome/AgentPayouts/AgentCredit；后端 `/portal/market/brands`、`/portal/agent/claims`（新 AdClaim 表，双 schema 同步）。
- **验证**：代理看 live 目录（无经营数据列）；信用分页无规则全文；代理 B 拿不到 A 的数据。
- **风险**：claims 新表 → 双 schema 同步。选品目录 scope 语义（公开 vs owned）要测准。

### 阶段 4 · 合约/置换双边（依赖 1，合约部分依赖 2/3）
- **做什么**：单方合约视图 + 代理接单端点（`@ScopeOwns`+条件更新）；Barter 新表 + scope OR 语义 + 品牌置换页。
- **改哪些**：后端 `/portal/contracts`、`/portal/contracts/:id/claim`；`schema.prisma` + `schema.postgres.prisma`（+BarterDeal，逐字节）；`seed.ts`；`scope.ts`（buildWhere 支持 OR）；新建 BrandBarter + 合约 scoped 页壳。
- **验证**：代理只能接 open 合约且并发安全；品牌只见涉及自己的置换；`check-schema-sync.sh` 通过。
- **风险**：scope OR + 新表 + 双 schema，最高。单独成 PR。

### 阶段 5 · 自助开户/入驻审核自动建号（依赖 1）
- **做什么**：入驻审核流（申请→内部审核→自动建 Brand/Agent + User + scope 绑定）；可选自助注册。把 mock pendingAgents/approveAgent 落到后端真实表。
- **改哪些**：新增 PendingApplication 表（双 schema）；审核端点；建号复用 §3.2。
- **验证**：审核通过自动建出 scope 正确的客户账户；scopeId 校验生效。
- **风险**：引入陌生人建号攻击面 → 放最后，配合审核 + 限流。

---

## 8. 风险与测试

### 8.1 不破红线
- **结算恒等式** `gross = brandShare+reserve+platformFee+agentPayout+reversal`：本规划**不碰任何结算/退款/释放 service**。客户 portal 全是读+脱敏展示，脱敏在序列化层裁字段，不改金额计算。恒等式测试零影响。
- **双 schema 同步**：阶段 3/4/5 新表必须两份同步 + `check-schema-sync.sh`。阶段 0/1/2 不改 schema（scopeId 用应用层校验）。
- **localStorage key**：复用 `cps-auth-v1`，不复用 `cps-store-v2`，不新增冲突 key。
- **现有 55/21/6 测试**：platform 用户行为在阶段 0 后零变化（ScopeGuard 对 platform 透传）。唯一需主动改的是因 U-006/007/008 角色调整 + 客户权限点引入的断言。

### 8.2 新增/调整测试
**新增 scope 隔离测试**：① 品牌 A 拿不到品牌 B 数据 ② 客户角色打内部端点（summary/audit/members/config）全 403 ③ 写端归属校验（品牌 A 改品牌 B config → 403）④ 审计端点对非 platform DENY ⑤ summary 脱敏（响应不含 platformFee 等键）⑥ 代理接单并发（只有一个成功）⑦ 选品目录不含 gmvMtd/activeSubs。
**调整现有**：U-006/007/008 角色变更后的 scope 断言；前端 super 权限点数断言（客户权限点不进 ALL 则不变）。
**前端 e2e 新增**：客户登录落对应 portal；越区跳转；portal mock 态显示"演示态不可用"。

### 8.3 演示态处理
**客户 portal 不给 mock 全量态**。`VITE_API_MODE!=='real'` 时 portal 路由可访问但业务数据区显示"演示态不可用——客户门户需连接真实后端（数据按账户隔离，演示态无法保证隔离）"。内部控制台 mock 态保持不变。

### 8.4 上线前安全门禁（阶段 2/3 上线前必须全绿）
① 阶段 0 ScopeGuard 已合入 ② §8.2 的 1-7 全过 ③ 客户角色不含任何内部权限点（单测断言）④ 脱敏端点字段白名单单测 ⑤ `check-schema-sync.sh` 通过 ⑥ 现有 55/21/6 测试绿。

---

## 关键取舍速查

| 决策点 | 选择 | 理由 |
|---|---|---|
| 工程边界 | 单 SPA，不拆前端工程 | 安全边界在后端 ScopeGuard，拆工程只复制鉴权机制 |
| ClientLayout | 全新，不改 AppLayout | 客户要去掉的比保留的多，继承会长出大量 if 分支破内部 e2e |
| 客户数据层 | useApi 直打 scoped 端点，真实 API only | 全局 store + mock 全量态 = 跨租户泄漏 |
| 客户权限点 | 新增专属点，不复用内部点 | 内部点扩大攻击面 + 端点归属不清 |
| scope 统一 | 声明式 ScopeGuard，未声明对非 platform 默认拒 | 消灭"新端点忘加 scope"的默认全放风险 |
| scopeId 约束 | 应用层校验，不加 DB 外键 | 多态 scopeId 无法建真外键；改 schema 触发双写 |
| 脱敏结算 | 新建页 + 端点字段白名单 | 内部页含 platformFee/抽成/占池瀑布，复用必漏 |
| 建号 | 阶段 1 邀请制，阶段 5 才自助 | 自助引入陌生人建号攻击面，放最后 |

---

## 关键文件（实施落点）
- `server/src/business/business.controller.ts` — scope 现状 + 6 待迁移读端点 + 待加归属的写端点 + 漏 scope 的 summary；ScopeGuard 改造与 `/portal/*` 新端点主战场
- `server/src/rbac/permissions.ts` — 权限点字典 + ROLE_PRESETS + SEED_USERS；新增 brand/agent 角色与客户权限点、改 U-006/007/008 的唯一源
- `src/App.tsx` — RequireAuth → RequireScope + portal 三段分流入口
- `src/components/layout/AppLayout.tsx` — 内部外壳；新建 ClientLayout 时复用 Sidebar 过滤骨架的抽取源
- `src/lib/store.ts` — 全局 store + hydrateFromServer + addClaim 硬编码 agentId；客户数据层隔离决策与 Marketplace agentId 修正点
- `server/test/app.e2e-spec.ts` — 现有 scope/RBAC 测试夹具；新增隔离测试与调整 U-006/007/008 断言的落点
