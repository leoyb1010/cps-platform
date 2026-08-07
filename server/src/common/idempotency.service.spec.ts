import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaService } from '../prisma.service'
import { IdempotencyService } from './idempotency.service'
import { resetPrismaTestDb } from '../test-utils/prisma-test-db'

let prisma: PrismaService
let idem: IdempotencyService

beforeAll(() => {
  resetPrismaTestDb('idem-test')
  prisma = new PrismaService()
  idem = new IdempotencyService(prisma)
})

afterAll(async () => {
  await prisma?.$disconnect()
})

beforeEach(async () => {
  await prisma.idempotencyKey.deleteMany({})
})

describe('IdempotencyService', () => {
  it('同一 key 二次调用：op 仅执行一次，第二次 replayed', async () => {
    let calls = 0
    const op = async () => {
      calls++
      return { value: 42 }
    }
    const r1 = await idem.run('k1', 'test', op)
    const r2 = await idem.run('k1', 'test', op)
    expect(calls).toBe(1) // 只执行一次
    expect(r1.replayed).toBe(false)
    expect(r2.replayed).toBe(true)
    expect(r2.result).toEqual({ value: 42 })
  })

  it('op 抛错：占位行被删除，不毒化；同 key 可干净重试并成功', async () => {
    let calls = 0
    const flaky = async () => {
      calls++
      if (calls === 1) throw new Error('transient')
      return { ok: true }
    }
    // 首次抛错
    await expect(idem.run('k2', 'test', flaky)).rejects.toThrow('transient')
    // 占位行应已删除（不残留 pending）
    const stuck = await prisma.idempotencyKey.findUnique({ where: { key: 'k2' } })
    expect(stuck).toBeNull()
    // 同键重试 → 成功且执行了第二次
    const retry = await idem.run('k2', 'test', flaky)
    expect(retry.result).toEqual({ ok: true })
    expect(calls).toBe(2)
  })

  it('无 key：退化为直接执行，不写幂等表', async () => {
    let calls = 0
    const r = await idem.run(undefined, 'test', async () => {
      calls++
      return 'x'
    })
    expect(r.result).toBe('x')
    expect(r.replayed).toBe(false)
    expect(await prisma.idempotencyKey.count()).toBe(0)
  })

  // 压测/审计 P1 回归：业务已提交、幂等结果落库失败的故障注入。
  // 旧实现在这条路径上删除占位行 → 调用方收到错误后用同键重试，会把同一笔资金操作再执行一次（双花）。
  it('故障注入：op 已提交但结果落库失败 → 返回真实结果、占位不删、同键重试绝不重跑', async () => {
    let calls = 0
    const op = async () => {
      calls++
      return { charged: 500 }
    }
    // 让「写幂等结果」这一步持续失败（业务 op 本身已成功提交）
    const realUpdate = prisma.idempotencyKey.update.bind(prisma.idempotencyKey)
    prisma.idempotencyKey.update = (async () => {
      throw new Error('socket timeout')
    }) as typeof prisma.idempotencyKey.update

    // ① 业务已发生 → 必须把真实结果返回给调用方（绝不能报错让其以为没执行）
    const r1 = await idem.run('k-fault', 'fund', op)
    expect(r1.result).toEqual({ charged: 500 })
    expect(calls).toBe(1)

    // ② 占位行必须保留并标记为已提交但结果不可知（删除=允许重跑=双花）
    const row = await prisma.idempotencyKey.findUnique({ where: { key: 'fund:k-fault' } })
    expect(row?.result).toBe('__committed_unknown__')

    prisma.idempotencyKey.update = realUpdate

    // ③ 同键重试：明确拒绝，且绝不再次执行资金 op
    await expect(idem.run('k-fault', 'fund', op)).rejects.toThrow(/已执行/)
    expect(calls).toBe(1) // 关键：仍然只执行过一次
  })

  it('并发同 key：op 只执行一次，二者拿到同一结果（无双花）', async () => {
    let calls = 0
    const op = async () => {
      calls++
      await new Promise((r) => setTimeout(r, 150)) // 模拟耗时，制造并发窗口
      return { charged: 100, n: calls }
    }
    const [a, b] = await Promise.all([idem.run('k3', 'fund', op), idem.run('k3', 'fund', op)])
    expect(calls).toBe(1) // 关键：资金 op 绝不执行两次
    // 一个是首次执行、另一个是回放，结果一致
    const results = [a.result, b.result]
    expect(results[0]).toEqual(results[1])
    expect((a.result as any).charged).toBe(100)
  })
})
