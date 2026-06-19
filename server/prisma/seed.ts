/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'
import * as argon2 from 'argon2'
import { ROLE_PRESETS, SEED_USERS } from '../src/rbac/permissions'

const db = new PrismaClient()

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

const SETTLEMENTS = [
  { id: 'S-2406-YD', period: '2026-06 上半月', brandId: 'youdao', gross: 8420000, brandShare: 4883600, platformFee: 884100, agentPayout: 2652300, reversal: 41200, frozen: 673600, status: 'pending', reconcileDiff: 0 },
  { id: 'S-2405-XM', period: '2026-05 月结', brandId: 'ximalaya', gross: 11860000, brandShare: 6404400, platformFee: 1067400, agentPayout: 3201800, reversal: 142600, frozen: 0, status: 'reconciling', reconcileDiff: 18400 },
  { id: 'S-2405-MG', period: '2026-05 月结', brandId: 'mango', gross: 9240000, brandShare: 4804800, platformFee: 739200, agentPayout: 2217600, reversal: 196300, frozen: 0, status: 'reconciling', reconcileDiff: 31200 },
  { id: 'S-2405-YD', period: '2026-05 月结', brandId: 'youdao', gross: 16240000, brandShare: 9419200, platformFee: 1705200, agentPayout: 5115600, reversal: 86400, frozen: 0, status: 'cleared', reconcileDiff: 0 },
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
]

async function main() {
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
    await db.user.upsert({
      where: { id: u.id },
      update: { name: u.name, account: u.account, roleId: u.roleId },
      create: { id: u.id, name: u.name, account: u.account, roleId: u.roleId, passwordHash: hash },
    })
  }
  // business
  for (const b of BRANDS) await db.brand.upsert({ where: { id: b.id }, update: b, create: b })
  for (const a of AGENTS) await db.agent.upsert({ where: { id: a.id }, update: a, create: a })
  for (const m of MERCHANTS) await db.merchantAccount.upsert({ where: { id: m.id }, update: m, create: m })
  for (const s of SETTLEMENTS) await db.settlement.upsert({ where: { id: s.id }, update: s, create: s })
  for (const t of TICKETS) await db.ticket.upsert({ where: { id: t.id }, update: t, create: t })
  for (const o of ORDERS) await db.order.upsert({ where: { id: o.id }, update: o, create: o })
  await db.org.upsert({ where: { id: 'org' }, update: {}, create: { id: 'org', name: '网易有道' } })
  console.log(`Seeded: ${ROLE_PRESETS.length} roles, ${SEED_USERS.length} users, ${BRANDS.length} brands, ${AGENTS.length} agents, ${MERCHANTS.length} merchants, ${SETTLEMENTS.length} settlements, ${TICKETS.length} tickets.`)
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e)
    db.$disconnect()
    process.exit(1)
  })
