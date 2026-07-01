import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

// 履约引擎：正向订单写入时按 agentId+brandId(+productId) 匹配 active/fulfilling 合约，
// 累加 achievedGmv 并推进状态机（active→fulfilling→settling）。
// 同时把离散订单聚合成订阅生命周期（债5）。
// 红线：本服务绝不触碰 Settlement 的恒等式五项（gross/brandShare/reserve/platformFee/
//   agentPayout/reversal）。它只动 GrowthContract.achievedGmv/status 和 Subscription。
@Injectable()
export class FulfillmentService {
  constructor(private prisma: PrismaService) {}

  // 处理一笔正向订单（first/renew）：累加履约 + 推进状态 + 订阅 upsert。
  // 在调用方事务 tx 内执行，幂等由调用方保证。退款/拒付不调此方法（走逆向冲账）。
  async ingestOrder(
    tx: { growthContract: any; subscription: any },
    o: { id: string; brandId: string; agentId: string; productId?: string | null; amount: number; type: string; plan: string },
  ): Promise<{ matchedContractId: string | null; subscriptionId: string | null }> {
    let matchedContractId: string | null = null
    let subscriptionId: string | null = null

    if (o.type === 'first' || o.type === 'renew') {
      // 1. 履约累加：匹配合约 → achievedGmv += amount → 达标推进状态
      const c = await tx.growthContract.findFirst({
        where: { brandId: o.brandId, agentId: o.agentId, status: { in: ['active', 'fulfilling'] }, deletedAt: null, ...(o.productId ? { productId: o.productId } : {}) },
        orderBy: { createdAt: 'desc' },
      })
      if (c) {
        const achieved = c.achievedGmv + o.amount
        // active → fulfilling（有履约即进行中）；达标 → settling
        const nextStatus = c.targetGmv > 0 && achieved >= c.targetGmv ? 'settling' : 'fulfilling'
        await tx.growthContract.update({ where: { id: c.id }, data: { achievedGmv: achieved, status: nextStatus } })
        matchedContractId = c.id
      }

      // 2. 订阅聚合（债5）：以 (brandId,agentId,plan) 唯一约束兜底并发（L1）。
      //    首单 upsert：存在则视为续费推进，不存在则建；续费更新现有行。
      const existing = await tx.subscription.findFirst({ where: { brandId: o.brandId, agentId: o.agentId, plan: o.plan } })
      if (existing) {
        if (o.type === 'renew' || existing.status === 'churned') {
          await tx.subscription.update({ where: { id: existing.id }, data: { currentPeriod: existing.currentPeriod + 1, lastRenewAt: new Date(), status: existing.status === 'churned' ? 'winback' : existing.status, mrr: o.amount } })
        }
        subscriptionId = existing.id
      } else if (o.type === 'first') {
        const subId = 'SUB-' + o.id.replace(/^O-?/, '')
        try {
          await tx.subscription.create({ data: { id: subId, brandId: o.brandId, agentId: o.agentId, productId: o.productId ?? null, userRef: 'u_' + o.id.slice(-4) + '••' + o.id.slice(0, 2), plan: o.plan, status: 'active', firstOrderId: o.id, currentPeriod: 1, mrr: o.amount } })
          subscriptionId = subId
        } catch (e) {
          // 并发同 (brandId,agentId,plan) 首扣撞 @@unique(P2002)：不整单回滚，回查既有订阅认领（等价于命中 existing 分支）。
          if ((e as { code?: string }).code === 'P2002') {
            const raced = await tx.subscription.findFirst({ where: { brandId: o.brandId, agentId: o.agentId, plan: o.plan } })
            subscriptionId = raced?.id
          } else throw e
        }
      }
    }
    return { matchedContractId, subscriptionId }
  }
}
