import { Body, Controller, Delete, ForbiddenException, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger'
import { IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma.service'
import { AuditService } from '../audit/audit.service'
import { IdempotencyService } from '../common/idempotency.service'
import { MetricsService } from '../common/metrics.service'
import { ReconciliationService } from './reconciliation.service'
import { SettlementService } from './settlement.service'
import { ReserveReleaseService } from './reserve-release.service'
import { FulfillmentService } from './fulfillment.service'
import { RequirePerms, CurrentUser, type AuthUser } from '../rbac/rbac'

// 防碰撞 ID：randomUUID 短码，避免 Date.now() 同毫秒生成相同主键 → 事务内 P2002
const shortId = () => randomUUID().replace(/-/g, '').slice(0, 10)
// 工单退款无关联原单时的兜底金额（演示数据缺口用；生产应改为强制关联原单）
const DEFAULT_TICKET_AMOUNT = 33
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
    private reserve: ReserveReleaseService,
    private fulfillment: FulfillmentService,
  ) {}

  // 对账：核对退款流水↔结算冲账（定时任务亦调用同方法；此处供手动触发）
  @Post('reconciliation/run') @RequirePerms('settlement.clear') @ApiOperation({ summary: '触发对账（恒等式 I + 释放守恒 II/III/IV，差异写审计）' })
  runReconciliation(@CurrentUser() user: AuthUser) {
    this.assertPlatform(user)
    return this.recon.run()
  }

  // ── 风险准备金分期释放（资金动作：幂等 + 审计 fail-closed + 条件更新防并发）──
  @Get('reserve-releases') @RequirePerms('settlement.read') @ApiOperation({ summary: '准备金释放计划台账' })
  async reserveReleases(@CurrentUser() user: AuthUser) {
    return this.prisma.reserveRelease.findMany({ where: await this.reserveScope(user), orderBy: [{ settlementId: 'asc' }, { dueAt: 'asc' }] })
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
    })
    return replayed ? { ...result, replayed: true } : result
  }

  @Post('reserve/release-due') @RequirePerms('settlement.clear') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '批量释放所有到期准备金（端点先行，定时任务亦调用）· 幂等' })
  async releaseReserveDue(@CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
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
      return { ok: true, detail: `到期释放 ${released} 笔，合计 ¥${amount}`, released, amount, scanned: ids.length }
    })
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
  private static DENY = { id: '__scope_denied__' }
  private scope(user: AuthUser, field: 'brandId' | 'agentId' | 'id-brand' | 'id-agent'): Record<string, unknown> {
    if (!user || user.scopeType === 'platform') return {}
    if (!user.scopeId) return BusinessController.DENY // 非平台但无 scopeId：保守拒绝

    if (user.scopeType === 'brand') {
      if (field === 'brandId') return { brandId: user.scopeId }
      if (field === 'id-brand') return { id: user.scopeId }
      // 品牌方不拥有代理/按代理键的资源 → 拒绝
      return BusinessController.DENY
    }
    if (user.scopeType === 'agent') {
      if (field === 'agentId') return { agentId: user.scopeId }
      if (field === 'id-agent') return { id: user.scopeId }
      // 代理不拥有品牌/号池/结算（按品牌键的资源）→ 拒绝
      return BusinessController.DENY
    }
    return BusinessController.DENY
  }

  // 同时含 brandId 与 agentId 外键的资源（订单/工单）：
  //   品牌方按 brandId 收窄、代理按 agentId 收窄、平台不收窄。单一条件，不与 DENY 合并。
  private scopeOwned(user: AuthUser): Record<string, unknown> {
    if (!user || user.scopeType === 'platform') return {}
    if (!user.scopeId) return BusinessController.DENY
    if (user.scopeType === 'brand') return { brandId: user.scopeId }
    if (user.scopeType === 'agent') return { agentId: user.scopeId }
    return BusinessController.DENY
  }

  // 写端点归属校验（纵深防御）：非平台用户改某行前，断言该行属于其 scope。
  //   平台用户直接放行；客户写端点在 stage 2+ 上线时强制调用，杜绝越权改他人数据。
  //   语义：OR——任一维度命中即放行。用于「校验既存行归属」（行的 brandId/agentId 来自 DB，
  //   品牌方天然拥有牵涉某代理的工单/订单，故只需任一维度命中）。
  private assertOwns(user: AuthUser, ownerBrandId?: string | null, ownerAgentId?: string | null) {
    if (!user || user.scopeType === 'platform') return
    if (user.scopeType === 'brand' && ownerBrandId && ownerBrandId === user.scopeId) return
    if (user.scopeType === 'agent' && ownerAgentId && ownerAgentId === user.scopeId) return
    throw new ForbiddenException('无权操作不属于当前账户的资源')
  }

  // 创建端点归属校验（纵深防御，严格版）：归属字段来自客户 DTO 而非既存行，
  //   故 OR 语义不够——品牌方传自己的 brandId + 任意 agentId 会被 assertOwns 放行（短路）。
  //   这里强制：非平台创建者提供的每个维度都必须是自己（品牌方不得单方指派他人代理、
  //   代理不得归属他人品牌），杜绝伪造他人业绩/跨租户归因。平台创建者放行。
  private assertCreateAttribution(user: AuthUser, brandId?: string | null, agentId?: string | null) {
    if (!user || user.scopeType === 'platform') return
    if (user.scopeType === 'brand') {
      if (brandId !== user.scopeId) throw new ForbiddenException('品牌方只能为自己的品牌创建')
      if (agentId) throw new ForbiddenException('品牌方不得单方指派代理，请由代理主动接单')
      return
    }
    if (user.scopeType === 'agent') {
      if (agentId !== user.scopeId) throw new ForbiddenException('代理只能以自己的身份创建')
      return
    }
    throw new ForbiddenException('无权创建不属于当前账户的资源')
  }

  private assertPlatform(user: AuthUser) {
    if (!user || user.scopeType !== 'platform') throw new ForbiddenException('仅平台账户可执行该操作')
  }

  private async reserveScope(user: AuthUser): Promise<Record<string, unknown>> {
    if (!user || user.scopeType === 'platform') return {}
    if (!user.scopeId) return BusinessController.DENY
    if (user.scopeType === 'agent') return { agentId: user.scopeId }
    if (user.scopeType === 'brand') {
      const settlements = await this.prisma.settlement.findMany({ where: { brandId: user.scopeId }, select: { id: true } })
      return settlements.length ? { settlementId: { in: settlements.map((s) => s.id) } } : BusinessController.DENY
    }
    return BusinessController.DENY
  }

  private async assertReserveOwns(user: AuthUser, rrId: string) {
    if (!user || user.scopeType === 'platform') return
    const rr = await this.prisma.reserveRelease.findUnique({ where: { id: rrId } })
    if (!rr) return
    if (user.scopeType === 'agent') return this.assertOwns(user, null, rr.agentId)
    if (user.scopeType === 'brand') {
      const s = await this.prisma.settlement.findUnique({ where: { id: rr.settlementId }, select: { brandId: true } })
      return this.assertOwns(user, s?.brandId ?? null, null)
    }
    throw new ForbiddenException('无权操作不属于当前账户的资源')
  }

  private barterScope(user: AuthUser): Record<string, unknown> {
    if (!user || user.scopeType === 'platform') return { deletedAt: null }
    if (user.scopeType === 'brand' && user.scopeId) {
      return { deletedAt: null, OR: [{ initiatorBrandId: user.scopeId }, { counterpartyBrandId: user.scopeId }] }
    }
    return { ...BusinessController.DENY, deletedAt: null }
  }

  private assertBarterOwns(user: AuthUser, deal: { initiatorBrandId: string; counterpartyBrandId: string }) {
    if (!user || user.scopeType === 'platform') return
    if (user.scopeType === 'brand' && user.scopeId && (deal.initiatorBrandId === user.scopeId || deal.counterpartyBrandId === user.scopeId)) return
    throw new ForbiddenException('无权操作不属于当前账户的资源')
  }

  // ── reads ──（软删除：deletedAt=null 默认过滤）──
  @Get('brands') @RequirePerms('brand.read') @ApiOperation({ summary: '品牌列表（按 scope 收窄，排除已删除）' })
  brands(@CurrentUser() user: AuthUser) { return this.prisma.brand.findMany({ where: { ...this.scope(user, 'id-brand'), deletedAt: null }, orderBy: { gmvMtd: 'desc' } }) }

  @Get('agents') @RequirePerms('agent.read') @ApiOperation({ summary: '代理列表（按 scope 收窄，排除已删除）' })
  agents(@CurrentUser() user: AuthUser) { return this.prisma.agent.findMany({ where: { ...this.scope(user, 'id-agent'), deletedAt: null }, orderBy: { spendMtd: 'desc' } }) }

  @Get('merchants') @RequirePerms('merchant.read') @ApiOperation({ summary: '商户号/号池（按 scope 收窄，排除已删除；非平台用户 mid 脱敏）' })
  async merchants(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.merchantAccount.findMany({ where: { ...this.scope(user, 'brandId'), deletedAt: null } })
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
    return this.prisma.settlement.findMany({ where })
  }

  @Get('tickets') @RequirePerms('ticket.read') @ApiOperation({ summary: '投诉工单（按 scope 收窄）' })
  tickets(@CurrentUser() user: AuthUser) { return this.prisma.ticket.findMany({ where: this.scopeOwned(user) }) }

  @Get('summary') @RequirePerms('dashboard.view') @ApiOperation({ summary: '经营总览汇总（风险条/待办派生 · 按 scope 收窄）' })
  async summary(@CurrentUser() user: AuthUser) {
    // 纵深防御：即便某客户角色被赋予 dashboard.view，聚合也按其 scope 收窄，
    // 绝不泄漏全平台口径（平台用户 scope 返回 {} 全量，行为不变）。
    const mWhere = this.scope(user, 'brandId')
    const tWhere = this.scopeOwned(user)
    const sWhere = this.scope(user, 'brandId')
    const aWhere = this.scope(user, 'id-agent')
    const [merchants, tickets, settlements, agents] = await Promise.all([
      this.prisma.merchantAccount.findMany({ where: mWhere }),
      this.prisma.ticket.findMany({ where: tWhere }),
      this.prisma.settlement.findMany({ where: sWhere }),
      this.prisma.agent.findMany({ where: aWhere }),
    ])
    const fused = merchants.filter((m) => m.state === 'fused').length
    const suspended = merchants.filter((m) => m.state === 'throttled' || m.state === 'paused').length
    const reconcileDiff = settlements.reduce((a, s) => a + s.reconcileDiff, 0)
    return {
      pool: { fused, suspended },
      maxComplaint: merchants.length ? Math.max(...merchants.map((m) => m.complaintRate)) : 0,
      regTickets: tickets.filter((t) => t.level === 'regulatory' && t.status !== 'resolved').length,
      reconcileDiff,
      riskyAgents: agents.filter((a) => a.status !== 'active').length,
      pendingPayout: agents.reduce((a, x) => a + x.payoutPending, 0),
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
    })
    return replayed ? { ...result, replayed: true } : result
  }

  @Post('settlements/:id/reconcile') @RequirePerms('settlement.clear') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '对账差异核销 · 幂等' })
  async reconcile(@Param('id') id: string, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    const target = await this.prisma.settlement.findUnique({ where: { id }, select: { brandId: true } })
    if (target) this.assertOwns(user, target.brandId)
    const { result, replayed } = await this.idem.run(idemKey, 'settlement.reconcile', async () => {
      return this.prisma.$transaction(async (tx) => {
        await tx.settlement.update({ where: { id }, data: { status: 'cleared', reconcileDiff: 0 } })
        await this.audit.recordInTx(tx, { user, action: 'settlement.reconcile', resource: 'Settlement', resourceId: id, detail: `结算单 ${id} 对账差异已人工核销` })
        return { ok: true, detail: `结算单 ${id} 对账差异已人工核销` }
      })
    })
    return replayed ? { ...result, replayed: true } : result
  }

  // ── 工单退款 → 逆向冲账 → 代理分润/信用分（核心联动）· 幂等 + 事务内状态闸 ──
  @Post('tickets/:id/refund') @RequirePerms('ticket.handle') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '工单退款，联动逆向冲账与代理分润/信用分 · 幂等' })
  async refundTicket(@Param('id') id: string, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    const { result, replayed } = await this.idem.run(idemKey, 'ticket.refund', async () => {
      const t = await this.prisma.ticket.findUnique({ where: { id } })
      if (!t || t.status === 'resolved') return { ok: false, detail: '工单不存在或已解决' }
      this.assertOwns(user, t.brandId, t.agentId)
      const order = await this.prisma.order.findUnique({ where: { id: t.orderId } }).catch(() => null)
      // 有原单：以原单金额为准；金额为 0 视为异常拒绝（不凭空造钱）。
      // 无原单（演示数据缺口）：按品牌平均客单价兜底（DEFAULT_TICKET_AMOUNT），不再用魔法值 33。
      let amount: number
      if (order) {
        amount = Math.abs(order.amount)
        if (amount === 0) return { ok: false, detail: '关联订单金额为零，无法退款' }
      } else {
        amount = DEFAULT_TICKET_AMOUNT
      }
      let share = 0

      // 事务内：条件更新抢占工单 + 资金联动 + 审计同事务落库（fail-closed，审计失败则整笔回滚）
      const claimed = await this.prisma.$transaction(async (tx) => {
        const c = await tx.ticket.updateMany({ where: { id, status: { not: 'resolved' } }, data: { status: 'resolved', slaLeftMin: 0 } })
        if (c.count === 0) return false
        await tx.order.create({ data: { id: 'O-' + shortId(), time: '现在', brandId: t.brandId, agentId: t.agentId, channel: order?.channel ?? 'wechat', type: 'refund', amount: -amount, plan: order?.plan ?? '退款', mid: order?.mid ?? '' } })
        // 结算侧逆向冲账（比例走快照优先链）+ 代理侧分润回收并扣信用分（工单退款较重）
        const rev = await this.settle.applyRefundReversal(tx, { brandId: t.brandId, amount })
        share = rev.share
        await this.settle.applyAgentRefundImpact(tx, { agentId: t.agentId, share, withCredit: true })
        // 逆向追偿：优先从该结算单未释放的准备金计划行冲减（守恒式 II，不动 reserve/agentPayout）
        if (rev.settlement) await this.reserve.clawback(tx, rev.settlement.id, share)
        await this.audit.recordInTx(tx, { user, action: 'ticket.refund', resource: 'Ticket', resourceId: id, detail: `工单 ${id} 已退款 ¥${amount}，逆向冲账 ¥${share}，代理 ${t.agentId} 信用分 −4` })
        return true
      })
      if (!claimed) {
        this.metrics.recordFundAction('ticket.refund', 'reject')
        return { ok: false, detail: '工单已被处理' }
      }
      this.metrics.recordFundAction('ticket.refund', 'ok')
      this.metrics.addRefundAmount(amount)
      return { ok: true, detail: `工单 ${id} 已退款 ¥${amount}，联动冲账 ¥${share} 完成`, amount, share }
    })
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
    await this.prisma.agent.update({ where: { id }, data: { status: dto.status } })
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
        const r = await tx.agent.updateMany({ where: { id, payoutPending: amt }, data: { payoutPending: 0, settledTotal: a.settledTotal + amt } })
        if (r.count === 0) return { ok: false, detail: '提现状态已变更，请刷新重试' }
        await this.audit.recordInTx(tx, { user, action: 'agent.settle', resource: 'Agent', resourceId: id, detail: `代理 ${id} 提现结算 ¥${amt.toLocaleString('zh-CN')} 已打款` })
        return { ok: true, detail: `代理 ${id} 提现 ¥${amt} 已打款` }
      })
    })
    return replayed ? { ...result, replayed: true } : result
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
    const pref = dto.channel === 'wechat' ? 'WX' : dto.channel === 'alipay' ? 'AL' : 'BK'
    const id = `M-${pref}-${shortId().slice(0, 6)}`
    const mid = `${pref}${shortId()}`
    const m = await this.prisma.merchantAccount.create({ data: { id, brandId: dto.brandId, channel: dto.channel, mid, state: 'healthy', weight: dto.weight } })
    await this.audit.record({ user, action: 'merchant.create', resource: 'MerchantAccount', resourceId: id, detail: `号池新增商户号 ${id}（${dto.channel}）`, after: m })
    return { ok: true, detail: `商户号 ${id} 已加入号池`, id }
  }

  // ── 订单退款（无工单）· 幂等 ───────────────
  @Post('orders/:id/refund') @RequirePerms('order.refund') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '订单退款（订单冲正→结算冲账→代理分润回收）· 幂等' })
  async refundOrder(@Param('id') id: string, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    const { result, replayed } = await this.idem.run(idemKey, 'order.refund', async () => {
      const amount = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id } })
        if (!order || order.type === 'refund' || order.type === 'chargeback') return null
        this.assertOwns(user, order.brandId, order.agentId)
        const existingRefund = await tx.order.findFirst({ where: { brandId: order.brandId, agentId: order.agentId, plan: order.plan, type: 'refund', amount: -Math.abs(order.amount) } })
        if (existingRefund) return null
        const amt = Math.abs(order.amount)
        await tx.order.create({ data: { id: 'O-' + shortId(), time: '现在', brandId: order.brandId, agentId: order.agentId, channel: order.channel, type: 'refund', amount: -amt, plan: order.plan, mid: order.mid } })
        // 结算侧逆向冲账（比例走快照优先链）+ 代理侧分润回收（订单退款不扣信用分）
        const rev = await this.settle.applyRefundReversal(tx, { brandId: order.brandId, amount: amt })
        const share = rev.share
        await this.settle.applyAgentRefundImpact(tx, { agentId: order.agentId, share, withCredit: false })
        // 逆向追偿：优先从该结算单未释放的准备金计划行冲减（守恒式 II，不动 reserve/agentPayout）
        if (rev.settlement) await this.reserve.clawback(tx, rev.settlement.id, share)
        // 审计同事务（fail-closed）
        await this.audit.recordInTx(tx, { user, action: 'order.refund', resource: 'Order', resourceId: id, detail: `订单 ${id} 已退款 ¥${amt}，逆向冲账 ¥${share}` })
        return { amt, share }
      })
      if (!amount) {
        this.metrics.recordFundAction('order.refund', 'reject')
        return { ok: false, detail: '订单不存在或不可退款' }
      }
      this.metrics.recordFundAction('order.refund', 'ok')
      this.metrics.addRefundAmount(amount.amt)
      return { ok: true, detail: `订单 ${id} 已退款，联动冲账完成`, amount: amount.amt, share: amount.share }
    })
    return replayed ? { ...result, replayed: true } : result
  }

  // ── 工单：流转（转派/升级/关闭等）──────────
  @Patch('tickets/:id') @RequirePerms('ticket.handle') @ApiOperation({ summary: '工单流转（状态/责任人/备注）' })
  async updateTicket(@Param('id') id: string, @Body() dto: TicketUpdateDto, @CurrentUser() user: AuthUser) {
    const before = await this.prisma.ticket.findUnique({ where: { id } })
    if (!before) return { ok: false, detail: '工单不存在' }
    this.assertOwns(user, before.brandId, before.agentId)
    const data: Record<string, unknown> = {}
    if (dto.status !== undefined) data.status = dto.status
    if (dto.owner !== undefined) data.owner = dto.owner
    await this.prisma.ticket.update({ where: { id }, data })
    await this.audit.record({ user, action: 'ticket.update', resource: 'Ticket', resourceId: id, detail: `工单 ${id} ${dto.note ?? '已更新'}`, before: { status: before.status, owner: before.owner }, after: data })
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
    const ALLOWED_KEYS = ['platformFeeRate', 'defaultSharePct', 'complaintThreshold', 'escalatedThreshold', 'chargebackThreshold', 'slaDefaultMin', 'reserveDefaultPct', 'autoReconcile', 'channelWeChat', 'channelAlipay', 'channelBank', 'channelApple', 'channelGoogle', 'channelStripe', 'channelPaypal']
    const entries = Object.entries(body || {}).filter(([k]) => ALLOWED_KEYS.includes(k))
    for (const [key, value] of entries) {
      const v = typeof value === 'string' ? value : JSON.stringify(value)
      await this.prisma.config.upsert({ where: { key }, create: { key, value: v }, update: { value: v } })
    }
    await this.audit.record({ user, action: 'config.write', resource: 'Config', resourceId: '-', detail: `平台配置已更新（${entries.length} 项）`, after: body })
    return { ok: true, detail: `已保存 ${entries.length} 项配置` }
  }

  // ── 订阅商品审核（内部）──
  @Get('products') @RequirePerms('product.read') @ApiOperation({ summary: '全平台订阅商品列表（审核视角，按 scope 收窄；含品牌名以免依赖前端 mock）' })
  async products(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.product.findMany({ where: { ...this.scope(user, 'brandId'), deletedAt: null }, orderBy: { createdAt: 'desc' } })
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
    const id = 'BR-' + randomUUID().slice(0, 6)
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
    return this.prisma.growthContract.findMany({ where: { ...this.scope(user, 'brandId'), deletedAt: null }, orderBy: { createdAt: 'desc' } })
  }

  @Post('contracts') @RequirePerms('contract.write') @ApiOperation({ summary: '创建增长合约（内部）' })
  async addContract(@Body() dto: NewContractDto, @CurrentUser() user: AuthUser) {
    this.assertCreateAttribution(user, dto.brandId, dto.agentId ?? null)
    const id = 'GC-' + randomUUID().slice(0, 6)
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
    await this.prisma.growthContract.update({ where: { id }, data: { status: dto.status } })
    await this.audit.record({ user, action: 'contract.status', resource: 'GrowthContract', resourceId: id, detail: `合约 ${id} → ${dto.status}` })
    return { ok: true }
  }

  // ── 资源置换（内部 CRUD）──
  @Get('barter') @RequirePerms('barter.view') @ApiOperation({ summary: '资源置换台账（按 scope 收窄）' })
  barter(@CurrentUser() user: AuthUser) { return this.prisma.barterDeal.findMany({ where: this.barterScope(user), orderBy: { createdAt: 'desc' } }) }

  @Post('barter') @RequirePerms('barter.write') @ApiOperation({ summary: '创建资源置换单（内部）' })
  async addBarter(@Body() dto: NewBarterDto, @CurrentUser() user: AuthUser) {
    this.assertOwns(user, dto.initiatorBrandId)
    // 数据完整性（对齐门户 proposeBarter）：对手品牌必须存在且未删除、且非自身——
    //   否则会落悬空外键，污染门户 OR-scope 视图。
    if (dto.counterpartyBrandId === dto.initiatorBrandId) return { ok: false, detail: '对手品牌不能是自己' }
    const cp = await this.prisma.brand.findFirst({ where: { id: dto.counterpartyBrandId, deletedAt: null } })
    if (!cp) return { ok: false, detail: '对手品牌不存在或已删除' }
    const id = 'BD-' + randomUUID().slice(0, 6)
    await this.prisma.barterDeal.create({ data: { id, initiatorBrandId: dto.initiatorBrandId, counterpartyBrandId: dto.counterpartyBrandId, resourceType: dto.resourceType, myQuota: dto.myQuota, counterpartyQuota: dto.counterpartyQuota, ...(dto.invoiceStatus ? { invoiceStatus: dto.invoiceStatus } : {}), terms: JSON.stringify(dto.terms ?? {}) } })
    await this.audit.record({ user, action: 'barter.create', resource: 'BarterDeal', resourceId: id, detail: `置换单 ${id}` })
    return { ok: true, id }
  }

  @Patch('barter/:id/status') @RequirePerms('barter.write') @ApiOperation({ summary: '资源置换状态流转（内部）' })
  async setBarterStatus(@Param('id') id: string, @Body() dto: BarterStatusDto, @CurrentUser() user: AuthUser) {
    const deal = await this.prisma.barterDeal.findFirst({ where: { id, deletedAt: null } })
    if (!deal) return { ok: false, detail: '置换单不存在' }
    this.assertBarterOwns(user, deal)
    await this.prisma.barterDeal.update({ where: { id }, data: { status: dto.status } })
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
  private notifWhere(user: AuthUser): Record<string, unknown> {
    const or: Record<string, unknown>[] = [{ userId: user.id }]
    if (user.scopeType === 'platform') or.push({ scopeType: 'platform' })
    else if (user.scopeId) or.push({ scopeType: user.scopeType, scopeId: user.scopeId })
    return { OR: or }
  }

  // ── 正向订单写入（履约入口）：触发履约引擎累加 + 订阅 upsert ──
  // 这是 achievedGmv 唯一被推进的入口；绝不触碰结算恒等式五项。
  @Post('fulfillment/ingest') @RequirePerms('contract.write') @ApiOperation({ summary: '正向订单写入：履约累加 + 订阅聚合（写权限，不动结算恒等式）' })
  async ingest(@Body() dto: OrderIngestDto, @CurrentUser() user: AuthUser) {
    this.assertCreateAttribution(user, dto.brandId, dto.agentId)
    const id = 'O-' + randomUUID().slice(0, 6)
    const res = await this.prisma.$transaction(async (tx) => {
      await tx.order.create({
        data: { id, time: '实时', brandId: dto.brandId, agentId: dto.agentId, channel: dto.channel ?? 'wechat', type: dto.type, amount: dto.amount, plan: dto.plan, mid: 'M-RT', productId: dto.productId ?? null },
      })
      // 履约引擎：匹配合约累加 achievedGmv + 推进状态 + 订阅 upsert（事务内）
      const r = await this.fulfillment.ingestOrder(tx as never, { id, brandId: dto.brandId, agentId: dto.agentId, productId: dto.productId, amount: dto.amount, type: dto.type, plan: dto.plan })
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
    const level = dto.level ?? 'normal'
    // SLA 时限按级别：监管 24h、升级 48h、普通 72h（分钟）
    const slaLeftMin = level === 'regulatory' ? 1440 : level === 'escalated' ? 2880 : 4320
    const id = 'TK-' + randomUUID().slice(0, 6)
    await this.prisma.ticket.create({
      data: {
        id, time: '实时', source: dto.source, level, status: 'open', slaLeftMin,
        brandId, agentId: agentId || '未知', orderId, reason: dto.reason,
        owner: '未分配', note: dto.externalRef ? `外部单号 ${dto.externalRef}` : '',
      },
    })
    // 广播通知给品牌（落消息，不进资金事务）
    await this.prisma.notification.create({
      data: { id: 'NT-' + randomUUID().slice(0, 6), userId: null, scopeType: 'brand', scopeId: brandId, category: 'ticket', title: '新投诉工单', body: `来自${dto.source}的投诉：${dto.reason.slice(0, 30)}`, link: '/portal/brand/tickets', read: false },
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
    const listSum = ordered.reduce((s, p) => s + p.firstPrice, 0)
    const final = bundle.finalPrice
    // 服务端权威分摊：按 firstPrice 比例分；末项 = final − 前 n−1 之和，吸收四舍五入残差。
    // 残差可正可负（toFixed 进位会令前项之和略超 final），不可 clamp 到 0，否则 ∑ 会大于 final（多收钱/虚增 GMV）。
    const alloc: number[] = []
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = listSum > 0 ? +(final * ordered[i].firstPrice / listSum).toFixed(2) : +(final / ordered.length).toFixed(2)
      alloc.push(a)
    }
    alloc.push(+(final - alloc.reduce((s, x) => s + x, 0)).toFixed(2)) // 末项残差校正，保证 ∑ = final
    // 若末项被前项进位挤成负数，把缺口从“当前最大项”扣除，保持 ∑ 不变且各项 ≥ 0
    if (alloc[alloc.length - 1] < 0 && alloc.length > 1) {
      const deficit = alloc[alloc.length - 1]
      alloc[alloc.length - 1] = 0
      let maxIdx = 0
      for (let i = 1; i < alloc.length - 1; i++) if (alloc[i] > alloc[maxIdx]) maxIdx = i
      alloc[maxIdx] = +(alloc[maxIdx] + deficit).toFixed(2) // deficit 为负 → 扣减
    }
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
          const oid = 'O-' + randomUUID().slice(0, 6)
          await tx.order.create({ data: { id: oid, time: '实时', brandId: p.brandId, agentId: dto.agentId, channel, type, amount: alloc[i], plan: p.name, mid: 'M-RT', productId: p.id, bundleId: bundle.id } })
          const r = await this.fulfillment.ingestOrder(tx as never, { id: oid, brandId: p.brandId, agentId: dto.agentId, productId: p.id, amount: alloc[i], type, plan: p.name })
          out.push({ orderId: oid, productId: p.id, brandId: p.brandId, amount: alloc[i], matchedContractId: r.matchedContractId, subscriptionId: r.subscriptionId })
        }
        const totalAllocated = +out.reduce((s, r) => s + r.amount, 0).toFixed(2)
        await this.audit.recordInTx(tx, { user, action: 'bundle.fulfill', resource: 'Bundle', resourceId: id, detail: `套餐 ${id} 受理 → 拆 ${out.length} 笔订单 ¥${totalAllocated} 经 ${dto.agentId} 履约` })
        return { ok: true, bundleId: id, orderIds: out.map((r) => r.orderId), matched: out, totalAllocated }
      })
    })
    return replayed ? { ...result, replayed: true } : result
  }
}
