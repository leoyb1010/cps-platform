import { useEffect, useRef, useState } from 'react'
import { aigcApi } from '../../lib/aigcApi'
import { ApiError } from '../../lib/http'
import { OPERATIONS_CHANGED, pendingGenerations, type GenerationOperation } from '../../lib/generationOperations'
import { Button } from '../ui/primitives'

export const GENERATION_RECOVERED = 'cps-generation-recovered'
export function GenerationRecovery({ onRecovered }: { onRecovered: () => void }) {
  const [rows, setRows] = useState(pendingGenerations)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [notFound, setNotFound] = useState<string[]>([])
  const active = useRef(true)
  const gate = useRef(false)
  useEffect(() => {
    active.current = true
    const changed = () => setRows(pendingGenerations())
    window.addEventListener(OPERATIONS_CHANGED, changed)
    return () => { active.current = false; window.removeEventListener(OPERATIONS_CHANGED, changed) }
  }, [])
  async function recover(row: GenerationOperation, retry: boolean) {
    if (gate.current) return
    gate.current = true; setBusy(row.key); setMessage('')
    try {
      const result = retry ? await aigcApi.generate(row.payload, row) : await aigcApi.operation(row)
      if (!active.current) return
      if (result.pending) setMessage('原任务仍在处理中，或完成状态尚未确认。请稍后查询；若长时间不变，请将任务标识交给管理员核对。不要重复开始同一任务。')
      else if (result.job?.status === 'failed') setMessage('原任务已失败，预留积分已释放。可以重新提交一次新的生成。')
      else if (result.job?.status === 'completed') {
        setMessage(result.assetRegistration === 'pending' ? '素材已生成，归属登记暂未完成。可查看结果，稍后再次查询以补登记。' : '已找回原任务结果，没有开始新的生成。')
        onRecovered(); window.dispatchEvent(new Event(GENERATION_RECOVERED))
      }
    } catch (error) {
      if (!active.current) return
      if (error instanceof ApiError && error.status === 404) { setNotFound(previous => [...previous, row.key]); setMessage('暂未找到原请求记录。可沿用原请求标识重试；不会换成新的操作标识。') }
      else setMessage(error instanceof Error ? error.message : '查询暂时失败，请重试')
    } finally { gate.current = false; if (active.current) setBusy('') }
  }
  if (!rows.length && !message) return null
  return <section className="mb-4 rounded-lg border border-warn-line bg-warn-soft/30 p-3" aria-label="待确认生成请求">
    {!!rows.length && <><h3 className="text-sm font-medium">待确认的生成请求</h3><p className="mt-1 text-xs text-ink-3">关闭页面不代表服务器取消。原请求标识保留在当前账户的此浏览器标签页中；先查询结果，再决定是否开始不同的新任务。</p></>}
    {message && <p role="status" className="my-2 text-sm">{message}</p>}
    {rows.map(row => <div key={row.key} className="mt-2 min-w-0 border-t border-line pt-2 text-xs">
      <p className="break-words">{row.payload.prompt}</p><p className="break-all text-ink-3">{row.jobId || row.key} · {row.state === 'registration' ? '待登记' : row.state === 'pending' ? '处理中 / 状态待确认' : '回执待确认'}</p>
      <Button disabled={!!busy} onClick={() => void recover(row, false)}>{busy === row.key ? '正在查询…' : '查询原任务'}</Button>
      {notFound.includes(row.key) && <Button disabled={!!busy} onClick={() => void recover(row, true)}>重试原请求</Button>}
    </div>)}
  </section>
}
