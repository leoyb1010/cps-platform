import { useState } from 'react'
import { Download, AlertTriangle, ArrowRight, FileSignature, Repeat } from 'lucide-react'
import { Card, CardTitle, Stat, PageHeader, Badge, Button, Segmented, TableShell, Th, Td, Row, CountUp } from '../../components/ui/primitives'
import { AreaLine, Sparkline } from '../../components/ui/charts'
import { Modal, useToast } from '../../components/ui/overlays'
import { Field, Input, Select, Textarea, CheckGroup } from '../../components/ui/forms'
import { Wizard } from '../../components/ui/Wizard'
import { PeriodFilter } from '../../components/ui/filters'
import { type PeriodValue } from '../../lib/period'
import { BARTER_RESOURCE_TYPES, INVOICE_STATUS } from '../../lib/dict'
import { TICKET_LEVEL, TICKET_STATUS, TICKET_SOURCE } from '../../lib/data'
import { portalApi, type BrandSummary } from '../../lib/portalApi'
import { usePortalResource, PortalState, TableSkeleton, exportCsv } from '../../components/portal/kit'
import { money, pct } from '../../lib/format'

export function BrandHome() {
  const [period, setPeriod] = useState<PeriodValue>({ preset: 'month' })
  const { data, state, reload } = usePortalResource<BrandSummary>(() => portalApi.summary<BrandSummary>(period), [period.preset, period.from, period.to])
  return (
    <>
      <PageHeader title="我的经营" desc="你的品牌在网易有道订阅增长平台的核心经营数据。" actions={<PeriodFilter value={period} onChange={setPeriod} />} />
      <PortalState state={state} data={data} reload={reload}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card>
                <Stat label="本月基础流水" value={money(d.gmvMtd)} sub={d.periodGross != null ? <span>本期成交 {money(d.periodGross)}</span> : <span>GMV</span>} />
                {d.trend.length > 1 && <div className="mt-2"><Sparkline data={d.trend.map((t) => t.value)} tone="brand" w={140} h={30} /></div>}
              </Card>
              <Card><Stat label="活跃订阅" value={<CountUp to={d.activeSubs} group />} sub={<span>连续包月</span>} /></Card>
              <Card><Stat label="续费率" value={<CountUp to={d.renewalRate} decimals={1} suffix="%" />} sub={<span className={d.renewalRate >= 60 ? 'text-good-ink' : 'text-warn-ink'}>LTV 核心驱动</span>} /></Card>
              <Card><Stat label="我的回款" value={money(d.brandShare)} hint="品牌回款侧，不含平台费与代理分润" sub={<span className="text-good-ink">累计品牌留存回款</span>} /></Card>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
              <Card>
                <CardTitle title="成交趋势" desc="近期每日成交额（退款/拒付计负）" />
                {d.trend.length > 1
                  ? <AreaLine data={d.trend.map((t) => t.value)} labels={d.trend.map((t) => t.date.slice(5))} tone="brand" height={200} />
                  : <div className="grid h-[200px] place-items-center text-[12px] text-ink-4">数据点不足，暂不绘制趋势</div>}
              </Card>
              <Card>
                <CardTitle title="需关注" desc="待你处理或留意的事项" />
                <div className="space-y-2.5">
                  {d.pendingTickets > 0
                    ? <Todo tone="warn" icon={<AlertTriangle size={15} />} title={`${d.pendingTickets} 个工单待处理`} sub="投诉工单需关注，及时响应可压低升级率" to="/portal/brand/tickets" />
                    : <div className="rounded-lg border border-line bg-good-soft/40 p-3 text-[12px] text-good-ink">暂无待处理工单 ✓</div>}
                  {d.complaintRate >= 0.9 && <Todo tone="alert" icon={<AlertTriangle size={15} />} title={`投诉率偏高 ${pct(d.complaintRate)}`} sub="逼近阈值可能触发号池降权" to="/portal/brand/onboarding" />}
                  <Todo tone="info" title={`${d.orders} 笔订单`} sub="查看你的订单流水明细" to="/portal/brand/orders" />
                </div>
              </Card>
            </div>
          </>
        )}
      </PortalState>
    </>
  )
}

function Todo({ tone, icon, title, sub, to }: { tone: 'warn' | 'alert' | 'info'; icon?: React.ReactNode; title: string; sub: string; to: string }) {
  const cls = tone === 'alert' ? 'border-alert/25 bg-alert-soft/40' : tone === 'warn' ? 'border-warn/25 bg-warn-soft/40' : 'border-line bg-surface-muted'
  return (
    <a href={`#${to}`} className={`flex items-center gap-2.5 rounded-lg border p-3 transition-colors hover:border-brand/40 ${cls}`}>
      {icon && <span className={tone === 'alert' ? 'text-alert-ink' : tone === 'warn' ? 'text-warn-ink' : 'text-ink-3'}>{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-ink">{title}</div>
        <div className="text-[11px] text-ink-4">{sub}</div>
      </div>
      <ArrowRight size={14} className="shrink-0 text-ink-4" />
    </a>
  )
}

type BrandOrderRow = { id: string; plan: string; type: string; amount: number; time: string; channel: string }
export function BrandOrders() {
  const [type, setType] = useState<'all' | 'first' | 'renew' | 'refund'>('all')
  const [q, setQ] = useState('')
  // type 走服务端过滤（真实类型筛选）；搜索在前端做轻量匹配
  const { data, state, reload } = usePortalResource<BrandOrderRow[]>(() => portalApi.brandOrders(type === 'all' ? undefined : { type }), [type])
  const apply = (rows: BrandOrderRow[]) => rows.filter((o) => !q || o.id.toLowerCase().includes(q.toLowerCase()) || (o.plan || '').includes(q))
  return (
    <>
      <PageHeader
        title="我的订单"
        desc="你的品牌的订单流水（渠道已脱敏）。可按类型快速筛选、搜索订单号。"
        actions={data && <Button variant="ghost" onClick={() => exportCsv('我的订单.csv', apply(data), [
          { key: 'id', label: '订单', get: (r) => r.id }, { key: 'plan', label: '套餐', get: (r) => r.plan }, { key: 'type', label: '类型', get: (r) => r.type }, { key: 'channel', label: '渠道', get: (r) => r.channel }, { key: 'amount', label: '金额', get: (r) => r.amount }, { key: 'time', label: '时间', get: (r) => r.time },
        ])}><Download size={14} /> 导出 CSV</Button>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={type} onChange={setType} options={[{ value: 'all', label: '全部' }, { value: 'first', label: '首单' }, { value: 'renew', label: '续费' }, { value: 'refund', label: '退款/拒付' }]} />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索订单号 / 套餐" className="h-8 max-w-[220px]" />
      </div>
      <PortalState state={state} data={data} reload={reload} skeleton={<TableSkeleton />} emptyWhen={(d) => d.length === 0} emptyTitle="暂无订单">
        {(d) => {
          const rows = apply(d)
          return (
            <Card pad={false}>
              <TableShell className="px-2 pb-2" head={<><Th className="pl-3">订单</Th><Th>套餐</Th><Th>类型</Th><Th>渠道</Th><Th right>金额</Th><Th right>时间</Th></>}>
                {rows.map((o) => (
                  <Row key={o.id}>
                    <Td className="pl-3 text-[12.5px] font-medium text-ink">{o.id}</Td>
                    <Td>{o.plan}</Td>
                    <Td><Badge tone={o.type === 'refund' || o.type === 'chargeback' ? 'alert' : o.type === 'renew' ? 'good' : 'info'}>{o.type}</Badge></Td>
                    <Td className="text-[12px] text-ink-3">{o.channel}</Td>
                    <Td right mono>{money(o.amount)}</Td>
                    <Td right className="text-[12px] text-ink-4">{o.time}</Td>
                  </Row>
                ))}
              </TableShell>
              <div className="border-t border-line px-5 py-2.5 text-[11.5px] text-ink-4">共 {rows.length} 笔</div>
            </Card>
          )
        }}
      </PortalState>
    </>
  )
}

type BrandSettleRow = { id: string; period: string; gross: number; brandShare: number; reserve: number; status: string }
export function BrandSettlement() {
  const [status, setStatus] = useState<'all' | 'cleared' | 'pending'>('all')
  const [q, setQ] = useState('')
  // 状态走服务端过滤；周期/单号用前端搜索（结算 period 是自由字符串）
  const { data, state, reload } = usePortalResource<BrandSettleRow[]>(() => portalApi.brandSettlements(status === 'all' ? undefined : { status: status === 'pending' ? 'pending' : 'cleared' }), [status])
  const apply = (rows: BrandSettleRow[]) => rows.filter((s) => !q || s.id.toLowerCase().includes(q.toLowerCase()) || s.period.includes(q))
  return (
    <>
      <PageHeader
        title="我的结算单"
        desc="按结算周期 · 仅显示你的流水、回款与准备金（不含平台费口径）。可按状态筛选、搜索周期。"
        actions={data && <Button variant="ghost" onClick={() => exportCsv('我的结算单.csv', apply(data), [
          { key: 'id', label: '结算单', get: (r) => r.id }, { key: 'period', label: '周期', get: (r) => r.period }, { key: 'gross', label: '流水', get: (r) => r.gross }, { key: 'brandShare', label: '品牌回款', get: (r) => r.brandShare }, { key: 'reserve', label: '准备金', get: (r) => r.reserve }, { key: 'status', label: '状态', get: (r) => r.status },
        ])}><Download size={14} /> 导出 CSV</Button>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'all', label: '全部' }, { value: 'cleared', label: '已结算' }, { value: 'pending', label: '待结算' }]} />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索结算单号 / 周期" className="h-8 max-w-[220px]" />
      </div>
      <PortalState state={state} data={data} reload={reload} skeleton={<TableSkeleton />} emptyWhen={(d) => d.length === 0} emptyTitle="暂无结算单">
        {(d) => {
          const rows = apply(d)
          return (
          <Card pad={false}>
            <TableShell className="px-2 pb-2" head={<><Th className="pl-3">结算单</Th><Th>周期</Th><Th right>流水 Gross</Th><Th right>品牌回款</Th><Th right>准备金</Th><Th right>状态</Th></>}>
              {rows.map((s) => (
                <Row key={s.id}>
                  <Td className="pl-3 text-[12.5px] font-medium text-ink">{s.id}</Td>
                  <Td>{s.period}</Td>
                  <Td right mono>{money(s.gross)}</Td>
                  <Td right mono className="font-medium text-ink">{money(s.brandShare)}</Td>
                  <Td right mono>{money(s.reserve)}</Td>
                  <Td right><Badge tone={s.status === 'cleared' ? 'good' : 'warn'}>{s.status === 'cleared' ? '已结算' : '待结算'}</Badge></Td>
                </Row>
              ))}
            </TableShell>
            <div className="border-t border-line px-5 py-2.5 text-[11.5px] text-ink-4">共 {rows.length} 单</div>
          </Card>
          )
        }}
      </PortalState>
    </>
  )
}

type BrandOnboardingData = { name: string; status: string; category: string; feeRate: number; period: number; reservePct: number; path: string } | null
export function BrandOnboarding() {
  const { data, state, reload } = usePortalResource<BrandOnboardingData>(() => portalApi.brandOnboarding())
  return (
    <>
      <PageHeader title="我的入驻" desc="你的品牌接入配置与准入状态。" />
      <PortalState state={state} data={data} reload={reload} emptyWhen={(d) => d == null} emptyTitle="暂无入驻信息">
        {(d) => !d ? null : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Card><Stat label="入驻状态" value={d.status === 'live' ? '已上线' : d.status === 'review' ? '审核中' : d.status} sub={<Badge tone={d.status === 'live' ? 'good' : 'warn'}>{d.status === 'live' ? '正常' : '处理中'}</Badge>} /></Card>
            <Card><Stat label="业务种类" value={d.category} /></Card>
            <Card><Stat label="结算费率" value={pct(d.feeRate)} /></Card>
            <Card><Stat label="账期" value={`T+${d.period}`} /></Card>
            <Card><Stat label="风险准备金" value={`${d.reservePct}%`} /></Card>
            <Card><Stat label="资金路径" value={d.path === 'direct' ? '直连' : d.path === 'licensed' ? '持牌分账' : '混合'} /></Card>
          </div>
        )}
      </PortalState>
    </>
  )
}

type BrandTicketRow = { id: string; brandId: string; level: string; status: string; source: string; reason: string; owner: string; slaLeftMin: number; time: string; handlePlan: string; note: string; handledBy: string }

export function BrandTickets() {
  const { data, state, reload } = usePortalResource<BrandTicketRow[]>(() => portalApi.brandTickets())
  const toast = useToast()
  const [filter, setFilter] = useState<'all' | 'open' | 'processing' | 'resolved'>('all')
  const [q, setQ] = useState('')
  const [active, setActive] = useState<BrandTicketRow | null>(null)
  const [plan, setPlan] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false)
  const openReply = (t: BrandTicketRow) => { setActive(t); setPlan(t.handlePlan || ''); setNote(t.note || '') }
  const apply = (rows: BrandTicketRow[]) => rows.filter((t) =>
    (filter === 'all' || t.status === filter) && (!q || t.id.toLowerCase().includes(q.toLowerCase()) || (t.reason || '').includes(q)))
  const save = async (status?: string) => {
    if (!active) return
    setBusy(true)
    try {
      const r = await portalApi.replyTicket(active.id, { handlePlan: plan, note, status })
      if (r.ok) { toast({ tone: 'good', text: status === 'resolved' ? '工单已标记解决' : '处理办法已保存' }); setActive(null); reload() }
      else toast({ tone: 'alert', text: r.detail || '保存失败' })
    } catch { toast({ tone: 'alert', text: '网络异常，请重试' }) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHeader title="我的工单" desc="与你品牌相关的售后/投诉工单。可登记处理办法、回复并流转状态，与平台风控协同处置。" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: '全部' }, { value: 'open', label: '待处理' }, { value: 'processing', label: '处理中' }, { value: 'resolved', label: '已解决' }]} />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索工单号 / 事由" className="h-8 max-w-[220px]" />
      </div>
      <PortalState state={state} data={data} reload={reload} skeleton={<TableSkeleton />} emptyWhen={(d) => d.length === 0} emptyTitle="暂无工单" >
        {(d) => {
          const rows = apply(d)
          return (
            <Card pad={false}>
              <TableShell className="px-2 pb-2" head={<><Th className="pl-3">工单 / 事由</Th><Th>来源</Th><Th>级别</Th><Th right>时限</Th><Th right>状态</Th><Th right>处理</Th></>}>
                {rows.map((t) => {
                  const lv = TICKET_LEVEL[t.level] ?? TICKET_LEVEL.normal
                  const st = TICKET_STATUS[t.status] ?? TICKET_STATUS.open
                  return (
                    <Row key={t.id}>
                      <Td className="pl-3">
                        <div className="text-[12.5px] font-medium text-ink tnum">{t.id}</div>
                        <div className="mt-0.5 max-w-[260px] truncate text-[11.5px] text-ink-4">{t.reason || '—'}</div>
                      </Td>
                      <Td className="text-[12px] text-ink-3">{TICKET_SOURCE[t.source] ?? t.source}</Td>
                      <Td><Badge tone={lv.tone}>{lv.label}</Badge></Td>
                      <Td right mono className={t.slaLeftMin < 60 && t.status !== 'resolved' ? 'text-alert-ink' : 'text-ink-3'}>{t.status === 'resolved' ? '—' : `${t.slaLeftMin}m`}</Td>
                      <Td right><Badge tone={st.tone} dot>{st.label}</Badge></Td>
                      <Td right><button onClick={() => openReply(t)} className="rounded-md px-2 py-1 text-[12px] font-medium text-brand hover:bg-brand-soft">{t.status === 'resolved' ? '查看' : '处理'}</button></Td>
                    </Row>
                  )
                })}
              </TableShell>
              <div className="border-t border-line px-5 py-2.5 text-[11.5px] text-ink-4">共 {rows.length} 单 · 待处理 {d.filter((t) => t.status !== 'resolved').length}</div>
            </Card>
          )
        }}
      </PortalState>

      {/* 工单详情 + 处理 */}
      <Modal open={!!active} onClose={() => setActive(null)} width={520} title={active ? `工单 ${active.id}` : ''}
        footer={active && active.status !== 'resolved' ? (
          <><Button variant="ghost" onClick={() => setActive(null)}>关闭</Button>
            <Button variant="ghost" onClick={() => save()} disabled={busy}>保存处理办法</Button>
            <Button variant="primary" onClick={() => save('resolved')} disabled={busy}>标记已解决</Button></>
        ) : <Button variant="ghost" onClick={() => setActive(null)}>关闭</Button>}>
        {active && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-2.5 text-[12px]">
              <div className="rounded-lg bg-surface-muted px-3 py-2"><div className="text-[10.5px] text-ink-4">来源</div><div className="mt-0.5 font-medium text-ink">{TICKET_SOURCE[active.source] ?? active.source}</div></div>
              <div className="rounded-lg bg-surface-muted px-3 py-2"><div className="text-[10.5px] text-ink-4">级别</div><div className="mt-0.5"><Badge tone={(TICKET_LEVEL[active.level] ?? TICKET_LEVEL.normal).tone}>{(TICKET_LEVEL[active.level] ?? TICKET_LEVEL.normal).label}</Badge></div></div>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="text-[10.5px] text-ink-4">投诉事由</div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{active.reason || '—'}</div>
            </div>
            {active.status === 'resolved' ? (
              <>
                <div className="rounded-lg border border-good/30 bg-good-soft/40 p-3">
                  <div className="text-[10.5px] text-ink-4">处理办法</div>
                  <div className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{active.handlePlan || '—'}</div>
                  {active.note && <div className="mt-2 border-t border-line/60 pt-2 text-[11.5px] text-ink-3">备注：{active.note}</div>}
                  {active.handledBy && <div className="mt-1 text-[11px] text-ink-4">处理方：{active.handledBy.startsWith('brand') ? '品牌方' : active.handledBy.startsWith('agent') ? '服务商' : '平台风控'}</div>}
                </div>
              </>
            ) : (
              <>
                <Field label="处理办法" hint="登记你的处置方案，平台风控与对接服务商可见"><Textarea value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="如：已为用户办理退款并致歉，补偿 1 个月会员…" rows={3} /></Field>
                <Field label="处理备注（选填）"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="内部备注" /></Field>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

type BrandBarterRow = { id: string; partner: string; iAmInitiator: boolean; status: string; resourceType: string; myQuota: number; counterpartyQuota: number; invoiceStatus: string }
export function BrandBarter() {
  const toast = useToast()
  const { data, state, reload } = usePortalResource<BrandBarterRow[]>(() => portalApi.brandBarter())
  const marketApi = usePortalResource<{ id: string; name: string }[]>(() => portalApi.marketBrands())
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ counterpartyBrandId: '', resourceType: '广告位', myQuota: 500000, counterpartyQuota: 500000, invoiceStatus: 'pending' })
  const [bterms, setBterms] = useState({ valuation: '', deliveryWindow: '', note: '' })
  const respond = async (id: string, action: 'accept' | 'reject') => {
    try {
      const r = await portalApi.respondBarter(id, action)
      if (r.ok) { toast({ tone: 'good', text: r.detail }); reload() }
      else toast({ tone: 'alert', text: r.detail })
    } catch { toast({ tone: 'alert', text: '网络异常，请重试' }) }
  }
  const propose = async () => {
    if (!f.counterpartyBrandId) { toast({ tone: 'info', text: '请选择对手品牌' }); return }
    setBusy(true) // 提交期间禁按钮，防双击发出重复置换提议
    try {
      const r = await portalApi.proposeBarter({ ...f, terms: bterms })
      if (r.ok) { toast({ tone: 'good', text: '置换提议已发出，等待对手品牌应答' }); setOpen(false); reload() }
      else toast({ tone: 'alert', text: '发起失败，请重试' })
    } catch { toast({ tone: 'alert', text: '网络异常，请重试' }) } finally { setBusy(false) }
  }
  const others = (marketApi.data ?? [])
  return (
    <>
      <PageHeader title="资源置换" desc="与其它品牌互相开票、各自确认收入的等值置换台账。可主动向其它品牌发起置换，对手方应答。" actions={<Button variant="primary" onClick={() => { if (others[0] && !f.counterpartyBrandId) setF((x) => ({ ...x, counterpartyBrandId: others[0].id })); setOpen(true) }}><Repeat size={14} /> 发起置换</Button>} />
      <PortalState state={state} data={data} reload={reload} skeleton={<TableSkeleton />} emptyWhen={(d) => d.length === 0} emptyTitle="暂无置换单">
        {(d) => (
          <Card pad={false}>
            <TableShell className="px-2 pb-2" head={<><Th className="pl-3">置换单</Th><Th>对手品牌</Th><Th>资源</Th><Th>角色</Th><Th right>我方额度</Th><Th right>对手额度</Th><Th right>状态</Th><Th right>操作</Th></>}>
              {d.map((x) => {
                const canRespond = !x.iAmInitiator && x.status === 'proposed'
                return (
                  <Row key={x.id}>
                    <Td className="pl-3 text-[12.5px] font-medium text-ink">{x.id}</Td>
                    <Td className="text-[12px] text-ink-3">{x.partner}</Td>
                    <Td>{x.resourceType}</Td>
                    <Td><Badge tone={x.iAmInitiator ? 'info' : 'neutral'}>{x.iAmInitiator ? '我发起' : '待我确认'}</Badge></Td>
                    <Td right mono>{money(x.myQuota)}</Td>
                    <Td right mono>{money(x.counterpartyQuota)}</Td>
                    <Td right><Badge tone={x.status === 'active' || x.status === 'settled' ? 'good' : x.status === 'rejected' ? 'alert' : 'neutral'}>{x.status}</Badge></Td>
                    <Td right>
                      {canRespond
                        ? <div className="flex justify-end gap-1.5">
                            <button onClick={() => respond(x.id, 'accept')} className="rounded-md px-2 py-1 text-[12px] font-medium text-good-ink hover:bg-good-soft">接受</button>
                            <button onClick={() => respond(x.id, 'reject')} className="rounded-md px-2 py-1 text-[12px] font-medium text-alert-ink hover:bg-alert-soft">拒绝</button>
                          </div>
                        : <span className="text-[12px] text-ink-4">—</span>}
                    </Td>
                  </Row>
                )
              })}
            </TableShell>
          </Card>
        )}
      </PortalState>
      {open && (
        <Modal open onClose={() => setOpen(false)} width={500} title="发起资源置换" footer={<><Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>取消</Button><Button variant="primary" onClick={propose} loading={busy}>发起提议</Button></>}>
          <div className="space-y-3">
            <Field label="对手品牌"><Select value={f.counterpartyBrandId} onChange={(e) => setF({ ...f, counterpartyBrandId: e.target.value })}>{others.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="资源类型"><Select value={f.resourceType} onChange={(e) => setF({ ...f, resourceType: e.target.value })}>{BARTER_RESOURCE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
              <Field label="开票状态"><Select value={f.invoiceStatus} onChange={(e) => setF({ ...f, invoiceStatus: e.target.value })}>{INVOICE_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="我方额度 ¥"><Input type="number" value={f.myQuota} onChange={(e) => setF({ ...f, myQuota: +e.target.value })} /></Field>
              <Field label="对手额度 ¥"><Input type="number" value={f.counterpartyQuota} onChange={(e) => setF({ ...f, counterpartyQuota: +e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="估值口径"><Input value={bterms.valuation} onChange={(e) => setBterms({ ...bterms, valuation: e.target.value })} placeholder="如：刊例价 × 0.6 折" /></Field>
              <Field label="交付窗口"><Input value={bterms.deliveryWindow} onChange={(e) => setBterms({ ...bterms, deliveryWindow: e.target.value })} placeholder="如：Q3" /></Field>
            </div>
            <Field label="备注"><Textarea rows={2} value={bterms.note} onChange={(e) => setBterms({ ...bterms, note: e.target.value })} placeholder="联合活动说明等" /></Field>
          </div>
        </Modal>
      )}
    </>
  )
}

type BrandContractRow = { id: string; brandId: string; status: string; settleModel: string; targetGmv: number }
const BC_REGIONS = ['华东', '华北', '华南', '华中', '西南', '东北', '西北']
const BC_CROWDS = ['学生', '职场', '银发', '宝妈', '游戏', '泛娱乐']

export function BrandContracts() {
  const toast = useToast()
  const { data, state, reload } = usePortalResource<BrandContractRow[]>(() => portalApi.contracts())
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ settleModel: 'cps_share', targetGmv: 1000000, agentSharePct: 30, ltvWindow: 'D30', crowdScope: 'all' as 'all' | 'new' | 'old', regions: [] as string[], crowds: [] as string[], complaintLiability: 'agent', reservePct: 10 })
  const submit = async () => {
    setBusy(true)
    try {
      const r = await portalApi.proposeContract({
        settleModel: f.settleModel, targetGmv: f.targetGmv, ltvWindow: f.ltvWindow,
        settleParams: { agentSharePct: f.agentSharePct },
        userLimit: { newOnly: f.crowdScope === 'new', oldOnly: f.crowdScope === 'old', regions: f.regions, crowd: f.crowds },
        complaintLiability: f.complaintLiability, reservePct: f.reservePct,
      })
      if (r.ok) { toast({ tone: 'good', text: '增长合约已发起（挂单），等待渠道接单' }); setOpen(false); setStep(0) }
      else toast({ tone: 'alert', text: '发起失败，请重试' })
    } catch { toast({ tone: 'alert', text: '网络异常，请重试' }) } finally { setBusy(false); reload() }
  }
  return (
    <>
      <PageHeader title="我的增长合约" desc="发起品牌-渠道增长合约，挂单后由代理渠道接单履约。" actions={<Button variant="primary" onClick={() => setOpen(true)}><FileSignature size={14} /> 发起合约</Button>} />
      <PortalState state={state} data={data} reload={reload} skeleton={<TableSkeleton />} emptyWhen={(d) => d.length === 0} emptyTitle="暂无增长合约">
        {(d) => (
          <Card pad={false}>
            <TableShell className="px-2 pb-2" head={<><Th className="pl-3">合约</Th><Th>结算模型</Th><Th right>目标 GMV</Th><Th right>状态</Th></>}>
              {d.map((c) => (
                <Row key={c.id}>
                  <Td className="pl-3 text-[12.5px] font-medium text-ink">{c.id}</Td>
                  <Td>{c.settleModel}</Td>
                  <Td right mono>{money(c.targetGmv)}</Td>
                  <Td right><Badge tone={c.status === 'active' || c.status === 'fulfilling' ? 'good' : 'neutral'}>{c.status}</Badge></Td>
                </Row>
              ))}
            </TableShell>
          </Card>
        )}
      </PortalState>
      {open && (
        <Wizard open onClose={() => { setOpen(false); setStep(0) }} width={520} title="发起增长合约" steps={['模型 + 对价', '用户限定', '风控条款']} current={step}
          onBack={() => setStep((s) => s - 1)} onNext={() => setStep((s) => s + 1)} onSubmit={submit} canNext submitting={busy} submitLabel="发起（挂单）">
          {step === 0 && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="结算模型"><Select value={f.settleModel} onChange={(e) => setF({ ...f, settleModel: e.target.value })}><option value="cps_share">CPS 分成</option><option value="floor_tiered">保底+阶梯</option><option value="mutual_quota">互销额度</option></Select></Field>
                <Field label="LTV 窗口"><Select value={f.ltvWindow} onChange={(e) => setF({ ...f, ltvWindow: e.target.value })}><option>D30</option><option>D60</option><option>D90</option></Select></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="目标 GMV ¥"><Input type="number" value={f.targetGmv} onChange={(e) => setF({ ...f, targetGmv: +e.target.value })} /></Field>
                <Field label="给渠道分成 %" hint="你愿意给接单代理的分成比例"><Input type="number" value={f.agentSharePct} onChange={(e) => setF({ ...f, agentSharePct: +e.target.value })} /></Field>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-3.5">
              <Field label="客群范围"><Segmented value={f.crowdScope} onChange={(v) => setF({ ...f, crowdScope: v as 'all' | 'new' | 'old' })} options={[{ value: 'all', label: '不限' }, { value: 'new', label: '仅新客' }, { value: 'old', label: '仅老客' }]} /></Field>
              <Field label="地域定向" hint="留空＝不限"><CheckGroup options={BC_REGIONS} value={f.regions} onChange={(v) => setF({ ...f, regions: v })} /></Field>
              <Field label="人群定向" hint="留空＝不限"><CheckGroup options={BC_CROWDS} value={f.crowds} onChange={(v) => setF({ ...f, crowds: v })} /></Field>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="准备金 %"><Input type="number" value={f.reservePct} onChange={(e) => setF({ ...f, reservePct: +e.target.value })} /></Field>
                <Field label="投诉责任"><Select value={f.complaintLiability} onChange={(e) => setF({ ...f, complaintLiability: e.target.value })}><option value="agent">渠道承担</option><option value="brand">品牌承担</option><option value="shared">双方共担</option></Select></Field>
              </div>
              <div className="rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">合约挂单后由代理渠道主动接单；条款登记，资金动作在清结算完成。</div>
            </div>
          )}
        </Wizard>
      )}
    </>
  )
}
