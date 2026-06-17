// ════════════════════════════════════════════════════════════════
//  领域模型 + 演示数据（贴近真实经营口径，纯前端 mock，无后端依赖）
//  注：金额为结构示意，便于演示平台能力；非真实经营数据。
// ════════════════════════════════════════════════════════════════

/* ---------- 枚举与标签 ---------- */

export type SettlePath = 'direct' | 'licensed' | 'mixed'
export const SETTLE_PATH_LABEL: Record<SettlePath, string> = {
  direct: '直连',
  licensed: '持牌分账',
  mixed: '混合',
}

export type ChannelType = 'wechat' | 'alipay' | 'bank'
export const CHANNEL_LABEL: Record<ChannelType, string> = {
  wechat: '微信支付',
  alipay: '支付宝',
  bank: '银行分账',
}

export type MerchantState =
  | 'healthy'
  | 'watch'
  | 'throttled'
  | 'paused'
  | 'fused'
// 对应支付平台对连续包月商户号的真实管控链路
export const MERCHANT_STATE: Record<
  MerchantState,
  { label: string; tone: Tone; step: number }
> = {
  healthy: { label: '健康', tone: 'good', step: 0 },
  watch: { label: '整改警告', tone: 'warn', step: 1 },
  throttled: { label: '暂停新签·7天', tone: 'warn', step: 2 },
  paused: { label: '暂停新签·21天', tone: 'alert', step: 3 },
  fused: { label: '暂停交易', tone: 'alert', step: 4 },
}

// 支付平台口径的核心指标红线（近7天累计）
export const MERCHANT_THRESHOLD = {
  complaint: 1.0, // 消费者投诉率红线
  complaintWarn: 0.6, // 平台内部预警线（早于支付平台管控）
  escalated: 0.1, // 消费者升级投诉率红线
  escalatedWarn: 0.05, // 升级投诉整改警告线
  close72h: 95, // 72h 投诉完结率达标线
  close72hWarn: 90, // 72h 完结率整改警告线
}

export type AgentStatus = 'active' | 'throttled' | 'frozen' | 'blacklist'
export const AGENT_STATUS: Record<AgentStatus, { label: string; tone: Tone }> = {
  active: { label: '正常', tone: 'good' },
  throttled: { label: '限流', tone: 'warn' },
  frozen: { label: '冻结结算', tone: 'alert' },
  blacklist: { label: '黑名单', tone: 'neutral' },
}

export type OrderType = 'first' | 'renew' | 'refund' | 'chargeback'
export const ORDER_TYPE: Record<OrderType, { label: string; tone: Tone }> = {
  first: { label: '首单', tone: 'info' },
  renew: { label: '续费', tone: 'good' },
  refund: { label: '退款', tone: 'warn' },
  chargeback: { label: '拒付', tone: 'alert' },
}

export type ComplaintSource =
  | 'platform'
  | 'channel'
  | '12315'
  | 'heimao'
  | 'appstore'
export const COMPLAINT_SOURCE: Record<ComplaintSource, string> = {
  platform: '平台内',
  channel: '支付渠道',
  '12315': '12315',
  heimao: '黑猫投诉',
  appstore: '应用商店',
}

export type ComplaintLevel = 'normal' | 'escalated' | 'regulatory'
export const COMPLAINT_LEVEL: Record<
  ComplaintLevel,
  { label: string; tone: Tone }
> = {
  normal: { label: '普通', tone: 'neutral' },
  escalated: { label: '升级投诉', tone: 'warn' },
  regulatory: { label: '监管投诉', tone: 'alert' },
}

export type ComplaintStatus =
  | 'pending'
  | 'processing'
  | 'resolved'
  | 'arbitration'
export const COMPLAINT_STATUS: Record<
  ComplaintStatus,
  { label: string; tone: Tone }
> = {
  pending: { label: '待处理', tone: 'alert' },
  processing: { label: '处理中', tone: 'info' },
  resolved: { label: '已解决', tone: 'good' },
  arbitration: { label: '仲裁中', tone: 'violet' },
}

export type SettleStatus =
  | 'pending'
  | 'cleared'
  | 'reconciling'
  | 'reversed'
  | 'frozen'
export const SETTLE_STATUS: Record<
  SettleStatus,
  { label: string; tone: Tone }
> = {
  pending: { label: '待结算', tone: 'info' },
  cleared: { label: '已结算', tone: 'good' },
  reconciling: { label: '对账中', tone: 'warn' },
  reversed: { label: '逆向冲账', tone: 'alert' },
  frozen: { label: '账期冻结', tone: 'violet' },
}

export type Tone =
  | 'good'
  | 'warn'
  | 'alert'
  | 'info'
  | 'violet'
  | 'neutral'
  | 'brand'

/* ---------- 实体类型 ---------- */

export interface Plan {
  name: string
  firstPrice: number
  renewPrice: number
  cycle: string
  autoRenew: boolean
  equity: string
}

export interface Channel {
  type: ChannelType
  direct: boolean
  rate: number // 通道扣率 %
}

export interface Brand {
  id: string
  name: string
  mark: string
  category: string
  status: 'live' | 'review' | 'paused'
  path: SettlePath
  feeRate: number // 品牌给到「平台+代理」的总分润比例 %
  period: number // 账期 T+N
  reservePct: number // 风险准备金比例 %
  thresholds: { complaint: number; escalated: number; chargeback: number }
  plans: Plan[]
  channels: Channel[]
  gmvMtd: number
  activeSubs: number
  renewalRate: number
  complaintRate: number
  escalatedRate: number
  chargebackRate: number
  joinedAt: string
}

export interface MerchantAccount {
  id: string
  brandId: string
  channel: ChannelType
  mid: string
  state: MerchantState
  complaintRate: number // 近7天投诉率 %
  escalatedRate: number // 近7天升级投诉率 %
  chargebackRate: number
  refundRate: number
  close72h: number // 72h 投诉完结率 %
  gmvMtd: number
  txCount: number
  limitUsedPct: number
  weight: number // 进单权重
}

export interface Agent {
  id: string
  name: string
  type: '个人' | '企业'
  status: AgentStatus
  creditScore: number
  spendMtd: number
  firstOrders: number
  roi: number
  renewalRate: number
  complaintRate: number
  refundRate: number
  payoutPending: number
  settledTotal: number
  deposit: number
  brandsCount: number
  joinedAt: string
  invoicing: '灵活用工' | '企业开票' | '个体户'
}

export interface Order {
  id: string
  time: string
  brandId: string
  agentId: string
  channel: ChannelType
  type: OrderType
  amount: number
  plan: string
  mid: string
}

export interface Complaint {
  id: string
  time: string
  source: ComplaintSource
  level: ComplaintLevel
  status: ComplaintStatus
  slaLeftMin: number
  brandId: string
  agentId: string
  orderId: string
  reason: string
  owner: string
}

export interface Settlement {
  id: string
  period: string
  brandId: string
  gross: number
  brandShare: number
  platformFee: number
  agentPayout: number
  reversal: number
  frozen: number
  status: SettleStatus
  reconcileDiff: number
}

/* ---------- 品牌 ---------- */

export const brands: Brand[] = [
  {
    id: 'youdao',
    name: '网易有道词典 VIP',
    mark: '有',
    category: '工具 / 知识',
    status: 'live',
    path: 'direct',
    feeRate: 42,
    period: 7,
    reservePct: 8,
    thresholds: { complaint: 1.0, escalated: 0.3, chargeback: 0.5 },
    plans: [
      { name: '词典 VIP 连续包月', firstPrice: 29.9, renewPrice: 39.9, cycle: '月', autoRenew: true, equity: '查词无广告 · 翻译额度 · 专业词库' },
      { name: '词典 VIP 连续包季', firstPrice: 88, renewPrice: 108, cycle: '季', autoRenew: true, equity: '同上 + 名师讲解' },
    ],
    channels: [
      { type: 'wechat', direct: true, rate: 0.6 },
      { type: 'alipay', direct: true, rate: 0.55 },
    ],
    gmvMtd: 8420000,
    activeSubs: 214300,
    renewalRate: 71.4,
    complaintRate: 0.42,
    escalatedRate: 0.11,
    chargebackRate: 0.18,
    joinedAt: '2024-03-01',
  },
  {
    id: 'ximalaya',
    name: '喜马拉雅 会员',
    mark: '喜',
    category: '音视频 / 泛娱乐',
    status: 'live',
    path: 'mixed',
    feeRate: 46,
    period: 15,
    reservePct: 12,
    thresholds: { complaint: 1.2, escalated: 0.35, chargeback: 0.6 },
    plans: [
      { name: '喜马拉雅 VIP 连续包月', firstPrice: 18, renewPrice: 33, cycle: '月', autoRenew: true, equity: '海量有声书 · 付费精品免费听' },
    ],
    channels: [
      { type: 'wechat', direct: false, rate: 0.6 },
      { type: 'alipay', direct: true, rate: 0.55 },
    ],
    gmvMtd: 6130000,
    activeSubs: 168900,
    renewalRate: 63.2,
    complaintRate: 0.78,
    escalatedRate: 0.22,
    chargebackRate: 0.34,
    joinedAt: '2024-07-12',
  },
  {
    id: 'mango',
    name: '芒果 TV 会员',
    mark: '芒',
    category: '音视频 / 泛娱乐',
    status: 'live',
    path: 'licensed',
    feeRate: 48,
    period: 15,
    reservePct: 14,
    thresholds: { complaint: 1.2, escalated: 0.4, chargeback: 0.7 },
    plans: [
      { name: '芒果 TV 移动会员连续包月', firstPrice: 15, renewPrice: 25, cycle: '月', autoRenew: true, equity: '热播综艺 · 1080P · 多端' },
      { name: '芒果 TV 全屏会员连续包月', firstPrice: 19.9, renewPrice: 40, cycle: '月', autoRenew: true, equity: '含 TV 端 · 4K' },
    ],
    channels: [
      { type: 'wechat', direct: false, rate: 0.6 },
      { type: 'bank', direct: false, rate: 0.45 },
    ],
    gmvMtd: 4870000,
    activeSubs: 142600,
    renewalRate: 58.7,
    complaintRate: 0.94,
    escalatedRate: 0.31,
    chargebackRate: 0.46,
    joinedAt: '2024-09-03',
  },
  {
    id: 'wps',
    name: 'WPS 超级会员',
    mark: 'W',
    category: '工具 / 知识',
    status: 'live',
    path: 'direct',
    feeRate: 40,
    period: 7,
    reservePct: 7,
    thresholds: { complaint: 0.9, escalated: 0.3, chargeback: 0.5 },
    plans: [
      { name: 'WPS 超级会员连续包月', firstPrice: 12, renewPrice: 30, cycle: '月', autoRenew: true, equity: 'PDF 转换 · 云空间 · 模板' },
    ],
    channels: [
      { type: 'wechat', direct: true, rate: 0.6 },
      { type: 'alipay', direct: true, rate: 0.55 },
    ],
    gmvMtd: 3260000,
    activeSubs: 98400,
    renewalRate: 69.1,
    complaintRate: 0.38,
    escalatedRate: 0.09,
    chargebackRate: 0.15,
    joinedAt: '2025-01-20',
  },
  {
    id: 'zhihu',
    name: '知乎 盐选会员',
    mark: '知',
    category: '工具 / 知识',
    status: 'live',
    path: 'mixed',
    feeRate: 44,
    period: 15,
    reservePct: 10,
    thresholds: { complaint: 1.0, escalated: 0.3, chargeback: 0.5 },
    plans: [
      { name: '盐选会员连续包月', firstPrice: 9.9, renewPrice: 29, cycle: '月', autoRenew: true, equity: '盐选专栏 · 付费故事 · 电子书' },
    ],
    channels: [
      { type: 'alipay', direct: true, rate: 0.55 },
      { type: 'wechat', direct: false, rate: 0.6 },
    ],
    gmvMtd: 2980000,
    activeSubs: 87200,
    renewalRate: 61.5,
    complaintRate: 0.66,
    escalatedRate: 0.19,
    chargebackRate: 0.29,
    joinedAt: '2025-02-18',
  },
  {
    id: 'meituan',
    name: '美团 神券包月',
    mark: '美',
    category: '生活服务 / 电商',
    status: 'review',
    path: 'licensed',
    feeRate: 52,
    period: 30,
    reservePct: 18,
    thresholds: { complaint: 1.5, escalated: 0.5, chargeback: 0.9 },
    plans: [
      { name: '神券包月连续包月', firstPrice: 5.9, renewPrice: 15, cycle: '月', autoRenew: true, equity: '外卖红包 · 到店券包' },
    ],
    channels: [{ type: 'wechat', direct: false, rate: 0.6 }],
    gmvMtd: 0,
    activeSubs: 0,
    renewalRate: 0,
    complaintRate: 0,
    escalatedRate: 0,
    chargebackRate: 0,
    joinedAt: '2026-06-10',
  },
  {
    id: 'keep',
    name: 'Keep 会员',
    mark: 'K',
    category: '生活服务 / 电商',
    status: 'live',
    path: 'mixed',
    feeRate: 45,
    period: 15,
    reservePct: 11,
    thresholds: { complaint: 1.1, escalated: 0.35, chargeback: 0.6 },
    plans: [
      { name: 'Keep 会员连续包月', firstPrice: 12, renewPrice: 25, cycle: '月', autoRenew: true, equity: '付费课程 · 训练计划 · 直播' },
    ],
    channels: [
      { type: 'alipay', direct: true, rate: 0.55 },
      { type: 'wechat', direct: false, rate: 0.6 },
    ],
    gmvMtd: 1840000,
    activeSubs: 54600,
    renewalRate: 64.8,
    complaintRate: 0.57,
    escalatedRate: 0.14,
    chargebackRate: 0.24,
    joinedAt: '2025-04-09',
  },
  {
    id: 'bilibili',
    name: '哔哩哔哩 大会员',
    mark: 'B',
    category: '音视频 / 泛娱乐',
    status: 'paused',
    path: 'licensed',
    feeRate: 47,
    period: 15,
    reservePct: 16,
    thresholds: { complaint: 1.2, escalated: 0.4, chargeback: 0.7 },
    plans: [
      { name: '大会员连续包月', firstPrice: 10, renewPrice: 25, cycle: '月', autoRenew: true, equity: '番剧 · 影视 · 1080P+' },
    ],
    channels: [{ type: 'wechat', direct: false, rate: 0.6 }],
    gmvMtd: 920000,
    activeSubs: 31200,
    renewalRate: 55.1,
    complaintRate: 1.34,
    escalatedRate: 0.46,
    chargebackRate: 0.72,
    joinedAt: '2025-05-22',
  },
]

/* ---------- 商户号 / 号池 ---------- */

export const merchants: MerchantAccount[] = [
  { id: 'M-YD-01', brandId: 'youdao', channel: 'wechat', mid: '15•••8842', state: 'healthy', complaintRate: 0.31, escalatedRate: 0.03, chargebackRate: 0.12, refundRate: 2.1, close72h: 98, gmvMtd: 4120000, txCount: 103200, limitUsedPct: 58, weight: 60 },
  { id: 'M-YD-02', brandId: 'youdao', channel: 'alipay', mid: '20•••1170', state: 'healthy', complaintRate: 0.38, escalatedRate: 0.04, chargebackRate: 0.16, refundRate: 2.4, close72h: 97, gmvMtd: 3210000, txCount: 80400, limitUsedPct: 49, weight: 40 },
  { id: 'M-YD-03', brandId: 'youdao', channel: 'wechat', mid: '15•••6093', state: 'watch', complaintRate: 0.71, escalatedRate: 0.07, chargebackRate: 0.28, refundRate: 3.6, close72h: 93, gmvMtd: 1090000, txCount: 27300, limitUsedPct: 33, weight: 12 },
  { id: 'M-XM-01', brandId: 'ximalaya', channel: 'alipay', mid: '20•••4456', state: 'healthy', complaintRate: 0.52, escalatedRate: 0.045, chargebackRate: 0.22, refundRate: 3.0, close72h: 96, gmvMtd: 3540000, txCount: 96100, limitUsedPct: 64, weight: 55 },
  { id: 'M-XM-02', brandId: 'ximalaya', channel: 'wechat', mid: '15•••2231', state: 'throttled', complaintRate: 0.98, escalatedRate: 0.11, chargebackRate: 0.41, refundRate: 4.7, close72h: 89, gmvMtd: 1880000, txCount: 51200, limitUsedPct: 71, weight: 18 },
  { id: 'M-MG-01', brandId: 'mango', channel: 'wechat', mid: '15•••7780', state: 'watch', complaintRate: 0.86, escalatedRate: 0.08, chargebackRate: 0.39, refundRate: 4.2, close72h: 94, gmvMtd: 2980000, txCount: 91400, limitUsedPct: 68, weight: 48 },
  { id: 'M-MG-02', brandId: 'mango', channel: 'bank', mid: '62•••0098', state: 'throttled', complaintRate: 1.07, escalatedRate: 0.09, chargebackRate: 0.52, refundRate: 5.1, close72h: 91, gmvMtd: 1610000, txCount: 49800, limitUsedPct: 55, weight: 16 },
  { id: 'M-WP-01', brandId: 'wps', channel: 'wechat', mid: '15•••3315', state: 'healthy', complaintRate: 0.33, escalatedRate: 0.025, chargebackRate: 0.13, refundRate: 1.9, close72h: 99, gmvMtd: 1980000, txCount: 61000, limitUsedPct: 44, weight: 62 },
  { id: 'M-WP-02', brandId: 'wps', channel: 'alipay', mid: '20•••9982', state: 'healthy', complaintRate: 0.41, escalatedRate: 0.035, chargebackRate: 0.17, refundRate: 2.2, close72h: 97, gmvMtd: 1280000, txCount: 39400, limitUsedPct: 37, weight: 38 },
  { id: 'M-ZH-01', brandId: 'zhihu', channel: 'alipay', mid: '20•••5540', state: 'healthy', complaintRate: 0.59, escalatedRate: 0.05, chargebackRate: 0.25, refundRate: 3.3, close72h: 96, gmvMtd: 1920000, txCount: 58900, limitUsedPct: 51, weight: 58 },
  { id: 'M-ZH-02', brandId: 'zhihu', channel: 'wechat', mid: '15•••1124', state: 'watch', complaintRate: 0.79, escalatedRate: 0.08, chargebackRate: 0.34, refundRate: 4.0, close72h: 92, gmvMtd: 1060000, txCount: 32600, limitUsedPct: 42, weight: 22 },
  { id: 'M-KP-01', brandId: 'keep', channel: 'alipay', mid: '20•••6677', state: 'healthy', complaintRate: 0.51, escalatedRate: 0.04, chargebackRate: 0.21, refundRate: 2.9, close72h: 97, gmvMtd: 1180000, txCount: 36200, limitUsedPct: 39, weight: 64 },
  { id: 'M-KP-02', brandId: 'keep', channel: 'wechat', mid: '15•••8801', state: 'watch', complaintRate: 0.68, escalatedRate: 0.06, chargebackRate: 0.3, refundRate: 3.5, close72h: 94, gmvMtd: 660000, txCount: 20300, limitUsedPct: 28, weight: 24 },
  { id: 'M-BL-01', brandId: 'bilibili', channel: 'wechat', mid: '15•••4409', state: 'fused', complaintRate: 1.34, escalatedRate: 0.21, chargebackRate: 0.72, refundRate: 6.3, close72h: 85, gmvMtd: 920000, txCount: 30100, limitUsedPct: 47, weight: 0 },
]

/* ---------- 代理商 ---------- */

export const agents: Agent[] = [
  { id: 'A-2041', name: '量子增长 工作室', type: '企业', status: 'active', creditScore: 932, spendMtd: 1840000, firstOrders: 41200, roi: 1.92, renewalRate: 68.4, complaintRate: 0.34, refundRate: 2.2, payoutPending: 486200, settledTotal: 5240000, deposit: 200000, brandsCount: 5, joinedAt: '2024-04-02', invoicing: '企业开票' },
  { id: 'A-1188', name: '星河传媒', type: '企业', status: 'active', creditScore: 901, spendMtd: 1520000, firstOrders: 33800, roi: 1.78, renewalRate: 65.1, complaintRate: 0.41, refundRate: 2.6, payoutPending: 402900, settledTotal: 4380000, deposit: 200000, brandsCount: 4, joinedAt: '2024-05-19', invoicing: '企业开票' },
  { id: 'A-3372', name: '陈航', type: '个人', status: 'active', creditScore: 868, spendMtd: 640000, firstOrders: 14600, roi: 1.64, renewalRate: 62.3, complaintRate: 0.48, refundRate: 3.0, payoutPending: 168400, settledTotal: 1290000, deposit: 30000, brandsCount: 3, joinedAt: '2024-08-11', invoicing: '灵活用工' },
  { id: 'A-2980', name: '聚效网络', type: '企业', status: 'active', creditScore: 845, spendMtd: 880000, firstOrders: 19400, roi: 1.55, renewalRate: 60.8, complaintRate: 0.56, refundRate: 3.4, payoutPending: 214600, settledTotal: 2140000, deposit: 100000, brandsCount: 4, joinedAt: '2024-10-07', invoicing: '企业开票' },
  { id: 'A-4410', name: '王梓萱', type: '个人', status: 'throttled', creditScore: 712, spendMtd: 320000, firstOrders: 8100, roi: 1.38, renewalRate: 55.2, complaintRate: 0.94, refundRate: 5.1, payoutPending: 64200, settledTotal: 540000, deposit: 30000, brandsCount: 2, joinedAt: '2025-01-15', invoicing: '个体户' },
  { id: 'A-5521', name: '极光投流', type: '企业', status: 'active', creditScore: 824, spendMtd: 760000, firstOrders: 16800, roi: 1.59, renewalRate: 61.4, complaintRate: 0.52, refundRate: 3.2, payoutPending: 192300, settledTotal: 1780000, deposit: 100000, brandsCount: 3, joinedAt: '2025-02-28', invoicing: '企业开票' },
  { id: 'A-6093', name: '刘洋', type: '个人', status: 'throttled', creditScore: 688, spendMtd: 210000, firstOrders: 5400, roi: 1.29, renewalRate: 52.7, complaintRate: 1.12, refundRate: 5.9, payoutPending: 38900, settledTotal: 312000, deposit: 30000, brandsCount: 2, joinedAt: '2025-03-22', invoicing: '灵活用工' },
  { id: 'A-7180', name: '赵琪', type: '个人', status: 'frozen', creditScore: 583, spendMtd: 90000, firstOrders: 2600, roi: 1.11, renewalRate: 47.9, complaintRate: 1.68, refundRate: 8.2, payoutPending: 0, settledTotal: 184000, deposit: 30000, brandsCount: 1, joinedAt: '2025-05-04', invoicing: '个体户' },
  { id: 'A-7799', name: '风行数字', type: '企业', status: 'active', creditScore: 856, spendMtd: 690000, firstOrders: 15200, roi: 1.62, renewalRate: 63.0, complaintRate: 0.45, refundRate: 2.8, payoutPending: 176800, settledTotal: 1560000, deposit: 100000, brandsCount: 3, joinedAt: '2025-03-30', invoicing: '企业开票' },
  { id: 'A-8420', name: '孙磊', type: '个人', status: 'blacklist', creditScore: 402, spendMtd: 0, firstOrders: 0, roi: 0, renewalRate: 0, complaintRate: 3.42, refundRate: 19.4, payoutPending: 0, settledTotal: 96000, deposit: 0, brandsCount: 0, joinedAt: '2025-06-01', invoicing: '个体户' },
]

/* ---------- 近期订单流 ---------- */

export const orders: Order[] = [
  { id: 'O-99812', time: '14:32:08', brandId: 'youdao', agentId: 'A-2041', channel: 'wechat', type: 'first', amount: 29.9, plan: '词典 VIP 连续包月', mid: 'M-YD-01' },
  { id: 'O-99811', time: '14:31:55', brandId: 'wps', agentId: 'A-1188', channel: 'alipay', type: 'renew', amount: 30, plan: 'WPS 超级会员连续包月', mid: 'M-WP-02' },
  { id: 'O-99810', time: '14:31:42', brandId: 'ximalaya', agentId: 'A-3372', channel: 'alipay', type: 'first', amount: 18, plan: '喜马拉雅 VIP 连续包月', mid: 'M-XM-01' },
  { id: 'O-99809', time: '14:31:30', brandId: 'mango', agentId: 'A-2980', channel: 'wechat', type: 'first', amount: 15, plan: '芒果 TV 移动会员连续包月', mid: 'M-MG-01' },
  { id: 'O-99808', time: '14:31:18', brandId: 'youdao', agentId: 'A-5521', channel: 'alipay', type: 'renew', amount: 39.9, plan: '词典 VIP 连续包月', mid: 'M-YD-02' },
  { id: 'O-99807', time: '14:30:59', brandId: 'zhihu', agentId: 'A-7799', channel: 'alipay', type: 'first', amount: 9.9, plan: '盐选会员连续包月', mid: 'M-ZH-01' },
  { id: 'O-99806', time: '14:30:44', brandId: 'mango', agentId: 'A-4410', channel: 'bank', type: 'refund', amount: -25, plan: '芒果 TV 移动会员连续包月', mid: 'M-MG-02' },
  { id: 'O-99805', time: '14:30:31', brandId: 'keep', agentId: 'A-5521', channel: 'alipay', type: 'first', amount: 12, plan: 'Keep 会员连续包月', mid: 'M-KP-01' },
  { id: 'O-99804', time: '14:30:12', brandId: 'youdao', agentId: 'A-2041', channel: 'wechat', type: 'first', amount: 29.9, plan: '词典 VIP 连续包月', mid: 'M-YD-01' },
  { id: 'O-99803', time: '14:29:58', brandId: 'ximalaya', agentId: 'A-6093', channel: 'wechat', type: 'chargeback', amount: -33, plan: '喜马拉雅 VIP 连续包月', mid: 'M-XM-02' },
  { id: 'O-99802', time: '14:29:41', brandId: 'wps', agentId: 'A-1188', channel: 'wechat', type: 'first', amount: 12, plan: 'WPS 超级会员连续包月', mid: 'M-WP-01' },
  { id: 'O-99801', time: '14:29:27', brandId: 'zhihu', agentId: 'A-3372', channel: 'alipay', type: 'renew', amount: 29, plan: '盐选会员连续包月', mid: 'M-ZH-01' },
  { id: 'O-99800', time: '14:29:09', brandId: 'mango', agentId: 'A-2980', channel: 'wechat', type: 'first', amount: 19.9, plan: '芒果 TV 全屏会员连续包月', mid: 'M-MG-01' },
  { id: 'O-99799', time: '14:28:52', brandId: 'keep', agentId: 'A-7799', channel: 'alipay', type: 'renew', amount: 25, plan: 'Keep 会员连续包月', mid: 'M-KP-01' },
  { id: 'O-99798', time: '14:28:36', brandId: 'youdao', agentId: 'A-5521', channel: 'alipay', type: 'first', amount: 29.9, plan: '词典 VIP 连续包月', mid: 'M-YD-02' },
  { id: 'O-99797', time: '14:28:20', brandId: 'ximalaya', agentId: 'A-3372', channel: 'alipay', type: 'first', amount: 18, plan: '喜马拉雅 VIP 连续包月', mid: 'M-XM-01' },
]

/* ---------- 投诉工单 ---------- */

export const complaints: Complaint[] = [
  { id: 'T-5521', time: '今天 13:58', source: 'heimao', level: 'escalated', status: 'pending', slaLeftMin: 42, brandId: 'mango', agentId: 'A-4410', orderId: 'O-98120', reason: '自动续费未明显告知', owner: '未分配' },
  { id: 'T-5520', time: '今天 13:41', source: '12315', level: 'regulatory', status: 'processing', slaLeftMin: 96, brandId: 'bilibili', agentId: 'A-7180', orderId: 'O-97744', reason: '退款诉求 · 诱导下单', owner: '升级组 · 李航' },
  { id: 'T-5519', time: '今天 13:22', source: 'channel', level: 'escalated', status: 'processing', slaLeftMin: 18, brandId: 'ximalaya', agentId: 'A-6093', orderId: 'O-97511', reason: '渠道侧投诉 · 扣费争议', owner: '客服二组 · 周敏' },
  { id: 'T-5518', time: '今天 12:50', source: 'platform', level: 'normal', status: 'resolved', slaLeftMin: 0, brandId: 'youdao', agentId: 'A-2041', orderId: 'O-96820', reason: '权益未到账（已补发）', owner: '客服一组 · 王萌' },
  { id: 'T-5517', time: '今天 12:14', source: 'appstore', level: 'normal', status: 'processing', slaLeftMin: 210, brandId: 'keep', agentId: 'A-5521', orderId: 'O-96233', reason: '课程无法播放', owner: '客服一组 · 陈思' },
  { id: 'T-5516', time: '今天 11:39', source: 'heimao', level: 'regulatory', status: 'arbitration', slaLeftMin: 0, brandId: 'mango', agentId: 'A-4410', orderId: 'O-95610', reason: '素材夸大宣传 · 责任待定', owner: '仲裁组 · 刘洋' },
  { id: 'T-5515', time: '今天 11:02', source: 'platform', level: 'normal', status: 'resolved', slaLeftMin: 0, brandId: 'wps', agentId: 'A-1188', orderId: 'O-95004', reason: '重复扣费（已退款）', owner: '客服二组 · 周敏' },
  { id: 'T-5514', time: '今天 10:18', source: 'channel', level: 'escalated', status: 'pending', slaLeftMin: 73, brandId: 'zhihu', agentId: 'A-3372', orderId: 'O-94320', reason: '取消订阅后仍扣费', owner: '未分配' },
  { id: 'T-5513', time: '今天 09:45', source: 'platform', level: 'normal', status: 'resolved', slaLeftMin: 0, brandId: 'youdao', agentId: 'A-5521', orderId: 'O-93770', reason: '咨询退订流程', owner: '客服一组 · 王萌' },
]

/* ---------- 清结算 ---------- */

export const settlements: Settlement[] = [
  { id: 'S-2406-YD', period: '2026-06 上半月', brandId: 'youdao', gross: 8420000, brandShare: 4883600, platformFee: 884100, agentPayout: 2652300, reversal: 41200, frozen: 673600, status: 'pending', reconcileDiff: 0 },
  { id: 'S-2406-WP', period: '2026-06 上半月', brandId: 'wps', gross: 3260000, brandShare: 1956000, platformFee: 326000, agentPayout: 978000, reversal: 12800, frozen: 228200, status: 'pending', reconcileDiff: 0 },
  { id: 'S-2405-YD', period: '2026-05 月结', brandId: 'youdao', gross: 16240000, brandShare: 9419200, platformFee: 1705200, agentPayout: 5115600, reversal: 86400, frozen: 0, status: 'cleared', reconcileDiff: 0 },
  { id: 'S-2405-XM', period: '2026-05 月结', brandId: 'ximalaya', gross: 11860000, brandShare: 6404400, platformFee: 1067400, agentPayout: 3201800, reversal: 142600, frozen: 0, status: 'reconciling', reconcileDiff: 18400 },
  { id: 'S-2405-MG', period: '2026-05 月结', brandId: 'mango', gross: 9240000, brandShare: 4804800, platformFee: 739200, agentPayout: 2217600, reversal: 196300, frozen: 0, status: 'reconciling', reconcileDiff: 31200 },
  { id: 'S-2405-ZH', period: '2026-05 月结', brandId: 'zhihu', gross: 5680000, brandShare: 3180800, platformFee: 511200, agentPayout: 1533600, reversal: 74100, frozen: 0, status: 'cleared', reconcileDiff: 0 },
  { id: 'S-2405-BL', period: '2026-05 月结', brandId: 'bilibili', gross: 2140000, brandShare: 1132200, platformFee: 192600, agentPayout: 577800, reversal: 88600, frozen: 142000, status: 'reversed', reconcileDiff: 0 },
  { id: 'S-2405-KP', period: '2026-05 月结', brandId: 'keep', gross: 3520000, brandShare: 1980000, platformFee: 316800, agentPayout: 950400, reversal: 39200, frozen: 0, status: 'cleared', reconcileDiff: 0 },
]

/* ---------- KPI / 大盘 ---------- */

export const kpi = {
  gmvMtd: 28420000,
  gmvYtd: 276100000,
  platformNetMtd: 4126000,
  netLtv: 96.4,
  cac: 41.2,
  ltvCac: 2.34,
  renewalRate: 64.7,
  complaintRate: 0.63,
  escalatedRate: 0.04,
  chargebackRate: 0.31,
  close72h: 96.4,
  reserveBalance: 7340000,
  activeSubs: 967300,
  activeAgents: 186,
  liveBrands: 6,
}

/* ---------- 时间序列（确定性，便于稳定渲染） ---------- */

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export function trend(seed: number, n: number, base: number, vol: number, drift = 0) {
  const r = seeded(seed)
  const out: number[] = []
  let v = base
  for (let i = 0; i < n; i++) {
    v = v * (1 + drift) + (r() - 0.5) * vol
    out.push(Math.max(0, v))
  }
  return out
}

export const series = {
  // 单位：元。末月 = 本月流水 28.42M（与 KPI/品牌合计一致），年累计 = 各月之和 ≈ 2.76 亿
  gmv12m: [16.8, 18.4, 19.6, 20.2, 22.4, 23.8, 21.6, 24.9, 26.3, 27.6, 26.1, 28.42].map((v) => v * 1e6),
  // 平台净收入 ≈ 各月 GMV 的 14.5%，末月 ≈ 412.6 万（与 KPI 一致）
  netRevenue12m: [2.44, 2.67, 2.84, 2.93, 3.25, 3.45, 3.13, 3.61, 3.81, 4.0, 3.78, 4.13].map(
    (v) => v * 1e6,
  ),
  complaint30d: trend(7, 30, 0.6, 0.18, 0).map((v) => +(v).toFixed(2)),
  renewalCohort: [100, 71, 58, 49, 43, 39, 36, 33, 31, 29, 28, 27],
  ltvCurve: [40, 58, 70, 79, 86, 91, 95, 98, 100, 102, 103, 104],
}

export const fundSplit = [
  { label: '直连', value: 51, tone: 'good' as Tone },
  { label: '持牌分账', value: 34, tone: 'info' as Tone },
  { label: '混合', value: 15, tone: 'violet' as Tone },
]

export const complaintBySource = [
  { label: '平台内', value: 38, tone: 'neutral' as Tone },
  { label: '支付渠道', value: 27, tone: 'info' as Tone },
  { label: '黑猫投诉', value: 18, tone: 'warn' as Tone },
  { label: '12315', value: 11, tone: 'alert' as Tone },
  { label: '应用商店', value: 6, tone: 'violet' as Tone },
]

/* ---------- 查询助手 ---------- */

export const brandById = (id: string) => brands.find((b) => b.id === id)
export const agentById = (id: string) => agents.find((a) => a.id === id)
export const merchantsByBrand = (id: string) =>
  merchants.filter((m) => m.brandId === id)

export const months12 = [
  '7月', '8月', '9月', '10月', '11月', '12月',
  '1月', '2月', '3月', '4月', '5月', '6月',
]
