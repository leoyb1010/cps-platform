import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { buildRsaSign } from '../youdao/rsa-signature'
import { DEMO_RSA_PRIVATE } from '../youdao/demo-keys'
import { postJsonToPublicCallback, validatePublicCallbackUrl } from '../common/callback-url'
import { sendAlert } from '../common/alert'

const shortId = () => randomUUID().replace(/-/g, '').slice(0, 10)

// 出站回调字段（status 由调用方传有道枚举常量：0解约1签约2代扣3退款4代扣失败5退款失败）
// P1-B7：amount 现为整数分（内部全链路分），回调 price 直接取用，无需再 元→分。
type WebhookFields = { orderNo?: string; amount?: number; period?: number; operateTime?: Date; subMsg?: string }

// 平台级回调签名私钥（我方=有道，用它签出站回调，合作方用有道公钥验）。
// 生产走 env/KMS；演示回退到 demo 私钥（与文档「有道平台公钥」对应）。
function platformPrivateKey(): string {
  return process.env.YOUDAO_PLATFORM_PRIVATE_KEY || DEMO_RSA_PRIVATE
}

/**
 * 出站续费状态回调投递：把签约生命周期事件按有道规范回调体推送到合作方 callbackUrl。
 * 用**平台私钥** RSA 签名（合作方用有道公钥验签）。fire-and-forget + 容错（镜像 aigc 超时模式），
 * 不阻塞主事务、不抛错；每次投递落 SignCallbackLog 供「联调日志」展示。
 */
@Injectable()
export class SignWebhookService {
  private readonly logger = new Logger('SignWebhook')
  constructor(private prisma: PrismaService) {}

  /**
   * 在调用方资金/状态事务内写入 outbox。pending 行延迟一分钟到期：正常路径提交后
   * 立即 flush；若进程恰在提交后崩溃，retrySweep 会接管，保证事件不丢。
   */
  async enqueueInTx(tx: Prisma.TransactionClient, signOrderNo: string, status: number, fields: WebhookFields): Promise<string | null> {
    const so = await tx.signOrder.findUnique({ where: { id: signOrderNo } })
    if (!so) return null
    const brand = await tx.brand.findUnique({ where: { id: so.brandId } })
    const callbackUrl = brand?.apiCallbackUrl || ''
    const payload: Record<string, unknown> = {
      custOrderId: so.custOrderId || so.id,
      orderId: fields.orderNo ?? so.id,
      status,
      subMsg: fields.subMsg ?? '',
      effectiveTime: (fields.operateTime ?? new Date()).getTime(),
      price: Math.round(fields.amount ?? 0), // P1-B7：内部已整数分，直接取用（不再 元→分）
    }
    payload.sign = buildRsaSign(payload, platformPrivateKey())
    const id = 'CB-' + shortId()
    await tx.signCallbackLog.create({
      data: {
        id, signOrderNo: so.id, brandId: so.brandId, status, direction: 'outbound',
        payload: JSON.stringify(payload), callbackUrl,
        deliveryStatus: callbackUrl ? 'pending' : 'dead',
        error: callbackUrl ? '' : '未配置回调地址',
        nextRetryAt: callbackUrl ? new Date(Date.now() + 60_000) : null,
      },
    })
    return id
  }

  /** 提交后立即投递已入库 outbox；失败由 attempt 转 retrying，不反向破坏主事务。 */
  async flushEnqueued(id: string | null): Promise<void> {
    if (!id) return
    const row = await this.prisma.signCallbackLog.findUnique({ where: { id } }).catch(() => null)
    if (!row || row.deliveryStatus === 'dead' || row.deliveryStatus === 'delivered') return
    const payload = JSON.parse(row.payload || '{}') as Record<string, unknown>
    await this.attempt(row.id, row.callbackUrl, payload)
  }

  // P0-6：原「提交后非事务 deliver()」已移除。所有资金/生命周期事件一律走事务内 enqueueInTx（与业务状态原子落库）
  //   + 提交后 flushEnqueued 立即投递，崩溃遗漏由 retrySweep 兜底恢复；不再保留会绕过事务的旁路投递入口。

  private static readonly MAX_ATTEMPTS = 5
  // 指数退避（秒）：1min → 5min → 30min → 2h → 6h，覆盖合作方短时抖动到较长维护窗口
  private static readonly BACKOFF_SEC = [60, 300, 1800, 7200, 21600]

  /** 单次投递尝试：成功→delivered；失败且未超次→retrying+排下次；超次→dead 死信告警。 */
  private async attempt(id: string, callbackUrl: string, payload: Record<string, unknown>): Promise<void> {
    const row = await this.prisma.signCallbackLog.findUnique({ where: { id } }).catch(() => null)
    const attemptNo = (row?.attempts ?? 0) + 1
    // P1-S1：真正 fetch 前对品牌可控 callbackUrl 做 SSRF 校验（callback-url，含 DNS 解析 + CIDR），非法则标记死信（不抛断主流程）。
    const safeCallback = await validatePublicCallbackUrl(callbackUrl)
    if (!safeCallback.ok) {
      // attempts 原子 increment（P2-B6）：消除并发 sweep 丢失更新
      await this.update(id, { httpStatus: 0, ok: false, error: safeCallback.detail, deliveryStatus: 'dead', attempts: { increment: 1 }, nextRetryAt: null })
      this.logger.error(`[SSRF拦截] 回调地址非法，标记死信 ${id}：${callbackUrl} — ${safeCallback.detail}`)
      return
    }
    try {
      const res = await postJsonToPublicCallback(safeCallback.url, payload, 5000)
      if (res.ok) {
        // P2-B6：attempts 由"读-加一-写绝对值"改为原子 increment，消除并发 sweep 下的丢失更新
        await this.update(id, { httpStatus: res.status, ok: true, error: '', deliveryStatus: 'delivered', attempts: { increment: 1 }, nextRetryAt: null })
      } else {
        await this.scheduleRetry(id, attemptNo, res.status, `HTTP ${res.status}`)
      }
    } catch (e) {
      await this.scheduleRetry(id, attemptNo, 0, e instanceof Error ? e.message : '投递失败')
    }
  }

  private async scheduleRetry(id: string, attemptNo: number, httpStatus: number, error: string): Promise<void> {
    if (attemptNo >= SignWebhookService.MAX_ATTEMPTS) {
      // P2-B6：attempts 原子 increment（下同）
      await this.update(id, { httpStatus, ok: false, error, deliveryStatus: 'dead', attempts: { increment: 1 }, nextRetryAt: null })
      this.logger.error(`[死信] 回调投递超 ${attemptNo} 次仍失败 ${id}：${error}（需人工介入）`)
      // P1-B9：回调投递死信主动告警——合作方账务同步中断需人工介入。
      void sendAlert('回调投递死信', `回调 ${id} 超 ${attemptNo} 次投递失败：${error}（需人工重推或核查合作方回调地址）`, 'critical')
      return
    }
    const backoff = SignWebhookService.BACKOFF_SEC[Math.min(attemptNo - 1, SignWebhookService.BACKOFF_SEC.length - 1)]
    const nextRetryAt = new Date(Date.now() + backoff * 1000)
    await this.update(id, { httpStatus, ok: false, error, deliveryStatus: 'retrying', attempts: { increment: 1 }, nextRetryAt })
  }

  /**
   * 重投 sweep：扫到期的 retrying 行重新投递（cron 每分钟调）。
   * 用 callbackUrl 快照重投（品牌改址不影响在途重投目标）；限批避免长事务。
   */
  // P0-6 多实例安全认领：实例标识（进程唯一）+ 租约时长。替代原「进程内布尔锁」——
  //   布尔锁只在单进程内互斥，多副本部署时两进程仍各扫同批 retrying 行 → 回调重复投递。
  private readonly instanceId = 'ins-' + randomUUID().replace(/-/g, '').slice(0, 8)
  private static readonly LEASE_MS = 2 * 60 * 1000 // 租约 2 分钟：远大于单批投递耗时；持有者崩溃后到期自动可回收

  async retrySweep(now = new Date(), limit = 50): Promise<{ swept: number; delivered: number; dead: number }> {
    // P0-6 DB 级认领（可移植 CAS 租约，SQLite/PG 通用；SQLite 无 FOR UPDATE SKIP LOCKED）：
    //   逐行条件 updateMany 抢租约，仅认领「到期 + 租约空闲/过期」的行。多实例并发时同一行只有一个
    //   实例 count=1 抢到、其余 count=0 跳过，杜绝多副本重复投递；持有者崩溃后 leaseUntil 到期可回收。
    const leaseUntil = new Date(now.getTime() + SignWebhookService.LEASE_MS)
    const candidates = await this.prisma.signCallbackLog
      .findMany({
        where: {
          deliveryStatus: { in: ['pending', 'retrying'] },
          nextRetryAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
        },
        orderBy: { nextRetryAt: 'asc' }, take: limit,
      })
      .catch(() => [])
    let swept = 0, delivered = 0, dead = 0
    for (const row of candidates) {
      // 抢租约（CAS）：仅当该行仍到期且租约空闲/过期时认领成功（写 lockedBy+leaseUntil）。并发输家 count=0 跳过。
      const claim = await this.prisma.signCallbackLog
        .updateMany({
          where: {
            id: row.id,
            deliveryStatus: { in: ['pending', 'retrying'] },
            OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
          },
          data: { lockedBy: this.instanceId, leaseUntil },
        })
        .catch(() => ({ count: 0 }))
      if (claim.count === 0) continue // 被其它实例抢走或状态已变
      swept++
      const payload = JSON.parse(row.payload || '{}') as Record<string, unknown>
      await this.attempt(row.id, row.callbackUrl, payload)
      // 释放租约：delivered/dead 终态本就不再入选；转 retrying 的行释放后，等 nextRetryAt 到期可被任意实例再认领。
      await this.prisma.signCallbackLog.updateMany({ where: { id: row.id }, data: { lockedBy: null, leaseUntil: null } }).catch(() => {})
      const after = await this.prisma.signCallbackLog.findUnique({ where: { id: row.id } }).catch(() => null)
      if (after?.deliveryStatus === 'delivered') delivered++
      else if (after?.deliveryStatus === 'dead') dead++
    }
    return { swept, delivered, dead }
  }

  private async update(id: string, data: Record<string, unknown>) {
    await this.prisma.signCallbackLog.update({ where: { id }, data }).catch((e) => this.logger.warn(`回调状态更新失败 ${id}: ${e}`))
  }
}
