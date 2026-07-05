import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma.service'
import { AuditService } from '../audit/audit.service'
import { IdempotencyService } from '../common/idempotency.service'
import { MetricsService } from '../common/metrics.service'
import { ReconciliationService } from './reconciliation.service'
import { ReserveReleaseService } from './reserve-release.service'
import { CpsService } from '../cps/cps.service'
import { SignWebhookService } from '../cps/sign-webhook.service'

/**
 * 定时任务（端点先行 + cron 后挂）。
 * 每个 @Cron 方法体极薄，只调既有 service —— 与手动触发端点共用同一逻辑，行为一致、可被端点测试覆盖。
 *
 * 资金类任务（准备金到期释放）的纪律：
 *   - 复用 IdempotencyService + 审计 fail-closed + 条件更新，cron 触发带「日期级」幂等键，
 *     防止任务重叠/重启导致重复释放（不双花）。
 *   - 测试环境（NODE_ENV=test）跳过自动触发，避免干扰 e2e 的资金状态断言。
 */
@Injectable()
export class ScheduledTasksService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledTasksService.name)
  private readonly enabled = process.env.NODE_ENV !== 'test'

  /**
   * 启动补跑：进程恰在 02:07 前后重启会跳过当日准备金释放。释放本身按 dueAt 查询 +
   * 日期级幂等键，天然支持 catch-up——启动时调一次即可补齐漏跑，且不会重复释放。
   * 生产多副本时靠幂等键去重（不双花），非阻塞：失败仅告警不影响服务启动。
   */
  async onModuleInit(): Promise<void> {
    if (!this.enabled) return
    this.releaseDueReserves().catch((e) => this.logger.warn(`[启动补跑] 准备金释放失败：${e instanceof Error ? e.message : e}`))
  }

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private idem: IdempotencyService,
    private metrics: MetricsService,
    private recon: ReconciliationService,
    private reserve: ReserveReleaseService,
    private cps: CpsService,
    private webhook: SignWebhookService,
  ) {}

  /** 每分钟重投到期的失败回调（准 outbox 指数退避；超 5 次转死信告警）。 */
  @Cron(CronExpression.EVERY_MINUTE)
  async webhookRetrySweep(): Promise<void> {
    if (!this.enabled) return
    const r = await this.webhook.retrySweep(new Date())
    if (r.swept > 0) this.logger.log(`[定时] 回调重投：扫 ${r.swept}，成功 ${r.delivered}，死信 ${r.dead}`)
  }

  /** 每日 02:07 释放所有到期准备金（与手动 POST /reserve/release-due 同逻辑）。 */
  @Cron('7 2 * * *')
  async releaseDueReserves(): Promise<void> {
    if (!this.enabled) return
    const now = new Date()
    const dayKey = `cron-reserve-release-${now.toISOString().slice(0, 10)}` // 日期级幂等键：当天重复触发不重复释放
    await this.idem.run(dayKey, 'reserve.release-due', async () => {
      const ids = await this.reserve.dueRowIds(now)
      let released = 0
      let amount = 0
      for (const rrId of ids) {
        const res = await this.prisma.$transaction(async (tx) => {
          const r = await this.reserve.releaseRow(tx, rrId, now)
          if (r.ok) await this.audit.recordInTx(tx, { action: 'reserve.release', resource: 'ReserveRelease', resourceId: rrId, detail: `[定时] ${r.detail}` })
          return r
        })
        if (res.ok) { released++; amount += res.amount ?? 0 }
      }
      this.metrics.recordFundAction('reserve.release-due', 'ok')
      if (released > 0) this.logger.log(`[定时] 准备金到期释放 ${released} 笔，合计 ¥${amount}`)
      return { released, amount }
    })
  }

  /** 每小时跑一次对账（只读 + 仅差异落审计，可安全重复）。 */
  @Cron(CronExpression.EVERY_HOUR)
  async hourlyReconciliation(): Promise<void> {
    if (!this.enabled) return
    const r = await this.recon.run()
    if (!r.ok) this.logger.warn(`[定时] 对账发现异常：拆分不平 ${r.mismatches.length}、释放守恒不符 ${r.reserveMismatches.length}`)
  }

  /** 每日 10:30 跑一次 CPS 补扣 sweep（工作时段，避开深夜；与手动 POST /cps/retry/sweep 同逻辑）。 */
  @Cron('30 10 * * *')
  async cpsRetrySweep(): Promise<void> {
    if (!this.enabled) return
    const res = await this.cps.runRetrySweep(new Date())
    if (res.swept > 0) this.logger.log(`[定时] CPS 补扣 sweep：扫 ${res.swept} 笔，成功 ${res.succeeded}，终止解约 ${res.exhausted}，顺延 ${res.deferred}`)
  }
}
