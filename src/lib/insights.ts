import type { StoreState } from './store'
import { brandById, MERCHANT_THRESHOLD } from './data'

// ════════════════════════════════════════════════════════════════
//  异动播报 —— 规则模板起步，从 store 派生 3 句话晨报。
//  边界：数字永远来自规则引擎（防幻觉）；INSIGHT_PROVIDER=llm 时 LLM 只改写文案不改数字。
//  每条洞察带下钻链接，可溯源到原始数据。
// ════════════════════════════════════════════════════════════════

export interface Insight {
  id: string
  text: string
  tone: 'alert' | 'warn' | 'good' | 'info'
  to: string // 下钻链接
}

export function buildInsights(s: StoreState): Insight[] {
  const out: Insight[] = []

  // 1) 号池：投诉率最高且逼近阈值的商户号。
  // 阈值必须取平台统一口径 MERCHANT_THRESHOLD（红线 1.0/预警 0.8）——此前硬编码 1.2 当红线，
  // 同一商户号在总览标"触发管控"、晨报却说"逼近阈值"，两行字互相打架。
  const risky = s.merchants.filter((m) => m.state !== 'fused').slice().sort((a, b) => b.complaintRate - a.complaintRate)[0]
  if (risky && risky.complaintRate >= MERCHANT_THRESHOLD.complaintWarn) {
    const overRed = risky.complaintRate >= MERCHANT_THRESHOLD.complaint
    out.push({
      id: 'pool',
      tone: overRed ? 'alert' : 'warn',
      text: `${brandById(risky.brandId)?.name ?? risky.brandId} 的 ${risky.id} 投诉率 ${risky.complaintRate.toFixed(2)}%，${overRed ? '已越红线，建议核查并切量' : '逼近阈值，建议关注扣费告知'}`,
      to: `/risk/incident/${risky.id}`,
    })
  }

  // 2) 资金：对账差异
  const diff = s.settlements.filter((x) => x.reconcileDiff > 0)
  if (diff.length) {
    const total = diff.reduce((a, x) => a + x.reconcileDiff, 0)
    out.push({
      id: 'recon',
      tone: 'warn',
      text: `${diff.length} 张结算单存在对账差异，合计 ¥${(total / 1e4).toFixed(1)}万，多为跨期退款冲账，建议到结算工作台逐笔核销`,
      to: '/settlement/run',
    })
  }

  // 3) 代理：风险代理
  const badAgents = s.agents.filter((a) => a.status !== 'active')
  if (badAgents.length) {
    out.push({
      id: 'agent',
      tone: 'info',
      text: `${badAgents.length} 个代理处于限流/冻结状态，最低信用分 ${Math.min(...badAgents.map((a) => a.creditScore))}，建议复核投放质量`,
      to: '/agents',
    })
  }

  // 兜底正向：都健康
  if (out.length === 0) {
    out.push({ id: 'ok', tone: 'good', text: '平台运行平稳：号池健康、对账无差异、代理均正常，今日无重点异动', to: '/' })
  }

  return out.slice(0, 3)
}
