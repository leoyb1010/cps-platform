import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { round2, gte } from '../common/money'

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
        // P1-B3：原「读快照 c.achievedGmv + amount 再绝对量写」在并发下会丢失另一笔订单的累加（lost update）。
        //   改为 Prisma 原子 increment（DB 层加法天然串行，两笔并发订单各自如实累加）；金额先 round2 收口防裸浮点尾差。
        const inc = round2(o.amount)
        // 一段式：原子累加 + active→fulfilling（匹配集限定 active/fulfilling，置 fulfilling 恒为合法跃迁）。update 回读到最新 achievedGmv。
        const updated = await tx.growthContract.update({ where: { id: c.id }, data: { achievedGmv: { increment: inc }, status: 'fulfilling' } })
        // 二段式：达标判定用「更新后回读值」而非事务外快照；仅当仍为 fulfilling 时条件推进 settling，
        //   杜绝把已被并发回退/关闭的合约重新拉回，也避免 settling 达标后被继续累计拉回 fulfilling。
        if (updated.targetGmv > 0 && gte(updated.achievedGmv, updated.targetGmv)) {
          await tx.growthContract.updateMany({ where: { id: c.id, status: 'fulfilling' }, data: { status: 'settling' } })
        }
        matchedContractId = c.id
      }

      // 2. 订阅聚合（债5）：以 (brandId,agentId,plan) 唯一约束兜底并发（L1）。
      //    首单 upsert：存在则视为续费推进，不存在则建；续费更新现有行。
      const existing = await tx.subscription.findFirst({ where: { brandId: o.brandId, agentId: o.agentId, plan: o.plan } })
      if (existing) {
        if (o.type === 'renew' || existing.status === 'churned') {
          // P1-B3：期数原子 +1，避免并发续费读同一 currentPeriod 各自 +1 相互覆盖（lost update）；mrr 走 round2 收口。
          await tx.subscription.update({ where: { id: existing.id }, data: { currentPeriod: { increment: 1 }, lastRenewAt: new Date(), status: existing.status === 'churned' ? 'winback' : existing.status, mrr: round2(o.amount) } })
        }
        subscriptionId = existing.id
      } else if (o.type === 'first') {
        const subId = 'SUB-' + o.id.replace(/^O-?/, '')
        try {
          await tx.subscription.create({ data: { id: subId, brandId: o.brandId, agentId: o.agentId, productId: o.productId ?? null, userRef: 'u_' + o.id.slice(-4) + '••' + o.id.slice(0, 2), plan: o.plan, status: 'active', firstOrderId: o.id, currentPeriod: 1, mrr: round2(o.amount) } })
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
