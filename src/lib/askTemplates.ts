import type { StoreState } from './store'
import { brandById } from './data'
import { money } from './format'

// ════════════════════════════════════════════════════════════════
//  Ask 平台（模板制）—— ⌘K 里问人话，映射到预置查询模板。
//  坚决不做开放 NL2SQL：防幻觉、防越权、防注入。查询沿用提问者数据(store已按 scope 水合)。
//  每条模板：关键词匹配 → 从 store 确定性算出答案 + 下钻链接 + 所需权限点。
//  口径纪律：答案文案必须与实际计算范围一致（不许把"全部数据求和"标成"本月"——
//  这正是模板制要防的幻觉），关键词至少 2 字（单字如「退」会劫持一切含该字的输入）。
// ════════════════════════════════════════════════════════════════

export interface AskAnswer {
  question: string
  answer: string
  to: string
}
interface Template {
  kw: string[] // 命中任一关键词即匹配（≥2 字）
  label: string // 示例问法（placeholder 轮播）
  perm: string // 查看该答案所需权限点（⌘K 侧用 can() 过滤）
  run: (s: StoreState) => AskAnswer
}

export const ASK_TEMPLATES: Template[] = [
  {
    kw: ['退款', '退了多少'],
    label: '最近退了多少钱',
    perm: 'order.read',
    run: (s) => {
      const refunds = s.orders.filter((o) => o.type === 'refund' || o.type === 'chargeback')
      const total = refunds.reduce((a, o) => a + Math.abs(o.amount), 0)
      return { question: '退款金额（当前订单流）', answer: `订单流内共 ${refunds.length} 笔退款/拒付，合计 ${money(total)}`, to: '/orders' }
    },
  },
  {
    kw: ['投诉', '投诉最高', '哪个商户'],
    label: '哪个商户号投诉率最高',
    perm: 'merchant.read',
    run: (s) => {
      const m = s.merchants.slice().sort((a, b) => b.complaintRate - a.complaintRate)[0]
      return { question: '投诉率最高的商户号', answer: m ? `${brandById(m.brandId)?.name ?? m.brandId} 的 ${m.id}，投诉率 ${m.complaintRate.toFixed(2)}%` : '暂无数据', to: '/merchants' }
    },
  },
  {
    kw: ['代理', '待结算', '欠代理', '分润'],
    label: '还有多少代理分润没结',
    perm: 'agent.read',
    run: (s) => {
      const total = s.agents.reduce((a, x) => a + x.payoutPending, 0)
      const n = s.agents.filter((a) => a.payoutPending > 0).length
      return { question: '代理待结算总额', answer: `${n} 个代理待结算，合计 ${money(total)}`, to: '/settlement' }
    },
  },
  {
    kw: ['差异', '对账', '对账差异'],
    label: '现在有多少对账差异',
    perm: 'settlement.read',
    run: (s) => {
      const diffs = s.settlements.filter((x) => x.reconcileDiff > 0)
      const total = diffs.reduce((a, x) => a + x.reconcileDiff, 0)
      return { question: '当前对账差异', answer: diffs.length ? `${diffs.length} 张结算单有差异，合计 ${money(total)}` : '当前无对账差异', to: '/settlement/run' }
    },
  },
  {
    kw: ['风险', '风险代理', '冻结', '限流'],
    label: '哪些代理有风险',
    perm: 'agent.read',
    run: (s) => {
      const bad = s.agents.filter((a) => a.status !== 'active')
      return { question: '风险代理', answer: bad.length ? `${bad.length} 个代理限流/冻结：${bad.map((a) => a.name).slice(0, 3).join('、')}${bad.length > 3 ? ' 等' : ''}` : '所有代理状态正常', to: '/agents' }
    },
  },
  {
    kw: ['流水', 'gmv', '多少流水'],
    label: '各期结算流水合计多少',
    perm: 'settlement.read',
    run: (s) => {
      const total = s.settlements.reduce((a, x) => a + x.gross, 0)
      return { question: '各期结算流水合计（含历史周期）', answer: `全部结算单流水合计 ${money(total)}（跨 ${new Set(s.settlements.map((x) => x.period)).size} 个周期）`, to: '/settlement' }
    },
  },
  {
    kw: ['熔断', '停单', '暂停'],
    label: '有几个号被熔断了',
    perm: 'merchant.read',
    run: (s) => {
      const fused = s.merchants.filter((m) => m.state === 'fused')
      return { question: '熔断商户号', answer: fused.length ? `${fused.length} 个商户号已熔断：${fused.map((m) => m.id).join('、')}` : '当前无熔断商户号', to: '/merchants' }
    },
  },
]

// 判断输入是否像"问句"：含疑问词或以问法关键词开头
export function looksLikeQuestion(q: string): boolean {
  return /多少|哪个|哪些|几|吗|怎样|如何|\?|？/.test(q)
}

export function matchAsk(q: string, can?: (perm?: string) => boolean): Template | null {
  const query = q.trim().toLowerCase()
  if (!query) return null
  return ASK_TEMPLATES.find((t) => (can ? can(t.perm) : true) && t.kw.some((k) => query.includes(k.toLowerCase()))) ?? null
}
