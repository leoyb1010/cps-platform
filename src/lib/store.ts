// ════════════════════════════════════════════════════════════════
//  L2 可演示闭环 —— 前端 mock 数据服务 + 事件总线 + 状态机 + 联动
//  · 真实改数据 · 真实流转 · 跨模块联动 · localStorage 持久化（刷新不丢）
// ════════════════════════════════════════════════════════════════
import { useSyncExternalStore } from 'react'
import {
  orders as seedOrders,
  complaints as seedComplaints,
  settlements as seedSettlements,
  agents as seedAgents,
  merchants as seedMerchants,
  brands as seedBrands,
  contracts as seedContracts,
  brandById,
  type Order,
  type Complaint,
  type Settlement,
  type Agent,
  type MerchantAccount,
  type MerchantState,
  type Brand,
  type GrowthContract,
  type SettleModel,
  type Tone,
} from './data'
import { isRealApi } from './http'
import { bizApi, newIdemKey } from './adminApi'

export interface ActivityItem {
  id: number
  t: string
  text: string
  tone: Tone
  read: boolean
}

// ── 批3 受控配置结构 ──
export interface AttributionConfig {
  firstClickWindow: '1' | '7' | '14'
  renewAttribution: 'first' | 'last'
  dedupe: 'device' | 'phone'
  hijackThresholdSec: number
}
export interface PlatformConfig {
  autoFuse: boolean; throttleAds: boolean; reserveAuto: boolean
  isolateBrand: boolean; isolateAgent: boolean; flexTax: boolean; audit: boolean
}
// 平台数值参数（默认服务费/费率区间/账期/分润 + 风控阈值）——可编辑、持久化
export interface PlatformParams {
  serviceFeePct: number; feeRangeLow: number; feeRangeHigh: number; defaultPeriod: number; agentSharePct: number
  complaintRedline: number; escalatedRedline: number; close72hTarget: number
}
export interface SlaConfig {
  normalH: number; escalatedH: number; regulatoryH: number
}
// ── 批4 新集合结构 ──
export interface RiskRule {
  id: string; name: string; cond: string; action: string; on: boolean
}
export interface AdClaim {
  id: string; agentId: string; brandId: string; plan: string; url: string; channel: string
  spend: number; firstOrders: number; payout: number; createdAt: string
}
export interface PendingAgent {
  id: string; name: string; type: '个人' | '企业'; invoicing: '灵活用工' | '企业开票' | '个体户'; appliedAt: string
  kyc: { license: boolean; legal: boolean; bankAccount: boolean; riskHit: boolean }
}

const SEED_RULES: RiskRule[] = [
  { id: 'RULE-1', name: '同设备 / IP 批量', cond: '同设备 60 分钟内 ≥ 5 单', action: '降权 + 复核', on: true },
  { id: 'RULE-2', name: '空包单 / 秒退单', cond: '24h 内退款 ≤ 5 分钟占比 > 20%', action: '限流', on: true },
  { id: 'RULE-3', name: '模拟器农场', cond: '设备指纹命中模拟器特征', action: '拦截', on: true },
  { id: 'RULE-4', name: '异常退款集中', cond: '单代理日退款率 > 8%', action: '冻结结算', on: true },
  { id: 'RULE-5', name: '归因劫持', cond: '点击-转化时差 < 3 秒', action: '拦截 + 告警', on: true },
  { id: 'RULE-6', name: '异常转化时差', cond: '曝光-转化 < 2 秒', action: '限流', on: false },
]
const SEED_PENDING_AGENTS: PendingAgent[] = [
  { id: 'APP-1', name: '极速增长 文化传媒', type: '企业', invoicing: '企业开票', appliedAt: '今天 10:24', kyc: { license: true, legal: true, bankAccount: true, riskHit: false } },
  { id: 'APP-2', name: '张昊', type: '个人', invoicing: '灵活用工', appliedAt: '今天 09:11', kyc: { license: false, legal: true, bankAccount: true, riskHit: false } },
]
const SEED_ATTRIBUTION: AttributionConfig = { firstClickWindow: '7', renewAttribution: 'first', dedupe: 'device', hijackThresholdSec: 3 }
const SEED_PLATFORM_CONFIG: PlatformConfig = { autoFuse: true, throttleAds: true, reserveAuto: true, isolateBrand: true, isolateAgent: true, flexTax: true, audit: true }
const SEED_PLATFORM_PARAMS: PlatformParams = { serviceFeePct: 21, feeRangeLow: 40, feeRangeHigh: 52, defaultPeriod: 7, agentSharePct: 72, complaintRedline: 1, escalatedRedline: 0.1, close72hTarget: 95 }
const SEED_SLA: SlaConfig = { normalH: 24, escalatedH: 4, regulatoryH: 2 }
const SEED_CHANNELS: Record<string, 'live' | 'review'> = {
  '连连支付 · 分账': 'live', '汇付天下 · 分账': 'live', '微信支付 · 官方分账': 'live', '支付宝 · 分账': 'live', '银行二类户 · 存管': 'review',
}

export interface StoreState {
  orders: Order[]
  complaints: Complaint[]
  settlements: Settlement[]
  agents: Agent[]
  merchants: MerchantAccount[]
  brands: Brand[]
  activity: ActivityItem[]
  // 批3 受控配置
  attributionConfig: AttributionConfig
  platformConfig: PlatformConfig
  platformParams: PlatformParams
  slaConfig: SlaConfig
  channelStates: Record<string, 'live' | 'review'>
  // 批4 新集合
  rules: RiskRule[]
  claims: AdClaim[]
  pendingAgents: PendingAgent[]
  contracts: GrowthContract[]
}

const KEY = 'cps-store-v2'
let seq = 9000

function clock() {
  // 演示用稳定时分（不依赖真实 Date，避免 SSR/缓存抖动）
  const m = 30 + (seq % 28)
  return `今天 ${String(13 + Math.floor((seq % 120) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function seed(): StoreState {
  return {
    orders: structuredClone(seedOrders),
    complaints: structuredClone(seedComplaints),
    settlements: structuredClone(seedSettlements),
    agents: structuredClone(seedAgents),
    merchants: structuredClone(seedMerchants),
    brands: structuredClone(seedBrands),
    activity: [],
    attributionConfig: { ...SEED_ATTRIBUTION },
    platformConfig: { ...SEED_PLATFORM_CONFIG },
    platformParams: { ...SEED_PLATFORM_PARAMS },
    slaConfig: { ...SEED_SLA },
    channelStates: { ...SEED_CHANNELS },
    rules: structuredClone(SEED_RULES),
    claims: [],
    pendingAgents: structuredClone(SEED_PENDING_AGENTS),
    contracts: structuredClone(seedContracts),
  }
}

function load(): StoreState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as StoreState
      // 基本完整性校验，缺字段则重置
      if (p.orders && p.complaints && p.settlements && p.agents && p.merchants && p.brands) {
        // 恢复 seq 到「已持久化的最大发号」之上：seq 不仅给 activity，也给 订单/品牌/号池 id
        // （'O-'+seq、'brand-'+seq、'M-..'+seq）。只看 activity 会留缺口 → 刷新后重新发号碰撞。
        const nums = (s: string): number => {
          const m = s.match(/(\d+)/g)
          return m ? Math.max(...m.map(Number)) : 0
        }
        let maxSeq = (p.activity ?? []).reduce((mx, a) => Math.max(mx, a.id), 0)
        for (const o of p.orders) maxSeq = Math.max(maxSeq, nums(o.id))
        for (const b of p.brands) maxSeq = Math.max(maxSeq, nums(b.id))
        for (const mAcc of p.merchants) maxSeq = Math.max(maxSeq, nums(mAcc.id))
        if (maxSeq >= seq) seq = maxSeq + 1
        // 新字段对旧缓存逐字段兜底（缺则取 seed 默认），不进硬校验，避免旧 localStorage 被整体重置
        const s = seed()
        return {
          ...s,
          ...p,
          activity: p.activity ?? [],
          attributionConfig: p.attributionConfig ?? s.attributionConfig,
          platformConfig: p.platformConfig ?? s.platformConfig,
          platformParams: { ...s.platformParams, ...(p.platformParams ?? {}) },
          slaConfig: p.slaConfig ?? s.slaConfig,
          channelStates: p.channelStates ?? s.channelStates,
          rules: p.rules ?? s.rules,
          claims: p.claims ?? s.claims,
          pendingAgents: p.pendingAgents ?? s.pendingAgents,
          contracts: p.contracts ?? s.contracts,
        }
      }
    }
  } catch {
    /* ignore */
  }
  return seed()
}

let state: StoreState = typeof localStorage !== 'undefined' ? load() : seed()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore quota */
  }
}
function commit(next: StoreState) {
  state = next
  persist()
  listeners.forEach((l) => l())
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}
const getSnapshot = () => state

/**
 * 真实模式：用服务端数据水合 store（业务页随后照常读 store，但反映服务端真值）。
 * 服务端表是扁平子集，UI 需要的嵌套字段（品牌 plans/channels/thresholds 等）以 seed 为底，
 * 服务端标量字段覆盖其上，保证既是真数据又不破坏页面所需结构。
 */
export async function hydrateFromServer() {
  if (!isRealApi) return
  // 每个集合独立取数：某集合无权限(403)则置空（用户本就看不到），
  // 不让单个失败拖垮整体——这同时让数据级 RBAC 在 UI 自然生效。
  const safe = async <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null)
  const [brands, agents, merchants, ordersPage, settlements, tickets, config] = await Promise.all([
    safe(bizApi.brands<Partial<Brand>[]>()),
    safe(bizApi.agents<Partial<Agent>[]>()),
    safe(bizApi.merchants<Partial<MerchantAccount>[]>()),
    safe(bizApi.orders<Partial<Order>[]>()), // 游标分页：{ items, nextCursor }
    safe(bizApi.settlements<Partial<Settlement>[]>()),
    safe(bizApi.tickets<(Partial<Complaint> & { reason?: string })[]>()),
    safe(bizApi.config<Record<string, unknown>>()), // 配置 KV（平台配置/通道/SLA/归因）回读
  ])
  const orders = ordersPage?.items ?? null
  // 全部失败（如完全离线）：保留本地 seed，不阻断演示
  if (!brands && !agents && !merchants && !orders && !settlements && !tickets) return
  const seedB = new Map(seedBrands.map((b) => [b.id, b]))
  const seedA = new Map(seedAgents.map((a) => [a.id, a]))
  const seedM = new Map(seedMerchants.map((m) => [m.id, m]))
  const next: StoreState = {
    // 品牌/代理/号池：seed 兜底嵌套字段 + 服务端标量覆盖；无权限集合 → 空
    brands: (brands ?? []).map((b) => ({ ...(seedB.get(b.id!) ?? seedBrands[0]), ...b })) as Brand[],
    agents: (agents ?? []).map((a) => ({ ...(seedA.get(a.id!) ?? seedAgents[0]), ...a })) as Agent[],
    merchants: (merchants ?? []).map((m) => ({ ...(seedM.get(m.id!) ?? seedMerchants[0]), ...m })) as MerchantAccount[],
    orders: (orders ?? []) as Order[],
    settlements: (settlements ?? []) as Settlement[],
    complaints: (tickets ?? []).map((t) => {
      const s = seedComplaints.find((c) => c.id === t.id)
      return { ...(s ?? seedComplaints[0]), ...t } as Complaint
    }),
    activity: state.activity,
    // 配置 KV：服务端 Config 表已持久化 → 回读覆盖本地 seed（无值则保留 seed，逐键兜底不被清空）
    attributionConfig: { ...state.attributionConfig, ...((config?.attributionConfig as object) ?? {}) },
    platformConfig: { ...state.platformConfig, ...((config?.platformConfig as object) ?? {}) },
    platformParams: { ...state.platformParams, ...((config?.platformParams as object) ?? {}) },
    slaConfig: { ...state.slaConfig, ...((config?.slaConfig as object) ?? {}) },
    channelStates: { ...state.channelStates, ...((config?.channelStates as object) ?? {}) },
    // 以下纯前端结构（后端无对应表）：保留本地，不被水合清空
    rules: state.rules,
    claims: state.claims,
    pendingAgents: state.pendingAgents,
    contracts: state.contracts,
  }
  commit(next)
}

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
export function getStore() {
  return state
}

/* ── 事件总线（联动 / 通知 / 审计的解耦点） ────────── */
type Handler = (payload: unknown) => void
const bus = new Map<string, Set<Handler>>()
export function on(evt: string, h: Handler): () => void {
  if (!bus.has(evt)) bus.set(evt, new Set())
  bus.get(evt)!.add(h)
  return () => {
    bus.get(evt)?.delete(h)
  }
}
function emit(evt: string, payload?: unknown) {
  bus.get(evt)?.forEach((h) => h(payload))
}

function logActivity(s: StoreState, text: string, tone: Tone): ActivityItem[] {
  const item: ActivityItem = { id: ++seq, t: clock(), text, tone, read: false }
  return [item, ...s.activity].slice(0, 40)
}

// 真实模式：把业务写动作镜像到后端（服务端为审计权威源；本地 store 乐观更新供 UI）。
// 关键：若服务端拒绝（抛错 / {ok:false} / 403 / 409），本地乐观更新与服务端分歧——
// 此时重新 hydrate 回收服务端真值，并经 'mirror:failed' 通知 UI 提示用户（不再静默丢弃）。
function mirror(call: () => Promise<unknown>, label = '操作') {
  if (!isRealApi) return
  call()
    .then((r) => {
      const rejected = r && typeof r === 'object' && 'ok' in r && (r as { ok?: boolean }).ok === false
      if (rejected) throw new Error((r as { detail?: string }).detail || `${label}被服务端拒绝`)
    })
    .catch(async (e) => {
      emit('mirror:failed', { label, message: e instanceof Error ? e.message : String(e) })
      // 回收真值：重新拉取服务端状态覆盖乐观更新，避免 UI 与后端长期分歧
      try {
        await hydrateFromServer()
      } catch {
        /* 已尽力 */
      }
    })
}

/* ════════════ 动作（含状态机流转 + 跨模块联动） ════════════ */

// 退款时应冲减的代理分润 = 退款金额 × 该品牌真实代理分润占比（由结算单 agentPayout/gross 派生，
// 而非固定魔法值；无结算单时退化为 feeRate×0.6 的估算）。修正口径与品牌脱钩问题。
function agentShareRate(brandId: string): number {
  const s = state.settlements.find((x) => x.brandId === brandId)
  if (s && s.gross > 0) return s.agentPayout / s.gross
  const b = brandById(brandId)
  return b ? (b.feeRate / 100) * 0.6 : 0.3
}

// 核心联动：工单退款 → 订单冲正 → 结算逆向冲账 → 代理分润/信用分 → 风险/通知
export function resolveTicketWithRefund(ticketId: string) {
  const t = state.complaints.find((c) => c.id === ticketId)
  if (!t || t.status === 'resolved') return
  const brand = brandById(t.brandId)
  const order = state.orders.find((o) => o.id === t.orderId)
  const amount = order ? Math.abs(order.amount) || 33 : 33
  const share = Math.round(amount * agentShareRate(t.brandId)) // 代理分润冲减 = 退款额 × 该品牌代理分润占比

  // 1) 工单 → 已解决
  const complaints = state.complaints.map((c) =>
    c.id === ticketId ? { ...c, status: 'resolved' as const, slaLeftMin: 0, owner: c.owner === '未分配' ? '客服一组 · 自动' : c.owner } : c,
  )

  // 2) 订单 → 生成退款流水（若有原单）
  let orders = state.orders
  if (order) {
    const refund: Order = {
      id: 'O-' + ++seq,
      time: clock().slice(3),
      brandId: order.brandId,
      agentId: order.agentId,
      channel: order.channel,
      type: 'refund',
      amount: -amount,
      plan: order.plan,
      mid: order.mid,
    }
    orders = [refund, ...state.orders]
  }

  // 3) 结算 → 逆向冲账（冲减该品牌最近一期代理分润）。
  //    已结算单产生退款 → 出现对账差异，状态回到「对账中」并累加差异，使 reconciling/reversed 态可达。
  let touchedSettlement = ''
  const settlements = (() => {
    const idx = state.settlements.findIndex((s) => s.brandId === t.brandId)
    if (idx < 0) return state.settlements
    const copy = state.settlements.slice()
    const s = copy[idx]
    touchedSettlement = s.id
    const status = s.status === 'cleared' ? ('reconciling' as const) : s.status
    const reconcileDiff = s.status === 'cleared' || s.status === 'reconciling' ? s.reconcileDiff + share : s.reconcileDiff
    copy[idx] = { ...s, reversal: s.reversal + share, agentPayout: Math.max(0, s.agentPayout - share), status, reconcileDiff }
    return copy
  })()

  // 4) 代理 → 待结算↓、退款率↑、信用分↓、可能限流
  const agentId = order?.agentId ?? t.agentId
  let agentLimited = false
  const agents = state.agents.map((a) => {
    if (a.id !== agentId) return a
    const creditScore = Math.max(400, a.creditScore - 4)
    const status = a.status === 'active' && creditScore < 760 ? ('throttled' as const) : a.status
    if (status === 'throttled' && a.status === 'active') agentLimited = true
    return {
      ...a,
      payoutPending: Math.max(0, a.payoutPending - share),
      refundRate: +(a.refundRate + 0.1).toFixed(1),
      creditScore,
      status,
    }
  })

  // 5) 活动流 / 通知（把联动讲出来）
  let activity = logActivity(state, `工单 ${ticketId} 已退款 ¥${amount} · ${brand?.name ?? ''}`, 'good')
  let withReversal = { ...state, complaints, orders, settlements, agents, activity }
  withReversal.activity = logActivity(withReversal, `逆向冲账 ¥${share} → 冲减 ${touchedSettlement || '结算单'} 代理分润`, 'alert')
  withReversal.activity = logActivity(withReversal, `代理 ${agentId} 待结算 −¥${share}、信用分 −4`, 'warn')
  if (agentLimited) withReversal.activity = logActivity(withReversal, `代理 ${agentId} 信用分跌破 760 → 已自动限流`, 'alert')
  activity = withReversal.activity

  commit({ ...state, complaints, orders, settlements, agents, activity })
  emit('ticket:refunded', { ticketId, amount, share, agentId })
  mirror(() => bizApi.refundTicket(ticketId, newIdemKey()), '工单退款')
}

// 订单驱动的退款（无工单）：订单冲正 → 结算冲账 → 代理分润回收
export function refundOrder(orderId: string) {
  const order = state.orders.find((o) => o.id === orderId)
  if (!order || order.type === 'refund' || order.type === 'chargeback') return
  const amount = Math.abs(order.amount)
  const share = Math.round(amount * agentShareRate(order.brandId))
  const refund: Order = { id: 'O-' + ++seq, time: clock().slice(3), brandId: order.brandId, agentId: order.agentId, channel: order.channel, type: 'refund', amount: -amount, plan: order.plan, mid: order.mid }
  const orders = [refund, ...state.orders]
  const settlements = (() => {
    const idx = state.settlements.findIndex((s) => s.brandId === order.brandId)
    if (idx < 0) return state.settlements
    const copy = state.settlements.slice()
    const s = copy[idx]
    const status = s.status === 'cleared' ? ('reconciling' as const) : s.status
    const reconcileDiff = s.status === 'cleared' || s.status === 'reconciling' ? s.reconcileDiff + share : s.reconcileDiff
    copy[idx] = { ...s, reversal: s.reversal + share, agentPayout: Math.max(0, s.agentPayout - share), status, reconcileDiff }
    return copy
  })()
  const agents = state.agents.map((a) => (a.id === order.agentId ? { ...a, payoutPending: Math.max(0, a.payoutPending - share), refundRate: +(a.refundRate + 0.1).toFixed(1) } : a))
  const activity = logActivity({ ...state, activity: logActivity(state, `订单 ${orderId} 已退款 ¥${amount}`, 'warn') }, `逆向冲账 ¥${share} → 冲减代理分润`, 'alert')
  commit({ ...state, orders, settlements, agents, activity })
  emit('order:refunded', { orderId, amount })
  mirror(() => bizApi.refundOrder(orderId, newIdemKey()), '订单退款')
}

// 工单：升级 / 转派 / 关闭
export function updateTicket(ticketId: string, patch: Partial<Complaint>, note?: string) {
  const complaints = state.complaints.map((c) => (c.id === ticketId ? { ...c, ...patch } : c))
  const activity = note ? logActivity(state, note, 'info') : state.activity
  commit({ ...state, complaints, activity })
  mirror(() => bizApi.updateTicket(ticketId, { status: patch.status, owner: patch.owner, note }), '工单流转')
}

// 品牌入驻：新建（默认审核中）
export interface NewBrandInput {
  name: string
  mark: string
  category: string
  path: Brand['path']
  feeRate: number
  period: number
  reservePct: number
  planName: string
  firstPrice: number
  renewPrice: number
  channel: 'wechat' | 'alipay' | 'bank'
}
export function addBrand(input: NewBrandInput) {
  const id = 'brand-' + ++seq
  const brand: Brand = {
    id,
    name: input.name,
    mark: input.mark || input.name.slice(0, 1),
    category: input.category,
    status: 'review',
    path: input.path,
    feeRate: input.feeRate,
    period: input.period,
    reservePct: input.reservePct,
    thresholds: { complaint: 1.0, escalated: 0.1, chargeback: 0.5 },
    plans: [{ name: input.planName, firstPrice: input.firstPrice, renewPrice: input.renewPrice, cycle: '月', autoRenew: true, equity: '会员权益' }],
    channels: [{ type: input.channel, direct: input.path === 'direct', rate: input.channel === 'alipay' ? 0.55 : 0.6 }],
    gmvMtd: 0,
    activeSubs: 0,
    renewalRate: 0,
    complaintRate: 0,
    escalatedRate: 0,
    chargebackRate: 0,
    joinedAt: '2026-06-17',
  }
  const brands = [brand, ...state.brands]
  const activity = logActivity(state, `新品牌「${input.name}」提交入驻，进入审核`, 'info')
  commit({ ...state, brands, activity })
  emit('brand:added', { id })
  // 真实模式：创建镜像到服务端，并以服务端返回的 id 校正本地临时 id（避免漂移/刷新丢失）
  if (isRealApi) {
    bizApi
      .addBrand({ name: input.name, category: input.category, feeRate: input.feeRate, period: input.period, reservePct: input.reservePct, path: input.path })
      .then((r) => {
        if (r.ok && r.id) {
          // 若期间 hydrate 已替换 brands、临时 id 不在了 → 以服务端 id 重新插入(不丢失)；否则原地校正 id
          const has = state.brands.some((b) => b.id === id)
          const reconciled = has ? state.brands.map((b) => (b.id === id ? { ...b, id: r.id! } : b)) : [{ ...brand, id: r.id! }, ...state.brands]
          commit({ ...state, brands: reconciled })
        } else throw new Error(r.detail || '品牌创建被服务端拒绝')
      })
      .catch(async (e) => {
        emit('mirror:failed', { label: '新增品牌', message: e instanceof Error ? e.message : String(e) })
        await hydrateFromServer()
      })
  }
  return id
}
export function updateBrandConfig(id: string, patch: Partial<Pick<Brand, 'feeRate' | 'period' | 'reservePct' | 'path'>>) {
  const brands = state.brands.map((b) => (b.id === id ? { ...b, ...patch } : b))
  const b = state.brands.find((x) => x.id === id)
  const activity = logActivity(state, `品牌「${b?.name ?? id}」配置已更新`, 'info')
  commit({ ...state, brands, activity })
  mirror(() => bizApi.setBrandConfig(id, patch), '品牌配置')
}
export function setBrandStatus(id: string, status: Brand['status'], label: string) {
  const brands = state.brands.map((b) => (b.id === id ? { ...b, status } : b))
  const b = state.brands.find((x) => x.id === id)
  const activity = logActivity(state, `品牌「${b?.name ?? id}」${label}`, status === 'live' ? 'good' : status === 'paused' ? 'warn' : 'info')
  commit({ ...state, brands, activity })
  mirror(() => bizApi.setBrandStatus(id, status, label), '品牌状态')
}

// 商户号：新增录入
export function addMerchant(input: { brandId: string; channel: 'wechat' | 'alipay' | 'bank'; weight: number }) {
  const b = brandById(input.brandId)
  const pref = b ? b.id.slice(0, 2).toUpperCase() : 'NW'
  // 用完整 seq 而非 slice(-2)：后者仅 100 种后缀，号池稍多即主键碰撞
  const id = `M-${pref}-${++seq}`
  const m: MerchantAccount = {
    id, brandId: input.brandId, channel: input.channel, mid: `${input.channel === 'alipay' ? '20' : input.channel === 'bank' ? '62' : '15'}•••${String(seq).slice(-4)}`,
    state: 'healthy', complaintRate: 0, escalatedRate: 0, chargebackRate: 0, refundRate: 0, close72h: 100, gmvMtd: 0, txCount: 0, limitUsedPct: 0, weight: input.weight,
  }
  const merchants = [m, ...state.merchants]
  const activity = logActivity(state, `新增商户号 ${id}（${b?.name ?? ''} · ${input.channel === 'alipay' ? '支付宝' : input.channel === 'bank' ? '银行分账' : '微信支付'}）`, 'good')
  commit({ ...state, merchants, activity })
  // 真实模式：创建镜像到服务端，并以服务端 id 校正本地临时 id
  if (isRealApi) {
    bizApi
      .addMerchant({ brandId: input.brandId, channel: input.channel, weight: input.weight })
      .then((r) => {
        if (r.ok && r.id) {
          const has = state.merchants.some((x) => x.id === id)
          const reconciled = has ? state.merchants.map((x) => (x.id === id ? { ...x, id: r.id! } : x)) : [{ ...m, id: r.id! }, ...state.merchants]
          commit({ ...state, merchants: reconciled })
        } else throw new Error(r.detail || '商户号创建被服务端拒绝')
      })
      .catch(async (e) => {
        emit('mirror:failed', { label: '新增商户号', message: e instanceof Error ? e.message : String(e) })
        await hydrateFromServer()
      })
  }
  return id
}

// 商户号：人工干预状态机
export function setMerchantState(id: string, next: MerchantState, label: string) {
  const merchants = state.merchants.map((m) =>
    m.id === id ? { ...m, state: next, weight: next === 'fused' ? 0 : next === 'paused' ? Math.min(m.weight, 8) : m.weight } : m,
  )
  const activity = logActivity(state, `商户号 ${id} 人工置为「${label}」`, next === 'healthy' ? 'good' : 'alert')
  commit({ ...state, merchants, activity })
  emit('merchant:state', { id, next })
  mirror(() => bizApi.setMerchant(id, next, label), '号池干预')
}

// 代理提现结算：待结算清零 → 计入累计已结
export function settleAgent(id: string) {
  const a = state.agents.find((x) => x.id === id)
  if (!a || a.payoutPending <= 0) return
  const amt = a.payoutPending
  const agents = state.agents.map((x) => (x.id === id ? { ...x, payoutPending: 0, settledTotal: x.settledTotal + amt } : x))
  const activity = logActivity(state, `代理 ${id} 提现结算 ¥${amt.toLocaleString('zh-CN')} 已打款`, 'good')
  commit({ ...state, agents, activity })
  emit('agent:settled', { id, amt })
  mirror(() => bizApi.settleAgent(id, newIdemKey()), '代理提现')
}

// 代理：限流 / 冻结 / 恢复
export function setAgentStatus(id: string, next: Agent['status'], label: string) {
  const agents = state.agents.map((a) => (a.id === id ? { ...a, status: next } : a))
  const activity = logActivity(state, `代理 ${id} 置为「${label}」`, next === 'active' ? 'good' : 'alert')
  commit({ ...state, agents, activity })
  if (next === 'active' || next === 'throttled' || next === 'frozen') mirror(() => bizApi.setAgent(id, next), '代理处置')
}

// 清结算：发起本期结算（待结算 → 已结算）
export function clearSettlement(id: string) {
  const settlements = state.settlements.map((s) => (s.id === id && s.status === 'pending' ? { ...s, status: 'cleared' as const } : s))
  const s = state.settlements.find((x) => x.id === id)
  const activity = logActivity(state, `结算单 ${id} 已发起结算并完成`, 'good')
  commit({ ...state, settlements, activity })
  emit('settlement:cleared', { id, amount: s?.platformFee })
  mirror(() => bizApi.clearSettlement(id, newIdemKey()), '发起结算')
}

// 对账差异核销
export function reconcileSettlement(id: string) {
  const settlements = state.settlements.map((s) => (s.id === id ? { ...s, status: 'cleared' as const, reconcileDiff: 0 } : s))
  const activity = logActivity(state, `结算单 ${id} 对账差异已人工核销`, 'good')
  commit({ ...state, settlements, activity })
  mirror(() => bizApi.reconcile(id, newIdemKey()), '对账核销')
}

export function markAllRead() {
  commit({ ...state, activity: state.activity.map((a) => ({ ...a, read: true })) })
}

export function resetStore() {
  commit(seed())
}

/* ════════════ 演示剧本（一键触发，用于招商/验收） ════════════ */
export function runScenario(name: 'crisis' | 'refund' | 'reconcile' | 'fraud') {
  if (name === 'crisis') {
    const merchants = state.merchants.map((m) => (m.id === 'M-XM-02' ? { ...m, complaintRate: 1.06, escalatedRate: 0.12, state: 'paused' as const, weight: 6 } : m))
    const activity = logActivity(state, '剧本「保号危机」：M-XM-02 投诉率 1.06%、升级 0.12% → 暂停新签、投放收紧', 'alert')
    commit({ ...state, merchants, activity })
  } else if (name === 'refund') {
    const pending = state.complaints.find((c) => c.status !== 'resolved')
    if (pending) resolveTicketWithRefund(pending.id)
  } else if (name === 'reconcile') {
    const diff = state.settlements.find((s) => s.reconcileDiff > 0)
    if (diff) reconcileSettlement(diff.id)
  } else if (name === 'fraud') {
    setAgentStatus('A-4410', 'frozen', '冻结结算（刷量命中）')
  }
}

/* ════════════ 派生选择器（首页 Risk Bar / 行动中心用） ════════════ */
export interface RiskSignal {
  key: string
  label: string
  value: string
  health: 'green' | 'amber' | 'red'
  to: string
}

export function selectRisk(s: StoreState): RiskSignal[] {
  const suspended = s.merchants.filter((m) => m.state === 'throttled' || m.state === 'paused').length
  const fused = s.merchants.filter((m) => m.state === 'fused').length
  const maxComplaint = s.merchants.length ? Math.max(...s.merchants.map((m) => m.complaintRate)) : 0
  const maxEsc = s.merchants.length ? Math.max(...s.merchants.map((m) => m.escalatedRate)) : 0
  const slaUrgent = s.complaints.filter((c) => c.status !== 'resolved' && c.slaLeftMin > 0 && c.slaLeftMin <= 30).length
  const reg = s.complaints.filter((c) => c.level === 'regulatory' && c.status !== 'resolved').length
  const diff = s.settlements.reduce((a, x) => a + x.reconcileDiff, 0)
  return [
    { key: 'pool', label: '号池管控', value: fused ? `熔断 ${fused}` : `暂停新签 ${suspended}`, health: fused ? 'red' : suspended ? 'amber' : 'green', to: '/merchants' },
    { key: 'complaint', label: '最高投诉率', value: `${maxComplaint.toFixed(2)}%`, health: maxComplaint >= 1 ? 'red' : maxComplaint >= 0.6 ? 'amber' : 'green', to: '/merchants' },
    { key: 'esc', label: '最高升级投诉', value: `${maxEsc.toFixed(2)}%`, health: maxEsc >= 0.1 ? 'red' : maxEsc >= 0.05 ? 'amber' : 'green', to: '/complaints' },
    { key: 'sla', label: 'SLA 临期', value: `${slaUrgent} 起`, health: slaUrgent ? 'red' : 'green', to: '/complaints' },
    { key: 'reg', label: '监管投诉', value: `${reg} 起`, health: reg ? 'red' : 'green', to: '/complaints' },
    { key: 'recon', label: '对账差异', value: diff ? `¥${diff.toLocaleString('zh-CN')}` : '0', health: diff ? 'amber' : 'green', to: '/settlement' },
    { key: 'erli', label: '二清敞口', value: '¥0', health: 'green', to: '/compliance' },
  ]
}

export interface ActionItem {
  id: string
  tone: Tone
  title: string
  sub: string
  to: string
  ticketId?: string
}

export function selectActions(s: StoreState): ActionItem[] {
  const out: ActionItem[] = []
  const reg = s.complaints.filter((c) => c.level !== 'normal' && c.status !== 'resolved')
  if (reg.length) {
    const urgent = reg.slice().sort((a, b) => a.slaLeftMin - b.slaLeftMin)[0]
    out.push({
      id: 'reg',
      tone: 'alert',
      title: `${reg.length} 起升级/监管投诉待处理`,
      sub: urgent.slaLeftMin > 0 ? `最紧 ${urgent.id} · SLA 剩余 ${urgent.slaLeftMin} 分钟` : `最紧 ${urgent.id}`,
      to: '/complaints',
      ticketId: urgent.id,
    })
  }
  const paused = s.merchants.find((m) => m.state === 'paused' || m.state === 'fused')
  if (paused) out.push({ id: 'pool', tone: 'warn', title: `${paused.id} ${paused.state === 'fused' ? '已熔断' : '已暂停新签'}`, sub: `投诉 ${paused.complaintRate.toFixed(2)}% · 建议核查并切量`, to: '/merchants' })
  const fraud = s.agents.find((a) => a.status === 'throttled' || a.status === 'frozen')
  if (fraud) out.push({ id: 'fraud', tone: 'info', title: `代理 ${fraud.id} 风险预警`, sub: `信用分 ${fraud.creditScore} · ${fraud.status === 'frozen' ? '已冻结' : '已降权'}，待复核`, to: '/risk' })
  const diff = s.settlements.find((x) => x.reconcileDiff > 0)
  if (diff) out.push({ id: 'recon', tone: 'violet', title: `${brandById(diff.brandId)?.name ?? ''} 对账差异 ¥${diff.reconcileDiff.toLocaleString('zh-CN')}`, sub: `${diff.period} 挂起，待三方核对`, to: '/settlement' })
  return out
}

// ════════════════════════════════════════════════════════════════
//  批3/批4 新增动作 —— 受控配置 + 新集合的真实写入（commit + 持久化）
// ════════════════════════════════════════════════════════════════

// 批3：归因配置
export function setAttributionConfig(patch: Partial<AttributionConfig>) {
  const next = { ...state, attributionConfig: { ...state.attributionConfig, ...patch } }
  commit({ ...next, activity: logActivity(next, '归因模型配置已更新', 'info') })
  mirror(() => bizApi.setConfig({ attributionConfig: next.attributionConfig }), '归因配置')
}
// 批3：平台配置开关
export function setPlatformConfig(patch: Partial<PlatformConfig>) {
  const next = { ...state, platformConfig: { ...state.platformConfig, ...patch } }
  commit({ ...next, activity: logActivity(next, '平台配置已保存', 'good') })
  mirror(() => bizApi.setConfig({ platformConfig: next.platformConfig }), '平台配置')
}
// 平台数值参数（服务费/费率/账期/分润 + 风控阈值）——可编辑、持久化、回读
export function setPlatformParams(patch: Partial<PlatformParams>) {
  const next = { ...state, platformParams: { ...state.platformParams, ...patch } }
  commit({ ...next, activity: logActivity(next, '平台参数已保存', 'good') })
  mirror(() => bizApi.setConfig({ platformParams: next.platformParams }), '平台参数')
}
// 批3：SLA 配置
export function setSlaConfig(patch: Partial<SlaConfig>) {
  const next = { ...state, slaConfig: { ...state.slaConfig, ...patch } }
  commit({ ...next, activity: logActivity(next, 'SLA 规则已更新', 'info') })
  mirror(() => bizApi.setConfig({ slaConfig: next.slaConfig }), 'SLA 配置')
}
// 批3：分账通道启停
export function setChannelState(name: string, st: 'live' | 'review') {
  const next = { ...state, channelStates: { ...state.channelStates, [name]: st } }
  commit({ ...next, activity: logActivity(next, `分账通道「${name}」已${st === 'live' ? '启用' : '置为评估中'}`, 'info') })
  mirror(() => bizApi.setConfig({ channelStates: next.channelStates }), '通道配置')
}

// 批4：风控规则
export function addRule(input: { name: string; cond: string; action: string }): RiskRule {
  const rule: RiskRule = { id: 'RULE-' + ++seq, name: input.name, cond: input.cond, action: input.action, on: true }
  const next = { ...state, rules: [...state.rules, rule] }
  commit({ ...next, activity: logActivity(next, `新增风控规则「${rule.name}」`, 'good') })
  return rule
}
export function updateRule(id: string, patch: Partial<Omit<RiskRule, 'id'>>) {
  const next = { ...state, rules: state.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }
  commit({ ...next, activity: logActivity(next, '风控规则已更新', 'info') })
}
export function toggleRule(id: string) {
  const r = state.rules.find((x) => x.id === id)
  const next = { ...state, rules: state.rules.map((x) => (x.id === id ? { ...x, on: !x.on } : x)) }
  commit({ ...next, activity: logActivity(next, `风控规则「${r?.name ?? id}」已${r?.on ? '停用' : '启用'}`, 'info') })
}

// 批4：投放计划（领取追踪链接时写入）
export function addClaim(input: { brandId: string; plan: string; url: string; channel: string }): AdClaim {
  const agentId = state.agents.find((a) => a.status === 'active')?.id ?? 'A-2041'
  const claim: AdClaim = {
    id: 'CLAIM-' + ++seq, agentId, brandId: input.brandId, plan: input.plan, url: input.url, channel: input.channel,
    spend: 0, firstOrders: 0, payout: 0, createdAt: clock(),
  }
  const next = { ...state, claims: [claim, ...state.claims] }
  commit({ ...next, activity: logActivity(next, `领取投放链接：${brandById(input.brandId)?.name ?? input.brandId} · ${input.plan}`, 'good') })
  return claim
}

// 批4：入驻审核（通过 → 转为正式代理；驳回 → 移除）
export function approveAgent(pendingId: string): Agent | null {
  const p = state.pendingAgents.find((x) => x.id === pendingId)
  if (!p) return null
  const agent: Agent = {
    id: 'A-' + ++seq, name: p.name, type: p.type, status: 'active', creditScore: 700,
    spendMtd: 0, firstOrders: 0, roi: 0, renewalRate: 0, complaintRate: 0, refundRate: 0,
    payoutPending: 0, settledTotal: 0, deposit: p.type === '企业' ? 200000 : 30000, brandsCount: 0,
    invoicing: p.invoicing, joinedAt: '刚刚',
  }
  const next = { ...state, agents: [agent, ...state.agents], pendingAgents: state.pendingAgents.filter((x) => x.id !== pendingId) }
  commit({ ...next, activity: logActivity(next, `代理「${p.name}」审核通过，准入 L1`, 'good') })
  return agent
}
export function rejectAgent(pendingId: string) {
  const p = state.pendingAgents.find((x) => x.id === pendingId)
  const next = { ...state, pendingAgents: state.pendingAgents.filter((x) => x.id !== pendingId) }
  commit({ ...next, activity: logActivity(next, `代理「${p?.name ?? pendingId}」入驻申请已驳回`, 'warn') })
}

// 批4：发起增长合约
export function addContract(input: { brandId: string; settleModel: SettleModel; ltvWindow: 'D30' | 'D60' | 'D90'; complaintLiability: 'agent' | 'brand' | 'shared'; reservePct: number; targetGmv: number; userLimit: string }): GrowthContract {
  const c: GrowthContract = {
    id: 'GC-' + ++seq, brandId: input.brandId, agentId: null, status: 'open',
    settleModel: input.settleModel, ltvWindow: input.ltvWindow, complaintLiability: input.complaintLiability,
    reservePct: input.reservePct, targetGmv: input.targetGmv, achievedGmv: 0, userLimit: input.userLimit,
    breachNote: '—', signedAt: null,
  }
  const next = { ...state, contracts: [c, ...state.contracts] }
  commit({ ...next, activity: logActivity(next, `发起增长合约：${brandById(input.brandId)?.name ?? input.brandId}（挂单中）`, 'good') })
  return c
}

// 批5：订单回传同步（mock：造一条续费回传 + 活动；real：重拉后端订单）
export function triggerOrderSync(brandId?: string) {
  if (isRealApi) {
    void hydrateFromServer()
    const next = { ...state }
    commit({ ...next, activity: logActivity(next, '订单回传已从渠道同步（已对齐后端）', 'good') })
    return
  }
  // mock：插入 1 条"刚回传"的续费订单，让订单流真的变长、通知中心有记录（不再谎报成功）
  const pool = brandId ? state.orders.filter((o) => o.brandId === brandId) : state.orders
  const ref = pool.find((o) => o.type === 'first') ?? state.orders[0]
  const newOrders: Order[] = ref
    ? [{ id: 'O-' + ++seq, time: '现在', brandId: ref.brandId, agentId: ref.agentId, channel: ref.channel, type: 'renew', amount: ref.amount, plan: ref.plan, mid: ref.mid }]
    : []
  const next = { ...state, orders: [...newOrders, ...state.orders] }
  const label = brandId ? `${brandById(brandId)?.name ?? brandId} 订单回传同步完成` : '订单回传同步完成 · 新增 1 笔续费回传'
  commit({ ...next, activity: logActivity(next, label, 'good') })
}
