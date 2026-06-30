import { Injectable } from '@nestjs/common'
import { randomUUID, createHash } from 'crypto'
import { PrismaService } from '../prisma.service'
import { FulfillmentService } from '../business/fulfillment.service'
import { SettlementService } from '../business/settlement.service'
import { ReserveReleaseService } from '../business/reserve-release.service'
import { IdempotencyService } from '../common/idempotency.service'
import { AuditService } from '../audit/audit.service'
import { MetricsService } from '../common/metrics.service'
import { SignWebhookService } from './sign-webhook.service'
import { YD_STATUS } from '../youdao/youdao-status'

const shortId = () => randomUUID().replace(/-/g, '').slice(0, 10)
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

// 手机号脱敏：前 3 后 4，中间 ****（不存全量 PII）。
export function maskMobile(m: string): string {
  const s = (m || '').replace(/\D/g, '')
  if (s.length < 7) return s ? s.slice(0, 1) + '****' : ''
  return s.slice(0, 3) + '****' + s.slice(-4)
}

/**
 * CPS 连续包月对接领域服务：把签约/扣款/续费/退款/解约的模拟生命周期收敛于此，
 * 供对接控制器（HMAC 入站）与内部 sim 触发端点共用。
 *
 * 资金红线：扣款只走既有 fulfillment.ingestOrder（仅动 achievedGmv/status/Subscription），
 *   退款只走既有 settlement.applyRefundReversal（reversal+agentPayout 恒等），
 *   本服务绝不直接写 Settlement 恒等式五项。
 */
@Injectable()
export class CpsService {
  constructor(
    private prisma: PrismaService,
    private fulfillment: FulfillmentService,
    private settle: SettlementService,
    private reserve: ReserveReleaseService,
    private idem: IdempotencyService,
    private audit: AuditService,
    private metrics: MetricsService,
    private webhook: SignWebhookService,
  ) {}

  // ── 签约：建 SignOrder(signing)，生成 signOrderNo + 模拟收银台 url ──
  async sign(args: { appId: string; brandId: string; signContent: string; mobile: string; payChannel: number; extraInfo?: string }) {
    // 服务端权威定价：以签约商品（sign_content=商品ID）的续费价为单期扣款额；商品须存在且 live。
    const product = await this.prisma.product.findFirst({ where: { id: args.signContent, deletedAt: null } })
    if (!product) return { code: 40004, msg: '签约商品不存在或未上架', data: null }
    const amount = product.renewPrice || product.firstPrice
    const so = 'SIGN-' + shortId()
    await this.prisma.signOrder.create({
      data: {
        id: so, brandId: args.brandId, productId: product.id, plan: product.name,
        mobile: maskMobile(args.mobile), payChannel: args.payChannel === 1 ? 'alipay' : 'wechat',
        status: 'signing', amount, currentPeriod: 0, extraInfo: args.extraInfo ?? '', appId: args.appId,
      },
    })
    await this.audit.record({ user: null, actorName: 'CPS对接', action: 'cps.sign', resource: 'SignOrder', resourceId: so, detail: `签约单 ${so} · 商品 ${product.id} · ¥${amount}` })
    // 模拟收银台链接（演示态）：前端 hash 路由，可在门户内展示签约确认页。
    const url = `/#/sign/${so}`
    return { code: 0, msg: 'success', data: { signOrderNo: so, url, amount } }
  }

  // ── 模拟首扣：signing→active，落首单 Order(first) + Subscription，推 webhook(1签约,2扣款) ──
  async confirmAndFirstCharge(signOrderNo: string, idemKey?: string) {
    const so = await this.prisma.signOrder.findUnique({ where: { id: signOrderNo } })
    if (!so) return { ok: false, detail: '签约单不存在' }
    if (so.status === 'unsigned' || so.status === 'expired') return { ok: false, detail: '签约单已失效' }
    // 已首扣的二次触发：带幂等键则交由 charge() 的幂等层回放首次结果（不双扣）；无键则按状态拒绝。
    if (so.currentPeriod > 0 || so.status === 'active') {
      if (!idemKey) return { ok: false, detail: '已完成首扣，请走续扣' }
    }
    const r = await this.charge(so.id, 0, 'first', idemKey)
    // 签约成功回调（1）+ 扣款成功回调（2），由 charge 内部推 2；这里补 1（仅首次，回放不重推）。
    if (r.ok && !(r as { replayed?: boolean }).replayed) await this.webhook.deliver(so.id, YD_STATUS.SIGNING, { amount: 0, period: 0, operateTime: new Date() })
    return r
  }

  // ── 模拟续扣：currentPeriod+1，落续费 Order(renew)，推 webhook(2) ──
  async renewCharge(signOrderNo: string, idemKey?: string) {
    const so = await this.prisma.signOrder.findUnique({ where: { id: signOrderNo } })
    if (!so) return { ok: false, detail: '签约单不存在' }
    if (so.status !== 'active') return { ok: false, detail: '仅生效签约单可续扣' }
    return this.charge(so.id, so.currentPeriod + 1, 'renew', idemKey)
  }

  // ── 扣款核心（幂等）：走 fulfillment.ingestOrder 落账，恒等式安全。type=first/renew ──
  private async charge(signOrderNo: string, period: number, type: 'first' | 'renew', idemKey?: string) {
    const key = idemKey ?? `${signOrderNo}:${period}`
    const { result, replayed } = await this.idem.run(key, 'cps.charge', async () => {
      return this.prisma.$transaction(async (tx) => {
        const so = await tx.signOrder.findUnique({ where: { id: signOrderNo } })
        if (!so) return { ok: false, detail: '签约单不存在' }
        const amount = so.amount
        const oid = 'O-' + shortId()
        const ext = 'TXN' + shortId()
        await tx.order.create({
          data: {
            id: oid, time: '实时', brandId: so.brandId, agentId: so.agentId || '未知', channel: 'alipay',
            type, amount, plan: so.plan, mid: 'M-CPS', productId: so.productId,
            signOrderNo: so.id, extOrderNo: ext, period,
          },
        })
        const ing = await this.fulfillment.ingestOrder(tx as never, { id: oid, brandId: so.brandId, agentId: so.agentId || '未知', productId: so.productId, amount, type, plan: so.plan })
        // 推进签约单：首扣 → active + 关联订阅；续扣 → currentPeriod=period
        await tx.signOrder.update({
          where: { id: so.id },
          data: {
            status: 'active', currentPeriod: period,
            subscriptionId: ing.subscriptionId ?? so.subscriptionId,
            signedAt: so.signedAt ?? new Date(), nextChargeAt: new Date(Date.now() + 30 * 86400000),
          },
        })
        await this.audit.recordInTx(tx, { user: null, actorName: 'CPS对接', action: 'cps.charge', resource: 'SignOrder', resourceId: so.id, detail: `${type === 'first' ? '首扣' : '续扣'} 第${period}期 · 订单 ${oid} · ¥${amount}` })
        return { ok: true, detail: '扣款成功', signOrderNo: so.id, orderId: oid, extOrderNo: ext, period, amount }
      })
    })
    if (result.ok && !replayed) {
      this.metrics.recordFundAction('cps.charge', 'ok')
      // 扣款成功回调（2）
      await this.webhook.deliver(signOrderNo, YD_STATUS.DEDUCT, { orderNo: result.extOrderNo, amount: result.amount, period, operateTime: new Date() })
    }
    return replayed ? { ...result, replayed: true } : result
  }

  // ── 模拟扣款失败：进补扣队列 + 推 webhook(5) ──
  async failCharge(signOrderNo: string, reason = '余额不足') {
    const so = await this.prisma.signOrder.findUnique({ where: { id: signOrderNo } })
    if (!so) return { ok: false, detail: '签约单不存在' }
    if (so.status !== 'active') return { ok: false, detail: '仅生效签约单可注入扣款失败' }
    const existing = await this.prisma.chargeRetry.findFirst({ where: { signOrderNo: so.id, status: 'pending' } })
    if (existing) return { ok: false, detail: '已有进行中的补扣任务' }
    const cr = 'CR-' + shortId()
    await this.prisma.chargeRetry.create({
      data: { id: cr, signOrderNo: so.id, brandId: so.brandId, amount: so.amount, period: so.currentPeriod + 1, attempt: 0, status: 'pending', reason, nextRetryAt: new Date() },
    })
    await this.audit.record({ user: null, actorName: 'CPS对接', action: 'cps.charge.fail', resource: 'SignOrder', resourceId: so.id, detail: `扣款失败 ${reason} · 进补扣队列 ${cr}` })
    await this.webhook.deliver(so.id, YD_STATUS.DEDUCT_FAIL, { amount: so.amount, period: so.currentPeriod + 1, operateTime: new Date(), subMsg: reason })
    return { ok: true, detail: '已记录扣款失败并进入补扣队列', retryId: cr }
  }

  // ── 退款（幂等）：按 signOrderNo+extOrderNo 反查 Order，走既有逆向冲账，恒等式不破 ──
  async refund(signOrderNo: string, extOrderNo: string, idemKey?: string) {
    const key = idemKey ?? `${signOrderNo}:${extOrderNo}`
    const { result, replayed } = await this.idem.run(key, 'cps.refund', async () => {
      const r = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({ where: { signOrderNo, extOrderNo, type: { in: ['first', 'renew'] } } })
        if (!order) return null
        const dupe = await tx.order.findFirst({ where: { signOrderNo, extOrderNo, type: 'refund' } })
        if (dupe) return null
        const amt = Math.abs(order.amount)
        await tx.order.create({ data: { id: 'O-' + shortId(), time: '现在', brandId: order.brandId, agentId: order.agentId, channel: order.channel, type: 'refund', amount: -amt, plan: order.plan, mid: order.mid, signOrderNo, extOrderNo, period: order.period } })
        const rev = await this.settle.applyRefundReversal(tx, { brandId: order.brandId, amount: amt })
        await this.settle.applyAgentRefundImpact(tx, { agentId: order.agentId, share: rev.share, withCredit: false })
        if (rev.settlement) await this.reserve.clawback(tx, rev.settlement.id, rev.share)
        await this.audit.recordInTx(tx, { user: null, actorName: 'CPS对接', action: 'cps.refund', resource: 'Order', resourceId: order.id, detail: `退款 ¥${amt} · 签约 ${signOrderNo} · 交易 ${extOrderNo} · 冲账 ¥${rev.share}` })
        return { amt, share: rev.share, period: order.period }
      })
      if (!r) {
        this.metrics.recordFundAction('cps.refund', 'reject')
        return { ok: false, detail: '原扣款单不存在或已退款' }
      }
      this.metrics.recordFundAction('cps.refund', 'ok')
      this.metrics.addRefundAmount(r.amt)
      return { ok: true, detail: '退款成功', amount: r.amt, share: r.share, period: r.period }
    })
    if (result.ok && !replayed) await this.webhook.deliver(signOrderNo, YD_STATUS.REFUND, { orderNo: extOrderNo, amount: result.amount, period: result.period ?? 0, operateTime: new Date() })
    return replayed ? { ...result, replayed: true } : result
  }

  // ── 解约：active→unsigned，取消补扣队列，停止续费，推 webhook(3) ──
  async unsign(signOrderNo: string) {
    const so = await this.prisma.signOrder.findUnique({ where: { id: signOrderNo } })
    if (!so) return { ok: false, detail: '签约单不存在' }
    if (so.status === 'unsigned') return { ok: true, detail: '已解约', replayed: true }
    await this.prisma.signOrder.update({ where: { id: so.id }, data: { status: 'unsigned', unsignedAt: new Date() } })
    await this.prisma.chargeRetry.updateMany({ where: { signOrderNo: so.id, status: 'pending' }, data: { status: 'cancelled' } })
    if (so.subscriptionId) await this.prisma.subscription.update({ where: { id: so.subscriptionId }, data: { status: 'churned', churnedAt: new Date() } }).catch(() => undefined)
    await this.audit.record({ user: null, actorName: 'CPS对接', action: 'cps.unsign', resource: 'SignOrder', resourceId: so.id, detail: `解约 ${so.id}` })
    await this.webhook.deliver(so.id, YD_STATUS.UNSIGN, { operateTime: new Date() })
    return { ok: true, detail: '解约成功' }
  }

  // ── 查询：签约单 + 各期扣款状态（对账用）──
  async query(signOrderNo: string) {
    const so = await this.prisma.signOrder.findUnique({ where: { id: signOrderNo } })
    if (!so) return { code: 40004, msg: '签约单不存在', data: null }
    const orders = await this.prisma.order.findMany({ where: { signOrderNo }, orderBy: { createdAt: 'asc' } })
    return {
      code: 0, msg: 'success',
      data: {
        signOrderNo: so.id, status: so.status, plan: so.plan, amount: so.amount, currentPeriod: so.currentPeriod,
        nextChargeAt: so.nextChargeAt, mobile: so.mobile,
        charges: orders.map((o) => ({ orderNo: o.extOrderNo, type: o.type, amount: o.amount, period: o.period, time: o.createdAt })),
      },
    }
  }

  // ── 补扣 sweep（文档 4 节）：扫 pending 补扣单，按规则补扣/终止。 ──
  //   规则：当天失败当天补 1 次，之后每周 1 次；窗口 3 个月；终止条件=补扣成功 / 已解约 / 超 3 月→自动解约。
  //   避峰：22:00~07:00 不补扣（顺延 nextRetryAt）。outcome 显式控制成功/失败，便于演示与 e2e。
  //   红线：成功补扣只走 ingestOrder（type=renew），恒等式安全。
  async runRetrySweep(now: Date, outcome: 'success' | 'fail' = 'success'): Promise<{ swept: number; succeeded: number; exhausted: number; deferred: number }> {
    const rows = await this.prisma.chargeRetry.findMany({ where: { status: 'pending', nextRetryAt: { lte: now } } })
    let succeeded = 0, exhausted = 0, deferred = 0
    const hour = now.getHours()
    for (const cr of rows) {
      // 避峰：深夜顺延到次日 09:00
      if (hour >= 22 || hour < 7) {
        const next = new Date(now); next.setHours(9, 0, 0, 0); if (hour >= 22) next.setDate(next.getDate() + 1)
        await this.prisma.chargeRetry.update({ where: { id: cr.id }, data: { nextRetryAt: next } })
        deferred++; continue
      }
      const so = await this.prisma.signOrder.findUnique({ where: { id: cr.signOrderNo } })
      // 已解约/失效 → 取消补扣
      if (!so || so.status !== 'active') {
        await this.prisma.chargeRetry.update({ where: { id: cr.id }, data: { status: 'cancelled', lastTriedAt: now } })
        continue
      }
      // 超 3 个月窗口未成功 → 自动解约 + 标记 exhausted
      const windowEnd = new Date(cr.windowStart); windowEnd.setMonth(windowEnd.getMonth() + 3)
      if (now > windowEnd) {
        await this.prisma.chargeRetry.update({ where: { id: cr.id }, data: { status: 'exhausted', lastTriedAt: now } })
        await this.unsign(cr.signOrderNo) // 自动解约（推 webhook 3）
        exhausted++; continue
      }
      if (outcome === 'success') {
        // 补扣成功：走 ingestOrder 落续费单（恒等式安全），推进签约单期数，推 webhook(2)，补扣单完成
        const period = cr.period
        const r = await this.idem.run(`${cr.id}:${cr.attempt}`, 'cps.retry', async () => {
          return this.prisma.$transaction(async (tx) => {
            const oid = 'O-' + shortId(); const ext = 'TXN' + shortId()
            await tx.order.create({ data: { id: oid, time: '实时', brandId: so.brandId, agentId: so.agentId || '未知', channel: 'alipay', type: 'renew', amount: cr.amount, plan: so.plan, mid: 'M-CPS', productId: so.productId, signOrderNo: so.id, extOrderNo: ext, period } })
            await this.fulfillment.ingestOrder(tx as never, { id: oid, brandId: so.brandId, agentId: so.agentId || '未知', productId: so.productId, amount: cr.amount, type: 'renew', plan: so.plan })
            await tx.signOrder.update({ where: { id: so.id }, data: { currentPeriod: period, nextChargeAt: new Date(now.getTime() + 30 * 86400000) } })
            await tx.chargeRetry.update({ where: { id: cr.id }, data: { status: 'succeeded', attempt: cr.attempt + 1, lastTriedAt: now } })
            await this.audit.recordInTx(tx, { user: null, actorName: 'CPS对接', action: 'cps.retry', resource: 'ChargeRetry', resourceId: cr.id, detail: `补扣成功 第${period}期 · 订单 ${oid} · ¥${cr.amount}` })
            return { ext, period }
          })
        })
        if (!r.replayed) { this.metrics.recordFundAction('cps.retry', 'ok'); await this.webhook.deliver(so.id, YD_STATUS.DEDUCT, { orderNo: r.result.ext, amount: cr.amount, period: r.result.period, operateTime: now }) }
        succeeded++
      } else {
        // 补扣失败：attempt+1，排下次（首次失败当天再补1次→次日；之后每周）
        const next = new Date(now)
        if (cr.attempt === 0) next.setDate(next.getDate() + 1)
        else next.setDate(next.getDate() + 7)
        await this.prisma.chargeRetry.update({ where: { id: cr.id }, data: { attempt: cr.attempt + 1, nextRetryAt: next, lastTriedAt: now } })
      }
    }
    return { swept: rows.length, succeeded, exhausted, deferred }
  }
}
