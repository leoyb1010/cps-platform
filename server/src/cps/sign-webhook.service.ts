import { Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma.service'
import { buildRsaSign } from '../youdao/rsa-signature'
import { DEMO_RSA_PRIVATE } from '../youdao/demo-keys'
import { validatePublicCallbackUrl } from '../common/callback-url'
import { sendAlert } from '../common/alert'

const shortId = () => randomUUID().replace(/-/g, '').slice(0, 10)
// 模块级 logger（供自由函数 yuanToFen 用；类内另有 this.logger）
const moduleLogger = new Logger('SignWebhook')

// 出站回调字段（status 由调用方传有道枚举常量：0解约1签约2代扣3退款4代扣失败5退款失败）
type WebhookFields = { orderNo?: string; amount?: number; period?: number; operateTime?: Date; subMsg?: string }

// 元→分（Long）。断言金额最多两位小数，避免浮点丢分（红线：对外金额精度）。
function yuanToFen(yuan: number): number {
  const cents = Math.round(yuan * 100)
  // P3-5 容差校验：若 yuan 有 >2 位小数，round 后会与真实分值不一致（丢分）——记日志但不阻断（演示态价均两位）
  if (Math.abs(yuan * 100 - cents) > 1e-6) moduleLogger.warn(`金额 ${yuan} 元超过两位小数，round 为 ${cents} 分可能丢分（对外精度）`)
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

  /**
   * 事务内入队一条出站回调（P0-B3 事务化 outbox）：在调用方**资金事务内**落 SignCallbackLog(pending)，
   * 与资金变更原子提交——进程若在「提交后、投递前」死亡，行仍在，cron sweep 会补投，回调零丢失。
   * 事务内绝不做 HTTP / DNS（长事务持锁、外部副作用不可随事务回滚）：SSRF 校验与实际投递一律推迟到 sweep 的 attempt()。
   * 幂等由调用方事务保证：idem.run 回放不重跑事务体，故同一动作只入队一次。
   */
  async enqueue(tx: Prisma.TransactionClient, signOrderNo: string, status: number, fields: WebhookFields): Promise<void> {
    const so = await tx.signOrder.findUnique({ where: { id: signOrderNo } })
    if (!so) return
    const brand = await tx.brand.findUnique({ where: { id: so.brandId } })
    const callbackUrl = brand?.apiCallbackUrl || ''
    const payload = this.buildSignedPayload(so, status, fields)
    const logId = 'CB-' + shortId()
    if (!callbackUrl) {
      // 无回调地址：直接死信（无目标不可投），仍随资金事务原子落库（可在联调日志显式看到"未配置回调"）。
      await tx.signCallbackLog.create({ data: { id: logId, signOrderNo: so.id, brandId: so.brandId, status, direction: 'outbound', payload: JSON.stringify(payload), callbackUrl: '', httpStatus: 0, ok: false, error: '未配置回调地址', deliveryStatus: 'dead', nextRetryAt: null } })
      return
    }
    // pending + 立即到期（nextRetryAt=now）：下一轮 sweep（每分钟）首投；callbackUrl 快照防品牌改址后丢目标。
    await tx.signCallbackLog.create({ data: { id: logId, signOrderNo: so.id, brandId: so.brandId, status, direction: 'outbound', payload: JSON.stringify(payload), callbackUrl, deliveryStatus: 'pending', nextRetryAt: new Date() } })
  }

  // 构造有道续费状态回调体 + 平台私钥 RSA 签名（合作方用有道公钥验签）。custOrderId/orderId/status/subMsg/effectiveTime(13位毫秒)/price(分 Long)/sign
  private buildSignedPayload(so: { id: string; custOrderId?: string | null }, status: number, fields: WebhookFields): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      custOrderId: so.custOrderId || so.id,
      orderId: fields.orderNo ?? so.id, // status 0/1=签约单；2/4=代扣单；3/5=退款单
      status,
      subMsg: fields.subMsg ?? '',
      effectiveTime: (fields.operateTime ?? new Date()).getTime(), // 13 位毫秒级
      price: yuanToFen(fields.amount ?? 0), // 单位分
    }
    payload.sign = buildRsaSign(payload, platformPrivateKey())
    return payload
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
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5000)
      const res = await fetch(safeCallback.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'manual', // P1-S1：禁止跟随重定向，防 302 跳转绕过上面的 SSRF 校验打内网
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t))
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
   * 投递 sweep（cron 每分钟调）：扫到期的 pending（事务内入队待首投）与 retrying（退避重投）行并投递。
   * P0-B3：pending 覆盖「资金事务已提交、HTTP 投递尚未发生」的行——进程在两者间崩溃时由此补投，回调零丢失。
   * 用 callbackUrl 快照投递（品牌改址不影响在途目标）；限批避免长事务。
   */
  async retrySweep(now = new Date(), limit = 50): Promise<{ swept: number; delivered: number; dead: number }> {
    // P2-B6：进程内互斥门闩——cron 每分钟触发，若上一轮未跑完则本轮直接跳过，
    // 避免两轮 sweep 取到同批行重复投递（回调重复）。
    if (this.sweeping) return { swept: 0, delivered: 0, dead: 0 }
    this.sweeping = true
    try {
      // createdAt 次序：同一签约单的多条回调（如首扣 1 签约→2 扣款）按入队序尽量顺序投递。
      const due = await this.prisma.signCallbackLog
        .findMany({ where: { deliveryStatus: { in: ['pending', 'retrying'] }, nextRetryAt: { lte: now } }, orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }], take: limit })
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

  private async update(id: string, data: Record<string, unknown>) {
    await this.prisma.signCallbackLog.update({ where: { id }, data }).catch((e) => this.logger.warn(`回调状态更新失败 ${id}: ${e}`))
  }
}
