import { http, isRealApi } from './http'

// 订阅超市公开客户端：唯一不带 token 也能调的客户端（面向终端用户）。
export interface MarketProduct {
  id: string
  name: string
  category: string
  description: string
  billingCycle: string
  firstPrice: number
  renewPrice: number
  bundleEligible: boolean
  exclusiveGroup: string
  tags: string
  brandKey: string
  brandName: string
}
export interface Quote {
  ok: boolean
  validIds: string[]
  listPrice: number
  discountPct: number
  finalPrice: number
  ruleId: string
  conflicts: { group: string; productIds: string[] }[]
  detail?: string
}

export interface BundleTier {
  minItems: number
  discountPct: number
}

// 演示模式走本地合成货架与同口径算价（marketDemo），真实模式服务端权威。
// 动态 import 避免把种子数据打进真实模式的关键路径。
const demo = () => import('./marketDemo').then((m) => m.marketDemo)

export const marketApi = {
  products: () => (isRealApi ? http.get<MarketProduct[]>('/market/products') : demo().then((d) => d.products())),
  rules: () => (isRealApi ? http.get<BundleTier[]>('/market/rules') : demo().then((d) => d.rules())),
  quote: (productIds: string[]) => (isRealApi ? http.post<Quote>('/market/quote', { productIds }) : demo().then((d) => d.quote(productIds))),
  createBundle: (productIds: string[]) =>
    isRealApi ? http.post<Quote & { bundleId?: string }>('/market/bundle', { productIds }) : demo().then((d) => d.createBundle(productIds)),
  // 模拟支付：不传金额（服务端读 Bundle.finalPrice）
  pay: (bundleId: string, channel: string) =>
    isRealApi
      ? http.post<{ ok: boolean; detail?: string; finalPrice?: number; paid?: boolean }>(`/market/bundle/${bundleId}/pay`, { channel })
      : demo().then((d) => d.pay(bundleId, channel)),
}
