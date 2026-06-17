import { useState } from 'react'
import { Link2, FileCheck, TrendingUp, Megaphone } from 'lucide-react'
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
import { brands, SETTLE_PATH_LABEL } from '../lib/data'
import { pct, cx } from '../lib/format'

const CATS = ['全部', '工具 / 知识', '音视频 / 泛娱乐', '生活服务 / 电商']

export default function Marketplace() {
  const [cat, setCat] = useState('全部')
  const [link, setLink] = useState<{ brand: string; plan: string; url: string } | null>(null)
  const toast = useToast()
  const live = brands.filter((b) => b.status === 'live')
  const list = cat === '全部' ? live : live.filter((b) => b.category === cat)

  const claim = (brandId: string, plan: string, brandName: string) => {
    const code = `${brandId}-A2041-dy-${Math.random().toString(36).slice(2, 7)}`
    const url = `https://t.linkve.cn/c/${code}`
    navigator.clipboard?.writeText(url).catch(() => {})
    setLink({ brand: brandName, plan, url })
    toast({ tone: 'good', text: '追踪链接已生成并复制' })
  }

  return (
    <>
      <PageHeader
        title="选品市场"
        desc="面向代理的可投品牌套餐 · 透明费率与政策 · 合规素材规范 · 一键领取专属追踪链接与落地页。"
        actions={<Button variant="primary" onClick={() => toast({ tone: 'info', text: '我的投放计划：已领取链接、消耗与分润看板（演示）' })}><Megaphone size={14} /> 我的投放计划</Button>}
      />

      <div className="mb-4 flex items-center justify-between">
        <Segmented value={cat} onChange={setCat} options={CATS.map((c) => ({ value: c, label: c === '全部' ? '全部' : c.split(' ')[0] }))} />
        <span className="text-[12px] text-ink-4">{list.length} 个可投套餐</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.flatMap((b) =>
          b.plans.map((p) => {
            const agentShare = Math.round(b.feeRate * 0.72)
            return (
              <Card key={b.id + p.name} className="flex flex-col">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <BrandMark mark={b.mark} size={34} />
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
                  <Button variant="ghost" onClick={() => toast({ tone: 'info', text: '素材规范：禁绝对化用语、需含连续包月告知，过审后投放' })}>素材规范</Button>
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
            <h3 className="text-[13.5px] font-semibold text-ink">平台对代理的承诺</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
              优质可投的套餐 · 稳定的归因（首单 + 续费归因到代理）· 按时不赖账的结算 · 合规的落地页与素材审核保护。代理只需专注投放与素材，选品、结算、合规由平台兜底。
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
              <button onClick={() => { navigator.clipboard?.writeText(link.url) }} className="rounded-md bg-brand px-2 py-1 text-[11.5px] font-medium text-white hover:bg-brand-hover">复制</button>
            </div>
            <div className="text-[11.5px] leading-relaxed text-ink-4">链接已绑定 代理×品牌×套餐×渠道 归因；落地页含连续包月告知与退订入口，素材需过审后投放。</div>
          </div>
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
