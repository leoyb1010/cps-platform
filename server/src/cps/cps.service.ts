import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma.service'
import { FulfillmentService } from '../business/fulfillment.service'
import { SettlementService } from '../business/settlement.service'
import { ReserveReleaseService } from '../business/reserve-release.service'
import { IdempotencyService } from '../common/idempotency.service'
import { AuditService } from '../audit/audit.service'
import { MetricsService } from '../common/metrics.service'
import { SignWebhookService } from './sign-webhook.service'
import { YD_STATUS } from '../youdao/youdao-status'
import { toYuan } from '../common/money' // P1-B7：内部分 → 审计展示元

const shortId = () => randomUUID().replace(/-/g, '').slice(0, 10)

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
    // 服务端权威定价：以签约商品（sign_content=商品ID）的续费价为单期扣款额；商品须存在且 live（未过审/下架不可签约扣款）。
    // 归属校验：商品必须属于该凭证品牌——否则品牌 A 的凭证可签约品牌 B 的商品，
    // GMV/结算全记到 A 头上（跨品牌资金归属错乱，曾在联调中实际发生）。
    const product = await this.prisma.product.findFirst({ where: { id: args.signContent, brandId: args.brandId, deletedAt: null, status: 'live' } })
    if (!product) return { code: 40004, msg: '签约商品不存在、未上架或不属于该品牌', data: null }
    const amount = product.renewPrice || product.firstPrice
    const so = 'SIGN-' + shortId()
    await this.prisma.signOrder.create({
      data: {
        id: so, brandId: args.brandId, productId: product.id, plan: product.name,
        mobile: maskMobile(args.mobile), payChannel: args.payChannel === 1 ? 'alipay' : 'wechat',
        status: 'signing', amount, currentPeriod: 0, extraInfo: args.extraInfo ?? '', appId: args.appId,
      },
    })
    await this.audit.record({ user: null, actorName: 'CPS对接', action: 'cps.sign', resource: 'SignOrder', resourceId: so, detail: `签约单 ${so} · 商品 ${product.id} · ¥${toYuan(amount)}` })
    // 模拟收银台链接（演示态）：前端 hash 路由，可在门户内展示签约确认页。
    const url = `/#/sign/${so}`
    return { code: 0, msg: 'success', data: { signOrderNo: so, url, amount } }
  }

  // ── 模拟首扣：signing→active，落首单 Order(first) + Subscription，推 webhook(1签约,2扣款) ──
  async confirmAndFirstCharge(signOrderNo: string, idemKey?: string) {
    const so = await this.prisma.signOrder.findUnique({ where: { id: signOrderNo } })
    if (!so) return { ok: false, detail: '签约单不存在' }
    if (so.status === 'unsigned' || so.status === 'expired') return { ok: false, detail: '签约单已失效' }
    // 首扣幂等键强制绑定签约单（忽略调用方任意键），确保二次首扣——无论携带何种 Idempotency-Key——都命中同一键回放首次结果，
    // 绝不以 period=0 再次落单、双计 GMV。续扣走 renewCharge。
    // P0-6：签约(1)+扣款(2) webhook 均在 charge 的业务事务内 enqueueInTx 入队、提交后按序 flush（先 1 后 2，P3-4），
    //   不再「提交后独立 deliver」——进程若在提交后崩溃，outbox 行已随扣款原子落库，retrySweep 可恢复不丢事件。
    return this.charge(so.id, 0, 'first', `first:${so.id}`, { prevStatus: 'signing', prevPeriod: 0 })
  }

  // ── 模拟续扣：currentPeriod+1，落续费 Order(renew)，推 webhook(2) ──
  async renewCharge(signOrderNo: string, idemKey?: string) {
    const so = await this.prisma.signOrder.findUnique({ where: { id: signOrderNo } })
    if (!so) return { ok: false, detail: '签约单不存在' }
    if (so.status !== 'active') return { ok: false, detail: '仅生效签约单可续扣' }
    // guard 传续扣期望前置（active/当前期），条件更新确保只从"上一期 active"跃迁一期，防同期并发双扣与解约后复活（P1-B2）。
    return this.charge(so.id, so.currentPeriod + 1, 'renew', idemKey, { prevStatus: 'active', prevPeriod: so.currentPeriod })
  }

  // ── 扣款核心（幂等）：走 fulfillment.ingestOrder 落账，恒等式安全。type=first/renew ──
  private async charge(
    signOrderNo: string,
    period: number,
    type: 'first' | 'renew',
    idemKey?: string,
    guard?: { prevStatus: string; prevPeriod: number },
  ) {
    const key = idemKey ?? `${signOrderNo}:${period}`
    // P0-6：webhook 出账事件在扣款事务内入队，事务提交后按业务时序 flush（首扣先签约1后扣款2；续扣仅扣款2）。
    let signOutboxId: string | null = null
    let deductOutboxId: string | null = null
    // 幂等键绑定签约单：外部调用方把同一 Idempotency-Key 复用到另一张签约单时各自执行，
    // 而非静默回放首单结果（否则第二张签约单"看似扣款成功"实际没扣）。
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
        // P1-B2：把"读快照-无条件写 active"改为条件更新——where 带期望前置状态+前置期数，
        // 只有当签约单仍处于预期前值时才推进；count===0 说明 check 与 tx 之间被解约复活、
        // 或同期已被并发扣款，抛错让整笔事务回滚（含上面的 Order/ingestOrder），杜绝双扣与解约单复活。
        const g = guard ?? { prevStatus: type === 'first' ? 'signing' : 'active', prevPeriod: type === 'first' ? 0 : period - 1 }
        const advanced = await tx.signOrder.updateMany({
          where: { id: so.id, status: g.prevStatus, currentPeriod: g.prevPeriod },
          data: {
            status: 'active', currentPeriod: period,
            subscriptionId: ing.subscriptionId ?? so.subscriptionId,
            signedAt: so.signedAt ?? new Date(), nextChargeAt: new Date(Date.now() + 30 * 86400000),
          },
        })
        if (advanced.count === 0) throw new Error(`签约单状态/期数已变更（期望 ${g.prevStatus}/${g.prevPeriod}），本次扣款回滚`)
        await this.audit.recordInTx(tx, { user: null, actorName: 'CPS对接', action: 'cps.charge', resource: 'SignOrder', resourceId: so.id, detail: `${type === 'first' ? '首扣' : '续扣'} 第${period}期 · 订单 ${oid} · ¥${toYuan(amount)}` })
        // P0-6：出账事件同事务入队（与订单/期数推进原子提交）。首扣含签约(1)+扣款(2)；续扣仅扣款(2)。
        if (type === 'first') signOutboxId = await this.webhook.enqueueInTx(tx, so.id, YD_STATUS.SIGNING, { amount: 0, period: 0, operateTime: new Date() })
        deductOutboxId = await this.webhook.enqueueInTx(tx, so.id, YD_STATUS.DEDUCT, { orderNo: ext, amount, period, operateTime: new Date() })
        return { ok: true, detail: '扣款成功', signOrderNo: so.id, orderId: oid, extOrderNo: ext, period, amount }
      })
    }, signOrderNo)
    if (result.ok && !replayed) {
      this.metrics.recordFundAction('cps.charge', 'ok')
      // 事务已提交，按业务时序 flush：首扣先签约(1) 后扣款(2)；续扣仅扣款(2)。崩溃遗漏由 retrySweep 兜底恢复。
      if (type === 'first') await this.webhook.flushEnqueued(signOutboxId)
      await this.webhook.flushEnqueued(deductOutboxId)
    }
    return replayed ? { ...result, replayed: true } : result
  }

  // ── 模拟扣款失败：进补扣队列 + 推 webhook(5) ──
  async failCharge(signOrderNo: string, reason = '余额不足') {
    const so = await this.prisma.signOrder.findUnique({ where: { id: signOrderNo } })
    if (!so) return { ok: false, detail: '签约单不存在' }
    if (so.status !== 'active') return { ok: false, detail: '仅生效签约单可注入扣款失败' }
    const period = so.currentPeriod + 1
    // 幂等层按 (签约单, 期数) 串行化：ChargeRetry 无 (signOrderNo,pending) 唯一约束，
    // 裸 findFirst+create 并发注入会落多条同期 pending → sweep 双计续费单。幂等记录键 DB 唯一，提供原子闸。
    const { result } = await this.idem.run(`${so.id}:fail:${period}`, 'cps.charge.fail', async () => {
      const existing = await this.prisma.chargeRetry.findFirst({ where: { signOrderNo: so.id, status: 'pending' } })
      if (existing) return { ok: false, detail: '已有进行中的补扣任务' }
      const cr = 'CR-' + shortId()
      const txn = 'TXN' + shortId() // 本次代扣交易号：DEDUCT_FAIL(4) 回调 orderId 用它（与代扣成功 2 的 orderId 语义一致），便于合作方按期次关联
      // P0-6：补扣队列落库 + 审计 + 扣款失败(4) webhook 入队收进同一事务原子提交（原为三条独立写，中途崩溃会状态撕裂）。
      let outboxId: string | null = null
      await this.prisma.$transaction(async (tx) => {
        await tx.chargeRetry.create({
          data: { id: cr, signOrderNo: so.id, brandId: so.brandId, amount: so.amount, period, attempt: 0, status: 'pending', reason, nextRetryAt: new Date() },
        })
        await this.audit.recordInTx(tx, { user: null, actorName: 'CPS对接', action: 'cps.charge.fail', resource: 'SignOrder', resourceId: so.id, detail: `扣款失败 ${reason} · 进补扣队列 ${cr}` })
        outboxId = await this.webhook.enqueueInTx(tx, so.id, YD_STATUS.DEDUCT_FAIL, { orderNo: txn, amount: so.amount, period, operateTime: new Date(), subMsg: reason })
      })
      await this.webhook.flushEnqueued(outboxId) // 提交后立即投递；崩溃遗漏由 retrySweep 兜底
      return { ok: true, detail: '已记录扣款失败并进入补扣队列', retryId: cr }
    })
    return result
  }

  // ── 退款（幂等）：按 signOrderNo+extOrderNo 反查 Order，走既有逆向冲账，恒等式不破 ──
  async refund(signOrderNo: string, extOrderNo: string, idemKey?: string) {
    const key = idemKey ?? `${signOrderNo}:${extOrderNo}`
    let outboxId: string | null = null // P0-6：退款(3) webhook outbox 行 id，事务内入队、提交后 flush
    const { result, replayed } = await this.idem.run(key, 'cps.refund', async () => {
      const r = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({ where: { signOrderNo, extOrderNo, type: { in: ['first', 'renew'] } } })
        if (!order) return null
        // 跨路径统一去重锚：按被退原单 id（refundedOrderId），与 order.refund 同锚，防同一笔被两条路径各退一次。
        const dupe = await tx.order.findFirst({ where: { type: 'refund', refundedOrderId: order.id } })
        if (dupe) return null
        const amt = Math.abs(order.amount)
        const originalSettlement = await this.settle.bindOrderSettlement(tx, order)
        await tx.order.create({ data: { id: 'O-' + shortId(), time: '现在', brandId: order.brandId, agentId: order.agentId, channel: order.channel, type: 'refund', amount: -amt, plan: order.plan, mid: order.mid, signOrderNo, extOrderNo, period: order.period, settlementId: originalSettlement?.id ?? null, refundedOrderId: order.id } })
        const rev = await this.settle.applyRefundReversal(tx, { settlement: originalSettlement, amount: amt })
        const impact = await this.settle.applyAgentRefundImpact(tx, { agentId: order.agentId, share: rev.share, withCredit: false })
        // 逆向追偿：仅追偿分润回收未从 payoutPending 扣足的缺口（P2-B5：同一笔回收优先现金池、不足才动准备金）。
        if (rev.settlement && impact) await this.reserve.clawback(tx, rev.settlement.id, impact.shortfall)
        await this.audit.recordInTx(tx, { user: null, actorName: 'CPS对接', action: 'cps.refund', resource: 'Order', resourceId: order.id, detail: `退款 ¥${toYuan(amt)} · 签约 ${signOrderNo} · 交易 ${extOrderNo} · 冲账 ¥${toYuan(rev.share)}` })
        // P0-6：退款(3) webhook 与冲账/追偿同事务入队（原为提交后独立 deliver，崩溃会丢事件）。
        outboxId = await this.webhook.enqueueInTx(tx, signOrderNo, YD_STATUS.REFUND, { orderNo: extOrderNo, amount: amt, period: order.period ?? 0, operateTime: new Date() })
        return { amt, share: rev.share, period: order.period }
      })
      if (!r) {
        this.metrics.recordFundAction('cps.refund', 'reject')
        return { ok: false, detail: '原扣款单不存在或已退款' }
      }
      this.metrics.recordFundAction('cps.refund', 'ok')
      this.metrics.addRefundAmount(r.amt)
      return { ok: true, detail: '退款成功', amount: r.amt, share: r.share, period: r.period }
    }, signOrderNo)
    if (result.ok && !replayed) await this.webhook.flushEnqueued(outboxId) // 提交后立即投递；崩溃遗漏由 retrySweep 兜底
    return replayed ? { ...result, replayed: true } : result
  }

  // ── 解约：active→unsigned，取消补扣队列，停止续费，推 webhook(3) ──
  async unsign(signOrderNo: string) {
    const at = new Date()
    const outcome = await this.prisma.$transaction(async (tx) => {
      const so = await tx.signOrder.findUnique({ where: { id: signOrderNo } })
      if (!so) return { ok: false as const, detail: '签约单不存在', replayed: false, outboxId: null as string | null }
      if (so.status === 'unsigned') return { ok: true as const, detail: '已解约', replayed: true, outboxId: null as string | null }
      if (so.status === 'expired') return { ok: false as const, detail: '签约单已过期，不可改写为解约', replayed: false, outboxId: null as string | null }

      // 状态、补扣取消、订阅 churn、审计和回调 outbox 同事务提交；任一失败全部回滚，
      // 不再出现 status 已 unsigned 但其余副作用永久缺失的半完成状态。
      const done = await tx.signOrder.updateMany({
        where: { id: so.id, status: { in: ['signing', 'active'] } },
        data: { status: 'unsigned', unsignedAt: at },
      })
      if (done.count === 0) return { ok: false as const, detail: '签约单状态已变化，请重试', replayed: false, outboxId: null as string | null }
      await tx.chargeRetry.updateMany({ where: { signOrderNo: so.id, status: { in: ['pending', 'processing'] } }, data: { status: 'cancelled' } })
      if (so.subscriptionId) await tx.subscription.updateMany({ where: { id: so.subscriptionId }, data: { status: 'churned', churnedAt: at } })
      await this.audit.recordInTx(tx, { user: null, actorName: 'CPS对接', action: 'cps.unsign', resource: 'SignOrder', resourceId: so.id, detail: `解约 ${so.id}` })
      const outboxId = await this.webhook.enqueueInTx(tx, so.id, YD_STATUS.UNSIGN, { operateTime: at })
      return { ok: true as const, detail: '解约成功', replayed: false, outboxId }
    })
    if (outcome.ok && !outcome.replayed) await this.webhook.flushEnqueued(outcome.outboxId)
    const { outboxId: _outboxId, ...result } = outcome
    return result
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
        const moved = await this.prisma.chargeRetry.updateMany({ where: { id: cr.id, status: 'pending', attempt: cr.attempt }, data: { nextRetryAt: next } })
        if (moved.count === 1) deferred++
        continue
      }
      const so = await this.prisma.signOrder.findUnique({ where: { id: cr.signOrderNo } })
      // 已解约/失效 → 取消补扣
      if (!so || so.status !== 'active') {
        await this.prisma.chargeRetry.updateMany({ where: { id: cr.id, status: 'pending', attempt: cr.attempt }, data: { status: 'cancelled', lastTriedAt: now } })
        continue
      }
      // 超 3 个月窗口未成功 → 自动解约 + 标记 exhausted
      const windowEnd = new Date(cr.windowStart); windowEnd.setMonth(windowEnd.getMonth() + 3)
      if (now > windowEnd) {
        const claimed = await this.prisma.chargeRetry.updateMany({ where: { id: cr.id, status: 'pending', attempt: cr.attempt }, data: { status: 'exhausted', lastTriedAt: now } })
        if (claimed.count === 1) {
          await this.unsign(cr.signOrderNo) // 自动解约（推 webhook 3）
          exhausted++
        }
        continue
      }
      if (outcome === 'success') {
        // 补扣成功：走 ingestOrder 落续费单（恒等式安全），推进签约单期数，推 webhook(2)，补扣单完成
        const period = cr.period
        let deductOutboxId: string | null = null // P0-6：补扣成功扣款(2) webhook outbox 行 id，事务内入队、提交后 flush
        const r = await this.idem.run(`${cr.id}:${cr.attempt}`, 'cps.retry', async () => {
          return this.prisma.$transaction(async (tx) => {
            // 先在事务内认领补扣行。进程崩溃后幂等占位被回收重跑、并发 sweep、
            // 或 unsign 已取消该行时，count=0 均不得再落 Order。
            const retryClaim = await tx.chargeRetry.updateMany({
              where: { id: cr.id, status: 'pending', attempt: cr.attempt },
              data: { status: 'processing', lastTriedAt: now },
            })
            if (retryClaim.count === 0) return { executed: false as const, ext: '', period }

            // 与普通 renewCharge 共用同一状态/期数闸：谁先把 active/(period-1)
            // 推到 period，谁获得本期扣款权。解约先提交或本期已正常扣款时取消补扣。
            const advanced = await tx.signOrder.updateMany({
              where: { id: so.id, status: 'active', currentPeriod: period - 1 },
              data: { currentPeriod: period, nextChargeAt: new Date(now.getTime() + 30 * 86400000) },
            })
            if (advanced.count === 0) {
              await tx.chargeRetry.updateMany({ where: { id: cr.id, status: 'processing' }, data: { status: 'cancelled' } })
              return { executed: false as const, ext: '', period }
            }
            const oid = 'O-' + shortId(); const ext = 'TXN' + shortId()
            await tx.order.create({ data: { id: oid, time: '实时', brandId: so.brandId, agentId: so.agentId || '未知', channel: 'alipay', type: 'renew', amount: cr.amount, plan: so.plan, mid: 'M-CPS', productId: so.productId, signOrderNo: so.id, extOrderNo: ext, period } })
            await this.fulfillment.ingestOrder(tx as never, { id: oid, brandId: so.brandId, agentId: so.agentId || '未知', productId: so.productId, amount: cr.amount, type: 'renew', plan: so.plan })
            await tx.chargeRetry.updateMany({ where: { id: cr.id, status: 'processing', attempt: cr.attempt }, data: { status: 'succeeded', attempt: { increment: 1 }, lastTriedAt: now } })
            await this.audit.recordInTx(tx, { user: null, actorName: 'CPS对接', action: 'cps.retry', resource: 'ChargeRetry', resourceId: cr.id, detail: `补扣成功 第${period}期 · 订单 ${oid} · ¥${toYuan(cr.amount)}` })
            // P0-6：补扣成功的扣款(2) webhook 与续费单同事务入队（原为提交后独立 deliver，崩溃会丢事件）。
            deductOutboxId = await this.webhook.enqueueInTx(tx, so.id, YD_STATUS.DEDUCT, { orderNo: ext, amount: cr.amount, period, operateTime: now })
            return { executed: true as const, ext, period }
          })
        })
        if (r.result.executed) {
          if (!r.replayed) { this.metrics.recordFundAction('cps.retry', 'ok'); await this.webhook.flushEnqueued(deductOutboxId) }
          succeeded++
        }
      } else {
        // 补扣失败：attempt+1，排下次（首次失败当天再补1次→次日；之后每周）
        const next = new Date(now)
        if (cr.attempt === 0) next.setDate(next.getDate() + 1)
        else next.setDate(next.getDate() + 7)
        await this.prisma.chargeRetry.updateMany({
          where: { id: cr.id, status: 'pending', attempt: cr.attempt },
          data: { attempt: { increment: 1 }, nextRetryAt: next, lastTriedAt: now },
        })
      }
    }
    return { swept: rows.length, succeeded, exhausted, deferred }
  }
}
