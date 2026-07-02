import { useState } from 'react'
import { Package, Check, X, Percent, ShoppingBag } from 'lucide-react'
import { Card, CardTitle, Stat, PageHeader, Badge, Button, Segmented, TableShell, Th, Td, Row, BrandMark } from '../components/ui/primitives'
import { Modal, useToast } from '../components/ui/overlays'
import { DetailPopover, Info, useAnchoredPopover, type AnchorRect } from '../components/ui/popover'
import { Field, Input } from '../components/ui/forms'
import { useApi, bizApi } from '../lib/adminApi'
import { isRealApi } from '../lib/http'
import { money, cx } from '../lib/format'
import { BundlesPanel } from './market/Supermarket'
import { demoProducts, demoBundleRules } from '../lib/adminDemo'

interface Product {
  id: string; brandId: string; brandName: string; brandMark: string; name: string; category: string; description: string
  billingCycle: string; firstPrice: number; renewPrice: number; defaultSharePct: number
  status: string; reviewNote: string; tags: string
}
interface BundleRule { id: string; name: string; kind: string; params: string; active: boolean }

const STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'neutral' | 'alert' }> = {
  live: { label: '已上架', tone: 'good' },
  pending: { label: '待审核', tone: 'warn' },
  draft: { label: '草稿', tone: 'neutral' },
  delisted: { label: '已下架', tone: 'alert' },
}
const CYCLE: Record<string, string> = { monthly: '月付', yearly: '年付', continuous: '连续包月' }

export default function Products() {
  const toast = useToast()
  // 三视图合一：商品审核台 + 套餐受理台账（超市同源）合并进「订阅商品」一个控制台入口，
  // 消除「订阅商品 / 订阅超市」两个平级 tab 的困惑。C 端用户货架（/market）不受影响。
  const [tab, setTab] = useState<'review' | 'fulfill'>('review')
  // 演示态 fallback：种子合成的审核台/规则数据，让演示模式也能看到审核台与组合规则（能看不能落库）
  const productsApi = useApi(() => bizApi.products<Product[]>(), [], isRealApi ? null : (demoProducts() as Product[]))
  const rulesApi = useApi(() => bizApi.bundleRules<BundleRule[]>(), [], isRealApi ? null : (demoBundleRules() as BundleRule[]))
  const [filter, setFilter] = useState<'all' | 'pending' | 'live'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const pop = useAnchoredPopover()
  const [ruleOpen, setRuleOpen] = useState(false)
  const [rf, setRf] = useState({ name: '', minItems: 2, discountPct: 10 })

  const products = productsApi.data ?? []
  const active = products.find((p) => p.id === openId) ?? null
  const list = products.filter((p) => filter === 'all' ? true : p.status === filter)
  const pendingCount = products.filter((p) => p.status === 'pending').length
  const liveCount = products.filter((p) => p.status === 'live').length

  const review = async (id: string, action: 'approve' | 'reject', note?: string) => {
    try {
      const r = await bizApi.reviewProduct(id, action, note)
      if (r.ok) { toast({ tone: 'good', text: r.detail ?? '操作完成' }); setOpenId(null); productsApi.reload() }
      else toast({ tone: 'alert', text: r.detail ?? '操作失败' })
    } catch { toast({ tone: 'alert', text: '操作失败，请重试' }) }
  }
  const addRule = async () => {
    if (!rf.name.trim()) { toast({ tone: 'info', text: '填写规则名称' }); return }
    try {
      const r = await bizApi.addBundleRule({ name: rf.name.trim(), kind: 'count_off', params: { minItems: rf.minItems, discountPct: rf.discountPct }, active: true })
      if (r.ok) { toast({ tone: 'good', text: '组合优惠规则已新增' }); setRuleOpen(false); setRf({ name: '', minItems: 2, discountPct: 10 }); rulesApi.reload() }
      else toast({ tone: 'alert', text: r.detail ?? '新增失败（参数越界？折扣需 0-100、最少件数 ≥1）' })
    } catch { toast({ tone: 'alert', text: '新增失败，请重试' }) }
  }

  return (
    <>
      <PageHeader
        title="订阅商品"
        desc="商品从审核上架到用户组套餐、运营受理拆单履约的全链路。用户端货架见「订阅超市」（免登录）。"
        actions={<>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'review', label: '商品审核' }, { value: 'fulfill', label: '套餐受理' }]} />
          {tab === 'review' && <Button variant="ghost" onClick={() => setRuleOpen(true)}><Percent size={14} /> 组合优惠规则</Button>}
          <a href="#/market" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:bg-surface-muted"><ShoppingBag size={13} /> 预览用户货架</a>
        </>}
      />

      {!isRealApi && <div className="mb-4 rounded-lg border border-dashed border-line bg-surface-muted px-3.5 py-2 text-[11.5px] text-ink-3">演示数据 · 审核/受理操作为本地演示，连接真实后端后为服务端权威</div>}

      {/* 套餐受理 Tab：复用超市的套餐台账（用户组的套餐 → 受理拆单履约） */}
      {tab === 'fulfill' ? <BundlesPanel /> : (
      <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><Stat label="商品总数" value={String(products.length)} sub={<span>全平台</span>} /></Card>
        <Card><Stat label="待审核" value={String(pendingCount)} sub={<span className={pendingCount > 0 ? 'text-warn-ink' : 'text-good-ink'}>{pendingCount > 0 ? '需处理' : '已清空'}</span>} /></Card>
        <Card><Stat label="已上架" value={String(liveCount)} sub={<span>超市可见</span>} /></Card>
        <Card><Stat label="组合优惠规则" value={String((rulesApi.data ?? []).filter((r) => r.active).length)} sub={<span>生效中</span>} /></Card>
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <CardTitle title="商品审核台" desc="审核通过 → 上架进入订阅超市" />
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: '全部' }, { value: 'pending', label: `待审 ${pendingCount}` }, { value: 'live', label: '已上架' }]} />
        </div>
        <TableShell className="px-2 pb-2" head={<><Th className="pl-3">商品 / 品牌</Th><Th>类目</Th><Th>计费</Th><Th right>首单价</Th><Th right>续费价</Th><Th right>默认分成</Th><Th right>状态</Th><Th right>操作</Th></>}>
          {list.map((p) => {
            const st = STATUS[p.status] ?? STATUS.draft
            return (
              <Row key={p.id} onClick={(e) => { setOpenId(p.id); pop.openAt(e) }} className={p.status === 'pending' ? 'bg-warn-soft/25' : undefined}>
                <Td className="pl-3"><div className="flex items-center gap-2.5">{p.brandMark && <BrandMark brand={p.brandId} mark={p.brandMark} size={26} />}<div><div className="text-[12.5px] font-medium text-ink">{p.name}</div><div className="text-[11px] text-ink-4">{p.brandName}</div></div></div></Td>
                <Td className="text-[12px]">{p.category || '—'}</Td>
                <Td><Badge tone="neutral">{CYCLE[p.billingCycle] ?? p.billingCycle}</Badge></Td>
                <Td right mono>{money(p.firstPrice)}</Td>
                <Td right mono>{money(p.renewPrice)}</Td>
                <Td right mono>{p.defaultSharePct}%</Td>
                <Td right><Badge tone={st.tone}>{st.label}</Badge></Td>
                <Td right>
                  {p.status === 'pending'
                    ? <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => review(p.id, 'approve')} className="rounded-md px-2 py-1 text-[12px] font-medium text-good-ink hover:bg-good-soft">通过</button>
                        <button onClick={() => review(p.id, 'reject', '资料不全')} className="rounded-md px-2 py-1 text-[12px] font-medium text-alert-ink hover:bg-alert-soft">驳回</button>
                      </div>
                    : <span className="text-[12px] text-ink-4">—</span>}
                </Td>
              </Row>
            )
          })}
        </TableShell>
      </Card>

      <ProductDrawer key={active?.id ?? 'none'} product={active} anchor={pop.anchorRect} onClose={() => { setOpenId(null); pop.close() }} onReview={review} />

      <Modal open={ruleOpen} onClose={() => setRuleOpen(false)} width={460} title="新增组合优惠规则" footer={<><Button variant="ghost" onClick={() => setRuleOpen(false)}>取消</Button><Button variant="primary" onClick={addRule}>新增</Button></>}>
        <div className="mb-3 text-[12px] text-ink-3">满件折扣：用户在超市选满 N 件商品，组合套餐享对应折扣。</div>
        <div className="space-y-3">
          <Field label="规则名称"><Input value={rf.name} onChange={(e) => setRf({ ...rf, name: e.target.value })} placeholder="如：满 2 件享 9 折" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="满足件数"><Input type="number" value={rf.minItems} onChange={(e) => setRf({ ...rf, minItems: +e.target.value })} /></Field>
            <Field label="折扣 %"><Input type="number" value={rf.discountPct} onChange={(e) => setRf({ ...rf, discountPct: +e.target.value })} /></Field>
          </div>
        </div>
        {(rulesApi.data ?? []).length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <div className="mb-2 text-[11.5px] font-medium text-ink-2">现有规则</div>
            <div className="space-y-1.5">
              {(rulesApi.data ?? []).map((r) => {
                let p: { minItems?: number; discountPct?: number } = {}
                try { p = JSON.parse(r.params) } catch { /* ignore */ }
                return (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-line p-2.5">
                    <div className="text-[12px] text-ink-2">{r.name} <span className="text-ink-4">满{p.minItems}件 {p.discountPct}%off</span></div>
                    <button onClick={async () => { await bizApi.toggleBundleRule(r.id, !r.active); rulesApi.reload() }}><Badge tone={r.active ? 'good' : 'neutral'} dot>{r.active ? '生效' : '停用'}</Badge></button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Modal>
      </>
      )}
    </>
  )
}

function ProductDrawer({ product, anchor, onClose, onReview }: { product: Product | null; anchor: AnchorRect | null; onClose: () => void; onReview: (id: string, a: 'approve' | 'reject', note?: string) => void }) {
  const [reason, setReason] = useState('')
  if (!product) return null
  const p = product
  const st = STATUS[p.status] ?? STATUS.draft
  let tags: string[] = []
  try { tags = JSON.parse(p.tags) } catch { /* ignore */ }
  return (
    <DetailPopover anchor={anchor} onClose={onClose} width={400} title={<span>{p.name}</span>} desc={<span>{p.brandName} · {CYCLE[p.billingCycle]}</span>}
      footer={p.status === 'pending'
        ? <><Button variant="ghost" onClick={() => onReview(p.id, 'reject', reason.trim() || '资料不全')}><X size={14} /> 驳回</Button><Button variant="primary" onClick={() => onReview(p.id, 'approve')}><Check size={14} /> 通过上架</Button></>
        : <Button variant="ghost" onClick={onClose}>关闭</Button>}>
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted p-3.5">
        <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-soft text-brand-ink"><Package size={17} /></span><div><div className="text-[12.5px] font-medium text-ink">{p.category || '未分类'}</div><div className="text-[11px] text-ink-4">{CYCLE[p.billingCycle]}</div></div></div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">{p.description || '无商品描述'}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
        <Info k="首单价" v={money(p.firstPrice)} />
        <Info k="续费价" v={money(p.renewPrice)} />
        <Info k="默认代理分成" v={`${p.defaultSharePct}%`} />
        <Info k="计费周期" v={CYCLE[p.billingCycle] ?? p.billingCycle} />
      </div>
      {tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}</div>}
      {p.status === 'pending' && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11.5px] font-medium text-ink-2">驳回理由<span className="ml-1 font-normal text-ink-4">（驳回时回传给品牌方，留空则记为“资料不全”）</span></div>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="例如：商品描述与计费周期不符，请补充权益清单"
            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-brand/50" />
        </div>
      )}
      {p.reviewNote && <div className={cx('mt-3 rounded-lg border p-3 text-[11.5px] leading-relaxed', 'border-alert/25 bg-alert-soft/40 text-alert-ink')}>驳回理由：{p.reviewNote}</div>}
    </DetailPopover>
  )
}
