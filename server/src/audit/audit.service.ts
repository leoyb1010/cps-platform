import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import type { AuthUser } from '../rbac/rbac'

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
  constructor(private prisma: PrismaService) {}

  async record(p: {
    user?: AuthUser | null
    action: string
    resource: string
    resourceId?: string
    detail?: string
    before?: unknown
    after?: unknown
    ip?: string
    ua?: string
  }) {
    await this.prisma.auditLog
      .create({
        data: {
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
        },
      })
      .catch((e) => {
        // 审计不阻断主流程，但绝不静默丢失：落到可观测的错误日志，便于告警/补记。
        // 高价值(fund)动作的审计丢失尤需被发现。
        this.logger.error(`审计写入失败(已丢失一条 ${categorize(p.action, p.detail ?? '')} 记录): action=${p.action} resource=${p.resource}:${p.resourceId ?? ''} err=${e instanceof Error ? e.message : String(e)}`)
      })
  }

  list(params: { category?: string; take?: number }) {
    return this.prisma.auditLog.findMany({
      where: params.category && params.category !== 'all' ? { category: params.category } : undefined,
      orderBy: { at: 'desc' },
      take: params.take ?? 200,
    })
  }
}
