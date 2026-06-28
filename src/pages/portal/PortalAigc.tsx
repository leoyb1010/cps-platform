import { useEffect, useState } from 'react'
import { Wand2, Loader2, CheckCircle2, Sparkles } from 'lucide-react'
import { Card, CardTitle, PageHeader, Badge, Button } from '../../components/ui/primitives'
import { Field, Select, Textarea } from '../../components/ui/forms'
import { aigcApi, type FactoryConfig, type GeneratePayload } from '../../lib/aigcApi'
import { isRealApi } from '../../lib/http'
import { DemoNotice } from '../../components/portal/kit'
import { int } from '../../lib/format'

// 客户门户 AIGC 素材生成（轻量版）：复用 cps 的 /aigc 代理（→ agent-studio 微服务），
// 与门户 UI 风格统一，客户不感知背后是独立微服务。品牌方/代理共用同一页。
interface GenItem {
  jobId: string
  assetLabel: string
  prompt: string
}

export function PortalAigc() {
  const [cfg, setCfg] = useState<FactoryConfig | null>(null)
  const [loadErr, setLoadErr] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)
  const [gens, setGens] = useState<GenItem[]>([])

  const [assetType, setAssetType] = useState('carousel')
  const [intent, setIntent] = useState('educate')
  const [prompt, setPrompt] = useState('')
  const [preset, setPreset] = useState('balanced')
  const [estimate, setEstimate] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!isRealApi) { setLoadErr(true); return }
    aigcApi.config().then((c) => {
      setCfg(c)
      if (c.assetTypes?.[0]) setAssetType(c.assetTypes[0].id)
      const bal = c.credits?.availableCredits ?? c.credits?.balance
      if (typeof bal === 'number') setCredits(bal)
    }).catch(() => setLoadErr(true))
    aigcApi.credits().then((r) => {
      const c = r.credits?.availableCredits ?? r.credits?.balance
      if (typeof c === 'number') setCredits(c)
    }).catch(() => {})
  }, [])

  const assetTypes = cfg?.assetTypes ?? []
  const current = assetTypes.find((a) => a.id === assetType)
  const payload = (): GeneratePayload => ({ assetType, platform: current?.defaultPlatform ?? 'xhs', intent, prompt: prompt.trim(), modelPreset: preset })

  const doEstimate = async () => {
    if (!prompt.trim()) { setMsg('先填一句话描述要生成什么'); return }
    setMsg('')
    try { const r = await aigcApi.estimate(payload()); setEstimate(r.creditsEstimated) } catch { setMsg('估算失败：素材服务未连接') }
  }
  const doGenerate = async () => {
    if (!prompt.trim()) { setMsg('先填一句话描述要生成什么'); return }
    setBusy(true); setMsg('')
    try {
      const r = await aigcApi.generate(payload())
      if (!r.ok || !r.job) throw new Error('no job')
      setGens((p) => [{ jobId: r.job!.id, assetLabel: current?.label ?? assetType, prompt: prompt.trim() }, ...p])
      const bal = r.credits?.availableCredits ?? r.credits?.balance
      if (typeof bal === 'number') setCredits(bal)
      setPrompt(''); setEstimate(null); setMsg('')
    } catch { setMsg('生成失败：素材服务未连接') } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="AIGC 素材" desc="一句话生成投放素材（图文 / 海报 / 短视频脚本），按量计费。素材可直接用于你的推广投放。" />
      {loadErr ? <DemoNotice /> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
          {/* 左：生成表单 */}
          <Card>
            <CardTitle title="生成素材" desc="选类型 → 一句话描述 → 生成" right={<Badge tone="info" dot>{credits != null ? `${int(credits)} 积分` : '积分'}</Badge>} />
            <div className="space-y-3">
              <Field label="素材类型">
                <Select value={assetType} onChange={(e) => { setAssetType(e.target.value); setEstimate(null) }}>
                  {assetTypes.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </Select>
              </Field>
              <Field label="目标" hint="影响文案口吻">
                <Select value={intent} onChange={(e) => setIntent(e.target.value)}>
                  <option value="educate">种草科普</option>
                  <option value="convert">促转化</option>
                  <option value="retain">促续费</option>
                </Select>
              </Field>
              <Field label="一句话描述" required>
                <Textarea rows={3} value={prompt} onChange={(e) => { setPrompt(e.target.value); setEstimate(null) }} placeholder="例：会员续费提醒，强调连续包月更划算" />
              </Field>
              <Field label="模型档位" hint="便宜档省积分，均衡档质量更稳">
                <Select value={preset} onChange={(e) => { setPreset(e.target.value); setEstimate(null) }}>
                  <option value="cheap">便宜</option>
                  <option value="balanced">均衡</option>
                  <option value="quality">高质量</option>
                </Select>
              </Field>
              {msg && <div className="rounded-md bg-warn-soft/50 px-2.5 py-1.5 text-[12px] text-warn-ink">{msg}</div>}
              <div className="flex items-center justify-between gap-2">
                <button onClick={doEstimate} className="text-[12px] font-medium text-brand hover:underline">先估算积分 →</button>
                <Button variant="primary" onClick={doGenerate} disabled={busy}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} 生成{estimate != null ? ` · ${estimate} 积分` : ''}
                </Button>
              </div>
            </div>
          </Card>

          {/* 右：本次生成 */}
          <Card>
            <CardTitle title="本次生成" desc="经素材引擎实时生成，可继续用于投放" right={gens.length > 0 ? <Badge tone="good" dot>{gens.length} 条</Badge> : undefined} />
            {gens.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-surface text-ink-3"><Sparkles size={18} /></span>
                <div className="text-[13.5px] font-semibold text-ink">还没有生成素材</div>
                <p className="mt-1 text-[12px] text-ink-4">在左侧填一句话描述，点击生成。</p>
              </div>
            ) : (
              <div className="space-y-2">
                {gens.map((g) => (
                  <div key={g.jobId} className="flex items-center gap-3 rounded-lg border border-line bg-surface-muted p-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-good-soft text-good-ink"><CheckCircle2 size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium text-ink">{g.assetLabel} · {g.prompt}</div>
                      <div className="text-[11px] text-ink-4">{g.jobId}</div>
                    </div>
                    <Badge tone="info">可用于投放</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  )
}

// 顶部一张积分概览卡 + 生成页，供两个 portal 直接渲染
export default function PortalAigcPage() {
  return <PortalAigc />
}
