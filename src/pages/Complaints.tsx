import { useState } from 'react'
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
import { Drawer, Confirm, useToast } from '../components/ui/overlays'
import { Timeline } from '../components/ui/forms'
import {
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
  const [confirmRefund, setConfirmRefund] = useState<string | null>(null)

  const complaints = s.complaints
  const pending = complaints.filter((c) => c.status === 'pending').length
  const escalated = complaints.filter((c) => c.level !== 'normal' && c.status !== 'resolved').length
  const resolved = complaints.filter((c) => c.status === 'resolved').length
  const urgent = complaints.filter((c) => c.status !== 'resolved' && c.slaLeftMin > 0).sort((a, b) => a.slaLeftMin - b.slaLeftMin)
  const list = complaints.filter((c) => (lvl === 'all' ? true : c.level === lvl))
  const active = complaints.find((c) => c.id === openId) ?? null

  return (
    <>
      <PageHeader
        title="投诉工单"
        desc="多源聚合（平台 / 渠道 / 12315 / 黑猫 / 应用商店）· 分级 SLA 计时 · 在升级为「升级/监管投诉」前解决，是保住商户号的关键动作。"
        actions={
          <>
            <Button variant="ghost" onClick={() => toast({ tone: 'info', text: 'SLA 规则：普通 24h / 升级 4h / 监管 2h，超时自动升级' })}>SLA 规则</Button>
            <Button variant="primary" onClick={() => { const first = urgent[0]; if (first) setOpenId(first.id); else toast({ tone: 'good', text: '当前无临期工单' }) }}><Headphones size={14} /> 进入坐席台</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card mark><Stat label="待处理工单" value={String(pending)} sub={<span className="text-alert-ink">含 SLA 临期</span>} /></Card>
        <Card mark><Stat label="升级 + 监管投诉" value={String(escalated)} hint="直接关联商户号红线" sub={<span>未解决</span>} /></Card>
        <Card mark><Stat label="今日已解决" value={String(resolved)} sub={<span className="text-good-ink">含退款联动</span>} /></Card>
        <Card mark><Stat label="SLA 达成率" value="96.2%" deltaTone="good" sub={<span>升级前解决率 88%</span>} /></Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle title="SLA 优先队列" desc="按剩余时效升序 · 点击处理" right={<Badge tone="alert" dot>实时计时</Badge>} />
          {urgent.length === 0 ? (
            <div className="grid place-items-center gap-1.5 py-8 text-center"><CheckCircle2 size={20} className="text-good-ink" /><div className="text-[13px] font-medium text-ink-2">无临期工单</div></div>
          ) : (
            <div className="space-y-2">
              {urgent.slice(0, 5).map((c) => {
                const b = brandById(c.brandId)!
                const lv = COMPLAINT_LEVEL[c.level]
                const tone = c.slaLeftMin <= 30 ? 'alert' : c.slaLeftMin <= 90 ? 'warn' : 'good'
                return (
                  <button key={c.id} onClick={() => setOpenId(c.id)} className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left hover:border-line-strong hover:bg-surface-muted">
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
          <Donut items={complaintBySource} center={{ value: pct(0.63), label: '综合投诉率' }} size={120} />
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
            const b = brandById(c.brandId)!
            const lv = COMPLAINT_LEVEL[c.level]
            const st = COMPLAINT_STATUS[c.status]
            return (
              <Row key={c.id} onClick={() => setOpenId(c.id)}>
                <Td className="pl-3"><div className="tnum text-[12.5px] font-medium text-ink">{c.id}</div><div className="text-[11px] text-ink-4">{c.time}</div></Td>
                <Td>{COMPLAINT_SOURCE[c.source]}</Td>
                <Td><Badge tone={lv.tone} dot={c.level !== 'normal'}>{lv.label}</Badge></Td>
                <Td><div className="flex items-center gap-2"><BrandMark mark={b.mark} size={22} /><span className="tnum text-[12px] text-ink-2">{c.agentId}</span></div></Td>
                <Td className="max-w-[200px]"><span className="text-ink-2">{c.reason}</span></Td>
                <Td><span className={c.owner === '未分配' ? 'text-alert-ink' : 'text-ink-3'}>{c.owner}</span></Td>
                <Td right mono>{c.status === 'resolved' || c.slaLeftMin === 0 ? <span className="text-ink-4">—</span> : <span className={c.slaLeftMin <= 30 ? 'text-alert-ink' : c.slaLeftMin <= 90 ? 'text-warn-ink' : 'text-ink-2'}>{c.slaLeftMin}min</span>}</Td>
                <Td right><Badge tone={st.tone} dot>{st.label}</Badge></Td>
              </Row>
            )
          })}
        </TableShell>
      </Card>

      {/* 工单详情 + 处理 */}
      <TicketDrawer
        ticket={active}
        onClose={() => setOpenId(null)}
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
    </>
  )
}

function TicketDrawer({
  ticket,
  onClose,
  onRefund,
  onEscalate,
  onAssign,
  onClose2,
}: {
  ticket: Complaint | null
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
    <Drawer
      open={!!ticket}
      onClose={onClose}
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
    </Drawer>
  )
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line p-2.5">
      <div className="text-[11px] text-ink-4">{k}</div>
      <div className="mt-0.5 font-medium text-ink">{v}</div>
    </div>
  )
}
