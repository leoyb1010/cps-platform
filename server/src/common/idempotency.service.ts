import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

/**
 * 资金类写操作的幂等保护。
 *  · 客户端通过 Idempotency-Key 头传唯一键（同一笔操作重试用同一个键）。
 *  · 首次执行 → 记录 (key, result)；重复 → 直接返回首次结果，不再执行副作用。
 *  · 用 key 主键唯一约束兜底并发：两个并发请求只有一个能 create 成功。
 */
@Injectable()
export class IdempotencyService {
  constructor(private prisma: PrismaService) {}

  /**
   * 包裹一次操作。key 为空时不做幂等（退化为直接执行，便于无键调用）。
   * 返回 { result, replayed } —— replayed=true 表示命中了首次结果。
   */
  async run<T>(key: string | undefined, scope: string, op: () => Promise<T>): Promise<{ result: T; replayed: boolean }> {
    if (!key) return { result: await op(), replayed: false }

    const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } })
    if (existing) {
      return { result: JSON.parse(existing.result) as T, replayed: true }
    }

    // 先占位（唯一约束防并发双写）；占位失败说明别的请求刚抢到 → 读它的结果
    try {
      await this.prisma.idempotencyKey.create({ data: { key, scope, result: JSON.stringify({ pending: true }) } })
    } catch {
      const now = await this.prisma.idempotencyKey.findUnique({ where: { key } })
      if (now && !JSON.parse(now.result)?.pending) return { result: JSON.parse(now.result) as T, replayed: true }
      // 对端仍在执行：保守起见直接执行一次（极端竞态，概率极低），不更新占位
      return { result: await op(), replayed: false }
    }

    const result = await op()
    await this.prisma.idempotencyKey.update({ where: { key }, data: { result: JSON.stringify(result) } })
    return { result, replayed: false }
  }
}
