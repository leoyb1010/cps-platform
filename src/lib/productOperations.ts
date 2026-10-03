import { getPrincipalId, isRealApi } from './http'
export interface ProductPayload { name: string; category?: string; description?: string; billingCycle?: string; firstPrice: number; renewPrice: number; defaultSharePct?: number; bundleEligible?: boolean; exclusiveGroup?: string; tags?: string[] }
export interface ProductOperation { owner: string; key: string; body: ProductPayload }
export const PRODUCT_OPERATIONS_CHANGED = 'cps-product-operations'
const memoryOnly = new Set<string>()
const memory = new Map<string, ProductOperation[]>()
const ownerId = () => getPrincipalId() ?? (isRealApi ? null : 'demo')
const storageKey = (owner: string) => `cps.product-operations.${owner}`
function read(owner: string): ProductOperation[] {
  if (memoryOnly.has(owner)) {
    const rows = memory.get(owner) ?? []
    try { sessionStorage.setItem(storageKey(owner), JSON.stringify(rows)); memoryOnly.delete(owner) } catch { /* Known stale storage must not win over the last in-memory write. */ }
    return rows
  }
  try {
    const value = sessionStorage.getItem(storageKey(owner))
    if (value === null) return memory.get(owner) ?? []
    const rows = JSON.parse(value)
    if (Array.isArray(rows)) return rows.filter(row => row?.owner === owner && typeof row.key === 'string' && /^[\w.:-]{1,128}$/.test(row.key) && typeof row.body?.name === 'string' && typeof row.body.firstPrice === 'number' && typeof row.body.renewPrice === 'number')
  } catch { /* In-memory recovery remains usable. */ }
  return memory.get(owner) ?? []
}
function write(owner: string, rows: ProductOperation[]) {
  memory.set(owner, rows)
  try { sessionStorage.setItem(storageKey(owner), JSON.stringify(rows)); memoryOnly.delete(owner) } catch { memoryOnly.add(owner) }
  if (ownerId() === owner) window.dispatchEvent(new Event(PRODUCT_OPERATIONS_CHANGED))
}
export function pendingProducts() { const owner = ownerId(); return owner ? read(owner) : [] }
export function beginProduct(body: ProductPayload): ProductOperation {
  const owner = ownerId()
  if (!owner) throw new Error('请重新登录后创建商品')
  const rows = read(owner)
  const old = rows.find(row => JSON.stringify(row.body) === JSON.stringify(body))
  if (old) { if (memoryOnly.has(owner)) throw new Error('浏览器无法保存重试标识，请释放存储空间后重试；本次没有开始新的创建。'); return old }
  if (rows.length >= 50) throw new Error('待确认请求较多，请先找回已有商品')
  const operation = { owner, key: crypto.randomUUID(), body }
  write(owner, [...rows, operation]);
  if (memoryOnly.has(owner)) throw new Error('浏览器无法保存重试标识，请释放存储空间后重试；本次没有开始新的创建。')
  return operation
}
export function finishProduct(operation: ProductOperation) { write(operation.owner, read(operation.owner).filter(row => row.key !== operation.key)) }

export function ensureProductPersisted(operation: ProductOperation) {
  if (operation.owner !== ownerId()) throw new Error('登录账户已变更，请在当前账户重新操作')
  const rows = read(operation.owner)
  write(operation.owner, rows.some(row => row.key === operation.key) ? rows : [...rows, operation])
  if (memoryOnly.has(operation.owner)) throw new Error('浏览器无法保存重试标识，请释放存储空间后重试；本次没有开始新的创建。')
}
