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
  Activity,
  ShieldHalf,
} from 'lucide-react'
import { Card, CardTitle, Badge, Button, Segmented, CountUp, BrandMark, TONE } from '../components/ui/primitives'
import { CrosshairChart, Meter } from '../components/ui/charts'
import { Confirm, useToast } from '../components/ui/overlays'
import { EmptyState } from '../components/ui/forms'
import { Term } from '../components/ui/Term'
import { useViewMode } from '../lib/prefs'
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
import { money, pct, int, cx } from '../lib/format'

const wan = (n: number) => '¥' + Math.round(n / 1e4).toLocaleString('zh-CN') + '万'
const rev = (d: number) => ({ animation: `revUpSm .4s ${(d * 0.55).toFixed(2)}s cubic-bezier(.22,1,.36,1) both` })
type Range = 'today' | 'week' | 'month' | 'quarter'
const RANGE_LABEL: Record<Range, string> = { today: '今日', week: '本周', month: '本月', quarter: '本季' }

function exportCsv(range: Range) {
  const rows = [
    ['指标', '数值', '口径'],
    ['R-NSC 风险调整后净订阅贡献', money(rnscOf(range)), '北极星 · 含估算成本项'],
    [`${RANGE_LABEL[range]}基础流水`, money(kpi.gmvMtd), 'R-NSC 收入首项 · 扣款成交额'],
    ['净 LTV÷CAC', kpi.ltvCac.toFixed(2), '护栏指标'],
    ['平台净收入', money(kpi.platformNetMtd), '可分配池−代理分润'],
    ['续费率', pct(kpi.renewalRate), '连续包月'],
    ['综合投诉率', pct(kpi.complaintRate), '近7天累计'],
  ]
  const csv = '﻿' + rows.map((r) => r.join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `经营总览-${RANGE_LABEL[range]}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// R-NSC 北极星派生估算（dict.ts METRICS.rnsc 口径）。
// 平台净收入 = 可分配池 − 渠道分润（真实数据，已扣分润），以它为起点，再减去风险与各项成本。
// 带 EST_ 前缀的成本项目前用占位系数 × 基础流水估算，结果在 UI 标注"含估算项"，待真实流水接入。
const EST_REFUND = 0.03 // 退款占基础流水
const EST_COMPLAINT = 0.008 // 投诉处理成本
const EST_RESERVE = 0.1 // 风险准备金计提
const EST_MATERIAL = 0.015 // 素材成本
const EST_MIDRISK = 0.006 // 商户号风险成本
const RANGE_SCALE: Record<Range, number> = { today: 1 / 30, week: 1 / 4, month: 1, quarter: 3 }
function rnscOf(range: Range): number {
  const k = RANGE_SCALE[range]
  const net = kpi.platformNetMtd * k // 已扣渠道分润的平台净收入
  const costs = kpi.gmvMtd * k * (EST_REFUND + EST_COMPLAINT + EST_RESERVE + EST_MATERIAL + EST_MIDRISK)
  return Math.round(net - costs)
}

export default function Dashboard() {
  const s = useStore()
  const nav = useNavigate()
  const toast = useToast()
  const [range, setRange] = useState<Range>('month')
  const [confirmTicket, setConfirmTicket] = useState<string | null>(null)

  const risk = selectRisk(s)
  const actions = selectActions(s)
  const mode = useViewMode()
  const expert = mode === 'expert'
  const overall = risk.some((r) => r.health === 'red') ? 'red' : risk.some((r) => r.health === 'amber') ? 'amber' : 'green'

  const gmvScale = range === 'today' ? 1 / 30 : range === 'week' ? 1 / 4 : range === 'quarter' ? 3 : 1
  const gmvShown = kpi.gmvMtd * gmvScale

  const atRisk = s.merchants.filter((m) => m.state !== 'healthy').sort((a, b) => b.complaintRate - a.complaintRate).slice(0, 4)
  const liveBrands = s.brands.filter((b) => b.status === 'live').sort((a, b) => b.gmvMtd - a.gmvMtd).slice(0, 4)
  // 投诉率大盘：从号池明细派生峰值（不再硬编码 KPI 静态值，避免与风险条「最高投诉率」自相矛盾）
  const peakComplaint = s.merchants.length ? Math.max(...s.merchants.map((m) => m.complaintRate)) : 0
  const peakEsc = s.merchants.length ? Math.max(...s.merchants.map((m) => m.escalatedRate)) : 0
  const peakChargeback = s.merchants.length ? Math.max(...s.merchants.map((m) => m.chargebackRate)) : 0
  const toneOf = (v: number, red: number, amber: number): 'good' | 'warn' | 'alert' => (v >= red ? 'alert' : v >= amber ? 'warn' : 'good')
  const complaintTone = toneOf(peakComplaint, MERCHANT_THRESHOLD.complaint, MERCHANT_THRESHOLD.complaintWarn)
  const maxBrandGmv = Math.max(1, ...liveBrands.map((b) => b.gmvMtd))
  const anomalies = s.orders.filter((o) => o.type === 'refund' || o.type === 'chargeback' || Math.abs(o.amount) >= 39).slice(0, 6)
  const agentRisk = s.agents.filter((a) => a.status !== 'active')
  const agentPending = s.agents.reduce((x, a) => x + a.payoutPending, 0)

  return (
    <>
      {/* header */}
      <div style={rev(0.04)} className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5"><span className="h-[7px] w-[7px] bg-brand" /><span className="text-[11px] font-semibold tracking-[0.14em] text-brand">北极星指标</span></div>
          <h1 className="t-h1 mt-2 text-ink">经营总览</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">北极星看 R-NSC 风险调整后净订阅贡献，不被 GMV 诱导 · 先看风险与待办，号池健康联动投放</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <Segmented value={range} onChange={setRange} options={[{ value: 'today', label: '今日' }, { value: 'week', label: '本周' }, { value: 'month', label: '本月' }, { value: 'quarter', label: '本季' }]} />
          <Button variant="ghost" busyMs={420} onClick={() => { exportCsv(range); toast({ tone: 'good', text: '报表已导出 CSV' }) }}><Download size={15} /> 导出报表</Button>
          <Button variant="primary" onClick={() => nav('/settlement')}>本期结算预览 <ArrowRight size={15} /></Button>
        </div>
      </div>

      {/* 简洁模式提示：已隐藏专业图表，切到专家看全部 */}
      {!expert && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-dashed border-line bg-surface-muted px-3 py-2 text-[12px] text-ink-3">
          <span>简洁视图仅展示核心指标与待办；如需完整图表与运营明细，请在右上角切换至专家视图。</span>
        </div>
      )}

      {/* 演示剧本（一键触发联动）· 仅专家模式 */}
      {expert && (
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line bg-surface-muted px-3 py-2 text-[12px]">
        <span className="font-medium text-ink-2">演示剧本</span>
        <button onClick={() => { runScenario('crisis'); toast({ tone: 'alert', text: '保号危机：M-XM-02 暂停新签' }) }} className="rounded-md bg-surface px-2.5 py-1 font-medium text-ink-2 ring-1 ring-line hover:ring-brand hover:text-brand">保号危机</button>
        <button onClick={() => { runScenario('refund'); toast({ tone: 'good', text: '升级投诉已退款并冲账' }) }} className="rounded-md bg-surface px-2.5 py-1 font-medium text-ink-2 ring-1 ring-line hover:ring-brand hover:text-brand">退款闭环</button>
        <button onClick={() => { runScenario('reconcile'); toast({ tone: 'good', text: '对账差异已核销' }) }} className="rounded-md bg-surface px-2.5 py-1 font-medium text-ink-2 ring-1 ring-line hover:ring-brand hover:text-brand">月结对账</button>
        <button onClick={() => { runScenario('fraud'); toast({ tone: 'warn', text: '代理 A-4410 已冻结结算' }) }} className="rounded-md bg-surface px-2.5 py-1 font-medium text-ink-2 ring-1 ring-line hover:ring-brand hover:text-brand">代理刷量</button>
        <button onClick={() => { resetStore(); toast({ tone: 'info', text: '数据已重置' }) }} className="ml-auto rounded-md px-2.5 py-1 font-medium text-ink-4 hover:text-ink">重置数据</button>
      </div>
      )}

      {/* ───────── 层 1 · 风险与行动 ───────── */}
      <Card style={rev(0.08)}>
        <CardTitle
          title="平台健康"
          desc="商户号 / 资金 / 合规 风险总览 · 逼近阈值时变色提示"
          right={<Badge tone={HEALTH_TONE[overall]} dot>{overall === 'red' ? '有告警' : overall === 'amber' ? '需关注' : '全部正常'}</Badge>}
        />
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
          {risk.map((r) => (
            <Link key={r.key} to={r.to} className="group rounded-lg border border-line px-3 py-2.5 transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-line-strong hover:bg-surface-muted hover:shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3"><span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--color-${HEALTH_TONE[r.health]})` }} />{r.label}</div>
              <div className={cx('tnum mt-1 text-[16px] font-semibold', TONE[HEALTH_TONE[r.health]].ink)}>{r.value}</div>
            </Link>
          ))}
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 行动中心 —— 简洁模式下「实时联动」隐藏，今日待办占满整行避免第 3 列空缺 */}
        <Card style={rev(0.12)} className={expert ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <CardTitle title="今日待办" desc="需人工处理事项 · 支持一键操作" right={<Badge tone={actions.length ? 'alert' : 'good'}>{actions.length ? `${actions.length} 项待办` : '已清空'}</Badge>} />
          {actions.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={20} />} title="今日待办已清空" desc="新的升级投诉 / 暂停新签 / 对账差异会自动出现在这里" />
          ) : (
            <div className="flex flex-col gap-2">
              {actions.map((a) => (
                <ActionRow key={a.id} a={a} onRefund={a.ticketId ? () => setConfirmTicket(a.ticketId!) : undefined} onOpen={() => nav(a.to)} />
              ))}
            </div>
          )}
        </Card>

        {/* 实时联动 / 活动流 —— 证明跨模块联动 · 仅专家模式 */}
        {expert && (
        <Card style={rev(0.16)} pad={false} className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-5 pt-5 pb-3">
            <span className="h-[7px] w-[7px] bg-brand" />
            <h3 className="text-[14px] font-semibold">实时联动</h3>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-good-ink"><span className="h-1.5 w-1.5 rounded-full bg-good" style={{ animation: 'blink 1.6s ease-in-out infinite' }} />事件流</span>
          </div>
          {s.activity.length === 0 ? (
            <EmptyState icon={<Activity size={20} />} title="暂无联动事件" desc="处理待办后，跨模块链路会实时记录在这里" />
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
        )}
      </div>

      {/* ───────── 层 2 · 北极星与经营健康 ───────── */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Kpi d={0.2} label={`${RANGE_LABEL[range]}基础流水`} value={<CountUp to={gmvShown / 1e4} decimals={1} prefix="¥" suffix="万" group={false} />} delta="+12.4%" sub={`R-NSC 收入首项 · 年累计 ${money(kpi.gmvYtd)}`}>
          <MiniSpark data={series.gmv12m} tone="brand" delay={0.4} />
        </Kpi>
        <Kpi d={0.24} label="平台净收入（本月）" value={<CountUp to={kpi.platformNetMtd / 1e4} decimals={1} prefix="¥" suffix="万" group={false} />} delta="+9.1%" sub="占基础流水 14.5%">
          <MiniSpark data={series.netRevenue12m} tone="neutral" delay={0.5} />
        </Kpi>
        <Kpi d={0.28} label="续费率（连续包月）" value={<CountUp to={kpi.renewalRate} decimals={1} suffix="%" />} delta="+1.6个百分点" sub={`准备金 ${money(kpi.reserveBalance)}`}>
          <Meter value={kpi.renewalRate} tone="brand" animate delay={0.56} />
        </Kpi>
      </div>

      {/* 趋势图 + 北极星仪表 + 层3 供需/风险详情 —— 仅专家模式（简洁模式到此为止） */}
      {expert && (<>
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
                  <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[5px] bg-ink text-[11px] font-semibold text-white">{brandById(m.brandId).mark}</span>
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
          <div className="mt-2 border-t border-line pt-3 text-[11px] text-ink-5">在投品牌 <span className="tnum text-ink">{kpi.liveBrands}</span> · 活跃订阅 <span className="tnum text-ink">{int(kpi.activeSubs)}</span></div>
        </Card>

        {/* 下游 · 代理质量（补齐三方对称） */}
        <Card style={rev(0.48)}>
          <CardTitle title="下游 · 代理质量" desc="服务商健康与风险" right={<Link to="/agents" className="text-[12px] text-ink-3 hover:text-ink">代理 →</Link>} />
          <div className="grid grid-cols-3 gap-2">
            <QualBox v={String(kpi.activeAgents)} k="活跃代理" tone="good" />
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
            <div className="flex items-center gap-2.5"><span className="h-[7px] w-[7px] bg-brand" /><div className="text-[14px] font-semibold">异常订单流</div><span className="text-[11px] text-ink-4">退款 / 拒付 / 大额</span></div>
            <Link to="/orders" className="text-[11.5px] text-ink-4 hover:text-ink">全部订单 →</Link>
          </div>
          <div className="px-2 py-2">
            {anomalies.length === 0 ? (
              <EmptyState title="暂无异常订单" desc="退款、拒付、大额订单会在此聚合" />
            ) : (
              anomalies.map((o) => {
                const t = ORDER_TYPE[o.type]
                return (
                  <div key={o.id} className="flex items-center gap-2.5 rounded-md px-2.5 py-2.5 transition-colors hover:bg-surface-muted">
                    <span className="tnum w-[34px] text-[10.5px] text-ink-5">{o.time.slice(0, 5)}</span>
                    <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[5px] bg-ink text-[10px] text-white">{brandById(o.brandId).mark}</span>
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
          <ComplaintChart data={series.complaint30d} />
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
function ActionRow({ a, onRefund, onOpen }: { a: ActionItem; onRefund?: () => void; onOpen: () => void }) {
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
        <button onClick={onOpen} className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-ink-3 hover:bg-surface-sunken hover:text-ink">处理 <ArrowUpRight size={12} className="inline" /></button>
      )}
    </div>
  )
}

function Kpi({ d, label, value, delta, sub, children }: { d: number; label: string; value: React.ReactNode; delta: string; sub: string; children: React.ReactNode }) {
  return (
    <Card mark style={rev(d)} className="!p-4">
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="tnum mt-2 text-[30px] leading-none font-semibold tracking-[-0.02em] text-ink">{value}</div>
      <div className="mt-2 flex items-center gap-2"><span className="tnum inline-flex items-center gap-1 text-[11.5px] text-good-ink"><ChevronUp size={11} strokeWidth={2.6} />{delta}</span><span className="text-[11px] text-ink-5">{sub}</span></div>
      <div className="mt-3">{children}</div>
    </Card>
  )
}

function MiniSpark({ data, tone, delay }: { data: number[]; tone: 'brand' | 'neutral'; delay: number }) {
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
