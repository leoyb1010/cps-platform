import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { AuditService } from '../audit/audit.service'

export interface ReconItem {
  id: string
  brandId: string
  gross: number
  allocated: number // brandShare + reserve + platformFee + agentPayout + reversal
  diff: number // gross − allocated（应为 0）
}
// 准备金释放守恒不符项（守恒式 II/III/IV）
export interface ReserveItem {
  settlementId: string
  kind: 'frozen_mismatch' | 'plan_sum_mismatch' | 'released_sum_mismatch'
  detail: string
  diff: number
}
export interface ReconResult {
  ok: boolean
  checkedSettlements: number
  mismatches: ReconItem[]
  reserveMismatches: ReserveItem[]
}

/**
 * 对账：逐张结算单核对资金拆分恒等式是否成立——
 *   gross == brandShare + reserve + platformFee + agentPayout + reversal
 * 这是清结算平台的核心账实校验:每一分订单流水都必须落在某个去向上,不重不漏。
 * 任一单拆分对不平,即资金链路异常,写审计告警。
 *
 * 口径修正(v8):旧实现拿"退款流水×0.3"去比月度存量 reversal——两者数量级与来源不同,
 * 恒为假,每次必报全品牌异常。改为同源同尺度的单据内恒等式校验,正常数据应 ok=true。
 *
 * 设计为幂等只读 + 仅在发现差异时落审计,可被定时任务或手动触发安全重复调用。
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name)
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async run(): Promise<ReconResult> {
    const settlements = await this.prisma.settlement.findMany()
    const releases = await this.prisma.reserveRelease.findMany()

    // ── 恒等式 I（计提，静态）：gross = brandShare + reserve + platformFee + agentPayout + reversal ──
    const mismatches: ReconItem[] = []
    for (const s of settlements) {
      const allocated = s.brandShare + s.reserve + s.platformFee + s.agentPayout + s.reversal
      const diff = Math.round(s.gross - allocated)
      // 留 1 元容差防浮点四舍五入
      if (Math.abs(diff) > 1) {
        mismatches.push({ id: s.id, brandId: s.brandId, gross: Math.round(s.gross), allocated: Math.round(allocated), diff })
      }
    }

    // ── 释放守恒（与 I 正交，不改 I 的任何一项）──
    //   II  frozen          == reserve − reserveReleased − reserveClawedBack
    //   III reserve         == reserveReleased + reserveClawedBack + Σ(未释放计划行 amount)   （计划完整性）
    //   IV  reserveReleased == Σ(released 行 releasedAmount)                                  （释放对账）
    const byS = new Map<string, typeof releases>()
    for (const r of releases) {
      const arr = byS.get(r.settlementId) ?? []
      arr.push(r)
      byS.set(r.settlementId, arr)
    }
    const reserveMismatches: ReserveItem[] = []
    const near = (a: number, b: number) => Math.abs(Math.round(a - b)) <= 1 // 1 元容差
    for (const s of settlements) {
      const rows = byS.get(s.id) ?? []
      // II
      const frozenExpected = s.reserve - s.reserveReleased - s.reserveClawedBack
      if (!near(s.frozen, frozenExpected)) {
        reserveMismatches.push({ settlementId: s.id, kind: 'frozen_mismatch', detail: `frozen ${Math.round(s.frozen)} ≠ reserve−released−clawed ${Math.round(frozenExpected)}`, diff: Math.round(s.frozen - frozenExpected) })
      }
      // 仅当该结算单确有释放计划时才校验 III/IV（无计划=未启用分期释放，跳过）
      if (rows.length > 0) {
        // III：未释放（scheduled|frozen）的计划额之和 + 已释放 + 已追偿 == reserve
        const pending = rows.filter((r) => r.status === 'scheduled' || r.status === 'frozen').reduce((a, r) => a + r.amount, 0)
        const planTotal = pending + s.reserveReleased + s.reserveClawedBack
        if (!near(planTotal, s.reserve)) {
          reserveMismatches.push({ settlementId: s.id, kind: 'plan_sum_mismatch', detail: `计划合计 ${Math.round(planTotal)} ≠ reserve ${Math.round(s.reserve)}`, diff: Math.round(planTotal - s.reserve) })
        }
        // IV：已释放行的 releasedAmount 之和 == reserveReleased
        const releasedSum = rows.filter((r) => r.status === 'released').reduce((a, r) => a + r.releasedAmount, 0)
        if (!near(releasedSum, s.reserveReleased)) {
          reserveMismatches.push({ settlementId: s.id, kind: 'released_sum_mismatch', detail: `released 之和 ${Math.round(releasedSum)} ≠ reserveReleased ${Math.round(s.reserveReleased)}`, diff: Math.round(releasedSum - s.reserveReleased) })
        }
      }
    }

    const totalBad = mismatches.length + reserveMismatches.length
    if (totalBad > 0) {
      this.logger.warn(`对账异常：拆分不平 ${mismatches.length} 张、释放守恒不符 ${reserveMismatches.length} 项: ${JSON.stringify({ mismatches, reserveMismatches })}`)
      await this.audit.record({
        action: 'reconcile.run',
        resource: 'Reconciliation',
        resourceId: '-',
        detail: `逐单对账：拆分不平 ${mismatches.length} 张、准备金释放守恒不符 ${reserveMismatches.length} 项`,
        after: { mismatches, reserveMismatches },
      })
    }
    return { ok: totalBad === 0, checkedSettlements: settlements.length, mismatches, reserveMismatches }
  }
}
