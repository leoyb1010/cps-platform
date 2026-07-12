import { ConflictException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

const PENDING = '__pending__'
// PENDING 占位超过此时长视为持有者已死（进程崩溃/重启遗留的死锁占位），可被后来者抢占重跑（P2-B7）。
// 取 10 分钟：远大于正常资金 op 耗时（毫秒级），避免误抢正在执行的慢事务；且各资金 op 自身带条件更新，重跑亦不双花。
const STALE_MS = 10 * 60 * 1000

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
   * bind：把幂等键绑定到目标资源/租户（如订单 id、结算单 id、user scope）。
   *   不绑定时，客户端把同一个 Idempotency-Key 复用在不同资源上会命中首次结果——
   *   第二个资源的操作被静默跳过且返回成功（资金端点上等于"看似退款成功实际没退"）。
   *   绑定后语义变为"键按资源隔离"：同资源同键回放，异资源各自执行。
   * 返回 { result, replayed } —— replayed=true 表示命中了首次结果。
   */
  async run<T>(key: string | undefined, scope: string, op: () => Promise<T>, bind?: string): Promise<{ result: T; replayed: boolean }> {
    if (!key) return { result: await op(), replayed: false }
    const storageKey = this.storageKey(scope, key, bind)

    // 已有最终结果 → 直接回放
    const done = await this.readIfDone<T>(storageKey)
    if (done.hit) return { result: done.value as T, replayed: true }

    // 抢占位行：create 成功者执行 op；失败者（并发输家）去等待赢家结果
    let owns = await this.tryClaim(storageKey, scope)

    if (!owns) {
      // 并发输家：轮询等待赢家写入最终结果；绝不重复执行资金 op
      const waited = await this.waitForResult<T>(storageKey)
      if (waited.hit) return { result: waited.value as T, replayed: true }
      // 赢家失败删行、或占位死锁超时被判 stale：再抢占一次；仍抢不到才判冲突让客户端用新键或稍后重试
      owns = await this.tryClaim(storageKey, scope)
      if (!owns) throw new ConflictException('幂等键处理中或上次失败，请稍后用同一键重试')
    }

    // 占位拥有者：执行 op；失败则删除占位行（不毒化），成功则落最终结果
    try {
      const result = await op()
      await this.prisma.idempotencyKey.update({ where: { key: storageKey }, data: { result: JSON.stringify(result) } })
      return { result, replayed: false }
    } catch (e) {
      await this.prisma.idempotencyKey.deleteMany({ where: { key: storageKey, result: PENDING } }).catch(() => {})
      throw e
    }
  }

  /**
   * 抢占占位行：create 成功即独占执行权。
   * P3-2：只有 Prisma P2002（唯一冲突）才算「并发输家」，其它错误（DB 连接故障等）一律上抛——
   *   否则把连接失败误判成并发输家，会让本应重试的资金 op 被静默跳过（看似成功实际没执行）。
   * P2-B7：撞到 P2002 时若占位是 stale PENDING（持有者已死），原子抢占后重跑，不永久死锁。
   */
  private async tryClaim(storageKey: string, scope: string): Promise<boolean> {
    try {
      await this.prisma.idempotencyKey.create({ data: { key: storageKey, scope, result: PENDING } })
      return true
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e
      return this.reclaimIfStale(storageKey, scope)
    }
  }

  /** 占位为 stale PENDING（createdAt 超 STALE_MS 且仍无结果）时原子抢占：删旧占位→重建，删成功者独占重跑权。 */
  private async reclaimIfStale(storageKey: string, scope: string): Promise<boolean> {
    const staleBefore = new Date(Date.now() - STALE_MS)
    const del = await this.prisma.idempotencyKey.deleteMany({ where: { key: storageKey, result: PENDING, createdAt: { lt: staleBefore } } })
    if (del.count === 0) return false // 非 stale（已出最终结果 / 活跃 PENDING）→ 当并发输家去等待
    try {
      await this.prisma.idempotencyKey.create({ data: { key: storageKey, scope, result: PENDING } })
      return true
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return false // 另一 worker 抢先重建 → 让它跑
      throw e
    }
  }

  private storageKey(scope: string, key: string, bind?: string): string {
    return bind ? `${scope}:${bind}:${key}` : `${scope}:${key}`
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
