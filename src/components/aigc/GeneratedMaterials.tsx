import { useCallback, useEffect, useRef, useState } from 'react'
import { aigcApi, type FactoryJob, type FactoryOutput } from '../../lib/aigcApi'
import { Badge, Button, Card, CardTitle } from '../ui/primitives'
export interface GeneratedMaterial {
  jobId: string
  assetType?: string
  assetLabel: string
  prompt: string
  credits?: number | null
  output?: FactoryOutput
}
const fromJob = (job: FactoryJob): GeneratedMaterial => ({ jobId: job.id, assetType: job.asset_type, assetLabel: job.asset_type, prompt: job.prompt, credits: job.credits_charged, output: job.output_json })
export function GeneratedMaterials({ recent }: { recent: GeneratedMaterial[] }) {
  const [saved, setSaved] = useState<GeneratedMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const revision = useRef(0)
  const load = useCallback(async () => {
    const current = ++revision.current
    setLoading(true)
    try {
      const result = await aigcApi.jobs()
      if (current !== revision.current) return
      setSaved(result.jobs.filter(j => j.status === 'completed').map(fromJob)); setError(false)
    } catch { if (current === revision.current) setError(true) }
    finally { if (current === revision.current) setLoading(false) }
  }, [])
  useEffect(() => { void load(); return () => { revision.current += 1 } }, [load, recent])
  const items = new Map(saved.slice().reverse().map(item => [item.jobId, item]))
  for (const item of recent) items.set(item.jobId, { ...items.get(item.jobId), ...item, output: item.output ?? items.get(item.jobId)?.output })
  return <Card className="mt-4" aria-busy={loading}>
    <CardTitle title="已生成素材" desc="保存的最近 30 条任务，可查看文案；刷新后仍可找回" right={<Badge tone="info">{items.size} 条</Badge>} />
    {error && <div role="alert" className="mb-3 text-sm text-warn-ink">历史素材暂时无法读取，已显示的结果仍保留。<Button disabled={loading} onClick={() => void load()}>重试</Button></div>}
    {!items.size && <p className="text-sm text-ink-3">{loading ? '正在读取素材…' : error ? '请重试读取历史素材。' : '还没有生成素材，在表单中描述你的需求即可开始。'}</p>}
    <div className="space-y-3">{Array.from(items.values()).reverse().map(item => {
      const type = item.output?.type ?? item.assetType
      const promptOnly = ['image', 'poster', 'ad'].includes(type ?? '')
      const video = type === 'video'
      const copy = item.output?.copy ?? item.output?.pack?.platformCopy?.xhs
      return <article key={item.jobId} className="min-w-0 rounded-lg border border-line bg-surface-muted p-3">
        <div className="break-words text-sm font-medium">{item.assetLabel} · {item.prompt}</div>
        <div className="break-all text-xs text-ink-4">{item.jobId} · {item.credits == null ? '消耗积分待确认' : `消耗 ${item.credits} 积分`}</div>
        <details className="mt-2"><summary className="cursor-pointer text-sm font-medium text-brand focus-visible:outline">查看素材</summary>
          {promptOnly ? <>
            <p className="mt-2 text-sm text-warn-ink">当前仅生成图片提示词，尚未生成可用图片。</p>
            <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm">{item.output?.imagePrompt || '图片提示词暂不可用'}</pre>
          </> : video ? <>
            <p className="mt-2 text-sm text-warn-ink">当前结果为分镜脚本与预览图，未生成最终视频文件。</p>
            <ol className="mt-2 space-y-2 text-sm">{item.output?.storyboard?.map((frame, index) => <li key={index}><b>{frame.time} {frame.shot}</b><p>{frame.visual}</p><p>{frame.voice}</p></li>)}</ol>
          </> : copy?.body ? <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm" data-testid="generated-copy">{copy.title ? `${copy.title}\n\n` : ''}{copy.body}</pre> : <p className="mt-2 text-sm text-ink-3">当前结果没有可用文案，请查看素材类型或稍后重试读取。</p>}
          {!!(item.output?.assets?.files ?? item.output?.motionPreview?.files)?.length && <div className="mt-2 grid gap-3 sm:grid-cols-2">{(item.output?.assets?.files ?? item.output?.motionPreview?.files)?.map((_, index) => <GeneratedImage key={index} jobId={item.jobId} index={index} />)}</div>}
        </details>
      </article>
    })}</div>
  </Card>
}

function GeneratedImage({ jobId, index }: { jobId: string; index: number }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const ownedUrl = useRef('')
  const inFlight = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false; if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current) } }, [])
  async function open() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true); setError(false)
    try {
      const blob = await aigcApi.image(jobId, index)
      if (!active.current) return
      if (blob.type !== 'image/png') throw new Error('Unexpected image format')
      ownedUrl.current = URL.createObjectURL(blob); setUrl(ownedUrl.current)
    } catch { if (active.current) setError(true) }
    finally { inFlight.current = false; if (active.current) setBusy(false) }
  }
  return <div className="min-w-0">
    {url ? <><img src={url} alt={`生成图片 ${index + 1}`} className="h-auto w-full rounded-lg" /><a className="text-sm text-brand underline" href={url} download={`generated-${index + 1}.png`}>下载图片 {index + 1}</a></> : <Button disabled={busy} onClick={() => void open()}>{busy ? '正在读取…' : `查看图片 ${index + 1}`}</Button>}
    {error && <p role="alert" className="text-sm text-warn-ink">图片暂时无法读取，请重试。</p>}
  </div>
}
