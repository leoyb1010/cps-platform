import { http } from './http'

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

export const marketApi = {
  products: () => http.get<MarketProduct[]>('/market/products'),
  rules: () => http.get<BundleTier[]>('/market/rules'),
  quote: (productIds: string[]) => http.post<Quote>('/market/quote', { productIds }),
  createBundle: (productIds: string[]) => http.post<Quote & { bundleId?: string }>('/market/bundle', { productIds }),
  // 模拟支付：不传金额（服务端读 Bundle.finalPrice）
  pay: (bundleId: string, channel: string) => http.post<{ ok: boolean; detail?: string; finalPrice?: number; paid?: boolean }>(`/market/bundle/${bundleId}/pay`, { channel }),
}
