import { useEffect, useRef, useState } from 'react'
import { Wand2, Loader2 } from 'lucide-react'
import { Card, CardTitle, PageHeader, Badge, Button } from '../../components/ui/primitives'
import { Field, Select, Textarea } from '../../components/ui/forms'
import { aigcApi, generationErrorMessage, type FactoryConfig, type GeneratePayload } from '../../lib/aigcApi'
import { isRealApi } from '../../lib/http'
import { DemoNotice } from '../../components/portal/kit'
import { int } from '../../lib/format'
import { GeneratedMaterials, type GeneratedMaterial } from '../../components/aigc/GeneratedMaterials'
import { useTabDraft } from '../../lib/useTabDraft'
import { GENERATION_RECOVERED } from '../../components/aigc/GenerationRecovery'
import { useAigcEstimate } from '../../lib/useAigcEstimate'

// 客户门户 AIGC 素材生成（轻量版）：复用 cps 的 /aigc 代理（→ agent-studio 微服务），
// 与门户 UI 风格统一，客户不感知背后是独立微服务。品牌方/代理共用同一页。
export function PortalAigc() {
  const [cfg, setCfg] = useState<FactoryConfig | null>(null)
  const [loadErr, setLoadErr] = useState(false)
  const [configAttempt, setConfigAttempt] = useState(0)
  const [credits, setCredits] = useState<number | null>(null)
  const creditRevision = useRef(0)
  const [gens, setGens] = useState<GeneratedMaterial[]>([])
  useEffect(() => {
    const refreshed = () => {
      const revision = ++creditRevision.current
      setCredits(null)
      void aigcApi.credits().then(result => {
        const balance = result.credits?.availableCredits ?? result.credits?.balance
        if (creditRevision.current === revision) setCredits(typeof balance === 'number' ? balance : null)
      }).catch(() => {})
    }
    window.addEventListener(GENERATION_RECOVERED, refreshed)
    return () => { window.removeEventListener(GENERATION_RECOVERED, refreshed); creditRevision.current += 1 }
  }, [])


  const { draft, setDraft, clearDraft } = useTabDraft('aigc', { assetType: 'carousel', intent: 'educate', prompt: '', preset: 'balanced' })
  const { assetType, intent, prompt, preset } = draft
  const setAssetType = (assetType: string) => setDraft(old => ({ ...old, assetType }))
  const setIntent = (intent: string) => setDraft(old => ({ ...old, intent }))
  const setPrompt = (prompt: string) => setDraft(old => ({ ...old, prompt }))
  const setPreset = (preset: string) => setDraft(old => ({ ...old, preset }))
  const { estimate, invalidateEstimate, estimateWith } = useAigcEstimate()
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!isRealApi) { setLoadErr(true); return }
    setLoadErr(false)
    const revision = creditRevision.current
    aigcApi.config().then((c) => {
      if (creditRevision.current !== revision) return
      setCfg(c)
      if (c.assetTypes?.[0]) setDraft(previous => c.assetTypes.some(item => item.id === previous.assetType) ? previous : { ...previous, assetType: c.assetTypes[0].id })
      const bal = c.credits?.availableCredits ?? c.credits?.balance
      if (typeof bal === 'number') setCredits(bal)
    }).catch(() => { if (creditRevision.current === revision) setLoadErr(true) })
    aigcApi.credits().then((r) => {
      const c = r.credits?.availableCredits ?? r.credits?.balance
      if (creditRevision.current === revision && typeof c === 'number') setCredits(c)
    }).catch(() => {})
    return () => { creditRevision.current += 1 }
  }, [configAttempt, setDraft])

  const assetTypes = cfg?.assetTypes ?? []
  const current = assetTypes.find((a) => a.id === assetType)
  const payload = (): GeneratePayload => ({ assetType, platform: current?.defaultPlatform ?? 'xhs', intent, prompt: prompt.trim(), modelPreset: preset })

  const doEstimate = async () => {
    if (!prompt.trim()) { setMsg('先填一句话描述要生成什么'); return }
    setMsg('')
    try {
      await estimateWith(async () => {
        const r = await aigcApi.estimate(payload())
        if (!r.ok) throw new Error('Estimate rejected')
        return r.creditsEstimated
      })
    } catch { setMsg('估算失败：素材服务未连接') }
  }
  const doGenerate = async () => {
    if (!prompt.trim()) { setMsg('先填一句话描述要生成什么'); return }
    if (submitting.current) return
    submitting.current = true
    setBusy(true); setMsg('')
    try {
      const r = await aigcApi.generate(payload())
      if (r.pending || (r.job && r.job.status !== 'completed')) { if (active.current) setMsg('原任务仍在处理中，请在待确认请求中查询。'); return }
      if (!r.ok || !r.job) throw new Error('no job')
      if (!active.current) return
      setGens((p) => [{ jobId: r.job!.id, assetType, assetLabel: current?.label ?? assetType, prompt: prompt.trim(), output: r.result, credits: r.job!.credits_charged }, ...p])
      const revision = ++creditRevision.current
      setCredits(null)
      void aigcApi.credits().then(result => {
        const balance = result.credits?.availableCredits ?? result.credits?.balance
        if (active.current && creditRevision.current === revision) setCredits(typeof balance === 'number' ? balance : null)
      }).catch(() => {})
      setPrompt(''); clearDraft(); invalidateEstimate(); setMsg('')
    } catch (error) { if (active.current) setMsg(generationErrorMessage(error)) } finally { submitting.current = false; if (active.current) setBusy(false) }
  }

  return (
    <>
      <PageHeader title="AIGC 素材" desc="一句话生成投放素材（图文 / 海报 / 短视频脚本），按量计费。查看并审核结果后，再用于你的推广投放。" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
          {loadErr ? isRealApi ? <Card><p role="alert" className="text-sm text-warn-ink">素材配置暂时无法读取，已保存素材仍可查看。</p><Button onClick={() => setConfigAttempt(value => value + 1)}>重试连接</Button></Card> : <DemoNotice /> : <Card>
            <CardTitle title="生成素材" desc="选类型 → 一句话描述 → 生成" right={<Badge tone="info" dot>{credits != null ? `${int(credits)} 积分` : '积分'}</Badge>} />
            <div className="space-y-3">
              <Field label="素材类型">
                <Select disabled={busy} value={assetType} onChange={(e) => { setAssetType(e.target.value); invalidateEstimate() }}>
                  {assetTypes.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </Select>
              </Field>
              <Field label="目标" hint="影响文案口吻">
                <Select disabled={busy} value={intent} onChange={(e) => { setIntent(e.target.value); invalidateEstimate() }}>
                  <option value="educate">种草科普</option>
                  <option value="convert">促转化</option>
                  <option value="retain">促续费</option>
                </Select>
              </Field>
              <Field label="一句话描述" required>
                <Textarea disabled={busy} rows={3} value={prompt} onChange={(e) => { setPrompt(e.target.value); invalidateEstimate() }} placeholder="例：会员续费提醒，强调连续包月更划算" />
              </Field>
              <Field label="模型档位" hint="便宜档省积分，均衡档质量更稳">
                <Select disabled={busy} value={preset} onChange={(e) => { setPreset(e.target.value); invalidateEstimate() }}>
                  <option value="cheap">便宜</option>
                  <option value="balanced">均衡</option>
                  <option value="quality">高质量</option>
                </Select>
              </Field>
              {msg && <div className="rounded-md bg-warn-soft/50 px-2.5 py-1.5 text-[12px] text-warn-ink">{msg}</div>}
              <div className="flex items-center justify-between gap-2">
                <button onClick={doEstimate} disabled={busy || !cfg || !current} className="text-[12px] font-medium text-brand hover:underline disabled:opacity-50">先估算积分 →</button>
                <Button variant="primary" onClick={doGenerate} disabled={busy || !cfg || !current}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} 生成{estimate != null ? ` · ${estimate} 积分` : ''}
                </Button>
              </div>
            </div>
          </Card>}
          {isRealApi && <GeneratedMaterials recent={gens} />}
        </div>
    </>
  )
}

// 顶部一张积分概览卡 + 生成页，供两个 portal 直接渲染
export default function PortalAigcPage() {
  return <PortalAigc />
}
