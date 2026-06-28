import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma.service'
import { AuditService } from '../audit/audit.service'
import { RequirePerms, CurrentUser, type AuthUser } from '../rbac/rbac'
import { presetToRange, presetToMonthKeys, type PeriodValue } from '../common/period'

class PortalProductDto {
  @IsString() @MaxLength(60) name!: string
  @IsOptional() @IsString() @MaxLength(40) category?: string
  @IsOptional() @IsString() @MaxLength(200) description?: string
  @IsOptional() @IsIn(['monthly', 'yearly', 'continuous']) billingCycle?: string
  @IsNumber() @Min(0) firstPrice!: number
  @IsNumber() @Min(0) renewPrice!: number
  @IsOptional() @IsNumber() @Min(0) @Max(100) defaultSharePct?: number
  // 富录入（零迁移，模型已有）
  @IsOptional() @IsBoolean() bundleEligible?: boolean
  @IsOptional() @IsString() @MaxLength(40) exclusiveGroup?: string
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) tags?: string[]
}
class PortalContractDto {
  @IsOptional() @IsString() @MaxLength(40) agentId?: string
  @IsOptional() @IsString() @MaxLength(40) productId?: string
  @IsIn(['cps_share', 'floor_tiered', 'mutual_quota']) settleModel!: string
  @IsOptional() @IsNumber() @Min(0) targetGmv?: number
  // 富录入：品牌可填自己的结算参数/用户限定/风控条款（settleParams 不再硬编码）
  @IsOptional() settleParams?: Record<string, unknown>
  @IsOptional() userLimit?: Record<string, unknown>
  @IsOptional() @IsIn(['D30', 'D60', 'D90']) ltvWindow?: string
  @IsOptional() @IsIn(['agent', 'brand', 'shared']) complaintLiability?: string
  @IsOptional() @IsInt() @Min(0) @Max(100) reservePct?: number
}
class PortalBarterDto {
  @IsString() @MaxLength(40) counterpartyBrandId!: string
  @IsString() @MaxLength(40) resourceType!: string
  @IsNumber() @Min(0) myQuota!: number
  @IsNumber() @Min(0) counterpartyQuota!: number
  @IsOptional() @IsIn(['pending', 'partial', 'done']) invoiceStatus?: string
  @IsOptional() terms?: Record<string, unknown>
}
class PortalSummaryQueryDto {
  @IsOptional() @IsIn(['today', 'week', 'month', 'quarter', 'custom']) preset?: string
  @IsOptional() @IsISO8601() from?: string
  @IsOptional() @IsISO8601() to?: string
}
class PortalClaimDto {
  @IsString() @MaxLength(40) brandId!: string
  @IsOptional() @IsString() @MaxLength(40) productId?: string
  @IsOptional() @IsString() @MaxLength(20) channel?: string
}
class PayoutRequestDto {
  @IsNumber() @Min(1) amount!: number
}
class BarterRespondDto {
  @IsIn(['accept', 'reject']) action!: string
}
// 门户订单筛选（type/周期；scope 由 brandId 注入，前端不可传）。
// type 取值对齐真实 Order.type 集合：first / renew / refund / chargeback。'refund' 视为退款+拒付合并筛选。
class PortalOrderQueryDto {
  @IsOptional() @IsIn(['first', 'renew', 'refund', 'chargeback']) type?: string
  @IsOptional() @IsISO8601() dateFrom?: string
  @IsOptional() @IsISO8601() dateTo?: string
}
// 门户结算单筛选（period 前缀分桶 / 状态）
class PortalSettlementQueryDto {
  @IsOptional() @IsString() @MaxLength(20) period?: string
  @IsOptional() @IsIn(['pending', 'cleared', 'reconciling', 'frozen']) status?: string
}
// 工单处理（服务商/品牌登记处理办法 + 回复 + 流转状态）
class TicketReplyDto {
  @IsOptional() @IsString() @MaxLength(500) handlePlan?: string
  @IsOptional() @IsString() @MaxLength(500) note?: string
  @IsOptional() @IsIn(['open', 'processing', 'resolved']) status?: string
}

// 结算单按周期聚合成趋势点（品牌真实成交规模，远比少量订单代表性强）。
// 周期字符串如「2026-05 月结」「2026-06 上半月」，按字典序近似时间序，取最近 12 个。
function settlementTrend(settlements: { period: string; gross: number }[]): { date: string; value: number }[] {
  const byPeriod = new Map<string, number>()
  for (const s of settlements) byPeriod.set(s.period, (byPeriod.get(s.period) ?? 0) + s.gross)
  return [...byPeriod.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-12)
    .map(([date, value]) => ({ date: date.replace(/^\d{4}-/, '').replace(' 月结', '').replace(' 上半月', '·上').replace(' 下半月', '·下'), value: Math.round(value) }))
}

// 订单按天聚合（代理带单趋势：用真实 createdAt，退款/拒付计负，取最近 14 天）。
function orderTrend(orders: { createdAt: Date; amount: number; type: string }[]): { date: string; value: number }[] {
  const byDay = new Map<string, number>()
  for (const o of orders) {
    const day = o.createdAt.toISOString().slice(5, 10) // MM-DD
    const signed = o.type === 'refund' || o.type === 'chargeback' ? -o.amount : o.amount
    byDay.set(day, (byDay.get(day) ?? 0) + signed)
  }
  return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-14).map(([date, value]) => ({ date, value: Math.round(value) }))
}

// 客户门户专属端点：全部按当前账户 scope 收窄，且对品牌做字段裁剪
// （绝不返回 platformFee / agentPayout / 抽成口径）。客户角色只持 portal.* 权限，
// 这些端点是客户唯一能打的业务数据入口。
@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private scopeId(user: AuthUser, type: 'brand' | 'agent'): string {
    if (!user || user.scopeType !== type || !user.scopeId) throw new ForbiddenException('账户范围不匹配')
    return user.scopeId
  }

  // ── 客户首页聚合（品牌 / 代理各一套口径，只含自己可见指标）──
  // 可选周期参数：代理按 createdAt 真实区间过滤订单；品牌按 YYYY-MM 前缀分桶过滤结算。无参=现行为。
  @Get('summary')
  @RequirePerms('portal.brand.home', 'portal.agent.home')
  async summary(@CurrentUser() user: AuthUser, @Query() q: PortalSummaryQueryDto) {
    const period: PeriodValue | null = q.preset ? { preset: q.preset as PeriodValue['preset'], from: q.from, to: q.to } : null
    if (user.scopeType === 'brand') {
      const id = user.scopeId!
      const [brand, orderCount, allSettlements, tickets] = await Promise.all([
        this.prisma.brand.findFirst({ where: { id, deletedAt: null } }),
        this.prisma.order.count({ where: { brandId: id } }),
        this.prisma.settlement.findMany({ where: { brandId: id } }),
        this.prisma.ticket.count({ where: { brandId: id, status: { not: 'resolved' } } }),
      ])
      // 周期过滤结算（前缀分桶）；无周期则全量
      const monthKeys = period ? presetToMonthKeys(period) : null
      const settlements = monthKeys ? allSettlements.filter((s) => monthKeys.some((k) => s.period.startsWith(k))) : allSettlements
      return {
        scope: 'brand',
        gmvMtd: brand?.gmvMtd ?? 0,
        activeSubs: brand?.activeSubs ?? 0,
        renewalRate: brand?.renewalRate ?? 0,
        complaintRate: brand?.complaintRate ?? 0,
        orders: orderCount,
        // 只暴露品牌自己的回款侧，不含平台费/代理分润
        brandShare: settlements.reduce((a, s) => a + s.brandShare, 0),
        periodGross: settlements.reduce((a, s) => a + s.gross, 0),
        pendingTickets: tickets,
        trend: settlementTrend(settlements), // 按结算周期的成交规模趋势
      }
    }
    if (user.scopeType === 'agent') {
      const id = user.scopeId!
      const range = period ? presetToRange(period) : null
      const orderWhere = { agentId: id, ...(range && (range.from || range.to) ? { createdAt: { ...(range.from ? { gte: new Date(range.from) } : {}), ...(range.to ? { lte: new Date(range.to) } : {}) } } : {}) }
      const [agent, orderRows, contracts] = await Promise.all([
        this.prisma.agent.findFirst({ where: { id, deletedAt: null } }),
        this.prisma.order.findMany({ where: orderWhere, orderBy: { createdAt: 'asc' } }),
        this.prisma.growthContract.count({ where: { agentId: id, deletedAt: null } }),
      ])
      // Top 品牌榜（按带单成交，退款计负）——供经营看板，仅聚合自己的订单
      const byBrand = new Map<string, number>()
      for (const o of orderRows) {
        const signed = o.type === 'refund' || o.type === 'chargeback' ? -o.amount : o.amount
        byBrand.set(o.brandId, (byBrand.get(o.brandId) ?? 0) + signed)
      }
      const topBrands = [...byBrand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([brandId, value]) => ({ brandId, value: Math.round(value) }))
      return {
        scope: 'agent',
        spendMtd: agent?.spendMtd ?? 0,
        firstOrders: agent?.firstOrders ?? 0,
        payoutPending: agent?.payoutPending ?? 0,
        creditScore: agent?.creditScore ?? 0,
        renewalRate: agent?.renewalRate ?? 0,
        orders: orderRows.length,
        acceptedContracts: contracts,
        topBrands,
        trend: orderTrend(orderRows), // 近 14 天带单成交趋势
      }
    }
    throw new ForbiddenException('仅客户账户可访问')
  }

  // ── 品牌：我的订单（scope + 去 agentId 明文）──
  @Get('brand/orders')
  @RequirePerms('portal.brand.orders')
  async brandOrders(@CurrentUser() user: AuthUser, @Query() q: PortalOrderQueryDto) {
    const id = this.scopeId(user, 'brand')
    // 先建 filter 再注入 scope（红线：scope 覆盖任何客户端传参，杜绝越权）
    const where: Record<string, unknown> = {}
    // 'refund' 同时覆盖退款与拒付；其余类型精确匹配
    if (q.type) where.type = q.type === 'refund' ? { in: ['refund', 'chargeback'] } : q.type
    if (q.dateFrom || q.dateTo) where.createdAt = { ...(q.dateFrom ? { gte: new Date(q.dateFrom) } : {}), ...(q.dateTo ? { lte: new Date(q.dateTo) } : {}) }
    where.brandId = id // scope-last
    const rows = await this.prisma.order.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200 })
    // 去掉 agentId 明文，仅保留脱敏渠道标识
    return rows.map((o) => ({ id: o.id, brandId: o.brandId, plan: o.plan, type: o.type, amount: o.amount, time: o.time, channel: o.agentId ? '渠道#' + o.agentId.slice(-4) : '直营' }))
  }

  // ── 品牌：我的结算单（脱敏：只 gross/brandShare/reserve/状态/账期，剔除平台费/代理分润）──
  @Get('brand/settlements')
  @RequirePerms('portal.brand.settlement')
  async brandSettlements(@CurrentUser() user: AuthUser, @Query() q: PortalSettlementQueryDto) {
    const id = this.scopeId(user, 'brand')
    const where: Record<string, unknown> = {}
    if (q.period) where.period = { startsWith: q.period }
    if (q.status) where.status = q.status
    where.brandId = id // scope-last（红线）
    const rows = await this.prisma.settlement.findMany({ where })
    return rows.map((s) => ({
      id: s.id,
      brandId: s.brandId,
      period: s.period,
      gross: s.gross,
      brandShare: s.brandShare,
      reserve: s.reserve,
      status: s.status,
      // 字段白名单：platformFee / agentPayout / reversal / frozen 一律不返回
    }))
  }

  // ── 品牌：我的入驻（scope→自己一条，去完整 mid）──
  @Get('brand/onboarding')
  @RequirePerms('portal.brand.onboarding')
  async brandOnboarding(@CurrentUser() user: AuthUser) {
    const id = this.scopeId(user, 'brand')
    const brand = await this.prisma.brand.findFirst({ where: { id, deletedAt: null } })
    if (!brand) return null
    return { id: brand.id, name: brand.name, status: brand.status, category: brand.category, feeRate: brand.feeRate, period: brand.period, reservePct: brand.reservePct, path: brand.path, joinedAt: brand.joinedAt }
  }

  // ── 品牌：我的工单（scope，含处理办法/回复字段）──
  @Get('brand/tickets')
  @RequirePerms('portal.brand.tickets')
  async brandTickets(@CurrentUser() user: AuthUser) {
    const id = this.scopeId(user, 'brand')
    return this.prisma.ticket.findMany({ where: { brandId: id }, orderBy: [{ status: 'asc' }, { slaLeftMin: 'asc' }] })
  }

  // 工单处置共享逻辑（品牌/代理回复同一套：assertOwns + 登记处置字段 + SLA 冻结 + 审计）。
  // 单源，避免 SLA-冻结等业务规则在两个端点各写一份而漂移。
  private async replyTicketAs(actor: 'brand' | 'agent', scopeId: string, id: string, user: AuthUser, dto: TicketReplyDto) {
    const t = await this.prisma.ticket.findFirst({ where: { id, [actor === 'brand' ? 'brandId' : 'agentId']: scopeId } })
    if (!t) return { ok: false, detail: '工单不存在或不属于你' }
    const data: Record<string, unknown> = { handledBy: `${actor}:${scopeId}` }
    if (dto.handlePlan !== undefined) data.handlePlan = dto.handlePlan
    if (dto.note !== undefined) data.note = dto.note
    if (dto.status) data.status = dto.status
    if (dto.status === 'resolved') data.slaLeftMin = 0 // 解决即冻结 SLA 倒计时（与退款解决路径一致）
    await this.prisma.ticket.update({ where: { id }, data })
    const who = actor === 'brand' ? `品牌 ${scopeId} 处理` : `代理 ${scopeId} 协助处理`
    await this.audit.record({ user, action: 'ticket.reply', resource: 'Ticket', resourceId: id, detail: `${who}工单 ${id}${dto.status ? ` → ${dto.status}` : ''}`, after: data })
    return { ok: true, detail: '工单已更新' }
  }

  // ── 品牌：处理工单（登记处理办法 / 回复 / 流转状态）──
  // 红线：只能处理 brandId == 自己 scope 的工单（assertOwns），且只改处置字段不碰资金。
  @Post('brand/tickets/:id/reply')
  @RequirePerms('portal.brand.tickets')
  async brandReplyTicket(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: TicketReplyDto) {
    return this.replyTicketAs('brand', this.scopeId(user, 'brand'), id, user, dto)
  }

  // ── 代理：相关工单（自己渠道引发的售后，可协助处理）──
  @Get('agent/tickets')
  @RequirePerms('portal.agent.tickets')
  async agentTickets(@CurrentUser() user: AuthUser) {
    const agentId = this.scopeId(user, 'agent')
    return this.prisma.ticket.findMany({ where: { agentId }, orderBy: [{ status: 'asc' }, { slaLeftMin: 'asc' }] })
  }

  // ── 代理：协助处理工单（登记处理办法 / 回复 / 状态）──
  @Post('agent/tickets/:id/reply')
  @RequirePerms('portal.agent.tickets')
  async agentReplyTicket(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: TicketReplyDto) {
    return this.replyTicketAs('agent', this.scopeId(user, 'agent'), id, user, dto)
  }

  // ── 品牌：资源置换（OR-scope：我发起的 OR 待我确认的）──
  @Get('brand/barter')
  @RequirePerms('portal.brand.contracts')
  async brandBarter(@CurrentUser() user: AuthUser) {
    const id = this.scopeId(user, 'brand')
    const rows = await this.prisma.barterDeal.findMany({
      where: { deletedAt: null, OR: [{ initiatorBrandId: id }, { counterpartyBrandId: id }] },
      orderBy: { createdAt: 'desc' },
    })
    // 标注「我是发起方还是对手方」便于前端区分
    return rows.map((d) => ({ ...d, iAmInitiator: d.initiatorBrandId === id, partner: d.initiatorBrandId === id ? d.counterpartyBrandId : d.initiatorBrandId }))
  }

  // ── 品牌/代理：我的增长合约（单方视图：品牌看我发的、代理看我接的）──
  @Get('contracts')
  @RequirePerms('portal.brand.contracts', 'portal.agent.contracts')
  async contracts(@CurrentUser() user: AuthUser) {
    if (user.scopeType === 'brand') return this.prisma.growthContract.findMany({ where: { brandId: user.scopeId!, deletedAt: null } })
    if (user.scopeType === 'agent') {
      // 代理看：我接的单 + 可接的挂单（open + agentId:null）
      return this.prisma.growthContract.findMany({
        where: { deletedAt: null, OR: [{ agentId: user.scopeId! }, { agentId: null, status: 'open' }] },
        orderBy: { createdAt: 'desc' },
      })
    }
    throw new ForbiddenException('仅客户账户可访问')
  }

  // ── 代理：选品市场（公开 live 品牌目录，脱敏：只投放字段，不含 gmvMtd/activeSubs）──
  @Get('market/brands')
  @RequirePerms('portal.agent.market')
  async marketBrands() {
    const rows = await this.prisma.brand.findMany({ where: { status: 'live', deletedAt: null }, orderBy: { renewalRate: 'desc' } })
    return rows.map((b) => ({ id: b.id, name: b.name, mark: b.mark, category: b.category, feeRate: b.feeRate, period: b.period, renewalRate: b.renewalRate, complaintRate: b.complaintRate }))
  }

  // ── 代理：我的分润（scope→自己一条）──
  @Get('agent/payouts')
  @RequirePerms('portal.agent.payouts')
  async agentPayouts(@CurrentUser() user: AuthUser) {
    const id = this.scopeId(user, 'agent')
    const agent = await this.prisma.agent.findFirst({ where: { id, deletedAt: null } })
    if (!agent) return null
    return { id: agent.id, name: agent.name, payoutPending: agent.payoutPending, settledTotal: agent.settledTotal, deposit: agent.deposit, roi: agent.roi, spendMtd: agent.spendMtd }
  }

  // ── 代理：我的信用分（scope→自己，绝不含风控规则全文）──
  @Get('agent/credit')
  @RequirePerms('portal.agent.credit')
  async agentCredit(@CurrentUser() user: AuthUser) {
    const id = this.scopeId(user, 'agent')
    const agent = await this.prisma.agent.findFirst({ where: { id, deletedAt: null } })
    if (!agent) return null
    return { id: agent.id, name: agent.name, creditScore: agent.creditScore, status: agent.status, refundRate: agent.refundRate, complaintRate: agent.complaintRate, renewalRate: agent.renewalRate }
  }

  // ── 代理：我的投放计划（scope→自己的订单作为投放回收）──
  @Get('agent/plans')
  @RequirePerms('portal.agent.plans')
  async agentPlans(@CurrentUser() user: AuthUser) {
    const id = this.scopeId(user, 'agent')
    const orders = await this.prisma.order.findMany({ where: { agentId: id }, orderBy: [{ createdAt: 'desc' }], take: 100 })
    return orders.map((o) => ({ id: o.id, brandId: o.brandId, plan: o.plan, type: o.type, amount: o.amount, time: o.time }))
  }

  // ── 代理：接挂单合约（agentId:null + open → 置 agentId=自己 + active）──
  //   条件更新防并发：两个代理同时接同一单，只有一个 count=1 成功（复用 clear 的范式）。
  @Post('contracts/:id/claim')
  @RequirePerms('portal.agent.contracts')
  async claimContract(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const agentId = this.scopeId(user, 'agent')
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.growthContract.updateMany({
        where: { id, agentId: null, status: 'open', deletedAt: null },
        data: { agentId, status: 'active', signedAt: new Date() },
      })
      if (r.count === 0) return { ok: false, detail: '该合约不可接单（不存在 / 已被接走 / 非挂单态）' }
      await this.audit.recordInTx(tx, { user, action: 'contract.claim', resource: 'GrowthContract', resourceId: id, detail: `代理 ${agentId} 接单合约 ${id}`, after: { agentId, status: 'active' } })
      return { ok: true, detail: `已接单合约 ${id}` }
    })
  }

  // ════ 债3 客户主动操作 ════

  // ── 品牌：上架订阅商品（status=draft）+ 提交审核 ──
  @Get('brand/products') @RequirePerms('portal.brand.products') @ApiOperation({ summary: '品牌-我的订阅商品' })
  async brandProducts(@CurrentUser() user: AuthUser) {
    const id = this.scopeId(user, 'brand')
    return this.prisma.product.findMany({ where: { brandId: id, deletedAt: null }, orderBy: { createdAt: 'desc' } })
  }

  @Post('brand/products') @RequirePerms('portal.brand.products') @ApiOperation({ summary: '品牌上架商品（草稿）' })
  async addBrandProduct(@Body() dto: PortalProductDto, @CurrentUser() user: AuthUser) {
    const brandId = this.scopeId(user, 'brand')
    const id = 'PRD-' + randomUUID().slice(0, 6)
    await this.prisma.product.create({ data: { id, brandId, name: dto.name, category: dto.category ?? '', description: dto.description ?? '', billingCycle: dto.billingCycle ?? 'continuous', firstPrice: dto.firstPrice, renewPrice: dto.renewPrice, defaultSharePct: dto.defaultSharePct ?? 30, status: 'draft', bundleEligible: dto.bundleEligible ?? true, exclusiveGroup: (dto.exclusiveGroup ?? '').slice(0, 40), tags: JSON.stringify(dto.tags ?? []) } })
    await this.audit.record({ user, action: 'product.create', resource: 'Product', resourceId: id, detail: `品牌 ${brandId} 上架商品 ${dto.name}（草稿）` })
    return { ok: true, id }
  }

  @Post('brand/products/:id/submit') @RequirePerms('portal.brand.products') @ApiOperation({ summary: '提交商品审核（draft→pending）' })
  async submitProduct(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const brandId = this.scopeId(user, 'brand')
    const r = await this.prisma.product.updateMany({ where: { id, brandId, status: 'draft', deletedAt: null }, data: { status: 'pending' } })
    if (r.count === 0) return { ok: false, detail: '仅自己的草稿商品可提交' }
    await this.notify('platform', null, 'product', '有新商品待审核', `${brandId} 提交商品上架待审`, '/products')
    await this.audit.record({ user, action: 'product.submit', resource: 'Product', resourceId: id, detail: `商品 ${id} 提交审核` })
    return { ok: true, detail: '已提交审核' }
  }

  // ── 品牌：发起增长合约（强制挂单 open，由代理主动接单，不可单方指派 active）──
  @Post('contracts') @RequirePerms('portal.brand.contracts') @ApiOperation({ summary: '品牌发起增长合约（挂单，待代理接单）' })
  async proposeContract(@Body() dto: PortalContractDto, @CurrentUser() user: AuthUser) {
    const brandId = this.scopeId(user, 'brand')
    const id = 'GC-' + randomUUID().slice(0, 6)
    // L3 修复：品牌发起合约一律 open 挂单 + agentId 留空，由代理 claim 主动接单。
    // 绝不允许品牌单方把任意代理直接置 active（绕过代理同意）。
    // 品牌可填自己的结算参数（自填自己的 share% 不是跨租户泄漏）；服务端 clamp 防越界。
    const sp = (dto.settleParams ?? {}) as { agentSharePct?: number; feePct?: number; floorAmount?: number }
    const clampedParams = {
      ...sp,
      agentSharePct: Math.min(100, Math.max(0, sp.agentSharePct ?? 30)),
      ...(sp.feePct != null ? { feePct: Math.min(100, Math.max(0, sp.feePct)) } : {}),
    }
    await this.prisma.growthContract.create({ data: { id, brandId, agentId: null, productId: dto.productId ?? null, status: 'open', settleModel: dto.settleModel, settleParams: JSON.stringify(clampedParams), userLimit: JSON.stringify(dto.userLimit ?? {}), ltvWindow: dto.ltvWindow ?? 'D30', ...(dto.complaintLiability ? { complaintLiability: dto.complaintLiability } : {}), ...(dto.reservePct != null ? { reservePct: dto.reservePct } : {}), targetGmv: dto.targetGmv ?? 0 } })
    await this.audit.record({ user, action: 'contract.propose', resource: 'GrowthContract', resourceId: id, detail: `品牌 ${brandId} 发起合约 ${id}（挂单）` })
    return { ok: true, id }
  }

  // ── 品牌：发起资源置换（initiatorBrandId=自己）+ 对手方应答 ──
  @Post('barter') @RequirePerms('portal.brand.contracts') @ApiOperation({ summary: '品牌发起资源置换' })
  async proposeBarter(@Body() dto: PortalBarterDto, @CurrentUser() user: AuthUser) {
    const brandId = this.scopeId(user, 'brand')
    if (dto.counterpartyBrandId === brandId) return { ok: false, detail: '对手品牌不能是自己' }
    // R2：对手品牌必须存在且未删除，防悬空引用
    const cp = await this.prisma.brand.findFirst({ where: { id: dto.counterpartyBrandId, deletedAt: null } })
    if (!cp) return { ok: false, detail: '对手品牌不存在' }
    const id = 'BD-' + randomUUID().slice(0, 6)
    await this.prisma.barterDeal.create({ data: { id, initiatorBrandId: brandId, counterpartyBrandId: dto.counterpartyBrandId, resourceType: dto.resourceType, myQuota: dto.myQuota, counterpartyQuota: dto.counterpartyQuota, ...(dto.invoiceStatus ? { invoiceStatus: dto.invoiceStatus } : {}), terms: JSON.stringify(dto.terms ?? {}) } })
    await this.notify('brand', dto.counterpartyBrandId, 'contract', '收到资源置换提议', `${brandId} 向你发起 ${dto.resourceType} 置换`, '/portal/brand/barter')
    await this.audit.record({ user, action: 'barter.propose', resource: 'BarterDeal', resourceId: id, detail: `品牌 ${brandId} 发起置换 ${id}` })
    return { ok: true, id }
  }

  @Post('barter/:id/respond') @RequirePerms('portal.brand.contracts') @ApiOperation({ summary: '对手品牌应答置换（accept/reject，仅对手方）' })
  async respondBarter(@Param('id') id: string, @Body() body: BarterRespondDto, @CurrentUser() user: AuthUser) {
    const brandId = this.scopeId(user, 'brand')
    const deal = await this.prisma.barterDeal.findFirst({ where: { id, deletedAt: null } })
    if (!deal) return { ok: false, detail: '置换单不存在' }
    if (deal.counterpartyBrandId !== brandId) throw new ForbiddenException('仅对手品牌可应答')
    if (deal.status !== 'proposed') return { ok: false, detail: '该置换已处理' }
    const next = body.action === 'accept' ? 'active' : 'rejected'
    await this.prisma.barterDeal.update({ where: { id }, data: { status: next } })
    await this.notify('brand', deal.initiatorBrandId, 'contract', '资源置换已应答', `对手品牌${body.action === 'accept' ? '接受' : '拒绝'}了置换 ${id}`, '/portal/brand/barter')
    await this.audit.record({ user, action: 'barter.respond', resource: 'BarterDeal', resourceId: id, detail: `置换 ${id} → ${next}` })
    return { ok: true, detail: body.action === 'accept' ? '已接受置换' : '已拒绝置换' }
  }

  // ── 代理：领取投放（生成专属追踪链接）──
  @Post('agent/claims') @RequirePerms('portal.agent.plans') @ApiOperation({ summary: '代理领取投放（生成追踪链接）' })
  async createClaim(@Body() dto: PortalClaimDto, @CurrentUser() user: AuthUser) {
    const agentId = this.scopeId(user, 'agent')
    // R2：品牌必须存在且为 live，防领取不存在/未上线品牌的投放
    const brand = await this.prisma.brand.findFirst({ where: { id: dto.brandId, status: 'live', deletedAt: null } })
    if (!brand) return { ok: false, detail: '该品牌不可投放' }
    const code = randomUUID().slice(0, 12)
    const id = 'CLM-' + randomUUID().slice(0, 6)
    const trackingUrl = `https://t.youdao.cps/${agentId}/${code}`
    await this.prisma.claim.create({ data: { id, agentId, brandId: dto.brandId, productId: dto.productId ?? null, channel: dto.channel ?? '', trackingUrl, trackingCode: code, status: 'active' } })
    await this.audit.record({ user, action: 'claim.create', resource: 'Claim', resourceId: id, detail: `代理 ${agentId} 领取 ${dto.brandId} 投放` })
    return { ok: true, id, trackingUrl }
  }

  @Get('agent/claims') @RequirePerms('portal.agent.plans') @ApiOperation({ summary: '代理-我领取的投放' })
  async agentClaims(@CurrentUser() user: AuthUser) {
    const agentId = this.scopeId(user, 'agent')
    return this.prisma.claim.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' } })
  }

  // ── 代理：申请提现（≤ payoutPending，平台审批）──
  @Post('agent/payout-requests') @RequirePerms('portal.agent.payouts') @ApiOperation({ summary: '代理发起提现申请' })
  async requestPayout(@Body() dto: PayoutRequestDto, @CurrentUser() user: AuthUser) {
    const agentId = this.scopeId(user, 'agent')
    // 事务内聚合校验：已有 pending 申请总额 + 本次 ≤ payoutPending，防并发超额堆叠（S1）
    const out = await this.prisma.$transaction(async (tx) => {
      const agent = await tx.agent.findFirst({ where: { id: agentId, deletedAt: null } })
      if (!agent) return { ok: false, detail: '账户异常' }
      const agg = await tx.payoutRequest.aggregate({ where: { agentId, status: 'pending' }, _sum: { amount: true } })
      const pendingTotal = agg._sum.amount ?? 0
      if (pendingTotal + dto.amount > agent.payoutPending) {
        return { ok: false, detail: `申请金额超过可提现余额（余额 ¥${agent.payoutPending}，已申请待审 ¥${pendingTotal}）` }
      }
      const id = 'PR-' + randomUUID().slice(0, 6)
      await tx.payoutRequest.create({ data: { id, agentId, amount: dto.amount, status: 'pending' } })
      return { ok: true, id, detail: '提现申请已提交，等待平台审批' }
    })
    if (out.ok) {
      await this.notify('platform', null, 'fund', '有新提现申请', `代理 ${agentId} 申请提现 ¥${dto.amount}`, '/agents')
      await this.audit.record({ user, action: 'payout.request', resource: 'PayoutRequest', resourceId: (out as { id: string }).id, detail: `代理 ${agentId} 申请提现 ¥${dto.amount}` })
    }
    return out
  }

  @Get('agent/payout-requests') @RequirePerms('portal.agent.payouts') @ApiOperation({ summary: '代理-我的提现申请' })
  async agentPayoutRequests(@CurrentUser() user: AuthUser) {
    const agentId = this.scopeId(user, 'agent')
    return this.prisma.payoutRequest.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' } })
  }

  // ── 门户通知（scoped 到客户账户）──
  @Get('notifications') @RequirePerms('portal.brand.home', 'portal.agent.home') @ApiOperation({ summary: '门户通知（按 scopeType+scopeId 收窄）' })
  async portalNotifications(@CurrentUser() user: AuthUser) {
    if (!user.scopeId) return []
    return this.prisma.notification.findMany({ where: { OR: [{ userId: user.id }, { scopeType: user.scopeType, scopeId: user.scopeId }] }, orderBy: { createdAt: 'desc' }, take: 50 })
  }

  @Post('notifications/:id/read') @RequirePerms('portal.brand.home', 'portal.agent.home') @ApiOperation({ summary: '标记门户通知已读' })
  async readPortalNotif(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // 仅可标记属于自己 scope 的通知；非自己/不存在如实返回 ok:false（不沉默成功）
    const n = await this.prisma.notification.findFirst({ where: { id } })
    const mine = !!n && (n.userId === user.id || (n.scopeType === user.scopeType && n.scopeId === user.scopeId))
    if (!mine) return { ok: false }
    await this.prisma.notification.update({ where: { id }, data: { read: true } })
    return { ok: true }
  }

  // 通知投递助手（fire-and-forget，不进资金事务，失败不影响主动作）
  private async notify(scopeType: string, scopeId: string | null, category: string, title: string, body: string, link: string) {
    try {
      await this.prisma.notification.create({ data: { id: 'NT-' + randomUUID().slice(0, 8), scopeType, scopeId, category, title, body, link } })
    } catch { /* 通知失败不影响主流程 */ }
  }
}
