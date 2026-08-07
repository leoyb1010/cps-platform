import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

const PENDING = '__pending__'
// op() 已提交、但幂等结果落库失败的终态标记。
// 这一态绝不可删除、也绝不可被 stale 抢占重跑——删除或重跑意味着同一笔资金操作执行两次。
// 后续同键请求一律拒绝（503 + 不可重试），由调用方按业务单据核对最终状态。
const COMMITTED_UNKNOWN = '__committed_unknown__'
// PENDING 占位超过此时长视为持有者已死（进程崩溃/重启遗留的死锁占位），可被后来者抢占重跑（P2-B7）。
// 取 10 分钟：远大于正常资金 op 耗时（毫秒级），避免误抢正在执行的慢事务；且各资金 op 自身带条件更新，重跑亦不双花。
const STALE_MS = 10 * 60 * 1000

type KeyState<T> = { kind: 'done'; value: T } | { kind: 'pending' } | { kind: 'committed-unknown' } | { kind: 'missing' }

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
  private readonly logger = new Logger(IdempotencyService.name)
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

    // 已有最终结果 → 直接回放；已提交但结果丢失 → 明确拒绝，绝不重跑
    const state = await this.readState<T>(storageKey)
    if (state.kind === 'done') return { result: state.value, replayed: true }
    if (state.kind === 'committed-unknown') throw this.committedUnknownError()

    // 抢占位行：create 成功者执行 op；失败者（并发输家）去等待赢家结果
    let owns = await this.tryClaim(storageKey, scope)

    if (!owns) {
      // 并发输家：轮询等待赢家写入最终结果；绝不重复执行资金 op
      const waited = await this.waitForResult<T>(storageKey)
      if (waited.kind === 'done') return { result: waited.value, replayed: true }
      if (waited.kind === 'committed-unknown') throw this.committedUnknownError()
      // 赢家失败删行、或占位死锁超时被判 stale：再抢占一次；仍抢不到才判冲突让客户端用新键或稍后重试
      owns = await this.tryClaim(storageKey, scope)
      if (!owns) throw new ConflictException('幂等键处理中或上次失败，请稍后用同一键重试')
    }

    // ── 占位拥有者：执行 op ──
    // 关键分界：op() 是否已提交，决定占位行能否删除。
    //   op 抛错（业务未提交）→ 删占位，允许干净重试。
    //   op 成功但结果落库失败 → 绝不能删占位：删了之后调用方重试会重新执行一次资金副作用（双花）。
    //     旧实现对两种情况一律删除，是压测暴露的「业务已提交、调用方拿到错误」歧义的根因。
    let result: T
    try {
      result = await op()
    } catch (e) {
      await this.prisma.idempotencyKey.deleteMany({ where: { key: storageKey, result: PENDING } }).catch(() => {})
      throw e
    }

    // op 已提交。此后只处理「结果如何持久化」，无论成败都必须把真实结果返回给调用方——
    // 业务已经发生却告诉调用方失败，是比 500 更糟的歧义。
    try {
      await this.persistResult(storageKey, result)
    } catch (persistErr) {
      await this.prisma.idempotencyKey
        .updateMany({ where: { key: storageKey, result: PENDING }, data: { result: COMMITTED_UNKNOWN } })
        .catch(() => {})
      this.logger.error(
        `幂等结果落库失败（业务已提交，占位保留为 ${COMMITTED_UNKNOWN}，绝不重跑）key=${storageKey}：${persistErr instanceof Error ? persistErr.message : String(persistErr)}`,
      )
    }
    return { result, replayed: false }
  }

  /** 结果落库带重试：短暂锁竞争/超时不至于直接把键推入 committed-unknown 终态。 */
  private async persistResult(storageKey: string, result: unknown, tries = 3): Promise<void> {
    let lastErr: unknown
    for (let i = 0; i < tries; i++) {
      try {
        await this.prisma.idempotencyKey.update({ where: { key: storageKey }, data: { result: JSON.stringify(result) } })
        return
      } catch (e) {
        lastErr = e
        if (i < tries - 1) await new Promise((r) => setTimeout(r, 50 * (i + 1)))
      }
    }
    throw lastErr
  }

  /** 已提交但结果不可知：不可重试（重试也只会拿到同样的拒绝），需按业务单据核对。 */
  private committedUnknownError() {
    return new ServiceUnavailableException({
      message: '该幂等键对应的操作已执行，但执行结果未能保存；请勿重复提交，请按业务单据核对最终状态',
      retryable: false,
    })
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

  /** 读取键的当前状态。committed-unknown 是终态标记，绝不能当成 JSON 结果去解析。 */
  private async readState<T>(key: string): Promise<KeyState<T>> {
    const row = await this.prisma.idempotencyKey.findUnique({ where: { key } })
    if (!row) return { kind: 'missing' }
    if (row.result === PENDING) return { kind: 'pending' }
    if (row.result === COMMITTED_UNKNOWN) return { kind: 'committed-unknown' }
    return { kind: 'done', value: JSON.parse(row.result) as T }
  }

  /** 轮询等待赢家把占位行变成最终结果（最多 ~5s），命中即回放。 */
  private async waitForResult<T>(key: string, tries = 25, intervalMs = 200): Promise<KeyState<T>> {
    for (let i = 0; i < tries; i++) {
      const state = await this.readState<T>(key)
      if (state.kind !== 'pending') return state // done / committed-unknown / missing(赢家失败删行) 均可立即返回
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    return { kind: 'pending' }
  }
}
