import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, FileSignature, Repeat, ArrowRight, TrendingUp, Handshake, Megaphone } from 'lucide-react'
import { PageHeader, Card, Badge, Button, BrandMark, Segmented } from '../../components/ui/primitives'
import { useToast } from '../../components/ui/overlays'
import { money } from '../../lib/format'

/**
 * 资源广场 —— 品牌视角的"平台开放业务橱窗"。
 * 把合约/置换从零散两项升级为"我能在平台上做哪几类生意"的整体心智。
 * 两个 tab：可接合约挂单（他牌/平台发的 open 合约）+ 可置换资源（跨品牌脱敏摘要）。
 */

// 演示数据：平台上流转的开放业务（真实态由 /portal/plaza scoped 端点下发脱敏摘要）
const OPEN_CONTRACTS = [
  { id: 'GC-OPEN-01', from: '喜马拉雅', settleModel: 'CPS 分成', share: '35%', targetGmv: 800000, window: 'D30', tag: '热门' },
  { id: 'GC-OPEN-02', from: 'WPS', settleModel: '保底 + 阶梯', share: '32%', targetGmv: 500000, window: 'D60', tag: '' },
  { id: 'GC-OPEN-03', from: '芒果 TV', settleModel: 'CPS 分成', share: '38%', targetGmv: 1200000, window: 'D30', tag: '高分成' },
]
const BARTER_RESOURCES = [
  { id: 'BR-OP-01', from: 'WPS', resource: '开屏广告位', quota: '500 万曝光/月', want: '换会员权益联名', invoice: '可开票' },
  { id: 'BR-OP-02', from: 'Keep', resource: '会员权益包', quota: '10 万份', want: '换信息流曝光', invoice: '可开票' },
  { id: 'BR-OP-03', from: '知乎', resource: '信息流曝光', quota: '300 万曝光/月', want: '换联名会员', invoice: '待确认' },
]

export function BrandPlaza() {
  const toast = useToast()
  const nav = useNavigate()
  const [tab, setTab] = useState<'contracts' | 'barter'>('contracts')

  return (
    <>
      <PageHeader
        title="资源广场"
        desc="平台开放业务橱窗。在这里参与平台化联运：接他牌发布的增长合约，或用你的资源与其他品牌置换。"
        actions={<Button variant="primary" onClick={() => nav('/portal/brand/contracts')}><Megaphone size={14} /> 我要发布合约</Button>}
      />

      {/* 心智引导条 */}
      <Card className="mb-4 border-brand/15 bg-brand-soft/20">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface text-brand"><LayoutGrid size={18} /></span>
            <div>
              <div className="text-[13px] font-semibold text-ink">平台把业务开放给你</div>
              <div className="text-[11.5px] text-ink-4">合约接单 + 资源置换，都是可入账的合规交易</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-5 text-[12px]">
            <span className="flex items-center gap-1.5 text-ink-3"><FileSignature size={13} className="text-brand" /> 可接合约 <b className="tnum text-ink">{OPEN_CONTRACTS.length}</b></span>
            <span className="flex items-center gap-1.5 text-ink-3"><Repeat size={13} className="text-brand" /> 可置换资源 <b className="tnum text-ink">{BARTER_RESOURCES.length}</b></span>
          </div>
        </div>
      </Card>

      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'contracts', label: '可接合约挂单' }, { value: 'barter', label: '可置换资源' }]} />
      </div>

      {tab === 'contracts' ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {OPEN_CONTRACTS.map((c) => (
            <Card key={c.id} hover>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrandMark brand={c.from} mark={c.from.slice(0, 1)} size={28} />
                  <span className="text-[13px] font-semibold text-ink">{c.from}</span>
                </div>
                {c.tag && <Badge tone="brand">{c.tag}</Badge>}
              </div>
              <div className="mt-3 space-y-1.5 text-[12px]">
                <Row k="结算模型" v={c.settleModel} />
                <Row k="分成比例" v={<span className="font-semibold text-brand">{c.share}</span>} />
                <Row k="目标 GMV" v={<span className="tnum">{money(c.targetGmv)}</span>} />
                <Row k="LTV 窗口" v={c.window} />
              </div>
              <Button variant="primary" className="mt-3 w-full justify-center" onClick={() => toast({ tone: 'good', text: `已发起接单意向 · ${c.id}` })}>
                <Handshake size={14} /> 接单
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {BARTER_RESOURCES.map((r) => (
            <Card key={r.id} hover>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrandMark brand={r.from} mark={r.from.slice(0, 1)} size={28} />
                  <span className="text-[13px] font-semibold text-ink">{r.from}</span>
                </div>
                <Badge tone={r.invoice === '可开票' ? 'good' : 'warn'}>{r.invoice}</Badge>
              </div>
              <div className="mt-3 space-y-1.5 text-[12px]">
                <Row k="可置换资源" v={<span className="font-medium text-ink">{r.resource}</span>} />
                <Row k="额度" v={<span className="tnum">{r.quota}</span>} />
                <Row k="期望换取" v={r.want} />
              </div>
              <Button variant="primary" className="mt-3 w-full justify-center" onClick={() => { toast({ tone: 'good', text: `已发起置换提议 · ${r.id}` }); nav('/portal/brand/barter') }}>
                <Repeat size={14} /> 发起置换
              </Button>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-1.5 rounded-xl border border-dashed border-line bg-surface-muted px-4 py-3 text-[12px] text-ink-4">
        <TrendingUp size={14} /> 接单后进入「我的增长合约」履约；置换成功进入「资源置换」台账。
        <button onClick={() => nav('/portal/brand/contracts')} className="ml-auto inline-flex items-center gap-1 font-medium text-brand hover:underline">查看我的合约 <ArrowRight size={12} /></button>
      </div>
    </>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-4">{k}</span>
      <span className="text-ink-2">{v}</span>
    </div>
  )
}
