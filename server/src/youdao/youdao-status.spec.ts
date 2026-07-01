import { describe, it, expect } from 'vitest'
import { toOrderStatus, YD_ORDER_STATUS } from './youdao-status'

describe('有道 orderStatus 派生（toOrderStatus）', () => {
  it('已退款 → 3 REFUNDED（优先级最高）', () => {
    expect(toOrderStatus({ status: 'active' }, true, true)).toBe(YD_ORDER_STATUS.REFUNDED)
  })
  it('已扣款 → 2 NOTIFIED', () => {
    expect(toOrderStatus({ status: 'active' }, true, false)).toBe(YD_ORDER_STATUS.NOTIFIED)
  })
  it('active 未见扣款记录 → 1 PAID', () => {
    expect(toOrderStatus({ status: 'active' }, false, false)).toBe(YD_ORDER_STATUS.PAID)
  })
  it('C8：签约未扣款即解约（unsigned 且无扣款）→ 0 CREATED，不得误判为已支付', () => {
    expect(toOrderStatus({ status: 'unsigned' }, false, false)).toBe(YD_ORDER_STATUS.CREATED)
  })
  it('signing 未扣款 → 0 CREATED', () => {
    expect(toOrderStatus({ status: 'signing' }, false, false)).toBe(YD_ORDER_STATUS.CREATED)
  })
})
