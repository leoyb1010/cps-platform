import { useState } from 'react'
import { Repeat, Plus } from 'lucide-react'
import { Card, CardTitle, Stat, PageHeader, Badge, Button, Segmented, TableShell, Th, Td, Row, BrandMark } from '../components/ui/primitives'
import { Modal, useToast } from '../components/ui/overlays'
import { DetailPopover, Info, useAnchoredPopover, type AnchorRect } from '../components/ui/popover'
import { Field, Input, Select, Textarea } from '../components/ui/forms'
import { BARTER_RESOURCE_TYPES, INVOICE_STATUS } from '../lib/dict'
import { useStore } from '../lib/store'
import { useApi, bizApi } from '../lib/adminApi'
import { isRealApi } from '../lib/http'
import { brandById } from '../lib/data'
import { money } from '../lib/format'

interface BarterDeal {
  id: string; initiatorBrandId: string; counterpartyBrandId: string; status: string
  resourceType: string; myQuota: number; counterpartyQuota: number; invoiceStatus: string
}
const STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'neutral' | 'info' | 'alert' }> = {
  proposed: { label: '待确认', tone: 'warn' },
  accepted: { label: '已接受', tone: 'info' },
  active: { label: '执行中', tone: 'good' },
  settled: { label: '已结清', tone: 'good' },
  rejected: { label: '已拒绝', tone: 'alert' },
}
const INVOICE: Record<string, { label: string; tone: 'good' | 'warn' | 'neutral' }> = {
  done: { label: '已开票', tone: 'good' },
  partial: { label: '部分', tone: 'warn' },
  pending: { label: '待开票', tone: 'neutral' },
}

export default function Barter() {
  const toast = useToast()
  const { brands } = useStore()
  // 单源：资源置换从真实后端读（Prisma BarterDeal），不再用前端 seed
  const barterApi = useApi(() => bizApi.barter<BarterDeal[]>(), [])
  const deals = barterApi.data ?? []
  const [f, setF] = useState<'all' | string>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const pop = useAnchoredPopover()
  const [newOpen, setNewOpen] = useState(false)

  const list = deals.filter((e) => (f === 'all' ? true : e.status === f))
  const active = deals.find((e) => e.id === openId) ?? null
  const total = deals.length
  const valuationSum = deals.reduce((s, e) => s + e.myQuota + e.counterpartyQuota, 0)
  const invoiceDone = deals.filter((e) => e.invoiceStatus === 'done').length
  const invoiceRate = total ? (invoiceDone / total) * 100 : 0
  const pending = deals.filter((e) => e.status === 'proposed').length

  return (
    <>
      <PageHeader
        title="资源置换"
        desc="广告/会员资源等值置换，核心是『互相开票、各自确认收入』。台账记估值与双向交付确认，差额单独结算，不污染清结算恒等式。"
        actions={
          <>
            <Segmented value={f} onChange={setF} options={[{ value: 'all', label: '全部' }, { value: 'proposed', label: '待确认' }, { value: 'active', label: '执行中' }, { value: 'settled', label: '已结清' }]} />
            <Button variant="primary" onClick={() => setNewOpen(true)}><Plus size={14} /> 发起置换</Button>
          </>
        }
      />

      {!isRealApi && <div className="mb-4 rounded-lg border border-dashed border-line bg-surface-muted px-3.5 py-2 text-[11.5px] text-ink-3">演示模式 · 连接真实后端后展示服务端置换台账</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card mark><Stat label="台账条目" value={String(total)} sub={<span>待确认 {pending}</span>} /></Card>
        <Card mark><Stat label="累计置换额度" value={money(valuationSum)} sub={<span>双方等值合计</span>} /></Card>
        <Card mark><Stat label="开票完成率" value={`${invoiceRate.toFixed(0)}%`} deltaTone={invoiceRate >= 75 ? 'good' : 'warn'} sub={<span>各自确认收入</span>} /></Card>
        <Card mark><Stat label="合规要点" value="3 项" hint="资源是否真实交付 / 公允价值证明 / 税务发票链路匹配" sub={<span>财税审核闸</span>} /></Card>
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <CardTitle title="置换台账" desc="发起方 ↔ 对手品牌、资源、额度、开票" />
        </div>
        <TableShell className="px-2 pb-2" head={<><Th className="pl-3">编号</Th><Th>发起方</Th><Th>对手品牌</Th><Th>资源</Th><Th right>我方额度</Th><Th right>对手额度</Th><Th>开票</Th><Th right>状态</Th></>}>
          {list.map((e) => {
            const st = STATUS[e.status] ?? STATUS.proposed
            const inv = INVOICE[e.invoiceStatus] ?? INVOICE.pending
            const ib = brandById(e.initiatorBrandId)
            const cb = brandById(e.counterpartyBrandId)
            return (
              <Row key={e.id} onClick={(ev) => { setOpenId(e.id); pop.openAt(ev) }}>
                <Td className="pl-3"><span className="tnum text-[12.5px] font-medium text-ink">{e.id}</span></Td>
                <Td><div className="flex items-center gap-2">{ib && <BrandMark brand={ib.id} mark={ib.mark} size={20} />}<span className="text-[12px] text-ink-2">{ib?.name ?? e.initiatorBrandId}</span></div></Td>
                <Td><span className="text-[12px] text-ink-2">{cb?.name ?? e.counterpartyBrandId}</span></Td>
                <Td><span className="text-[12px]">{e.resourceType}</span></Td>
                <Td right mono className="text-[12.5px]">{money(e.myQuota)}</Td>
                <Td right mono className="text-[12.5px]">{money(e.counterpartyQuota)}</Td>
                <Td><Badge tone={inv.tone}>{inv.label}</Badge></Td>
                <Td right><Badge tone={st.tone}>{st.label}</Badge></Td>
              </Row>
            )
          })}
        </TableShell>
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[12px] text-ink-3">
          <span>共 {list.length} 条台账</span>
          <span className="text-ink-4">置换不走主结算池，差额单独记，不污染清结算恒等式</span>
        </div>
      </Card>

      <BarterDrawer deal={active} anchor={pop.anchorRect} onClose={() => { setOpenId(null); pop.close() }} onStatus={async (id, status) => {
        try {
          const r = await bizApi.setBarterStatus(id, status)
          if (r?.ok === false) { toast({ tone: 'alert', text: r.detail || '更新失败' }); return }
          toast({ tone: 'good', text: `置换 ${id} 已更新` }); setOpenId(null); barterApi.reload()
        } catch { toast({ tone: 'alert', text: '更新失败，请重试' }) }
      }} />
      {newOpen && <NewBarterModal brands={brands.filter((b) => b.status === 'live')} onClose={() => setNewOpen(false)} onDone={() => { toast({ tone: 'good', text: '置换单已发起' }); barterApi.reload() }} />}
    </>
  )
}

function NewBarterModal({ brands, onClose, onDone }: { brands: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ initiatorBrandId: brands[0]?.id ?? '', counterpartyBrandId: brands[1]?.id ?? '', resourceType: '广告位', myQuota: 500000, counterpartyQuota: 500000, invoiceStatus: 'pending' })
  const [terms, setTerms] = useState({ valuation: '', deliveryWindow: '', note: '' })
  const submit = async () => {
    if (form.initiatorBrandId === form.counterpartyBrandId) { toast({ tone: 'alert', text: '发起方与对手品牌不能相同' }); return }
    try {
      const r = await bizApi.addBarter({ ...form, terms })
      if (r?.ok === false) { toast({ tone: 'alert', text: r.detail || '发起失败' }); return }
      onClose(); onDone()
    } catch { toast({ tone: 'alert', text: '发起失败，请重试' }) }
  }
  return (
    <Modal open onClose={onClose} width={500} title="发起资源置换" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" onClick={submit}>发起</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="发起方品牌"><Select value={form.initiatorBrandId} onChange={(e) => setForm({ ...form, initiatorBrandId: e.target.value })}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          <Field label="对手品牌"><Select value={form.counterpartyBrandId} onChange={(e) => setForm({ ...form, counterpartyBrandId: e.target.value })}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="资源类型"><Select value={form.resourceType} onChange={(e) => setForm({ ...form, resourceType: e.target.value })}>{BARTER_RESOURCE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="开票状态"><Select value={form.invoiceStatus} onChange={(e) => setForm({ ...form, invoiceStatus: e.target.value })}>{INVOICE_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="我方额度 ¥"><Input type="number" value={form.myQuota} onChange={(e) => setForm({ ...form, myQuota: +e.target.value })} /></Field>
          <Field label="对手额度 ¥"><Input type="number" value={form.counterpartyQuota} onChange={(e) => setForm({ ...form, counterpartyQuota: +e.target.value })} /></Field>
        </div>
        <div className="border-t border-line pt-3">
          <div className="mb-2 text-[11.5px] font-medium text-ink-2">条款</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="估值口径"><Input value={terms.valuation} onChange={(e) => setTerms({ ...terms, valuation: e.target.value })} placeholder="如：刊例价 × 0.6 折" /></Field>
            <Field label="交付窗口"><Input value={terms.deliveryWindow} onChange={(e) => setTerms({ ...terms, deliveryWindow: e.target.value })} placeholder="如：Q3" /></Field>
          </div>
          <Field label="备注"><Textarea rows={2} value={terms.note} onChange={(e) => setTerms({ ...terms, note: e.target.value })} placeholder="联合活动说明等" /></Field>
        </div>
      </div>
    </Modal>
  )
}

function BarterDrawer({ deal, anchor, onClose, onStatus }: { deal: BarterDeal | null; anchor: AnchorRect | null; onClose: () => void; onStatus: (id: string, status: string) => void }) {
  if (!deal) return null
  const e = deal
  const st = STATUS[e.status] ?? STATUS.proposed
  const ib = brandById(e.initiatorBrandId)
  const cb = brandById(e.counterpartyBrandId)
  return (
    <DetailPopover anchor={anchor} onClose={onClose} width={400} title={<span className="tnum">{e.id}</span>} desc={<span>{ib?.name} ⇄ {cb?.name}</span>}
      footer={e.status === 'proposed'
        ? <><Button variant="ghost" onClick={() => onStatus(e.id, 'rejected')}>拒绝</Button><Button variant="primary" onClick={() => onStatus(e.id, 'active')}>确认执行</Button></>
        : <Button variant="ghost" onClick={onClose}>关闭</Button>}>
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted p-3.5">
        <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-soft text-brand-ink"><Repeat size={17} /></span><div><div className="text-[12.5px] font-medium text-ink">{e.resourceType}</div><div className="text-[11px] text-ink-4">{ib?.name} ⇄ {cb?.name}</div></div></div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-[12.5px]">
        <Info k="发起方" v={ib?.name ?? e.initiatorBrandId} />
        <Info k="对手品牌" v={cb?.name ?? e.counterpartyBrandId} />
        <Info k="我方额度" v={money(e.myQuota)} />
        <Info k="对手额度" v={money(e.counterpartyQuota)} />
        <Info k="开票状态" v={(INVOICE[e.invoiceStatus] ?? INVOICE.pending).label} />
        <Info k="差额" v={e.myQuota === e.counterpartyQuota ? '无差额' : money(Math.abs(e.myQuota - e.counterpartyQuota))} />
      </div>
      <div className="mt-4 rounded-lg border border-dashed border-line bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">
        <span className="font-medium text-ink-2">合规说明：</span>非现金对价按合同开始时公允价值计量；需满足资源真实交付、公允价值可证明、税务发票链路匹配。
      </div>
    </DetailPopover>
  )
}
