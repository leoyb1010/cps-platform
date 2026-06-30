// 有道返回码表（官方文档附录 4.1）。对外端点统一用 { code, msg } 结构返回。
export const YD_CODE = {
  OK: 0,
  FAIL: -1,
  RATE_LIMIT: 107,         // 下单频率过高
  PHONE_INVALID: 121,      // 手机号非法
  PHONE_REG_FAIL: 122,     // 手机号注册账号失败
  CUST_NOT_FOUND: 123,     // 合作方不存在
  GOODS_UNAVAILABLE: 124,  // 商品不可用
  ORDER_DUP: 125,          // 合作方订单重复
  ORDER_NOT_FOUND: 126,    // 订单不存在
  REFUND_FAIL: 127,        // 订单退款失败
  SIGN_ERROR: 403,         // 签名错误
  SERVER_ERROR: 500,       // 服务器错误
} as const

export const YD_MSG: Record<number, string> = {
  0: 'OK',
  [-1]: 'fail',
  107: '下单频率过高',
  121: '手机号非法',
  122: '手机号注册账号失败',
  123: '合作方不存在',
  124: '商品不可用',
  125: '合作方订单重复',
  126: '订单不存在',
  127: '订单退款失败',
  403: '签名错误',
  500: '服务器错误',
}

export function ydErr(code: number, msg?: string) {
  return { code, msg: msg ?? YD_MSG[code] ?? 'fail' }
}
export function ydOk<T = undefined>(data?: T) {
  return data === undefined ? { code: 0, msg: 'OK' } : { code: 0, msg: 'OK', data }
}
