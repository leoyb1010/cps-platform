import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger'
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'
import { PrismaService } from '../prisma.service'
import { AuditService } from '../audit/audit.service'
import { IdempotencyService } from '../common/idempotency.service'
import { RequirePerms, CurrentUser, type AuthUser } from '../rbac/rbac'

class StateDto {
  @IsString() state!: string
  @IsOptional() @IsString() label?: string
}
class AgentStatusDto {
  @IsIn(['active', 'throttled', 'frozen']) status!: string
}
class BrandStatusDto {
  @IsIn(['live', 'review', 'paused']) status!: string
  @IsOptional() @IsString() label?: string
}
class BrandConfigDto {
  @IsOptional() @IsNumber() feeRate?: number
  @IsOptional() @IsInt() period?: number
  @IsOptional() @IsInt() reservePct?: number
  @IsOptional() @IsIn(['direct', 'licensed', 'mixed']) path?: string
}
class NewBrandDto {
  @IsString() name!: string
  @IsString() category!: string
  @IsNumber() @Min(0) @Max(100) feeRate!: number
  @IsInt() period!: number
  @IsInt() reservePct!: number
  @IsIn(['direct', 'licensed', 'mixed']) path!: string
}
class NewMerchantDto {
  @IsString() brandId!: string
  @IsIn(['wechat', 'alipay', 'bank']) channel!: string
  @IsInt() @Min(0) @Max(100) weight!: number
}
class TicketUpdateDto {
  @IsOptional() @IsString() status?: string
  @IsOptional() @IsString() owner?: string
  @IsOptional() @IsString() note?: string
}

@ApiTags('business')
@Controller()
export class BusinessController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private idem: IdempotencyService,
  ) {}

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

  // ── reads ──（软删除：deletedAt=null 默认过滤）──
  @Get('brands') @RequirePerms('brand.read') @ApiOperation({ summary: '品牌列表（按 scope 收窄，排除已删除）' })
  brands(@CurrentUser() user: AuthUser) { return this.prisma.brand.findMany({ where: { ...this.scope(user, 'id-brand'), deletedAt: null }, orderBy: { gmvMtd: 'desc' } }) }

  @Get('agents') @RequirePerms('agent.read') @ApiOperation({ summary: '代理列表（按 scope 收窄，排除已删除）' })
  agents(@CurrentUser() user: AuthUser) { return this.prisma.agent.findMany({ where: { ...this.scope(user, 'id-agent'), deletedAt: null }, orderBy: { spendMtd: 'desc' } }) }

  @Get('merchants') @RequirePerms('merchant.read') @ApiOperation({ summary: '商户号/号池（按 scope 收窄，排除已删除）' })
  merchants(@CurrentUser() user: AuthUser) { return this.prisma.merchantAccount.findMany({ where: { ...this.scope(user, 'brandId'), deletedAt: null } }) }

  // 游标分页：传 ?cursor=<id>&limit=<n>，返回 { items, nextCursor }
  @Get('orders') @RequirePerms('order.read') @ApiOperation({ summary: '订单（按 scope 收窄 · 游标分页）' })
  async orders(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const take = Math.min(Math.max(Number(limit) || 100, 1), 500)
    const items = await this.prisma.order.findMany({
      where: this.scopeOwned(user),
      orderBy: { createdAt: 'desc' },
      take: take + 1, // 多取一条判断是否还有下一页
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    const hasMore = items.length > take
    const page = hasMore ? items.slice(0, take) : items
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null }
  }

  @Get('settlements') @RequirePerms('settlement.read') @ApiOperation({ summary: '结算单（按 scope 收窄）' })
  settlements(@CurrentUser() user: AuthUser) { return this.prisma.settlement.findMany({ where: this.scope(user, 'brandId') }) }

  @Get('tickets') @RequirePerms('ticket.read') @ApiOperation({ summary: '投诉工单（按 scope 收窄）' })
  tickets(@CurrentUser() user: AuthUser) { return this.prisma.ticket.findMany({ where: this.scopeOwned(user) }) }

  @Get('summary') @RequirePerms('dashboard.view') @ApiOperation({ summary: '经营总览汇总（风险条/待办派生）' })
  async summary() {
    const [merchants, tickets, settlements, agents] = await Promise.all([
      this.prisma.merchantAccount.findMany(),
      this.prisma.ticket.findMany(),
      this.prisma.settlement.findMany(),
      this.prisma.agent.findMany(),
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
    const { result, replayed } = await this.idem.run(idemKey, 'settlement.clear', async () => {
      // 条件更新：仅当仍为 pending 才置 cleared，count=0 表示已被并发结算
      const r = await this.prisma.settlement.updateMany({ where: { id, status: 'pending' }, data: { status: 'cleared' } })
      if (r.count === 0) return { ok: false, detail: '该结算单不可结算（不存在或已结算）' }
      await this.audit.record({ user, action: 'settlement.clear', resource: 'Settlement', resourceId: id, detail: `结算单 ${id} 已发起结算并完成`, after: { status: 'cleared' } })
      return { ok: true, detail: `结算单 ${id} 已发起结算并完成` }
    })
    return replayed ? { ...result, replayed: true } : result
  }

  @Post('settlements/:id/reconcile') @RequirePerms('settlement.clear') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '对账差异核销 · 幂等' })
  async reconcile(@Param('id') id: string, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    const { result, replayed } = await this.idem.run(idemKey, 'settlement.reconcile', async () => {
      await this.prisma.settlement.update({ where: { id }, data: { status: 'cleared', reconcileDiff: 0 } })
      await this.audit.record({ user, action: 'settlement.reconcile', resource: 'Settlement', resourceId: id, detail: `结算单 ${id} 对账差异已人工核销` })
      return { ok: true, detail: `结算单 ${id} 对账差异已人工核销` }
    })
    return replayed ? { ...result, replayed: true } : result
  }

  // ── 工单退款 → 逆向冲账 → 代理分润/信用分（核心联动）· 幂等 + 事务内状态闸 ──
  @Post('tickets/:id/refund') @RequirePerms('ticket.handle') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '工单退款，联动逆向冲账与代理分润/信用分 · 幂等' })
  async refundTicket(@Param('id') id: string, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    const { result, replayed } = await this.idem.run(idemKey, 'ticket.refund', async () => {
      const t = await this.prisma.ticket.findUnique({ where: { id } })
      if (!t || t.status === 'resolved') return { ok: false, detail: '工单不存在或已解决' }
      const order = await this.prisma.order.findUnique({ where: { id: t.orderId } }).catch(() => null)
      const amount = order ? Math.abs(order.amount) || 33 : 33
      const share = Math.round(amount * 0.3)

      // 事务内先用条件更新抢占工单（status pending/processing→resolved），抢不到则放弃副作用
      const claimed = await this.prisma.$transaction(async (tx) => {
        const c = await tx.ticket.updateMany({ where: { id, status: { not: 'resolved' } }, data: { status: 'resolved', slaLeftMin: 0 } })
        if (c.count === 0) return false
        await tx.order.create({ data: { id: 'O-' + Date.now().toString().slice(-6), time: '现在', brandId: t.brandId, agentId: t.agentId, channel: order?.channel ?? 'wechat', type: 'refund', amount: -amount, plan: order?.plan ?? '退款', mid: order?.mid ?? '' } })
        const s = await tx.settlement.findFirst({ where: { brandId: t.brandId }, orderBy: { period: 'desc' } })
        if (s) await tx.settlement.update({ where: { id: s.id }, data: { reversal: s.reversal + share, agentPayout: Math.max(0, s.agentPayout - share) } })
        const a = await tx.agent.findUnique({ where: { id: t.agentId } })
        if (a) {
          const creditScore = Math.max(400, a.creditScore - 4)
          const status = a.status === 'active' && creditScore < 760 ? 'throttled' : a.status
          await tx.agent.update({ where: { id: a.id }, data: { payoutPending: Math.max(0, a.payoutPending - share), refundRate: +(a.refundRate + 0.1).toFixed(1), creditScore, status } })
        }
        return true
      })
      if (!claimed) return { ok: false, detail: '工单已被处理' }
      await this.audit.record({ user, action: 'ticket.refund', resource: 'Ticket', resourceId: id, detail: `工单 ${id} 已退款 ¥${amount}，逆向冲账 ¥${share}，代理 ${t.agentId} 信用分 −4` })
      return { ok: true, detail: `工单 ${id} 已退款 ¥${amount}，联动冲账 ¥${share} 完成`, amount, share }
    })
    return replayed ? { ...result, replayed: true } : result
  }

  // ── 号池状态干预 ────────────────────────
  @Post('merchants/:id/state') @RequirePerms('merchant.write') @ApiOperation({ summary: '商户号状态机人工干预' })
  async setMerchant(@Param('id') id: string, @Body() dto: StateDto, @CurrentUser() user: AuthUser) {
    const weight = dto.state === 'fused' ? 0 : dto.state === 'paused' ? 8 : undefined
    await this.prisma.merchantAccount.update({ where: { id }, data: { state: dto.state, ...(weight !== undefined ? { weight } : {}) } })
    await this.audit.record({ user, action: 'merchant.state', resource: 'MerchantAccount', resourceId: id, detail: `商户号 ${id} 置为「${dto.label ?? dto.state}」` })
    return { ok: true, detail: `商户号 ${id} 已更新为 ${dto.label ?? dto.state}` }
  }

  // ── 代理处置 ───────────────────────────
  @Post('agents/:id/status') @RequirePerms('agent.write') @ApiOperation({ summary: '代理限流/冻结/恢复' })
  async setAgent(@Param('id') id: string, @Body() dto: AgentStatusDto, @CurrentUser() user: AuthUser) {
    await this.prisma.agent.update({ where: { id }, data: { status: dto.status } })
    await this.audit.record({ user, action: 'agent.status', resource: 'Agent', resourceId: id, detail: `代理 ${id} 置为 ${dto.status}` })
    return { ok: true, detail: `代理 ${id} 已更新` }
  }

  @Post('agents/:id/settle') @RequirePerms('settlement.clear') @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: '代理提现结算（待结算清零→计入累计已结）· 幂等' })
  async settleAgent(@Param('id') id: string, @CurrentUser() user: AuthUser, @Headers('idempotency-key') idemKey?: string) {
    const { result, replayed } = await this.idem.run(idemKey, 'agent.settle', async () => {
      const a = await this.prisma.agent.findUnique({ where: { id } })
      if (!a || a.payoutPending <= 0) return { ok: false, detail: '无可结算金额' }
      const amt = a.payoutPending
      // 条件更新防并发重复提现：仅当 payoutPending 仍为读到的值才清零
      const r = await this.prisma.agent.updateMany({ where: { id, payoutPending: amt }, data: { payoutPending: 0, settledTotal: a.settledTotal + amt } })
      if (r.count === 0) return { ok: false, detail: '提现状态已变更，请刷新重试' }
      await this.audit.record({ user, action: 'agent.settle', resource: 'Agent', resourceId: id, detail: `代理 ${id} 提现结算 ¥${amt.toLocaleString('zh-CN')} 已打款` })
      return { ok: true, detail: `代理 ${id} 提现 ¥${amt} 已打款` }
    })
    return replayed ? { ...result, replayed: true } : result
  }

  // ── 品牌：创建 / 状态 / 配置 ──────────────
  @Post('brands') @RequirePerms('brand.write') @ApiOperation({ summary: '新增品牌（入驻）' })
  async addBrand(@Body() dto: NewBrandDto, @CurrentUser() user: AuthUser) {
    const id = 'brand-' + Date.now().toString(36)
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
    await this.prisma.brand.update({ where: { id }, data: { status: dto.status } })
    await this.audit.record({ user, action: 'brand.status', resource: 'Brand', resourceId: id, detail: `品牌 ${id} 置为「${dto.label ?? dto.status}」`, before: { status: before.status }, after: { status: dto.status } })
    return { ok: true, detail: `品牌 ${id} 已更新为 ${dto.label ?? dto.status}` }
  }

  @Patch('brands/:id/config') @RequirePerms('brand.write') @ApiOperation({ summary: '品牌接入配置（费率/账期/预留/资金路径）' })
  async setBrandConfig(@Param('id') id: string, @Body() dto: BrandConfigDto, @CurrentUser() user: AuthUser) {
    const before = await this.prisma.brand.findUnique({ where: { id } })
    if (!before) return { ok: false, detail: '品牌不存在' }
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
    const r = await this.prisma.brand.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } })
    if (r.count === 0) return { ok: false, detail: '品牌不存在或已删除' }
    await this.audit.record({ user, action: 'brand.delete', resource: 'Brand', resourceId: id, detail: `品牌 ${id} 已软删除（下架）` })
    return { ok: true, detail: `品牌 ${id} 已下架` }
  }

  // ── 号池：新增 ─────────────────────────
  @Post('merchants') @RequirePerms('merchant.write') @ApiOperation({ summary: '品牌专属号池新增商户号' })
  async addMerchant(@Body() dto: NewMerchantDto, @CurrentUser() user: AuthUser) {
    const pref = dto.channel === 'wechat' ? 'WX' : dto.channel === 'alipay' ? 'AL' : 'BK'
    const id = `M-${pref}-${Date.now().toString().slice(-3)}`
    const mid = `${pref}${Date.now().toString().slice(-8)}`
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
        const amt = Math.abs(order.amount)
        const share = Math.round(amt * 0.3)
        await tx.order.create({ data: { id: 'O-' + Date.now().toString().slice(-6), time: '现在', brandId: order.brandId, agentId: order.agentId, channel: order.channel, type: 'refund', amount: -amt, plan: order.plan, mid: order.mid } })
        const s = await tx.settlement.findFirst({ where: { brandId: order.brandId }, orderBy: { period: 'desc' } })
        if (s) await tx.settlement.update({ where: { id: s.id }, data: { reversal: s.reversal + share, agentPayout: Math.max(0, s.agentPayout - share) } })
        const a = await tx.agent.findUnique({ where: { id: order.agentId } })
        if (a) await tx.agent.update({ where: { id: a.id }, data: { payoutPending: Math.max(0, a.payoutPending - share), refundRate: +(a.refundRate + 0.1).toFixed(1) } })
        return { amt, share }
      })
      if (!amount) return { ok: false, detail: '订单不存在或不可退款' }
      await this.audit.record({ user, action: 'order.refund', resource: 'Order', resourceId: id, detail: `订单 ${id} 已退款 ¥${amount.amt}，逆向冲账 ¥${amount.share}` })
      return { ok: true, detail: `订单 ${id} 已退款，联动冲账完成`, amount: amount.amt, share: amount.share }
    })
    return replayed ? { ...result, replayed: true } : result
  }

  // ── 工单：流转（转派/升级/关闭等）──────────
  @Patch('tickets/:id') @RequirePerms('ticket.handle') @ApiOperation({ summary: '工单流转（状态/责任人/备注）' })
  async updateTicket(@Param('id') id: string, @Body() dto: TicketUpdateDto, @CurrentUser() user: AuthUser) {
    const before = await this.prisma.ticket.findUnique({ where: { id } })
    if (!before) return { ok: false, detail: '工单不存在' }
    const data: Record<string, unknown> = {}
    if (dto.status !== undefined) data.status = dto.status
    if (dto.owner !== undefined) data.owner = dto.owner
    await this.prisma.ticket.update({ where: { id }, data })
    await this.audit.record({ user, action: 'ticket.update', resource: 'Ticket', resourceId: id, detail: `工单 ${id} ${dto.note ?? '已更新'}`, before: { status: before.status, owner: before.owner }, after: data })
    return { ok: true, detail: `工单 ${id} 已更新` }
  }

  // ── 平台配置中心 ───────────────────────
  @Get('config') @RequirePerms('dashboard.view') @ApiOperation({ summary: '读取平台配置（键值）' })
  async getConfig() {
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
    const entries = Object.entries(body || {})
    for (const [key, value] of entries) {
      const v = typeof value === 'string' ? value : JSON.stringify(value)
      await this.prisma.config.upsert({ where: { key }, create: { key, value: v }, update: { value: v } })
    }
    await this.audit.record({ user, action: 'config.write', resource: 'Config', resourceId: '-', detail: `平台配置已更新（${entries.length} 项）`, after: body })
    return { ok: true, detail: `已保存 ${entries.length} 项配置` }
  }
}
