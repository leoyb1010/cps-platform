import { Body, Controller, Delete, ForbiddenException, Get, Headers, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger'
import { IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma.service'
import { AuditService } from '../audit/audit.service'
import { IdempotencyService } from '../common/idempotency.service'
import { MetricsService } from '../common/metrics.service'
import { ReconciliationService } from './reconciliation.service'
import { SettlementService } from './settlement.service'
import { SettlementRunService } from './settlement-run.service'
import { ReserveReleaseService } from './reserve-release.service'
import { FulfillmentService } from './fulfillment.service'
import { RequirePerms, CurrentUser, type AuthUser } from '../rbac/rbac'
import { splitProportional, sum, fromYuan, toYuan } from '../common/money'
import { ScopeService } from './scope.service'

// 防碰撞 ID：randomUUID 短码，避免 Date.now() 同毫秒生成相同主键 → 事务内 P2002
const shortId = () => randomUUID().replace(/-/g, '').slice(0, 10)
// 无分页引用型列表的防御性上限：管理端小表够用，防单请求全表拖库（订单/套餐/通知已各自分页）
const LIST_CAP = 1000
// 商户号脱敏：保留前 2 后 2，中间打码
const maskMid = (mid: string) => (mid && mid.length > 4 ? `${mid.slice(0, 2)}****${mid.slice(-2)}` : '****')

class StateDto {
  // 与前端 MerchantState 五态一致（含 watch=整改警告），避免真实模式镜像 watch 被 400 拒绝
  @IsIn(['healthy', 'watch', 'throttled', 'paused', 'fused']) state!: string
  @IsOptional() @IsString() @MaxLength(40) label?: string
}
class AgentStatusDto {
  @IsIn(['active', 'throttled', 'frozen']) status!: string
}
class BrandStatusDto {
  @IsIn(['live', 'review', 'paused']) status!: string
  @IsOptional() @IsString() @MaxLength(40) label?: string
}
class BrandConfigDto {
  @IsOptional() @IsNumber() @Min(0) @Max(100) feeRate?: number
  @IsOptional() @IsInt() @Min(1) @Max(365) period?: number
  @IsOptional() @IsInt() @Min(0) @Max(100) reservePct?: number
  @IsOptional() @IsIn(['direct', 'licensed', 'mixed']) path?: string
}
// 订单列表筛选（全 @IsOptional 向后兼容；createdAt 真实日期区间）
class OrderQueryDto {
  @IsOptional() @IsString() cursor?: string
  @IsOptional() @IsString() limit?: string
  @IsOptional() @IsIn(['first', 'renew', 'refund', 'chargeback']) type?: string
  @IsOptional() @IsString() @MaxLength(40) brandId?: string
  @IsOptional() @IsString() @MaxLength(40) agentId?: string
  @IsOptional() @IsISO8601() dateFrom?: string
  @IsOptional() @IsISO8601() dateTo?: string
}
// 结算列表筛选（period 是自由字符串，按 YYYY-MM 前缀分桶降级）
class SettlementQueryDto {
  @IsOptional() @IsString() @MaxLength(20) period?: string
  @IsOptional() @IsArray() @IsString({ each: true }) periods?: string[]
  @IsOptional() @IsIn(['pending', 'cleared', 'reconciling', 'reversed']) status?: string
  @IsOptional() @IsString() @MaxLength(40) brandId?: string
}
// 结算跑批入参：账期标签（落库到 settlement.period）+ 订单聚合时间区间 [from, to)
class SettlementRunDto {
  @IsString() @MaxLength(40) period!: string
  @IsISO8601() from!: string
  @IsISO8601() to!: string
}
// 提现申请驳回入参：审批备注（可选）
class PayoutRejectDto {
  @IsOptional() @IsString() @MaxLength(200) reviewNote?: string
}
class NewBrandDto {
  @IsString() @MaxLength(60) name!: string
  @IsString() @MaxLength(40) category!: string
  @IsNumber() @Min(0) @Max(100) feeRate!: number
  @IsInt() @Min(1) @Max(365) period!: number
  @IsInt() @Min(0) @Max(100) reservePct!: number
  @IsIn(['direct', 'licensed', 'mixed']) path!: string
}
class NewMerchantDto {
  @IsString() @MaxLength(40) brandId!: string
  @IsIn(['wechat', 'alipay', 'bank']) channel!: string
  @IsInt() @Min(0) @Max(100) weight!: number
}
class TicketUpdateDto {
  @IsOptional() @IsIn(['pending', 'processing', 'resolved', 'escalated', 'arbitration']) status?: string
  @IsOptional() @IsString() @MaxLength(40) owner?: string
  @IsOptional() @IsString() @MaxLength(120) note?: string
  // 升级流转要落级别（normal→escalated→regulatory），否则前端"升级为监管投诉"只活在本地、下次水合被冲掉
  @IsOptional() @IsIn(['normal', 'escalated', 'regulatory']) level?: string
}
class ReserveFreezeDto {
  @IsOptional() @IsString() @MaxLength(120) reason?: string
}
class ProductReviewDto {
  @IsIn(['approve', 'reject']) action!: string
  @IsOptional() @IsString() @MaxLength(200) note?: string
}
class OrderIngestDto {
  @IsString() @MaxLength(40) brandId!: string
  @IsString() @MaxLength(40) agentId!: string
  @IsOptional() @IsString() @MaxLength(40) productId?: string
  @IsIn(['first', 'renew']) type!: string
  @IsNumber() @Min(0.01) amount!: number
  @IsString() @MaxLength(60) plan!: string
  @IsOptional() @IsIn(['wechat', 'alipay', 'bank']) channel?: string
}
class BundleRuleDto {
  @IsString() @MaxLength(60) name!: string
  @IsIn(['count_off', 'combo_fixed']) kind!: string
  @IsOptional() params?: Record<string, unknown>
  @IsOptional() active?: boolean
}
// 外部投诉接入：支付宝 / 12315 / 黑猫 / 微信等平台的工单数据。
// 镜像 OrderIngestDto 的"可信中继写入"模式——经 orderId 反查品牌/代理归属，落 Ticket（唯一的创建路径）。
class ComplaintIngestDto {
  @IsIn(['alipay', 'wechat', '12315', 'heimao', 'manual']) source!: string
  @IsString() @MaxLength(200) reason!: string
  @IsOptional() @IsIn(['normal', 'escalated', 'regulatory']) level?: string
  @IsOptional() @IsString() @MaxLength(40) orderId?: string // 给了则反查品牌/代理归属
  @IsOptional() @IsString() @MaxLength(40) brandId?: string // 无 orderId 时直接指定
  @IsOptional() @IsString() @MaxLength(40) agentId?: string
  @IsOptional() @IsString() @MaxLength(80) externalRef?: string // 外部平台工单号，便于对账
}
// 套餐受理 → 拆单履约：运营只提供归因渠道与意图，绝不提供价格（价格以 Bundle.finalPrice 为权威）。
class FulfillBundleDto {
  @IsString() @MaxLength(40) agentId!: string
  @IsOptional() @IsIn(['first', 'renew']) type?: string
  @IsOptional() @IsIn(['wechat', 'alipay', 'bank']) channel?: string
}
class NewContractDto {
  @IsString() @MaxLength(40) brandId!: string
  @IsOptional() @IsString() @MaxLength(40) agentId?: string
  @IsOptional() @IsString() @MaxLength(40) productId?: string
  @IsIn(['cps_share', 'floor_tiered', 'mutual_quota']) settleModel!: string
  @IsOptional() settleParams?: Record<string, unknown>
  @IsOptional() @IsIn(['D30', 'D60', 'D90']) ltvWindow?: string
  @IsOptional() @IsNumber() @Min(0) targetGmv?: number
  // 富录入：以下字段模型已存在带默认，扩 DTO 采集（零迁移）
  @IsOptional() userLimit?: Record<string, unknown>
  @IsOptional() @IsIn(['agent', 'brand', 'shared']) complaintLiability?: string
  @IsOptional() @IsInt() @Min(0) @Max(100) reservePct?: number
  @IsOptional() reserveReleaseRule?: Record<string, unknown>
  @IsOptional() @IsString() @MaxLength(200) breachRule?: string
}
class ContractStatusDto {
  @IsIn(['draft', 'open', 'active', 'fulfilling', 'settling', 'closed', 'breached']) status!: string
}
class NewBarterDto {
  @IsString() @MaxLength(40) initiatorBrandId!: string
  @IsString() @MaxLength(40) counterpartyBrandId!: string
  @IsString() @MaxLength(40) resourceType!: string
  @IsNumber() @Min(0) myQuota!: number
  @IsNumber() @Min(0) counterpartyQuota!: number
  @IsOptional() @IsIn(['pending', 'partial', 'done']) invoiceStatus?: string
  @IsOptional() terms?: Record<string, unknown>
}
class BarterStatusDto {
  @IsIn(['proposed', 'accepted', 'active', 'settled', 'rejected']) status!: string
}
class ToggleActiveDto {
  @IsBoolean() active!: boolean
}

@ApiTags('business')
@Controller()
export class BusinessController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private idem: IdempotencyService,
    private metrics: MetricsService,
    private recon: ReconciliationService,
    private settle: SettlementService,
    private settleRun: SettlementRunService,
    private reserve: ReserveReleaseService,
    private fulfillment: FulfillmentService,
    private sc: ScopeService,
  ) {}

  // 对账：核对退款流水↔结算冲账（定时任务亦调用同方法；此处供手动触发）
  @Post('reconciliation/run') @RequirePerms('settlement.clear') @ApiOperation({ summary: '触发对账（恒等式 I + 释放守恒 II/III/IV，差异写审计）' })
  runReconciliation(@CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    return this.recon.run()
  }

  // ── 结算跑批（P0-B1/B2 生产侧出账）：按账期聚合已履约订单 → 生成结算单 + 准备金释放计划 ──
  //   幂等：同品牌同账期唯一，重复跑批只补齐缺失品牌、不覆盖已生成单。生成后建议随即触发 reconciliation/run 复核。
  @Post('settlements/run') @RequirePerms('settlement.clear') @ApiOperation({ summary: '生成账期结算单 + 准备金释放计划（按已履约订单聚合，幂等跑批）' })
  async runSettlement(@Body() dto: SettlementRunDto, @CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    const from = new Date(dto.from)
    const to = new Date(dto.to)
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) return { ok: false, detail: '账期区间非法（from 须早于 to）' }
    const r = await this.settleRun.generatePeriod({ period: dto.period, from, to, actorName: user.name })
    return { ok: true, detail: `账期「${dto.period}」跑批完成：新生成 ${r.generated} 张，跳过 ${r.skipped} 张`, ...r }
  }

  // ── 风险准备金分期释放（资金动作：幂等 + 审计 fail-closed + 条件更新防并发）──
  @Get('reserve-releases') @RequirePerms('settlement.read') @ApiOperation({ summary: '准备金释放计划台账' })
  async reserveReleases(@CurrentUser() user: AuthUser) {
    return this.prisma.reserveRelease.findMany({ where: await this.reserveScope(user), orderBy: [{ settlementId: 'asc' }, { dueAt: 'asc' }], take: LIST_CAP })
  }

  @Post('reserve/:rrId/release') @RequirePerms('settlement.clear') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '释放单条到期准备金（scheduled→released，进代理可提现池）· 幂等' })
  async releaseReserve(@Param('rrId') rrId: string, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    await this.assertReserveOwns(user, rrId)
    const { result, replayed } = await this.idem.run(idemKey, 'reserve.release', async () => {
      const r = await this.prisma.$transaction(async (tx) => {
        const res = await this.reserve.releaseRow(tx, rrId, new Date())
        if (!res.ok) return res
        await this.audit.recordInTx(tx, { user, action: 'reserve.release', resource: 'ReserveRelease', resourceId: rrId, detail: res.detail })
        return res
      })
      this.metrics.recordFundAction('reserve.release', r.ok ? 'ok' : 'reject')
      return r
    }, rrId)
    return replayed ? { ...result, replayed: true } : result
  }

  @Post('reserve/release-due') @RequirePerms('settlement.clear') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '批量释放所有到期准备金（端点先行，定时任务亦调用）· 幂等' })
  async releaseReserveDue(@CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    // 幂等键绑定调用方租户：不同品牌/代理各自的批量释放互不回放（否则 B 复用 A 的键 → B 的到期行被跳过且看到 A 的聚合结果）
    const tenant = (user.scopeType ?? 'platform') === 'platform' ? 'platform' : `${user.scopeType}:${user.scopeId ?? ''}`
    const { result, replayed } = await this.idem.run(idemKey, 'reserve.release-due', async () => {
      const now = new Date()
      const rows = await this.prisma.reserveRelease.findMany({ where: { status: 'scheduled', dueAt: { lte: now }, ...(await this.reserveScope(user)) }, select: { id: true } })
      const ids = rows.map((r) => r.id)
      let released = 0
      let amount = 0
      for (const rrId of ids) {
        // 每行独立事务 + 审计；某行失败不影响其它行
        const res = await this.prisma.$transaction(async (tx) => {
          const r = await this.reserve.releaseRow(tx, rrId, now)
          if (r.ok) await this.audit.recordInTx(tx, { user, action: 'reserve.release', resource: 'ReserveRelease', resourceId: rrId, detail: r.detail })
          return r
        })
        if (res.ok) { released++; amount += res.amount ?? 0 }
      }
      this.metrics.recordFundAction('reserve.release-due', 'ok')
      return { ok: true, detail: `到期释放 ${released} 笔，合计 ¥${toYuan(amount)}`, released, amount, scanned: ids.length }
    }, tenant)
    return replayed ? { ...result, replayed: true } : result
  }

  @Post('reserve/:rrId/freeze') @RequirePerms('settlement.clear') @ApiOperation({ summary: '冻结一条准备金释放计划（投诉超阈/高风险）' })
  async freezeReserve(@Param('rrId') rrId: string, @Body() dto: ReserveFreezeDto, @CurrentUser() user: AuthUser) {
    await this.assertReserveOwns(user, rrId)
    const res = await this.prisma.$transaction(async (tx) => {
      const r = await this.reserve.freezeRow(tx, rrId, dto.reason ?? '人工冻结')
      if (r.ok) await this.audit.recordInTx(tx, { user, action: 'reserve.freeze', resource: 'ReserveRelease', resourceId: rrId, detail: r.detail })
      return r
    })
    return res
  }

  // 数据级 RBAC（默认拒绝）：按 scope 收窄查询条件。
  //   platform → 全量；brand:<id> / agent:<id> → 仅自己拥有的数据。
  // 关键安全语义：非 platform 用户访问其 scope「无法表达」的资源时，
  //   返回不可能匹配条件（DENY），而非 {}（放行全部）——避免越权泄漏。
  //   key 取值：'brandId'|'agentId'（按外键过滤）、'id-brand'|'id-agent'（按主键过滤）。
  // 逻辑收敛到 ScopeService（P1-1 瘦身），此处仅薄委托，保持各 handler 的 this.xxx(...) 调用不变。
  private scope(u: AuthUser, f: 'brandId' | 'agentId' | 'id-brand' | 'id-agent') { return this.sc.scope(u, f) }
  private scopeOwned(u: AuthUser) { return this.sc.scopeOwned(u) }
  private assertOwns(u: AuthUser, b?: string | null, a?: string | null) { return this.sc.assertOwns(u, b, a) }
  private assertCreateAttribution(u: AuthUser, b?: string | null, a?: string | null) { return this.sc.assertCreateAttribution(u, b, a) }
  private assertPlatform(u: AuthUser) { return this.sc.assertPlatform(u) }
  private reserveScope(u: AuthUser) { return this.sc.reserveScope(u) }
  private assertReserveOwns(u: AuthUser, rrId: string) { return this.sc.assertReserveOwns(u, rrId) }
  private barterScope(u: AuthUser) { return this.sc.barterScope(u) }
  private assertBarterOwns(u: AuthUser, deal: { initiatorBrandId: string; counterpartyBrandId: string }) { return this.sc.assertBarterOwns(u, deal) }

  // ── reads ──（软删除：deletedAt=null 默认过滤）──
  @Get('brands') @RequirePerms('brand.read') @ApiOperation({ summary: '品牌列表（按 scope 收窄，排除已删除）' })
  brands(@CurrentUser() user: AuthUser) { return this.prisma.brand.findMany({ where: { ...this.scope(user, 'id-brand'), deletedAt: null }, orderBy: { gmvMtd: 'desc' }, take: LIST_CAP }) }

  @Get('agents') @RequirePerms('agent.read') @ApiOperation({ summary: '代理列表（按 scope 收窄，排除已删除）' })
  agents(@CurrentUser() user: AuthUser) { return this.prisma.agent.findMany({ where: { ...this.scope(user, 'id-agent'), deletedAt: null }, orderBy: { spendMtd: 'desc' }, take: LIST_CAP }) }

  @Get('merchants') @RequirePerms('merchant.read') @ApiOperation({ summary: '商户号/号池（按 scope 收窄，排除已删除；非平台用户 mid 脱敏）' })
  async merchants(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.merchantAccount.findMany({ where: { ...this.scope(user, 'brandId'), deletedAt: null }, take: LIST_CAP })
    // PII 脱敏：仅平台运营/风控可见完整商户号；其它(品牌方等)展示脱敏码（《个保法》最小必要）
    if (user.scopeType === 'platform') return rows
    return rows.map((m) => ({ ...m, mid: maskMid(m.mid) }))
  }

  // 游标分页 + 可选筛选：?cursor=&limit=&type=&brandId=&agentId=&dateFrom=&dateTo=，返回 { items, nextCursor }
  @Get('orders') @RequirePerms('order.read') @ApiOperation({ summary: '订单（按 scope 收窄 · 游标分页 · 可选筛选）' })
  async orders(@CurrentUser() user: AuthUser, @Query() q: OrderQueryDto) {
    const take = Math.min(Math.max(Number(q.limit) || 100, 1), 500)
    // 先建筛选，再用 scope 覆盖同名键（scope 必须最后 assign，否则品牌传 brandId=他人 可绕 scope 泄漏）
    const filters: Record<string, unknown> = {}
    if (q.type) filters.type = q.type
    if (q.brandId) filters.brandId = q.brandId
    if (q.agentId) filters.agentId = q.agentId
    if (q.dateFrom || q.dateTo) {
      filters.createdAt = { ...(q.dateFrom ? { gte: new Date(q.dateFrom) } : {}), ...(q.dateTo ? { lte: new Date(q.dateTo) } : {}) }
    }
    const where = Object.assign(filters, this.scopeOwned(user))
    const items = await this.prisma.order.findMany({
      where,
      // 二级排序 id：createdAt 相同(如同批种子)时仍稳定，避免游标分页重复/丢行
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1, // 多取一条判断是否还有下一页
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    })
    const hasMore = items.length > take
    const page = hasMore ? items.slice(0, take) : items
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null }
  }

  @Get('settlements') @RequirePerms('settlement.read') @ApiOperation({ summary: '结算单（按 scope 收窄 · 可选筛选）' })
  settlements(@CurrentUser() user: AuthUser, @Query() q: SettlementQueryDto) {
    // 同样 scope 最后 assign 防越权。period 是自由字符串 → startsWith 前缀分桶（季度用 periods[] OR）
    const filters: Record<string, unknown> = {}
    if (q.status) filters.status = q.status
    if (q.brandId) filters.brandId = q.brandId
    if (q.periods && q.periods.length > 0) filters.OR = q.periods.map((p) => ({ period: { startsWith: p } }))
    else if (q.period) filters.period = { startsWith: q.period }
    const where = Object.assign(filters, this.scope(user, 'brandId'))
    // 脱敏边界：非 platform scope（如品牌只读审计 brandaudit）用字段白名单，绝不返回 platformFee/agentPayout/reversal/frozen。
    if ((user.scopeType ?? 'platform') !== 'platform') {
      return this.prisma.settlement.findMany({
        where,
        select: { id: true, brandId: true, period: true, gross: true, brandShare: true, reserve: true, status: true },
        orderBy: { period: 'desc' }, take: LIST_CAP,
      })
    }
    return this.prisma.settlement.findMany({ where, orderBy: { period: 'desc' }, take: LIST_CAP })
  }

  @Get('tickets') @RequirePerms('ticket.read') @ApiOperation({ summary: '投诉工单（按 scope 收窄）' })
  tickets(@CurrentUser() user: AuthUser) { return this.prisma.ticket.findMany({ where: this.scopeOwned(user), orderBy: { createdAt: 'desc' }, take: LIST_CAP }) }

  @Get('summary') @RequirePerms('dashboard.view') @ApiOperation({ summary: '经营总览汇总（风险条/待办派生 · 按 scope 收窄）' })
  async summary(@CurrentUser() user: AuthUser) {
    // 纵深防御：即便某客户角色被赋予 dashboard.view，聚合也按其 scope 收窄，
    // 绝不泄漏全平台口径（平台用户 scope 返回 {} 全量，行为不变）。
    const mWhere = this.scope(user, 'brandId')
    const tWhere = this.scopeOwned(user)
    const sWhere = this.scope(user, 'brandId')
    const aWhere = this.scope(user, 'id-agent')
    // P1-B11：改用 DB count/aggregate 而非 findMany+reduce——原实现把全量 scope 行拉进内存，
    //   数据量大后既慢又占内存；且若为此加 take 上限会静默少算 reconcileDiff/pendingPayout 等资金总额。
    //   聚合在 DB 侧完成，任意规模都有界且金额口径精确。
    const [fused, suspended, maxComplaintAgg, regTickets, reconcileAgg, riskyAgents, payoutAgg] = await Promise.all([
      this.prisma.merchantAccount.count({ where: { ...mWhere, state: 'fused' } }),
      this.prisma.merchantAccount.count({ where: { ...mWhere, state: { in: ['throttled', 'paused'] } } }),
      this.prisma.merchantAccount.aggregate({ where: mWhere, _max: { complaintRate: true } }),
      this.prisma.ticket.count({ where: { ...tWhere, level: 'regulatory', status: { not: 'resolved' } } }),
      this.prisma.settlement.aggregate({ where: sWhere, _sum: { reconcileDiff: true } }),
      this.prisma.agent.count({ where: { ...aWhere, status: { not: 'active' } } }),
      this.prisma.agent.aggregate({ where: aWhere, _sum: { payoutPending: true } }),
    ])
    return {
      pool: { fused, suspended },
      maxComplaint: maxComplaintAgg._max.complaintRate ?? 0,
      regTickets,
      reconcileDiff: reconcileAgg._sum.reconcileDiff ?? 0,
      riskyAgents,
      pendingPayout: payoutAgg._sum.payoutPending ?? 0,
    }
  }

  // ── 清结算动作（资金类：幂等 + 条件更新防并发） ──────────
  @Post('settlements/:id/clear') @RequirePerms('settlement.clear') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '发起结算（待结算→已结算）· 幂等' })
  async clear(@Param('id') id: string, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    const target = await this.prisma.settlement.findUnique({ where: { id }, select: { brandId: true } })
    if (target) this.assertOwns(user, target.brandId)
    const { result, replayed } = await this.idem.run(idemKey, 'settlement.clear', async () => {
      // 资金动作：业务写 + 审计落库同事务（fail-closed）——审计失败则回滚，不放行未留痕的结算
      return this.prisma.$transaction(async (tx) => {
        const r = await tx.settlement.updateMany({ where: { id, status: 'pending' }, data: { status: 'cleared' } })
        if (r.count === 0) return { ok: false, detail: '该结算单不可结算（不存在或已结算）' }
        await this.audit.recordInTx(tx, { user, action: 'settlement.clear', resource: 'Settlement', resourceId: id, detail: `结算单 ${id} 已发起结算并完成`, after: { status: 'cleared' } })
        return { ok: true, detail: `结算单 ${id} 已发起结算并完成` }
      })
    }, id)
    return replayed ? { ...result, replayed: true } : result
  }

  @Post('settlements/:id/reconcile') @RequirePerms('settlement.clear') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '对账差异核销 · 幂等' })
  async reconcile(@Param('id') id: string, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    const target = await this.prisma.settlement.findUnique({ where: { id }, select: { brandId: true, reconcileDiff: true } })
    // 不存在显式 404（保持 F3 语义：原经 update 抛 P2025→404，改条件 updateMany 后 count=0 不再抛，须显式判空）
    if (!target) throw new NotFoundException('结算单不存在')
    this.assertOwns(user, target.brandId)
    const { result, replayed } = await this.idem.run(idemKey, 'settlement.reconcile', async () => {
      return this.prisma.$transaction(async (tx) => {
        // P2-B1 跃迁守卫：仅 reconciling(待核销) 或 cleared(幂等重入,diff 已 0) 可核销；
        //   拦截 pending/reversed 直接被强制核销的非法跃迁。count===0 即业务拒绝，不再无条件覆盖状态。
        const r = await tx.settlement.updateMany({ where: { id, status: { in: ['reconciling', 'cleared'] } }, data: { status: 'cleared', reconcileDiff: 0 } })
        if (r.count === 0) return { ok: false, detail: '该结算单当前状态不可核销（仅对账中/已结算可核销）' }
        // 审计记录被核销的差额值（事务外读取的核销前 reconcileDiff），便于事后追溯核销口径
        await this.audit.recordInTx(tx, { user, action: 'settlement.reconcile', resource: 'Settlement', resourceId: id, detail: `结算单 ${id} 对账差异 ¥${toYuan(target.reconcileDiff)} 已人工核销`, before: { reconcileDiff: target.reconcileDiff }, after: { status: 'cleared', reconcileDiff: 0 } })
        return { ok: true, detail: `结算单 ${id} 对账差异已人工核销` }
      })
    }, id)
    return replayed ? { ...result, replayed: true } : result
  }

  // ── 工单退款 → 逆向冲账 → 代理分润/信用分（核心联动）· 幂等 + 事务内状态闸 ──
  @Post('tickets/:id/refund') @RequirePerms('ticket.handle') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '工单退款，联动逆向冲账与代理分润/信用分 · 幂等' })
  async refundTicket(@Param('id') id: string, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    // 工单退款的防重放靠事务内 updateMany 条件认领（status!=resolved）串行化，无需缺省幂等键（否则会与既有对账态冲突）。
    const { result, replayed } = await this.idem.run(idemKey, 'ticket.refund', async () => {
      const t = await this.prisma.ticket.findUnique({ where: { id } })
      if (!t || t.status === 'resolved') return { ok: false, detail: '工单不存在或已解决' }
      this.assertOwns(user, t.brandId, t.agentId)
      const order = t.orderId ? await this.prisma.order.findUnique({ where: { id: t.orderId } }).catch(() => null) : null
      // P2-B3 生产红线：无关联原单一律拒绝退款——不再用兜底金额凭空冲账（会向未关联任何真实扣款的工单退钱、虚增 reversal）。
      //   需退款必须先补齐原单归属（complaints/ingest 带 orderId，或运营人工指定原单），杜绝凭空造钱。
      if (!order) {
        this.metrics.recordFundAction('ticket.refund', 'reject')
        return { ok: false, detail: '工单无关联原单，禁止凭空退款；请先补齐原单归属再退款' }
      }
      // 以原单金额为准；金额为 0 视为异常拒绝（不凭空造钱）。
      const amount = Math.abs(order.amount)
      if (amount === 0) return { ok: false, detail: '关联订单金额为零，无法退款' }
      let share = 0

      // 事务内：条件更新抢占工单 + 资金联动 + 审计同事务落库（fail-closed，审计失败则整笔回滚）
      let alreadyRefunded = false
      const claimed = await this.prisma.$transaction(async (tx) => {
        const c = await tx.ticket.updateMany({ where: { id, status: { not: 'resolved' } }, data: { status: 'resolved', slaLeftMin: 0 } })
        if (c.count === 0) return false
        // 跨路径去重锚（与 order.refund / cps.refund 同锚）：原单已被任一路径退过 →
        // 工单照常解决，但跳过全部资金联动（否则同一原单沿 order.refund→ticket.refund 走一圈会双倍冲账/双扣代理）。
        // 同理防住"一单多工单"（/complaints/ingest 允许同 orderId 多来源建多张工单）逐张退款的重复冲账。
        if (order) {
          const dupe = await tx.order.findFirst({ where: { type: 'refund', refundedOrderId: order.id } })
          if (dupe) {
            alreadyRefunded = true
            await this.audit.recordInTx(tx, { user, action: 'ticket.refund', resource: 'Ticket', resourceId: id, detail: `工单 ${id} 已解决；原单 ${order.id} 此前已退款（${dupe.id}），未重复冲账` })
            return true
          }
        }
        const originalSettlement = await this.settle.bindOrderSettlement(tx, order)
        await tx.order.create({ data: { id: 'O-' + shortId(), time: '现在', brandId: t.brandId, agentId: t.agentId, channel: order?.channel ?? 'wechat', type: 'refund', amount: -amount, plan: order?.plan ?? '退款', mid: order?.mid ?? '', settlementId: originalSettlement?.id ?? null, refundedOrderId: order?.id ?? null } })
        // 结算侧逆向冲账（比例走快照优先链）+ 代理侧分润回收并扣信用分（工单退款较重）
        const rev = await this.settle.applyRefundReversal(tx, { settlement: originalSettlement, amount })
        share = rev.share
        const impact = await this.settle.applyAgentRefundImpact(tx, { agentId: t.agentId, share, withCredit: true })
        // 逆向追偿：仅追偿分润回收未从 payoutPending 扣足的缺口（P2-B5：同一笔回收优先现金池、不足才动准备金，
        //   不再对 share 全额再扣一次）。守恒式 II，不动 reserve/agentPayout。
        if (rev.settlement && impact) await this.reserve.clawback(tx, rev.settlement.id, impact.shortfall)
        await this.audit.recordInTx(tx, { user, action: 'ticket.refund', resource: 'Ticket', resourceId: id, detail: `工单 ${id} 已退款 ¥${toYuan(amount)}，逆向冲账 ¥${toYuan(share)}，代理 ${t.agentId} 信用分 −4` })
        return true
      })
      if (!claimed) {
        this.metrics.recordFundAction('ticket.refund', 'reject')
        return { ok: false, detail: '工单已被处理' }
      }
      if (alreadyRefunded) {
        this.metrics.recordFundAction('ticket.refund', 'reject')
        return { ok: true, detail: `工单 ${id} 已解决；原单此前已退款，未重复冲账`, amount: 0, share: 0 }
      }
      this.metrics.recordFundAction('ticket.refund', 'ok')
      this.metrics.addRefundAmount(amount)
      return { ok: true, detail: `工单 ${id} 已退款 ¥${toYuan(amount)}，联动冲账 ¥${toYuan(share)} 完成`, amount, share }
    }, id)
    return replayed ? { ...result, replayed: true } : result
  }

  // ── 号池状态干预 ────────────────────────
  @Post('merchants/:id/state') @RequirePerms('merchant.write') @ApiOperation({ summary: '商户号状态机人工干预' })
  async setMerchant(@Param('id') id: string, @Body() dto: StateDto, @CurrentUser() user: AuthUser) {
    const m = await this.prisma.merchantAccount.findUnique({ where: { id }, select: { brandId: true } })
    if (m) this.assertOwns(user, m.brandId)
    const weight = dto.state === 'fused' ? 0 : dto.state === 'paused' ? 8 : undefined
    await this.prisma.merchantAccount.update({ where: { id }, data: { state: dto.state, ...(weight !== undefined ? { weight } : {}) } })
    await this.audit.record({ user, action: 'merchant.state', resource: 'MerchantAccount', resourceId: id, detail: `商户号 ${id} 置为「${dto.label ?? dto.state}」` })
    return { ok: true, detail: `商户号 ${id} 已更新为 ${dto.label ?? dto.state}` }
  }

  // ── 代理处置 ───────────────────────────
  @Post('agents/:id/status') @RequirePerms('agent.write') @ApiOperation({ summary: '代理限流/冻结/恢复' })
  async setAgent(@Param('id') id: string, @Body() dto: AgentStatusDto, @CurrentUser() user: AuthUser) {
    this.assertOwns(user, null, id)
    const a = await this.prisma.agent.findUnique({ where: { id }, select: { status: true } })
    if (!a) throw new NotFoundException('代理不存在') // 保持 F3 语义：原经 update 抛 P2025→404
    // P2-B1 跃迁守卫：blacklist 为终态，不可经限流/冻结端点「复活」（须走专门解禁流程）；
    //   active/throttled/frozen 三态本身可逆互转（运营处置），故仅拦截 blacklist 源态。
    const r = await this.prisma.agent.updateMany({ where: { id, status: { not: 'blacklist' } }, data: { status: dto.status } })
    if (r.count === 0) return { ok: false, detail: '代理已拉黑，状态不可在此变更' }
    await this.audit.record({ user, action: 'agent.status', resource: 'Agent', resourceId: id, detail: `代理 ${id} 置为 ${dto.status}` })
    return { ok: true, detail: `代理 ${id} 已更新` }
  }

  @Post('agents/:id/settle') @RequirePerms('settlement.clear') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '代理提现结算（待结算清零→计入累计已结）· 幂等' })
  async settleAgent(@Param('id') id: string, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    this.assertOwns(user, null, id)
    const { result, replayed } = await this.idem.run(idemKey, 'agent.settle', async () => {
      const a = await this.prisma.agent.findUnique({ where: { id } })
      if (!a || a.payoutPending <= 0) return { ok: false, detail: '无可结算金额' }
      const amt = a.payoutPending
      // 资金动作：条件更新(防并发重复提现) + 审计同事务（fail-closed）
      return this.prisma.$transaction(async (tx) => {
        // settledTotal 原子累加：不用事务外快照 a.settledTotal + amt（并发结算+准备金释放补回 payoutPending 时会少计）。
        // payoutPending 仍绝对清零——where payoutPending:amt 守卫已保证这笔余额只被结算一次。
        const r = await tx.agent.updateMany({ where: { id, payoutPending: amt }, data: { payoutPending: 0, settledTotal: { increment: amt } } })
        if (r.count === 0) return { ok: false, detail: '提现状态已变更，请刷新重试' }
        // P1-B6 人工闸：结算只终结「已审批(approved)」的提现申请为 paid，绝不再把未审批的 pending 一键放款——
        //   未审批申请必须先经 approve/reject 端点人工过闸；未审批的 pending 保留待复核，不随结算静默出账。
        await tx.payoutRequest.updateMany({ where: { agentId: id, status: 'approved' }, data: { status: 'paid', decidedAt: new Date() } })
        await this.audit.recordInTx(tx, { user, action: 'agent.settle', resource: 'Agent', resourceId: id, detail: `代理 ${id} 提现结算 ¥${toYuan(amt).toLocaleString('zh-CN')} 已打款` })
        return { ok: true, detail: `代理 ${id} 提现 ¥${toYuan(amt)} 已打款` }
      })
    }, id)
    return replayed ? { ...result, replayed: true } : result
  }

  // ── 提现申请审批（P1-B6 人工闸）：代理经 portal 发起申请(pending) → 平台 approve/reject → 结算只放款 approved ──
  @Get('payout-requests') @RequirePerms('settlement.read') @ApiOperation({ summary: '提现申请列表（平台审批用；可按状态筛选）' })
  async payoutRequests(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    this.assertPlatform(user)
    const where = status && ['pending', 'approved', 'rejected', 'paid'].includes(status) ? { status } : {}
    return this.prisma.payoutRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: LIST_CAP })
  }

  @Post('payout-requests/:id/approve') @RequirePerms('settlement.clear') @ApiOperation({ summary: '审批通过提现申请（pending→approved，待结算放款）' })
  async approvePayout(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    return this.prisma.$transaction(async (tx) => {
      // 条件更新认领：仅 pending 可审批通过；并发/重复点击 count=0 幂等拒绝，不覆盖已决状态。
      const r = await tx.payoutRequest.updateMany({ where: { id, status: 'pending' }, data: { status: 'approved', decidedAt: new Date() } })
      if (r.count === 0) return { ok: false, detail: '申请不存在或非待审批状态' }
      await this.audit.recordInTx(tx, { user, action: 'payout.approve', resource: 'PayoutRequest', resourceId: id, detail: `提现申请 ${id} 审批通过（待结算放款）` })
      return { ok: true, detail: `提现申请 ${id} 已通过` }
    })
  }

  @Post('payout-requests/:id/reject') @RequirePerms('settlement.clear') @ApiOperation({ summary: '驳回提现申请（pending→rejected，不放款）' })
  async rejectPayout(@Param('id') id: string, @Body() dto: PayoutRejectDto, @CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.payoutRequest.updateMany({ where: { id, status: 'pending' }, data: { status: 'rejected', reviewNote: dto.reviewNote ?? '', decidedAt: new Date() } })
      if (r.count === 0) return { ok: false, detail: '申请不存在或非待审批状态' }
      await this.audit.recordInTx(tx, { user, action: 'payout.reject', resource: 'PayoutRequest', resourceId: id, detail: `提现申请 ${id} 已驳回${dto.reviewNote ? '：' + dto.reviewNote : ''}` })
      return { ok: true, detail: `提现申请 ${id} 已驳回` }
    })
  }

  // ── 品牌：创建 / 状态 / 配置 ──────────────
  @Post('brands') @RequirePerms('brand.write') @ApiOperation({ summary: '新增品牌（入驻）' })
  async addBrand(@Body() dto: NewBrandDto, @CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    const id = 'brand-' + shortId()
    const mark = dto.name.slice(0, 2)
    const brand = await this.prisma.brand.create({
      data: { id, name: dto.name, mark, category: dto.category, status: 'review', path: dto.path, feeRate: dto.feeRate, period: dto.period, reservePct: dto.reservePct, joinedAt: '刚刚' },
    })
    await this.audit.record({ user, action: 'brand.create', resource: 'Brand', resourceId: id, detail: `新增品牌「${dto.name}」待审核`, after: brand })
    return { ok: true, detail: `品牌「${dto.name}」已创建，待审核`, id }
  }

  @Patch('brands/:id/status') @RequirePerms('brand.write') @ApiOperation({ summary: '品牌上线/暂停/复审' })
  async setBrandStatus(@Param('id') id: string, @Body() dto: BrandStatusDto, @CurrentUser() user: AuthUser) {
    const before = await this.prisma.brand.findUnique({ where: { id } })
    if (!before) return { ok: false, detail: '品牌不存在' }
    this.assertOwns(user, before.id)
    await this.prisma.brand.update({ where: { id }, data: { status: dto.status } })
    await this.audit.record({ user, action: 'brand.status', resource: 'Brand', resourceId: id, detail: `品牌 ${id} 置为「${dto.label ?? dto.status}」`, before: { status: before.status }, after: { status: dto.status } })
    return { ok: true, detail: `品牌 ${id} 已更新为 ${dto.label ?? dto.status}` }
  }

  @Patch('brands/:id/config') @RequirePerms('brand.write') @ApiOperation({ summary: '品牌接入配置（费率/账期/预留/资金路径）' })
  async setBrandConfig(@Param('id') id: string, @Body() dto: BrandConfigDto, @CurrentUser() user: AuthUser) {
    const before = await this.prisma.brand.findUnique({ where: { id } })
    if (!before) return { ok: false, detail: '品牌不存在' }
    this.assertOwns(user, before.id)
    const data: Record<string, unknown> = {}
    if (dto.feeRate !== undefined) data.feeRate = dto.feeRate
    if (dto.period !== undefined) data.period = dto.period
    if (dto.reservePct !== undefined) data.reservePct = dto.reservePct
    if (dto.path !== undefined) data.path = dto.path
    await this.prisma.brand.update({ where: { id }, data })
    await this.audit.record({ user, action: 'brand.config', resource: 'Brand', resourceId: id, detail: `品牌 ${id} 接入配置已更新`, before, after: data })
    return { ok: true, detail: `品牌 ${id} 配置已保存` }
  }

  // 软删除：置 deletedAt，从列表消失但保留审计可追溯（资金/合规要求）
  @Delete('brands/:id') @RequirePerms('brand.write') @ApiOperation({ summary: '品牌软删除（下架，可追溯）' })
  async removeBrand(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    this.assertOwns(user, id)
    const r = await this.prisma.brand.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } })
    if (r.count === 0) return { ok: false, detail: '品牌不存在或已删除' }
    await this.audit.record({ user, action: 'brand.delete', resource: 'Brand', resourceId: id, detail: `品牌 ${id} 已软删除（下架）` })
    return { ok: true, detail: `品牌 ${id} 已下架` }
  }

  // ── 号池：新增 ─────────────────────────
  @Post('merchants') @RequirePerms('merchant.write') @ApiOperation({ summary: '品牌专属号池新增商户号' })
  async addMerchant(@Body() dto: NewMerchantDto, @CurrentUser() user: AuthUser) {
    this.assertOwns(user, dto.brandId)
    const brand = await this.prisma.brand.findFirst({ where: { id: dto.brandId, deletedAt: null }, select: { id: true } })
    if (!brand) return { ok: false, detail: '品牌不存在或已删除' }
    const pref = dto.channel === 'wechat' ? 'WX' : dto.channel === 'alipay' ? 'AL' : 'BK'
    const id = `M-${pref}-${shortId()}`
    const mid = `${pref}${shortId()}`
    const m = await this.prisma.merchantAccount.create({ data: { id, brandId: dto.brandId, channel: dto.channel, mid, state: 'healthy', weight: dto.weight } })
    await this.audit.record({ user, action: 'merchant.create', resource: 'MerchantAccount', resourceId: id, detail: `号池新增商户号 ${id}（${dto.channel}）`, after: m })
    return { ok: true, detail: `商户号 ${id} 已加入号池`, id }
  }

  // ── 订单退款（无工单）· 幂等 ───────────────
  @Post('orders/:id/refund') @RequirePerms('order.refund') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '订单退款（订单冲正→结算冲账→代理分润回收）· 幂等' })
  async refundOrder(@Param('id') id: string, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    // 缺省确定性幂等键：无 Idempotency-Key 时按原单 id 串行化，防止并发双退（对齐 cps.refund）。
    // 幂等键绑定原单 id：客户端把同一键复用到另一笔订单时各自执行，而非静默回放首单结果（看似成功实际没退）。
    const { result, replayed } = await this.idem.run(idemKey ?? 'auto', 'order.refund', async () => {
      const amount = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id } })
        if (!order || order.type === 'refund' || order.type === 'chargeback') return null
        this.assertOwns(user, order.brandId, order.agentId)
        // 跨路径统一去重锚：按被退原单 id（refundedOrderId），与 cps.refund 同锚，
        // 避免同一笔 CPS 扣款单被 order.refund 与 cps.refund 各退一次（extOrderNo 在 CPS 单是交易号，不能混用）。
        const existingRefund = await tx.order.findFirst({ where: { type: 'refund', refundedOrderId: id } })
        if (existingRefund) return null
        const amt = Math.abs(order.amount)
        const originalSettlement = await this.settle.bindOrderSettlement(tx, order)
        await tx.order.create({ data: { id: 'O-' + shortId(), time: '现在', brandId: order.brandId, agentId: order.agentId, channel: order.channel, type: 'refund', amount: -amt, plan: order.plan, mid: order.mid, settlementId: originalSettlement?.id ?? null, refundedOrderId: id } })
        // 结算侧逆向冲账（比例走快照优先链）+ 代理侧分润回收（订单退款不扣信用分）
        const rev = await this.settle.applyRefundReversal(tx, { settlement: originalSettlement, amount: amt })
        const share = rev.share
        const impact = await this.settle.applyAgentRefundImpact(tx, { agentId: order.agentId, share, withCredit: false })
        // 逆向追偿：仅追偿分润回收未从 payoutPending 扣足的缺口（P2-B5：同一笔回收优先现金池、不足才动准备金）。
        if (rev.settlement && impact) await this.reserve.clawback(tx, rev.settlement.id, impact.shortfall)
        // 审计同事务（fail-closed）
        await this.audit.recordInTx(tx, { user, action: 'order.refund', resource: 'Order', resourceId: id, detail: `订单 ${id} 已退款 ¥${toYuan(amt)}，逆向冲账 ¥${toYuan(share)}` })
        return { amt, share }
      })
      if (!amount) {
        this.metrics.recordFundAction('order.refund', 'reject')
        return { ok: false, detail: '订单不存在或不可退款' }
      }
      this.metrics.recordFundAction('order.refund', 'ok')
      this.metrics.addRefundAmount(amount.amt)
      return { ok: true, detail: `订单 ${id} 已退款，联动冲账完成`, amount: amount.amt, share: amount.share }
    }, id)
    return replayed ? { ...result, replayed: true } : result
  }

  // ── 工单：流转（转派/升级/关闭等）──────────
  @Patch('tickets/:id') @RequirePerms('ticket.handle') @ApiOperation({ summary: '工单流转（状态/责任人/备注）' })
  async updateTicket(@Param('id') id: string, @Body() dto: TicketUpdateDto, @CurrentUser() user: AuthUser) {
    const before = await this.prisma.ticket.findUnique({ where: { id } })
    if (!before) return { ok: false, detail: '工单不存在' }
    this.assertOwns(user, before.brandId, before.agentId)
    // P2-B1 跃迁守卫：resolved 为终态，不可回退到任何进行中状态（否则已退款关闭的工单被重开、SLA 计时错乱）。
    //   仅在确实变更 status 时校验；只改 owner/level 不受限。资金型 resolved 由 ticket.refund 自带 updateMany 认领，与此处解耦。
    if (dto.status !== undefined && dto.status !== before.status) {
      const TICKET_TRANSITIONS: Record<string, string[]> = {
        open: ['pending', 'processing', 'escalated', 'arbitration', 'resolved'],
        pending: ['processing', 'escalated', 'arbitration', 'resolved'],
        processing: ['pending', 'escalated', 'arbitration', 'resolved'],
        escalated: ['processing', 'arbitration', 'resolved'],
        arbitration: ['escalated', 'resolved'],
        resolved: [],
      }
      const allowed = TICKET_TRANSITIONS[before.status] ?? []
      if (!allowed.includes(dto.status)) return { ok: false, detail: `工单不可从 ${before.status} 跃迁到 ${dto.status}` }
    }
    const data: Record<string, unknown> = {}
    if (dto.status !== undefined) data.status = dto.status
    if (dto.owner !== undefined) data.owner = dto.owner
    if (dto.level !== undefined) data.level = dto.level
    await this.prisma.ticket.update({ where: { id }, data })
    await this.audit.record({ user, action: 'ticket.update', resource: 'Ticket', resourceId: id, detail: `工单 ${id} ${dto.note ?? '已更新'}`, before: { status: before.status, owner: before.owner, level: before.level }, after: data })
    return { ok: true, detail: `工单 ${id} 已更新` }
  }

  // ── 平台配置中心 ───────────────────────
  @Get('config') @RequirePerms('dashboard.view') @ApiOperation({ summary: '读取平台配置（键值）' })
  async getConfig(@CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    const rows = await this.prisma.config.findMany()
    return rows.reduce<Record<string, unknown>>((acc, r) => {
      try {
        acc[r.key] = JSON.parse(r.value)
      } catch {
        acc[r.key] = r.value
      }
      return acc
    }, {})
  }

  @Post('config') @RequirePerms('config.write') @ApiOperation({ summary: '写入平台配置（键值，upsert）' })
  async setConfig(@Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    const ALLOWED_KEYS = [
      'platformFeeRate', 'defaultSharePct', 'complaintThreshold', 'escalatedThreshold', 'chargebackThreshold', 'slaDefaultMin', 'reserveDefaultPct', 'autoReconcile',
      'channelWeChat', 'channelAlipay', 'channelBank', 'channelApple', 'channelGoogle', 'channelStripe', 'channelPaypal',
      // 前端 store 镜像的复合配置对象（hydrateFromServer 回读同名键）。缺这 5 个键曾导致
      // 配置写被静默过滤为 0 项却返回 ok:true —— 前端以为已保存，实际只活在本地 localStorage。
      'attributionConfig', 'platformConfig', 'platformParams', 'slaConfig', 'channelStates',
    ]
    const entries = Object.entries(body || {}).filter(([k]) => ALLOWED_KEYS.includes(k))
    // 全部键被过滤 → 显式拒绝（而非 ok:true 假成功），让前端 mirror 能感知契约漂移并提示用户
    if (entries.length === 0) return { ok: false, detail: '没有可保存的配置键（键名不在白名单）' }
    for (const [key, value] of entries) {
      const v = typeof value === 'string' ? value : JSON.stringify(value)
      await this.prisma.config.upsert({ where: { key }, create: { key, value: v }, update: { value: v } })
    }
    await this.audit.record({ user, action: 'config.write', resource: 'Config', resourceId: '-', detail: `平台配置已更新（${entries.length} 项）`, after: body })
    return { ok: true, detail: `已保存 ${entries.length} 项配置`, saved: entries.length }
  }

  // ── 订阅商品审核（内部）──
  @Get('products') @RequirePerms('product.read') @ApiOperation({ summary: '全平台订阅商品列表（审核视角，按 scope 收窄；含品牌名以免依赖前端 mock）' })
  async products(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.product.findMany({ where: { ...this.scope(user, 'brandId'), deletedAt: null }, orderBy: { createdAt: 'desc' }, take: LIST_CAP })
    // 附带品牌名/标识，审核台不再依赖前端 mock brandById（C1）
    const brandIds = [...new Set(rows.map((r) => r.brandId))]
    const brands = await this.prisma.brand.findMany({ where: { id: { in: brandIds } } })
    const bmap = new Map(brands.map((b) => [b.id, { name: b.name, mark: b.mark }]))
    return rows.map((r) => ({ ...r, brandName: bmap.get(r.brandId)?.name ?? r.brandId, brandMark: bmap.get(r.brandId)?.mark ?? '' }))
  }

  @Post('products/:id/review') @RequirePerms('product.write') @ApiOperation({ summary: '审核商品（approve: pending→live；reject: pending→draft + note）' })
  async reviewProduct(@Param('id') id: string, @Body() dto: ProductReviewDto, @CurrentUser() user: AuthUser) {
    const p = await this.prisma.product.findFirst({ where: { id, deletedAt: null } })
    if (!p) return { ok: false, detail: '商品不存在' }
    this.assertOwns(user, p.brandId)
    if (p.status !== 'pending') return { ok: false, detail: '仅待审商品可审核' }
    const next = dto.action === 'approve' ? 'live' : 'draft'
    await this.prisma.product.update({ where: { id }, data: { status: next, reviewNote: dto.action === 'reject' ? (dto.note ?? '未通过') : '' } })
    await this.audit.record({ user, action: 'product.review', resource: 'Product', resourceId: id, detail: `商品 ${id} ${dto.action === 'approve' ? '过审上架' : '驳回'}`, after: { status: next } })
    return { ok: true, detail: dto.action === 'approve' ? `${p.name} 已上架` : `${p.name} 已驳回` }
  }

  // ── 组合优惠规则（内部）──
  @Get('bundle-rules') @RequirePerms('product.read') @ApiOperation({ summary: '组合优惠规则列表' })
  bundleRules() { return this.prisma.bundleRule.findMany({ orderBy: { createdAt: 'desc' } }) }

  @Post('bundle-rules') @RequirePerms('product.write') @ApiOperation({ summary: '新增组合优惠规则' })
  async addBundleRule(@Body() dto: BundleRuleDto, @CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    // 校验参数边界（S3 防投毒）：discountPct ∈ [0,100]、minItems ≥ 1、fixedPrice ≥ 0
    const p = (dto.params ?? {}) as { minItems?: number; discountPct?: number; fixedPrice?: number }
    if (p.discountPct != null && (p.discountPct < 0 || p.discountPct > 100)) return { ok: false, detail: '折扣需在 0-100 之间' }
    if (p.minItems != null && p.minItems < 1) return { ok: false, detail: '满足件数需 ≥ 1' }
    if (p.fixedPrice != null && p.fixedPrice < 0) return { ok: false, detail: '固定价不能为负' }
    const id = 'BR-' + shortId()
    await this.prisma.bundleRule.create({ data: { id, name: dto.name, kind: dto.kind, params: JSON.stringify(dto.params ?? {}), active: dto.active ?? true } })
    await this.audit.record({ user, action: 'bundlerule.create', resource: 'BundleRule', resourceId: id, detail: `组合优惠规则 ${dto.name}` })
    return { ok: true, id }
  }

  @Patch('bundle-rules/:id') @RequirePerms('product.write') @ApiOperation({ summary: '启停组合优惠规则' })
  async toggleBundleRule(@Param('id') id: string, @Body() body: ToggleActiveDto, @CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    await this.prisma.bundleRule.update({ where: { id }, data: { active: !!body.active } })
    await this.audit.record({ user, action: 'bundlerule.toggle', resource: 'BundleRule', resourceId: id, detail: `规则 ${id} ${body.active ? '启用' : '停用'}` })
    return { ok: true }
  }

  // ── 增长合约（内部 CRUD，收敛前端 mock 到 Prisma 单源）──
  @Get('contracts') @RequirePerms('contract.read') @ApiOperation({ summary: '增长合约列表（内部全量，按 scope 收窄）' })
  contracts(@CurrentUser() user: AuthUser) {
    return this.prisma.growthContract.findMany({ where: { ...this.scope(user, 'brandId'), deletedAt: null }, orderBy: { createdAt: 'desc' }, take: LIST_CAP })
  }

  @Post('contracts') @RequirePerms('contract.write') @ApiOperation({ summary: '创建增长合约（内部）' })
  async addContract(@Body() dto: NewContractDto, @CurrentUser() user: AuthUser) {
    this.assertCreateAttribution(user, dto.brandId, dto.agentId ?? null)
    const id = 'GC-' + shortId()
    await this.prisma.growthContract.create({
      data: {
        id, brandId: dto.brandId, agentId: dto.agentId ?? null, productId: dto.productId ?? null,
        status: dto.agentId ? 'active' : 'open', settleModel: dto.settleModel,
        settleParams: JSON.stringify(dto.settleParams ?? {}), ltvWindow: dto.ltvWindow ?? 'D30',
        targetGmv: dto.targetGmv ?? 0, signedAt: dto.agentId ? new Date() : null,
        userLimit: JSON.stringify(dto.userLimit ?? {}),
        ...(dto.complaintLiability ? { complaintLiability: dto.complaintLiability } : {}),
        ...(dto.reservePct != null ? { reservePct: dto.reservePct } : {}),
        reserveReleaseRule: JSON.stringify(dto.reserveReleaseRule ?? {}),
        breachRule: dto.breachRule ?? '',
      },
    })
    await this.audit.record({ user, action: 'contract.create', resource: 'GrowthContract', resourceId: id, detail: `增长合约 ${id}（${dto.settleModel}）` })
    return { ok: true, id }
  }

  @Patch('contracts/:id/status') @RequirePerms('contract.write') @ApiOperation({ summary: '增长合约状态流转（内部）' })
  async setContractStatus(@Param('id') id: string, @Body() dto: ContractStatusDto, @CurrentUser() user: AuthUser) {
    const contract = await this.prisma.growthContract.findFirst({ where: { id, deletedAt: null } })
    if (!contract) return { ok: false, detail: '合约不存在' }
    this.assertOwns(user, contract.brandId, contract.agentId)
    // P2-B1 跃迁守卫：closed 终态不可回 active；settling(达标) 不可退回 active/fulfilling 继续累计 GMV。
    //   仅在确实变更时校验；用条件 updateMany 认领（where 带前置 status），并发下同一非法/过期跃迁只有一个能落。
    if (dto.status !== contract.status) {
      const CONTRACT_TRANSITIONS: Record<string, string[]> = {
        draft: ['open', 'active', 'closed', 'breached'],
        open: ['active', 'closed', 'breached'],
        active: ['fulfilling', 'settling', 'closed', 'breached'],
        fulfilling: ['settling', 'closed', 'breached'],
        settling: ['closed', 'breached'],
        breached: ['closed'],
        closed: [],
      }
      const allowed = CONTRACT_TRANSITIONS[contract.status] ?? []
      if (!allowed.includes(dto.status)) return { ok: false, detail: `合约不可从 ${contract.status} 跃迁到 ${dto.status}` }
    }
    const r = await this.prisma.growthContract.updateMany({ where: { id, status: contract.status, deletedAt: null }, data: { status: dto.status } })
    if (r.count === 0) return { ok: false, detail: '合约状态已变更，请刷新重试' }
    await this.audit.record({ user, action: 'contract.status', resource: 'GrowthContract', resourceId: id, detail: `合约 ${id} → ${dto.status}` })
    return { ok: true }
  }

  // ── 资源置换（内部 CRUD）──
  @Get('barter') @RequirePerms('barter.view') @ApiOperation({ summary: '资源置换台账（按 scope 收窄）' })
  barter(@CurrentUser() user: AuthUser) { return this.prisma.barterDeal.findMany({ where: this.barterScope(user), orderBy: { createdAt: 'desc' }, take: LIST_CAP }) }

  @Post('barter') @RequirePerms('barter.write') @ApiOperation({ summary: '创建资源置换单（内部）' })
  async addBarter(@Body() dto: NewBarterDto, @CurrentUser() user: AuthUser) {
    this.assertOwns(user, dto.initiatorBrandId)
    // 数据完整性（对齐门户 proposeBarter）：对手品牌必须存在且未删除、且非自身——
    //   否则会落悬空外键，污染门户 OR-scope 视图。
    if (dto.counterpartyBrandId === dto.initiatorBrandId) return { ok: false, detail: '对手品牌不能是自己' }
    const cp = await this.prisma.brand.findFirst({ where: { id: dto.counterpartyBrandId, deletedAt: null } })
    if (!cp) return { ok: false, detail: '对手品牌不存在或已删除' }
    const id = 'BD-' + shortId()
    await this.prisma.barterDeal.create({ data: { id, initiatorBrandId: dto.initiatorBrandId, counterpartyBrandId: dto.counterpartyBrandId, resourceType: dto.resourceType, myQuota: fromYuan(dto.myQuota), counterpartyQuota: fromYuan(dto.counterpartyQuota), ...(dto.invoiceStatus ? { invoiceStatus: dto.invoiceStatus } : {}), terms: JSON.stringify(dto.terms ?? {}) } })
    await this.audit.record({ user, action: 'barter.create', resource: 'BarterDeal', resourceId: id, detail: `置换单 ${id}` })
    return { ok: true, id }
  }

  @Patch('barter/:id/status') @RequirePerms('barter.write') @ApiOperation({ summary: '资源置换状态流转（内部）' })
  async setBarterStatus(@Param('id') id: string, @Body() dto: BarterStatusDto, @CurrentUser() user: AuthUser) {
    const deal = await this.prisma.barterDeal.findFirst({ where: { id, deletedAt: null } })
    if (!deal) return { ok: false, detail: '置换单不存在' }
    this.assertBarterOwns(user, deal)
    // P2-B1 跃迁守卫：settled/rejected 为终态不可再流转；条件 updateMany 认领防并发过期跃迁。
    if (dto.status !== deal.status) {
      const BARTER_TRANSITIONS: Record<string, string[]> = {
        proposed: ['accepted', 'active', 'rejected'],
        accepted: ['active', 'rejected', 'settled'],
        active: ['settled', 'rejected'],
        settled: [],
        rejected: [],
      }
      const allowed = BARTER_TRANSITIONS[deal.status] ?? []
      if (!allowed.includes(dto.status)) return { ok: false, detail: `置换单不可从 ${deal.status} 跃迁到 ${dto.status}` }
    }
    const r = await this.prisma.barterDeal.updateMany({ where: { id, status: deal.status, deletedAt: null }, data: { status: dto.status } })
    if (r.count === 0) return { ok: false, detail: '置换单状态已变更，请刷新重试' }
    await this.audit.record({ user, action: 'barter.status', resource: 'BarterDeal', resourceId: id, detail: `置换 ${id} → ${dto.status}` })
    return { ok: true }
  }

  // ── 通知（内部，scoped 到当前账户）──
  @Get('notifications') @ApiOperation({ summary: '当前账户通知（平台账户见 platform 广播 + 精确投递）' })
  async notifications(@CurrentUser() user: AuthUser) {
    return this.prisma.notification.findMany({ where: this.notifWhere(user), orderBy: { createdAt: 'desc' }, take: 50 })
  }

  @Post('notifications/:id/read') @ApiOperation({ summary: '标记通知已读（仅自己 scope）' })
  async readNotif(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // 归属收窄（S2 防 IDOR）：只能标记属于自己 scope 的通知
    await this.prisma.notification.updateMany({ where: { ...this.notifWhere(user), id }, data: { read: true } })
    return { ok: true }
  }

  @Post('notifications/read-all') @ApiOperation({ summary: '全部已读' })
  async readAllNotif(@CurrentUser() user: AuthUser) {
    await this.prisma.notification.updateMany({ where: { ...this.notifWhere(user), read: false }, data: { read: true } })
    return { ok: true }
  }

  // 通知可见性 OR 语义：精确 userId OR (scopeType+scopeId 命中) OR platform 广播（仅平台账户）
  private notifWhere(u: AuthUser) { return this.sc.notifWhere(u) }

  // ── 正向订单写入（履约入口）：触发履约引擎累加 + 订阅 upsert ──
  // 这是 achievedGmv 唯一被推进的入口；绝不触碰结算恒等式五项。
  @Post('fulfillment/ingest') @RequirePerms('contract.write') @ApiOperation({ summary: '正向订单写入：履约累加 + 订阅聚合（写权限，不动结算恒等式）' })
  async ingest(@Body() dto: OrderIngestDto, @CurrentUser() user: AuthUser) {
    this.assertCreateAttribution(user, dto.brandId, dto.agentId)
    const id = 'O-' + shortId()
    const amtFen = fromYuan(dto.amount) // P1-B7：入参元 → 整数分
    const res = await this.prisma.$transaction(async (tx) => {
      await tx.order.create({
        data: { id, time: '实时', brandId: dto.brandId, agentId: dto.agentId, channel: dto.channel ?? 'wechat', type: dto.type, amount: amtFen, plan: dto.plan, mid: 'M-RT', productId: dto.productId ?? null },
      })
      // 履约引擎：匹配合约累加 achievedGmv + 推进状态 + 订阅 upsert（事务内）
      const r = await this.fulfillment.ingestOrder(tx as never, { id, brandId: dto.brandId, agentId: dto.agentId, productId: dto.productId, amount: amtFen, type: dto.type, plan: dto.plan })
      return { orderId: id, ...r }
    })
    await this.audit.record({ user, action: 'order.ingest', resource: 'Order', resourceId: id, detail: `履约订单 ${id} · ¥${dto.amount}${res.matchedContractId ? ` · 合约 ${res.matchedContractId} 累加` : ''}` })
    return { ok: true, ...res }
  }

  // ── 外部投诉接入（可信中继）：支付宝 / 12315 / 黑猫 等平台工单 → 落 Ticket ──
  // 镜像 fulfillment/ingest：经 orderId 反查品牌/代理归属（外部平台只知订单号），按级别算 SLA，
  // 创建工单后自动出现在运营 Complaints + 品牌 BrandTickets + 代理 agent/tickets（同一张表，scope 各自可见）。
  // 红线：只创建工单元数据，绝不触碰结算/资金；鉴权用 ticket.handle（风控/售后服务账号），杜绝匿名灌单。
  @Post('complaints/ingest') @RequirePerms('ticket.handle') @ApiOperation({ summary: '外部投诉接入：支付宝/12315/黑猫等平台工单 → 落 Ticket（按 orderId 反查归属，不碰资金）' })
  async ingestComplaint(@Body() dto: ComplaintIngestDto, @CurrentUser() user: AuthUser) {
    // 可信中继：仅平台 scope 可代任意品牌落单（外部平台接入由平台风控账号代理）。
    // 防越权：客户角色即便误持 ticket.handle，也不能伪造针对任意品牌的投诉 + 推送伪造通知。
    if (user.scopeType !== 'platform') throw new ForbiddenException('外部投诉接入仅限平台账号')
    let brandId = dto.brandId ?? ''
    let agentId = dto.agentId ?? ''
    let orderId = dto.orderId ?? ''
    // 经订单反查归属（外部平台通常只携带订单号）
    if (orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: orderId } })
      if (!order) return { ok: false, detail: `订单 ${orderId} 不存在，无法归属投诉` }
      brandId = order.brandId
      agentId = order.agentId
    }
    if (!brandId) return { ok: false, detail: '需提供 orderId 或 brandId 以归属投诉' }
    const brand = await this.prisma.brand.findFirst({ where: { id: brandId, deletedAt: null }, select: { id: true } })
    if (!brand) return { ok: false, detail: `品牌 ${brandId} 不存在，无法归属投诉` }
    if (agentId) {
      const agent = await this.prisma.agent.findFirst({ where: { id: agentId, deletedAt: null }, select: { id: true } })
      if (!agent) return { ok: false, detail: `代理 ${agentId} 不存在，无法归属投诉` }
    }
    const level = dto.level ?? 'normal'
    // SLA 时限按级别：监管 24h、升级 48h、普通 72h（分钟）
    const slaLeftMin = level === 'regulatory' ? 1440 : level === 'escalated' ? 2880 : 4320
    const id = 'TK-' + shortId()
    await this.prisma.ticket.create({
      data: {
        id, time: '实时', source: dto.source, level, status: 'pending', slaLeftMin,
        brandId, agentId: agentId || '未知', orderId, reason: dto.reason,
        owner: '未分配', note: dto.externalRef ? `外部单号 ${dto.externalRef}` : '',
      },
    })
    // 广播通知给品牌（落消息，不进资金事务）
    await this.prisma.notification.create({
      data: { id: 'NT-' + shortId(), userId: null, scopeType: 'brand', scopeId: brandId, category: 'ticket', title: '新投诉工单', body: `来自${dto.source}的投诉：${dto.reason.slice(0, 30)}`, link: '/portal/brand/tickets', read: false },
    }).catch(() => undefined)
    await this.audit.record({ user, action: 'complaint.ingest', resource: 'Ticket', resourceId: id, detail: `外部投诉接入 ${id} · 来源 ${dto.source} · 品牌 ${brandId}${orderId ? ` · 订单 ${orderId}` : ''}` })
    return { ok: true, ticketId: id, brandId, agentId, level, slaLeftMin }
  }

  // ── 订阅超市套餐台账（内部）：用户在超市生成的 Bundle，运营可见 + 受理 ──
  @Get('bundles') @RequirePerms('product.read') @ApiOperation({ summary: '套餐台账（内部全量，附商品/品牌名）' })
  async bundles(@CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    const rows = await this.prisma.bundle.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
    // 富化：一次取齐所有套餐涉及的商品 + 品牌名（避免前端 N 次回查）
    const allPids = [...new Set(rows.flatMap((b) => { try { return JSON.parse(b.productIds) as string[] } catch { return [] } }))]
    const products = await this.prisma.product.findMany({ where: { id: { in: allPids } }, select: { id: true, name: true, brandId: true, firstPrice: true } })
    const pMap = new Map(products.map((p) => [p.id, p]))
    const brandIds = [...new Set(products.map((p) => p.brandId))]
    const brands = await this.prisma.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true } })
    const bName = new Map(brands.map((b) => [b.id, b.name]))
    return rows.map((b) => {
      let pids: string[] = []; try { pids = JSON.parse(b.productIds) } catch { /* */ }
      const items = pids.map((id) => { const p = pMap.get(id); return p ? { productId: id, name: p.name, brandId: p.brandId, brandName: bName.get(p.brandId) ?? '', firstPrice: p.firstPrice } : { productId: id, name: id, brandId: '', brandName: '', firstPrice: 0 } })
      return { id: b.id, userRef: b.userRef, status: b.status, paymentStatus: b.paymentStatus, payChannel: b.payChannel, listPrice: b.listPrice, discountPct: b.discountPct, finalPrice: b.finalPrice, ruleId: b.ruleId, createdAt: b.createdAt, items, brandCount: new Set(items.map((i) => i.brandId).filter(Boolean)).size }
    })
  }

  // ── 套餐受理 → 拆单履约（内部，服务端权威算价 + 走既有 ingestOrder，绝不碰结算恒等式）──
  // 红线：金额由 Bundle.finalPrice 按各商品 firstPrice 比例分摊（末项吸收残差，∑ 恰等 finalPrice）；
  //       每个商品按自己的 brandId 拆一笔 Order（套餐可跨品牌），共享 bundleId 溯源；
  //       全程只经 ingestOrder（仅动 achievedGmv/status/Subscription），结算五元恒等式不破。
  //       并发安全：幂等 + 事务内 quoted→ordered 条件认领（先认领再开单，杜绝双重履约）。
  @Post('bundles/:id/fulfill') @RequirePerms('contract.write') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '受理套餐 → 按商品拆单履约（服务端权威分摊，不动结算恒等式）· 幂等' })
  async fulfillBundle(@Param('id') id: string, @Body() dto: FulfillBundleDto, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    this.assertPlatform(user)
    const bundle = await this.prisma.bundle.findUnique({ where: { id } })
    if (!bundle) return { ok: false, detail: '套餐不存在' }
    // 红线：仅「已支付」套餐可受理履约——否则会为没人付钱的订阅凭空开单、虚增 GMV/推进合约。
    // 支付先于履约（pay 仅 quoted 可用、受理后转 ordered），此处校验 paymentStatus 闭合资金链路。
    if (bundle.paymentStatus !== 'paid') return { ok: false, detail: '套餐未支付，不可受理履约' }
    // 注意：不在此处拦截非 quoted 状态——否则同幂等键的合法重放（首次成功后 bundle 已是 ordered）会被误拒。
    // 状态门禁交由事务内 quoted→ordered 条件认领（claim.count===0 即拒），重放则由 idem.run 直接回放首次结果。
    // 归因代理须真实存在（避免悬空 agentId 污染合约 GMV）
    const agent = await this.prisma.agent.findUnique({ where: { id: dto.agentId } })
    if (!agent) return { ok: false, detail: '归因代理不存在' }
    let pids: string[] = []; try { pids = JSON.parse(bundle.productIds) } catch { /* */ }
    // 取 live + bundleEligible 商品（防下架/不可组合商品被凭空开单）
    const products = await this.prisma.product.findMany({ where: { id: { in: pids }, status: 'live', bundleEligible: true, deletedAt: null } })
    if (products.length === 0) return { ok: false, detail: '套餐内无有效上架商品' }
    // 报价后若有商品下架/不可组合 → 拒绝受理（避免对部分商品按全套餐价计费，折扣失去“满件”依据）
    if (products.length !== pids.length) return { ok: false, detail: '套餐内有商品已下架或不可组合，请用户重新组合后再受理' }

    const ordered = pids.map((pid) => products.find((p) => p.id === pid)).filter(Boolean) as typeof products
    const final = bundle.finalPrice
    // 服务端权威分摊：按 firstPrice 比例分，末项吸收舍入残差保证 ∑ = final（Decimal 精确，无浮点尾差）。
    // splitProportional 内部：前 n−1 项按占比 round2，末项 = final − 已分配，天然 ≥ 0 且和恒等于 final。
    const alloc = splitProportional(final, ordered.map((p) => p.firstPrice))
    const type = dto.type ?? 'first'
    const channel = dto.channel ?? 'wechat'

    const { result, replayed } = await this.idem.run(idemKey, 'bundle.fulfill', async () => {
      return this.prisma.$transaction(async (tx) => {
        // 先以条件更新认领 quoted→ordered；count===0 说明已被并发请求受理过 → 不开单（防双重履约）
        const claim = await tx.bundle.updateMany({ where: { id: bundle.id, status: 'quoted' }, data: { status: 'ordered' } })
        if (claim.count === 0) return { ok: false, detail: '套餐已被受理，请勿重复操作' }
        const out: { orderId: string; productId: string; brandId: string; amount: number; matchedContractId: string | null; subscriptionId: string | null }[] = []
        for (let i = 0; i < ordered.length; i++) {
          const p = ordered[i]
          const oid = 'O-' + shortId()
          await tx.order.create({ data: { id: oid, time: '实时', brandId: p.brandId, agentId: dto.agentId, channel, type, amount: alloc[i], plan: p.name, mid: 'M-RT', productId: p.id, bundleId: bundle.id } })
          const r = await this.fulfillment.ingestOrder(tx as never, { id: oid, brandId: p.brandId, agentId: dto.agentId, productId: p.id, amount: alloc[i], type, plan: p.name })
          out.push({ orderId: oid, productId: p.id, brandId: p.brandId, amount: alloc[i], matchedContractId: r.matchedContractId, subscriptionId: r.subscriptionId })
        }
        const totalAllocated = sum(out.map((r) => r.amount))
        await this.audit.recordInTx(tx, { user, action: 'bundle.fulfill', resource: 'Bundle', resourceId: id, detail: `套餐 ${id} 受理 → 拆 ${out.length} 笔订单 ¥${toYuan(totalAllocated)} 经 ${dto.agentId} 履约` })
        return { ok: true, bundleId: id, orderIds: out.map((r) => r.orderId), matched: out, totalAllocated }
      })
    }, id)
    return replayed ? { ...result, replayed: true } : result
  }
}
