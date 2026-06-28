// ════════════════════════════════════════════════════════════════
//  术语字典（给小白的人话解释）—— 复用 dict.ts METRICS 的公式/红线，
//  这里只补"非指标黑话"和每个词的一句白话。被 <Term> 悬停 + 操作指引共用。
// ════════════════════════════════════════════════════════════════
import { METRICS } from './dict'

export interface TermDef {
  term: string // 展示名
  plain: string // 一句人话（给小白）
  metricKey?: string // 若是指标，指向 METRICS 的 key（复用公式/红线，不重复维护）
}

export const TERMS: Record<string, TermDef> = {
  rnsc: { term: 'R-NSC', plain: '风险调整后的净订阅贡献。在订阅收入基础上扣除退款、投诉、准备金及各项成本，反映真实净增长，规避 GMV 的虚高。', metricKey: 'rnsc' },
  reversal: { term: '逆向冲账', plain: '退款或拒付发生后，将已结算给代理的分润反向扣回，避免平台垫付损失。', metricKey: 'reversal' },
  erqing: { term: '二清', plain: '平台先归集资金再转付商户，即二次清算，属违规。合规做法是资金仅走持牌机构，平台只下发清分指令。' },
  fused: { term: '号池熔断', plain: '商户号投诉率或拒付率超过阈值时，系统自动停止其进单，防止风险扩散至整个品牌。' },
  reconEq: { term: '对账恒等式', plain: '总流水 = 品牌分成 + 平台费 + 代理分润 + 准备金 + 逆向冲账，左右须严格对平，不平即资金链路异常。' },
  escalated: { term: '升级投诉率', plain: '升级至平台或监管层级的投诉占比。及时退款安抚可有效控制，超过 0.1% 需启动整改。', metricKey: 'escalated' },
  sanliu: { term: '三流一致', plain: '合同流、资金流、发票流三者口径一致，是税务与合规合规性的基础。' },
  attrHijack: { term: '归因劫持', plain: '通过虚假点击截取他人的转化归因，导致结算分润归属错误。' },
  simFarm: { term: '模拟器农场', plain: '使用大量模拟器或养号设备伪造真实用户进行刷单，属典型刷量作弊。' },
  emptyPkg: { term: '空包单 / 秒退单', plain: '发空包裹或秒级退款以制造虚假交易骗取返佣，非真实消费。' },
  chargeback: { term: '拒付', plain: '用户绕过商户直接向银行发起退款，对商户号信用的损害大于普通退款。', metricKey: 'chargeback' },
  winback: { term: 'win-back', plain: '对已流失或退订用户进行召回，促成复订。' },
  cohort: { term: '留存 cohort', plain: '按同期进入的用户分组，跟踪其在 D7/D30/D60/D90 的留存情况，衡量真实留存。' },
  reserve: { term: '风险准备金', plain: '按比例冻结部分分润，用于覆盖后续可能的退款与拒付，到期无风险后释放。', metricKey: 'reserve' },
  poolWeight: { term: '进单权重', plain: '号池向各商户号分配新订单的比例，健康商户号权重高，风险商户号降权或停止分配。' },
  close72h: { term: '72h 完结率', plain: '投诉在 72 小时内完结的占比，客服时效核心指标，要求不低于 95%。', metricKey: 'close72h' },
  flexLabor: { term: '灵活用工开票', plain: '通过持牌灵活用工平台为个人结算并开票，解决大量个人收入的税务合规问题。' },
  contract: { term: '增长合约', plain: '将商品、渠道、对价、投诉责任与违约处理等条款明确约定的品牌-渠道交易合约。' },
  barter: { term: '资源置换', plain: '双方以广告位、会员权益等资源等值交换，并双向开票各自确认收入，使其成为可入账的合规交易。' },
  ltvCac: { term: '净 LTV ÷ CAC', plain: '用户生命周期净价值与获客成本之比，大于 2 可接受，大于 3 为健康水平。', metricKey: 'ltvCac' },
}

// 取展示数据：人话 plain +（若是指标）公式/红线。
export function getTerm(key: string): { term: string; plain: string; formula?: string; redline?: string } | null {
  const t = TERMS[key]
  if (!t) return null
  const m = t.metricKey ? METRICS[t.metricKey] : undefined
  return { term: t.term, plain: t.plain, formula: m?.formula, redline: m?.redline }
}
