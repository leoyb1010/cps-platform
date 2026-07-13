import { describe, expect, it, vi } from 'vitest'
import { CpsService } from './cps.service'

function serviceWith(prisma: any, tx: any) {
  prisma.$transaction = vi.fn(async (fn: (client: unknown) => unknown) => fn(tx))
  const fulfillment = { ingestOrder: vi.fn() }
  const idem = { run: vi.fn(async (_key: string, _scope: string, op: () => Promise<unknown>) => ({ result: await op(), replayed: false })) }
  const audit = { recordInTx: vi.fn(), record: vi.fn() }
  const metrics = { recordFundAction: vi.fn(), addRefundAmount: vi.fn() }
  const webhook = { deliver: vi.fn(), enqueueInTx: vi.fn(async () => 'CB-1'), flushEnqueued: vi.fn() }
  const service = new CpsService(prisma, fulfillment as never, {} as never, {} as never, idem as never, audit as never, metrics as never, webhook as never)
  return { service, fulfillment, audit, webhook }
}

describe('CPS 补扣/解约状态机竞争回归', () => {
  it('补扣认领后若 active/currentPeriod 闸失败，不创建订单并取消队列', async () => {
    const cr = { id: 'CR-1', signOrderNo: 'SIGN-1', brandId: 'B', amount: 29, period: 2, attempt: 0, status: 'pending', windowStart: new Date(), nextRetryAt: new Date() }
    const orderCreate = vi.fn()
    const retryUpdates = vi.fn()
      .mockResolvedValueOnce({ count: 1 }) // pending -> processing
      .mockResolvedValueOnce({ count: 1 }) // processing -> cancelled
    const tx = {
      chargeRetry: { updateMany: retryUpdates },
      signOrder: { updateMany: vi.fn(async () => ({ count: 0 })) },
      order: { create: orderCreate },
    }
    const prisma = {
      chargeRetry: { findMany: vi.fn(async () => [cr]) },
      signOrder: { findUnique: vi.fn(async () => ({ id: 'SIGN-1', status: 'active', currentPeriod: 1, brandId: 'B', agentId: 'A', plan: 'P' })) },
    }
    const { service } = serviceWith(prisma, tx)
    const result = await service.runRetrySweep(new Date(2026, 6, 13, 10, 30), 'success')
    expect(result.succeeded).toBe(0)
    expect(orderCreate).not.toHaveBeenCalled()
    expect(retryUpdates).toHaveBeenLastCalledWith({ where: { id: 'CR-1', status: 'processing' }, data: { status: 'cancelled' } })
  })

  it('解约状态、补扣取消、订阅 churn、审计与 outbox 同事务，提交后才 flush', async () => {
    const tx = {
      signOrder: {
        findUnique: vi.fn(async () => ({ id: 'SIGN-1', status: 'active', subscriptionId: 'SUB-1' })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      chargeRetry: { updateMany: vi.fn(async () => ({ count: 1 })) },
      subscription: { updateMany: vi.fn(async () => ({ count: 1 })) },
    }
    const { service, audit, webhook } = serviceWith({}, tx)
    const result = await service.unsign('SIGN-1')
    expect(result).toMatchObject({ ok: true, detail: '解约成功', replayed: false })
    expect(tx.signOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'SIGN-1', status: { in: ['signing', 'active'] } } }))
    expect(tx.chargeRetry.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { signOrderNo: 'SIGN-1', status: { in: ['pending', 'processing'] } } }))
    expect(tx.subscription.updateMany).toHaveBeenCalled()
    expect(audit.recordInTx).toHaveBeenCalled()
    expect(webhook.enqueueInTx).toHaveBeenCalled()
    expect(webhook.flushEnqueued).toHaveBeenCalledWith('CB-1')
  })
})
