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
    // P2-B4：分批(cursor)扫描，不再 findMany() 全表进内存——结算单量大时会撑爆内存。
    //   每批只取 BATCH 张结算单，再按 settlementId in 批量取其释放计划行；内存占用与批大小成正比、与总量无关。
    //   容差暂留 ±1 元：生产存储仍是 Float（Decimal 落地在 P0-3 阶段3），此刻收紧到 0.01 会误报浮点尾差。
    const BATCH = 500
    const mismatches: ReconItem[] = []
    const reserveMismatches: ReserveItem[] = []
    const near = (a: number, b: number) => Math.abs(Math.round(a - b)) <= 1 // 1 元容差
    let checkedSettlements = 0
    let cursor: string | undefined

    for (;;) {
      const settlements = await this.prisma.settlement.findMany({
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      })
      if (settlements.length === 0) break
      cursor = settlements[settlements.length - 1].id
      checkedSettlements += settlements.length

      // 本批结算单对应的释放计划行（按 settlementId 批量取，避免整表 reserveRelease 进内存）
      const releases = await this.prisma.reserveRelease.findMany({ where: { settlementId: { in: settlements.map((s) => s.id) } } })
      const byS = new Map<string, typeof releases>()
      for (const r of releases) {
        const arr = byS.get(r.settlementId) ?? []
        arr.push(r)
        byS.set(r.settlementId, arr)
      }

      for (const s of settlements) {
        // ── 恒等式 I（计提，静态）：gross = brandShare + reserve + platformFee + agentPayout + reversal ──
        const allocated = s.brandShare + s.reserve + s.platformFee + s.agentPayout + s.reversal
        const diff = Math.round(s.gross - allocated)
        if (Math.abs(diff) > 1) {
          mismatches.push({ id: s.id, brandId: s.brandId, gross: Math.round(s.gross), allocated: Math.round(allocated), diff })
        }

        // ── 释放守恒（与 I 正交，不改 I 的任何一项）──
        //   II  frozen          == reserve − reserveReleased − reserveClawedBack
        //   III reserve         == reserveReleased + reserveClawedBack + Σ(未释放计划行 amount)
        //   IV  reserveReleased == Σ(released 行 releasedAmount)
        const rows = byS.get(s.id) ?? []
        const frozenExpected = s.reserve - s.reserveReleased - s.reserveClawedBack
        if (!near(s.frozen, frozenExpected)) {
          reserveMismatches.push({ settlementId: s.id, kind: 'frozen_mismatch', detail: `frozen ${Math.round(s.frozen)} ≠ reserve−released−clawed ${Math.round(frozenExpected)}`, diff: Math.round(s.frozen - frozenExpected) })
        }
        // 仅当该结算单确有释放计划时才校验 III/IV（无计划=未启用分期释放，跳过）
        if (rows.length > 0) {
          const pending = rows.filter((r) => r.status === 'scheduled' || r.status === 'frozen').reduce((a, r) => a + r.amount, 0)
          const planTotal = pending + s.reserveReleased + s.reserveClawedBack
          if (!near(planTotal, s.reserve)) {
            reserveMismatches.push({ settlementId: s.id, kind: 'plan_sum_mismatch', detail: `计划合计 ${Math.round(planTotal)} ≠ reserve ${Math.round(s.reserve)}`, diff: Math.round(planTotal - s.reserve) })
          }
          const releasedSum = rows.filter((r) => r.status === 'released').reduce((a, r) => a + r.releasedAmount, 0)
          if (!near(releasedSum, s.reserveReleased)) {
            reserveMismatches.push({ settlementId: s.id, kind: 'released_sum_mismatch', detail: `released 之和 ${Math.round(releasedSum)} ≠ reserveReleased ${Math.round(s.reserveReleased)}`, diff: Math.round(releasedSum - s.reserveReleased) })
          }
        }
      }

      if (settlements.length < BATCH) break
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
    return { ok: totalBad === 0, checkedSettlements, mismatches, reserveMismatches }
  }
}
