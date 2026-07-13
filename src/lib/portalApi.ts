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

export interface CursorResult<T> {
  items: T[]
  truncated: boolean
}

const BRAND_ORDERS_MAX = 5000

// real/demo 两分支收敛：把"isRealApi ? real() : demo().then(demoFn)"的机械三元模板收进一处，
// 强制每个方法同时给出真实与演示两种实现（漏写任一分支即类型报错），行为与原逐条三元等价。
type Demo = Awaited<ReturnType<typeof demo>>
function def<T>(real: () => Promise<T>, demoFn: (d: Demo) => unknown): Promise<T> {
  return isRealApi ? real() : (demo().then(demoFn) as Promise<T>)
}

export const portalApi = {
  summary: <T = BrandSummary | AgentSummary>(period?: { preset: string; from?: string; to?: string }) =>
    def<T>(() => {
      const q = new URLSearchParams()
      if (period?.preset) q.set('preset', period.preset)
      if (period?.from) q.set('from', period.from)
      if (period?.to) q.set('to', period.to)
      const qs = q.toString()
      return http.get<T>(`/portal/summary${qs ? `?${qs}` : ''}`)
    }, (d) => d.summary(period)),
  brandOrders: <T = unknown>(filters?: { type?: string; dateFrom?: string; dateTo?: string }): Promise<CursorResult<T>> =>
    def<CursorResult<T>>(async () => {
      const items: T[] = []
      let cursor: string | undefined
      let truncated = false
      do {
        const q = new URLSearchParams({ limit: '200' })
        if (cursor) q.set('cursor', cursor)
        if (filters?.type) q.set('type', filters.type)
        if (filters?.dateFrom) q.set('dateFrom', filters.dateFrom)
        if (filters?.dateTo) q.set('dateTo', filters.dateTo)
        const page = await http.get<{ items: T[]; nextCursor: string | null }>(`/portal/brand/orders?${q.toString()}`)
        items.push(...page.items)
        cursor = page.nextCursor ?? undefined
        if (items.length >= BRAND_ORDERS_MAX) { truncated = !!cursor; break }
      } while (cursor)
      return { items, truncated }
    }, async (d) => ({ items: await d.brandOrders(filters) as T[], truncated: false })),
  brandSettlements: <T = unknown[]>(filters?: { period?: string; status?: string }) =>
    def<T>(() => {
      const q = new URLSearchParams()
      if (filters?.period) q.set('period', filters.period)
      if (filters?.status) q.set('status', filters.status)
      const qs = q.toString()
      return http.get<T>(`/portal/brand/settlements${qs ? `?${qs}` : ''}`)
    }, (d) => d.brandSettlements(filters)),
  brandOnboarding: <T = unknown>() => def<T>(() => http.get<T>('/portal/brand/onboarding'), (d) => d.brandOnboarding()),
  brandTickets: <T = unknown[]>() => def<T>(() => http.get<T>('/portal/brand/tickets'), (d) => d.brandTickets()),
  replyTicket: (id: string, body: { handlePlan?: string; note?: string; status?: string }) =>
    def(() => http.post<{ ok: boolean; detail: string }>(`/portal/brand/tickets/${id}/reply`, body), (d) => d.replyTicket(id, body)),
  agentTickets: <T = unknown[]>() => def<T>(() => http.get<T>('/portal/agent/tickets'), (d) => d.agentTickets()),
  agentReplyTicket: (id: string, body: { handlePlan?: string; note?: string; status?: string }) =>
    def(() => http.post<{ ok: boolean; detail: string }>(`/portal/agent/tickets/${id}/reply`, body), (d) => d.agentReplyTicket(id, body)),
  brandBarter: <T = unknown[]>() => def<T>(() => http.get<T>('/portal/brand/barter'), (d) => d.brandBarter()),
  brandCandidates: <T = unknown[]>() => def<T>(() => http.get<T>('/portal/brand/candidates'), async (d) => (await d.marketBrands()).filter((b) => b.id !== 'youdao')),
  contracts: <T = unknown[]>() => def<T>(() => http.get<T>('/portal/contracts'), (d) => d.contracts()),
  marketBrands: <T = unknown[]>() => def<T>(() => http.get<T>('/portal/market/brands'), (d) => d.marketBrands()),
  agentPayouts: <T = unknown>() => def<T>(() => http.get<T>('/portal/agent/payouts'), (d) => d.agentPayouts()),
  agentCredit: <T = unknown>() => def<T>(() => http.get<T>('/portal/agent/credit'), (d) => d.agentCredit()),
  agentPlans: <T = unknown[]>() => def<T>(() => http.get<T>('/portal/agent/plans'), (d) => d.agentPlans()),
  claimContract: (id: string) => def(() => http.post<{ ok: boolean; detail: string }>(`/portal/contracts/${id}/claim`), (d) => d.claimContract(id)),
  // 债3 客户主动操作
  brandProducts: <T = unknown[]>() => def<T>(() => http.get<T>('/portal/brand/products'), (d) => d.brandProducts()),
  addBrandProduct: (body: { name: string; category?: string; description?: string; billingCycle?: string; firstPrice: number; renewPrice: number; defaultSharePct?: number; bundleEligible?: boolean; exclusiveGroup?: string; tags?: string[] }) =>
    def(() => http.post<{ ok: boolean; id?: string }>('/portal/brand/products', body), (d) => d.addBrandProduct(body)),
  submitProduct: (id: string) => def(() => http.post<{ ok: boolean; detail: string }>(`/portal/brand/products/${id}/submit`), (d) => d.submitProduct(id)),
  proposeContract: (body: { agentId?: string; productId?: string; settleModel: string; targetGmv?: number; settleParams?: Record<string, unknown>; userLimit?: Record<string, unknown>; ltvWindow?: string; complaintLiability?: string; reservePct?: number }) =>
    def(() => http.post<{ ok: boolean; id?: string; detail?: string }>('/portal/contracts', body), (d) => d.proposeContract(body)),
  proposeBarter: (body: { counterpartyBrandId: string; resourceType: string; myQuota: number; counterpartyQuota: number; invoiceStatus?: string; terms?: Record<string, unknown> }) =>
    def(() => http.post<{ ok: boolean; id?: string }>('/portal/barter', body), (d) => d.proposeBarter(body)),
  respondBarter: (id: string, action: 'accept' | 'reject') =>
    def(() => http.post<{ ok: boolean; detail: string }>(`/portal/barter/${id}/respond`, { action }), (d) => d.respondBarter(id, action)),
  createClaim: (body: { brandId: string; productId?: string; channel?: string }) =>
    def(() => http.post<{ ok: boolean; id?: string; trackingUrl?: string }>('/portal/agent/claims', body), (d) => d.createClaim(body)),
  agentClaims: <T = unknown[]>() => def<T>(() => http.get<T>('/portal/agent/claims'), (d) => d.agentClaims()),
  requestPayout: (amount: number) =>
    def(() => http.post<{ ok: boolean; id?: string; detail: string }>('/portal/agent/payout-requests', { amount }), (d) => d.requestPayout(amount)),
  agentPayoutRequests: <T = unknown[]>() => def<T>(() => http.get<T>('/portal/agent/payout-requests'), (d) => d.agentPayoutRequests()),
  notifications: <T = unknown[]>() => def<T>(() => http.get<T>('/portal/notifications'), (d) => d.notifications()),
  readNotif: (id: string) => def(() => http.post<{ ok: boolean }>(`/portal/notifications/${id}/read`), (d) => d.readNotif(id)),
  // 有道续费 RSA 对接 · 开发者中心
  developer: <T = unknown>() => def<T>(() => http.get<T>('/portal/brand/developer'), (d) => d.developer()),
  rsaKeygen: () =>
    def(() => http.post<{ ok: boolean; publicKey: string; privateKey: string; detail: string }>('/portal/brand/developer/rsa/keygen'), (d) => d.rsaKeygen()),
  rsaUpload: (publicKey: string) =>
    def(() => http.post<{ ok: boolean; detail: string }>('/portal/brand/developer/rsa/upload', { publicKey }), (d) => d.rsaUpload(publicKey)),
  setCallbackUrl: (callbackUrl: string) =>
    def(() => http.patch<{ ok: boolean; detail: string }>('/portal/brand/developer/callback', { callbackUrl }), (d) => d.setCallbackUrl(callbackUrl)),
  webhookLogs: <T = unknown[]>() => def<T>(() => http.get<T>('/portal/brand/developer/logs'), (d) => d.webhookLogs()),
  consoleSign: (params: Record<string, unknown>) =>
    def(() => http.post<{ ok: boolean; stringToSign: string; algo: string; note: string }>('/portal/brand/developer/console/sign', { params }), (d) => d.consoleSign(params)),
  healthCheck: () =>
    def(() => http.post<{ ok: boolean; score: number; readiness: string; checks: { item: string; pass: boolean; detail: string }[] }>('/portal/brand/developer/health-check'), (d) => d.healthCheck()),
}
