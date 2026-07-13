/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'
import * as argon2 from 'argon2'
import { createHash } from 'crypto'
import { ROLE_PRESETS, SEED_USERS } from '../src/rbac/permissions'
import { DEMO_RSA_PUBLIC } from '../src/youdao/demo-keys'
import { pubHint } from '../src/youdao/rsa-signature'

const db = new PrismaClient()

// 有道对接演示凭证：固定 custId/merchantId + RSA 公钥（私钥见 demo-keys.ts，合作方自留范式）。
// 供对外文档 curl 示例与 e2e 联调直接使用；生产由合作方在「开发者中心」自助生成密钥。
const DEMO_API = {
  id: 'AK-DEMO01', brandId: 'youdao', appId: 'cps_demo_youdao',
  custId: 'cust_youdao', merchantId: 'mch_youdao',
}

// ── 业务种子数据（与前端 src/lib/data.ts 对齐的精简集） ──
const BRANDS = [
  { id: 'youdao', name: '网易有道词典 VIP', mark: '有', category: '工具 / 知识', status: 'live', path: 'direct', feeRate: 42, period: 7, reservePct: 8, gmvMtd: 8420000, activeSubs: 214300, renewalRate: 71.4, complaintRate: 0.42, joinedAt: '2024-03-01' },
  { id: 'ximalaya', name: '喜马拉雅 会员', mark: '喜', category: '音视频 / 泛娱乐', status: 'live', path: 'mixed', feeRate: 46, period: 15, reservePct: 12, gmvMtd: 6130000, activeSubs: 168900, renewalRate: 63.2, complaintRate: 0.78, joinedAt: '2024-07-12' },
  { id: 'mango', name: '芒果 TV 会员', mark: '芒', category: '音视频 / 泛娱乐', status: 'live', path: 'licensed', feeRate: 48, period: 15, reservePct: 14, gmvMtd: 4870000, activeSubs: 142600, renewalRate: 58.7, complaintRate: 0.94, joinedAt: '2024-09-03' },
  { id: 'wps', name: 'WPS 超级会员', mark: 'W', category: '工具 / 知识', status: 'live', path: 'direct', feeRate: 40, period: 7, reservePct: 7, gmvMtd: 3260000, activeSubs: 98400, renewalRate: 69.1, complaintRate: 0.38, joinedAt: '2025-01-20' },
  { id: 'zhihu', name: '知乎 盐选会员', mark: '知', category: '工具 / 知识', status: 'live', path: 'mixed', feeRate: 44, period: 15, reservePct: 10, gmvMtd: 2980000, activeSubs: 87200, renewalRate: 61.5, complaintRate: 0.66, joinedAt: '2025-02-18' },
  { id: 'meituan', name: '美团 神券包月', mark: '美', category: '生活服务 / 电商', status: 'review', path: 'licensed', feeRate: 52, period: 30, reservePct: 18, gmvMtd: 0, activeSubs: 0, renewalRate: 0, complaintRate: 0, joinedAt: '2026-06-10' },
  { id: 'keep', name: 'Keep 会员', mark: 'K', category: '生活服务 / 电商', status: 'live', path: 'mixed', feeRate: 45, period: 15, reservePct: 11, gmvMtd: 1840000, activeSubs: 54600, renewalRate: 64.8, complaintRate: 0.57, joinedAt: '2025-04-09' },
  { id: 'bilibili', name: '哔哩哔哩 大会员', mark: 'B', category: '音视频 / 泛娱乐', status: 'paused', path: 'licensed', feeRate: 47, period: 15, reservePct: 16, gmvMtd: 920000, activeSubs: 31200, renewalRate: 55.1, complaintRate: 1.34, joinedAt: '2025-05-22' },
]

const AGENTS = [
  { id: 'A-2041', name: '量子增长 工作室', type: '企业', status: 'active', creditScore: 932, spendMtd: 1840000, firstOrders: 41200, roi: 1.92, renewalRate: 68.4, complaintRate: 0.34, refundRate: 2.2, payoutPending: 486200, settledTotal: 5240000, deposit: 200000, brandsCount: 5, invoicing: '企业开票', joinedAt: '2024-04-02' },
  { id: 'A-1188', name: '星河传媒', type: '企业', status: 'active', creditScore: 901, spendMtd: 1520000, firstOrders: 33800, roi: 1.78, renewalRate: 65.1, complaintRate: 0.41, refundRate: 2.6, payoutPending: 402900, settledTotal: 4380000, deposit: 200000, brandsCount: 4, invoicing: '企业开票', joinedAt: '2024-05-19' },
  { id: 'A-3372', name: '陈航', type: '个人', status: 'active', creditScore: 868, spendMtd: 640000, firstOrders: 14600, roi: 1.64, renewalRate: 62.3, complaintRate: 0.48, refundRate: 3.0, payoutPending: 168400, settledTotal: 1290000, deposit: 30000, brandsCount: 3, invoicing: '灵活用工', joinedAt: '2024-08-11' },
  { id: 'A-4410', name: '王梓萱', type: '个人', status: 'throttled', creditScore: 712, spendMtd: 320000, firstOrders: 8100, roi: 1.38, renewalRate: 55.2, complaintRate: 0.94, refundRate: 5.1, payoutPending: 64200, settledTotal: 540000, deposit: 30000, brandsCount: 2, invoicing: '个体户', joinedAt: '2025-01-15' },
  { id: 'A-6093', name: '刘洋', type: '个人', status: 'throttled', creditScore: 688, spendMtd: 210000, firstOrders: 5400, roi: 1.29, renewalRate: 52.7, complaintRate: 1.12, refundRate: 5.9, payoutPending: 38900, settledTotal: 312000, deposit: 30000, brandsCount: 2, invoicing: '灵活用工', joinedAt: '2025-03-22' },
  { id: 'A-7180', name: '赵琪', type: '个人', status: 'frozen', creditScore: 583, spendMtd: 90000, firstOrders: 2600, roi: 1.11, renewalRate: 47.9, complaintRate: 1.68, refundRate: 8.2, payoutPending: 0, settledTotal: 184000, deposit: 30000, brandsCount: 1, invoicing: '个体户', joinedAt: '2025-05-04' },
  { id: 'A-8420', name: '孙磊', type: '个人', status: 'blacklist', creditScore: 402, spendMtd: 0, firstOrders: 0, roi: 0, renewalRate: 0, complaintRate: 3.42, refundRate: 19.4, payoutPending: 0, settledTotal: 96000, deposit: 0, brandsCount: 0, invoicing: '个体户', joinedAt: '2025-06-01' },
]

const MERCHANTS = [
  { id: 'M-YD-01', brandId: 'youdao', channel: 'wechat', mid: '15•••8842', state: 'healthy', complaintRate: 0.31, escalatedRate: 0.03, chargebackRate: 0.12, refundRate: 2.1, close72h: 98, gmvMtd: 4120000, txCount: 103200, limitUsedPct: 58, weight: 60 },
  { id: 'M-YD-03', brandId: 'youdao', channel: 'wechat', mid: '15•••6093', state: 'watch', complaintRate: 0.71, escalatedRate: 0.07, chargebackRate: 0.28, refundRate: 3.6, close72h: 93, gmvMtd: 1090000, txCount: 27300, limitUsedPct: 33, weight: 12 },
  { id: 'M-XM-02', brandId: 'ximalaya', channel: 'wechat', mid: '15•••2231', state: 'throttled', complaintRate: 0.98, escalatedRate: 0.11, chargebackRate: 0.41, refundRate: 4.7, close72h: 89, gmvMtd: 1880000, txCount: 51200, limitUsedPct: 71, weight: 18 },
  { id: 'M-MG-02', brandId: 'mango', channel: 'bank', mid: '62•••0098', state: 'throttled', complaintRate: 1.07, escalatedRate: 0.09, chargebackRate: 0.52, refundRate: 5.1, close72h: 91, gmvMtd: 1610000, txCount: 49800, limitUsedPct: 55, weight: 16 },
  { id: 'M-WP-01', brandId: 'wps', channel: 'wechat', mid: '15•••3315', state: 'healthy', complaintRate: 0.33, escalatedRate: 0.025, chargebackRate: 0.13, refundRate: 1.9, close72h: 99, gmvMtd: 1980000, txCount: 61000, limitUsedPct: 44, weight: 62 },
  { id: 'M-BL-01', brandId: 'bilibili', channel: 'wechat', mid: '15•••4409', state: 'fused', complaintRate: 1.34, escalatedRate: 0.21, chargebackRate: 0.72, refundRate: 6.3, close72h: 85, gmvMtd: 920000, txCount: 30100, limitUsedPct: 47, weight: 0 },
]

// 结算单：严格对平 gross = brandShare + reserve + platformFee + agentPayout + reversal
const SETTLEMENTS = [
  // YD/WP 启用准备金分期释放：D7 首批已释放（reserveReleased），frozen = reserve − released（守恒式 II）
  { id: 'S-2406-YD', period: '2026-06 上半月', brandId: 'youdao', gross: 8420000, brandShare: 4883600, platformFee: 601188, agentPayout: 2220412, reserve: 673600, reversal: 41200, frozen: 471520, reserveReleased: 202080, reserveClawedBack: 0, status: 'pending', reconcileDiff: 0 },
  { id: 'S-2406-WP', period: '2026-06 上半月', brandId: 'wps', gross: 3260000, brandShare: 1956000, platformFee: 221680, agentPayout: 841320, reserve: 228200, reversal: 12800, frozen: 159740, reserveReleased: 68460, status: 'pending', reconcileDiff: 0 },
  { id: 'S-2405-YD', period: '2026-05 月结', brandId: 'youdao', gross: 16240000, brandShare: 9419200, platformFee: 1159536, agentPayout: 4275664, reserve: 1299200, reversal: 86400, frozen: 1299200, status: 'cleared', reconcileDiff: 0 },
  { id: 'S-2405-XM', period: '2026-05 月结', brandId: 'ximalaya', gross: 11860000, brandShare: 6404400, platformFee: 927452, agentPayout: 2962348, reserve: 1423200, reversal: 142600, frozen: 1423200, status: 'reconciling', reconcileDiff: 18400 },
  { id: 'S-2405-MG', period: '2026-05 月结', brandId: 'mango', gross: 9240000, brandShare: 4804800, platformFee: 753984, agentPayout: 2191316, reserve: 1293600, reversal: 196300, frozen: 1293600, status: 'reconciling', reconcileDiff: 31200 },
  { id: 'S-2405-ZH', period: '2026-05 月结', brandId: 'zhihu', gross: 5680000, brandShare: 3180800, platformFee: 424864, agentPayout: 1432236, reserve: 568000, reversal: 74100, frozen: 568000, status: 'cleared', reconcileDiff: 0 },
  // BL 为 reversed 态：部分准备金已被逆向追偿（reserveClawedBack），故 frozen = reserve − clawed = 171200（守恒式 II）
  { id: 'S-2405-BL', period: '2026-05 月结', brandId: 'bilibili', gross: 2140000, brandShare: 1134200, platformFee: 170986, agentPayout: 403814, reserve: 342400, reversal: 88600, frozen: 171200, reserveClawedBack: 171200, status: 'reversed', reconcileDiff: 0 },
  { id: 'S-2405-KP', period: '2026-05 月结', brandId: 'keep', gross: 3520000, brandShare: 1936000, platformFee: 269280, agentPayout: 888320, reserve: 387200, reversal: 39200, frozen: 387200, status: 'cleared', reconcileDiff: 0 },
]

const TICKETS = [
  { id: 'T-5521', time: '今天 13:58', source: 'heimao', level: 'escalated', status: 'pending', slaLeftMin: 42, brandId: 'mango', agentId: 'A-4410', orderId: 'O-98120', reason: '自动续费未明显告知', owner: '未分配' },
  { id: 'T-5520', time: '今天 13:41', source: '12315', level: 'regulatory', status: 'processing', slaLeftMin: 96, brandId: 'bilibili', agentId: 'A-7180', orderId: 'O-97744', reason: '退款诉求 · 诱导下单', owner: '升级组 · 李航' },
  { id: 'T-5516', time: '今天 11:39', source: 'heimao', level: 'regulatory', status: 'arbitration', slaLeftMin: 18, brandId: 'mango', agentId: 'A-4410', orderId: 'O-95610', reason: '素材夸大宣传 · 责任待定', owner: '仲裁组 · 刘洋' },
  { id: 'T-5514', time: '今天 10:18', source: 'channel', level: 'escalated', status: 'pending', slaLeftMin: 73, brandId: 'zhihu', agentId: 'A-3372', orderId: 'O-94320', reason: '取消订阅后仍扣费', owner: '未分配' },
]

const ORDERS = [
  { id: 'O-99812', time: '14:32', brandId: 'youdao', agentId: 'A-2041', channel: 'wechat', type: 'first', amount: 29.9, plan: '词典 VIP 连续包月', mid: 'M-YD-01' },
  { id: 'O-99810', time: '14:31', brandId: 'ximalaya', agentId: 'A-3372', channel: 'alipay', type: 'first', amount: 18, plan: '喜马拉雅 VIP 连续包月', mid: 'M-XM-02' },
  { id: 'O-99806', time: '14:30', brandId: 'mango', agentId: 'A-4410', channel: 'bank', type: 'refund', amount: -25, plan: '芒果 TV 移动会员连续包月', mid: 'M-MG-02' },
  { id: 'O-99803', time: '14:29', brandId: 'ximalaya', agentId: 'A-6093', channel: 'wechat', type: 'chargeback', amount: -33, plan: '喜马拉雅 VIP 连续包月', mid: 'M-XM-02' },
  // 历史原始订单——被工单引用（refundTicket 据此取真实金额，不再走 DEFAULT_TICKET_AMOUNT）
  { id: 'O-98120', time: '昨天 21:14', brandId: 'mango', agentId: 'A-4410', channel: 'wechat', type: 'first', amount: 15, plan: '芒果 TV 移动会员连续包月', mid: 'M-MG-01' },
  { id: 'O-97744', time: '昨天 20:02', brandId: 'bilibili', agentId: 'A-7180', channel: 'wechat', type: 'first', amount: 10, plan: '大会员连续包月', mid: 'M-BL-01' },
  { id: 'O-97511', time: '昨天 19:33', brandId: 'ximalaya', agentId: 'A-6093', channel: 'alipay', type: 'first', amount: 18, plan: '喜马拉雅 VIP 连续包月', mid: 'M-XM-01' },
  { id: 'O-96820', time: '昨天 18:20', brandId: 'youdao', agentId: 'A-2041', channel: 'wechat', type: 'first', amount: 29.9, plan: '词典 VIP 连续包月', mid: 'M-YD-01' },
  { id: 'O-96233', time: '昨天 16:48', brandId: 'keep', agentId: 'A-5521', channel: 'alipay', type: 'first', amount: 12, plan: 'Keep 会员连续包月', mid: 'M-KP-01' },
  { id: 'O-95610', time: '昨天 15:05', brandId: 'mango', agentId: 'A-4410', channel: 'wechat', type: 'first', amount: 15, plan: '芒果 TV 移动会员连续包月', mid: 'M-MG-01' },
  { id: 'O-95004', time: '昨天 13:30', brandId: 'wps', agentId: 'A-1188', channel: 'wechat', type: 'first', amount: 12, plan: 'WPS 超级会员连续包月', mid: 'M-WP-01' },
  { id: 'O-94320', time: '昨天 11:12', brandId: 'zhihu', agentId: 'A-3372', channel: 'alipay', type: 'first', amount: 9.9, plan: '盐选会员连续包月', mid: 'M-ZH-01' },
  { id: 'O-93770', time: '昨天 09:45', brandId: 'youdao', agentId: 'A-5521', channel: 'wechat', type: 'first', amount: 29.9, plan: '词典 VIP 连续包月', mid: 'M-YD-01' },
]

// ── 订阅增长交易（新）样例数据 ──
// 增长合约：覆盖三种结算模型与不同生命周期态。本阶段仅记条款，不接入结算计算。
const CONTRACTS = [
  {
    id: 'GC-2406-01', brandId: 'youdao', agentId: 'A-2041', productId: null,
    status: 'active', settleModel: 'cps_share',
    settleParams: JSON.stringify({ agentSharePct: 38, firstPrice: 29.9 }),
    userLimit: JSON.stringify({ newOnly: true, regions: [], crowd: ['泛知识'] }),
    ltvWindow: 'D30', complaintLiability: 'agent', reservePct: 8,
    reserveReleaseRule: JSON.stringify([{ stage: 'D7_init', pct: 30 }, { stage: 'D30_quality', pct: 30 }, { stage: 'D60_renew', pct: 20 }, { stage: 'D90_renew', pct: 20 }]),
    breachRule: JSON.stringify({ shortfall: 'deduct_deposit' }),
    targetGmv: 6000000, achievedGmv: 4180000, signedAt: new Date('2026-06-01'),
  },
  {
    id: 'GC-2406-02', brandId: 'mango', agentId: 'A-1188', productId: null,
    status: 'fulfilling', settleModel: 'floor_tiered',
    settleParams: JSON.stringify({ floorGmv: 2000000, tiers: [{ over: 2000000, sharePct: 40 }, { over: 4000000, sharePct: 46 }] }),
    userLimit: JSON.stringify({ newOnly: true, regions: ['华东', '华南'], crowd: [] }),
    ltvWindow: 'D60', complaintLiability: 'shared', reservePct: 14,
    reserveReleaseRule: JSON.stringify([{ stage: 'D7_init', pct: 20 }, { stage: 'D30_quality', pct: 30 }, { stage: 'D60_renew', pct: 30 }, { stage: 'D90_renew', pct: 20 }]),
    breachRule: JSON.stringify({ shortfall: 'rollover_next' }),
    targetGmv: 5000000, achievedGmv: 2360000, signedAt: new Date('2026-06-03'),
  },
  {
    id: 'GC-2406-03', brandId: 'zhihu', agentId: null, productId: null,
    status: 'open', settleModel: 'mutual_quota',
    settleParams: JSON.stringify({ myQuota: 1000000, counterpartyQuota: 1000000, counterparty: 'wps' }),
    userLimit: JSON.stringify({ newOnly: false, regions: [], crowd: ['职场'] }),
    ltvWindow: 'D30', complaintLiability: 'brand', reservePct: 10,
    reserveReleaseRule: JSON.stringify([{ stage: 'D7_init', pct: 30 }, { stage: 'D30_quality', pct: 40 }, { stage: 'D60_renew', pct: 30 }]),
    breachRule: '',
    targetGmv: 1000000, achievedGmv: 0, signedAt: null,
  },
]

// 订阅聚合：把离散订单聚合成生命周期；userRef 为脱敏匿名标识，不含 PII。
const SUBSCRIPTIONS = [
  { id: 'SUB-90011', brandId: 'youdao', agentId: 'A-2041', productId: null, userRef: 'u_7f3a••21', plan: '词典 VIP 连续包月', status: 'active', firstOrderId: 'O-96820', startAt: new Date('2026-03-12'), currentPeriod: 4, lastRenewAt: new Date('2026-06-12'), mrr: 29.9 },
  { id: 'SUB-90012', brandId: 'wps', agentId: 'A-1188', productId: null, userRef: 'u_2b8c••55', plan: 'WPS 超级会员连续包月', status: 'active', firstOrderId: 'O-95004', startAt: new Date('2026-04-09'), currentPeriod: 3, lastRenewAt: new Date('2026-06-09'), mrr: 12 },
  { id: 'SUB-90013', brandId: 'mango', agentId: 'A-4410', productId: null, userRef: 'u_9d1e••07', plan: '芒果 TV 移动会员连续包月', status: 'churned', firstOrderId: 'O-95610', startAt: new Date('2026-05-05'), currentPeriod: 1, churnedAt: new Date('2026-06-04'), mrr: 0 },
  { id: 'SUB-90014', brandId: 'zhihu', agentId: 'A-3372', productId: null, userRef: 'u_4a6f••92', plan: '盐选会员连续包月', status: 'winback', firstOrderId: 'O-94320', startAt: new Date('2026-02-18'), currentPeriod: 2, lastRenewAt: new Date('2026-06-18'), winbackAt: new Date('2026-06-15'), mrr: 9.9 },
]

// 准备金分期释放台账：各 stage 的 amount 之和 == 对应结算单 reserve（为后续守恒校验预备）。
// 本阶段仅展示，不做释放资金动作。
const RESERVE_RELEASES = [
  // S-2406-YD reserve = 673600 → 30/30/20/20
  { id: 'RR-2406YD-1', settlementId: 'S-2406-YD', contractId: 'GC-2406-01', agentId: 'A-2041', stage: 'D7_init', amount: 202080, dueAt: new Date('2026-06-22'), status: 'released', releasedAt: new Date('2026-06-22'), releasedAmount: 202080, holdReason: '' },
  { id: 'RR-2406YD-2', settlementId: 'S-2406-YD', contractId: 'GC-2406-01', agentId: 'A-2041', stage: 'D30_quality', amount: 202080, dueAt: new Date('2026-07-15'), status: 'scheduled', releasedAmount: 0, holdReason: '' },
  { id: 'RR-2406YD-3', settlementId: 'S-2406-YD', contractId: 'GC-2406-01', agentId: 'A-2041', stage: 'D60_renew', amount: 134720, dueAt: new Date('2026-08-14'), status: 'scheduled', releasedAmount: 0, holdReason: '' },
  { id: 'RR-2406YD-4', settlementId: 'S-2406-YD', contractId: 'GC-2406-01', agentId: 'A-2041', stage: 'D90_renew', amount: 134720, dueAt: new Date('2026-09-13'), status: 'scheduled', releasedAmount: 0, holdReason: '' },
  // S-2406-WP reserve = 228200 → 30/30/20/20
  { id: 'RR-2406WP-1', settlementId: 'S-2406-WP', contractId: null, agentId: 'A-1188', stage: 'D7_init', amount: 68460, dueAt: new Date('2026-06-22'), status: 'released', releasedAt: new Date('2026-06-22'), releasedAmount: 68460, holdReason: '' },
  { id: 'RR-2406WP-2', settlementId: 'S-2406-WP', contractId: null, agentId: 'A-1188', stage: 'D30_quality', amount: 68460, dueAt: new Date('2026-07-15'), status: 'scheduled', releasedAmount: 0, holdReason: '' },
  { id: 'RR-2406WP-3', settlementId: 'S-2406-WP', contractId: null, agentId: 'A-1188', stage: 'D60_renew', amount: 45640, dueAt: new Date('2026-08-14'), status: 'frozen', releasedAmount: 0, holdReason: '投诉率逼近阈值，复核中' },
  { id: 'RR-2406WP-4', settlementId: 'S-2406-WP', contractId: null, agentId: 'A-1188', stage: 'D90_renew', amount: 45640, dueAt: new Date('2026-09-13'), status: 'scheduled', releasedAmount: 0, holdReason: '' },
]

const BARTER_DEALS = [
  { id: 'BD-2406-01', initiatorBrandId: 'youdao', counterpartyBrandId: 'mango', status: 'active', resourceType: '会员权益', myQuota: 1000000, counterpartyQuota: 1000000, invoiceStatus: 'partial', terms: JSON.stringify({ window: 'Q3', note: '词典VIP × 芒果TV 联合会员互推' }) },
  { id: 'BD-2406-02', initiatorBrandId: 'wps', counterpartyBrandId: 'youdao', status: 'proposed', resourceType: '广告位', myQuota: 500000, counterpartyQuota: 500000, invoiceStatus: 'pending', terms: JSON.stringify({ window: 'Q3', note: 'WPS 开屏 × 有道信息流' }) },
  { id: 'BD-2406-03', initiatorBrandId: 'youdao', counterpartyBrandId: 'zhihu', status: 'settled', resourceType: '流量包', myQuota: 300000, counterpartyQuota: 320000, invoiceStatus: 'done', terms: JSON.stringify({ window: 'Q2', note: '已完成结算，差额 2 万对手补开' }) },
]

// 订阅商品：覆盖 live(已上架，超市可见) / pending(待审) / draft。互斥组用于组合冲突演示。
const PRODUCTS = [
  { id: 'PRD-YD-01', brandId: 'youdao', name: '有道词典 VIP 连续包月', category: '工具', description: '词典查词无广告 + 专业词库 + AI 翻译', billingCycle: 'continuous', firstPrice: 29.9, renewPrice: 29.9, defaultSharePct: 30, status: 'live', bundleEligible: true, exclusiveGroup: 'youdao-vip', tags: JSON.stringify(['学生', '职场']) },
  { id: 'PRD-YD-02', brandId: 'youdao', name: '有道词典 VIP 年卡', category: '工具', description: '同 VIP 权益，年付更省', billingCycle: 'yearly', firstPrice: 268, renewPrice: 268, defaultSharePct: 28, status: 'live', bundleEligible: true, exclusiveGroup: 'youdao-vip', tags: JSON.stringify(['学生']) },
  { id: 'PRD-MG-01', brandId: 'mango', name: '芒果 TV 移动会员连续包月', category: '泛娱乐', description: '热剧综艺移动端畅看', billingCycle: 'continuous', firstPrice: 15, renewPrice: 19, defaultSharePct: 35, status: 'live', bundleEligible: true, exclusiveGroup: '', tags: JSON.stringify(['追剧']) },
  { id: 'PRD-XM-01', brandId: 'ximalaya', name: '喜马拉雅 VIP 连续包月', category: '泛娱乐', description: '有声书播客畅听', billingCycle: 'continuous', firstPrice: 18, renewPrice: 25, defaultSharePct: 33, status: 'live', bundleEligible: true, exclusiveGroup: '', tags: JSON.stringify(['通勤']) },
  { id: 'PRD-WP-01', brandId: 'wps', name: 'WPS 超级会员连续包月', category: '工具', description: '云存储 + PDF + 模板', billingCycle: 'continuous', firstPrice: 12, renewPrice: 30, defaultSharePct: 32, status: 'live', bundleEligible: true, exclusiveGroup: '', tags: JSON.stringify(['职场']) },
  { id: 'PRD-ZH-01', brandId: 'zhihu', name: '知乎盐选会员连续包月', category: '泛娱乐', description: '盐选专栏与小说', billingCycle: 'continuous', firstPrice: 9.9, renewPrice: 19, defaultSharePct: 30, status: 'pending', bundleEligible: true, exclusiveGroup: '', tags: JSON.stringify(['阅读']) },
  { id: 'PRD-KP-01', brandId: 'keep', name: 'Keep 会员连续包月', category: '生活服务', description: '课程 + 训练计划', billingCycle: 'continuous', firstPrice: 12, renewPrice: 25, defaultSharePct: 30, status: 'draft', bundleEligible: true, exclusiveGroup: '', tags: JSON.stringify(['健身']) },
]

// 组合优惠规则：满 2 件 9 折、满 3 件 85 折。
const BUNDLE_RULES = [
  { id: 'BR-01', name: '满 2 件享 9 折', kind: 'count_off', params: JSON.stringify({ minItems: 2, discountPct: 10 }), active: true },
  { id: 'BR-02', name: '满 3 件享 85 折', kind: 'count_off', params: JSON.stringify({ minItems: 3, discountPct: 15 }), active: true },
]

const NOTIFICATIONS = [
  { id: 'NT-0001', userId: null, scopeType: 'brand', scopeId: 'youdao', category: 'fund', title: '结算单已生成', body: '2026-06 上半月结算单已出，回款 ¥488.4 万', link: '/portal/brand/settlement', read: false },
  { id: 'NT-0002', userId: null, scopeType: 'agent', scopeId: 'A-2041', category: 'contract', title: '合约履约推进', body: 'GC-2406-01 已进入履约中', link: '/portal/agent/contracts', read: false },
  { id: 'NT-0003', userId: null, scopeType: 'platform', scopeId: null, category: 'product', title: '有新商品待审核', body: '知乎盐选会员连续包月 提交上架待审', link: '/products', read: false },
]

async function main() {
  // 安全闸：生产环境禁止灌入演示数据（含口令为 "demo" 的一批账号）。
  // 生产建首个管理员请用 `npm run bootstrap:admin`（密码从 env 注入 / 随机打印一次）。
  // 需要在生产刻意灌演示数据（如预发/沙箱）时，显式设置 SEED_DEMO=true 放行。
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO !== 'true') {
    console.error('[seed] 生产环境已拒绝灌演示数据（口令均为 "demo"）。如确需演示数据请设 SEED_DEMO=true；建管理员用 npm run bootstrap:admin。')
    process.exit(1)
  }
  console.log('Seeding…')
  // roles
  for (const r of ROLE_PRESETS) {
    await db.role.upsert({
      where: { id: r.id },
      update: { name: r.name, description: r.description, permissions: JSON.stringify(r.permissions), builtin: true },
      create: { id: r.id, name: r.name, description: r.description, permissions: JSON.stringify(r.permissions), builtin: true },
    })
  }
  // users (password "demo")
  const hash = await argon2.hash('demo')
  for (const u of SEED_USERS) {
    const scope = { scopeType: u.scopeType ?? 'platform', scopeId: u.scopeId ?? null }
    await db.user.upsert({
      where: { id: u.id },
      update: { name: u.name, account: u.account, roleId: u.roleId, ...scope },
      create: { id: u.id, name: u.name, account: u.account, roleId: u.roleId, passwordHash: hash, ...scope },
    })
  }
  // business
  for (const b of BRANDS) await db.brand.upsert({ where: { id: b.id }, update: b, create: b })
  for (const a of AGENTS) await db.agent.upsert({ where: { id: a.id }, update: a, create: a })
  for (const m of MERCHANTS) await db.merchantAccount.upsert({ where: { id: m.id }, update: m, create: m })
  // 落 agentShareSnapshot = 成交时点代理分润占比（agentPayout/gross），供退款冲账按快照计算、不随后续退款漂移。
  // 显式归零 reserveReleased/reserveClawedBack（字面量省略时）：upsert 的 update 路径不会用 create-default，
  // 否则旧库残留的释放/追偿值不会被种子重置，导致守恒式 II/III 漂移（幂等性保障）。
  for (const s of SETTLEMENTS) {
    const withSnap = {
      reserveReleased: 0, reserveClawedBack: 0,
      ...s,
      // agentPayout 已可能被历史 reversal 冲减；成交时点原始分润应还原为二者之和。
      agentShareSnapshot: s.gross > 0 ? +((s.agentPayout + (s.reversal ?? 0)) / s.gross).toFixed(6) : 0,
    }
    await db.settlement.upsert({ where: { id: s.id }, update: withSnap, create: withSnap })
  }
  for (const t of TICKETS) await db.ticket.upsert({ where: { id: t.id }, update: t, create: t })
  // Fixture 订单显式绑定原结算单，退款测试不再依赖“取品牌最新一期”的错误隐式规则。
  // SETTLEMENTS 按新到旧排列；种子里的“今天/昨天”订单属于各品牌当前展示账期。
  for (const o of ORDERS) {
    const settlementId = (o.type === 'first' || o.type === 'renew')
      ? SETTLEMENTS.find((s) => s.brandId === o.brandId)?.id ?? null
      : null
    const bound = { ...o, settlementId }
    await db.order.upsert({ where: { id: o.id }, update: bound, create: bound })
  }
  // 订阅增长交易（新）：增长合约 / 订阅聚合 / 准备金释放台账
  for (const c of CONTRACTS) await db.growthContract.upsert({ where: { id: c.id }, update: c, create: c })
  for (const s of SUBSCRIPTIONS) await db.subscription.upsert({ where: { id: s.id }, update: s, create: s })
  for (const rr of RESERVE_RELEASES) await db.reserveRelease.upsert({ where: { id: rr.id }, update: rr, create: rr })
  for (const bd of BARTER_DEALS) await db.barterDeal.upsert({ where: { id: bd.id }, update: bd, create: bd })
  for (const p of PRODUCTS) await db.product.upsert({ where: { id: p.id }, update: p, create: p })
  for (const br of BUNDLE_RULES) await db.bundleRule.upsert({ where: { id: br.id }, update: br, create: br })
  for (const n of NOTIFICATIONS) await db.notification.upsert({ where: { id: n.id }, update: n, create: n })
  // 有道对接演示凭证（youdao）：存 RSA 公钥（私钥见 demo-keys.ts 合作方自留）
  const demoCred = {
    id: DEMO_API.id, brandId: DEMO_API.brandId, appId: DEMO_API.appId,
    custId: DEMO_API.custId, merchantId: DEMO_API.merchantId,
    publicKey: DEMO_RSA_PUBLIC,
    publicKeyHash: createHash('sha256').update(DEMO_RSA_PUBLIC).digest('hex'),
    publicKeyHint: pubHint(DEMO_RSA_PUBLIC), // 单点收敛：指纹口径与 portal/校验一致
    keySource: 'keygen', status: 'active',
  }
  await db.apiCredential.upsert({ where: { id: DEMO_API.id }, update: demoCred, create: demoCred })
  await db.org.upsert({ where: { id: 'org' }, update: {}, create: { id: 'org', name: '网易有道' } })
  console.log(`Seeded: ${ROLE_PRESETS.length} roles, ${SEED_USERS.length} users, ${BRANDS.length} brands, ${AGENTS.length} agents, ${MERCHANTS.length} merchants, ${SETTLEMENTS.length} settlements, ${TICKETS.length} tickets, ${CONTRACTS.length} contracts, ${SUBSCRIPTIONS.length} subscriptions, ${RESERVE_RELEASES.length} reserve-releases, ${BARTER_DEALS.length} barter-deals, ${PRODUCTS.length} products, ${BUNDLE_RULES.length} bundle-rules, ${NOTIFICATIONS.length} notifications.`)
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e)
    db.$disconnect()
    process.exit(1)
  })
