import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  ChevronUp,
  Download,
  AlertTriangle,
  TrendingUp,
  ShieldCheck,
  GlassWater,
  ShieldHalf,
  Sparkles,
  UsersRound,
  ScrollText,
} from 'lucide-react'
import { Card, CardTitle, Badge, Button, Segmented, CountUp, BrandMark, PageHeader, Stat, TONE } from '../components/ui/primitives'
import { CrosshairChart, Meter } from '../components/ui/charts'
import { Confirm, useToast } from '../components/ui/overlays'
import { EmptyState } from '../components/ui/forms'
import { Term } from '../components/ui/Term'
import { useViewMode } from '../lib/prefs'
import { useAuth, useCan } from '../lib/auth'
import { isRealApi } from '../lib/http'
import { ROLE_EXPERIENCE, resolveDashboardTarget } from '../lib/roleExperience'
import {
  useStore,
  selectRisk,
  selectActions,
  resolveTicketWithRefund,
  runScenario,
  resetStore,
  type ActionItem,
} from '../lib/store'
import { HEALTH_TONE } from '../lib/dict'
import { buildInsights } from '../lib/insights'
import {
  kpi,
  series,
  months12,
  brandById,
  ORDER_TYPE,
  MERCHANT_STATE,
  MERCHANT_THRESHOLD,
  AGENT_STATUS,
  CHANNEL_LABEL,
} from '../lib/data'
import { money, pct, int, cx, csvCell, downloadText } from '../lib/format'

const wan = (n: number) => '¥' + Math.round(n / 1e4).toLocaleString('zh-CN') + '万'
const rev = (d: number) => ({ animation: `revUpSm .4s ${(d * 0.55).toFixed(2)}s cubic-bezier(.22,1,.36,1) both` })
type Range = 'today' | 'week' | 'month' | 'quarter'
const RANGE_LABEL: Record<Range, string> = { today: '今日', week: '本周', month: '本月', quarter: '本季' }

// 导出用派生值：真实模式无来源的指标以 '—' 导出，绝不把 data.ts 静态假值写进报表文件。
interface ExportKpis {
  gmvBase: number
  netMtd: number | null
  ltvCac: number | null
  renewal: number | null
  complaintRate: number | null
  rnsc: number | null
}
function exportCsv(range: Range, k: ExportKpis) {
  const dash = (v: number | null, fmt: (n: number) => string) => (v === null ? '—' : fmt(v))
  const rows = [
    ['指标', '数值', '口径'],
    ['R-NSC 风险调整后净订阅贡献', dash(k.rnsc, money), '北极星 · 含估算成本项'],
    [`${RANGE_LABEL[range]}基础流水`, money(k.gmvBase * RANGE_SCALE[range]), 'R-NSC 收入首项 · 扣款成交额'],
    ['净 LTV÷CAC', dash(k.ltvCac, (n) => n.toFixed(2)), '护栏指标'],
    ['平台净收入（本月）', dash(k.netMtd, money), '可分配池−代理分润'],
    ['续费率', dash(k.renewal, pct), '连续包月'],
    ['综合投诉率', dash(k.complaintRate, pct), '近7天累计'],
  ]
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n')
  downloadText(`经营总览-${RANGE_LABEL[range]}.csv`, csv) // downloadText 已带 BOM，勿再手动前置
}

// R-NSC 北极星（唯一口径）：直接取 data.ts kpi.rnscMtd（RNSC_BREAKDOWN ∑ 恰等，部分项含估算系数），
// 按区间用与基础流水相同的系数折算——不再本地估算成本项，避免与归因页权威值口径打架。
const RANGE_SCALE: Record<Range, number> = { today: 1 / 30, week: 1 / 4, month: 1, quarter: 3 }
function rnscOf(range: Range): number {
  return Math.round(kpi.rnscMtd * RANGE_SCALE[range])
}

export default function Dashboard() {
  const s = useStore()
  const nav = useNavigate()
  const user = useAuth()
  const toast = useToast()
  const [range, setRange] = useState<Range>('month')
  const [confirmTicket, setConfirmTicket] = useState<string | null>(null)

  const risk = selectRisk(s)
  const actions = selectActions(s)
  const mode = useViewMode()
  const can = useCan()
  const expert = mode === 'expert'
  const roleId = user?.roleId ?? 'super'
  const experience = ROLE_EXPERIENCE[roleId]
  const fullOverview = experience.fullOverview === true
  const readOnly = experience.readOnly === true
  const visibleActions = actions.flatMap((action) => {
    const to = resolveDashboardTarget(action.to, can)
    return to ? [{ ...action, to }] : []
  })
  const visibleRisk = risk.flatMap((signal) => {
    const to = resolveDashboardTarget(signal.to, can)
    return to ? [{ ...signal, to }] : []
  })
  // 资金动作权限门控：立即退款走 resolveTicketWithRefund（工单退款）→ 需 ticket.handle。
  // 总览无 RequirePerm（人人可看），但资金按钮不能对 audit/finance 等无权角色渲染。
  const canRefund = can('ticket.handle')
  const overall = visibleRisk.some((r) => r.health === 'red') ? 'red' : visibleRisk.some((r) => r.health === 'amber') ? 'amber' : 'green'

  const gmvScale = RANGE_SCALE[range]
  // 基础流水：真实模式从号池/品牌派生（∑ brands.gmvMtd），不再用 data.ts 静态 kpi.gmvMtd。
  // 派生值本身是"本月"口径，再乘区间系数与演示态保持一致。
  const gmvMtdReal = s.brands.reduce((x, b) => x + (b.gmvMtd ?? 0), 0)
  const gmvBase = isRealApi ? gmvMtdReal : kpi.gmvMtd
  const gmvShown = gmvBase * gmvScale
  // 续费率：真实模式按品牌 GMV 加权平均（brands.renewalRate 经 hydrate 覆盖）。
  const renewalReal = (() => {
    const w = s.brands.reduce((x, b) => x + (b.gmvMtd ?? 0), 0)
    if (!w) return null
    return s.brands.reduce((x, b) => x + (b.renewalRate ?? 0) * (b.gmvMtd ?? 0), 0) / w
  })()
  const renewalShown = isRealApi ? renewalReal : kpi.renewalRate
  // 准备金余额：真实模式取 ∑ settlements.frozen（在账冻结额）。
  const reserveReal = s.settlements.reduce((x, st) => x + (st.frozen ?? 0), 0)
  const reserveShown = isRealApi ? reserveReal : kpi.reserveBalance
  // 平台净收入 / R-NSC / 环比 delta / 12 月时序：无 store 来源也无后端聚合端点 → 真实模式显示"—"/空图。
  const netMtdShown = isRealApi ? null : kpi.platformNetMtd
  const ltvCacShown = isRealApi ? null : kpi.ltvCac
  const rnscShown = isRealApi ? null : kpi.rnscMtd
  const showDelta = !isRealApi // 无上期基数，真实模式不显示写死的环比
  const gmv12mReal = isRealApi ? [] : series.gmv12m
  const net12mReal = isRealApi ? [] : series.netRevenue12m
  // 综合投诉率：真实模式从号池加权（∑ complaint*tx / ∑ tx）派生，无号池则 null。
  const complaintRateReal = (() => {
    const tx = s.merchants.reduce((x, m) => x + (m.txCount ?? 0), 0)
    if (!tx) return null
    return s.merchants.reduce((x, m) => x + (m.complaintRate ?? 0) * (m.txCount ?? 0), 0) / tx
  })()
  const complaintRateShown = isRealApi ? complaintRateReal : kpi.complaintRate

  const atRisk = s.merchants.filter((m) => m.state !== 'healthy').sort((a, b) => b.complaintRate - a.complaintRate).slice(0, 4)
  const liveBrands = s.brands.filter((b) => b.status === 'live').sort((a, b) => b.gmvMtd - a.gmvMtd).slice(0, 4)
  // 投诉率大盘：从号池明细派生峰值（不再硬编码 KPI 静态值，避免与风险条「最高投诉率」自相矛盾）
  const peakComplaint = s.merchants.length ? Math.max(...s.merchants.map((m) => m.complaintRate)) : 0
  const peakEsc = s.merchants.length ? Math.max(...s.merchants.map((m) => m.escalatedRate)) : 0
  const peakChargeback = s.merchants.length ? Math.max(...s.merchants.map((m) => m.chargebackRate)) : 0
  const toneOf = (v: number, red: number, amber: number): 'good' | 'warn' | 'alert' => (v >= red ? 'alert' : v >= amber ? 'warn' : 'good')
  const complaintTone = toneOf(peakComplaint, MERCHANT_THRESHOLD.complaint, MERCHANT_THRESHOLD.complaintWarn)
  const maxBrandGmv = Math.max(1, ...liveBrands.map((b) => b.gmvMtd))
  const anomalies = s.orders.filter((o) => o.type === 'refund' || o.type === 'chargeback').slice(0, 6)
  const agentRisk = s.agents.filter((a) => a.status !== 'active')
  const activeAgents = s.agents.filter((a) => a.status === 'active').length
  const liveBrandCount = s.brands.filter((b) => b.status === 'live').length
  const agentPending = s.agents.reduce((x, a) => x + a.payoutPending, 0)
  const pendingSettlements = s.settlements.filter((x) => x.status === 'pending' || x.status === 'reconciling')
  const reconcileDiffTotal = s.settlements.reduce((sum, x) => sum + x.reconcileDiff, 0)
  const unresolvedTickets = s.complaints.filter((x) => x.status !== 'resolved')
  const urgentTickets = unresolvedTickets.filter((x) => x.slaLeftMin > 0 && x.slaLeftMin <= 30)
  const controlledMerchants = s.merchants.filter((x) => x.state !== 'healthy')
  const orderGross = s.orders.reduce((sum, x) => sum + x.amount, 0)

  if (roleId === 'teamadmin') return <TeamAdminHome onOpen={nav} />

  return (
    <>
      {/* header */}
      <div style={rev(0.04)} className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5"><span className="h-[7px] w-[7px] bg-brand" /><span className="text-[11px] font-semibold tracking-[0.14em] text-brand">{experience.eyebrow}</span></div>
          <h1 className="t-h1 mt-2 text-ink">{experience.title}</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{experience.description}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:shrink-0">
          {fullOverview && <Segmented value={range} onChange={setRange} options={[{ value: 'today', label: '今日' }, { value: 'week', label: '本周' }, { value: 'month', label: '本月' }, { value: 'quarter', label: '本季' }]} />}
          {fullOverview && <Button className="max-sm:flex-1" variant="ghost" busyMs={420} onClick={() => { exportCsv(range, { gmvBase, netMtd: netMtdShown, ltvCac: ltvCacShown, renewal: renewalShown, complaintRate: complaintRateShown, rnsc: rnscShown }); toast({ tone: 'good', text: '报表已导出 CSV' }) }}><Download size={15} /> 导出报表</Button>}
          <Button className="max-sm:flex-1" variant="primary" onClick={() => nav(experience.primaryTo)}>{experience.primaryLabel} <ArrowRight size={15} /></Button>
        </div>
      </div>

      {/* 简洁模式：把「今天要处理什么」放在最显眼处——新人打开先看行动，不看数字。 */}
      {!expert && (
        <Card data-coach="todo" style={rev(0.06)} className="mb-4 border-brand/20 bg-brand-soft/30">
          <CardTitle
            title={readOnly ? '需要核查的事项' : '今天要处理的事'}
            desc={readOnly ? '仅显示你有权查看的异常，点击进入只读明细' : '仅显示当前角色可处理的事项，点击直达对应工作台'}
            right={<Badge tone={visibleActions.length ? 'alert' : 'good'} dot>{visibleActions.length ? `${visibleActions.length} 件${readOnly ? '待核查' : '待办'}` : '已清空'}</Badge>}
          />
          {visibleActions.length === 0 ? (
            <EmptyState art="all-clear" title={readOnly ? '暂无需要核查的异常' : '当前角色暂无待办'} desc="新的相关事项会自动出现在这里" />
          ) : (
            <div className="flex flex-col gap-2">
              {visibleActions.slice(0, 3).map((a) => (
                <ActionRow key={a.id} a={a} actionLabel={readOnly ? '查看' : '处理'} onRefund={canRefund && a.ticketId ? () => setConfirmTicket(a.ticketId!) : undefined} onOpen={() => nav(a.to)} />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* 演示剧本（一键触发联动）· 仅专家模式 + 演示数据（真实模式隐藏：重置会覆盖服务端真值，退款剧本会触发真实冲账） */}
      {expert && fullOverview && !isRealApi && (
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line bg-surface-muted px-3 py-2 text-[12px]">
        <span className="font-medium text-ink-2">演示剧本</span>
        <button onClick={() => { runScenario('crisis'); toast({ tone: 'alert', text: '保号危机：M-XM-02 暂停新签' }) }} className="rounded-md bg-surface px-2.5 py-1 font-medium text-ink-2 ring-1 ring-line hover:ring-brand hover:text-brand">保号危机</button>
        <button onClick={() => { runScenario('refund'); toast({ tone: 'good', text: '升级投诉已退款并冲账' }) }} className="rounded-md bg-surface px-2.5 py-1 font-medium text-ink-2 ring-1 ring-line hover:ring-brand hover:text-brand">退款闭环</button>
        <button onClick={() => { runScenario('reconcile'); toast({ tone: 'good', text: '对账差异已核销' }) }} className="rounded-md bg-surface px-2.5 py-1 font-medium text-ink-2 ring-1 ring-line hover:ring-brand hover:text-brand">月结对账</button>
        <button onClick={() => { runScenario('fraud'); toast({ tone: 'warn', text: '代理 A-4410 已冻结结算' }) }} className="rounded-md bg-surface px-2.5 py-1 font-medium text-ink-2 ring-1 ring-line hover:ring-brand hover:text-brand">代理刷量</button>
        <button onClick={() => { resetStore(); toast({ tone: 'info', text: '数据已重置' }) }} className="ml-auto rounded-md px-2.5 py-1 font-medium text-ink-4 hover:text-ink">重置数据</button>
      </div>
      )}

      {/* 异动播报：规则模板生成的 3 句话晨报，每句可下钻。数字来自规则引擎（防幻觉）。 */}
      <DailyBrief nav={nav} can={can} showAllClear={fullOverview} />

      {/* ───────── 层 1 · 风险与行动 ───────── */}
      {visibleRisk.length > 0 && <Card style={rev(0.08)}>
        <CardTitle
          title={fullOverview ? '平台健康' : '职责范围健康'}
          desc="仅展示当前角色有权查看的风险信号"
          right={<Badge tone={HEALTH_TONE[overall]} dot>{overall === 'red' ? '有告警' : overall === 'amber' ? '需关注' : '全部正常'}</Badge>}
        />
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
          {visibleRisk.map((r) => (
            <Link key={r.key} to={r.to} className="group rounded-lg border border-line px-3 py-2.5 transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-line-strong hover:bg-surface-muted hover:shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3"><span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--color-${HEALTH_TONE[r.health]})` }} />{r.label}</div>
              <div className={cx('tnum mt-1 text-[16px] font-semibold', TONE[HEALTH_TONE[r.health]].ink)}>{r.value}</div>
            </Link>
          ))}
        </div>
      </Card>}

      {expert && fullOverview && (
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 行动中心 —— 专家模式完整展示；简洁模式已在顶部「今天要处理的事」呈现，此处不重复 */}
        <Card style={rev(0.12)} className="lg:col-span-2">
          <CardTitle title={readOnly ? '待核查事项' : '今日待办'} desc={readOnly ? '只读查看异常明细' : '需人工处理事项 · 支持一键操作'} right={<Badge tone={visibleActions.length ? 'alert' : 'good'}>{visibleActions.length ? `${visibleActions.length} 项${readOnly ? '待核查' : '待办'}` : '已清空'}</Badge>} />
          {visibleActions.length === 0 ? (
            <EmptyState art="all-clear" title={readOnly ? '暂无需要核查的异常' : '当前角色暂无待办'} desc="新的相关事项会自动出现在这里" />
          ) : (
            <div className="flex flex-col gap-2">
              {visibleActions.map((a) => (
                <ActionRow key={a.id} a={a} actionLabel={readOnly ? '查看' : '处理'} onRefund={canRefund && a.ticketId ? () => setConfirmTicket(a.ticketId!) : undefined} onOpen={() => nav(a.to)} />
              ))}
            </div>
          )}
        </Card>

        {/* 实时联动 / 活动流 —— 证明跨模块联动 */}
        <Card style={rev(0.16)} pad={false} className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-5 pt-5 pb-3">
            <span className="h-[7px] w-[7px] bg-brand" />
            <h3 className="text-[14px] font-semibold">实时联动</h3>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-good-ink"><span className="h-1.5 w-1.5 rounded-full bg-good" style={{ animation: 'blink 1.6s ease-in-out infinite' }} />事件流</span>
          </div>
          {s.activity.length === 0 ? (
            <EmptyState art="no-data" title="暂无联动事件" desc="处理待办后，跨模块链路会实时记录在这里" />
          ) : (
            <div className="max-h-[230px] overflow-y-auto px-3 py-2">
              {s.activity.map((it) => (
                <div key={it.id} className="flex items-start gap-2.5 rounded-md px-2.5 py-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `var(--color-${it.tone === 'neutral' ? 'ink-4' : it.tone})` }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] leading-snug text-ink-2">{it.text}</div>
                    <div className="tnum text-[10.5px] text-ink-5">{it.t}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      )}

      {/* ───────── 层 2 · 北极星与经营健康 ───────── */}
      {roleId === 'finance' ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card mark><Stat label="待结算 / 对账中" value={`${pendingSettlements.length} 单`} sub={<span>涉及流水 {money(pendingSettlements.reduce((sum, x) => sum + x.gross, 0))}</span>} /></Card>
          <Card mark><Stat label="待核销差异" value={money(reconcileDiffTotal)} sub={<span className={reconcileDiffTotal > 0 ? 'text-warn-ink' : 'text-good-ink'}>{reconcileDiffTotal > 0 ? '需逐笔核对' : '当前无差异'}</span>} /></Card>
          <Card mark><Stat label="在账冻结准备金" value={money(reserveShown)} sub={<span>按风险窗口释放</span>} /></Card>
        </div>
      ) : roleId === 'risk' ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card mark><Stat label="未完结工单" value={`${unresolvedTickets.length} 起`} sub={<span className={urgentTickets.length ? 'text-alert-ink' : 'text-good-ink'}>{urgentTickets.length ? `${urgentTickets.length} 起 SLA 临期` : '暂无 SLA 临期'}</span>} /></Card>
          <Card mark><Stat label="受控商户号" value={`${controlledMerchants.length} 个`} sub={<span>限流 / 暂停 / 熔断</span>} /></Card>
          <Card mark><Stat label="最高投诉率" value={pct(peakComplaint)} sub={<span className={complaintTone === 'alert' ? 'text-alert-ink' : complaintTone === 'warn' ? 'text-warn-ink' : 'text-good-ink'}>{complaintTone === 'alert' ? '已越红线' : complaintTone === 'warn' ? '逼近红线' : '当前正常'}</span>} /></Card>
        </div>
      ) : roleId === 'ops' ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card mark><Stat label="在营品牌" value={`${liveBrandCount} 个`} sub={<span>当前可投品牌</span>} /></Card>
          <Card mark><Stat label="活跃代理" value={`${activeAgents} 个`} sub={<span>{agentRisk.length} 个需复核</span>} /></Card>
          <Card mark><Stat label="已加载订单" value={`${int(s.orders.length)} 笔`} sub={<span>净流水 {money(orderGross)}</span>} /></Card>
        </div>
      ) : <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Kpi d={0.2} label={`${RANGE_LABEL[range]}基础流水`} value={<CountUp to={gmvShown / 1e4} decimals={1} prefix="¥" suffix="万" group={false} />} delta={showDelta ? '+12.4%' : undefined} sub={isRealApi ? 'R-NSC 收入首项 · 扣款成交额' : `R-NSC 收入首项 · 年累计 ${money(kpi.gmvYtd)}`}>
          <MiniSpark data={gmv12mReal} tone="brand" delay={0.4} />
        </Kpi>
        <Kpi d={0.24} label="平台净收入（本月）" value={netMtdShown === null ? <span className="text-ink-4">—</span> : <CountUp to={netMtdShown / 1e4} decimals={1} prefix="¥" suffix="万" group={false} />} delta={showDelta ? '+9.1%' : undefined} sub={isRealApi ? '待接入净收入聚合' : '占基础流水 14.5%'}>
          <MiniSpark data={net12mReal} tone="neutral" delay={0.5} />
        </Kpi>
        <Kpi d={0.28} label="续费率（连续包月）" value={renewalShown === null ? <span className="text-ink-4">—</span> : <CountUp to={renewalShown} decimals={1} suffix="%" />} delta={showDelta ? '+1.6个百分点' : undefined} sub={`准备金 ${money(reserveShown)}`}>
          <Meter value={renewalShown ?? 0} tone="brand" animate delay={0.56} />
        </Kpi>
      </div>}

      {/* 趋势图 + 北极星仪表 + 层3 供需/风险详情 —— 仅专家模式（简洁模式到此为止） */}
      {expert && fullOverview && (<>
      {/* 12 月时序 + R-NSC/净收入/LTV÷CAC 均依赖后端聚合端点，真实模式尚未接入 → 空态，不摆假曲线 */}
      {isRealApi ? (
        <Card className="mt-4" style={rev(0.32)}>
          <CardTitle title="经营趋势与北极星（R-NSC）" desc="12 月时序、平台净收入、R-NSC 风险调整后净订阅贡献" />
          <div className="grid place-items-center gap-1.5 py-12 text-center">
            <div className="text-[13px] font-medium text-ink-2">聚合指标接入中</div>
            <div className="max-w-[420px] text-[12px] leading-relaxed text-ink-4">时序趋势、平台净收入与 R-NSC 依赖服务端聚合端点，接入后此处展示真实经营走势。当前实时经营数据见下方号池 / 品牌 / 代理明细。</div>
          </div>
        </Card>
      ) : (
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_318px]">
        <Card style={rev(0.32)}>
          <CardTitle title="基础流水与平台净收入" desc="近 12 个月 · 实线基础流水，虚线净收入，悬停查看读数"
            right={<div className="flex shrink-0 items-center gap-3.5 text-[12px] whitespace-nowrap text-ink-2"><span className="inline-flex items-center gap-1.5"><span className="h-[2px] w-3.5 rounded bg-brand" />基础流水</span><span className="inline-flex items-center gap-1.5"><span className="h-0 w-3.5 border-t-2 border-dashed border-ink opacity-50" />净收入</span></div>} />
          <CrosshairChart a={{ name: '基础流水', data: series.gmv12m }} b={{ name: '净收入', data: series.netRevenue12m }} labels={months12} yMax={32e6} fmtA={wan} fmtB={wan} />
        </Card>

        {/* 北极星仪表（唯一一处）· R-NSC 风险调整后净订阅贡献 */}
        <Card style={rev(0.36)} className="flex flex-col">
          <div className="flex items-center gap-2"><span className="h-[7px] w-[7px] bg-brand" /><div className="text-[14.5px] font-semibold">北极星 · <Term k="rnsc">R-NSC</Term> 净订阅贡献</div></div>
          <div className="mt-3 flex items-baseline gap-2">
            <CountUp to={rnscOf(range) / 1e4} decimals={1} prefix="¥" suffix="万" group={false} />
            <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10.5px] text-ink-4">含估算项</span>
          </div>
          <div className="mt-1 text-[12px] text-ink-3">{RANGE_LABEL[range]}风险调整后真正净增 · 已扣退款/投诉/准备金/成本</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat label="基础流水" value={wan(kpi.gmvMtd * RANGE_SCALE[range])} />
            <MiniStat label="平台净收入" value={wan(kpi.platformNetMtd * RANGE_SCALE[range])} />
          </div>
          <div className="mt-3 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-3">
            <span className="font-medium text-ink-2">护栏 · 净 LTV÷CAC：</span><span className="tnum text-ink">{kpi.ltvCac.toFixed(2)}</span>（&gt;2 可接受，目标 3.0）。不再以 GMV 为北极星：低价首月、退款、退订都会把流水冲掉。
          </div>
        </Card>
      </div>
      )}

      {/* ───────── 层 3 · 供需两侧 + 风险详情 ───────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 号池健康 */}
        <Card style={rev(0.4)}>
          <CardTitle title="号池健康联动" desc="逼近阈值自动降权 · 反向收紧投放" right={<Link to="/merchants" className="text-[12px] text-ink-3 hover:text-ink">全部 →</Link>} />
          <div className="flex flex-col gap-3">
            {atRisk.map((m, i) => {
              const st = MERCHANT_STATE[m.state]
              const tone = st.tone === 'neutral' ? 'alert' : st.tone
              return (
                <div key={m.id} className="flex items-center gap-2.5">
                  <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[5px] bg-avatar text-[11px] font-semibold text-avatar-fg">{brandById(m.brandId).mark}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between"><span className="tnum text-[12px] whitespace-nowrap text-ink">{m.id}</span><span className={cx('tnum text-[11px]', TONE[tone].ink)}>{pct(m.complaintRate)}</span></div>
                    <div className="relative mt-1.5 h-[5px] overflow-hidden rounded-[2px] bg-surface-sunken">
                      <div style={{ width: `${Math.min(100, m.complaintRate * 100)}%`, background: `var(--color-${tone})`, transformOrigin: 'left', animation: `growX .8s ${0.5 + i * 0.08}s cubic-bezier(.45,0,.15,1) both` }} className="h-full" />
                      <span className="absolute top-[-2px] h-[9px] w-px bg-ink-5" style={{ left: '80%' }} />
                    </div>
                  </div>
                  <Badge tone={tone}>{st.label}</Badge>
                </div>
              )
            })}
          </div>
          <div className="mt-3 border-t border-line pt-3 text-[11px] text-ink-5">竖线为预警水位 80% · 投诉率作为投放第二目标函数</div>
        </Card>

        {/* 上游 · 品牌表现 */}
        <Card style={rev(0.44)}>
          <CardTitle title="上游品牌表现" desc="本月，按基础流水排序" right={<Link to="/brands" className="text-[12px] text-ink-3 hover:text-ink">品牌 →</Link>} />
          <div className="flex flex-col gap-2.5">
            {liveBrands.map((b, i) => (
              <Link to={`/brands/${b.id}`} key={b.id} className="flex items-center gap-2.5 rounded-md p-1 hover:bg-surface-muted">
                <BrandMark brand={b.id} mark={b.mark} size={26} />
                <div className="w-20 min-w-0"><div className="truncate text-[12.5px] font-medium text-ink">{b.name}</div></div>
                <div className="flex-1"><Meter value={(b.gmvMtd / maxBrandGmv) * 100} tone="brand" animate delay={0.5 + i * 0.08} /></div>
                <span className="tnum w-14 text-right text-[12px] font-semibold text-ink">{money(b.gmvMtd)}</span>
              </Link>
            ))}
          </div>
          <div className="mt-2 border-t border-line pt-3 text-[11px] text-ink-5">在投品牌 <span className="tnum text-ink">{liveBrandCount}</span> · 活跃订阅 <span className="tnum text-ink">{int(kpi.activeSubs)}</span></div>
        </Card>

        {/* 下游 · 代理质量（补齐三方对称） */}
        <Card style={rev(0.48)}>
          <CardTitle title="下游 · 代理质量" desc="服务商健康与风险" right={<Link to="/agents" className="text-[12px] text-ink-3 hover:text-ink">代理 →</Link>} />
          <div className="grid grid-cols-3 gap-2">
            <QualBox v={String(activeAgents)} k="活跃代理" tone="good" />
            <QualBox v={String(agentRisk.length)} k="风险代理" tone="alert" />
            <QualBox v={money(agentPending)} k="待结算" tone="info" />
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {agentRisk.slice(0, 3).map((a) => {
              const st = AGENT_STATUS[a.status]
              return (
                <Link to="/agents" key={a.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-surface-muted">
                  <ShieldHalf size={14} className="shrink-0 text-ink-4" />
                  <span className="flex-1 truncate text-[12px] text-ink-2">{a.name}</span>
                  <span className="tnum text-[11px] text-ink-4">{a.creditScore}</span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </Link>
              )
            })}
            {agentRisk.length === 0 && <div className="py-2 text-center text-[11.5px] text-ink-4">暂无风险代理</div>}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 异常订单流（改造后：只看需处置的单） */}
        <Card style={rev(0.5)} pad={false} className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 pt-4 pb-3">
            <div className="flex items-center gap-2.5"><span className="h-[7px] w-[7px] bg-brand" /><div className="text-[14px] font-semibold">异常订单流</div><span className="text-[11px] text-ink-4">退款 / 拒付</span></div>
            <Link to="/orders" className="text-[11.5px] text-ink-4 hover:text-ink">全部订单 →</Link>
          </div>
          <div className="px-2 py-2">
            {anomalies.length === 0 ? (
              <EmptyState title="暂无异常订单" desc="退款、拒付订单会在此聚合" />
            ) : (
              anomalies.map((o) => {
                const t = ORDER_TYPE[o.type]
                return (
                  <div key={o.id} className="flex items-center gap-2.5 rounded-md px-2.5 py-2.5 transition-colors hover:bg-surface-muted">
                    <span className="tnum w-[34px] text-[10.5px] text-ink-5">{o.time.slice(0, 5)}</span>
                    <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[5px] bg-avatar text-[10px] text-avatar-fg">{brandById(o.brandId).mark}</span>
                    <div className="min-w-0 flex-1"><div className="truncate text-[12px] text-ink">{o.plan}</div><div className="text-[10.5px] text-ink-5">{o.agentId} · {CHANNEL_LABEL[o.channel]}</div></div>
                    <Badge tone={t.tone} dot={o.type === 'refund' || o.type === 'chargeback'}>{t.label}</Badge>
                    <span className={cx('tnum w-[52px] text-right text-[12.5px] font-semibold', o.amount < 0 ? 'text-alert-ink' : 'text-ink')}>{o.amount < 0 ? '−' : ''}¥{Math.abs(o.amount)}</span>
                  </div>
                )
              })
            )}
          </div>
        </Card>

        {/* 投诉率大盘（峰值口径，与风险条一致） */}
        <Card style={rev(0.54)}>
          <CardTitle
            title="投诉率大盘"
            desc={`号池峰值 · 红线阈值 ${MERCHANT_THRESHOLD.complaint.toFixed(1)}%`}
            right={<Badge tone={complaintTone} dot>{complaintTone === 'good' ? '全部达标' : complaintTone === 'warn' ? '逼近红线' : '触发管控'}</Badge>}
          />
          {/* 30 天投诉率时序无后端来源 → 真实模式仅保留下方号池峰值（真实派生），不画假曲线 */}
          {isRealApi ? <div className="grid h-[92px] place-items-center text-[12px] text-ink-4">投诉率时序接入中 · 下方为号池实时峰值</div> : <ComplaintChart data={series.complaint30d} />}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniBox v={pct(peakComplaint)} k="最高投诉率" tone={complaintTone} />
            <MiniBox v={pct(peakEsc, 2)} k="最高升级投诉" tone={toneOf(peakEsc, MERCHANT_THRESHOLD.escalated, MERCHANT_THRESHOLD.escalatedWarn)} />
            <MiniBox v={pct(peakChargeback, 2)} k="最高拒付率" tone={toneOf(peakChargeback, 0.7, 0.5)} />
          </div>
        </Card>
      </div>
      </>)}

      <Confirm
        open={!!confirmTicket}
        onClose={() => setConfirmTicket(null)}
        onConfirm={() => {
          if (confirmTicket) {
            resolveTicketWithRefund(confirmTicket)
            toast({ tone: 'good', text: `工单 ${confirmTicket} 已退款，联动冲账完成` })
          }
        }}
        title="确认退款并联动冲账"
        confirmText="确认退款"
        body={<>将对工单 <span className="tnum font-medium text-ink">{confirmTicket}</span> 发起退款。此操作会<span className="font-medium text-ink"> 触发清结算逆向冲账、回收代理分润、更新信用分</span>，并实时反映在右侧联动事件流。</>}
      />
    </>
  )
}

/* ── local pieces ──────────────────────────────── */
function TeamAdminHome({ onOpen }: { onOpen: (to: string) => void }) {
  const experience = ROLE_EXPERIENCE.teamadmin
  return (
    <>
      <PageHeader
        title={experience.title}
        desc={experience.description}
        actions={<Button variant="primary" onClick={() => onOpen('/members')}><UsersRound size={15} /> {experience.primaryLabel}</Button>}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button onClick={() => onOpen('/members')} className="flex min-h-[112px] items-start gap-3 rounded-lg border border-line bg-surface p-5 text-left shadow-[var(--shadow-card)] transition-colors hover:border-brand/40 hover:bg-surface-muted">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink"><UsersRound size={18} /></span>
          <span><span className="block text-[14px] font-semibold text-ink">成员状态管理</span><span className="mt-1 block text-[12.5px] leading-relaxed text-ink-3">查看成员，停用或恢复团队账号。</span></span>
        </button>
        <button onClick={() => onOpen('/audit')} className="flex min-h-[112px] items-start gap-3 rounded-lg border border-line bg-surface p-5 text-left shadow-[var(--shadow-card)] transition-colors hover:border-brand/40 hover:bg-surface-muted">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-sunken text-ink-2"><ScrollText size={18} /></span>
          <span><span className="block text-[14px] font-semibold text-ink">操作审计</span><span className="mt-1 block text-[12.5px] leading-relaxed text-ink-3">查看资金、风控和配置等关键操作记录。</span></span>
        </button>
      </div>
    </>
  )
}

function ActionRow({ a, onRefund, onOpen, actionLabel = '处理' }: { a: ActionItem; onRefund?: () => void; onOpen: () => void; actionLabel?: string }) {
  const ICON: Record<string, React.ReactNode> = { reg: <AlertTriangle size={15} />, pool: <TrendingUp size={15} />, fraud: <ShieldCheck size={15} />, recon: <GlassWater size={15} /> }
  return (
    <div className={cx('flex items-start gap-3 rounded-lg p-2.5 transition-colors', a.tone === 'alert' ? 'border border-alert/20 bg-alert/[0.04]' : 'hover:bg-surface-muted')}>
      <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-md', TONE[a.tone].soft, TONE[a.tone].ink)}>{ICON[a.id] ?? <AlertTriangle size={15} />}</span>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="text-[12.5px] font-semibold text-ink">{a.title}</div>
        <div className="mt-0.5 text-[11px] text-ink-3">{a.sub}</div>
      </button>
      {onRefund ? (
        <button onClick={onRefund} className="shrink-0 rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white hover:bg-brand-hover">立即退款</button>
      ) : (
        <button onClick={onOpen} className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-ink-3 hover:bg-surface-sunken hover:text-ink">{actionLabel} <ArrowUpRight size={12} className="inline" /></button>
      )}
    </div>
  )
}

function Kpi({ d, label, value, delta, sub, children }: { d: number; label: string; value: React.ReactNode; delta?: string; sub: string; children: React.ReactNode }) {
  return (
    <Card mark style={rev(d)} className="!p-4">
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="tnum mt-2 text-[30px] leading-none font-semibold tracking-[-0.02em] text-ink">{value}</div>
      <div className="mt-2 flex items-center gap-2">{delta && <span className="tnum inline-flex items-center gap-1 text-[11.5px] text-good-ink"><ChevronUp size={11} strokeWidth={2.6} />{delta}</span>}<span className="text-[11px] text-ink-5">{sub}</span></div>
      <div className="mt-3">{children}</div>
    </Card>
  )
}

function MiniSpark({ data, tone, delay }: { data: number[]; tone: 'brand' | 'neutral'; delay: number }) {
  if (data.length < 2) return null // 真实模式无时序数据 → 不画迷你线
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1, step = 200 / (data.length - 1)
  const pts = data.map((v, i) => [i * step, 28 - ((v - min) / span) * 24 - 2])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const color = tone === 'brand' ? 'var(--color-brand)' : 'var(--color-ink)'
  return (
    <svg viewBox="0 0 200 30" style={{ width: '100%', height: 24, overflow: 'visible' }}>
      <path pathLength={1} style={{ strokeDasharray: 1, animation: `draw 1s ${delay}s cubic-bezier(.45,0,.15,1) both` }} d={d} fill="none" stroke={color} strokeWidth="1.6" opacity={tone === 'neutral' ? 0.55 : 1} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={color} opacity={tone === 'neutral' ? 0.55 : 1} />
    </svg>
  )
}

function ComplaintChart({ data }: { data: number[] }) {
  const VBW = 320, VBH = 120, yMax = 1.1, n = data.length
  const xs = data.map((_, i) => (i * VBW) / (n - 1))
  const y = (v: number) => VBH - (v / yMax) * VBH
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(0)},${y(v).toFixed(0)}`).join(' ')
  const area = `${line} L${VBW},${VBH} L0,${VBH} Z`
  const thrY = y(1.0)
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: '100%', height: 120, marginTop: 14, overflow: 'visible' }}>
      <line x1="0" x2={VBW} y1={thrY} y2={thrY} stroke="var(--color-brand)" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
      <text x={VBW - 2} y={thrY - 4} textAnchor="end" className="tnum" fontSize="9" fill="var(--color-brand)" opacity="0.8">阈值 1.0%</text>
      <defs><linearGradient id="cmpg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--color-warn)" stopOpacity="0.16" /><stop offset="1" stopColor="var(--color-warn)" stopOpacity="0" /></linearGradient></defs>
      <path style={{ animation: 'fadeIn 1s .6s both' }} d={area} fill="url(#cmpg)" />
      <path pathLength={1} style={{ strokeDasharray: 1, animation: 'draw 1.1s .45s cubic-bezier(.45,0,.15,1) both' }} d={line} fill="none" stroke="var(--color-warn)" strokeWidth="1.8" />
      <circle cx={xs[n - 1]} cy={y(data[n - 1])} r="3" fill="var(--color-warn)" />
    </svg>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-line bg-surface-muted px-3 py-2.5"><div className="text-[10.5px] text-ink-3">{label}</div><div className="tnum mt-0.5 text-[16px] font-semibold">{value}</div></div>
}
function MiniBox({ v, k, tone }: { v: string; k: string; tone: 'good' | 'warn' | 'alert' }) {
  return <div className="rounded-md bg-surface-muted py-2.5 text-center"><div className={cx('tnum text-[15px] font-semibold', TONE[tone].ink)}>{v}</div><div className="mt-0.5 text-[10.5px] text-ink-5">{k}</div></div>
}
function QualBox({ v, k, tone }: { v: string; k: string; tone: 'good' | 'alert' | 'info' }) {
  return <div className="rounded-md bg-surface-muted py-2 text-center"><div className={cx('tnum text-[14px] font-semibold', TONE[tone].ink)}>{v}</div><div className="mt-0.5 text-[10.5px] text-ink-5">{k}</div></div>
}

/* 异动播报（晨报）：规则模板从 store 派生 3 句话，每句带下钻链接。 */
function DailyBrief({ nav, can, showAllClear }: { nav: (to: string) => void; can: (permission: string) => boolean; showAllClear: boolean }) {
  const s = useStore()
  const items = buildInsights(s).flatMap((item) => {
    if (item.id === 'ok' && !showAllClear) return []
    const to = resolveDashboardTarget(item.to, can)
    return to ? [{ ...item, to }] : []
  })
  const dot: Record<string, string> = { alert: 'var(--color-alert)', warn: 'var(--color-warn)', good: 'var(--color-good)', info: 'var(--color-info)' }
  if (items.length === 0) return null
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-line bg-surface shadow-[var(--shadow-card)]" style={rev(0.06)}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-soft text-brand-ink"><Sparkles size={13} /></span>
        <span className="text-[13px] font-semibold text-ink">异动播报</span>
        <span className="text-[11px] text-ink-4">规则引擎 · 数字可溯源</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-ink-5"><span className="h-1.5 w-1.5 rounded-full bg-good" style={{ animation: 'blink 1.6s ease-in-out infinite' }} /> 今日</span>
      </div>
      <div className="divide-y divide-line/60">
        {items.map((it) => (
          <button key={it.id} onClick={() => nav(it.to)} className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-muted">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot[it.tone] }} />
            <span className="flex-1 text-[12.5px] leading-relaxed text-ink-2">{it.text}</span>
            <ArrowRight size={13} className="mt-0.5 shrink-0 text-ink-4" />
          </button>
        ))}
      </div>
    </div>
  )
}
