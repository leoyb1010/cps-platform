import { ConflictException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

const PENDING = '__pending__'

/**
 * 资金类写操作的幂等保护。
 *  · 客户端通过 Idempotency-Key 头传唯一键（同一笔操作重试用同一个键）。
 *  · 首次执行 → 记录 (key, result)；重复 → 直接返回首次结果，不再执行副作用。
 *  · key 主键唯一约束序列化并发：只有一个请求能写入占位行并执行 op，
 *    其余请求轮询等待首次结果，绝不重复执行 op（资金不双花）。
 *  · op 抛错 → 删除占位行，使该 key 可被干净重试（不毒化）。
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

    // 已有最终结果 → 直接回放
    const done = await this.readIfDone<T>(key)
    if (done.hit) return { result: done.value as T, replayed: true }

    // 抢占位行：create 成功者执行 op；失败者（并发输家）去等待赢家结果
    let owns = false
    try {
      await this.prisma.idempotencyKey.create({ data: { key, scope, result: PENDING } })
      owns = true
    } catch {
      owns = false
    }

    if (!owns) {
      // 并发输家：轮询等待赢家写入最终结果；绝不重复执行资金 op
      const waited = await this.waitForResult<T>(key)
      if (waited.hit) return { result: waited.value as T, replayed: true }
      // 赢家失败并删除了占位行 → 该 key 可重试，但避免我们也并发重入，直接返回冲突让客户端用新键或稍后重试
      throw new ConflictException('幂等键处理中或上次失败，请稍后用同一键重试')
    }

    // 占位拥有者：执行 op；失败则删除占位行（不毒化），成功则落最终结果
    try {
      const result = await op()
      await this.prisma.idempotencyKey.update({ where: { key }, data: { result: JSON.stringify(result) } })
      return { result, replayed: false }
    } catch (e) {
      await this.prisma.idempotencyKey.deleteMany({ where: { key, result: PENDING } }).catch(() => {})
      throw e
    }
  }

  private async readIfDone<T>(key: string): Promise<{ hit: boolean; value?: T }> {
    const row = await this.prisma.idempotencyKey.findUnique({ where: { key } })
    if (row && row.result !== PENDING) return { hit: true, value: JSON.parse(row.result) as T }
    return { hit: false }
  }

  /** 轮询等待赢家把占位行变成最终结果（最多 ~5s），命中即回放。 */
  private async waitForResult<T>(key: string, tries = 25, intervalMs = 200): Promise<{ hit: boolean; value?: T }> {
    for (let i = 0; i < tries; i++) {
      const row = await this.prisma.idempotencyKey.findUnique({ where: { key } })
      if (!row) return { hit: false } // 赢家失败删行
      if (row.result !== PENDING) return { hit: true, value: JSON.parse(row.result) as T }
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    return { hit: false }
  }
}
