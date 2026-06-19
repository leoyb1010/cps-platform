import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'
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
}
