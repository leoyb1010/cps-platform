import { getPrincipalId } from './http'
import type { GeneratePayload, GenerateResult } from './aigcApi'
export interface GenerationOperation { key: string; owner: string; payload: GeneratePayload; createdAt: string; jobId?: string; state: 'unknown' | 'pending' | 'registration' }
const memoryOnly = new Set<string>()
const memory = new Map<string, GenerationOperation[]>()
export const OPERATIONS_CHANGED = 'cps-generation-operations'
const storageKey = (owner: string) => `cps.generation-operations.${owner}`
function read(owner: string): GenerationOperation[] {
  if (memoryOnly.has(owner)) {
    const rows = memory.get(owner) ?? []
    try { sessionStorage.setItem(storageKey(owner), JSON.stringify(rows)); memoryOnly.delete(owner) } catch { /* Known stale storage must not win over the last in-memory write. */ }
    return rows
  }
  try {
    const raw = sessionStorage.getItem(storageKey(owner))
    if (raw === null) return memory.get(owner) ?? []
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((x): x is GenerationOperation => x && x.owner === owner && typeof x.key === 'string' && /^[\w.:-]{1,128}$/.test(x.key) && x.payload && typeof x.payload.prompt === 'string' && x.payload.prompt.length <= 20000 && typeof x.payload.assetType === 'string' && ['unknown', 'pending', 'registration'].includes(x.state))
  } catch { /* Memory still protects this mounted session when storage is unavailable. */ }
  return memory.get(owner) ?? []
}
function write(owner: string, rows: GenerationOperation[]) {
  memory.set(owner, rows)
  try { sessionStorage.setItem(storageKey(owner), JSON.stringify(rows)); memoryOnly.delete(owner) } catch { memoryOnly.add(owner) }
  if (getPrincipalId() === owner) window.dispatchEvent(new Event(OPERATIONS_CHANGED))
}
const fingerprint = (p: GeneratePayload) => JSON.stringify([p.assetType, p.platform, p.intent, p.prompt, p.modelPreset, p.style ?? ''])
export function pendingGenerations() { const owner = getPrincipalId(); return owner ? read(owner) : [] }
export function beginGeneration(payload: GeneratePayload): GenerationOperation {
  const owner = getPrincipalId()
  if (!owner) throw new Error('请重新登录后生成素材')
  const rows = read(owner)
  const old = rows.find(row => fingerprint(row.payload) === fingerprint(payload))
  if (old) { if (memoryOnly.has(owner)) throw new Error('浏览器无法保存重试标识，请释放存储空间后重试；本次没有开始新的生成。'); return old }
  if (rows.length >= 50) throw new Error('待确认请求较多，请先查询已有任务结果')
  const row: GenerationOperation = { key: crypto.randomUUID(), owner, payload: { ...payload }, createdAt: new Date().toISOString(), state: 'unknown' }
  write(owner, [...rows, row]);
  if (memoryOnly.has(owner)) throw new Error('浏览器无法保存重试标识，请释放存储空间后重试；本次没有开始新的生成。')
  return row
}
export function finishGeneration(row: GenerationOperation, result: GenerateResult) {
  const current = read(row.owner)
  const terminal = result.job?.status === 'failed' || (result.ok && result.job?.status === 'completed' && result.assetRegistration !== 'pending')
  write(row.owner, terminal ? current.filter(item => item.key !== row.key) : current.map(item => item.key === row.key ? { ...item, jobId: result.job?.id ?? item.jobId, state: result.assetRegistration === 'pending' ? 'registration' : result.pending ? 'pending' : item.state } : item))
}
export function rejectGeneration(row: GenerationOperation) { write(row.owner, read(row.owner).filter(item => item.key !== row.key)) }

export function ensureGenerationPersisted(operation: GenerationOperation) {
  if (operation.owner !== getPrincipalId()) throw new Error('登录账户已变更，请在当前账户重新操作')
  const rows = read(operation.owner)
  write(operation.owner, rows.some(row => row.key === operation.key) ? rows : [...rows, operation])
  if (memoryOnly.has(operation.owner)) throw new Error('浏览器无法保存重试标识，请释放存储空间后重试；本次没有开始新的生成。')
}
