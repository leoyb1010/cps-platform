import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Supermarket from './Supermarket'
import type { MarketProduct, Quote } from '../../lib/marketApi'

const api = vi.hoisted(() => ({ products: vi.fn(), rules: vi.fn(), quote: vi.fn(), createBundle: vi.fn(), pay: vi.fn() }))
vi.mock('../../lib/marketApi', () => ({ marketApi: api }))
// Keep the production component and its controls; avoid animation-clock dependency in ownership assertions.
vi.mock('../../components/ui/primitives', async original => ({ ...await original<typeof import('../../components/ui/primitives')>(), useCountUpValue: (n: number) => n }))
const product = (id: string, firstPrice: number): MarketProduct => ({ id, name: `Synthetic ${id}`, category: '工具', description: 'Synthetic only', billingCycle: 'continuous', firstPrice, renewPrice: firstPrice + 10.01, bundleEligible: true, exclusiveGroup: '', tags: '[]', brandKey: '', brandName: 'Synthetic brand' })
const quote = (ids: string[], price: number): Quote => ({ ok: true, validIds: ids, listPrice: price, finalPrice: price, discountPct: 0, ruleId: '', conflicts: [] })
const defer = <T,>() => { let resolve!: (v: T) => void; let reject!: (v: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
let host: HTMLDivElement, root: Root
beforeEach(async () => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('matchMedia', () => ({ matches: true }))
  for (const fn of Object.values(api)) fn.mockReset()
  api.products.mockResolvedValue([product('A', 19.91), product('B', 0.01)]); api.rules.mockResolvedValue([])
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<Supermarket embedded />))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })
async function toggle(id: string) { const card = [...host.querySelectorAll<HTMLElement>('[role=button][aria-pressed]')].find(e => e.textContent?.includes(`Synthetic ${id}`))!; await act(async () => card.click()) }
async function tick() { await act(async () => vi.advanceTimersByTime(220)) }
function generate() { return [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => /生成我的订阅套餐|生成中/.test(b.textContent ?? ''))! }

it('keeps exact cents in item, renewal and authoritative quote displays', async () => {
  api.quote.mockResolvedValue(quote(['A'], 19.91)); await toggle('A'); await tick()
  expect(host.textContent).toContain('¥19.91'); expect(host.textContent).toContain('¥29.92'); expect(host.textContent).toContain('¥0.01')
})
it('invalidates the previous quote immediately when selection changes, before debounce sends the next request', async () => {
  const pending = defer<Quote>(); api.quote.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(quote(['A', 'B'], 19.92))
  await toggle('A'); await tick(); await toggle('B')
  await act(async () => pending.resolve(quote(['A'], 19.91)))
  expect(generate()).toBeDisabled()
  await tick(); expect(generate()).not.toBeDisabled()
})
it('prevents same-tick repeated bundle creation and keeps a changed selection when an old result arrives', async () => {
  api.quote.mockImplementation(async (ids: string[]) => quote(ids, ids.length === 1 ? 19.91 : 19.92))
  const pending = defer<Quote & { bundleId: string }>(); api.createBundle.mockReturnValue(pending.promise)
  await toggle('A'); await tick()
  const button = generate(); await act(async () => { button.click(); button.click() })
  expect(api.createBundle).toHaveBeenCalledOnce()
  await toggle('B'); await tick(); await act(async () => pending.resolve({ ...quote(['A'], 19.91), bundleId: 'old-synthetic-bundle' }))
  expect(host.textContent).not.toContain('old-synthetic-bundle')
  expect(generate()).not.toBeDisabled()
})
it('exposes an explicit quote error with a retry that preserves the selected products', async () => {
  api.quote.mockRejectedValueOnce(new Error('Synthetic unavailable quote')).mockResolvedValueOnce(quote(['A'], 19.91))
  await toggle('A'); await tick()
  expect(host.textContent).toContain('报价暂时无法读取')
  const retry = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === '重新计算')!
  expect(retry).toBeTruthy(); await act(async () => retry.click()); await tick()
  expect(api.quote).toHaveBeenLastCalledWith(['A']); expect(generate()).not.toBeDisabled()
})

it('keeps a newer selection untouched by a late simulated payment and admits one same-tick payment', async () => {
  api.quote.mockImplementation(async (ids: string[]) => quote(ids, ids.includes('B') ? 0.01 : 19.91))
  api.createBundle.mockResolvedValue({ ...quote(['A'], 19.91), bundleId: 'synthetic-pay-A' })
  const pending = defer<{ ok: boolean; paid: boolean }>(); api.pay.mockReturnValue(pending.promise)
  await toggle('A'); await tick(); await act(async () => generate().click())
  const agreed = host.querySelector<HTMLInputElement>('input[type=checkbox]')!
  await act(async () => agreed.click())
  const pay = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('用支付宝支付'))!
  await act(async () => { pay.click(); pay.click() })
  expect(api.pay).toHaveBeenCalledOnce()
  const reset = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('重新搭配'))!
  await act(async () => reset.click()); await toggle('B'); await tick()
  await act(async () => pending.resolve({ ok: true, paid: true }))
  expect(host.textContent).not.toContain('支付成功'); expect(generate()).not.toBeDisabled()
  api.createBundle.mockResolvedValue({ ...quote(['B'], 0.01), bundleId: 'synthetic-pay-B' })
  await act(async () => generate().click())
  expect(host.textContent).toContain('synthetic-pay-B'); expect(host.textContent).not.toContain('支付成功')
})
