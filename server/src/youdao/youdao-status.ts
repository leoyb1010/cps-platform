// 有道续费回调 status 枚举（与官方文档一字对应）。
//   注意：与旧 HMAC 版（1签约2扣款3解约4退款5扣款失败）语义不同，尤其 3 旧=解约/有道=退款。
//   出站回调一律用此常量，避免数字字面量歧义。
export const YD_STATUS = {
  UNSIGN: 0,       // 已解约
  SIGNING: 1,      // 签约中（签约成功）
  DEDUCT: 2,       // 代扣（扣款成功）
  REFUND: 3,       // 退款（成功）
  DEDUCT_FAIL: 4,  // 代扣失败
  REFUND_FAIL: 5,  // 退款失败
} as const

export const YD_STATUS_LABEL: Record<number, string> = {
  0: '已解约', 1: '签约中', 2: '代扣', 3: '退款', 4: '代扣失败', 5: '退款失败',
}

// 订单状态查询 orderStatus：0创建 1已支付 2已通知 3已退款。
export const YD_ORDER_STATUS = { CREATED: 0, PAID: 1, NOTIFIED: 2, REFUNDED: 3 } as const

// 由签约单 + 订单派生 orderStatus（对账查询用）。
export function toOrderStatus(so: { status: string }, hasCharge: boolean, hasRefund: boolean): number {
  if (hasRefund) return YD_ORDER_STATUS.REFUNDED
  if (hasCharge) return YD_ORDER_STATUS.NOTIFIED // 已支付且已回调通知
  if (so.status === 'active' || so.status === 'unsigned') return YD_ORDER_STATUS.PAID
  return YD_ORDER_STATUS.CREATED
}
