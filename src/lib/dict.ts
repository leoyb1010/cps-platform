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
  // 北极星：不再用 GMV。R-NSC 衡量"风险调整后真正落袋的净订阅增长"。
  rnsc: {
    key: 'rnsc',
    name: 'R-NSC 风险调整后净订阅贡献（北极星）',
    formula: '首单+续费+挽回收入 − 渠道分润 − 退款 − 投诉成本 − 风险准备金 − 投流成本 − 素材成本 − 商户号风险成本',
    note: '不被 GMV 诱导：低价首月、退款、次月退订都会把首单冲掉。R-NSC 才是真正净增。部分成本项暂含估算。',
    redline: '> 0 且环比正增长',
  },
  ltvCac: {
    key: 'ltvCac',
    name: '净 LTV ÷ CAC',
    formula: '净 LTV ÷ CAC',
    note: '护栏指标。净 LTV 已扣除退款/拒付；CAC = 投放消耗 ÷ 新增付费用户。',
    redline: '>2 可接受 · >3 健康',
  },
  netLtv: { key: 'netLtv', name: '净 LTV', formula: '生命周期累计净付费（扣退款拒付）', note: '统计窗口 12 个月，含三方权益成本。' },
  cac: { key: 'cac', name: 'CAC 获客成本', formula: '投放消耗 ÷ 新增付费用户', note: '分母按"首单付费"口径。' },
  gmvMtd: { key: 'gmvMtd', name: '本月基础流水', formula: '当月全部品牌扣款成交额合计（首单+续费）', note: 'R-NSC 的收入首项；不含退款冲减。不再作为北极星单独考核。' },
  platformNet: { key: 'platformNet', name: '平台净收入', formula: '可分配池 − 代理分润', note: '可分配池 = 基础流水 × 品牌费率。' },
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
  // ── 护栏指标（与北极星 R-NSC 同屏看，防止只追规模） ──
  d7Refund: { key: 'd7Refund', name: 'D7 退款率', formula: '首单后 7 日内退款笔数 ÷ 首单笔数', note: '判断首单质量；低价拉新的真伪照妖镜。', redline: '越低越好' },
  renew30: { key: 'renew30', name: 'D30 续费率', formula: '首单后第 30 天仍在订阅占比', note: '判断是否真 LTV。' },
  renew60: { key: 'renew60', name: 'D60 续费率', formula: '首单后第 60 天仍在订阅占比', note: '中期留存。' },
  renew90: { key: 'renew90', name: 'D90 续费率', formula: '首单后第 90 天仍在订阅占比', note: '长期留存；决定准备金尾款释放。' },
  unsubPathDone: { key: 'unsubPathDone', name: '退订路径完成率', formula: '发起退订并成功完成退订占比', note: '合规体验：退订越顺畅，投诉与监管风险越低。', redline: '越高越好' },
  settleErrRate: { key: 'settleErrRate', name: '结算差错率', formula: '对账有差异的结算单占比', note: '判断平台可信度；差错即资金链路异常。', redline: '趋近 0' },
  reserveCoverage: { key: 'reserveCoverage', name: '风险准备金覆盖率', formula: '在账准备金 ÷ 待退款拒付敞口', note: '判断逆向冲账兜底能力。', redline: '≥ 100%' },
  creativeLtv: { key: 'creativeLtv', name: '素材维度 LTV', formula: '按素材归集的净 LTV', note: '判断 AIGC 素材是否真带来高质量用户（占位，待素材实验系统）。' },
}

// 平台健康"红黄绿"档位
export type Health = 'green' | 'amber' | 'red'
export const HEALTH_TONE: Record<Health, 'good' | 'warn' | 'alert'> = {
  green: 'good',
  amber: 'warn',
  red: 'alert',
}

// 资源置换的资源类型预设（UI 约束选项；后端 resourceType 仍为自由字符串）
export const BARTER_RESOURCE_TYPES = ['广告位', '会员权益', '流量包', 'Push 推送', '开屏广告', '信息流', '联名活动', '数据互通'] as const
// 置换开票状态
export const INVOICE_STATUS: { value: string; label: string }[] = [
  { value: 'pending', label: '待开票' },
  { value: 'partial', label: '部分开票' },
  { value: 'done', label: '已开票' },
]
