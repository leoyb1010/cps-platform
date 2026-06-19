import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'
import { PrismaService } from '../prisma.service'
import { AuditService } from '../audit/audit.service'
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
  ) {}

  // ── reads ──────────────────────────────
  @Get('brands') @RequirePerms('brand.read') @ApiOperation({ summary: '品牌列表' })
  brands() { return this.prisma.brand.findMany({ orderBy: { gmvMtd: 'desc' } }) }

  @Get('agents') @RequirePerms('agent.read') @ApiOperation({ summary: '代理列表' })
  agents() { return this.prisma.agent.findMany({ orderBy: { spendMtd: 'desc' } }) }

  @Get('merchants') @RequirePerms('merchant.read') @ApiOperation({ summary: '商户号/号池' })
  merchants() { return this.prisma.merchantAccount.findMany() }

  @Get('orders') @RequirePerms('order.read') @ApiOperation({ summary: '订单' })
  orders() { return this.prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }) }

  @Get('settlements') @RequirePerms('settlement.read') @ApiOperation({ summary: '结算单' })
  settlements() { return this.prisma.settlement.findMany() }

  @Get('tickets') @RequirePerms('ticket.read') @ApiOperation({ summary: '投诉工单' })
  tickets() { return this.prisma.ticket.findMany() }

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

  // ── 清结算动作 ─────────────────────────
  @Post('settlements/:id/clear') @RequirePerms('settlement.clear') @ApiOperation({ summary: '发起结算（待结算→已结算）' })
  async clear(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const s = await this.prisma.settlement.findUnique({ where: { id } })
    if (!s || s.status !== 'pending') return { ok: false, detail: '该结算单不可结算' }
    await this.prisma.settlement.update({ where: { id }, data: { status: 'cleared' } })
    await this.audit.record({ user, action: 'settlement.clear', resource: 'Settlement', resourceId: id, detail: `结算单 ${id} 已发起结算并完成`, after: { status: 'cleared' } })
    return { ok: true, detail: `结算单 ${id} 已发起结算并完成` }
  }

  @Post('settlements/:id/reconcile') @RequirePerms('settlement.clear') @ApiOperation({ summary: '对账差异核销' })
  async reconcile(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.prisma.settlement.update({ where: { id }, data: { status: 'cleared', reconcileDiff: 0 } })
    await this.audit.record({ user, action: 'settlement.reconcile', resource: 'Settlement', resourceId: id, detail: `结算单 ${id} 对账差异已人工核销` })
    return { ok: true, detail: `结算单 ${id} 对账差异已人工核销` }
  }

  // ── 工单退款 → 逆向冲账 → 代理分润/信用分（核心联动） ──
  @Post('tickets/:id/refund') @RequirePerms('ticket.handle') @ApiOperation({ summary: '工单退款，联动逆向冲账与代理分润/信用分' })
  async refundTicket(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const t = await this.prisma.ticket.findUnique({ where: { id } })
    if (!t || t.status === 'resolved') return { ok: false, detail: '工单不存在或已解决' }
    const order = await this.prisma.order.findUnique({ where: { id: t.orderId } }).catch(() => null)
    const amount = order ? Math.abs(order.amount) || 33 : 33
    const share = Math.round(amount * 0.3)

    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.update({ where: { id }, data: { status: 'resolved', slaLeftMin: 0 } })
      // 退款流水
      await tx.order.create({ data: { id: 'O-' + Date.now().toString().slice(-6), time: '现在', brandId: t.brandId, agentId: t.agentId, channel: order?.channel ?? 'wechat', type: 'refund', amount: -amount, plan: order?.plan ?? '退款', mid: order?.mid ?? '' } })
      // 逆向冲账：冲减该品牌最近一期代理分润
      const s = await tx.settlement.findFirst({ where: { brandId: t.brandId }, orderBy: { period: 'desc' } })
      if (s) await tx.settlement.update({ where: { id: s.id }, data: { reversal: s.reversal + share, agentPayout: Math.max(0, s.agentPayout - share) } })
      // 代理：待结算↓、退款率↑、信用分↓、可能限流
      const a = await tx.agent.findUnique({ where: { id: t.agentId } })
      if (a) {
        const creditScore = Math.max(400, a.creditScore - 4)
        const status = a.status === 'active' && creditScore < 760 ? 'throttled' : a.status
        await tx.agent.update({ where: { id: a.id }, data: { payoutPending: Math.max(0, a.payoutPending - share), refundRate: +(a.refundRate + 0.1).toFixed(1), creditScore, status } })
      }
    })
    await this.audit.record({ user, action: 'ticket.refund', resource: 'Ticket', resourceId: id, detail: `工单 ${id} 已退款 ¥${amount}，逆向冲账 ¥${share}，代理 ${t.agentId} 信用分 −4` })
    return { ok: true, detail: `工单 ${id} 已退款 ¥${amount}，联动冲账 ¥${share} 完成`, amount, share }
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

  @Post('agents/:id/settle') @RequirePerms('settlement.clear') @ApiOperation({ summary: '代理提现结算（待结算清零→计入累计已结）' })
  async settleAgent(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const a = await this.prisma.agent.findUnique({ where: { id } })
    if (!a || a.payoutPending <= 0) return { ok: false, detail: '无可结算金额' }
    const amt = a.payoutPending
    await this.prisma.agent.update({ where: { id }, data: { payoutPending: 0, settledTotal: a.settledTotal + amt } })
    await this.audit.record({ user, action: 'agent.settle', resource: 'Agent', resourceId: id, detail: `代理 ${id} 提现结算 ¥${amt.toLocaleString('zh-CN')} 已打款` })
    return { ok: true, detail: `代理 ${id} 提现 ¥${amt} 已打款` }
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

  // ── 订单退款（无工单）─────────────────────
  @Post('orders/:id/refund') @RequirePerms('order.refund') @ApiOperation({ summary: '订单退款（订单冲正→结算冲账→代理分润回收）' })
  async refundOrder(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order || order.type === 'refund' || order.type === 'chargeback') return { ok: false, detail: '订单不存在或不可退款' }
    const amount = Math.abs(order.amount)
    const share = Math.round(amount * 0.3)
    await this.prisma.$transaction(async (tx) => {
      await tx.order.create({ data: { id: 'O-' + Date.now().toString().slice(-6), time: '现在', brandId: order.brandId, agentId: order.agentId, channel: order.channel, type: 'refund', amount: -amount, plan: order.plan, mid: order.mid } })
      const s = await tx.settlement.findFirst({ where: { brandId: order.brandId }, orderBy: { period: 'desc' } })
      if (s) await tx.settlement.update({ where: { id: s.id }, data: { reversal: s.reversal + share, agentPayout: Math.max(0, s.agentPayout - share) } })
      const a = await tx.agent.findUnique({ where: { id: order.agentId } })
      if (a) await tx.agent.update({ where: { id: a.id }, data: { payoutPending: Math.max(0, a.payoutPending - share), refundRate: +(a.refundRate + 0.1).toFixed(1) } })
    })
    await this.audit.record({ user, action: 'order.refund', resource: 'Order', resourceId: id, detail: `订单 ${id} 已退款 ¥${amount}，逆向冲账 ¥${share}` })
    return { ok: true, detail: `订单 ${id} 已退款，联动冲账完成`, amount, share }
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
