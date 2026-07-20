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

  async deliver(signOrderNo: string, status: number, fields: WebhookFields): Promise<void> {
    const so = await this.prisma.signOrder.findUnique({ where: { id: signOrderNo } }).catch(() => null)
    if (!so) return
    const brand = await this.prisma.brand.findUnique({ where: { id: so.brandId } }).catch(() => null)
    const callbackUrl = brand?.apiCallbackUrl || ''

    // 有道续费状态回调体：custOrderId/orderId/status/subMsg/effectiveTime(13位毫秒)/price(分 Long)/sign
    const payload: Record<string, unknown> = {
      custOrderId: so.custOrderId || so.id,
      orderId: fields.orderNo ?? so.id, // status 0/1=签约单；2/4=代扣单；3/5=退款单
      status,
      subMsg: fields.subMsg ?? '',
      effectiveTime: (fields.operateTime ?? new Date()).getTime(), // 13 位毫秒级
      price: Math.round(fields.amount ?? 0), // P1-B7：内部已整数分，直接取用（不再 元→分） // 单位分
    }
    // 平台私钥签名（合作方用有道公钥验签）
    payload.sign = buildRsaSign(payload, platformPrivateKey())

    const logId = 'CB-' + shortId()
    // 未配置回调地址：记死信（无目标不可重投），不报错。
    if (!callbackUrl) {
      await this.persist(logId, so.id, so.brandId, status, payload, '', { httpStatus: 0, ok: false, error: '未配置回调地址', deliveryStatus: 'dead', nextRetryAt: null })
      return
    }
    const safeCallback = await validatePublicCallbackUrl(callbackUrl)
    if (!safeCallback.ok) {
      await this.persist(logId, so.id, so.brandId, status, payload, callbackUrl, { httpStatus: 0, ok: false, error: safeCallback.detail, deliveryStatus: 'dead', nextRetryAt: null })
      return
    }

    // 先落 outbox 行（pending），再首次投递；失败则转 retrying + 排下次退避重投。
    await this.persist(logId, so.id, so.brandId, status, payload, safeCallback.url, { deliveryStatus: 'pending' })
    await this.attempt(logId, safeCallback.url, payload)
  }

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
  async retrySweep(now = new Date(), limit = 50): Promise<{ swept: number; delivered: number; dead: number }> {
    // P2-B6：进程内互斥门闩——cron 每分钟触发，若上一轮未跑完则本轮直接跳过，
    // 避免两轮 sweep 取到同批 retrying 行重复投递（回调重复）。
    if (this.sweeping) return { swept: 0, delivered: 0, dead: 0 }
    this.sweeping = true
    try {
      const due = await this.prisma.signCallbackLog
        .findMany({
          where: { deliveryStatus: { in: ['pending', 'retrying'] }, nextRetryAt: { lte: now } },
          orderBy: { nextRetryAt: 'asc' }, take: limit,
        })
        .catch(() => [])
      let delivered = 0, dead = 0
      for (const row of due) {
        const payload = JSON.parse(row.payload || '{}') as Record<string, unknown>
        await this.attempt(row.id, row.callbackUrl, payload)
        const after = await this.prisma.signCallbackLog.findUnique({ where: { id: row.id } }).catch(() => null)
        if (after?.deliveryStatus === 'delivered') delivered++
        else if (after?.deliveryStatus === 'dead') dead++
      }
      return { swept: due.length, delivered, dead }
    } finally {
      this.sweeping = false
    }
  }

  // P2-B6：sweep 进程内互斥门闩（模块单例，NestJS 默认 provider 为单例，进程内唯一）
  private sweeping = false

  private async persist(id: string, signOrderNo: string, brandId: string, status: number, payload: Record<string, unknown>, callbackUrl: string, extra: Record<string, unknown>) {
    await this.prisma.signCallbackLog.create({
      data: { id, signOrderNo, brandId, status, direction: 'outbound', payload: JSON.stringify(payload), callbackUrl, ...extra },
    }).catch((e) => this.logger.warn(`回调日志落库失败 ${signOrderNo}: ${e}`))
  }

  private async update(id: string, data: Record<string, unknown>) {
    await this.prisma.signCallbackLog.update({ where: { id }, data }).catch((e) => this.logger.warn(`回调状态更新失败 ${id}: ${e}`))
  }
}
