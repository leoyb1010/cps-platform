import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setAccessToken } from '../../lib/http'
import { BrandProducts } from './BrandProducts'

const calls = vi.hoisted(() => ({ brandProducts: vi.fn(), addBrandProduct: vi.fn(), submitProduct: vi.fn(), toast: vi.fn() }))
vi.mock('../../lib/portalApi', () => ({ portalApi: calls }))
vi.mock('../../components/ui/overlays', async original => ({ ...await original<typeof import('../../components/ui/overlays')>(), useToast: () => calls.toast }))
let root: Root
let host: HTMLDivElement
beforeEach(async () => {
  sessionStorage.clear(); setAccessToken('synthetic-access', `synthetic-product-${crypto.randomUUID()}`)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  calls.brandProducts.mockReset().mockResolvedValue([])
  calls.addBrandProduct.mockReset()
  calls.toast.mockReset()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<BrandProducts />))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
function button(text: string) {
  const found = [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === text)
  expect(found, text).toBeTruthy()
  return found!
}
async function click(text: string) { await act(async () => button(text).click()) }
async function name(value: string) {
  const input = document.body.querySelector<HTMLInputElement>('input[placeholder="如：会员 VIP 连续包月"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function open(value = 'Synthetic draft') { await click('上架商品'); await name(value) }

it('creates only one draft for repeated same-tick submissions while the request is pending', async () => {
  let resolve!: (v: unknown) => void
  calls.addBrandProduct.mockImplementation(() => new Promise(r => { resolve = r }))
  await open()
  const create = button('创建草稿')
  await act(async () => { create.click(); create.click() })
  expect(calls.addBrandProduct).toHaveBeenCalledOnce()
  expect(create).toBeDisabled()
  const fields = document.querySelector('fieldset')!
  expect(fields.disabled).toBe(true)
  expect([...fields.querySelectorAll('input, select, textarea, button')].every(control => control.matches(':disabled'))).toBe(true)
  await act(async () => resolve({ ok: true, id: 'synthetic-once' }))
  expect(document.body.querySelector('[role=dialog]')).toBeNull()
})

it('retains the newer draft when an earlier closed dialog finishes saving', async () => {
  let resolve!: (v: unknown) => void
  calls.addBrandProduct.mockImplementation(() => new Promise(r => { resolve = r }))
  await open('Earlier synthetic draft'); await click('创建草稿'); await click('取消')
  await open('Newer draft must remain')
  await act(async () => resolve({ ok: true, id: 'synthetic-earlier' }))
  expect(document.body.querySelector<HTMLInputElement>('input[placeholder="如：会员 VIP 连续包月"]')?.value).toBe('Newer draft must remain')
  expect(calls.brandProducts).toHaveBeenCalledTimes(2)
  expect(calls.toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'good', text: expect.stringContaining('Earlier synthetic draft') }))
})

it('retains form values after failure and permits a deliberate retry', async () => {
  calls.addBrandProduct.mockRejectedValueOnce(new Error('Synthetic unavailable API')).mockResolvedValueOnce({ ok: true, id: 'synthetic-retry' })
  await open('Retained retry draft'); await click('创建草稿')
  expect(document.body.querySelector<HTMLInputElement>('input[placeholder="如：会员 VIP 连续包月"]')?.value).toBe('Retained retry draft')
  expect(button('创建草稿')).not.toBeDisabled()
  await click('创建草稿')
  expect(calls.addBrandProduct).toHaveBeenCalledTimes(2)
  expect(document.body.querySelector('[role=dialog]')).toBeNull()
})

it('rejects empty product names without sending a draft', async () => {
  await open('  '); await click('创建草稿')
  expect(calls.addBrandProduct).not.toHaveBeenCalled()
})


it('an older failed request cannot announce an error on a newer draft', async () => {
  let reject!: (v: unknown) => void
  calls.addBrandProduct.mockImplementation(() => new Promise((_r, r) => { reject = r }))
  await open('Earlier fails'); await click('创建草稿'); await click('取消'); await open('Newer stays')
  await act(async () => reject(new Error('Synthetic old failure')))
  expect(calls.toast).not.toHaveBeenCalled()
  expect(document.body.querySelector<HTMLInputElement>('input[placeholder="如：会员 VIP 连续包月"]')?.value).toBe('Newer stays')
})

it('separate deliberate drafts each complete once without cross-closing', async () => {
  const releases: Array<(v: unknown) => void> = []
  calls.addBrandProduct.mockImplementation(() => new Promise(r => { releases.push(r) }))
  await open('First accepted draft'); await click('创建草稿'); await click('取消')
  await open('Second accepted draft'); await click('创建草稿')
  expect(calls.addBrandProduct).toHaveBeenCalledTimes(2)
  await act(async () => releases[0]({ ok: true, id: 'first' }))
  expect(document.body.querySelector('[role=dialog]')).not.toBeNull()
  expect(button('创建草稿')).toBeDisabled()
  await act(async () => releases[1]({ ok: true, id: 'second' }))
  expect(document.body.querySelector('[role=dialog]')).toBeNull()
  expect(calls.brandProducts).toHaveBeenCalledTimes(3)
  expect(calls.toast).toHaveBeenCalledTimes(2)
})

it('keeps a creation operation over an unknown response retry but rotates it for an edited intent',async()=>{
 calls.addBrandProduct.mockRejectedValue(new TypeError('Synthetic acknowledgment lost'))
 await open('First logical draft');await click('创建草稿');await click('创建草稿')
 expect(calls.addBrandProduct).toHaveBeenCalledTimes(2)
 const first=calls.addBrandProduct.mock.calls[0][1];expect(typeof first).toBe('string');expect(first.length).toBeGreaterThan(12);expect(calls.addBrandProduct.mock.calls[1][1]).toBe(first)
 await name('Edited logical draft');await click('创建草稿');expect(calls.addBrandProduct.mock.calls[2][1]).not.toBe(first)
})
it('unknown create survives route reload with the same payload/key and restored fields',async()=>{
 calls.addBrandProduct.mockRejectedValue(new Error('Synthetic lost response'));await open('Restore original product');await click('创建草稿');const key=calls.addBrandProduct.mock.calls[0][1];await act(async()=>root.render(<p>Other route</p>));await act(async()=>root.render(<BrandProducts/>));expect(host.textContent).toContain('待确认的商品创建');await click('上架商品');expect(document.querySelector<HTMLInputElement>('input[placeholder="如：会员 VIP 连续包月"]')?.value).toBe('Restore original product');await click('创建草稿');expect(calls.addBrandProduct.mock.calls[1][1]).toBe(key)
})
it('closed unknown request stays recoverable while a distinct new draft is edited',async()=>{
 calls.addBrandProduct.mockRejectedValueOnce(new Error('Synthetic lost response')).mockResolvedValue({ok:true,id:'original'});await open('Original A');await click('创建草稿');const key=calls.addBrandProduct.mock.calls[0][1];await click('取消');await open('Unrelated B');await click('找回原商品');expect(calls.addBrandProduct.mock.calls[1][1]).toBe(key);expect(document.querySelector<HTMLInputElement>('input[placeholder="如：会员 VIP 连续包月"]')?.value).toBe('Unrelated B');expect(host.textContent).not.toContain('待确认的商品创建')
})

it('renders exact first and renewal prices for the product owner, without compact rounding', async () => {
  calls.brandProducts.mockResolvedValue([{ id: 'synthetic-cents', name: 'Synthetic cents product', category: '工具', billingCycle: 'continuous', firstPrice: 19.91, renewPrice: 29.92, defaultSharePct: 30, status: 'draft', reviewNote: '' }])
  await act(async () => root.render(<p>Reload</p>))
  await act(async () => root.render(<BrandProducts />))
  const row = [...host.querySelectorAll('tr')].find(item => item.textContent?.includes('Synthetic cents product'))!
  expect(row.textContent).toContain('¥19.91')
  expect(row.textContent).toContain('¥29.92')
})
