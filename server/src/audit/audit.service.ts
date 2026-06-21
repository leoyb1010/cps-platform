import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { MetricsService } from '../common/metrics.service'
import type { AuthUser } from '../rbac/rbac'

export interface AuditInput {
  user?: AuthUser | null
  action: string
  resource: string
  resourceId?: string
  detail?: string
  before?: unknown
  after?: unknown
  ip?: string
  ua?: string
}
// 事务客户端类型（$transaction 回调里的 tx）
type TxClient = Prisma.TransactionClient

function categorize(action: string, detail: string): string {
  const s = action + ' ' + detail
  if (/refund|reversal|settle|clear|reconcile|withdraw|payout/i.test(s) || /退款|冲账|结算|提现|对账|分润/.test(s)) return 'fund'
  if (/risk|fuse|freeze|block|state/i.test(s) || /限流|冻结|熔断|拉黑|风控|暂停|号池/.test(s)) return 'risk'
  if (/config|role|member|brand\..*write/i.test(s) || /配置|阈值|通道|角色|权限/.test(s)) return 'config'
  if (/login|logout|auth/i.test(s)) return 'account'
  return 'other'
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  private toData(p: AuditInput) {
    return {
      actorId: p.user?.id ?? null,
      actorName: p.user?.name ?? '系统',
      role: p.user?.roleId ?? '',
      action: p.action,
      resource: p.resource,
      resourceId: p.resourceId ?? '',
      category: categorize(p.action, p.detail ?? ''),
      detail: p.detail ?? '',
      before: p.before ? JSON.stringify(p.before) : null,
      after: p.after ? JSON.stringify(p.after) : null,
      ip: p.ip ?? '',
      ua: p.ua ?? '',
    }
  }

  // 最近一次审计成功写入时间（健康探针用：若长时间无成功写入可能审计链路异常）
  private _lastSuccessAt: Date | null = null
  get lastSuccessAt(): Date | null {
    return this._lastSuccessAt
  }

  /** best-effort（fail-open，但失败可观测）：用于非资金类、事后拦截器等场景。 */
  async record(p: AuditInput) {
    await this.prisma.auditLog
      .create({ data: this.toData(p) })
      .then(() => {
        this._lastSuccessAt = new Date()
      })
      .catch((e) => {
        // 审计不阻断主流程，但绝不静默丢失：落到可观测的错误日志 + 指标计数，便于告警/补记。
        this.metrics.recordAuditFailure()
        this.logger.error(`审计写入失败(已丢失一条 ${categorize(p.action, p.detail ?? '')} 记录): action=${p.action} resource=${p.resource}:${p.resourceId ?? ''} err=${e instanceof Error ? e.message : String(e)}`)
      })
  }

  /**
   * fail-closed：在给定事务客户端内写审计。失败会抛出 → 让整笔业务事务回滚。
   * 用于资金类高价值动作（结算/退款/提现/冲账）：保证「无审计不放行」。
   */
  async recordInTx(tx: TxClient, p: AuditInput) {
    await tx.auditLog.create({ data: this.toData(p) })
    this._lastSuccessAt = new Date()
  }

  list(params: { category?: string; take?: number }) {
    return this.prisma.auditLog.findMany({
      where: params.category && params.category !== 'all' ? { category: params.category } : undefined,
      orderBy: { at: 'desc' },
      take: params.take ?? 200,
    })
  }
}
