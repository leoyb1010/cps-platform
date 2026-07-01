import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import type { AuthUser } from '../rbac/rbac'

/**
 * scope 收窄 / 归属校验 / 越权防御的共享服务。
 *
 * 从 business.controller 抽出（P1-1 controller 瘦身），供拆分后的各域 controller 复用，
 * 避免每个 controller 各自复制一份 scope 逻辑而漂移。行为与原 controller 内联版逐字一致。
 *
 * DENY = 恒不匹配的 where 条件：非平台用户 scope 不合法时返回它，使查询返回空集（默认拒绝）。
 */
@Injectable()
export class ScopeService {
  static readonly DENY = { id: '__scope_denied__' } as const

  constructor(private prisma: PrismaService) {}

  /** 单外键资源（按 brandId 或 agentId）的 scope 收窄。 */
  scope(user: AuthUser, field: 'brandId' | 'agentId' | 'id-brand' | 'id-agent'): Record<string, unknown> {
    if (!user || user.scopeType === 'platform') return {}
    if (!user.scopeId) return ScopeService.DENY
    if (user.scopeType === 'brand') {
      if (field === 'brandId') return { brandId: user.scopeId }
      if (field === 'id-brand') return { id: user.scopeId }
      return ScopeService.DENY
    }
    if (user.scopeType === 'agent') {
      if (field === 'agentId') return { agentId: user.scopeId }
      if (field === 'id-agent') return { id: user.scopeId }
      return ScopeService.DENY
    }
    return ScopeService.DENY
  }

  /** 同含 brandId+agentId 的资源（订单/工单）：品牌按 brandId、代理按 agentId 收窄。 */
  scopeOwned(user: AuthUser): Record<string, unknown> {
    if (!user || user.scopeType === 'platform') return {}
    if (!user.scopeId) return ScopeService.DENY
    if (user.scopeType === 'brand') return { brandId: user.scopeId }
    if (user.scopeType === 'agent') return { agentId: user.scopeId }
    return ScopeService.DENY
  }

  /** 写端点归属校验（OR 语义：任一维度命中即放行）。校验既存行归属。 */
  assertOwns(user: AuthUser, ownerBrandId?: string | null, ownerAgentId?: string | null) {
    if (!user || user.scopeType === 'platform') return
    if (user.scopeType === 'brand' && ownerBrandId && ownerBrandId === user.scopeId) return
    if (user.scopeType === 'agent' && ownerAgentId && ownerAgentId === user.scopeId) return
    throw new ForbiddenException('无权操作不属于当前账户的资源')
  }

  /** 创建端点归属校验（严格版：客户提供的每个维度都必须是自己，防伪造他人业绩）。 */
  assertCreateAttribution(user: AuthUser, brandId?: string | null, agentId?: string | null) {
    if (!user || user.scopeType === 'platform') return
    if (user.scopeType === 'brand') {
      if (brandId !== user.scopeId) throw new ForbiddenException('品牌方只能为自己的品牌创建')
      if (agentId) throw new ForbiddenException('品牌方不得单方指派代理，请由代理主动接单')
      return
    }
    if (user.scopeType === 'agent') {
      if (agentId !== user.scopeId) throw new ForbiddenException('代理只能以自己的身份创建')
      return
    }
    throw new ForbiddenException('无权创建不属于当前账户的资源')
  }

  assertPlatform(user: AuthUser) {
    if (!user || user.scopeType !== 'platform') throw new ForbiddenException('仅平台账户可执行该操作')
  }

  /** 准备金释放行 scope：代理按 agentId、品牌按其结算单集合收窄。 */
  async reserveScope(user: AuthUser): Promise<Record<string, unknown>> {
    if (!user || user.scopeType === 'platform') return {}
    if (!user.scopeId) return ScopeService.DENY
    if (user.scopeType === 'agent') return { agentId: user.scopeId }
    if (user.scopeType === 'brand') {
      const settlements = await this.prisma.settlement.findMany({ where: { brandId: user.scopeId }, select: { id: true } })
      return settlements.length ? { settlementId: { in: settlements.map((s) => s.id) } } : ScopeService.DENY
    }
    return ScopeService.DENY
  }

  async assertReserveOwns(user: AuthUser, rrId: string) {
    if (!user || user.scopeType === 'platform') return
    const rr = await this.prisma.reserveRelease.findUnique({ where: { id: rrId } })
    if (!rr) return
    if (user.scopeType === 'agent') return this.assertOwns(user, null, rr.agentId)
    if (user.scopeType === 'brand') {
      const s = await this.prisma.settlement.findUnique({ where: { id: rr.settlementId }, select: { brandId: true } })
      return this.assertOwns(user, s?.brandId ?? null, null)
    }
    throw new ForbiddenException('无权操作不属于当前账户的资源')
  }

  /** 资源置换 scope：品牌见「我方发起 OR 待我确认」，含软删除过滤。 */
  barterScope(user: AuthUser): Record<string, unknown> {
    if (!user || user.scopeType === 'platform') return { deletedAt: null }
    if (user.scopeType === 'brand' && user.scopeId) {
      return { deletedAt: null, OR: [{ initiatorBrandId: user.scopeId }, { counterpartyBrandId: user.scopeId }] }
    }
    return { ...ScopeService.DENY, deletedAt: null }
  }

  assertBarterOwns(user: AuthUser, deal: { initiatorBrandId: string; counterpartyBrandId: string }) {
    if (!user || user.scopeType === 'platform') return
    if (user.scopeType === 'brand' && user.scopeId && (deal.initiatorBrandId === user.scopeId || deal.counterpartyBrandId === user.scopeId)) return
    throw new ForbiddenException('无权操作不属于当前账户的资源')
  }

  /** 通知 scope：平台见 platform 广播 + 精确投递；客户见自己 scope 的。 */
  notifWhere(user: AuthUser): Record<string, unknown> {
    const or: Record<string, unknown>[] = [{ userId: user.id }]
    if (user.scopeType === 'platform') or.push({ scopeType: 'platform' })
    else if (user.scopeId) or.push({ scopeType: user.scopeType, scopeId: user.scopeId })
    return { OR: or }
  }
}
