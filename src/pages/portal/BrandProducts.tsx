import { useState } from 'react'
import { Plus, Send } from 'lucide-react'
import { Card, CardTitle, Stat, PageHeader, Badge, Button, Segmented, TableShell, Th, Td, Row } from '../../components/ui/primitives'
import { Modal, useToast } from '../../components/ui/overlays'
import { Field, Input, Select, Textarea, TagInput } from '../../components/ui/forms'
import { portalApi } from '../../lib/portalApi'
import { usePortalResource, PortalState, TableSkeleton } from '../../components/portal/kit'
import { money } from '../../lib/format'

interface Product {
  id: string; name: string; category: string; billingCycle: string
  firstPrice: number; renewPrice: number; defaultSharePct: number; status: string; reviewNote: string
}
const STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'neutral' | 'alert' }> = {
  live: { label: '已上架', tone: 'good' }, pending: { label: '审核中', tone: 'warn' }, draft: { label: '草稿', tone: 'neutral' }, delisted: { label: '已下架', tone: 'alert' },
}
const CYCLE: Record<string, string> = { monthly: '月付', yearly: '年付', continuous: '连续包月' }

export function BrandProducts() {
  const toast = useToast()
  const { data, state, reload } = usePortalResource<Product[]>(() => portalApi.brandProducts())
  const [newOpen, setNewOpen] = useState(false)

  const submit = async (id: string) => {
    try {
      const r = await portalApi.submitProduct(id)
      if (r.ok) { toast({ tone: 'good', text: '已提交审核，平台通过后即上架超市' }); reload() }
      else toast({ tone: 'alert', text: r.detail })
    } catch { toast({ tone: 'alert', text: '提交失败，请重试' }) }
  }

  return (
    <>
      <PageHeader
        title="我的订阅商品"
        desc="上架你的订阅商品，平台审核通过后进入用户订阅超市，可被自由搭配成组合套餐。"
        actions={<Button variant="primary" onClick={() => setNewOpen(true)}><Plus size={14} /> 上架商品</Button>}
      />
      <PortalState state={state} data={data} reload={reload} skeleton={<TableSkeleton />}>
        {(d) => {
          const live = d.filter((p) => p.status === 'live').length
          const pending = d.filter((p) => p.status === 'pending').length
          return (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Card><Stat label="商品总数" value={String(d.length)} /></Card>
                <Card><Stat label="已上架" value={String(live)} sub={<span className="text-good-ink">超市可见</span>} /></Card>
                <Card><Stat label="审核中" value={String(pending)} sub={<span className={pending > 0 ? 'text-warn-ink' : ''}>{pending > 0 ? '等待平台' : '—'}</span>} /></Card>
              </div>
              <Card className="mt-4" pad={false}>
                <div className="p-5 pb-3"><CardTitle title="商品列表" desc="草稿可提交审核 · 上架后进入订阅超市" /></div>
                <TableShell className="px-2 pb-2" head={<><Th className="pl-3">商品</Th><Th>类目</Th><Th>计费</Th><Th right>首单价</Th><Th right>续费价</Th><Th right>默认分成</Th><Th right>状态</Th><Th right>操作</Th></>}>
                  {d.map((p) => {
                    const st = STATUS[p.status] ?? STATUS.draft
                    return (
                      <Row key={p.id}>
                        <Td className="pl-3"><div className="text-[12.5px] font-medium text-ink">{p.name}</div>{p.reviewNote && <div className="text-[11px] text-alert-ink">驳回：{p.reviewNote}</div>}</Td>
                        <Td className="text-[12px]">{p.category || '—'}</Td>
                        <Td><Badge tone="neutral">{CYCLE[p.billingCycle] ?? p.billingCycle}</Badge></Td>
                        <Td right mono>{money(p.firstPrice)}</Td>
                        <Td right mono>{money(p.renewPrice)}</Td>
                        <Td right mono>{p.defaultSharePct}%</Td>
                        <Td right><Badge tone={st.tone}>{st.label}</Badge></Td>
                        <Td right>{p.status === 'draft' ? <button onClick={() => submit(p.id)} className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-[12px] font-medium text-white hover:bg-brand-hover"><Send size={12} /> 提交审核</button> : <span className="text-[12px] text-ink-4">—</span>}</Td>
                      </Row>
                    )
                  })}
                </TableShell>
              </Card>
            </>
          )
        }}
      </PortalState>
      {newOpen && <NewProductModal onClose={() => setNewOpen(false)} onDone={() => { toast({ tone: 'good', text: '商品已创建（草稿），可提交审核' }); reload() }} onError={(m) => toast({ tone: 'alert', text: m })} />}
    </>
  )
}

function NewProductModal({ onClose, onDone, onError }: { onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [f, setF] = useState({ name: '', category: '工具', description: '', billingCycle: 'continuous', firstPrice: 19.9, renewPrice: 29.9, defaultSharePct: 30 })
  const [bundleEligible, setBundleEligible] = useState(true)
  const [exclusiveGroup, setExclusiveGroup] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const submit = async () => {
    if (!f.name.trim()) { onError('请填写商品名称'); return }
    try {
      const r = await portalApi.addBrandProduct({ ...f, bundleEligible, exclusiveGroup: exclusiveGroup.trim(), tags })
      if (r.ok) { onClose(); onDone() } else { onError('创建失败，请重试') }
    } catch { onError('网络异常，请重试') }
  }
  return (
    <Modal open onClose={onClose} width={520} title="上架订阅商品" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" onClick={submit}>创建草稿</Button></>}>
      <div className="space-y-3">
        <Field label="商品名称" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="如：会员 VIP 连续包月" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="类目"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option>工具</option><option>泛娱乐</option><option>生活服务</option></Select></Field>
          <Field label="计费周期"><Select value={f.billingCycle} onChange={(e) => setF({ ...f, billingCycle: e.target.value })}><option value="continuous">连续包月</option><option value="monthly">月付</option><option value="yearly">年付</option></Select></Field>
        </div>
        <Field label="商品描述"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="权益简介" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="首单价 ¥"><Input type="number" value={f.firstPrice} onChange={(e) => setF({ ...f, firstPrice: +e.target.value })} /></Field>
          <Field label="续费价 ¥"><Input type="number" value={f.renewPrice} onChange={(e) => setF({ ...f, renewPrice: +e.target.value })} /></Field>
          <Field label="代理分成 %"><Input type="number" value={f.defaultSharePct} onChange={(e) => setF({ ...f, defaultSharePct: +e.target.value })} /></Field>
        </div>
        <div className="border-t border-line pt-3">
          <div className="mb-2 text-[11.5px] font-medium text-ink-2">超市组合设置</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="可进组合套餐" hint="过审后是否出现在订阅超市供用户搭配">
              <Segmented value={bundleEligible ? 'y' : 'n'} onChange={(v) => setBundleEligible(v === 'y')} options={[{ value: 'y', label: '可组合' }, { value: 'n', label: '不可组合' }]} />
            </Field>
            <Field label="互斥组" hint="同一互斥组内的商品不可同时进同一套餐（如同品牌多档会员）"><Input value={exclusiveGroup} onChange={(e) => setExclusiveGroup(e.target.value)} placeholder="留空＝不互斥" /></Field>
          </div>
          <Field label="标签" hint="用户搜索/筛选用，最多 8 个"><TagInput value={tags} onChange={setTags} placeholder="输入标签后回车，如：学生 / 职场" /></Field>
        </div>
      </div>
    </Modal>
  )
}
