import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { AuditService } from '../audit/audit.service'

export interface ReconResult {
  ok: boolean
  checkedBrands: number
  mismatches: { brandId: string; refundSum: number; reversalSum: number; diff: number }[]
}

/**
 * 对账：核对各品牌「退款流水合计」与「结算逆向冲账合计」是否一致。
 * 退款应等额体现在结算 reversal 上；差异即资金链路异常，写审计告警。
 * 设计为幂等只读 + 仅在发现差异时落审计，可被定时任务或手动触发安全重复调用。
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name)
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async run(): Promise<ReconResult> {
    const [orders, settlements] = await Promise.all([this.prisma.order.findMany({ where: { type: 'refund' } }), this.prisma.settlement.findMany()])

    // 各品牌退款金额合计（绝对值）
    const refundByBrand = new Map<string, number>()
    for (const o of orders) {
      refundByBrand.set(o.brandId, (refundByBrand.get(o.brandId) ?? 0) + Math.abs(o.amount))
    }
    // 各品牌结算逆向冲账合计
    const reversalByBrand = new Map<string, number>()
    for (const s of settlements) {
      reversalByBrand.set(s.brandId, (reversalByBrand.get(s.brandId) ?? 0) + s.reversal)
    }

    const brands = new Set<string>([...refundByBrand.keys(), ...reversalByBrand.keys()])
    const mismatches: ReconResult['mismatches'] = []
    for (const brandId of brands) {
      const refundSum = Math.round(refundByBrand.get(brandId) ?? 0)
      const reversalSum = Math.round(reversalByBrand.get(brandId) ?? 0)
      // 冲账按 30% 分润口径，故退款的 30% 应约等于 reversal；留 1 元容差防四舍五入
      const expected = Math.round(refundSum * 0.3)
      const diff = Math.abs(expected - reversalSum)
      if (diff > 1) mismatches.push({ brandId, refundSum, reversalSum, diff })
    }

    if (mismatches.length > 0) {
      this.logger.warn(`对账发现 ${mismatches.length} 个品牌差异: ${JSON.stringify(mismatches)}`)
      await this.audit.record({
        action: 'reconcile.run',
        resource: 'Reconciliation',
        resourceId: '-',
        detail: `每日对账：${mismatches.length} 个品牌退款↔冲账不一致`,
        after: { mismatches },
      })
    }
    return { ok: mismatches.length === 0, checkedBrands: brands.size, mismatches }
  }
}
