import { useEffect, useState } from 'react'
import { Wand2, Loader2, CheckCircle2 } from 'lucide-react'
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
} from '../components/ui/primitives'
import { Meter } from '../components/ui/charts'
import { Modal, useToast } from '../components/ui/overlays'
import { DetailPopover, Info, useAnchoredPopover, type AnchorRect } from '../components/ui/popover'
import { Field, Select, Textarea } from '../components/ui/forms'
import {
  aigcAssets as seed,
  aigcCredits,
  brandById,
  CREATIVE_TYPE_LABEL,
  AIGC_STATUS,
  type AigcAsset,
  type CreativeType,
} from '../lib/data'
import { aigcApi, type FactoryConfig, type GeneratePayload } from '../lib/aigcApi'
import { isRealApi } from '../lib/http'
import { int, cx } from '../lib/format'

// 本次会话内真实生成的素材（来自 agent-studio 微服务），展示在实验台之上
interface GenItem {
  jobId: string
  assetType: string
  assetLabel: string
  prompt: string
  credits: number
}

// 演示态素材类型配置：无需连 agent-studio 也能完整体验「生成素材」流程（模拟生成）
const DEMO_CFG: FactoryConfig = {
  ok: true,
  assetTypes: [
    { id: 'carousel', label: '图文轮播', modality: 'image', description: '小红书/朋友圈多图种草', defaultPlatform: 'xhs' },
    { id: 'poster', label: '单图海报', modality: 'image', description: '信息流单图创意', defaultPlatform: 'xhs' },
    { id: 'reel', label: '短视频脚本', modality: 'video', description: '抖音/视频号口播脚本 + 分镜', defaultPlatform: 'douyin' },
    { id: 'copy', label: '投放文案', modality: 'text', description: '标题 + 正文多版本', defaultPlatform: 'xhs' },
  ],
}

export default function Aigc() {
  const [f, setF] = useState<'all' | CreativeType>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const pop = useAnchoredPopover()
  const [genOpen, setGenOpen] = useState(false)
  const [gens, setGens] = useState<GenItem[]>([])
  const [credits, setCredits] = useState<number | null>(null)
  const list = seed.filter((a) => (f === 'all' ? true : a.type === f))
  const active = seed.find((a) => a.id === openId) ?? null

  const total = seed.length
  const avgCtr = total ? seed.reduce((s, a) => s + a.ctr, 0) / total : 0
  const avgCvr = total ? seed.reduce((s, a) => s + a.cvr, 0) / total : 0
  const bestLtv = Math.max(0, ...seed.map((a) => a.ltv))

  // 真实模式：拉取素材引擎积分余额（连不上则保持 mock 占位）
  useEffect(() => {
    if (!isRealApi) return
    aigcApi.credits().then((r) => {
      const c = r.credits?.availableCredits ?? r.credits?.balance
      if (typeof c === 'number') setCredits(c)
    }).catch(() => {})
  }, [])

  return (
    <>
      <PageHeader
        title="AIGC · 素材实验"
        desc="积分制自助生成投放素材，每条素材回收点击/转化/续费/退款数据，按 LTV 而非 CTR 排名。不卖 AIGC，卖更低风险、更高 LTV 的订阅增长。"
        actions={
          <>
            <Segmented
              value={f}
              onChange={setF}
              options={[
                { value: 'all', label: '全部' },
                { value: 'image', label: '图片' },
                { value: 'video', label: '短视频' },
                { value: 'copy', label: '文案' },
              ]}
            />
            <Button variant="primary" onClick={() => setGenOpen(true)}><Wand2 size={14} /> 生成素材</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card mark><Stat label="素材实验" value={String(total + gens.length)} sub={<span>接入 CPS 投放链路</span>} /></Card>
        <Card mark><Stat label="积分余额" value={int(credits ?? aigcCredits)} sub={<span>{credits != null ? '素材引擎实时' : '按量计费 · 软件服务'}</span>} /></Card>
        <Card mark><Stat label="平均点击率" value={`${avgCtr.toFixed(1)}%`} sub={<span>CTR</span>} /></Card>
        <Card mark><Stat label="最高素材 LTV" value={`¥${bestLtv}`} hint="按净 LTV 排名，不只看点击率" sub={<span>转化闭环排名</span>} /></Card>
      </div>

      {gens.length > 0 && (
        <Card className="mt-4">
          <CardTitle title="本次生成" desc={`经素材引擎实时生成 · 可继续接入投放回收 LTV`} right={<Badge tone="good" dot>{gens.length} 条</Badge>} />
          <div className="space-y-2">
            {gens.map((g) => (
              <div key={g.jobId} className="flex items-center gap-3 rounded-lg border border-line bg-surface-muted p-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-good-soft text-good-ink"><CheckCircle2 size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-ink">{g.assetLabel} · {g.prompt}</div>
                  <div className="text-[11px] text-ink-4">{g.jobId} · 消耗 {g.credits} 积分</div>
                </div>
                <Badge tone="info">待接入投放</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <CardTitle title="素材实验台" desc="素材 → 投放 → 转化数据回流，按 LTV 排名" />
          <span className="mb-3.5 text-[12px] text-ink-4">平均转化率 {avgCvr.toFixed(1)}%</span>
        </div>
        <TableShell
          className="px-2 pb-2"
          head={
            <>
              <Th className="pl-3">素材</Th>
              <Th>类型</Th>
              <Th>关联投放</Th>
              <Th right>消耗积分</Th>
              <Th right>点击率</Th>
              <Th right>转化率</Th>
              <Th right>素材 LTV</Th>
              <Th right>状态</Th>
            </>
          }
        >
          {list.map((a) => {
            const b = brandById(a.brandId)
            const st = AIGC_STATUS[a.status]
            const ltvPct = Math.min(100, (a.ltv / Math.max(1, bestLtv)) * 100)
            return (
              <Row key={a.id} onClick={(e) => { setOpenId(a.id); pop.openAt(e) }}>
                <Td className="pl-3"><span className="text-[12.5px] font-medium text-ink">{a.name}</span></Td>
                <Td><span className="text-[12px]">{CREATIVE_TYPE_LABEL[a.type]}</span></Td>
                <Td><div className="flex items-center gap-2">{b && <BrandMark brand={b.id} mark={b.mark} size={22} />}<span className="text-[12px] text-ink-3">{b?.name ?? a.brandId}</span></div></Td>
                <Td right mono className="text-[12.5px]">{a.credits}</Td>
                <Td right mono className={cx('text-[12.5px]', a.ctr >= 3 ? 'text-good-ink' : a.ctr >= 1.5 ? 'text-ink-2' : 'text-warn-ink')}>{a.ctr}%</Td>
                <Td right mono className={cx('text-[12.5px]', a.cvr >= 5 ? 'text-good-ink font-medium' : a.cvr >= 2 ? 'text-ink-2' : 'text-warn-ink')}>{a.cvr}%</Td>
                <Td right>
                  <div className="ml-auto w-[100px]">
                    <div className="mb-1 text-right text-[11px] tnum text-ink-2">¥{a.ltv}</div>
                    <Meter value={ltvPct} tone={a.ltv >= 90 ? 'good' : a.ltv >= 60 ? 'info' : 'warn'} />
                  </div>
                </Td>
                <Td right><Badge tone={st.tone}>{st.label}</Badge></Td>
              </Row>
            )
          })}
        </TableShell>
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[12px] text-ink-3">
          <span>共 {list.length} 条素材实验</span>
          <span className="text-ink-4">AIGC 内容标识与素材审查内置（合规要求）</span>
        </div>
      </Card>

      <AigcDrawer asset={active} anchor={pop.anchorRect} onClose={() => { setOpenId(null); pop.close() }} />
      {genOpen && (
        <NewMaterialModal
          onClose={() => setGenOpen(false)}
          onGenerated={(item, balance) => {
            setGens((prev) => [item, ...prev])
            if (typeof balance === 'number') setCredits(balance)
          }}
        />
      )}
    </>
  )
}

function NewMaterialModal({ onClose, onGenerated }: { onClose: () => void; onGenerated: (item: GenItem, balance?: number) => void }) {
  const toast = useToast()
  const [cfg, setCfg] = useState<FactoryConfig | null>(null)
  const [loadErr, setLoadErr] = useState(false)
  const [assetType, setAssetType] = useState('carousel')
  const [intent, setIntent] = useState('educate')
  const [prompt, setPrompt] = useState('')
  const [preset, setPreset] = useState('balanced')
  const [estimate, setEstimate] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  // 演示态：用内置素材类型让"生成素材"可完整体验（模拟生成，不调真实 agent-studio）。
  // 真实模式：拉素材引擎配置；微服务未连才显示占位。
  useEffect(() => {
    if (!isRealApi) { setCfg(DEMO_CFG); setAssetType(DEMO_CFG.assetTypes[0].id); return }
    aigcApi.config().then((c) => {
      setCfg(c)
      if (c.assetTypes?.[0]) setAssetType(c.assetTypes[0].id)
    }).catch(() => setLoadErr(true))
  }, [])

  const assetTypes = cfg?.assetTypes ?? []
  const current = assetTypes.find((a) => a.id === assetType)
  const platform = current?.defaultPlatform ?? 'xhs'
  const payload = (): GeneratePayload => ({ assetType, platform, intent, prompt: prompt.trim(), modelPreset: preset })

  // 演示态积分估算：按档位 × 素材类型给确定性估值（与真实引擎口径近似）
  const demoEstimate = () => {
    const base = assetType.includes('video') || assetType === 'reel' ? 40 : assetType === 'copy' ? 8 : 20
    const mult = preset === 'quality' ? 2 : preset === 'cheap' ? 0.6 : 1
    return Math.round(base * mult)
  }

  const doEstimate = async () => {
    if (!prompt.trim()) { toast({ tone: 'info', text: '先填一句话描述要生成什么' }); return }
    if (!isRealApi) { setEstimate(demoEstimate()); return }
    try {
      const r = await aigcApi.estimate(payload())
      setEstimate(r.creditsEstimated)
    } catch {
      toast({ tone: 'alert', text: '估算失败：素材服务未连接' })
    }
  }

  const doGenerate = async () => {
    if (!prompt.trim()) { toast({ tone: 'info', text: '先填一句话描述要生成什么' }); return }
    // 演示态：模拟生成（不调真实 agent-studio），落一条"本次生成"记录，走通完整体验
    if (!isRealApi) {
      const cost = estimate ?? demoEstimate()
      onGenerated(
        { jobId: 'GEN-' + Math.random().toString(36).slice(2, 8).toUpperCase(), assetType, assetLabel: current?.label ?? assetType, prompt: prompt.trim(), credits: cost },
        undefined,
      )
      toast({ tone: 'good', text: `已生成（演示）· ${current?.label ?? assetType}` })
      onClose()
      return
    }
    setBusy(true)
    try {
      const r = await aigcApi.generate(payload())
      if (!r.ok || !r.job) throw new Error('no job')
      onGenerated(
        {
          jobId: r.job.id,
          assetType,
          assetLabel: current?.label ?? assetType,
          prompt: prompt.trim(),
          credits: estimate ?? 0,
        },
        r.credits?.availableCredits ?? r.credits?.balance,
      )
      toast({ tone: 'good', text: `已生成 · ${current?.label ?? assetType}` })
      onClose()
    } catch {
      toast({ tone: 'alert', text: '生成失败：素材服务未连接（agent-studio 微服务未启动）' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} width={500} title="生成素材" footer={
      <>
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button variant="primary" onClick={doGenerate} disabled={busy || loadErr}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} 生成{estimate != null ? ` · ${estimate} 积分` : ''}
        </Button>
      </>
    }>
      {loadErr ? (
        <div className="rounded-lg border border-dashed border-line bg-surface-muted p-4 text-[12.5px] leading-relaxed text-ink-3">
          素材引擎未连接。素材生成由 agent-studio 微服务提供（默认 <span className="font-mono text-[11px]">127.0.0.1:48787</span>），
          需在真实后端模式下启动该服务。当前仅展示历史实验台数据。
        </div>
      ) : (
        <div className="space-y-3.5">
          <Field label="素材类型">
            <Select value={assetType} onChange={(e) => { setAssetType(e.target.value); setEstimate(null) }}>
              {assetTypes.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </Field>
          <Field label="目标" hint="生成意图，影响文案口吻">
            <Select value={intent} onChange={(e) => setIntent(e.target.value)}>
              <option value="educate">种草科普</option>
              <option value="convert">促转化</option>
              <option value="retain">促续费</option>
            </Select>
          </Field>
          <Field label="一句话描述" required>
            <Textarea rows={3} value={prompt} onChange={(e) => { setPrompt(e.target.value); setEstimate(null) }} placeholder="例：有道词典会员续费提醒，强调连续包月更划算" />
          </Field>
          <Field label="模型档位" hint="便宜档省积分，均衡档质量更稳">
            <Select value={preset} onChange={(e) => { setPreset(e.target.value); setEstimate(null) }}>
              <option value="cheap">便宜</option>
              <option value="balanced">均衡</option>
              <option value="quality">高质量</option>
            </Select>
          </Field>
          <button onClick={doEstimate} className="text-[12px] font-medium text-brand hover:underline">先估算积分 →</button>
        </div>
      )}
    </Modal>
  )
}

function AigcDrawer({ asset, anchor, onClose }: { asset: AigcAsset | null; anchor: AnchorRect | null; onClose: () => void }) {
  if (!asset) return null
  const a = asset
  const b = brandById(a.brandId)
  const st = AIGC_STATUS[a.status]
  return (
    <DetailPopover anchor={anchor} onClose={onClose} width={400} title={<span>{a.name}</span>} desc={<span>{CREATIVE_TYPE_LABEL[a.type]} · {b?.name}</span>} footer={<Button variant="ghost" onClick={onClose}>关闭</Button>}>
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted p-3.5">
        <div><div className="text-[12.5px] font-medium text-ink">{CREATIVE_TYPE_LABEL[a.type]}素材</div><div className="mt-0.5 text-[11px] text-ink-4">消耗 {a.credits} 积分</div></div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <div className="mt-5">
        <div className="mb-2.5 flex items-center gap-2"><span className="h-[7px] w-[7px] bg-brand" /><span className="text-[13px] font-semibold">转化闭环数据</span></div>
        <div className="grid grid-cols-2 gap-3 text-[12.5px]">
          <Info k="关联品牌" v={b?.name ?? a.brandId} />
          <Info k="消耗积分" v={String(a.credits)} />
          <Info k="点击率 CTR" v={`${a.ctr}%`} />
          <Info k="转化率 CVR" v={`${a.cvr}%`} />
          <Info k="素材维度 LTV" v={<span className="font-semibold">¥{a.ltv}</span>} />
          <Info k="排名依据" v="按净 LTV，非 CTR" />
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-dashed border-line bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">
        <span className="font-medium text-ink-2">差异化：</span>每条素材直接接入 CPS 投放链路，回收真实点击率/转化率/续费数据，反过来训练"什么素材更能带货"，这是纯生图工具拿不到的闭环。
      </div>
    </DetailPopover>
  )
}
