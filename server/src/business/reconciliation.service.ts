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
export interface ReconResult {
  ok: boolean
  checkedSettlements: number
  mismatches: ReconItem[]
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

    const mismatches: ReconItem[] = []
    for (const s of settlements) {
      const allocated = s.brandShare + s.reserve + s.platformFee + s.agentPayout + s.reversal
      const diff = Math.round(s.gross - allocated)
      // 留 1 元容差防浮点四舍五入
      if (Math.abs(diff) > 1) {
        mismatches.push({ id: s.id, brandId: s.brandId, gross: Math.round(s.gross), allocated: Math.round(allocated), diff })
      }
    }

    if (mismatches.length > 0) {
      this.logger.warn(`对账发现 ${mismatches.length} 张结算单拆分不平: ${JSON.stringify(mismatches)}`)
      await this.audit.record({
        action: 'reconcile.run',
        resource: 'Reconciliation',
        resourceId: '-',
        detail: `逐单对账：${mismatches.length} 张结算单资金拆分不平（gross ≠ 各项之和）`,
        after: { mismatches },
      })
    }
    return { ok: mismatches.length === 0, checkedSettlements: settlements.length, mismatches }
  }
}
