import { Injectable } from '@nestjs/common'
import type { Prisma, Settlement } from '@prisma/client'

/**
 * 清结算领域服务：把原先内联在 BusinessController 的资金计算/冲账逻辑抽出，
 * 供 controller、定时任务、后续合约结算共用。纯函数 + 事务内副作用，不破坏既有不变量。
 *
 * 核心不变量（对账恒等式 I，永不因本服务改变）：
 *   gross = brandShare + reserve + platformFee + agentPayout + reversal
 */
@Injectable()
export class SettlementService {
  /**
   * 退款冲减代理分润的比例。
   * 优先级（解决合约化分润后「agentPayout/gross 全局反推」失真的问题）：
   *   1. 结算时落的成交时点快照 agentShareSnapshot（>0 时采用）——不随后续退款漂移
   *   2. 回退：agentPayout/gross（旧口径，存量数据无快照时）
   *   3. 兜底：0.3（既有行为，保持 e2e 兼容）
   */
  shareRateOf(s: { agentShareSnapshot?: number; agentPayout: number; gross: number } | null | undefined): number {
    if (!s) return 0.3
    if (s.agentShareSnapshot && s.agentShareSnapshot > 0) return s.agentShareSnapshot
    if (s.gross > 0) return s.agentPayout / s.gross
    return 0.3
  }

  /**
   * 对一笔退款执行结算侧逆向冲账（在调用方的事务 tx 内）。
   * 取该品牌最近一期结算单，按 shareRateOf 派生冲减额，更新 reversal↑/agentPayout↓/对账态。
   * 返回冲减额 share，供调用方联动代理分润回收与审计文案。
   *
   * 行为与原 controller 内联逻辑一致；唯一变化是冲减比例改用 shareRateOf 的快照优先链。
   */
  async applyRefundReversal(
    tx: Prisma.TransactionClient,
    args: { brandId: string; amount: number },
  ): Promise<{ share: number; settlement: Settlement | null }> {
    const s = await tx.settlement.findFirst({ where: { brandId: args.brandId }, orderBy: { period: 'desc' } })
    const share = Math.round(args.amount * this.shareRateOf(s))
    if (s) {
      const status = s.status === 'cleared' ? 'reconciling' : s.status
      const reconcileDiff = s.status === 'cleared' || s.status === 'reconciling' ? s.reconcileDiff + share : s.reconcileDiff
      await tx.settlement.update({
        where: { id: s.id },
        data: { reversal: s.reversal + share, agentPayout: Math.max(0, s.agentPayout - share), status, reconcileDiff },
      })
    }
    return { share, settlement: s }
  }

  /**
   * 退款联动代理侧分润回收。withCredit=true 时额外扣信用分（工单退款用，比订单退款「重」）。
   * 在调用方事务 tx 内执行。返回更新后的信用分与状态（供审计文案）。
   */
  async applyAgentRefundImpact(
    tx: Prisma.TransactionClient,
    args: { agentId: string; share: number; withCredit: boolean },
  ): Promise<{ creditScore?: number; status?: string } | null> {
    const a = await tx.agent.findUnique({ where: { id: args.agentId } })
    if (!a) return null
    if (args.withCredit) {
      const creditScore = Math.max(400, a.creditScore - 4)
      const status = a.status === 'active' && creditScore < 760 ? 'throttled' : a.status
      await tx.agent.update({
        where: { id: a.id },
        data: { payoutPending: Math.max(0, a.payoutPending - args.share), refundRate: +(a.refundRate + 0.1).toFixed(1), creditScore, status },
      })
      return { creditScore, status }
    }
    await tx.agent.update({
      where: { id: a.id },
      data: { payoutPending: Math.max(0, a.payoutPending - args.share), refundRate: +(a.refundRate + 0.1).toFixed(1) },
    })
    return {}
  }
}
