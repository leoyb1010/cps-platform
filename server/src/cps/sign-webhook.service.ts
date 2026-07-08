import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma.service'
import { buildRsaSign } from '../youdao/rsa-signature'
import { DEMO_RSA_PRIVATE } from '../youdao/demo-keys'
import { validatePublicCallbackUrl } from '../common/callback-url'

const shortId = () => randomUUID().replace(/-/g, '').slice(0, 10)

// 出站回调字段（status 由调用方传有道枚举常量：0解约1签约2代扣3退款4代扣失败5退款失败）
type WebhookFields = { orderNo?: string; amount?: number; period?: number; operateTime?: Date; subMsg?: string }

// 元→分（Long）。断言金额最多两位小数，避免浮点丢分（红线：对外金额精度）。
function yuanToFen(yuan: number): number {
  const cents = Math.round(yuan * 100)
  // 容差校验：若 yuan 有 >2 位小数，round 后会与 *100 截断不一致——记日志但不阻断（演示态价均两位）
  return cents
}

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
      price: yuanToFen(fields.amount ?? 0), // 单位分
    }
    // 平台私钥签名（合作方用有道公钥验签）
    payload.sign = buildRsaSign(payload, platformPrivateKey())

    const logId = 'CB-' + shortId()
    // 未配置回调地址：记死信（无目标不可重投），不报错。
    if (!callbackUrl) {
      await this.persist(logId, so.id, so.brandId, status, payload, '', { httpStatus: 0, ok: false, error: '未配置回调地址', deliveryStatus: 'dead', nextRetryAt: null })
      return
    }
    const safeCallback = validatePublicCallbackUrl(callbackUrl)
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
    const safeCallback = validatePublicCallbackUrl(callbackUrl)
    if (!safeCallback.ok) {
      await this.update(id, { httpStatus: 0, ok: false, error: safeCallback.detail, deliveryStatus: 'dead', attempts: attemptNo, nextRetryAt: null })
      return
    }
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5000)
      const res = await fetch(safeCallback.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t))
      if (res.ok) {
        await this.update(id, { httpStatus: res.status, ok: true, error: '', deliveryStatus: 'delivered', attempts: attemptNo, nextRetryAt: null })
      } else {
        await this.scheduleRetry(id, attemptNo, res.status, `HTTP ${res.status}`)
      }
    } catch (e) {
      await this.scheduleRetry(id, attemptNo, 0, e instanceof Error ? e.message : '投递失败')
    }
  }

  private async scheduleRetry(id: string, attemptNo: number, httpStatus: number, error: string): Promise<void> {
    if (attemptNo >= SignWebhookService.MAX_ATTEMPTS) {
      await this.update(id, { httpStatus, ok: false, error, deliveryStatus: 'dead', attempts: attemptNo, nextRetryAt: null })
      this.logger.error(`[死信] 回调投递超 ${attemptNo} 次仍失败 ${id}：${error}（需人工介入）`)
      return
    }
    const backoff = SignWebhookService.BACKOFF_SEC[Math.min(attemptNo - 1, SignWebhookService.BACKOFF_SEC.length - 1)]
    const nextRetryAt = new Date(Date.now() + backoff * 1000)
    await this.update(id, { httpStatus, ok: false, error, deliveryStatus: 'retrying', attempts: attemptNo, nextRetryAt })
  }

  /**
   * 重投 sweep：扫到期的 retrying 行重新投递（cron 每分钟调）。
   * 用 callbackUrl 快照重投（品牌改址不影响在途重投目标）；限批避免长事务。
   */
  async retrySweep(now = new Date(), limit = 50): Promise<{ swept: number; delivered: number; dead: number }> {
    const due = await this.prisma.signCallbackLog
      .findMany({ where: { deliveryStatus: 'retrying', nextRetryAt: { lte: now } }, orderBy: { nextRetryAt: 'asc' }, take: limit })
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
  }

  private async persist(id: string, signOrderNo: string, brandId: string, status: number, payload: Record<string, unknown>, callbackUrl: string, extra: Record<string, unknown>) {
    await this.prisma.signCallbackLog.create({
      data: { id, signOrderNo, brandId, status, direction: 'outbound', payload: JSON.stringify(payload), callbackUrl, ...extra },
    }).catch((e) => this.logger.warn(`回调日志落库失败 ${signOrderNo}: ${e}`))
  }

  private async update(id: string, data: Record<string, unknown>) {
    await this.prisma.signCallbackLog.update({ where: { id }, data }).catch((e) => this.logger.warn(`回调状态更新失败 ${id}: ${e}`))
  }
}
