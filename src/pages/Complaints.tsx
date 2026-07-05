import { useRef, useState } from 'react'
import { Clock, AlertTriangle, CheckCircle2, Headphones, ArrowRight, RotateCcw, ArrowUpCircle, UserCog } from 'lucide-react'
import {
  Card,
  CardTitle,
  Stat,
  PageHeader,
  Badge,
  Button,
  Segmented,
  BrandMark,
  TableShell,
  Th,
  Td,
  Row,
  TONE,
} from '../components/ui/primitives'
import { Donut } from '../components/ui/charts'
import { Confirm, Modal, useToast } from '../components/ui/overlays'
import { DetailPopover, Info, useAnchoredPopover, type AnchorRect } from '../components/ui/popover'
import { DocModal } from '../components/ui/DocModal'
import { Timeline, Field, Input, Select, Textarea } from '../components/ui/forms'
import { isRealApi } from '../lib/http'
import { bizApi } from '../lib/adminApi'
import {
  kpi,
  brandById,
  agentById,
  complaintBySource,
  COMPLAINT_SOURCE,
  COMPLAINT_LEVEL,
  COMPLAINT_STATUS,
  type Complaint,
  type ComplaintLevel,
} from '../lib/data'
import { useStore, resolveTicketWithRefund, updateTicket } from '../lib/store'
import { pct, cx } from '../lib/format'

export default function Complaints() {
  const s = useStore()
  const toast = useToast()
  const [lvl, setLvl] = useState<'all' | ComplaintLevel>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const pop = useAnchoredPopover()
  const deskBtnRef = useRef<HTMLSpanElement>(null)
  const [confirmRefund, setConfirmRefund] = useState<string | null>(null)
  const [slaOpen, setSlaOpen] = useState(false)
  const [ingestOpen, setIngestOpen] = useState(false)

  const complaints = s.complaints
  const pending = complaints.filter((c) => c.status === 'pending').length
  const escalated = complaints.filter((c) => c.level !== 'normal' && c.status !== 'resolved').length
  const resolved = complaints.filter((c) => c.status === 'resolved').length
  // SLA 达成率：真实模式从 store 的 complaints 近似（已解决 / 总量），无数据→null 显示 '—'；演示模式保留标杆 96.2%
  const slaRate = isRealApi ? (complaints.length > 0 ? (resolved / complaints.length) * 100 : null) : 96.2
  const urgent = complaints.filter((c) => c.status !== 'resolved' && c.slaLeftMin >= 0).sort((a, b) => a.slaLeftMin - b.slaLeftMin)
  const list = complaints.filter((c) => (lvl === 'all' ? true : c.level === lvl))
  const active = complaints.find((c) => c.id === openId) ?? null

  return (
    <>
      <PageHeader
        title="投诉工单"
        desc="多源聚合（平台 / 渠道 / 12315 / 黑猫 / 应用商店）· 分级 SLA 计时。在升级为「升级/监管投诉」前解决，是保住商户号的关键动作。"
        actions={
          <>
            <Button variant="ghost" onClick={() => setIngestOpen(true)}>外部接入</Button>
            <Button variant="ghost" onClick={() => setSlaOpen(true)}>SLA 规则</Button>
            <span ref={deskBtnRef} className="inline-flex"><Button variant="primary" onClick={() => { const first = urgent[0]; if (first) { setOpenId(first.id); if (deskBtnRef.current) pop.openAt(deskBtnRef.current) } else toast({ tone: 'good', text: '当前无临期工单' }) }}><Headphones size={14} /> 进入坐席台</Button></span>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card mark><Stat label="待处理工单" value={String(pending)} sub={<span className="text-alert-ink">含 SLA 临期</span>} /></Card>
        <Card mark><Stat label="升级 + 监管投诉" value={String(escalated)} hint="直接关联商户号红线" sub={<span>未解决</span>} /></Card>
        <Card mark><Stat label="今日已解决" value={String(resolved)} sub={<span className="text-good-ink">含退款联动</span>} /></Card>
        <Card mark><Stat label="SLA 达成率" value={slaRate === null ? <span className="text-ink-4">—</span> : pct(slaRate)} deltaTone="good" sub={<span>升级前解决率 88%</span>} /></Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle title="SLA 优先队列" desc="按剩余时效升序 · 点击处理" right={<Badge tone="alert" dot>实时计时</Badge>} />
          {urgent.length === 0 ? (
            <div className="grid place-items-center gap-1.5 py-8 text-center"><CheckCircle2 size={20} className="text-good-ink" /><div className="text-[13px] font-medium text-ink-2">无临期工单</div></div>
          ) : (
            <div className="space-y-2">
              {urgent.slice(0, 5).map((c) => {
                const b = brandById(c.brandId)
                const lv = COMPLAINT_LEVEL[c.level]
                const tone = c.slaLeftMin <= 30 ? 'alert' : c.slaLeftMin <= 90 ? 'warn' : 'good'
                return (
                  <button key={c.id} onClick={(e) => { setOpenId(c.id); pop.openAt(e) }} className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left hover:border-line-strong hover:bg-surface-muted">
                    <div className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-lg', TONE[tone].soft)}><Clock size={16} className={TONE[tone].ink} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="tnum text-[12.5px] font-medium text-ink">{c.id}</span><Badge tone={lv.tone}>{lv.label}</Badge><span className="text-[11px] text-ink-4">{COMPLAINT_SOURCE[c.source]}</span></div>
                      <div className="mt-0.5 truncate text-[11.5px] text-ink-3">{c.reason} · {b.name}</div>
                    </div>
                    <div className="text-right"><div className={cx('tnum text-[14px] font-semibold', TONE[tone].ink)}>{c.slaLeftMin}min</div><div className="text-[10.5px] text-ink-4">{c.owner === '未分配' ? '待分配' : c.owner}</div></div>
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle title="投诉来源分布" desc="本月占比" />
          <Donut items={complaintBySource} center={{ value: pct(kpi.complaintRate), label: '综合投诉率' }} size={120} />
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle title="工单处理闭环（人在环）" desc="事后售后的核心动作链" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          {[
            { t: '多源接入', d: '平台/渠道/12315/黑猫/商店' },
            { t: '自动分级', d: '普通 / 升级 / 监管' },
            { t: 'SLA 计时', d: '分级时效，临期告警' },
            { t: '退款联动', d: '秒级退订 + 规则退款' },
            { t: '逆向冲账', d: '退款触发分润回收' },
            { t: '仲裁定责', d: '责任落到代理 / 品牌' },
          ].map((st, i, arr) => (
            <div key={st.t} className="flex flex-1 items-center gap-2">
              <div className="flex-1 rounded-xl bg-surface-muted px-3 py-2.5"><div className="text-[12.5px] font-medium text-ink">{st.t}</div><div className="mt-0.5 text-[11px] text-ink-4">{st.d}</div></div>
              {i < arr.length - 1 && <ArrowRight size={14} className="hidden shrink-0 text-ink-4 md:block" />}
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <CardTitle title="工单列表" desc="今日全部来源 · 点击进入处理" />
          <Segmented value={lvl} onChange={setLvl} options={[{ value: 'all', label: '全部' }, { value: 'normal', label: '普通' }, { value: 'escalated', label: '升级' }, { value: 'regulatory', label: '监管' }]} />
        </div>
        <TableShell className="px-2 pb-2" head={<><Th className="pl-3">工单 / 时间</Th><Th>来源</Th><Th>等级</Th><Th>品牌 / 代理</Th><Th>投诉事由</Th><Th>处理人</Th><Th right>SLA</Th><Th right>状态</Th></>}>
          {list.map((c) => {
            const b = brandById(c.brandId)
            const lv = COMPLAINT_LEVEL[c.level]
            const st = COMPLAINT_STATUS[c.status]
            return (
              <Row key={c.id} onClick={(e) => { setOpenId(c.id); pop.openAt(e) }}>
                <Td className="pl-3"><div className="tnum text-[12.5px] font-medium text-ink">{c.id}</div><div className="text-[11px] text-ink-4">{c.time}</div></Td>
                <Td>{COMPLAINT_SOURCE[c.source]}</Td>
                <Td><Badge tone={lv.tone} dot={c.level !== 'normal'}>{lv.label}</Badge></Td>
                <Td><div className="flex items-center gap-2"><BrandMark brand={b.id} mark={b.mark} size={22} /><span className="tnum text-[12px] text-ink-2">{c.agentId}</span></div></Td>
                <Td className="max-w-[200px]"><span className="text-ink-2">{c.reason}</span></Td>
                <Td><span className={c.owner === '未分配' ? 'text-alert-ink' : 'text-ink-3'}>{c.owner}</span></Td>
                {/* SLA 三态：已解决 '—'；未解决且时效耗尽 → 「已超时」（不再与已解决混成 '—' 而漏掉超时未结单） */}
                <Td right mono>{c.status === 'resolved' ? <span className="text-ink-4">—</span> : c.slaLeftMin <= 0 ? <Badge tone="alert">已超时</Badge> : <span className={c.slaLeftMin <= 30 ? 'text-alert-ink' : c.slaLeftMin <= 90 ? 'text-warn-ink' : 'text-ink-2'}>{c.slaLeftMin}min</span>}</Td>
                <Td right><Badge tone={st.tone} dot>{st.label}</Badge></Td>
              </Row>
            )
          })}
        </TableShell>
      </Card>

      {/* 工单详情 + 处理 */}
      <TicketDrawer
        ticket={active}
        anchor={pop.anchorRect}
        onClose={() => { setOpenId(null); pop.close() }}
        onRefund={() => active && setConfirmRefund(active.id)}
        onEscalate={() => { if (active) { updateTicket(active.id, { level: 'regulatory', status: 'processing' }, `工单 ${active.id} 升级为监管投诉`); toast({ tone: 'warn', text: `工单 ${active.id} 已升级` }) } }}
        onAssign={() => { if (active) { updateTicket(active.id, { owner: '客服二组 · 周敏', status: 'processing' }, `工单 ${active.id} 转派至 客服二组·周敏`); toast({ tone: 'info', text: '已转派' }) } }}
        onClose2={() => { if (active) { updateTicket(active.id, { status: 'resolved', slaLeftMin: 0 }, `工单 ${active.id} 已关闭`); toast({ tone: 'good', text: '工单已关闭' }); setOpenId(null) } }}
      />

      <Confirm
        open={!!confirmRefund}
        onClose={() => setConfirmRefund(null)}
        onConfirm={() => { if (confirmRefund) { resolveTicketWithRefund(confirmRefund); toast({ tone: 'good', text: `已退款，联动冲账完成` }); setOpenId(null) } }}
        title="确认退款并联动冲账"
        confirmText="确认退款"
        body={<>将对工单 <span className="tnum font-medium text-ink">{confirmRefund}</span> 发起退款，并自动 <span className="font-medium text-ink">冲减代理分润、更新信用分、记录联动</span>。</>}
      />

      <DocModal
        open={slaOpen}
        onClose={() => setSlaOpen(false)}
        title="投诉工单 SLA 规则"
        intro="按投诉级别分档计时，超时自动升级，越早解决越能保住商户号。"
        sections={[
          { heading: '分级时效', bullets: ['普通投诉：24 小时内完结', '升级投诉：4 小时内响应处理', '监管投诉（12315 等）：2 小时内介入'] },
          { heading: '超时处置', bullets: ['超时未处理自动升级到上一级', '监管类超时触发风险预警', '关联商户号投诉率纳入号池健康度'] },
          { heading: '关键动作', bullets: ['及时退款 + 安抚可压住升级投诉率', '坐席台优先处理临期工单', '退款经坐席台联动逆向冲账'] },
        ]}
        downloadName="SLA规则.txt"
      />

      {ingestOpen && <IngestModal onClose={() => setIngestOpen(false)} />}
    </>
  )
}

// 外部投诉接入：支付宝/12315/黑猫等平台工单 → 落 Ticket（按 orderId 反查归属）。
// real 模式调 /complaints/ingest 真建工单；mock 模式展示能力与契约（不谎报）。
function IngestModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ source: 'alipay', reason: '', level: 'normal', orderId: '', brandId: '', externalRef: '' })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const [busy, setBusy] = useState(false)
  const canSend = form.reason.trim().length > 0 && (form.orderId.trim() || form.brandId.trim())
  const send = async () => {
    if (!canSend) return
    if (!isRealApi) { toast({ tone: 'info', text: '演示态：真实环境将经 /complaints/ingest 落工单并反查归属' }); onClose(); return }
    setBusy(true)
    try {
      const r = await bizApi.ingestComplaint({ source: form.source, reason: form.reason.trim(), level: form.level, orderId: form.orderId.trim() || undefined, brandId: form.brandId.trim() || undefined, externalRef: form.externalRef.trim() || undefined })
      if (r.ok) { toast({ tone: 'good', text: `已生成工单 ${r.ticketId} · 归属品牌 ${r.brandId}` }); onClose() }
      else toast({ tone: 'alert', text: r.detail || '接入失败' })
    } catch { toast({ tone: 'alert', text: '请求失败，请重试' }) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} width={480} title="外部投诉接入"
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><button disabled={!canSend || busy} onClick={send} className={cx('rounded-lg px-3 py-1.5 text-[13px] font-medium text-white', canSend && !busy ? 'bg-brand hover:bg-brand-hover' : 'cursor-not-allowed bg-ink-4')}>{busy ? '接入中…' : '接入工单'}</button></>}>
      <div className="space-y-3.5">
        <div className="rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">对接支付宝 / 12315 / 黑猫投诉等平台的工单数据。提供订单号即自动反查品牌与服务商归属，落地后同时进入运营坐席台、品牌门户与服务商门户。</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="来源平台"><Select value={form.source} onChange={(e) => set('source', e.target.value)}><option value="alipay">支付宝</option><option value="wechat">微信</option><option value="12315">12315</option><option value="heimao">黑猫投诉</option><option value="manual">人工录入</option></Select></Field>
          <Field label="级别"><Select value={form.level} onChange={(e) => set('level', e.target.value)}><option value="normal">普通（72h）</option><option value="escalated">升级（48h）</option><option value="regulatory">监管（24h）</option></Select></Field>
        </div>
        <Field label="投诉事由" required><Textarea value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="如：用户反映自动续费未提前提醒" rows={2} /></Field>
        <Field label="关联订单号" hint="提供则自动反查品牌 / 服务商归属"><Input value={form.orderId} onChange={(e) => set('orderId', e.target.value)} placeholder="O-xxxxxx（可选）" /></Field>
        <Field label="或直接指定品牌 ID" hint="无订单号时按品牌归属"><Input value={form.brandId} onChange={(e) => set('brandId', e.target.value)} placeholder="如 youdao（与订单号二选一）" /></Field>
        <Field label="外部平台单号"><Input value={form.externalRef} onChange={(e) => set('externalRef', e.target.value)} placeholder="便于对账（可选）" /></Field>
      </div>
    </Modal>
  )
}

function TicketDrawer({
  ticket,
  anchor,
  onClose,
  onRefund,
  onEscalate,
  onAssign,
  onClose2,
}: {
  ticket: Complaint | null
  anchor: AnchorRect | null
  onClose: () => void
  onRefund: () => void
  onEscalate: () => void
  onAssign: () => void
  onClose2: () => void
}) {
  if (!ticket) return null
  const b = brandById(ticket.brandId)
  const a = agentById(ticket.agentId)
  const lv = COMPLAINT_LEVEL[ticket.level]
  const st = COMPLAINT_STATUS[ticket.status]
  const done = ticket.status === 'resolved'
  return (
    <DetailPopover
      anchor={anchor}
      onClose={onClose}
      width={400}
      title={<span className="tnum">{ticket.id}</span>}
      desc={<span>{COMPLAINT_SOURCE[ticket.source]} · {ticket.time}</span>}
      footer={
        done ? (
          <Button variant="ghost" onClick={onClose}>关闭</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onAssign}><UserCog size={14} /> 转派</Button>
            <Button variant="ghost" onClick={onEscalate}><ArrowUpCircle size={14} /> 升级</Button>
            <Button variant="ghost" onClick={onClose2}>关闭工单</Button>
            <button onClick={onRefund} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover"><RotateCcw size={14} /> 退款并冲账</button>
          </>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={lv.tone} dot={ticket.level !== 'normal'}>{lv.label}</Badge>
        <Badge tone={st.tone} dot>{st.label}</Badge>
        {!done && ticket.slaLeftMin > 0 && <Badge tone={ticket.slaLeftMin <= 30 ? 'alert' : 'warn'}>SLA 剩余 {ticket.slaLeftMin}min</Badge>}
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface-muted p-3.5">
        <div className="text-[11.5px] text-ink-4">投诉事由</div>
        <div className="mt-1 text-[13px] text-ink">{ticket.reason}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
        <Info k="关联品牌" v={b?.name ?? '—'} />
        <Info k="关联代理" v={`${a?.name ?? ticket.agentId}`} />
        <Info k="关联订单" v={<span className="tnum">{ticket.orderId}</span>} />
        <Info k="处理人" v={ticket.owner} />
      </div>

      <div className="mt-5">
        <div className="mb-2.5 flex items-center gap-2"><span className="h-[7px] w-[7px] bg-brand" /><span className="text-[13px] font-semibold">处理时间线</span></div>
        <Timeline
          items={[
            { title: '投诉接入', time: ticket.time, desc: `来源 ${COMPLAINT_SOURCE[ticket.source]}`, done: true },
            { title: '自动分级', desc: `判定为「${lv.label}」`, done: true },
            { title: 'SLA 计时', desc: done ? '已在时效内完结' : `剩余 ${ticket.slaLeftMin} 分钟`, tone: done ? 'good' : 'warn', done },
            done
              ? { title: '已解决 · 退款联动', desc: '触发逆向冲账、回收代理分润', tone: 'good', done: true }
              : { title: '待处理动作', desc: '退款并冲账 / 升级 / 转派 / 关闭', tone: 'neutral' },
          ]}
        />
      </div>

      {!done && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-brand-soft/50 p-3 text-[11.5px] leading-relaxed text-brand-ink">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          在升级为「升级/监管投诉」前解决，可直接保护该品牌商户号的投诉率与升级投诉率阈值。
        </div>
      )}
    </DetailPopover>
  )
}
