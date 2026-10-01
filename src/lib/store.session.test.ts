import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_API_MODE', 'real'); localStorage.clear() })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('platform hydration principal boundary', () => {
  it('real mode never loads another account’s unbound persistent business cache', async () => {
    localStorage.setItem('cps-store-v2-real', JSON.stringify({ brands: [{ id: 'cached-a', name: 'Old account' }], agents: [], merchants: [], orders: [], settlements: [], complaints: [] }))
    const store = await import('./store')
    expect(store.getStore().brands).toEqual([])
  })
  it('a partly completed hydration cannot restore its old fulfilled rows after logout', async () => {
    let release!: (response: Response) => void
    const delayed = new Promise<Response>((resolve) => { release = resolve })
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.endsWith('/agents')) return delayed
      if (url.endsWith('/brands')) return Promise.resolve(Response.json([{ id: 'private-a', name: 'A private brand' }]))
      if (url.includes('/orders')) return Promise.resolve(Response.json({ items: [], nextCursor: null }))
      if (url.endsWith('/config')) return Promise.resolve(Response.json({}))
      return Promise.resolve(Response.json([]))
    }))
    const { setAccessToken } = await import('./http')
    const store = await import('./store')
    setAccessToken('account-a', 'a')
    const old = store.hydrateFromServer()
    await new Promise((resolve) => setTimeout(resolve, 0))
    setAccessToken(null)
    store.clearStoreOnLogout()
    release(Response.json([]))
    await old
    expect(store.getStore().brands.some((brand) => brand.id === 'private-a')).toBe(false)
    expect(localStorage.getItem('cps-store-v2-real') ?? '').not.toContain('private-a')
  })
  it('partly completed old hydration cannot restore old rows or block the new account', async () => {
    let release!: (response: Response) => void
    const delayed = new Promise<Response>((resolve) => { release = resolve })
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>
      if (headers.Authorization === 'Bearer account-a') {
        if (url.endsWith('/agents')) return delayed
        if (url.endsWith('/brands')) return Promise.resolve(Response.json([{ id: 'private-a', name: 'A private brand' }]))
      }
      if (url.includes('/orders')) return Promise.resolve(Response.json({ items: [], nextCursor: null }))
      if (url.endsWith('/config')) return Promise.resolve(Response.json({}))
      if (url.endsWith('/brands')) return Promise.resolve(Response.json([{ id: 'private-b', name: 'B private brand' }]))
      return Promise.resolve(Response.json([]))
    }))
    const { setAccessToken } = await import('./http')
    const store = await import('./store')
    setAccessToken('account-a', 'a')
    const old = store.hydrateFromServer()
    await new Promise((resolve) => setTimeout(resolve, 0))
    setAccessToken('account-b', 'b')
    store.clearStoreOnLogout()
    const next = store.hydrateFromServer()
    expect(next).not.toBe(old)
    await next
    expect(store.getStore().brands.map((brand) => brand.id)).toEqual(['private-b'])
    release(Response.json([]))
    await old
    expect(store.getStore().brands.map((brand) => brand.id)).toEqual(['private-b'])
  })
})
