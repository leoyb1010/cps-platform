import { useEffect, useState } from 'react'
import { Download, Search, ArrowRight, TrendingUp } from 'lucide-react'
import { Card, CardTitle, Stat, PageHeader, Badge, Button, Segmented, BrandMark, TableShell, Th, Td, Row, CountUp } from '../../components/ui/primitives'
import { AreaLine, Gauge, Sparkline } from '../../components/ui/charts'
import { Modal, useToast } from '../../components/ui/overlays'
import { Field, Input, Textarea } from '../../components/ui/forms'
import { PeriodFilter } from '../../components/ui/filters'
import { type PeriodValue } from '../../lib/period'
import { portalApi, type AgentSummary } from '../../lib/portalApi'
import { usePortalResource, PortalState, TableSkeleton, exportCsv, DemoNotice, TopBars, PortalBanner } from '../../components/portal/kit'
import { brandById, TICKET_LEVEL, TICKET_STATUS, TICKET_SOURCE, SETTLE_MODEL_LABEL as SETTLE_MODEL } from '../../lib/data'
import { money, pct, cx, copyText } from '../../lib/format'

export function AgentHome() {
  const [period, setPeriod] = useState<PeriodValue>({ preset: 'month' })
  const { data, state, reload } = usePortalResource<AgentSummary>(() => portalApi.summary<AgentSummary>(period), [period.preset, period.from, period.to])
  return (
    <>
      <PortalBanner src="./img/banner-agent-home.webp" title="我的投放" desc="你作为推广渠道的核心数据：消耗、首单、待结分润、信用分。" actions={<PeriodFilter value={period} onChange={setPeriod} />} />
      <PortalState state={state} data={data} reload={reload}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card>
                <Stat label="本月消耗" value={money(d.spendMtd)} sub={<span>投放成本</span>} />
                {d.trend.length > 1 && <div className="mt-2"><Sparkline data={d.trend.map((t) => t.value)} tone="brand" w={140} h={30} /></div>}
              </Card>
              <Card><Stat label="带来首单" value={<CountUp to={d.firstOrders} group />} sub={<span>新签</span>} /></Card>
              <Card><Stat label="待结分润" value={money(d.payoutPending)} sub={<span>T+N 账期</span>} /></Card>
              <Card><Stat label="续费率" value={<CountUp to={d.renewalRate} decimals={1} suffix="%" />} sub={<span className={d.renewalRate >= 60 ? 'text-good-ink' : 'text-warn-ink'}>带来用户质量</span>} /></Card>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
              <Card>
                <CardTitle title="带单成交趋势" desc="本期每日带来的成交额（退款/拒付计负）" />
                {d.trend.length > 1
                  ? <AreaLine data={d.trend.map((t) => t.value)} labels={d.trend.map((t) => t.date.slice(5))} tone="brand" height={200} />
                  : <div className="grid h-[200px] place-items-center text-[12px] text-ink-4">数据点不足，暂不绘制趋势</div>}
              </Card>
              <Card>
                <CardTitle title="信用分" desc="决定结算优先级与可投额度" />
                <Gauge value={d.creditScore} max={1000} target={800} decimals={0} status={d.creditScore >= 800 ? '优质' : d.creditScore >= 600 ? '正常' : '受限'} />
                <a href="#/portal/agent/credit" className="mt-2 flex items-center justify-center gap-1 text-[12px] font-medium text-brand hover:underline">查看信用分构成 <ArrowRight size={13} /></a>
              </Card>
            </div>

            {d.topBrands && d.topBrands.length > 0 && (
              <Card className="mt-4">
                <CardTitle title="Top 品牌（按带单成交）" desc="本期你带单成交额最高的品牌" />
                <div className="mt-3"><TopBars items={d.topBrands.map((b) => ({ label: brandById(b.brandId)?.name ?? b.brandId, value: b.value }))} fmt={money} /></div>
              </Card>
            )}
          </>
        )}
      </PortalState>
    </>
  )
}

type MarketBrand = { id: string; name: string; mark: string; category: string; feeRate: number; period: number; renewalRate: number; complaintRate: number }
export function AgentMarket() {
  const toast = useToast()
  const { data, state, reload } = usePortalResource<MarketBrand[]>(() => portalApi.marketBrands())
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const apply = (rows: MarketBrand[]) => rows.filter((b) => !q.trim() || b.name.includes(q.trim()) || b.category.includes(q.trim()))
  const claim = async (brandId: string) => {
    setBusy(brandId)
    try {
      const r = await portalApi.createClaim({ brandId })
      if (r.ok && r.trackingUrl) { toast({ tone: 'good', text: `已领取，追踪链接：${r.trackingUrl}` }); reload() }
      else toast({ tone: 'alert', text: '领取失败' })
    } catch { toast({ tone: 'alert', text: '网络异常，请重试' }) } finally { setBusy(null) }
  }
  return (
    <>
      <PageHeader title="选品市场" desc="可投放的品牌货架（按续费率排序）。领取投放生成专属追踪链接后开始带单。" />
      <div className="mb-3 max-w-[260px]">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索品牌 / 品类" className="pl-8" />
        </div>
      </div>
      <PortalState state={state} data={data} reload={reload} emptyWhen={(d) => apply(d).length === 0} emptyTitle="无匹配品牌">
        {(d) => (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {apply(d).map((b) => (
              <Card key={b.id} hover className="group">
                <div className="flex items-center gap-3">
                  <BrandMark brand={b.id} mark={b.mark} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-ink">{b.name}</div>
                    <div className="text-[11px] text-ink-4">{b.category}</div>
                  </div>
                  {b.renewalRate >= 65 && <span className="shrink-0 rounded-md bg-good-soft px-1.5 py-0.5 text-[10px] font-medium text-good-ink">优质货源</span>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-surface-muted p-2"><div className="text-[11px] text-ink-4">分成费率</div><div className="text-[13px] font-semibold tnum text-ink">{pct(b.feeRate)}</div></div>
                  <div className="rounded-lg bg-surface-muted p-2"><div className="text-[11px] text-ink-4">续费率</div><div className="text-[13px] font-semibold tnum text-good-ink">{pct(b.renewalRate)}</div></div>
                </div>
                <button onClick={() => claim(b.id)} disabled={busy === b.id} className="mt-3 w-full rounded-lg bg-brand px-3 py-2 text-[12.5px] font-medium text-white shadow-[0_3px_10px_-3px_rgba(245,51,59,.4)] transition-all hover:bg-brand-hover active:scale-[0.99] disabled:opacity-50 disabled:shadow-none">{busy === b.id ? '领取中…' : '领取投放'}</button>
              </Card>
            ))}
          </div>
        )}
      </PortalState>
    </>
  )
}

type AgentPlanRow = { id: string; brandId: string; plan: string; type: string; amount: number; time: string }
type ClaimRow = { id: string; brandId: string; channel: string; trackingUrl: string; spend: number; firstOrders: number; status: string }
export function AgentPlans() {
  const toast = useToast()
  const { data, state, reload } = usePortalResource<AgentPlanRow[]>(() => portalApi.agentPlans())
  const claimsApi = usePortalResource<ClaimRow[]>(() => portalApi.agentClaims())
  const copy = (url: string) => { copyText(url).then((ok) => toast(ok ? { tone: 'good', text: '追踪链接已复制' } : { tone: 'info', text: url })) }
  return (
    <>
      <PageHeader
        title="我的投放计划"
        desc="你领取的投放追踪链接及回收的订单数据。"
        actions={data && <Button variant="ghost" onClick={() => exportCsv('我的投放.csv', data, [
          { key: 'id', label: '订单', get: (r) => r.id }, { key: 'brandId', label: '品牌', get: (r) => r.brandId }, { key: 'plan', label: '套餐', get: (r) => r.plan }, { key: 'type', label: '类型', get: (r) => r.type }, { key: 'amount', label: '金额', get: (r) => r.amount }, { key: 'time', label: '时间', get: (r) => r.time },
        ])}><Download size={14} /> 导出 CSV</Button>}
      />
      {(claimsApi.data ?? []).length > 0 && (
        <Card className="mb-4" pad={false}>
          <div className="p-5 pb-3"><CardTitle title="我领取的投放" desc="专属追踪链接，用于投放归因。点击复制。" /></div>
          <TableShell className="px-2 pb-2" head={<><Th className="pl-3">领取单</Th><Th>品牌</Th><Th>追踪链接</Th><Th right>状态</Th></>}>
            {(claimsApi.data ?? []).map((c) => (
              <Row key={c.id}>
                <Td className="pl-3 text-[12.5px] font-medium text-ink">{c.id}</Td>
                <Td className="text-[12px] text-ink-3">{c.brandId}</Td>
                <Td><button onClick={() => copy(c.trackingUrl)} className="max-w-[280px] truncate font-mono text-[11.5px] text-brand hover:underline">{c.trackingUrl}</button></Td>
                <Td right><Badge tone={c.status === 'active' ? 'good' : 'neutral'}>{c.status === 'active' ? '投放中' : c.status}</Badge></Td>
              </Row>
            ))}
          </TableShell>
        </Card>
      )}
      <PortalState state={state} data={data} reload={reload} skeleton={<TableSkeleton />} emptyWhen={(d) => d.length === 0} emptyTitle="暂无投放">
        {(d) => (
          <Card pad={false}>
            <div className="p-5 pb-3"><CardTitle title="回收订单" desc="归因到你的订单流水" /></div>
            <TableShell className="px-2 pb-2" head={<><Th className="pl-3">订单</Th><Th>品牌</Th><Th>套餐</Th><Th>类型</Th><Th right>金额</Th><Th right>时间</Th></>}>
              {d.map((o) => (
                <Row key={o.id}>
                  <Td className="pl-3 text-[12.5px] font-medium text-ink">{o.id}</Td>
                  <Td className="text-[12px] text-ink-3">{o.brandId}</Td>
                  <Td>{o.plan}</Td>
                  <Td><Badge tone={o.type === 'refund' || o.type === 'chargeback' ? 'alert' : o.type === 'renew' ? 'good' : 'info'}>{o.type}</Badge></Td>
                  <Td right mono>{money(o.amount)}</Td>
                  <Td right className="text-[12px] text-ink-4">{o.time}</Td>
                </Row>
              ))}
            </TableShell>
          </Card>
        )}
      </PortalState>
    </>
  )
}

type AgentPayoutData = { name: string; payoutPending: number; settledTotal: number; deposit: number; roi: number; spendMtd: number } | null
type PayoutReq = { id: string; amount: number; status: string; createdAt: string }
export function AgentPayouts() {
  const toast = useToast()
  const { data, state, reload } = usePortalResource<AgentPayoutData>(() => portalApi.agentPayouts())
  const reqApi = usePortalResource<PayoutReq[]>(() => portalApi.agentPayoutRequests())
  const [reqOpen, setReqOpen] = useState(false)
  const [amount, setAmount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [amountErr, setAmountErr] = useState('')
  const submit = async () => {
    // 先本地校验：金额必须 >0 且不超过可提现余额；busy 期间禁提交防重复申请
    const max = data?.payoutPending ?? 0
    if (!(amount > 0)) { setAmountErr('提现金额需大于 0'); return }
    if (amount > max) { setAmountErr(`不可超过可提现余额 ${money(max)}`); return }
    setAmountErr('')
    setBusy(true)
    try {
      const r = await portalApi.requestPayout(amount)
      if (r.ok) { toast({ tone: 'good', text: r.detail }); setReqOpen(false); reqApi.reload() }
      else toast({ tone: 'alert', text: r.detail })
    } catch { toast({ tone: 'alert', text: '网络异常，请重试' }) } finally { setBusy(false) }
  }
  const reqStatus: Record<string, { label: string; tone: 'good' | 'warn' | 'neutral' | 'alert' }> = { pending: { label: '审批中', tone: 'warn' }, approved: { label: '已批准', tone: 'good' }, paid: { label: '已打款', tone: 'good' }, rejected: { label: '已驳回', tone: 'alert' } }
  return (
    <>
      <PageHeader title="我的分润" desc="你的分润结算与提现状态。" actions={data && <Button variant="primary" onClick={() => { setAmount(data.payoutPending); setAmountErr(''); setReqOpen(true) }} disabled={!data || data.payoutPending <= 0}>申请提现</Button>} />
      <PortalState state={state} data={data} reload={reload} emptyWhen={(d) => d == null} emptyTitle="暂无分润">
        {(d) => !d ? null : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card><Stat label="待结分润" value={money(d.payoutPending)} sub={<span>T+N 账期</span>} /></Card>
              <Card><Stat label="累计已结" value={money(d.settledTotal)} /></Card>
              <Card><Stat label="保证金" value={money(d.deposit)} /></Card>
              <Card><Stat label="首单 ROI" value={d.roi.toFixed(2)} sub={<span className={d.roi >= 1.5 ? 'text-good-ink' : 'text-warn-ink'}>投放效率</span>} /></Card>
            </div>
            {(reqApi.data ?? []).length > 0 && (
              <Card className="mt-4" pad={false}>
                <div className="p-5 pb-3"><CardTitle title="提现申请" desc="平台审批后打款到结算账户" /></div>
                <TableShell className="px-2 pb-2" head={<><Th className="pl-3">单号</Th><Th right>金额</Th><Th right>状态</Th></>}>
                  {(reqApi.data ?? []).map((r) => (
                    <Row key={r.id}><Td className="pl-3 text-[12.5px] font-medium text-ink">{r.id}</Td><Td right mono>{money(r.amount)}</Td><Td right><Badge tone={(reqStatus[r.status] ?? reqStatus.pending).tone}>{(reqStatus[r.status] ?? reqStatus.pending).label}</Badge></Td></Row>
                  ))}
                </TableShell>
              </Card>
            )}
            <Card className="mt-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-good-soft text-good-ink"><TrendingUp size={17} /></span>
                <div className="text-[12.5px] leading-relaxed text-ink-3">待结分润将按信用分联动的结算优先级，在账期到达后释放到可提现余额。信用分越高，结算越靠前。</div>
              </div>
            </Card>
          </>
        )}
      </PortalState>
      {reqOpen && (
        <Modal open onClose={() => setReqOpen(false)} width={420} title="申请提现" footer={<><Button variant="ghost" onClick={() => setReqOpen(false)} disabled={busy}>取消</Button><Button variant="primary" onClick={submit} loading={busy}>提交申请</Button></>}>
          <div className="mb-3 text-[12px] text-ink-3">可提现余额 {money(data?.payoutPending ?? 0)}，申请后等待平台审批。</div>
          <Field label="提现金额 ¥"><Input type="number" min={0} value={amount} onChange={(e) => { setAmount(+e.target.value); setAmountErr('') }} /></Field>
          {amountErr && <div className="mt-1.5 text-[11.5px] text-alert-ink">{amountErr}</div>}
        </Modal>
      )}
    </>
  )
}

type AgentCreditData = { name: string; creditScore: number; status: string; refundRate: number; complaintRate: number; renewalRate: number } | null
export function AgentCredit() {
  const { data, state, reload } = usePortalResource<AgentCreditData>(() => portalApi.agentCredit())
  return (
    <>
      <PageHeader title="我的信用分" desc="信用分决定你的结算优先级与可投额度。" />
      <PortalState state={state} data={data} reload={reload} emptyWhen={(d) => d == null} emptyTitle="暂无信用分">
        {(d) => !d ? null : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
            <Card>
              <CardTitle title="当前信用分" desc={d.status === 'active' ? '正常' : d.status} right={<Badge tone={d.creditScore >= 800 ? 'good' : d.creditScore >= 600 ? 'warn' : 'alert'}>{d.creditScore >= 800 ? '优质' : d.creditScore >= 600 ? '正常' : '受限'}</Badge>} />
              <Gauge value={d.creditScore} max={1000} target={800} decimals={0} status={d.creditScore >= 800 ? '优质' : d.creditScore >= 600 ? '正常' : '受限'} />
            </Card>
            <Card>
              <CardTitle title="构成指标" desc="影响信用分的关键行为" />
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-line p-3"><div className="text-[11px] text-ink-4">退款率</div><div className="mt-1 text-[15px] font-semibold tnum text-ink">{pct(d.refundRate, 2)}</div></div>
                <div className="rounded-lg border border-line p-3"><div className="text-[11px] text-ink-4">投诉率</div><div className="mt-1 text-[15px] font-semibold tnum text-ink">{pct(d.complaintRate, 2)}</div></div>
                <div className="rounded-lg border border-line p-3"><div className="text-[11px] text-ink-4">续费率</div><div className="mt-1 text-[15px] font-semibold tnum text-good-ink">{pct(d.renewalRate)}</div></div>
              </div>
              <div className="mt-3 rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">退款率、投诉率越低，续费率越高，信用分越高；高信用分带来更靠前的结算与更高可投额度。</div>
            </Card>
          </div>
        )}
      </PortalState>
    </>
  )
}

type ContractRow = { id: string; brandId: string; agentId: string | null; status: string; settleModel: string; targetGmv: number; reservePct?: number; agentSharePct?: number | null }
// 结算模型机器键 → 人话（表格与模拟器共用；直接渲染 'floor_tiered' 是给用户看代码）
// 取平台统一口径 SETTLE_MODEL_LABEL(data.ts)，避免本地再抄一份标签表导致与合约页文案漂移。
const settleLabel = (k: string) => SETTLE_MODEL[k as keyof typeof SETTLE_MODEL]?.label ?? k
export function AgentContracts() {
  const toast = useToast()
  const [rows, setRows] = useState<ContractRow[] | null>(null)
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [sim, setSim] = useState<ContractRow | null>(null) // 接单模拟器目标合约
  const load = () => {
    // 演示/真实两种模式都取数：portalApi 在演示态落到 portalDemo 的 scoped 合约（含可接挂单）
    portalApi.contracts<ContractRow[]>().then(setRows).catch(() => setErr(true))
  }
  useEffect(load, [])
  const claim = async (id: string) => {
    setBusy(id)
    try {
      const r = await portalApi.claimContract(id)
      if (r.ok) { load(); setSim(null); toast({ tone: 'good', text: `已接单 ${id}，进入履约` }) }
      else toast({ tone: 'alert', text: r.detail || '接单失败（可能已被接走）' })
    } catch { toast({ tone: 'alert', text: '网络异常，请重试' }) } finally {
      setBusy(null)
    }
  }
  return (
    <>
      <PageHeader title="我的接单" desc="你接下的增长合约 + 可接的挂单。接单前用「接单模拟器」估算分润与风险，再决定。" />
      {err ? <DemoNotice /> : (
        <Card pad={false}>
          <TableShell className="px-2 pb-2" head={<><Th className="pl-3">合约</Th><Th>品牌</Th><Th>结算模型</Th><Th right>目标 GMV</Th><Th right>状态</Th><Th right>操作</Th></>}>
            {(rows ?? []).map((c) => {
              const claimable = c.agentId == null && c.status === 'open'
              return (
                <Row key={c.id}>
                  <Td className="pl-3 text-[12.5px] font-medium text-ink">{c.id}</Td>
                  <Td className="text-[12px] text-ink-3">{c.brandId}</Td>
                  <Td>{settleLabel(c.settleModel)}{c.agentSharePct ? <span className="ml-1 text-[11px] text-ink-4">· {c.agentSharePct}%</span> : null}</Td>
                  <Td right mono>{money(c.targetGmv)}</Td>
                  <Td right><Badge tone={claimable ? 'info' : c.status === 'active' || c.status === 'fulfilling' ? 'good' : 'neutral'}>{claimable ? '挂单中' : c.status}</Badge></Td>
                  <Td right>
                    {claimable
                      ? <button onClick={() => setSim(c)} className="rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white hover:bg-brand-hover">接单</button>
                      : <span className="text-[12px] text-ink-4">—</span>}
                  </Td>
                </Row>
              )
            })}
          </TableShell>
        </Card>
      )}
      {sim && <BidSimulator c={sim} busy={busy === sim.id} onClose={() => setSim(null)} onConfirm={() => claim(sim.id)} />}
    </>
  )
}

/* 接单模拟器：拖 GMV 滑杆 → 实时估分润/准备金占用/违约风险。把"划不划算"从心算变滑杆。
   数字纪律：分成比例取合约真实 agentSharePct（品牌发单时给的），不再拍脑袋 35%；
   准备金取合约 reservePct；互销额度模型没有 CPS 分成语义——不给假算，改为解释卡。 */
function BidSimulator({ c, busy, onClose, onConfirm }: { c: ContractRow; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const safeTarget = Math.max(c.targetGmv, 10000) // 防 targetGmv=0 的滑杆 min=max 失真（后端已拦，防御兜底）
  const [gmv, setGmv] = useState(Math.round(safeTarget * 0.6))
  const isQuota = c.settleModel === 'mutual_quota'
  const isTiered = c.settleModel === 'floor_tiered'
  // 分润比例：合约真实值优先；无值时按模型给保守默认并明示"估"
  const shareFromContract = c.agentSharePct != null && c.agentSharePct > 0
  const sharePct = (shareFromContract ? c.agentSharePct! : isTiered ? 28 : 30) / 100
  const reservePct = (c.reservePct ?? 10) / 100
  const payout = Math.round(gmv * sharePct)
  const reserve = Math.round(payout * reservePct)
  const net = payout - reserve
  const hitTarget = gmv >= safeTarget
  const risk = gmv < safeTarget * 0.5 ? '偏低：达不到目标 GMV 可能触发违约条款' : hitTarget ? '达标：可拿满额分润，无违约风险' : '中等：接近目标，注意投放节奏'
  const riskTone = gmv < safeTarget * 0.5 ? 'alert' : hitTarget ? 'good' : 'warn'
  const T = { alert: 'text-alert-ink', warn: 'text-warn-ink', good: 'text-good-ink' } as const
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center px-4" style={{ animation: 'fadeIn .2s both' }}>
      <div className="absolute inset-0 bg-ink/45" onClick={onClose} />
      <div className="relative w-full max-w-[440px] rounded-2xl bg-surface p-5 shadow-[var(--shadow-pop)]" style={{ animation: 'revUpSm .2s both' }}>
        <div className="mb-1 text-[15px] font-semibold text-ink">接单模拟器 · {c.id}</div>
        <div className="text-[12px] text-ink-4">{c.brandId} · {settleLabel(c.settleModel)} · 目标 GMV {money(c.targetGmv)}</div>

        {isQuota ? (
          /* 互销额度：以量换量，不存在 CPS 分成——给解释而不是假数字 */
          <div className="mt-4 rounded-xl border border-line bg-surface-muted/50 p-4 text-[12.5px] leading-relaxed text-ink-2">
            该合约为<b>互销额度</b>模型：双方以约定额度互相导量（如曝光位 × 会员权益），
            不按 GMV 分成结算，收益体现在你自有业务的转化上。确认接单前请核对额度与结算口径条款。
          </div>
        ) : (
          <>
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[12.5px]"><span className="text-ink-2">预估你能做到的 GMV</span><span className="tnum font-semibold text-brand">{money(gmv)}</span></div>
              <input type="range" min={Math.round(safeTarget * 0.2)} max={Math.round(safeTarget * 1.5)} step={10000} value={gmv} onChange={(e) => setGmv(Number(e.target.value))} className="w-full accent-brand" />
              <div className="mt-0.5 flex justify-between text-[10px] text-ink-5"><span>{money(Math.round(safeTarget * 0.2))}</span><span>目标 {money(c.targetGmv)}</span><span>{money(Math.round(safeTarget * 1.5))}</span></div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <SimBox k="预估分润" v={money(payout)} sub={`${Math.round(sharePct * 100)}% 分成${shareFromContract ? '（合约值）' : '（估）'}`} />
              <SimBox k="准备金占用" v={money(reserve)} sub={`${Math.round(reservePct * 100)}% 冻结`} />
              <SimBox k="预估净入" v={money(net)} sub="释放后可提" highlight />
            </div>
            {isTiered && <p className="mt-2 text-[10.5px] leading-relaxed text-ink-4">保底 + 阶梯模型为线性近似估算：实际结算按达标区间阶梯计费，达标越多单位分成越高。</p>}

            <div className={cx('mt-3 rounded-lg px-3 py-2 text-[12px]', hitTarget ? 'bg-good-soft/50' : riskTone === 'alert' ? 'bg-alert-soft/50' : 'bg-warn-soft/50')}>
              <span className={cx('font-medium', T[riskTone])}>风险提示：</span>
              <span className="text-ink-3">{risk}</span>
            </div>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-surface-muted">再看看</button>
          <button onClick={onConfirm} disabled={busy} className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50">{busy ? '接单中…' : '确认接单'}</button>
        </div>
      </div>
    </div>
  )
}
function SimBox({ k, v, sub, highlight }: { k: string; v: string; sub: string; highlight?: boolean }) {
  return (
    <div className={cx('rounded-lg border px-2.5 py-2', highlight ? 'border-brand/25 bg-brand-soft/30' : 'border-line')}>
      <div className="text-[10.5px] text-ink-4">{k}</div>
      <div className={cx('tnum mt-0.5 text-[14px] font-semibold', highlight ? 'text-brand' : 'text-ink')}>{v}</div>
      <div className="text-[10px] text-ink-5">{sub}</div>
    </div>
  )
}

// 代理：相关工单（自己渠道引发的售后，可协助处理 / 回复）
type AgentTicketRow = { id: string; level: string; status: string; source: string; reason: string; slaLeftMin: number; handlePlan: string; note: string; handledBy: string }
export function AgentTickets() {
  const { data, state, reload } = usePortalResource<AgentTicketRow[]>(() => portalApi.agentTickets())
  const toast = useToast()
  const [filter, setFilter] = useState<'all' | 'open' | 'processing' | 'resolved'>('all')
  const [active, setActive] = useState<AgentTicketRow | null>(null)
  const [plan, setPlan] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false)
  const openReply = (t: AgentTicketRow) => { setActive(t); setPlan(t.handlePlan || ''); setNote(t.note || '') }
  const apply = (rows: AgentTicketRow[]) => rows.filter((t) => filter === 'all' || t.status === filter)
  const save = async (status?: string) => {
    if (!active) return
    setBusy(true)
    try {
      const r = await portalApi.agentReplyTicket(active.id, { handlePlan: plan, note, status })
      if (r.ok) { toast({ tone: 'good', text: status === 'processing' ? '协作处理已提交' : '处理办法已保存' }); setActive(null); reload() }
      else toast({ tone: 'alert', text: r.detail || '保存失败' })
    } catch { toast({ tone: 'alert', text: '网络异常，请重试' }) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHeader title="相关工单" desc="你的渠道引发的售后/投诉工单。可协助登记处理办法并与品牌、平台风控协同处置。" />
      <div className="mb-3"><Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: '全部' }, { value: 'open', label: '待处理' }, { value: 'processing', label: '处理中' }, { value: 'resolved', label: '已解决' }]} /></div>
      <PortalState state={state} data={data} reload={reload} skeleton={<TableSkeleton />} emptyWhen={(d) => d.length === 0} emptyTitle="暂无相关工单">
        {(d) => {
          const rows = apply(d)
          return (
            <Card pad={false}>
              <TableShell className="px-2 pb-2" head={<><Th className="pl-3">工单 / 事由</Th><Th>来源</Th><Th>级别</Th><Th right>时限</Th><Th right>状态</Th><Th right>处理</Th></>}>
                {rows.map((t) => {
                  const lv = TICKET_LEVEL[t.level] ?? TICKET_LEVEL.normal; const st = TICKET_STATUS[t.status] ?? TICKET_STATUS.open
                  return (
                    <Row key={t.id}>
                      <Td className="pl-3"><div className="text-[12.5px] font-medium text-ink tnum">{t.id}</div><div className="mt-0.5 max-w-[260px] truncate text-[11.5px] text-ink-4">{t.reason || '—'}</div></Td>
                      <Td className="text-[12px] text-ink-3">{TICKET_SOURCE[t.source] ?? t.source}</Td>
                      <Td><Badge tone={lv.tone}>{lv.label}</Badge></Td>
                      <Td right mono className={t.slaLeftMin < 60 && t.status !== 'resolved' ? 'text-alert-ink' : 'text-ink-3'}>{t.status === 'resolved' ? '—' : `${t.slaLeftMin}m`}</Td>
                      <Td right><Badge tone={st.tone} dot>{st.label}</Badge></Td>
                      <Td right><button onClick={() => openReply(t)} className="rounded-md px-2 py-1 text-[12px] font-medium text-brand hover:bg-brand-soft">{t.status === 'resolved' ? '查看' : '协助处理'}</button></Td>
                    </Row>
                  )
                })}
              </TableShell>
              <div className="border-t border-line px-5 py-2.5 text-[11.5px] text-ink-4">共 {rows.length} 单 · 待处理 {d.filter((t) => t.status !== 'resolved').length}</div>
            </Card>
          )
        }}
      </PortalState>
      <Modal open={!!active} onClose={() => setActive(null)} width={520} title={active ? `工单 ${active.id}` : ''}
        footer={active && active.status !== 'resolved' ? (
          <><Button variant="ghost" onClick={() => setActive(null)}>关闭</Button>
            <Button variant="ghost" onClick={() => save()} disabled={busy}>保存处理办法</Button>
            <Button variant="primary" onClick={() => save('processing')} disabled={busy}>提交协作处理</Button></>
        ) : <Button variant="ghost" onClick={() => setActive(null)}>关闭</Button>}>
        {active && (
          <div className="space-y-3.5">
            <div className="rounded-lg border border-line p-3"><div className="text-[10.5px] text-ink-4">投诉事由（来源：{TICKET_SOURCE[active.source] ?? active.source}）</div><div className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{active.reason || '—'}</div></div>
            {active.status === 'resolved' ? (
              <div className="rounded-lg border border-good/30 bg-good-soft/40 p-3"><div className="text-[10.5px] text-ink-4">处理办法</div><div className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{active.handlePlan || '—'}</div>{active.handledBy && <div className="mt-1 text-[11px] text-ink-4">处理方：{active.handledBy.startsWith('brand') ? '品牌方' : active.handledBy.startsWith('agent') ? '服务商' : '平台风控'}</div>}</div>
            ) : (
              <>
                <Field label="处理办法" hint="登记你的协助处置方案，品牌与平台风控可见"><Textarea value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="如：已核实订单为正常续费，向用户说明并提供使用引导…" rows={3} /></Field>
                <Field label="处理备注（选填）"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="内部备注" /></Field>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
