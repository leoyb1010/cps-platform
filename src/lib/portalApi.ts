import { http } from './http'

// 客户门户数据客户端：直打 cps 后端 /portal/* scoped 端点。
// 不复用全局 store（全局可见 + mock 全量态会跨租户泄漏），每页独立取数。

export interface TrendPoint {
  date: string
  value: number
}
export interface BrandSummary {
  scope: 'brand'
  gmvMtd: number
  activeSubs: number
  renewalRate: number
  complaintRate: number
  orders: number
  brandShare: number
  periodGross?: number
  pendingTickets: number
  trend: TrendPoint[]
}
export interface AgentSummary {
  scope: 'agent'
  spendMtd: number
  firstOrders: number
  payoutPending: number
  creditScore: number
  renewalRate: number
  orders: number
  acceptedContracts: number
  topBrands?: { brandId: string; value: number }[]
  trend: TrendPoint[]
}

export const portalApi = {
  summary: <T = BrandSummary | AgentSummary>(period?: { preset: string; from?: string; to?: string }) => {
    const q = new URLSearchParams()
    if (period?.preset) q.set('preset', period.preset)
    if (period?.from) q.set('from', period.from)
    if (period?.to) q.set('to', period.to)
    const qs = q.toString()
    return http.get<T>(`/portal/summary${qs ? `?${qs}` : ''}`)
  },
  brandOrders: <T = unknown[]>(filters?: { type?: string; dateFrom?: string; dateTo?: string }) => {
    const q = new URLSearchParams()
    if (filters?.type) q.set('type', filters.type)
    if (filters?.dateFrom) q.set('dateFrom', filters.dateFrom)
    if (filters?.dateTo) q.set('dateTo', filters.dateTo)
    const qs = q.toString()
    return http.get<T>(`/portal/brand/orders${qs ? `?${qs}` : ''}`)
  },
  brandSettlements: <T = unknown[]>(filters?: { period?: string; status?: string }) => {
    const q = new URLSearchParams()
    if (filters?.period) q.set('period', filters.period)
    if (filters?.status) q.set('status', filters.status)
    const qs = q.toString()
    return http.get<T>(`/portal/brand/settlements${qs ? `?${qs}` : ''}`)
  },
  brandOnboarding: <T = unknown>() => http.get<T>('/portal/brand/onboarding'),
  brandTickets: <T = unknown[]>() => http.get<T>('/portal/brand/tickets'),
  replyTicket: (id: string, body: { handlePlan?: string; note?: string; status?: string }) => http.post<{ ok: boolean; detail: string }>(`/portal/brand/tickets/${id}/reply`, body),
  agentTickets: <T = unknown[]>() => http.get<T>('/portal/agent/tickets'),
  agentReplyTicket: (id: string, body: { handlePlan?: string; note?: string; status?: string }) => http.post<{ ok: boolean; detail: string }>(`/portal/agent/tickets/${id}/reply`, body),
  brandBarter: <T = unknown[]>() => http.get<T>('/portal/brand/barter'),
  contracts: <T = unknown[]>() => http.get<T>('/portal/contracts'),
  marketBrands: <T = unknown[]>() => http.get<T>('/portal/market/brands'),
  agentPayouts: <T = unknown>() => http.get<T>('/portal/agent/payouts'),
  agentCredit: <T = unknown>() => http.get<T>('/portal/agent/credit'),
  agentPlans: <T = unknown[]>() => http.get<T>('/portal/agent/plans'),
  claimContract: (id: string) => http.post<{ ok: boolean; detail: string }>(`/portal/contracts/${id}/claim`),
  // 债3 客户主动操作
  brandProducts: <T = unknown[]>() => http.get<T>('/portal/brand/products'),
  addBrandProduct: (body: { name: string; category?: string; description?: string; billingCycle?: string; firstPrice: number; renewPrice: number; defaultSharePct?: number; bundleEligible?: boolean; exclusiveGroup?: string; tags?: string[] }) => http.post<{ ok: boolean; id?: string }>('/portal/brand/products', body),
  submitProduct: (id: string) => http.post<{ ok: boolean; detail: string }>(`/portal/brand/products/${id}/submit`),
  proposeContract: (body: { agentId?: string; productId?: string; settleModel: string; targetGmv?: number; settleParams?: Record<string, unknown>; userLimit?: Record<string, unknown>; ltvWindow?: string; complaintLiability?: string; reservePct?: number }) => http.post<{ ok: boolean; id?: string }>('/portal/contracts', body),
  proposeBarter: (body: { counterpartyBrandId: string; resourceType: string; myQuota: number; counterpartyQuota: number; invoiceStatus?: string; terms?: Record<string, unknown> }) => http.post<{ ok: boolean; id?: string }>('/portal/barter', body),
  respondBarter: (id: string, action: 'accept' | 'reject') => http.post<{ ok: boolean; detail: string }>(`/portal/barter/${id}/respond`, { action }),
  createClaim: (body: { brandId: string; productId?: string; channel?: string }) => http.post<{ ok: boolean; id?: string; trackingUrl?: string }>('/portal/agent/claims', body),
  agentClaims: <T = unknown[]>() => http.get<T>('/portal/agent/claims'),
  requestPayout: (amount: number) => http.post<{ ok: boolean; id?: string; detail: string }>('/portal/agent/payout-requests', { amount }),
  agentPayoutRequests: <T = unknown[]>() => http.get<T>('/portal/agent/payout-requests'),
  notifications: <T = unknown[]>() => http.get<T>('/portal/notifications'),
  readNotif: (id: string) => http.post<{ ok: boolean }>(`/portal/notifications/${id}/read`),
  // CPS 连续包月对接 · 开发者中心
  developer: <T = unknown>() => http.get<T>('/portal/brand/developer'),
  rotateCredential: () => http.post<{ ok: boolean; appId: string; secret: string; detail: string }>('/portal/brand/developer/rotate'),
  setCallbackUrl: (callbackUrl: string) => http.patch<{ ok: boolean; detail: string }>('/portal/brand/developer/callback', { callbackUrl }),
  webhookLogs: <T = unknown[]>() => http.get<T>('/portal/brand/developer/logs'),
}
