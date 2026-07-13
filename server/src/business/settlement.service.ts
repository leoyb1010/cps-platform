import { Injectable } from '@nestjs/common'
import type { Prisma, Settlement } from '@prisma/client'
import { mul, round2 } from '../common/money'

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
  shareRateOf(s: { agentShareSnapshot?: number; agentPayout: number; reversal?: number; gross: number } | null | undefined): number {
    if (!s) return 0.3
    if (s.agentShareSnapshot && s.agentShareSnapshot > 0) return s.agentShareSnapshot
    // 存量行快照为 0 时，用「当前余额 + 历史冲账」还原初始代理分润。
    // agentPayout 每次与 reversal 等额反向变化，二者之和稳定；不能只用当前
    // agentPayout/gross，否则退款越多，后续同额退款的比例越低。
    if (s.gross > 0) return Math.max(0, Math.min(1, (s.agentPayout + (s.reversal ?? 0)) / s.gross))
    return 0.3
  }

  /**
   * 把原订单绑定到唯一原账期。已有 settlementId 时只认该行；存量订单无绑定时，
   * 仅当品牌 + 北京自然月恰好命中一张结算单才回填。半月账存在多张时拒绝猜测，
   * 宁可暂不冲代理账，也不能把历史退款错记到最新账期。
   */
  async bindOrderSettlement(
    tx: Prisma.TransactionClient,
    order: { id: string; brandId: string; settlementId?: string | null; createdAt: Date },
  ): Promise<Settlement | null> {
    if (order.settlementId) {
      return tx.settlement.findFirst({ where: { id: order.settlementId, brandId: order.brandId } })
    }
    const bj = new Date(order.createdAt.getTime() + 8 * 60 * 60 * 1000)
    const month = `${bj.getUTCFullYear()}-${String(bj.getUTCMonth() + 1).padStart(2, '0')}`
    const matches = await tx.settlement.findMany({ where: { brandId: order.brandId, period: { startsWith: month } }, take: 2 })
    if (matches.length !== 1) return null
    await tx.order.updateMany({ where: { id: order.id, settlementId: null }, data: { settlementId: matches[0].id } })
    return matches[0]
  }

  /**
   * 对一笔退款执行结算侧逆向冲账（在调用方的事务 tx 内）。
   * 只接受调用方已按原订单绑定的结算单，按 shareRateOf 派生冲减额，更新 reversal↑/agentPayout↓/对账态。
   * 返回冲减额 share，供调用方联动代理分润回收与审计文案。
   *
   * 行为与原 controller 内联逻辑一致；唯一变化是冲减比例改用 shareRateOf 的快照优先链。
   */
  async applyRefundReversal(
    tx: Prisma.TransactionClient,
    args: { settlement: Settlement | null; amount: number },
  ): Promise<{ share: number; settlement: Settlement | null }> {
    const s = args.settlement
    // B1：无结算单时不凭空扣代理分润（该退款与本品牌任何结算单无对应关系，跨账本硬扣会凭空吃掉代理钱）。
    //     返回 share=0 → 调用方 applyAgentRefundImpact 扣 0、clawback 因 if(rev.settlement) 守卫不执行。
    if (!s) return { share: 0, settlement: null }
    // 分位精度（round2）而非整元 Math.round：与 money 层一致，避免小额退款（如 ¥19×0.3=5.7）被整元化累积漂移
    const rawShare = mul(args.amount, this.shareRateOf(s))
    // B1：封顶不再依赖事务外快照 Math.min（并发退款会各自按 stale agentPayout 判封顶，合计扣穿成负数）。
    //     改为原子条件扣减：where agentPayout>=rawShare 时整额扣；扣不动（余额不足）再读回按实际可扣额扣到 0。
    //     无论走哪条，reversal↑ 与 agentPayout↓ 同额 share，恒等式 I 天然守衡。
    let share = 0
    // CAS 循环：返回值必须等于真正成功写入 Settlement 的金额。竞争输家重新读余额
    // 再算，绝不能沿用失败前的 share 继续扣代理/准备金或增加 reconcileDiff。
    for (let attempt = 0; attempt < 100; attempt++) {
      const cur = await tx.settlement.findUnique({ where: { id: s.id }, select: { agentPayout: true } })
      const take = round2(Math.max(0, Math.min(rawShare, cur?.agentPayout ?? 0)))
      if (take <= 0) break
      const won = await tx.settlement.updateMany({
        where: { id: s.id, agentPayout: cur!.agentPayout },
        data: { reversal: { increment: take }, agentPayout: { decrement: take } },
      })
      if (won.count === 1) { share = take; break }
      if (attempt === 99) throw new Error(`结算单 ${s.id} 冲账竞争过于激烈，已安全回滚`)
    }
    // P2-B2：status/reconcileDiff 收敛为独立条件更新，不在增量写里带回事务外快照 status——
    //   否则会把并发已 clear 的结果覆回。已结清/对账中的单退款会制造对账差额，按当前真实状态原子累加。
    if (share > 0) {
      await tx.settlement.updateMany({ where: { id: s.id, status: { in: ['cleared', 'reconciling'] } }, data: { reconcileDiff: { increment: share } } })
      // cleared → reconciling：独立条件流转，只在仍为 cleared 时翻，绝不覆盖并发 clear/其它态
      await tx.settlement.updateMany({ where: { id: s.id, status: 'cleared' }, data: { status: 'reconciling' } })
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
  ): Promise<{ creditScore?: number; status?: string; shortfall: number } | null> {
    const a = await tx.agent.findUnique({ where: { id: args.agentId } })
    if (!a) return null
    const share = args.share
    // payoutPending 原子扣减：绝不用「读快照-绝对量写」——会覆盖 reserve-release 的并发 { increment } 静默丢钱。
    //   优先条件扣（payoutPending>=share 整额扣），扣不动再读回按实际可扣额扣到 0（不透支、不产生负值）。
    // 记录实际扣掉的额度 deducted：不足 share 的缺口 shortfall 返回给调用方，仅用准备金追偿「缺口」，
    //   而非对 share 全额再追偿一次（P2-B5：分润回收与准备金追偿本是同一笔钱的一次回收——优先现金池、不足才动准备金）。
    let deducted = 0
    for (let attempt = 0; attempt < 100; attempt++) {
      const cur = await tx.agent.findUnique({ where: { id: a.id }, select: { payoutPending: true } })
      const take = round2(Math.max(0, Math.min(share, cur?.payoutPending ?? 0)))
      if (take <= 0) break
      const won = await tx.agent.updateMany({
        where: { id: a.id, payoutPending: cur!.payoutPending },
        data: { payoutPending: { decrement: take } },
      })
      if (won.count === 1) { deducted = take; break }
      if (attempt === 99) throw new Error(`代理 ${a.id} 分润回收竞争过于激烈，已安全回滚`)
    }
    const shortfall = round2(share - deducted)
    if (args.withCredit) {
      // creditScore 原子递减 4、下限 400：并发退款各自 decrement 不互相覆盖。
      //   >=404 时整额扣（并顺带 refundRate +0.1）；落到 400~403 无法整扣时夹到下限 400（同样只 +0.1 一次，二者互斥不重复）。
      const dec = await tx.agent.updateMany({ where: { id: a.id, creditScore: { gte: 404 } }, data: { creditScore: { decrement: 4 }, refundRate: { increment: 0.1 } } })
      if (dec.count === 0) await tx.agent.updateMany({ where: { id: a.id }, data: { creditScore: 400, refundRate: { increment: 0.1 } } })
      // 读回最终值决定状态流转，并回传供审计文案。active 且信用分跌破 760 → throttled：
      //   独立条件更新（where status='active'），不覆盖并发对 status 的改动。
      const cur = await tx.agent.findUnique({ where: { id: a.id }, select: { creditScore: true, status: true } })
      let status = cur?.status
      if (cur && cur.status === 'active' && cur.creditScore < 760) {
        await tx.agent.updateMany({ where: { id: a.id, status: 'active' }, data: { status: 'throttled' } })
        status = 'throttled'
      }
      return { creditScore: cur?.creditScore, status, shortfall }
    }
    // refundRate Float 累加（一位小数的展示留给读取侧，不再 toFixed 后绝对量写覆盖并发）
    await tx.agent.updateMany({ where: { id: a.id }, data: { refundRate: { increment: 0.1 } } })
    return { shortfall }
  }
}
