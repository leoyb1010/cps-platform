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
  brandById,
  type Order,
  type Complaint,
  type Settlement,
  type Agent,
  type MerchantAccount,
  type MerchantState,
  type Brand,
  type Tone,
} from './data'
import { isRealApi } from './http'
import { bizApi } from './adminApi'

export interface ActivityItem {
  id: number
  t: string
  text: string
  tone: Tone
  read: boolean
}

export interface StoreState {
  orders: Order[]
  complaints: Complaint[]
  settlements: Settlement[]
  agents: Agent[]
  merchants: MerchantAccount[]
  brands: Brand[]
  activity: ActivityItem[]
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
  }
}

function load(): StoreState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as StoreState
      // 基本完整性校验，缺字段则重置
      if (p.orders && p.complaints && p.settlements && p.agents && p.merchants && p.brands) {
        // 恢复 seq 到已持久化的最大 id 之上，避免刷新后重新发号导致 key 冲突
        const maxActivityId = (p.activity ?? []).reduce((m, a) => Math.max(m, a.id), 0)
        if (maxActivityId >= seq) seq = maxActivityId + 1
        return { ...seed(), ...p, activity: p.activity ?? [] }
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

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
export function getStore() {
  return state
}

/* ── 事件总线（联动 / 通知 / 审计的解耦点） ────────── */
type Handler = (payload: unknown) => void
const bus = new Map<string, Set<Handler>>()
export function on(evt: string, h: Handler) {
  if (!bus.has(evt)) bus.set(evt, new Set())
  bus.get(evt)!.add(h)
  return () => bus.get(evt)!.delete(h)
}
function emit(evt: string, payload?: unknown) {
  bus.get(evt)?.forEach((h) => h(payload))
}

function logActivity(s: StoreState, text: string, tone: Tone): ActivityItem[] {
  const item: ActivityItem = { id: ++seq, t: clock(), text, tone, read: false }
  return [item, ...s.activity].slice(0, 40)
}

// 真实模式：把业务写动作镜像到后端（服务端为审计权威源；本地 store 仍即时更新供 UI）。
// 失败仅告警、不阻断本地流转，保证演示连续性。
function mirror(call: () => Promise<unknown>) {
  if (!isRealApi) return
  call().catch((e) => emit('mirror:error', e))
}

/* ════════════ 动作（含状态机流转 + 跨模块联动） ════════════ */

// 核心联动：工单退款 → 订单冲正 → 结算逆向冲账 → 代理分润/信用分 → 风险/通知
export function resolveTicketWithRefund(ticketId: string) {
  const t = state.complaints.find((c) => c.id === ticketId)
  if (!t || t.status === 'resolved') return
  const brand = brandById(t.brandId)
  const order = state.orders.find((o) => o.id === t.orderId)
  const amount = order ? Math.abs(order.amount) || 33 : 33
  const share = Math.round(amount * 0.3) // 代理分润口径（演示）

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

  // 3) 结算 → 逆向冲账（冲减该品牌最近一期代理分润）
  let touchedSettlement = ''
  const settlements = (() => {
    const idx = state.settlements.findIndex((s) => s.brandId === t.brandId)
    if (idx < 0) return state.settlements
    const copy = state.settlements.slice()
    const s = copy[idx]
    touchedSettlement = s.id
    copy[idx] = { ...s, reversal: s.reversal + share, agentPayout: Math.max(0, s.agentPayout - share) }
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
  mirror(() => bizApi.refundTicket(ticketId))
}

// 订单驱动的退款（无工单）：订单冲正 → 结算冲账 → 代理分润回收
export function refundOrder(orderId: string) {
  const order = state.orders.find((o) => o.id === orderId)
  if (!order || order.type === 'refund' || order.type === 'chargeback') return
  const amount = Math.abs(order.amount)
  const share = Math.round(amount * 0.3)
  const refund: Order = { id: 'O-' + ++seq, time: clock().slice(3), brandId: order.brandId, agentId: order.agentId, channel: order.channel, type: 'refund', amount: -amount, plan: order.plan, mid: order.mid }
  const orders = [refund, ...state.orders]
  const settlements = (() => {
    const idx = state.settlements.findIndex((s) => s.brandId === order.brandId)
    if (idx < 0) return state.settlements
    const copy = state.settlements.slice()
    copy[idx] = { ...copy[idx], reversal: copy[idx].reversal + share, agentPayout: Math.max(0, copy[idx].agentPayout - share) }
    return copy
  })()
  const agents = state.agents.map((a) => (a.id === order.agentId ? { ...a, payoutPending: Math.max(0, a.payoutPending - share), refundRate: +(a.refundRate + 0.1).toFixed(1) } : a))
  const activity = logActivity({ ...state, activity: logActivity(state, `订单 ${orderId} 已退款 ¥${amount}`, 'warn') }, `逆向冲账 ¥${share} → 冲减代理分润`, 'alert')
  commit({ ...state, orders, settlements, agents, activity })
  emit('order:refunded', { orderId, amount })
}

// 工单：升级 / 转派 / 关闭
export function updateTicket(ticketId: string, patch: Partial<Complaint>, note?: string) {
  const complaints = state.complaints.map((c) => (c.id === ticketId ? { ...c, ...patch } : c))
  const activity = note ? logActivity(state, note, 'info') : state.activity
  commit({ ...state, complaints, activity })
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
  return id
}
export function updateBrandConfig(id: string, patch: Partial<Pick<Brand, 'feeRate' | 'period' | 'reservePct' | 'path'>>) {
  const brands = state.brands.map((b) => (b.id === id ? { ...b, ...patch } : b))
  const b = state.brands.find((x) => x.id === id)
  const activity = logActivity(state, `品牌「${b?.name ?? id}」配置已更新`, 'info')
  commit({ ...state, brands, activity })
}
export function setBrandStatus(id: string, status: Brand['status'], label: string) {
  const brands = state.brands.map((b) => (b.id === id ? { ...b, status } : b))
  const b = state.brands.find((x) => x.id === id)
  const activity = logActivity(state, `品牌「${b?.name ?? id}」${label}`, status === 'live' ? 'good' : status === 'paused' ? 'warn' : 'info')
  commit({ ...state, brands, activity })
}

// 商户号：新增录入
export function addMerchant(input: { brandId: string; channel: 'wechat' | 'alipay' | 'bank'; weight: number }) {
  const b = brandById(input.brandId)
  const pref = b ? b.id.slice(0, 2).toUpperCase() : 'NW'
  const id = `M-${pref}-${String(++seq).slice(-2)}`
  const m: MerchantAccount = {
    id, brandId: input.brandId, channel: input.channel, mid: `${input.channel === 'alipay' ? '20' : input.channel === 'bank' ? '62' : '15'}•••${String(seq).slice(-4)}`,
    state: 'healthy', complaintRate: 0, escalatedRate: 0, chargebackRate: 0, refundRate: 0, close72h: 100, gmvMtd: 0, txCount: 0, limitUsedPct: 0, weight: input.weight,
  }
  const merchants = [m, ...state.merchants]
  const activity = logActivity(state, `新增商户号 ${id}（${b?.name ?? ''} · ${input.channel === 'alipay' ? '支付宝' : input.channel === 'bank' ? '银行分账' : '微信支付'}）`, 'good')
  commit({ ...state, merchants, activity })
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
  mirror(() => bizApi.setMerchant(id, next, label))
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
}

// 代理：限流 / 冻结 / 恢复
export function setAgentStatus(id: string, next: Agent['status'], label: string) {
  const agents = state.agents.map((a) => (a.id === id ? { ...a, status: next } : a))
  const activity = logActivity(state, `代理 ${id} 置为「${label}」`, next === 'active' ? 'good' : 'alert')
  commit({ ...state, agents, activity })
  if (next === 'active' || next === 'throttled' || next === 'frozen') mirror(() => bizApi.setAgent(id, next))
}

// 清结算：发起本期结算（待结算 → 已结算）
export function clearSettlement(id: string) {
  const settlements = state.settlements.map((s) => (s.id === id && s.status === 'pending' ? { ...s, status: 'cleared' as const } : s))
  const s = state.settlements.find((x) => x.id === id)
  const activity = logActivity(state, `结算单 ${id} 已发起结算并完成`, 'good')
  commit({ ...state, settlements, activity })
  emit('settlement:cleared', { id, amount: s?.platformFee })
  mirror(() => bizApi.clearSettlement(id))
}

// 对账差异核销
export function reconcileSettlement(id: string) {
  const settlements = state.settlements.map((s) => (s.id === id ? { ...s, status: 'cleared' as const, reconcileDiff: 0 } : s))
  const activity = logActivity(state, `结算单 ${id} 对账差异已人工核销`, 'good')
  commit({ ...state, settlements, activity })
  mirror(() => bizApi.reconcile(id))
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
