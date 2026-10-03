import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AgentPayouts } from './AgentPortal'
const api = vi.hoisted(() => ({ agentPayouts: vi.fn(), agentPayoutRequests: vi.fn(), requestPayout: vi.fn(), toast: vi.fn() }))
vi.mock('../../lib/portalApi', () => ({ portalApi: api }))
vi.mock('../../components/ui/overlays', async original => ({ ...await original<typeof import('../../components/ui/overlays')>(), useToast: () => api.toast }))
let root: Root, host: HTMLDivElement
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('matchMedia', () => ({ matches: true }))
  for (const fn of Object.values(api)) fn.mockReset()
  api.agentPayouts.mockResolvedValue({ name: 'Synthetic', payoutPending: 100.03, settledTotal: 20.02, deposit: 0.01, roi: 1.5, spendMtd: 50 })
  api.agentPayoutRequests.mockResolvedValue([{ id: 'held', amount: 40.01, status: 'approved' }, { id: 'pending', amount: 10.01, status: 'pending' }, { id: 'released', amount: 500, status: 'rejected' }])
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); await act(async () => root.render(<AgentPayouts />))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
const button = (name: string) => [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === name)!
async function input(value: string) { const field = document.querySelector<HTMLInputElement>('input[type=number]')!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })) }); return field }
it('shows exact request cents and remaining requestable balance after pending and approved reservations', async () => {
  expect(host.textContent).toContain('¥40.01')
  await act(async () => button('申请提现').click())
  expect(document.querySelector<HTMLInputElement>('input[type=number]')?.value).toBe('50.01')
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('¥50.01')
})
it('admits one same-tick request and keeps a new dialog when the old receipt arrives', async () => {
  let resolve!: (v: unknown) => void; api.requestPayout.mockReturnValue(new Promise(r => { resolve = r }))
  await act(async () => button('申请提现').click()); await input('10.02')
  const submit = button('提交申请'); await act(async () => { submit.click(); submit.click() })
  expect(api.requestPayout).toHaveBeenCalledOnce()
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label=关闭]')!.click())
  await act(async () => button('申请提现').click()); await input('12.34')
  await act(async () => resolve({ ok: true, detail: 'Synthetic receipt' }))
  expect(document.querySelector<HTMLInputElement>('input[type=number]')?.value).toBe('12.34')
})
it('does not present unknown reserved money as available when request history fails', async () => {
  api.agentPayoutRequests.mockRejectedValue(new Error('Synthetic unavailable'))
  await act(async () => root.render(<p>Reload</p>)); await act(async () => root.render(<AgentPayouts />))
  expect(button('申请提现')).toBeDisabled()
  expect(host.textContent).toContain('提现申请记录暂时无法读取')
})
