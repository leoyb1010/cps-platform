# CPS 订阅增长交易平台 · 深度 Code Review

> 评审日期:2026-07-12 · 范围:后端(NestJS+Prisma)/ 前端(React19+Vite6)/ 工程化与基础设施 / 安全
> 方法:四个维度并行逐文件通读 + 交叉验证,所有 finding 均标注实际读到的 `文件:行号`,只收录代码中验证过的问题。

---

## ✅ 修复落地状态(2026-07-12 已实施)

本轮 review 的 finding 已分三阶段修复,全程验证通过:**后端 179 单测/e2e 全绿**(含新增 P2-B5 专项测试 2 条)、**前端 `npm run build` 通过**、**三类角色浏览器实登录 + 越权拦截 + 清结算/退款/RSA/SSRF 冒烟全过**(见 `deploy-verify` 清单)。

| 分类 | 状态 | 说明 |
|---|---|---|
| **P0-1** 退款扣分润 lost update(资损) | ✅ 已修 | `payoutPending`/`refundRate`/`creditScore`/`achievedGmv` 全改原子 `increment/decrement` + 条件 `updateMany`;新增专项测试锁死 |
| **P0-2** compose 缺 YOUDAO 密钥致 crash-loop | ✅ 已修 | compose 透传 `${YOUDAO_PLATFORM_PRIVATE_KEY:?}` + 补 README/`.env.example` |
| **P0-3** 生产 Float 存钱 | 📋 独立 PR | 经决策拆出(整数分全栈迁移 ~300 处),方案见 [`P0-3-金额精度整数分迁移方案.md`](P0-3-金额精度整数分迁移方案.md);本轮保留 ±1 元容差 |
| **P1** 后端(B1/B2/B3) | ✅ 已修 | 无结算单退款挂账归零、CPS 扣款条件更新防复活/双扣、履约累计原子化 |
| **P1** 安全(S1/S2/S3) | ✅ 已修 | 回调地址 SSRF 白名单(`url-guard.ts`,四场景实测)、去 NODE_ENV 单点(弱密钥即拒启,开发用 `ALLOW_WEAK_SECRETS=true`)、停用越权校验 |
| **P1** 前端(F1/F2/F3) | ✅ 已修 | 种子污染改空态、订单游标续拉、字体自托管 |
| **P1** 工程(E1–E5) | ✅ 已修/部分 | prisma 入 deps、/metrics 收口、上 ESLint+CI job、PG 运行时冒烟(完整断言级 PG e2e 待 harness 参数化)、分支保护需手动开 |
| **P2** 大部分(B1/B2/B4/B6/B7/B8、S1、F1–F6、E1–E12) | ✅ 已修/部分 | 状态机跃迁守卫、无原单拒退、cron 兜底、订单 ID 加长、错误边界、http 收口、镜像冒烟等 |
| **P2-B5** 退款双重扣罚 | ✅ 已修(经用户确认为 bug) | clawback 仅追偿 `payoutPending` 未扣足的缺口 `shortfall`,总回收恒等 `share`;新增两场景专项测试 |
| **P2-B2/P3** period 结构化、时区、索引等 | ✅ 部分/已修 | 索引已加两份 schema;period 结构化关联(落 `Order.settlementId`)标记待排期 |

> 需手动完成(非代码):P1-E5 GitHub main 分支保护规则(Settings→Branches)。
> 开发体验变化:安全加固后本地起后端需 `ALLOW_WEAK_SECRETS=true`(或配强密钥),已记入 `.env.example`。

---

## 0. 执行摘要

**一句话结论**:这是一套工程素养明显高于同类演示项目的全栈平台(纵深防御、恒等式建模、令牌旋转、幂等键、双 schema 零漂移都做对了),但**尚不能对真实商户开放**——存在 1 个静默资损级 P0、1 个"照文档部署起不来"的 P0,以及一批上线前必须清掉的 P1。

**四维评分**

| 维度 | 评分 | 一句话 |
|---|---|---|
| 安全 | 7.5 / 10 | 攻击面处理成熟,扣分在 SSRF、生产单开关、一处越权 |
| 后端业务逻辑 | 6 / 10 | 骨架正确,但原子增量纪律不彻底 + 状态机只有注释没守卫,有真实资损 |
| 前端 | 8 / 10 | 远高于平均;真正风险在 real 模式数据正确性 |
| 工程化/基础设施 | 6.5 / 10 | 可观测性/备份到位,但部署路径未端到端验证、质量门禁有形无实 |

**统计**:P0 × 3 · P1 × 10 · P2 × 20+ · P3 × 5

**如果只做三件事(按顺序)**
1. **修 P0-1 资损**:`agent.payoutPending` 改原子 `decrement`(退款与准备金释放并发会静默丢钱,且无对账覆盖)。
2. **修 P0-2 部署**:`docker compose` 未透传 `YOUDAO_PLATFORM_PRIVATE_KEY`,照 README 启动即 crash-loop,永远起不来。
3. **修 P0-3 存储精度**:生产 Postgres 用 `Float` 存钱,应改 `Decimal(18,2)`;当前靠 ±1 元对账容差掩盖尾差。

---

## 1. P0 —— 商业化阻断(不修不能对真实商户开放)

### P0-1 · 退款扣代理分润用"读快照-绝对量写",与准备金释放并发时静默丢钱 【资损】
- **位置**:`server/src/business/settlement.service.ts:69-83`(已现场核实 `:75` / `:81`)
- `applyAgentRefundImpact` 里 `payoutPending: Math.max(0, a.payoutPending - args.share)` 是绝对量覆盖写;而准备金释放 `reserve-release.service.ts:57` 对**同一字段**用原子 `{ increment: rr.amount }`。生产 PG 默认 READ COMMITTED、`prisma.service.ts` 未设隔离级别:退款事务读到旧快照后,若 02:07 定时释放(`scheduled-tasks.service.ts:56-77`)并发 increment,退款的绝对量写会覆盖掉释放增量——`settlement.reserveReleased` 已加、`frozen` 已减,但代理可提现池没拿到钱。守恒式只查 Settlement 侧,`agent.payoutPending` 与释放台账之间无对账,**资损完全静默**。同方法 `refundRate` 同款竞态(危害小)。
- **修复**:改 `payoutPending: { decrement: share }` + 事后 `Math.max(0)` 收口(或条件 `updateMany where payoutPending >= share`,不足显式记欠账);`refundRate`/`achievedGmv`(见 P1-3)一并改增量。

### P0-2 · 照 README `docker compose up` 生产部署无法启动
- **位置**:`docker-compose.yml:6-17` + `server/src/main.ts:24-27`
- compose 设 `NODE_ENV=production`,而 `assertSecrets()` 在生产强制 `YOUDAO_PLATFORM_PRIVATE_KEY` 为真实 RSA PEM 且做 demo 私钥哈希拒启。但 compose 的 `environment` 块**没透传该变量**(无 `env_file`),README 快速开始只字未提,两份 `.env.example` 也无此项。结果:server 启动即抛错 → `restart: unless-stopped` 无限 crash-loop → web `depends_on: service_healthy` 永远起不来。
- **修复**:compose 加 `YOUDAO_PLATFORM_PRIVATE_KEY: ${YOUDAO_PLATFORM_PRIVATE_KEY:?required}`(或 secret/文件挂载);补 README 与 `.env.example`(同时缺 `SEED_DEMO`、`EXPOSE_SWAGGER` 说明)。

### P0-3 · 生产 Postgres 用双精度浮点存钱
- **位置**:`server/prisma/schema.postgres.prisma`(Settlement 九个金额字段 `:206-228`、`Order.amount:186`、`Agent.payoutPending/settledTotal:152-154`、`ReserveRelease:372-376`),与 `schema.prisma` 逐字节一致(仅 `provider` 行不同)。
- 应用层用 decimal.js 精算后 `round2` 落库,但存储是 binary float;Prisma `increment/decrement` 在 DB 侧做浮点累加,应用层的十进制努力全部失效。高频冲账/释放/追偿累积后,恒等式 I 与守恒式 II/III/IV 必现尾差——而对账层 ±1 元容差(P2-4)正好在掩盖它。SQLite provider 不支持 `Decimal` 是双 schema 保持 Float 的原因,但不应约束生产 schema。
- **修复**:`schema.postgres.prisma` 金额字段改 `Decimal @db.Decimal(18,2)`(或全链路改整数分);接受两 schema 受控分叉,在 CI 比对模型结构而非文本。

> 说明:安全维度独立评估"无可直接利用致资损的 P0",与此处不冲突——P0-1/P0-3 是并发一致性与存储精度问题,非攻击面问题。

---

## 2. P1 —— 上线前必须修

### 后端业务逻辑

- **P1-B1 · 品牌无结算单时退款照扣分润、冲账无处落账,跨账本不守恒** — `settlement.service.ts:42` + 三处调用方(`business.controller.ts:408-412`、`:549-553`、`cps.service.ts:162-164`)。`settlement===null` 时 `share=rawShare` 不写任何结算行,但仍无条件扣 `agent.payoutPending`;封顶 `Math.min(rawShare, s.agentPayout)` 基于事务外快照,两笔并发退款可把 `agentPayout` 扣成负数。修:null 时 share 归 0 或建挂账;封顶改条件更新。
- **P1-B2 · CPS 扣款事务无状态/期数守卫,已解约单可"复活"、同期可双扣** — `cps.service.ts:79-84`(检查在事务外)、`:92-114`(事务内只判存在性,无条件写 `status:'active'`)。check 与 tx 间发生 `unsign` 会把解约单写回 active(用户解约后继续被扣);两个不同 `Idempotency-Key` 并发续扣可双计 GMV。修:`updateMany where id+status='active'+currentPeriod=period-1`,count=0 回滚;`unsign` 同样条件更新。
- **P1-B3 · 合约履约累计 `achievedGmv` 读后绝对量写,PG 并发丢 GMV** — `fulfillment.service.ts:29-32`(三入口共用,后提交者覆盖先提交者,影响达标判定与后续结算金额);`subscription.currentPeriod` 同款(`:41`),且裸浮点加法未走 money 层。修:改 `{ increment }`,达标判定回读或两段式。

### 安全

- **P1-S1 · SSRF:品牌可写任意回调地址,healthCheck 主动探测** — 写入 `portal.controller.ts:445-450`、探测 `:493`、投递 `sign-webhook.service.ts:76`。仅 `@MaxLength(300)`,无 scheme/host/IP 校验。已认证品牌方可填 `http://169.254.169.254/…`、`http://127.0.0.1:port`,healthCheck 的 `res.ok` 布尔即端口存活 oracle。修:落库校验 `https://` + DNS 解析后拒私有/保留网段;投递禁重定向/走出网代理。
- **P1-S2 · 生产安全全押在 `NODE_ENV=production` 单开关** — `main.ts:13`、`auth.controller.ts:42`、`sign-webhook.service.ts:22`、`main.ts:60`。弱密钥拦截、demo 私钥拒启、cookie `secure`、swagger 关闭全部以该变量为条件,漏设即全线失守(伪造管理员 token / 伪造回调 / 明文 cookie / `/docs` 暴露)。修:检测到弱值即拒启(不以 NODE_ENV 豁免);cookie secure 加独立 `COOKIE_SECURE` 兜底。
- **P1-S3 · 纵向越权:非 super 可停用 super/财务/风控账户** — `members/members.controller.ts:117-125`。改 `roleId` 有 super 拦截(`:119`),但改 `status`(`:125`)无任何角色/目标校验,持 `member.manage` 的 teamadmin 可锁死整个管理面。修:停用同样校验操作者与目标角色等级。

### 前端

- **P1-F1 · real 模式"种子兜底"污染跨品牌数据** — `src/lib/store.ts:326-341`。服务端返回的品牌 id 不在静态种子里时回退 `seedBrands[0]`(youdao),其 plans/channels/thresholds 原样出现在新品牌详情页;complaints 同理继承 T-5521。这是真实控制台展示错误业务数据。修:未知 id 用空结构 + "未配置"空态,不拿第一条种子顶包。
- **P1-F2 · real 模式订单只取第一页,`nextCursor` 被丢弃** — `store.ts:303-317` + `adminApi.ts:63-72`。超 200 条后订单页/退款入口/异常流只看得到最近 200 条且无提示。修:列表页直接消费游标分页端点,store 只留 dashboard 近期切片。
- **P1-F3 · Google Fonts 阻塞国内首屏** — `index.html:19-24`。`fonts.googleapis.com` 渲染阻塞资源,大陆不可达,首屏挂在字体超时上数秒白屏。修:`@fontsource` 自托管 + `font-display:swap`,或落系统字体栈。

### 工程化

- **P1-E1 · prisma CLI 是 devDependency,生产容器运行时每次冷启动从 registry 现拉 latest** — `server/package.json:53` + `Dockerfile:25`(`--omit=dev`)+ `docker-entrypoint.sh:12,25,32`。内网/离线直接启动失败;拉到与 `@prisma/client@6.2` 不匹配的新 major 时 `migrate deploy` 行为不可控。修:`prisma` 移入 dependencies 并锁同版本(exact)。
- **P1-E2 · /metrics 无鉴权且经 nginx 公网可达** — `health.controller.ts:44-50`(`@Public`)+ `nginx.conf:32`(全量反代)。泄漏内部路由延迟、`cps_refund_amount_total`、资金动作计数。修:nginx `location = /api/metrics { deny all; }`,Prometheus 从内网直连 3001。
- **P1-E3 · 全仓无 lint/format,CI 无 lint 步骤** — 两个 `package.json` 均无 eslint/prettier/biome。tsc 抓不到 floating promise / react-hooks 依赖 —— 对资金系统,未 await 的 promise 是真实风险类别。修:typescript-eslint(开 `no-floating-promises`)+ react-hooks + prettier,CI 加 lint job。
- **P1-E4 · 后端 e2e 只跑 SQLite,生产 PG 路径零测试执行** — `ci.yml:56-73`(pg job 仅 `prisma validate`)。177 条 e2e 全在 SQLite;PG 在大小写敏感、并发锁、约束报错形态上差异真实存在。修:CI 加 `services: postgres` 的 job 跑同一套 e2e。
- **P1-E5 · main 分支无保护(已 GitHub API 验证 404)** — 可直推 main、CI 红灯也能合入,5 个 job 形同建议。修:开 required status checks + 禁 force push。

---

## 3. P2 —— 上线后迭代(可排期)

### 后端(资金/状态机)
- **P2-B1** 状态机守卫缺失:`settlements/:id/reconcile`(`business.controller.ts:356-368`)任意状态强制置 cleared 并抹平 diff;手工端点普遍无跃迁矩阵(合约 `:696-704` 可 closed→active、ticket `:570` resolved→pending),而合约状态直接决定 GMV 是否继续累计。修:条件 `updateMany` + 合法跃迁表。
- **P2-B2** `applyRefundReversal` 内 status 快照回写可覆盖并发 clear 结果(`settlement.service.ts:39-56`);且按 period 中文字符串字典序取"最近一期"冲账,退款与原单账期无关联(三月单冲到七月)。修:status 单独条件更新;落 `Order.settlementId` 关联。
- **P2-B3** 工单退款无原单时凭空冲账 ¥33 且可反复触发(`business.controller.ts:20/379-387/406`,`refundedOrderId:null` 使 @unique 失效)。注释声称"不再用魔法值 33"与实现矛盾。修:无原单直接拒退。
- **P2-B4** 对账容差 ±1 元过宽(`reconciliation.service.ts:53-55`,`Math.round` 实际容忍到 1.49 元)且全表加载。修:存储改 Decimal 后收紧到 0.01;按 brandId/period 分批。
- **P2-B5** 退款对代理双重扣罚:分润回收 + 准备金追偿按同一 share 各扣一次(`business.controller.ts:408-412/549-553`、`cps.service.ts:162-164`),100 元退款代理实亏 60。修:确认业务口径;clawback 应先抵扣未扣足部分。
- **P2-B6** webhook 重投 sweep 每分钟触发无重叠防护(`scheduled-tasks.service.ts:48-53`,单批最坏 250s > 间隔),两轮取同批重复回调;`attempts` 非原子。修:进程内互斥或行级认领 `retrying→in_flight`;attempts 改 increment。
- **P2-B7** @Cron 方法无 try/catch(`scheduled-tasks.service.ts:49-93`),一次 DB 抖动即 unhandledRejection 可致进程退出;`releaseDueReserves` 幂等占位行无 TTL,中途被杀则当日释放全被 Conflict 挡住。修:每个 @Cron 包 catch + metrics;占位行加 stale 回收。
- **P2-B8** 订单主键 6 位 hex(`business.controller.ts:761/873` 等),16^6 空间 ~5 千条 50% 碰撞,撞车即 P2002 整笔失败;同文件顶部已有 10 位 `shortId()` 未被这些调用点使用。修:统一 `shortId()` 或 cuid。

### 安全
- **P2-S1** 对外 RSA 验签无 nonce,仅 ±300s 时间戳窗口,窗口内可重放(`rsa-signature.ts:38-47`);现被下游唯一约束削弱,不致双扣双退,但防线依赖下游而非签名层。
- **P2-S2** 登录用户名枚举时序侧信道 + 无账户级锁定(`auth.service.ts:45-51`,用户不存在时不执行 argon2);限流仅每 IP 10 次/分,换 IP 可绕。修:不存在时跑一次 dummy argon2 抹平时延 + 账户级失败计数。
- **P2-S3** demo RSA 私钥硬编码入库(`youdao/demo-keys.ts:14`);生产由 `main.ts:22-36` 指纹拒启(已验证有效),但非生产/漏设 NODE_ENV 会用它签回调 = 无签名保护。
- **P2-S4** 订阅超市写端点全公开(`market.controller.ts:77-88/93-106`),匿名可无限写 Bundle(仅限流兜底);金额服务端权威故无资损。

### 前端
- **P2-F1** `hydrateFromServer` 无并发去重(`store.ts:295`),慢的旧请求后到会覆盖新状态,与 60s 轮询叠加成真实窗口。修:模块级 in-flight 复用或版本号丢弃过期。
- **P2-F2** 全量订阅 + 演示态 9s 心跳 = 全树周期性重渲染 + 全量 `JSON.stringify` 落盘(`store.ts:277-288/358-360/195-201`)。修:`useStore` 加 selector 重载 + 浅比较;心跳拆独立 store。
- **P2-F3** 错误边界只有根级一层(`main.tsx:17`),任一 lazy 页崩溃卸掉侧栏/顶栏。修:Suspense 内再包一层轻量边界。
- **P2-F4** 顶栏"生产环境"徽标写死,demo 模式也显示(`AppLayout.tsx:203-206`),有误导运维风险。修:按 `API_MODE` 显示并换色。
- **P2-F5** http.ts:外部 `AbortSignal` 被归一成"请求超时";GET 强制 `Content-Type` 触发多余 preflight;GET 无重试(`http.ts:27-44`)。
- **P2-F6** 双模式模板重复:`portalApi` 40+ 方法机械重复三元(`portalApi.ts:38-113`),漏写 demo 分支运行时才暴露。修:10 行 `def(real, demoFn)` 包装器强制两分支同在。
- **P2-F7** 大列表无虚拟化(`Orders.tsx:71/206` 等),当前靠 200 条上限不炸;与 P1-F2 应一起修。
- **P2-F8** 最复杂的 hydrate 三态语义 + 种子合并(即 P1-F1 事故点)+ 401 刷新链路零测试。修:mock bizApi 写 hydrate 单测钉死 P1-F1 回归。

### 工程化
- **P2-E1** CI 从不 build 镜像(`ci.yml` 无 docker build),P0-2/P1-E1 这类回归无从发现。修:加 build + `compose up` + curl `/health` 冒烟 job。
- **P2-E2** `/ready` 永远 200,注释说"DB 不通才 503"但代码无 503 路径(`health.controller.ts:26-27`),探针无法用状态码判定。修:db down 抛 `ServiceUnavailableException`。
- **P2-E3** web 容器无健康检查、nginx 以 root 运行(`docker-compose.yml:27-34`)。修:`nginxinc/nginx-unprivileged` + healthcheck。
- **P2-E4** `index.html` 无 `no-cache`,发版后旧 index 引用消失的旧 hash 资源 → 白屏;`nginx.conf` 的 `location /assets/` 内有自己的 `add_header` 导致 server 级安全头在 /assets/ 全丢(add_header 不继承)。
- **P2-E5** compose 无日志轮转与资源限制(`docker-compose.yml`),json-file 默认无上限,pino 访问日志灌满磁盘。
- **P2-E6** 后端 tsconfig 非严格(`server/tsconfig.json:15-16` 仅 `strictNullChecks`),README 徽章"TypeScript strict"名不副实(只有前端真 strict)。
- **P2-E7** CI 类型检查开关与本地不一致(`ci.yml:21` 用 `--noUnusedLocals` 覆盖,`tsconfig.app.json:15` 为 false),本地绿 CI 红。收回 tsconfig 单一来源。
- **P2-E8** 后端 npm audit `--audit-level=critical || true` + `continue-on-error:true` 双重放行 = 纯装饰;server `vitest ^2.1.8` vs 根 `^3.2.6` 跨 major;无 dependabot/renovate。
- **P2-E9** Playwright 含条件断言静默空测(`e2e/app.spec.ts:57-64/70-76` `if(await ...count())`),UI 变更后静默通过;9 条全跑 mock,真实联调链路(nginx 反代 + cookie 轮换)无覆盖。
- **P2-E10** entrypoint 静默吞错(`docker-entrypoint.sh:12,52`):PG generate 失败 `|| true` 带 SQLite client 连 PG;bootstrap-admin 失败得到无账号却正常服务的系统。至少 PG generate 应 fail-fast。
- **P2-E11** server Dockerfile 缓存层顺序(`server/Dockerfile:6-8`),`COPY prisma` 在 `npm ci` 前,schema 改动击穿依赖缓存。
- **P2-E12** 备份脚本/runbook 质量好但零自动化验证(`server/scripts/backup-db.sh`),cron 靠人肉配、恢复演练无强制、成功与否无监控。

---

## 4. P3 —— 收录备查

- **P3-1 热查询缺索引**:`ChargeRetry(status,nextRetryAt)`、`ReserveRelease.settlementId/(status,dueAt)`、`Settlement` 按 brandId 查询用不上 `@@unique([period,brandId])` 前导。
- **P3-2 IdempotencyKey 无 TTL 无清理**(`schema.prisma:90-95`);`idempotency.service.ts:39` 把 DB 故障也当"并发输家",错误归因失真。
- **P3-3 period.ts 时区口径混用**(`common/period.ts:14-16/28`),部署非 UTC+8 机器时月末/月初订单分错桶。
- **P3-4 首扣回调时序倒置**(`cps.service.ts:74` vs `:122`),合作方先收"扣款成功"后收"签约成功"。
- **P3-5 `yuanToFen` 注释承诺的容差校验未实现**(`sign-webhook.service.ts:13-17`)。

---

## 5. 升级路线图(建议)

**第 1 周 · 止血(P0)**
1. P0-1 `payoutPending`/`achievedGmv`/`refundRate` 全改原子增量,补 `agent.payoutPending` 与释放台账的对账公式。
2. P0-2 compose 透传 `YOUDAO_PLATFORM_PRIVATE_KEY` + 补 README/`.env.example`。
3. P0-3 生产 schema 金额字段改 `Decimal(18,2)`(或整数分),对账容差随之收紧到 0.01。

**第 2–3 周 · 上线前必修(P1)**
- 后端:CPS 扣款/解约条件更新(P1-B2)、无结算单退款挂账(P1-B1)、合约累计原子化(P1-B3)。
- 安全:回调地址 SSRF 白名单(P1-S1)、去掉 NODE_ENV 单点(P1-S2)、停用越权校验(P1-S3)。
- 前端:种子污染改空态(P1-F1)、订单游标分页(P1-F2)、字体自托管(P1-F3)。
- 工程:prisma 入 deps(P1-E1)、/metrics 收口(P1-E2)、上 lint + CI lint job(P1-E3)、PG e2e(P1-E4)、开分支保护(P1-E5)。

**第 4 周起 · 加固(P2 择优)**
- 状态机守卫矩阵(P2-B1/B2)、双重扣罚口径确认(P2-B5)、@Cron 兜底(P2-B7)。
- CI 镜像冒烟(P2-E1)、`/ready` 真 503(P2-E2)、hydrate 单测(P2-F8)。
- 架构:双模式分支从页面层收进 selector/API 层,`store.ts` 906 行按域拆分(不需引状态库,保留 `useSyncExternalStore` 骨架)。

**长期**:OTel tracing + 告警规则、后端全 strict、i18n(若有出海计划)、列表虚拟化。

---

## 6. 已达标清单(有证据,勿重复投入)

- **认证**:access token 仅内存 + httpOnly refresh cookie + Web Locks 串行化令牌旋转 + 重放检测;JWT 强制 HS256、token 版本即时吊销、argon2。
- **授权**:`scope.service.ts` 默认拒绝 + 门户端点 scope-last 覆盖客户端传参;youdao 退款/解约/查询逐条拦跨品牌 IDOR;token 仅含 sub,scope/permissions 每次从 DB 重取,不可经 token 伪造。
- **注入/泄露**:全局 `whitelist+forbidNonWhitelisted+transform`,无 raw SQL(仅 `SELECT 1`),500 不泄堆栈,日志不记密码/token/密钥,无文件上传端点。
- **前端**:0 处 `dangerouslySetInnerHTML`、0 处 `any`、strict、路由级 lazy + 二级 Suspense、竞态 alive-flag、幂等键、chunk 失败自救、`prefers-reduced-motion`。
- **工程**:多阶段构建、server 非 root、seed 预编译去 ts-node、migrate deploy/db push 生产边界清晰、SQLite 卷持久化、双 schema 零漂移(已 diff 验证)、prom-client + pino + 请求 ID + 优雅停机、备份 runbook 含 RPO/RTO。
- **资金骨架**:恒等式 I + 守恒式 II/III/IV 显式建模、`Order.refundedOrderId @unique` 跨路径退款去重、幂等键绑定资源、资金写+审计同事务 fail-closed、释放行乐观锁条件更新。

---

*本报告由四个并行专项评审(安全/业务逻辑/前端/工程化)交叉核对生成,所有 P0/P1 均经位置核验。*
