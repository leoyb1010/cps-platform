import { brands, agents, orders as seedOrders, complaints, settlements as seedSettlements, contracts as seedContracts, brandById } from './data'
import { stringToSign } from './codeGen'
import type { BrandSummary, AgentSummary, TrendPoint } from './portalApi'

// ════════════════════════════════════════════════════════════════
//  客户门户 · 演示模式数据层（portalApi 在 !isRealApi 时动态落到这里）
//  真实模式由服务端 /portal/* 按账户 scope 收窄；演示模式在此从种子数据
//  合成「按租户隔离」的视图——只为两个演示门户账户合成：
//    brand → youdao（有道品牌运营） / agent → A-2041（量子增长工作室）
//  响应形态与 server/src/portal/portal.controller.ts 逐字段对齐（含脱敏：
//  订单去 agentId 明文 → 渠道#尾号；结算剔除 platformFee/agentPayout）。
//  写操作在内存中生效（同会话内列表可见变化），刷新即重置，不做持久化。
//  数据合成全部用索引种子伪随机（跨刷新稳定），不在模块求值期用 Math.random。
// ════════════════════════════════════════════════════════════════

const BRAND_ID = 'youdao'
const AGENT_ID = 'A-2041'
const DEMO_OK = '演示模式 · 已模拟成功'

const wait = (ms = 220) => new Promise<void>((r) => setTimeout(r, ms)) // 保留骨架屏一瞬，接近真实网络手感
// 索引种子伪随机（0~1）：同一 (i, salt) 永远同值 → 趋势/合成行跨刷新稳定
const rnd = (i: number, salt = 1) => { const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x) }
const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8).toUpperCase()}` // 仅用户动作时生成 id，不影响首屏确定性
const isoDay = (back: number) => new Date(Date.now() - back * 86400e3).toISOString().slice(0, 10)
const nowBack = (hours: number) => new Date(Date.now() - hours * 3600e3).toISOString()

// 当前登录 scope：非 hook 层不走 useAuth，直接读 auth.ts 的持久化键并容错
function scope(): { scopeType?: string; scopeId?: string | null } {
  try { return JSON.parse(localStorage.getItem('cps-auth-v1') || '{}') as { scopeType?: string; scopeId?: string | null } } catch { return {} }
}
const isAgentScope = () => scope().scopeType === 'agent'

// 近 14 天趋势：daily ±20% 噪声（退款计负已摊在均值里），索引种子保证确定性
function trend14(daily: number, salt: number): TrendPoint[] {
  return Array.from({ length: 14 }, (_, i) => ({ date: isoDay(13 - i), value: Math.round(daily * (0.8 + 0.4 * rnd(i, salt))) }))
}
// 周期因子：让 PeriodFilter 在演示态也有反馈（服务端按结算/订单真过滤，这里按天数近似）
function periodFactor(period?: { preset: string; from?: string; to?: string }): number {
  const F: Record<string, number> = { today: 1 / 30, week: 7 / 30, month: 1, quarter: 2.9 }
  if (period?.preset === 'custom' && period.from && period.to) {
    const days = (Date.parse(period.to) - Date.parse(period.from)) / 86400e3
    return Math.max(1 / 30, days / 30)
  }
  return F[period?.preset ?? 'month'] ?? 1
}

/* ── 内部行类型（与服务端返回形态一致的最小集） ── */
interface DOrder { id: string; brandId: string; agentId: string | null; plan: string; type: string; amount: number; time: string }
interface DTicket { id: string; brandId: string; agentId: string; level: string; status: string; source: string; reason: string; owner: string; slaLeftMin: number; time: string; handlePlan: string; note: string; handledBy: string }
interface DBarter { id: string; initiatorBrandId: string; counterpartyBrandId: string; status: string; resourceType: string; myQuota: number; counterpartyQuota: number; invoiceStatus: string; terms: string }
interface DContract { id: string; brandId: string; agentId: string | null; status: string; settleModel: string; targetGmv: number; achievedGmv: number; ltvWindow: string; complaintLiability: string; reservePct: number; userLimit: string; signedAt: string | null }
interface DProduct { id: string; brandId: string; name: string; category: string; description: string; billingCycle: string; firstPrice: number; renewPrice: number; defaultSharePct: number; status: string; reviewNote: string; bundleEligible: boolean; exclusiveGroup: string; tags: string }
interface DClaim { id: string; agentId: string; brandId: string; productId: string | null; channel: string; trackingUrl: string; trackingCode: string; status: string; createdAt: string }
interface DNotif { id: string; scopeType: string; scopeId: string; category: string; title: string; body: string; link: string; read: boolean; createdAt: string }

/* ── 订单合成：种子里租户行太少，按品牌套餐补齐流水（类型/金额/时间全部索引种子确定） ── */
function genOrders(n: number, salt: number, pool: { brandId: string; agentId: string | null }[], startSeq: number): DOrder[] {
  return Array.from({ length: n }, (_, i) => {
    const src = pool[Math.floor(rnd(i, salt) * pool.length) % pool.length]
    const plans = brandById(src.brandId).plans
    const p = plans[Math.floor(rnd(i, salt + 1) * plans.length) % plans.length] ?? { name: '订阅套餐', firstPrice: 19.9, renewPrice: 29.9 }
    const r = rnd(i, salt + 2)
    const type = r < 0.42 ? 'first' : r < 0.84 ? 'renew' : r < 0.94 ? 'refund' : 'chargeback'
    const amount = type === 'first' ? p.firstPrice : type === 'renew' ? p.renewPrice : -p.renewPrice
    const hh = String(9 + Math.floor(rnd(i, salt + 3) * 12)).padStart(2, '0')
    const mm = String(Math.floor(rnd(i, salt + 4) * 60)).padStart(2, '0')
    return { id: `O-${startSeq - i * 37}`, brandId: src.brandId, agentId: src.agentId, plan: p.name, type, amount, time: `${isoDay(1 + Math.floor(i / 3)).slice(5)} ${hh}:${mm}` }
  })
}

/* ── 会话级内存库（懒建；写操作直接改这里，列表随之更新） ── */
function buildStore() {
  const B = brands.find((b) => b.id === BRAND_ID)!
  const A = agents.find((a) => a.id === AGENT_ID)!

  const bOrders: DOrder[] = [
    ...seedOrders.filter((o) => o.brandId === BRAND_ID).map((o) => ({ id: o.id, brandId: o.brandId, agentId: o.agentId, plan: o.plan, type: o.type as string, amount: o.amount, time: o.time })),
    ...genOrders(18, 21, [{ brandId: BRAND_ID, agentId: AGENT_ID }, { brandId: BRAND_ID, agentId: 'A-5521' }, { brandId: BRAND_ID, agentId: 'A-1188' }, { brandId: BRAND_ID, agentId: null }], 93400),
  ]
  const aOrders: DOrder[] = [
    ...seedOrders.filter((o) => o.agentId === AGENT_ID).map((o) => ({ id: o.id, brandId: o.brandId, agentId: o.agentId, plan: o.plan, type: o.type as string, amount: o.amount, time: o.time })),
    ...genOrders(15, 55, ['youdao', 'wps', 'ximalaya', 'zhihu', 'keep'].map((brandId) => ({ brandId, agentId: AGENT_ID })), 92800),
  ]

  // 工单 = 种子投诉（租户相关）+ 2 条合成未结单（让处理/回复流程可体验）；状态映射到门户口径 open/processing/resolved
  const tickets: DTicket[] = [
    ...complaints.filter((c) => c.brandId === BRAND_ID || c.agentId === AGENT_ID).map((c) => ({
      id: c.id, brandId: c.brandId, agentId: c.agentId, level: c.level as string,
      status: c.status === 'pending' ? 'open' : c.status === 'arbitration' ? 'processing' : (c.status as string),
      source: c.source as string, reason: c.reason, owner: c.owner, slaLeftMin: c.slaLeftMin, time: c.time,
      handlePlan: c.status === 'resolved' ? '已核实并为用户补发权益，同步优化到账提示' : '', note: '', handledBy: c.status === 'resolved' ? 'platform:risk' : '',
    })),
    { id: 'T-5530', brandId: BRAND_ID, agentId: AGENT_ID, level: 'escalated', status: 'open', source: 'heimao', reason: 'iOS 端连续包月扣费成功但 VIP 权益未同步', owner: '未分配', slaLeftMin: 95, time: '今天 14:02', handlePlan: '', note: '', handledBy: '' },
    { id: 'T-5528', brandId: BRAND_ID, agentId: 'A-5521', level: 'normal', status: 'processing', source: 'alipay', reason: '连续包季扣费金额与活动页展示不一致', owner: '客服一组 · 王萌', slaLeftMin: 260, time: '今天 11:47', handlePlan: '', note: '', handledBy: '' },
  ]

  // 结算单 = 种子（youdao 2 单）+ 往前 3 个月合成（brandShare=gross×58%、reserve=gross×8%，与 feeRate/reservePct 恒等）
  const settlements = [
    ...seedSettlements.filter((s) => s.brandId === BRAND_ID).map((s) => ({ id: s.id, brandId: s.brandId, period: s.period, gross: s.gross, brandShare: s.brandShare, reserve: s.reserve, status: s.status as string })),
    { id: 'S-2404-YD', brandId: BRAND_ID, period: '2026-04 月结', gross: 15340000, brandShare: 8897200, reserve: 1227200, status: 'cleared' },
    { id: 'S-2403-YD', brandId: BRAND_ID, period: '2026-03 月结', gross: 14520000, brandShare: 8421600, reserve: 1161600, status: 'cleared' },
    { id: 'S-2402-YD', brandId: BRAND_ID, period: '2026-02 月结', gross: 13780000, brandShare: 7992400, reserve: 1102400, status: 'cleared' },
  ]

  // 资源置换：镜像服务端种子（我发起-进行中 / 待我确认-可应答 / 已结算）
  const barters: DBarter[] = [
    { id: 'BD-2406-01', initiatorBrandId: BRAND_ID, counterpartyBrandId: 'mango', status: 'active', resourceType: '会员权益', myQuota: 1000000, counterpartyQuota: 1000000, invoiceStatus: 'partial', terms: JSON.stringify({ window: 'Q3', note: '词典VIP × 芒果TV 联合会员互推' }) },
    { id: 'BD-2406-02', initiatorBrandId: 'wps', counterpartyBrandId: BRAND_ID, status: 'proposed', resourceType: '广告位', myQuota: 500000, counterpartyQuota: 500000, invoiceStatus: 'pending', terms: JSON.stringify({ window: 'Q3', note: 'WPS 开屏 × 有道信息流' }) },
    { id: 'BD-2406-03', initiatorBrandId: BRAND_ID, counterpartyBrandId: 'zhihu', status: 'settled', resourceType: '流量包', myQuota: 300000, counterpartyQuota: 320000, invoiceStatus: 'done', terms: JSON.stringify({ window: 'Q2', note: '已完成结算，差额对手补开' }) },
  ]

  // 增长合约：种子全量（品牌看自己发的 / 代理看自己接的+可接挂单）+ 1 条 youdao 挂单，
  // 让「品牌发起 → 代理接单 → 双方状态联动」在同一会话内可闭环体验
  const contracts: DContract[] = [
    ...seedContracts.map((c) => ({ id: c.id, brandId: c.brandId, agentId: c.agentId, status: c.status as string, settleModel: c.settleModel as string, targetGmv: c.targetGmv, achievedGmv: c.achievedGmv, ltvWindow: c.ltvWindow as string, complaintLiability: c.complaintLiability as string, reservePct: c.reservePct, userLimit: c.userLimit, signedAt: c.signedAt })),
    { id: 'GC-2407-02', brandId: BRAND_ID, agentId: null, status: 'open', settleModel: 'floor_tiered', targetGmv: 2000000, achievedGmv: 0, ltvWindow: 'D60', complaintLiability: 'shared', reservePct: 10, userLimit: '仅新客 · 学生人群', signedAt: null },
  ]

  // 订阅商品：live 两件沿用 marketDemo 的 id 规则（PRD-youdao-N），套餐落地页询价可直接命中演示货架
  const products: DProduct[] = [
    ...B.plans.map((p, i) => ({
      id: `PRD-${BRAND_ID}-${i + 1}`, brandId: BRAND_ID, name: p.name, category: (B.category.split('/')[0] ?? '').trim() || '订阅服务',
      description: p.equity, billingCycle: 'continuous', firstPrice: p.firstPrice, renewPrice: p.renewPrice,
      defaultSharePct: 30 - i * 2, status: 'live', reviewNote: '', bundleEligible: true,
      exclusiveGroup: B.plans.length > 1 ? `${BRAND_ID}-vip` : '', tags: JSON.stringify(p.equity.split(' · ').filter(Boolean).slice(0, 2)),
    })),
    { id: `PRD-${BRAND_ID}-90`, brandId: BRAND_ID, name: '有道 AI 学习助手 连续包月', category: '工具', description: 'AI 精讲 + 语法诊断 + 学习计划', billingCycle: 'continuous', firstPrice: 19.9, renewPrice: 29.9, defaultSharePct: 26, status: 'pending', reviewNote: '', bundleEligible: true, exclusiveGroup: '', tags: JSON.stringify(['学生', 'AI']) },
    { id: `PRD-${BRAND_ID}-91`, brandId: BRAND_ID, name: '词典 VIP 学生年卡', category: '工具', description: '学生认证专享年付', billingCycle: 'yearly', firstPrice: 168, renewPrice: 168, defaultSharePct: 25, status: 'draft', reviewNote: '定价与权益描述不一致，请修订后重新提交', bundleEligible: true, exclusiveGroup: '', tags: JSON.stringify(['学生']) },
  ]

  const claims: DClaim[] = [
    { id: 'CLM-8842', agentId: AGENT_ID, brandId: 'youdao', productId: null, channel: '信息流', trackingUrl: `https://t.youdao.cps/${AGENT_ID}/e3b0c44298fc`, trackingCode: 'e3b0c44298fc', status: 'active', createdAt: nowBack(50) },
    { id: 'CLM-7731', agentId: AGENT_ID, brandId: 'wps', productId: null, channel: '短视频', trackingUrl: `https://t.youdao.cps/${AGENT_ID}/9b74c9897bac`, trackingCode: '9b74c9897bac', status: 'active', createdAt: nowBack(170) },
  ]
  const payoutReqs = [{ id: 'PR-3f81a2', agentId: AGENT_ID, amount: 120000, status: 'paid', createdAt: nowBack(200) }]

  const notifs: DNotif[] = [
    { id: 'NT-0001', scopeType: 'brand', scopeId: BRAND_ID, category: 'fund', title: '结算单已生成', body: '2026-06 上半月结算单已出，回款 ¥488.4 万', link: '/portal/brand/settlement', read: false, createdAt: nowBack(3) },
    { id: 'NT-0002', scopeType: 'brand', scopeId: BRAND_ID, category: 'ticket', title: '有新工单待处理', body: '用户投诉「iOS 端权益未同步」已派发到你的品牌', link: '/portal/brand/tickets', read: false, createdAt: nowBack(6) },
    { id: 'NT-0003', scopeType: 'brand', scopeId: BRAND_ID, category: 'contract', title: '资源置换提议待应答', body: 'WPS 向你发起 广告位 置换', link: '/portal/brand/barter', read: true, createdAt: nowBack(28) },
    { id: 'NT-1001', scopeType: 'agent', scopeId: AGENT_ID, category: 'contract', title: '合约履约推进', body: 'GC-2406-01 已进入履约中', link: '/portal/agent/contracts', read: false, createdAt: nowBack(5) },
    { id: 'NT-1002', scopeType: 'agent', scopeId: AGENT_ID, category: 'fund', title: '准备金即将释放', body: 'D30 质量期准备金 ¥20.2 万预计 07-15 释放', link: '/portal/agent/payouts', read: false, createdAt: nowBack(9) },
    { id: 'NT-1003', scopeType: 'agent', scopeId: AGENT_ID, category: 'credit', title: '信用分已更新', body: '本周信用分 932（优质），结算优先级最高档', link: '/portal/agent/credit', read: true, createdAt: nowBack(40) },
  ]

  // 开发者中心（有道续费 RSA 对接）：凭证/回调/投递日志的演示态
  const dev = {
    custId: `cust_${BRAND_ID}`, merchantId: `mch_${BRAND_ID}`,
    publicKeyHint: '3f9a1c2e' as string | null, hasPublicKey: true, keySource: 'keygen' as string | null,
    callbackUrl: 'https://brand.youdao-demo.cn/youdao/callback', apiBase: '/pay · /order/outside',
    logs: Array.from({ length: 6 }, (_, i) => {
      const fail = i === 3
      return { id: `WL-${1006 - i}`, signOrderNo: `YD2026${String(700210 - i * 13)}`, status: [2, 1, 2, 3, 2, 0][i], direction: 'outbound', httpStatus: fail ? 0 : 200, ok: !fail, error: fail ? '连接超时' : '', createdAt: nowBack(i * 11 + 2) }
    }),
  }

  return { B, A, bOrders, aOrders, tickets, settlements, barters, contracts, products, claims, payoutReqs, notifs, dev }
}
let _S: ReturnType<typeof buildStore> | null = null
const S = () => (_S ??= buildStore())

/* ── 共享小逻辑 ── */
const T_RANK: Record<string, number> = { open: 0, processing: 1, resolved: 2 }
const sortTickets = (rows: DTicket[]) => [...rows].sort((a, b) => (T_RANK[a.status] ?? 9) - (T_RANK[b.status] ?? 9) || a.slaLeftMin - b.slaLeftMin)

function replyAs(actor: 'brand' | 'agent', id: string, body: { handlePlan?: string; note?: string; status?: string }): { ok: boolean; detail: string } {
  const t = S().tickets.find((x) => x.id === id && (actor === 'brand' ? x.brandId === BRAND_ID : x.agentId === AGENT_ID))
  if (!t) return { ok: false, detail: '工单不存在或不属于你' }
  if (body.handlePlan !== undefined) t.handlePlan = body.handlePlan
  if (body.note !== undefined) t.note = body.note
  if (body.status) t.status = body.status
  if (body.status === 'resolved') t.slaLeftMin = 0 // 解决即冻结 SLA（与服务端一致）
  t.handledBy = `${actor}:${actor === 'brand' ? BRAND_ID : AGENT_ID}`
  return { ok: true, detail: DEMO_OK }
}

// 演示 PEM：形状像、内容明显是占位（不可用于真实对接）
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const pemLine = (seed: number) => Array.from({ length: 64 }, (_, i) => B64[Math.floor(rnd(i, seed) * 64)]).join('')
const fakePem = (label: string, seed: number, lines: number) => `-----BEGIN ${label}-----\nMIIBDEMOxxxxDEMOKEYxxxx${pemLine(seed).slice(0, 40)}\n${Array.from({ length: lines }, (_, i) => pemLine(seed + i + 1)).join('\n')}\n-----END ${label}-----`
let keySeq = 1

export const portalDemo = {
  /* ── 首页聚合：按当前登录 scope 分品牌/代理两套口径 ── */
  async summary(period?: { preset: string; from?: string; to?: string }): Promise<BrandSummary | AgentSummary> {
    await wait(260)
    const s = S()
    if (isAgentScope()) {
      const gmv = s.A.spendMtd * s.A.roi // 本期带单成交 ≈ 消耗×ROI
      const pool = ['youdao', 'wps', 'ximalaya', 'zhihu', 'keep']
      const share = [0.4, 0.24, 0.17, 0.12, 0.07]
      return {
        scope: 'agent', spendMtd: s.A.spendMtd, firstOrders: s.A.firstOrders, payoutPending: s.A.payoutPending,
        creditScore: s.A.creditScore, renewalRate: s.A.renewalRate, orders: s.aOrders.length,
        acceptedContracts: s.contracts.filter((c) => c.agentId === AGENT_ID).length,
        topBrands: pool.map((brandId, i) => ({ brandId, value: Math.round(gmv * share[i]) })),
        trend: trend14(gmv / 30, 7),
      }
    }
    const f = periodFactor(period)
    const periodGross = Math.round(S().B.gmvMtd * f)
    return {
      scope: 'brand', gmvMtd: s.B.gmvMtd, activeSubs: s.B.activeSubs, renewalRate: s.B.renewalRate,
      complaintRate: s.B.complaintRate, orders: s.bOrders.length,
      brandShare: Math.round(periodGross * (1 - s.B.feeRate / 100)), // 只暴露品牌回款侧
      periodGross,
      pendingTickets: s.tickets.filter((t) => t.brandId === BRAND_ID && t.status !== 'resolved').length,
      trend: trend14(s.B.gmvMtd / 30, 3),
    }
  },

  /* ── 品牌：订单（渠道脱敏 → 渠道#尾号；type=refund 合并退款+拒付） ── */
  async brandOrders(filters?: { type?: string; dateFrom?: string; dateTo?: string }) {
    await wait()
    const want = filters?.type
    return S().bOrders
      .filter((o) => !want || (want === 'refund' ? o.type === 'refund' || o.type === 'chargeback' : o.type === want))
      .map((o) => ({ id: o.id, brandId: o.brandId, plan: o.plan, type: o.type, amount: o.amount, time: o.time, channel: o.agentId ? '渠道#' + o.agentId.slice(-4) : '直营' }))
  },

  /* ── 品牌：结算单（字段白名单：gross/brandShare/reserve/status，无平台费/代理分润） ── */
  async brandSettlements(filters?: { period?: string; status?: string }) {
    await wait()
    return S().settlements.filter((s) => (!filters?.period || s.period.startsWith(filters.period)) && (!filters?.status || s.status === filters.status))
  },

  async brandOnboarding() {
    await wait(180)
    const b = S().B
    return { id: b.id, name: b.name, status: b.status, category: b.category, feeRate: b.feeRate, period: b.period, reservePct: b.reservePct, path: b.path, joinedAt: b.joinedAt }
  },

  async brandTickets() {
    await wait()
    return sortTickets(S().tickets.filter((t) => t.brandId === BRAND_ID))
  },
  async replyTicket(id: string, body: { handlePlan?: string; note?: string; status?: string }): Promise<{ ok: boolean; detail: string }> {
    await wait(180)
    return replyAs('brand', id, body)
  },
  async agentTickets() {
    await wait()
    return sortTickets(S().tickets.filter((t) => t.agentId === AGENT_ID))
  },
  async agentReplyTicket(id: string, body: { handlePlan?: string; note?: string; status?: string }): Promise<{ ok: boolean; detail: string }> {
    await wait(180)
    return replyAs('agent', id, body)
  },

  /* ── 品牌：资源置换（OR-scope + 标注我是发起方还是对手方） ── */
  async brandBarter() {
    await wait()
    return S().barters
      .filter((d) => d.initiatorBrandId === BRAND_ID || d.counterpartyBrandId === BRAND_ID)
      .map((d) => ({ ...d, iAmInitiator: d.initiatorBrandId === BRAND_ID, partner: d.initiatorBrandId === BRAND_ID ? d.counterpartyBrandId : d.initiatorBrandId }))
  },
  async proposeBarter(body: { counterpartyBrandId: string; resourceType: string; myQuota: number; counterpartyQuota: number; invoiceStatus?: string; terms?: Record<string, unknown> }): Promise<{ ok: boolean; id?: string }> {
    await wait(240)
    if (body.counterpartyBrandId === BRAND_ID) return { ok: false }
    const id = rid('BD')
    S().barters.unshift({ id, initiatorBrandId: BRAND_ID, counterpartyBrandId: body.counterpartyBrandId, status: 'proposed', resourceType: body.resourceType, myQuota: body.myQuota, counterpartyQuota: body.counterpartyQuota, invoiceStatus: body.invoiceStatus ?? 'pending', terms: JSON.stringify(body.terms ?? {}) })
    return { ok: true, id }
  },
  async respondBarter(id: string, action: 'accept' | 'reject'): Promise<{ ok: boolean; detail: string }> {
    await wait(200)
    const d = S().barters.find((x) => x.id === id)
    if (!d) return { ok: false, detail: '置换单不存在' }
    if (d.counterpartyBrandId !== BRAND_ID || d.status !== 'proposed') return { ok: false, detail: '该置换已处理或非待你应答' }
    d.status = action === 'accept' ? 'active' : 'rejected'
    return { ok: true, detail: action === 'accept' ? '已接受置换（演示）' : '已拒绝置换（演示）' }
  },

  /* ── 品牌/代理共用：增长合约（品牌看我发的；代理看我接的 + 可接挂单） ── */
  async contracts() {
    await wait()
    const rows = S().contracts
    if (isAgentScope()) return rows.filter((c) => c.agentId === AGENT_ID || (c.agentId == null && c.status === 'open'))
    return rows.filter((c) => c.brandId === BRAND_ID)
  },
  async proposeContract(body: { agentId?: string; productId?: string; settleModel: string; targetGmv?: number; ltvWindow?: string; complaintLiability?: string; reservePct?: number; userLimit?: Record<string, unknown> }): Promise<{ ok: boolean; id?: string }> {
    await wait(260)
    const id = rid('GC')
    S().contracts.unshift({ id, brandId: BRAND_ID, agentId: null, status: 'open', settleModel: body.settleModel, targetGmv: body.targetGmv ?? 0, achievedGmv: 0, ltvWindow: body.ltvWindow ?? 'D30', complaintLiability: body.complaintLiability ?? 'agent', reservePct: body.reservePct ?? 10, userLimit: JSON.stringify(body.userLimit ?? {}), signedAt: null })
    return { ok: true, id }
  },
  async claimContract(id: string): Promise<{ ok: boolean; detail: string }> {
    await wait(240)
    const c = S().contracts.find((x) => x.id === id && x.agentId == null && x.status === 'open')
    if (!c) return { ok: false, detail: '该合约不可接单（不存在 / 已被接走 / 非挂单态）' }
    c.agentId = AGENT_ID
    c.status = 'active'
    c.signedAt = isoDay(0)
    return { ok: true, detail: DEMO_OK }
  },

  /* ── 代理：选品市场（live 品牌，脱敏投放字段，按续费率降序） ── */
  async marketBrands() {
    await wait()
    return brands
      .filter((b) => b.status === 'live')
      .sort((a, b) => b.renewalRate - a.renewalRate)
      .map((b) => ({ id: b.id, name: b.name, mark: b.mark, category: b.category, feeRate: b.feeRate, period: b.period, renewalRate: b.renewalRate, complaintRate: b.complaintRate }))
  },

  async agentPayouts() {
    await wait(180)
    const a = S().A
    return { id: a.id, name: a.name, payoutPending: a.payoutPending, settledTotal: a.settledTotal, deposit: a.deposit, roi: a.roi, spendMtd: a.spendMtd }
  },
  async agentCredit() {
    await wait(180)
    const a = S().A
    return { id: a.id, name: a.name, creditScore: a.creditScore, status: a.status, refundRate: a.refundRate, complaintRate: a.complaintRate, renewalRate: a.renewalRate }
  },
  async agentPlans() {
    await wait()
    return S().aOrders.map((o) => ({ id: o.id, brandId: o.brandId, plan: o.plan, type: o.type, amount: o.amount, time: o.time }))
  },

  /* ── 代理：领取投放 / 提现 ── */
  async createClaim(body: { brandId: string; productId?: string; channel?: string }): Promise<{ ok: boolean; id?: string; trackingUrl?: string }> {
    await wait(260)
    if (!brands.some((b) => b.id === body.brandId && b.status === 'live')) return { ok: false }
    const code = Math.random().toString(36).slice(2, 14)
    const id = rid('CLM')
    const trackingUrl = `https://t.youdao.cps/${AGENT_ID}/${code}`
    S().claims.unshift({ id, agentId: AGENT_ID, brandId: body.brandId, productId: body.productId ?? null, channel: body.channel ?? '', trackingUrl, trackingCode: code, status: 'active', createdAt: new Date().toISOString() })
    return { ok: true, id, trackingUrl }
  },
  async agentClaims() {
    await wait()
    return [...S().claims]
  },
  async requestPayout(amount: number): Promise<{ ok: boolean; id?: string; detail: string }> {
    await wait(260)
    const s = S()
    const pendingTotal = s.payoutReqs.filter((r) => r.status === 'pending').reduce((a, r) => a + r.amount, 0)
    if (pendingTotal + amount > s.A.payoutPending) return { ok: false, detail: `申请金额超过可提现余额（余额 ¥${s.A.payoutPending}，已申请待审 ¥${pendingTotal}）` }
    const id = rid('PR')
    s.payoutReqs.unshift({ id, agentId: AGENT_ID, amount, status: 'pending', createdAt: new Date().toISOString() })
    return { ok: true, id, detail: '演示模式 · 提现申请已提交，等待平台审批' }
  },
  async agentPayoutRequests() {
    await wait()
    return [...S().payoutReqs]
  },

  /* ── 门户通知（按当前 scope 收窄） ── */
  async notifications() {
    await wait(160)
    const sc = scope()
    return S().notifs.filter((n) => n.scopeType === sc.scopeType && n.scopeId === sc.scopeId)
  },
  async readNotif(id: string): Promise<{ ok: boolean }> {
    const sc = scope()
    const n = S().notifs.find((x) => x.id === id && x.scopeType === sc.scopeType && x.scopeId === sc.scopeId)
    if (!n) return { ok: false }
    n.read = true
    return { ok: true }
  },

  /* ── 品牌：订阅商品（草稿→提审→上架 的演示流转） ── */
  async brandProducts() {
    await wait()
    return [...S().products]
  },
  async addBrandProduct(body: { name: string; category?: string; description?: string; billingCycle?: string; firstPrice: number; renewPrice: number; defaultSharePct?: number; bundleEligible?: boolean; exclusiveGroup?: string; tags?: string[] }): Promise<{ ok: boolean; id?: string }> {
    await wait(260)
    const id = rid('PRD')
    S().products.unshift({ id, brandId: BRAND_ID, name: body.name, category: body.category ?? '', description: body.description ?? '', billingCycle: body.billingCycle ?? 'continuous', firstPrice: body.firstPrice, renewPrice: body.renewPrice, defaultSharePct: body.defaultSharePct ?? 30, status: 'draft', reviewNote: '', bundleEligible: body.bundleEligible ?? true, exclusiveGroup: (body.exclusiveGroup ?? '').slice(0, 40), tags: JSON.stringify(body.tags ?? []) })
    return { ok: true, id }
  },
  async submitProduct(id: string): Promise<{ ok: boolean; detail: string }> {
    await wait(220)
    const p = S().products.find((x) => x.id === id && x.status === 'draft')
    if (!p) return { ok: false, detail: '仅自己的草稿商品可提交' }
    p.status = 'pending'
    p.reviewNote = ''
    return { ok: true, detail: DEMO_OK }
  },

  /* ── 品牌：开发者中心（有道续费 RSA 对接的演示态；密钥全部为示例占位） ── */
  async developer() {
    await wait(200)
    const d = S().dev
    return { custId: d.custId, merchantId: d.merchantId, publicKeyHint: d.hasPublicKey ? d.publicKeyHint : null, hasPublicKey: d.hasPublicKey, keySource: d.keySource, callbackUrl: d.callbackUrl, apiBase: d.apiBase }
  },
  async rsaKeygen(): Promise<{ ok: boolean; publicKey: string; privateKey: string; detail: string }> {
    await wait(320)
    const d = S().dev
    const seed = keySeq++
    d.hasPublicKey = true
    d.keySource = 'keygen'
    d.publicKeyHint = Array.from({ length: 8 }, (_, i) => '0123456789abcdef'[Math.floor(rnd(i, seed * 7 + 2) * 16)]).join('')
    return { ok: true, publicKey: fakePem('PUBLIC KEY', seed * 11, 3), privateKey: fakePem('PRIVATE KEY', seed * 13, 8), detail: '演示模式生成的示例密钥，不可用于真实对接' }
  },
  async rsaUpload(publicKey: string): Promise<{ ok: boolean; detail: string }> {
    await wait(220)
    if (!publicKey.includes('PUBLIC KEY')) return { ok: false, detail: '公钥格式非法（需 SPKI PEM）' }
    const d = S().dev
    let h = 0
    for (const ch of publicKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    d.hasPublicKey = true
    d.keySource = 'upload'
    d.publicKeyHint = h.toString(16).padStart(8, '0').slice(-8)
    return { ok: true, detail: '公钥已保存，可用于验签（演示）' }
  },
  async setCallbackUrl(callbackUrl: string): Promise<{ ok: boolean; detail: string }> {
    await wait(200)
    S().dev.callbackUrl = callbackUrl.slice(0, 300)
    return { ok: true, detail: '回调地址已保存（演示）' }
  },
  async webhookLogs() {
    await wait()
    return [...S().dev.logs]
  },
  async consoleSign(params: Record<string, unknown>): Promise<{ ok: boolean; stringToSign: string; algo: string; note: string }> {
    await wait(160)
    const p: Record<string, string> = {}
    for (const [k, v] of Object.entries(params ?? {})) p[k] = v == null ? '' : String(v)
    return { ok: true, stringToSign: stringToSign(p), algo: 'SHA256withRSA → base64', note: '前端用本地私钥对 stringToSign 签名，绝不上传私钥（演示模式本地拼接）' }
  },
  async healthCheck(): Promise<{ ok: boolean; score: number; readiness: string; checks: { item: string; pass: boolean; detail: string }[] }> {
    await wait(520) // 自检有「跑了一圈」的手感
    const d = S().dev
    const okLogs = d.logs.filter((l) => l.ok).length
    const checks = [
      { item: '公钥已配置且合法', pass: d.hasPublicKey, detail: d.hasPublicKey ? `指纹 ${d.publicKeyHint}` : '请生成或上传 RSA 公钥' },
      { item: '验签往返（演示私钥）', pass: d.hasPublicKey && d.keySource === 'keygen', detail: d.keySource === 'keygen' ? '密钥配对正确' : '非演示密钥时请用本端联调台本地签验证' },
      { item: '回调地址可达', pass: !!d.callbackUrl, detail: d.callbackUrl ? '探测 200（演示）' : '未配置回调地址' },
      { item: '近期回调投递成功', pass: okLogs / d.logs.length >= 0.5, detail: `${okLogs}/${d.logs.length} 成功` },
    ]
    const score = Math.round((checks.filter((c) => c.pass).length / checks.length) * 100)
    return { ok: true, score, readiness: score >= 75 ? '可上线' : score >= 50 ? '联调中' : '未就绪', checks }
  },
}
