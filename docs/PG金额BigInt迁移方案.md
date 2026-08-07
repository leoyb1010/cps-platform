# PostgreSQL 金额列 BigInt 迁移方案

> 状态:**已定位、已给方案、需专项 PG 验证窗口**(不在常规改动里盲目落地)
> 定级:P0(商业化阻断,但仅生产 PostgreSQL 暴露)
> 作者备注:本方案给出完整改动面与可本地验证的路径,供团队排一个独立窗口执行。

## 1. 问题

分迁移(P1-B7)后,全链路金额以「整数分」为最小单位落库。`server/prisma/schema.postgres.prisma` 的金额列是 Prisma `Int`(映射 PostgreSQL `int4`,上限 2,147,483,647)。

- **单列值上限 = ¥21,474,836.47**(2,147,483,647 分 ÷ 100)。
- 单笔会员订阅金额(几十~几百元)远不会触及;**风险在累计字段**:
  - `Settlement.gross`(按品牌×账期聚合流水):大品牌单月流水破 ¥2147万即溢出。
  - `Agent.settledTotal`(累计放款,永不重置):头部代理生命周期累加迟早越界,越界后**每次放款事务溢出、永久失败**。
  - `payoutPending`、`gmvMtd`、`spendMtd` 等聚合同理。
- **为何 CI 漏网**:CI 与本地 dev 用 SQLite(INTEGER 为 64 位),撞不到 int4 上限;仅生产 PG 暴露,且是**硬报错**(事务中止),非静默。

> SQLite schema(`schema.prisma`)金额列虽是 `Int`,但 SQLite INTEGER 是 64 位,不溢出。问题**仅限 PostgreSQL**。

## 2. 根治方向

金额列(下方清单)在**两份 schema** 统一改 Prisma `BigInt`(映射 PG `int8` / SQLite 64 位 INTEGER)。

`@Max` 只能防单笔输入,**挡不住累计溢出**,因此不是替代方案(仅作为纵深防御补充,防异常大额单笔)。

### 需改的金额列(与 `server/src/common/money.ts` 的 `MONEY_FIELDS` 对齐)

| 模型 | 字段 |
|---|---|
| Settlement | gross, brandShare, platformFee, agentPayout, reserve, reversal, frozen, reconcileDiff, reserveReleased, reserveClawedBack |
| ReserveRelease | amount, releasedAmount |
| Agent | payoutPending, settledTotal, deposit, spendMtd, gmvMtd |
| Order | amount |
| GrowthContract | targetGmv, achievedGmv |
| Product | firstPrice, renewPrice, listPrice |
| BarterDeal | myQuota, counterpartyQuota |
| PayoutRequest | amount |
| （其余含金额的表按 MONEY_FIELDS 逐一核对) | mrr, finalPrice, spend, payout 等 |

> 两份 schema 必须同步改(项目红线:双 schema 模型体手工保持一致)。

## 3. 全链路适配点(关键:Prisma BigInt → JS `bigint`)

改列后,Prisma Client 会把这些字段**读为 JS `bigint`、写入需 `bigint`**。以下每处都要处理,否则运行时崩:

1. **`money.ts` 的 `money(v)`**:`new Decimal(bigint)` 不被 decimal.js 直接支持 → 改 `new Decimal(typeof v === 'bigint' ? v.toString() : v ?? 0)`。`Num` 类型加入 `bigint`。
2. **`round2/fromYuan/toYuan` 返回值**:决定统一返回 `number`(展示/中间计算)还是 `bigint`(落库)。建议:计算域保持 `number`(JS number 安全整数 2^53 ≈ ¥9万亿分,足够),**仅在写 Prisma 时 `BigInt(round2(...))` 收口**。
3. **`money.interceptor.ts` 的 `convert`**:当前 `typeof v === 'number' && MONEY_FIELDS.has(k)` → bigint 字段判断失效、金额不转元。改为 `(typeof v === 'number' || typeof v === 'bigint')`,`toYuan` 接受 bigint。
4. **JSON 序列化**:`JSON.stringify(bigint)` **抛错**。interceptor 已把 money 字段转成 number(元),但**非 money 的 bigint 字段**(若有)仍会炸 → 全局兜底 `app.getHttpAdapter().getInstance().set('json replacer', …)` 或确保所有 bigint 字段都过 interceptor。
5. **Prisma 写入 / increment / decrement**:`{ increment: rr.amount }` 中 `rr.amount` 现在是 bigint,increment 传 bigint OK;但代码里 `Math.abs(order.amount)`、`Math.min/max`、`a < b`、`a + b` 等**混用 bigint 与 number 会 TypeError** → 全仓审查 `server/src/business|cps|portal` 的金额算术,统一在读出后 `Number(x)` 转回计算域(见第 2 点策略)。
6. **`seed.ts` 的 `fenObj`**:`fromYuan` 产出 number,写 BigInt 列时 Prisma 接受 number 会警告/报错 → 收口成 `BigInt(fromYuan(...))`。

## 4. 验证方法(可本地闭环,无需 PG 环境)

关键洞察:**两份 schema 都改 BigInt 后,本地 SQLite 的 Prisma Client 同样返回 `bigint`**。因此:

1. 两份 schema 改 BigInt → `prisma generate`(SQLite)。
2. 完成第 3 节全部适配。
3. 本地跑**全部 215 后端测试 + 前端 45**:全绿即证明代码在 bigint 类型下端到端正确(资金守恒、幂等、interceptor 转换、序列化)。
4. 起 `docker-compose.pg.yml` 的 PostgreSQL,`db:push:pg` + 灌种子 + 冒烟一笔大额(> ¥2147万)聚合出账,确认不再溢出。

SQLite 不会溢出,但**类型正确性**(bigint 全链路)在本地即可证;PG 只需最后补一次"大额不溢出"冒烟。

## 5. 风险与建议

- **金额是资金核心 + 生产在线**:bigint/number 混用 TypeError 是隐蔽错误,单测可能漏边角 → 需专项窗口 + 全链路 code review + 灰度。
- **回滚**:schema 迁移不可逆(int4→int8 安全,int8→int4 若已有大值会丢失)→ 上线前在预发 PG 演练一次,备份先行。
- **工作量**:约 1–2 人日(改动集中但面广,验证是大头)。

## 6. 兜底(在完整迁移落地前的临时防线)

- 已在 DTO 层可加 `@Max`(元域,如单笔 ≤ ¥2000万 = 20亿分 < int4)防异常大额单笔;
- 但**累计字段无法靠 @Max 保护**,大品牌/头部代理仍需尽快排 BigInt 迁移窗口。
