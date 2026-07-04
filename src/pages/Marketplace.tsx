import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2, FileCheck, TrendingUp, Megaphone, Sparkles } from 'lucide-react'
import {
  Card,
  PageHeader,
  Badge,
  Button,
  Segmented,
  BrandMark,
  TONE,
} from '../components/ui/primitives'
import { Modal, useToast } from '../components/ui/overlays'
import { DocModal } from '../components/ui/DocModal'
import { TableShell, Th, Td, Row } from '../components/ui/primitives'
import { EmptyState } from '../components/ui/forms'
import { SETTLE_PATH_LABEL, brandById } from '../lib/data'
import { useStore, addClaim } from '../lib/store'
import { pct, cx, copyText } from '../lib/format'

const CATS = ['全部', '工具 / 知识', '音视频 / 泛娱乐', '生活服务 / 电商']

// 素材合规规范（投放素材过审清单）
const CREATIVE_SPEC = [
  { heading: '禁用表达', bullets: ['禁绝对化用语（"最""第一""100% 有效"等）', '禁夸大承诺与诱导（"稳赚""躺赚""限时免费"误导）', '禁未标识的 AIGC 生成内容（须含显式/隐式标识）'] },
  { heading: '必含要素', bullets: ['连续包月须显著告知自动续费规则与价格', '落地页须含明确的退订/取消入口', '权益描述须真实可兑现，与实际一致'] },
  { heading: '过审流程', bullets: ['素材先过机器审核（敏感词/画面）', '再过人工复审（合规/品牌调性）', '过审后方可投放，投放中持续抽检'] },
]

export default function Marketplace() {
  const nav = useNavigate()
  const [cat, setCat] = useState('全部')
  const [link, setLink] = useState<{ brand: string; plan: string; url: string } | null>(null)
  const [specOpen, setSpecOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const toast = useToast()
  const { brands, claims, platformParams } = useStore()
  const live = brands.filter((b) => b.status === 'live')
  const list = cat === '全部' ? live : live.filter((b) => b.category === cat)

  const claim = (brandId: string, plan: string, brandName: string) => {
    const code = `${brandId}-A2041-dy-${Math.random().toString(36).slice(2, 7)}`
    const url = `https://t.linkve.cn/c/${code}`
    copyText(url)
    addClaim({ brandId, plan, url, channel: '抖音' }) // 真实写入投放计划，可在「我的投放计划」看板查看
    setLink({ brand: brandName, plan, url })
    toast({ tone: 'good', text: '追踪链接已生成并复制' })
  }

  return (
    <>
      <PageHeader
        title="选品市场"
        desc="面向代理的可投品牌套餐 · 透明费率与政策，合规素材规范，一键领取专属追踪链接与落地页。"
        actions={<Button variant="primary" onClick={() => setPlanOpen(true)}><Megaphone size={14} /> 我的投放计划{claims.length > 0 && <span className="ml-1 tnum">({claims.length})</span>}</Button>}
      />

      <div className="mb-4 flex items-center justify-between">
        <Segmented value={cat} onChange={setCat} options={CATS.map((c) => ({ value: c, label: c === '全部' ? '全部' : c.split(' ')[0] }))} />
        <span className="text-[12px] text-ink-4">{list.reduce((n, b) => n + b.plans.length, 0)} 个可投套餐</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.flatMap((b) =>
          b.plans.map((p) => {
            // 代理分润 = 品牌费率 × 分润占比（platformParams.agentSharePct，设置页可调，默认 72%）
            const agentShare = Math.round(b.feeRate * (platformParams.agentSharePct / 100))
            return (
              <Card key={b.id + p.name} className="flex flex-col transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-px hover:border-line-strong hover:shadow-[var(--shadow-pop)]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <BrandMark brand={b.id} mark={b.mark} size={34} />
                    <div>
                      <div className="text-[13px] font-semibold text-ink">{b.name}</div>
                      <div className="text-[11px] text-ink-4">{b.category}</div>
                    </div>
                  </div>
                  <Badge tone={b.path === 'direct' ? 'good' : b.path === 'licensed' ? 'info' : 'violet'}>{SETTLE_PATH_LABEL[b.path]}</Badge>
                </div>

                <div className="mt-3 rounded-xl bg-surface-muted p-3">
                  <div className="text-[12px] font-medium text-ink">{p.name}</div>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="tnum text-[20px] font-semibold text-ink">¥{p.firstPrice}</span>
                    <span className="text-[11px] text-ink-4">首{p.cycle}</span>
                    <span className="text-ink-4">→</span>
                    <span className="tnum text-[13px] font-medium text-ink-2">¥{p.renewPrice}/续{p.cycle}</span>
                  </div>
                  <div className="mt-1.5 text-[11px] text-ink-3">{p.equity}</div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Metric label="代理分润" value={`${agentShare}%`} tone="good" />
                  <Metric label="续费率" value={pct(b.renewalRate, 0)} tone="info" />
                  <Metric label="投诉率" value={pct(b.complaintRate)} tone={b.complaintRate >= 0.9 ? 'warn' : 'neutral'} />
                </div>

                <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-4">
                  <FileCheck size={13} className="text-good-ink" /> 落地页含合规告知 · 素材需过审
                </div>

                <div className="mt-3 flex gap-2 border-t border-line pt-3">
                  <Button variant="primary" className="flex-1 justify-center" onClick={() => claim(b.id, p.name, b.name)}><Link2 size={14} /> 领取追踪链接</Button>
                  {/* AIGC 入投放动线：素材应长在投放里，而非独立页（v9 §G7） */}
                  <Button variant="ghost" onClick={() => nav('/aigc')}><Sparkles size={14} /> 生成素材</Button>
                  <Button variant="ghost" onClick={() => setSpecOpen(true)}>规范</Button>
                </div>
              </Card>
            )
          }),
        )}
      </div>

      <Card className="mt-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-info-soft text-info-ink"><TrendingUp size={17} /></span>
          <div>
            <h3 className="text-[14px] font-semibold text-ink">平台对代理的承诺</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
              优质可投的套餐 · 稳定的归因（首单 + 续费归因到代理），按时不赖账的结算，合规的落地页与素材审核保护。代理只需专注投放与素材，选品、结算、合规由平台兜底。
            </p>
          </div>
        </div>
      </Card>

      <Modal open={!!link} onClose={() => setLink(null)} title="专属追踪链接已生成" footer={<Button variant="primary" onClick={() => setLink(null)}>完成</Button>}>
        {link && (
          <div className="space-y-3">
            <div className="text-[12.5px] text-ink-3">{link.brand} · {link.plan}</div>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2.5">
              <span className="tnum flex-1 truncate text-[12.5px] text-ink">{link.url}</span>
              <button onClick={() => { copyText(link.url) }} className="rounded-md bg-brand px-2 py-1 text-[11.5px] font-medium text-white hover:bg-brand-hover">复制</button>
            </div>
            <div className="text-[11.5px] leading-relaxed text-ink-4">链接已绑定 代理×品牌×套餐×渠道 归因；落地页含连续包月告知与退订入口，素材需过审后投放。</div>
          </div>
        )}
      </Modal>

      <DocModal open={specOpen} onClose={() => setSpecOpen(false)} title="合规素材规范" intro="投放素材须满足以下规范并通过审核后方可上线。" sections={CREATIVE_SPEC} downloadName="合规素材规范.txt" />

      <Modal open={planOpen} onClose={() => setPlanOpen(false)} width={620} title="我的投放计划" footer={<Button variant="primary" onClick={() => setPlanOpen(false)}>完成</Button>}>
        {claims.length === 0 ? (
          <EmptyState title="还没有投放计划" desc="在下方品牌套餐卡点「领取追踪链接」，即可生成投放计划并在此查看消耗与分润。" />
        ) : (
          <TableShell head={<><Th className="pl-1">品牌 / 套餐</Th><Th>渠道</Th><Th right>消耗</Th><Th right>带来首单</Th><Th right>已产生分润</Th></>}>
            {claims.map((c) => (
              <Row key={c.id}>
                <Td className="pl-1"><div className="text-[12.5px] font-medium text-ink">{brandById(c.brandId)?.name ?? c.brandId}</div><div className="text-[11px] text-ink-4">{c.plan}</div></Td>
                <Td><span className="text-[12px]">{c.channel}</span></Td>
                <Td right mono className="text-[12.5px]">¥{c.spend.toLocaleString('zh-CN')}</Td>
                <Td right mono className="text-[12.5px]">{c.firstOrders}</Td>
                <Td right mono className="text-[12.5px] text-good-ink">¥{c.payout.toLocaleString('zh-CN')}</Td>
              </Row>
            ))}
          </TableShell>
        )}
      </Modal>
    </>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'good' | 'info' | 'warn' | 'neutral' }) {
  return (
    <div className="rounded-lg bg-surface-muted py-2">
      <div className={cx('tnum text-[14px] font-semibold', TONE[tone].ink)}>{value}</div>
      <div className="text-[10.5px] text-ink-4">{label}</div>
    </div>
  )
}
