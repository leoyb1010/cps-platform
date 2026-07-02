import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { round2 } from '../common/money'

/**
 * 风险准备金分期释放服务。
 *
 * 资金正确性设计（与对账恒等式 I 正交，不破坏 I）：
 *   恒等式 I（计提，静态）：gross = brandShare + reserve + platformFee + agentPayout + reversal
 *   守恒式 II（释放，状态流转）：frozen = reserve − reserveReleased − reserveClawedBack
 *
 * 「释放」不是「再分账」，而是 reserve 这堆钱从冻结态变成可提现态。因此：
 *   - 释放只动 settlement.reserveReleased↑ + agent.payoutPending↑ + frozen↓（派生），
 *     绝不动 settlement.reserve / agentPayout —— 否则 I 会在释放过程中反复失衡。
 *   - 钱去向：释放额进入 agent.payoutPending（可提现池），走既有提现幂等逻辑。
 *   - 逆向追偿：退款先冲未释放的 scheduled 行 → reserveClawedBack↑，不动已释放部分。
 */
@Injectable()
export class ReserveReleaseService {
  constructor(private prisma: PrismaService) {}

  /** 派生在账冻结额（守恒式 II）。分位精度，与 money 层一致。 */
  frozenOf(s: { reserve: number; reserveReleased: number; reserveClawedBack: number }): number {
    return Math.max(0, round2(s.reserve - s.reserveReleased - s.reserveClawedBack))
  }

  /**
   * 释放单条到期计划行（在事务内）。scheduled → released。
   * reserveReleased += amount；agent.payoutPending += amount；frozen 随 II 自动减少。
   * 条件更新防并发重复释放（status 必须仍为 scheduled）。
   */
  async releaseRow(tx: Prisma.TransactionClient, rrId: string, at: Date): Promise<{ ok: boolean; amount?: number; settlementId?: string; detail: string }> {
    const rr = await tx.reserveRelease.findUnique({ where: { id: rrId } })
    if (!rr) return { ok: false, detail: '释放计划不存在' }
    if (rr.status !== 'scheduled') return { ok: false, detail: `释放计划状态为 ${rr.status}，不可释放` }
    // 资金守恒前置校验：代理必须存在。否则下方 settlement 已减 frozen 而代理入账失败，
    // 这笔钱会"离开冻结池却没进可提现池"——静默蒸发。缺代理时整行拒绝，留待人工核查。
    const agentExists = await tx.agent.count({ where: { id: rr.agentId } })
    if (agentExists === 0) return { ok: false, detail: `代理 ${rr.agentId} 不存在，已拒绝释放（待人工核查归属）` }

    // 抢占：仅当仍 scheduled 且 amount 未被并发 clawback 缩减时翻为 released（乐观锁，防按 stale 额重复释放）。
    const c = await tx.reserveRelease.updateMany({
      where: { id: rrId, status: 'scheduled', amount: rr.amount },
      data: { status: 'released', releasedAt: at, releasedAmount: rr.amount },
    })
    if (c.count === 0) return { ok: false, detail: '释放计划已被处理或额度已变更' }

    // settlement 累计已释放（不动 reserve / agentPayout → 恒等式 I 不变）；frozen 原子递减维持守恒式 II，
    // reserveReleased 原子递增：避免与并发 clawback 的「读快照写绝对量」互相覆盖（lost update）。
    await tx.settlement.update({
      where: { id: rr.settlementId },
      data: { reserveReleased: { increment: rr.amount }, frozen: { decrement: rr.amount } },
    })
    // 释放额进入代理可提现池（原子递增）。不吞错：并发删代理等罕见失败让整个事务回滚，
    // 保证 frozen↓ 与 payoutPending↑ 要么同时发生要么都不发生（守恒式 II 不出缺口）。
    await tx.agent.update({ where: { id: rr.agentId }, data: { payoutPending: { increment: rr.amount } } })
    return { ok: true, amount: rr.amount, settlementId: rr.settlementId, detail: `释放 ¥${rr.amount}（${rr.stage}）→ 代理 ${rr.agentId} 可提现池` }
  }

  /** 冻结一条计划行（投诉超阈/高风险）。scheduled → frozen，不动资金。 */
  async freezeRow(tx: Prisma.TransactionClient, rrId: string, reason: string): Promise<{ ok: boolean; detail: string }> {
    const c = await tx.reserveRelease.updateMany({ where: { id: rrId, status: 'scheduled' }, data: { status: 'frozen', holdReason: reason } })
    if (c.count === 0) return { ok: false, detail: '释放计划不存在或非 scheduled 态' }
    return { ok: true, detail: `释放计划 ${rrId} 已冻结：${reason}` }
  }

  /**
   * 逆向追偿：退款时优先从未释放的 scheduled 行冲减 amount（按 dueAt 早→晚）。
   * 命中行转 clawed_back，settlement.reserveClawedBack 累加。返回实际追回额。
   * 不动已释放部分（已进可提现池/已提现）。
   */
  async clawback(tx: Prisma.TransactionClient, settlementId: string, amount: number): Promise<{ clawed: number }> {
    if (amount <= 0) return { clawed: 0 }
    const rows = await tx.reserveRelease.findMany({ where: { settlementId, status: 'scheduled' }, orderBy: { dueAt: 'asc' } })
    let remain = amount
    let clawed = 0
    for (const rr of rows) {
      if (remain <= 0) break
      const take = Math.min(remain, rr.amount)
      if (take >= rr.amount) {
        // 整行追回
        await tx.reserveRelease.update({ where: { id: rr.id }, data: { status: 'clawed_back', holdReason: '退款逆向追偿' } })
      } else {
        // 部分追回：缩减该行计划额
        await tx.reserveRelease.update({ where: { id: rr.id }, data: { amount: rr.amount - take } })
      }
      remain -= take
      clawed += take
    }
    if (clawed > 0) {
      // 原子递增 reserveClawedBack + 递减 frozen，避免与并发 release 的 lost update（守恒式 II）。
      await tx.settlement.update({
        where: { id: settlementId },
        data: { reserveClawedBack: { increment: clawed }, frozen: { decrement: clawed } },
      })
    }
    return { clawed }
  }

  /** 取所有到期可释放（dueAt ≤ at、status=scheduled）的计划行 id，供端点/定时任务批量释放。 */
  async dueRowIds(at: Date): Promise<string[]> {
    const rows = await this.prisma.reserveRelease.findMany({ where: { status: 'scheduled', dueAt: { lte: at } }, select: { id: true } })
    return rows.map((r) => r.id)
  }
}
