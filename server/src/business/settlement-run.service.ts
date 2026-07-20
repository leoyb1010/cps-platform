import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma.service'
import { AuditService } from '../audit/audit.service'
import { sum, mul, minus, round2, splitProportional } from '../common/money'

const shortId = () => randomUUID().replace(/-/g, '').slice(0, 10)

/**
 * P0-B1 结算单生成器 + P0-B2 准备金释放计划生成器（补齐「清结算的生产侧」）。
 *
 * 此前全仓无任何「按账期聚合已履约订单 → 生成结算单」的生产代码，结算单只能靠 seed 灌入，
 * clear/reconcile 仅做状态翻转，系统无法真实出账。本服务补齐生成侧：
 *   1. 按 (品牌, 账期) 聚合区间内 first/renew 订单为 gross（GMV）。
 *   2. 按品牌费率拆分（恒等式 I 精确守衡）：
 *        reserve      = gross × reservePct/100                （风险准备金冻结额）
 *        brandShare   = gross × (100−feeRate)/100             （品牌留存）
 *        distributable= gross − brandShare − reserve          （分润池：扣准备金后可分）
 *        platformFee  = distributable × PLATFORM_MARGIN_RATE  （平台抽成）
 *        agentPayout  = distributable − platformFee           （渠道分润 = 残差，吸收舍入 → 恒等式 I 恒等）
 *      验证：brandShare + reserve + platformFee + agentPayout + reversal(0) ≡ gross。
 *   3. 同事务生成 ReserveRelease 计划行（scheduled）：按各代理 GMV 占比分摊 reserve，再按 D7/D30/D60/D90
 *      分期，Σ 计划行 amount ≡ reserve（满足对账守恒 III：reserve == Σ未释放 amount + released + clawed）。
 *   4. 幂等：@@unique([period, brandId]) 保证同品牌同账期只出一张；重复跑批命中唯一约束即跳过（不覆盖已累计的
 *      reversal/reserveReleased）。
 *
 * 红线：本服务只「计提」（生成静态结算单 + 释放计划），绝不触碰退款冲账（reversal）与释放/追偿动作——
 *   那些由 SettlementService / ReserveReleaseService 在各自事务内推进。
 */
@Injectable()
export class SettlementRunService {
  private readonly logger = new Logger('SettlementRun')
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // 平台在「扣除准备金后的分润池」中的抽成比例（演示口径；与既有 seed youdao 的 platformFee 占比一致）。
  // 其余归代理分润（agentPayout）。整数分迁移后此常量口径不变。
  private static readonly PLATFORM_MARGIN_RATE = 0.21

  // 默认准备金分期释放模板：D7/D30/D60/D90 四期等分（stage 命名与既有台账一致）。
  // 权重用于 splitProportional（末期吸收舍入残差，保证 Σ 各期 = 该代理准备金额）。
  private static readonly STAGES: { stage: string; weight: number; days: number }[] = [
    { stage: 'D7_init', weight: 25, days: 7 },
    { stage: 'D30_quality', weight: 25, days: 30 },
    { stage: 'D60_renew', weight: 25, days: 60 },
    { stage: 'D90_renew', weight: 25, days: 90 },
  ]

  /**
   * 按品牌费率拆分 gross（纯函数，恒等式 I 精确守衡；reversal 生成时为 0）。
   * @throws 当分润池为负（feeRate < reservePct 的异常配置）时返回 null，交由调用方跳过并告警。
   */
  computeSplit(gross: number, feeRate: number, reservePct: number): { gross: number; brandShare: number; reserve: number; platformFee: number; agentPayout: number } | null {
    const reserve = mul(gross, reservePct / 100)
    const brandShare = mul(gross, (100 - feeRate) / 100)
    const distributable = minus(minus(gross, brandShare), reserve) // gross − brandShare − reserve
    if (distributable < 0) return null // 异常费率配置（费率 < 准备金比例），拒绝生成
    const platformFee = round2(Math.min(mul(distributable, SettlementRunService.PLATFORM_MARGIN_RATE), distributable))
    const agentPayout = minus(distributable, platformFee) // 残差吸收舍入 → 恒等式 I 恒等
    return { gross, brandShare, reserve, platformFee, agentPayout }
  }

  /**
   * 构造准备金释放计划行：按各代理在本期的 GMV 占比分摊 reserve，再按 STAGES 分期。
   * Σ 所有行 amount ≡ reserve（splitProportional 末项吸收残差，双层都精确）。
   */
  buildReleaseRows(
    orders: { amount: number; agentId: string | null }[],
    reserve: number,
    settlementId: string,
    at: Date,
  ): { id: string; settlementId: string; contractId: null; agentId: string; stage: string; amount: number; dueAt: Date; status: string; releasedAmount: number; holdReason: string }[] {
    const rows: { id: string; settlementId: string; contractId: null; agentId: string; stage: string; amount: number; dueAt: Date; status: string; releasedAmount: number; holdReason: string }[] = []
    if (reserve <= 0) return rows
    // 按代理聚合 GMV（空 agentId 归入 '未知'，与 CPS 订单落库口径一致）
    const byAgent = new Map<string, number>()
    for (const o of orders) {
      const a = o.agentId || '未知'
      byAgent.set(a, round2((byAgent.get(a) ?? 0) + o.amount))
    }
    const agents = [...byAgent.keys()]
    const agentReserves = splitProportional(reserve, agents.map((a) => byAgent.get(a) ?? 0)) // Σ ≡ reserve
    for (let i = 0; i < agents.length; i++) {
      const agentReserve = agentReserves[i]
      if (agentReserve <= 0) continue
      const stageAmounts = splitProportional(agentReserve, SettlementRunService.STAGES.map((s) => s.weight)) // Σ ≡ agentReserve
      for (let j = 0; j < SettlementRunService.STAGES.length; j++) {
        const amt = stageAmounts[j]
        if (amt <= 0) continue
        const st = SettlementRunService.STAGES[j]
        const dueAt = new Date(at.getTime() + st.days * 86400000)
        rows.push({ id: 'RR-' + shortId(), settlementId, contractId: null, agentId: agents[i], stage: st.stage, amount: amt, dueAt, status: 'scheduled', releasedAmount: 0, holdReason: '' })
      }
    }
    return rows
  }

  /**
   * 为单个品牌单个账期生成结算单 + 释放计划（幂等）。
   * @param from/to 账期时间区间（订单 createdAt ∈ [from, to)）。
   */
  async generateForBrandPeriod(args: { brandId: string; period: string; from: Date; to: Date; at?: Date; actorName?: string }): Promise<{ brandId: string; created: boolean; id?: string; gross?: number; reason?: string }> {
    const at = args.at ?? new Date()
    const brand = await this.prisma.brand.findUnique({ where: { id: args.brandId } })
    if (!brand) return { brandId: args.brandId, created: false, reason: 'brand-not-found' }
    // 聚合区间内正向订单（first/renew）为 gross；退款走既有 reversal 动态冲账，不在生成时预扣。
    const orders = await this.prisma.order.findMany({
      where: { brandId: args.brandId, type: { in: ['first', 'renew'] }, createdAt: { gte: args.from, lt: args.to } },
      select: { amount: true, agentId: true },
    })
    if (orders.length === 0) return { brandId: args.brandId, created: false, reason: 'no-orders' }
    const gross = sum(orders.map((o) => o.amount))
    if (gross <= 0) return { brandId: args.brandId, created: false, reason: 'zero-gross' }
    const split = this.computeSplit(gross, brand.feeRate, brand.reservePct)
    if (!split) {
      this.logger.warn(`品牌 ${brand.id} 费率配置异常（feeRate=${brand.feeRate} < reservePct=${brand.reservePct}），跳过生成`)
      return { brandId: args.brandId, created: false, reason: 'invalid-fee-config' }
    }
    const settlementId = 'SR-' + shortId()
    const releaseRows = this.buildReleaseRows(orders, split.reserve, settlementId, at)
    const agentShareSnapshot = gross > 0 ? +(split.agentPayout / gross).toFixed(6) : 0
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.settlement.create({
          data: {
            id: settlementId, period: args.period, brandId: args.brandId,
            gross, brandShare: split.brandShare, platformFee: split.platformFee, agentPayout: split.agentPayout,
            reserve: split.reserve, reversal: 0, frozen: split.reserve, // 守恒式 II：frozen = reserve − 0 − 0
            reserveReleased: 0, reserveClawedBack: 0, status: 'pending', reconcileDiff: 0, agentShareSnapshot,
          },
        })
        for (const r of releaseRows) await tx.reserveRelease.create({ data: r })
        await this.audit.recordInTx(tx, {
          user: null, actorName: args.actorName ?? '结算跑批',
          action: 'settlement.generate', resource: 'Settlement', resourceId: settlementId,
          detail: `生成结算单 ${settlementId} · ${brand.name} · ${args.period} · GMV ¥${gross} · 准备金 ¥${split.reserve}（${releaseRows.length} 期释放计划）`,
          after: { gross, brandShare: split.brandShare, platformFee: split.platformFee, agentPayout: split.agentPayout, reserve: split.reserve },
        })
      })
      return { brandId: args.brandId, created: true, id: settlementId, gross }
    } catch (e) {
      // @@unique([period, brandId]) 命中：同品牌同账期已生成，幂等跳过（不覆盖已累计的 reversal/释放）。
      if ((e as { code?: string }).code === 'P2002') return { brandId: args.brandId, created: false, reason: 'already-generated' }
      throw e
    }
  }

  /**
   * 为一个账期生成所有「区间内有正向订单」品牌的结算单（每品牌独立事务 + 幂等）。
   * 单品牌失败不影响其它品牌；返回逐品牌结果。
   */
  async generatePeriod(args: { period: string; from: Date; to: Date; at?: Date; actorName?: string }): Promise<{ period: string; generated: number; skipped: number; results: { brandId: string; created: boolean; id?: string; gross?: number; reason?: string }[] }> {
    // 区间内有正向订单的品牌集合（distinct brandId）——只对有 GMV 的品牌出账。
    const rows = await this.prisma.order.findMany({
      where: { type: { in: ['first', 'renew'] }, createdAt: { gte: args.from, lt: args.to } },
      select: { brandId: true }, distinct: ['brandId'],
    })
    const results: { brandId: string; created: boolean; id?: string; gross?: number; reason?: string }[] = []
    for (const { brandId } of rows) {
      results.push(await this.generateForBrandPeriod({ brandId, period: args.period, from: args.from, to: args.to, at: args.at, actorName: args.actorName }))
    }
    const generated = results.filter((r) => r.created).length
    return { period: args.period, generated, skipped: results.length - generated, results }
  }
}
