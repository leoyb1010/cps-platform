import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Aigc from './Aigc'
import { PortalAigc } from './portal/PortalAigc'

const calls = vi.hoisted(() => ({ real: true, config: vi.fn(), credits: vi.fn(), estimate: vi.fn(), generate: vi.fn(), jobs: vi.fn() }))
vi.mock('../lib/http', () => ({ get isRealApi() { return calls.real } }))
vi.mock('../lib/aigcApi', () => ({ aigcApi: calls }))
let root: Root
let host: HTMLDivElement
const config = { ok: true, assetTypes: [{ id: 'copy', label: '投放文案', modality: 'text', defaultPlatform: 'xhs' }] }
beforeEach(() => {
  calls.real = true
  calls.jobs.mockReset().mockResolvedValue({jobs:[]})
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  calls.config.mockReset().mockResolvedValue(config)
  calls.credits.mockReset().mockResolvedValue({ ok: true, credits: { availableCredits: 100 } })
  calls.estimate.mockReset().mockResolvedValue({ ok: true, creditsEstimated: 17 })
  calls.generate.mockReset().mockResolvedValue({ ok: true, job: { id: 'synthetic-job', status: 'completed', credits_charged: 37 }, credits: { availableCredits: 63 } })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
async function click(text: string, within: ParentNode = document.body) {
  const button = [...within.querySelectorAll('button')].find(b => b.textContent?.trim() === text)
  expect(button, text).toBeTruthy()
  await act(async () => { button!.click() })
}
async function input(value: string) {
  const area = document.body.querySelector('textarea')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, value)
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function mount(portal = false) {
  await act(async () => root.render(portal ? <PortalAigc /> : <Aigc />))
  if (!portal) await click('生成素材')
  await input('Synthetic description')
}

it('does not present the demo balance as a real balance on a failed credits read', async () => {
  calls.credits.mockRejectedValue(new Error('synthetic unavailable service'))
  await act(async () => root.render(<Aigc />))
  expect(document.body.textContent).not.toContain('84,200')
  expect(document.body.textContent).toContain('余额暂不可用')
})
it('shows the server-confirmed charge even when the user did not estimate first', async () => {
  await mount()
  await click('生成', document.body.querySelector('[role=dialog]')!)
  expect(calls.generate).toHaveBeenCalledOnce()
  expect(document.body.textContent).toContain('消耗 37 积分')
  expect(document.body.textContent).not.toContain('消耗 0 积分')
})
it.each([false, true])('ignores a delayed estimate after form edits (portal=%s)', async portal => {
  let resolve!: (value: unknown) => void
  calls.estimate.mockImplementation(() => new Promise(r => { resolve = r }))
  await mount(portal)
  await click('先估算积分 →')
  expect(calls.estimate).toHaveBeenCalledOnce()
  await input('Changed synthetic description')
  await act(async () => resolve({ ok: true, creditsEstimated: 17 }))
  expect(document.body.textContent).not.toContain('生成 · 17 积分')
})
it.each([false, true])('invalidates a settled estimate when the intent changes (portal=%s)', async portal => {
  await mount(portal)
  await click('先估算积分 →')
  expect(document.body.textContent).toContain('生成 · 17 积分')
  const intent = document.body.querySelectorAll('select')[1]
  await act(async () => { intent.value = 'convert'; intent.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(document.body.textContent).not.toContain('生成 · 17 积分')
})

it.each([false, true])('does not enable a generation before engine configuration arrives (portal=%s)', async portal => {
  calls.config.mockImplementation(() => new Promise(() => {}))
  await mount(portal)
  const generate = [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === '生成')!
  expect(generate.disabled).toBe(true)
  await act(async () => generate.click())
  expect(calls.generate).not.toHaveBeenCalled()
})

it.each([false, true])('keeps the newest of overlapping estimates (portal=%s)', async portal => {
  let resolveOld!: (value: unknown) => void
  calls.estimate.mockImplementationOnce(() => new Promise(r => { resolveOld = r })).mockResolvedValueOnce({ ok: true, creditsEstimated: 29 })
  await mount(portal)
  await click('先估算积分 →')
  await click('先估算积分 →')
  expect(document.body.textContent).toContain('生成 · 29 积分')
  await act(async () => resolveOld({ ok: true, creditsEstimated: 17 }))
  expect(document.body.textContent).toContain('生成 · 29 积分')
  expect(document.body.textContent).not.toContain('生成 · 17 积分')
})

it.each([0, undefined])('uses only a confirmed charge, preserving zero and unknown distinctly (%s)', async charge => {
  calls.generate.mockResolvedValue({ ok: true, job: { id: 'synthetic-charge', credits_charged: charge } })
  await mount()
  await click('先估算积分 →')
  await click('生成 · 17 积分')
  expect(document.body.textContent).toContain(charge === 0 ? '消耗 0 积分' : '消耗积分待确认')
  expect(document.body.textContent).not.toContain('消耗 17 积分')
})

it('preserves demo balance and local demo generation without contacting the engine', async () => {
  calls.real = false
  await mount()
  expect(document.body.textContent).toContain('84,200')
  await click('先估算积分 →')
  await click('生成 · 20 积分')
  expect(document.body.textContent).toContain('消耗 20 积分')
  expect(calls.config).not.toHaveBeenCalled()
  expect(calls.credits).not.toHaveBeenCalled()
  expect(calls.estimate).not.toHaveBeenCalled()
  expect(calls.generate).not.toHaveBeenCalled()
})

it.each([false, true])('a late initial balance cannot overwrite a completed generation balance (portal=%s)', async portal => {
  let resolve!: (value: unknown) => void
  calls.credits.mockImplementationOnce(() => new Promise(r => { resolve = r })).mockResolvedValue({ ok: true, credits: { availableCredits: 63 } })
  await mount(portal)
  await click('生成')
  expect(document.body.textContent).toContain('63')
  await act(async () => resolve({ ok: true, credits: { availableCredits: 100 } }))
  expect(document.body.textContent).toContain('63')
  expect(document.body.textContent).not.toContain(portal ? '100 积分' : '积分余额100')
})

it.each([false, true])('freezes the submitted form while generation is in flight (portal=%s)', async portal => {
  let resolve!: (value: unknown) => void
  calls.generate.mockImplementation(() => new Promise(r => { resolve = r }))
  await mount(portal)
  await click('生成')
  expect(document.body.querySelector('textarea')!.disabled).toBe(true)
  for (const select of document.body.querySelectorAll('select')) expect(select.disabled).toBe(true)
  await act(async () => resolve({ ok: true, job: { id: 'synthetic-busy', credits_charged: 37 }, credits: { availableCredits: 63 } }))
  if (portal) expect(document.body.querySelector('textarea')!.disabled).toBe(false)
})

it.each([false,true])('one pending generation owns repeated same-tick clicks (portal=%s)',async portal=>{
 let resolve!:(v:unknown)=>void;calls.generate.mockImplementation(()=>new Promise(r=>{resolve=r}));await mount(portal)
 const button=[...document.body.querySelectorAll('button')].find(b=>b.textContent?.trim()==='生成')!
 await act(async()=>{button.click();button.click()});expect(calls.generate).toHaveBeenCalledOnce()
 await act(async()=>resolve({ok:true,job:{id:'single-generation',credits_charged:4},credits:{availableCredits:96}}))
})
it('an accepted old generation keeps its result without closing a newer modal draft',async()=>{
 let resolve!:(v:unknown)=>void;calls.generate.mockImplementation(()=>new Promise(r=>{resolve=r}));await mount();await click('生成');await click('取消');await click('生成素材');await input('New draft must survive')
 await act(async()=>resolve({ok:true,job:{id:'old-accepted',credits_charged:4},credits:{availableCredits:96}}))
 expect(document.body.querySelector('textarea')?.value).toBe('New draft must survive');expect(document.body.textContent).toContain('old-accepted')
})

it('late accepted response cannot restore an older balance after a newer generation',async()=>{
 let releaseOld!:(v:unknown)=>void
 calls.generate.mockImplementationOnce(()=>new Promise(r=>{releaseOld=r})).mockResolvedValueOnce({ok:true,job:{id:'new-accepted',credits_charged:4},credits:{availableCredits:92}})
 await mount();await click('生成');await click('取消');await click('生成素材');await input('New independent request')
 calls.credits.mockResolvedValue({ok:true,credits:{availableCredits:92}})
 await click('生成');expect(document.body.textContent).toContain('92')
 await act(async()=>releaseOld({ok:true,job:{id:'old-accepted',credits_charged:4},credits:{availableCredits:96}}))
 expect(document.body.textContent).toContain('92');expect(document.body.textContent).not.toContain('积分余额96');expect(document.body.textContent).toContain('new-accepted');expect(document.body.textContent).toContain('old-accepted')
})
it('old failure leaves a newer draft and its controls usable',async()=>{
 let reject!:(v:unknown)=>void;calls.generate.mockImplementationOnce(()=>new Promise((_,r)=>{reject=r}));await mount();await click('生成');await click('取消');await click('生成素材');await input('Unrelated newer draft')
 await act(async()=>reject(new Error('synthetic old failure')));expect(document.body.querySelector('textarea')?.value).toBe('Unrelated newer draft');expect(document.body.querySelector('textarea')?.disabled).toBe(false)
})
it.each([false,true])('route unmount prevents late generation UI and balance reads (portal=%s)',async portal=>{
 let resolve!:(v:unknown)=>void;calls.generate.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));await mount(portal);await click('生成');const reads=calls.credits.mock.calls.length;await act(async()=>root.render(<p>Another route</p>));await act(async()=>resolve({ok:true,job:{id:'old-route-job',credits_charged:4},credits:{availableCredits:96}}));expect(calls.credits).toHaveBeenCalledTimes(reads);expect(host.textContent).toBe('Another route')
})
it('a late authoritative balance read cannot replace a newer post-generation read',async()=>{
 let release!:(v:unknown)=>void
 calls.credits.mockResolvedValueOnce({ok:true,credits:{availableCredits:100}}).mockImplementationOnce(()=>new Promise(r=>{release=r})).mockResolvedValue({ok:true,credits:{availableCredits:92}})
 await mount();await click('生成');await click('生成素材');await input('Second accepted generation');await click('生成');expect(host.textContent).toContain('92')
 await act(async()=>release({ok:true,credits:{availableCredits:96}}));expect(host.textContent).toContain('92');expect(host.textContent).not.toContain('积分余额96')
})
