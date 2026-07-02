import { http, isRealApi } from './http'

// 客户门户数据客户端：真实模式直打 cps 后端 /portal/* scoped 端点；
// 演示模式落到 portalDemo 从种子合成的按租户数据（brand=youdao / agent=A-2041）。
// 不复用全局 store（全局可见 + mock 全量态会跨租户泄漏），每页独立取数。
// 动态 import 避免把种子合成打进真实模式的关键路径（与 marketApi 同范式）。
const demo = () => import('./portalDemo').then((m) => m.portalDemo)

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
    if (!isRealApi) return demo().then((d) => d.summary(period)) as Promise<T>
    const q = new URLSearchParams()
    if (period?.preset) q.set('preset', period.preset)
    if (period?.from) q.set('from', period.from)
    if (period?.to) q.set('to', period.to)
    const qs = q.toString()
    return http.get<T>(`/portal/summary${qs ? `?${qs}` : ''}`)
  },
  brandOrders: <T = unknown[]>(filters?: { type?: string; dateFrom?: string; dateTo?: string }) => {
    if (!isRealApi) return demo().then((d) => d.brandOrders(filters)) as Promise<T>
    const q = new URLSearchParams()
    if (filters?.type) q.set('type', filters.type)
    if (filters?.dateFrom) q.set('dateFrom', filters.dateFrom)
    if (filters?.dateTo) q.set('dateTo', filters.dateTo)
    const qs = q.toString()
    return http.get<T>(`/portal/brand/orders${qs ? `?${qs}` : ''}`)
  },
  brandSettlements: <T = unknown[]>(filters?: { period?: string; status?: string }) => {
    if (!isRealApi) return demo().then((d) => d.brandSettlements(filters)) as Promise<T>
    const q = new URLSearchParams()
    if (filters?.period) q.set('period', filters.period)
    if (filters?.status) q.set('status', filters.status)
    const qs = q.toString()
    return http.get<T>(`/portal/brand/settlements${qs ? `?${qs}` : ''}`)
  },
  brandOnboarding: <T = unknown>() => (isRealApi ? http.get<T>('/portal/brand/onboarding') : (demo().then((d) => d.brandOnboarding()) as Promise<T>)),
  brandTickets: <T = unknown[]>() => (isRealApi ? http.get<T>('/portal/brand/tickets') : (demo().then((d) => d.brandTickets()) as Promise<T>)),
  replyTicket: (id: string, body: { handlePlan?: string; note?: string; status?: string }) =>
    isRealApi ? http.post<{ ok: boolean; detail: string }>(`/portal/brand/tickets/${id}/reply`, body) : demo().then((d) => d.replyTicket(id, body)),
  agentTickets: <T = unknown[]>() => (isRealApi ? http.get<T>('/portal/agent/tickets') : (demo().then((d) => d.agentTickets()) as Promise<T>)),
  agentReplyTicket: (id: string, body: { handlePlan?: string; note?: string; status?: string }) =>
    isRealApi ? http.post<{ ok: boolean; detail: string }>(`/portal/agent/tickets/${id}/reply`, body) : demo().then((d) => d.agentReplyTicket(id, body)),
  brandBarter: <T = unknown[]>() => (isRealApi ? http.get<T>('/portal/brand/barter') : (demo().then((d) => d.brandBarter()) as Promise<T>)),
  contracts: <T = unknown[]>() => (isRealApi ? http.get<T>('/portal/contracts') : (demo().then((d) => d.contracts()) as Promise<T>)),
  marketBrands: <T = unknown[]>() => (isRealApi ? http.get<T>('/portal/market/brands') : (demo().then((d) => d.marketBrands()) as Promise<T>)),
  agentPayouts: <T = unknown>() => (isRealApi ? http.get<T>('/portal/agent/payouts') : (demo().then((d) => d.agentPayouts()) as Promise<T>)),
  agentCredit: <T = unknown>() => (isRealApi ? http.get<T>('/portal/agent/credit') : (demo().then((d) => d.agentCredit()) as Promise<T>)),
  agentPlans: <T = unknown[]>() => (isRealApi ? http.get<T>('/portal/agent/plans') : (demo().then((d) => d.agentPlans()) as Promise<T>)),
  claimContract: (id: string) => (isRealApi ? http.post<{ ok: boolean; detail: string }>(`/portal/contracts/${id}/claim`) : demo().then((d) => d.claimContract(id))),
  // 债3 客户主动操作
  brandProducts: <T = unknown[]>() => (isRealApi ? http.get<T>('/portal/brand/products') : (demo().then((d) => d.brandProducts()) as Promise<T>)),
  addBrandProduct: (body: { name: string; category?: string; description?: string; billingCycle?: string; firstPrice: number; renewPrice: number; defaultSharePct?: number; bundleEligible?: boolean; exclusiveGroup?: string; tags?: string[] }) =>
    isRealApi ? http.post<{ ok: boolean; id?: string }>('/portal/brand/products', body) : demo().then((d) => d.addBrandProduct(body)),
  submitProduct: (id: string) => (isRealApi ? http.post<{ ok: boolean; detail: string }>(`/portal/brand/products/${id}/submit`) : demo().then((d) => d.submitProduct(id))),
  proposeContract: (body: { agentId?: string; productId?: string; settleModel: string; targetGmv?: number; settleParams?: Record<string, unknown>; userLimit?: Record<string, unknown>; ltvWindow?: string; complaintLiability?: string; reservePct?: number }) =>
    isRealApi ? http.post<{ ok: boolean; id?: string }>('/portal/contracts', body) : demo().then((d) => d.proposeContract(body)),
  proposeBarter: (body: { counterpartyBrandId: string; resourceType: string; myQuota: number; counterpartyQuota: number; invoiceStatus?: string; terms?: Record<string, unknown> }) =>
    isRealApi ? http.post<{ ok: boolean; id?: string }>('/portal/barter', body) : demo().then((d) => d.proposeBarter(body)),
  respondBarter: (id: string, action: 'accept' | 'reject') =>
    isRealApi ? http.post<{ ok: boolean; detail: string }>(`/portal/barter/${id}/respond`, { action }) : demo().then((d) => d.respondBarter(id, action)),
  createClaim: (body: { brandId: string; productId?: string; channel?: string }) =>
    isRealApi ? http.post<{ ok: boolean; id?: string; trackingUrl?: string }>('/portal/agent/claims', body) : demo().then((d) => d.createClaim(body)),
  agentClaims: <T = unknown[]>() => (isRealApi ? http.get<T>('/portal/agent/claims') : (demo().then((d) => d.agentClaims()) as Promise<T>)),
  requestPayout: (amount: number) =>
    isRealApi ? http.post<{ ok: boolean; id?: string; detail: string }>('/portal/agent/payout-requests', { amount }) : demo().then((d) => d.requestPayout(amount)),
  agentPayoutRequests: <T = unknown[]>() => (isRealApi ? http.get<T>('/portal/agent/payout-requests') : (demo().then((d) => d.agentPayoutRequests()) as Promise<T>)),
  notifications: <T = unknown[]>() => (isRealApi ? http.get<T>('/portal/notifications') : (demo().then((d) => d.notifications()) as Promise<T>)),
  readNotif: (id: string) => (isRealApi ? http.post<{ ok: boolean }>(`/portal/notifications/${id}/read`) : demo().then((d) => d.readNotif(id))),
  // 有道续费 RSA 对接 · 开发者中心
  developer: <T = unknown>() => (isRealApi ? http.get<T>('/portal/brand/developer') : (demo().then((d) => d.developer()) as Promise<T>)),
  rsaKeygen: () =>
    isRealApi ? http.post<{ ok: boolean; publicKey: string; privateKey: string; detail: string }>('/portal/brand/developer/rsa/keygen') : demo().then((d) => d.rsaKeygen()),
  rsaUpload: (publicKey: string) =>
    isRealApi ? http.post<{ ok: boolean; detail: string }>('/portal/brand/developer/rsa/upload', { publicKey }) : demo().then((d) => d.rsaUpload(publicKey)),
  setCallbackUrl: (callbackUrl: string) =>
    isRealApi ? http.patch<{ ok: boolean; detail: string }>('/portal/brand/developer/callback', { callbackUrl }) : demo().then((d) => d.setCallbackUrl(callbackUrl)),
  webhookLogs: <T = unknown[]>() => (isRealApi ? http.get<T>('/portal/brand/developer/logs') : (demo().then((d) => d.webhookLogs()) as Promise<T>)),
  consoleSign: (params: Record<string, unknown>) =>
    isRealApi ? http.post<{ ok: boolean; stringToSign: string; algo: string; note: string }>('/portal/brand/developer/console/sign', { params }) : demo().then((d) => d.consoleSign(params)),
  healthCheck: () =>
    isRealApi
      ? http.post<{ ok: boolean; score: number; readiness: string; checks: { item: string; pass: boolean; detail: string }[] }>('/portal/brand/developer/health-check')
      : demo().then((d) => d.healthCheck()),
}
