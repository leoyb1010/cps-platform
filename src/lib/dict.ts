// ════════════════════════════════════════════════════════════════
//  口径字典（单一可信源）—— 指标定义、公式、边界
//  页面与气泡统一引用这里，避免口径漂移。枚举标签仍在 data.ts。
// ════════════════════════════════════════════════════════════════

export interface MetricDef {
  key: string
  name: string
  formula: string
  note: string
  redline?: string
}

export const METRICS: Record<string, MetricDef> = {
  ltvCac: {
    key: 'ltvCac',
    name: '净 LTV ÷ CAC（北极星）',
    formula: '净 LTV ÷ CAC',
    note: '净 LTV 已扣除退款/拒付；CAC = 投放消耗 ÷ 新增付费用户。',
    redline: '>2 可接受 · >3 健康',
  },
  netLtv: { key: 'netLtv', name: '净 LTV', formula: '生命周期累计净付费（扣退款拒付）', note: '统计窗口 12 个月，含三方权益成本。' },
  cac: { key: 'cac', name: 'CAC 获客成本', formula: '投放消耗 ÷ 新增付费用户', note: '分母按"首单付费"口径。' },
  gmvMtd: { key: 'gmvMtd', name: '本月流水 GMV', formula: '当月全部品牌扣款成交额合计（首单+续费）', note: '= 各品牌本月 GMV 之和；不含退款冲减。' },
  platformNet: { key: 'platformNet', name: '平台净收入', formula: '可分配池 − 代理分润', note: '可分配池 = GMV × 品牌费率。' },
  renewal: { key: 'renewal', name: '续费率（连续包月）', formula: '到期应续中实际续费占比', note: 'LTV 的核心驱动；按周期续费口径。' },
  complaint: {
    key: 'complaint',
    name: '消费者投诉率',
    formula: '近 7 天扣款交易投诉数 ÷ 近 7 天扣款交易数',
    note: '7 天累计口径（支付平台）。',
    redline: '< 1%（平台内部预警 0.6%）',
  },
  escalated: {
    key: 'escalated',
    name: '升级投诉率',
    formula: '升级到平台/监管的投诉占比',
    note: '及时退款+安抚可控。',
    redline: '< 0.1%（0.05–0.1% 整改警告）',
  },
  close72h: {
    key: 'close72h',
    name: '72h 投诉完结率',
    formula: '72 小时内完结的投诉占比',
    note: '客服时效的核心 KPI。',
    redline: '≥ 95%（90–95% 整改警告）',
  },
  chargeback: { key: 'chargeback', name: '拒付率', formula: '拒付笔数 ÷ 成交笔数', note: '按笔口径。' },
  reserve: { key: 'reserve', name: '风险准备金', formula: '按品牌比例对分润账期冻结', note: '覆盖退款拒付窗口（对齐渠道 30–180 天可退周期）。' },
  reversal: { key: 'reversal', name: '逆向冲账', formula: '退款/拒付反向扣减已结/未结分润', note: '代理已结分润可回收，避免平台垫损。' },
  creditScore: { key: 'creditScore', name: '代理信用分', formula: '投诉率/退款拒付/刷量/合规/纠纷 加权', note: '满分 1000；联动分润与结算优先级。' },
}

// 平台健康"红黄绿"档位
export type Health = 'green' | 'amber' | 'red'
export const HEALTH_TONE: Record<Health, 'good' | 'warn' | 'alert'> = {
  green: 'good',
  amber: 'warn',
  red: 'alert',
}
export const HEALTH_LABEL: Record<Health, string> = { green: '正常', amber: '关注', red: '告警' }
