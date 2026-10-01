import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./store', () => ({ clearStoreOnLogout: vi.fn(), hydrateFromServer: vi.fn(async () => {}) }))
const user = (account: string) => ({ id: account, account, name: account, roleId: 'brand', scopeType: 'brand', scopeId: account, permissions: ['portal.brand.home'] })
const signedIn = (account: string) => Response.json({ access: `token-${account}`, user: user(account) })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_API_MODE', 'real'); localStorage.clear() })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('role handoff session lifecycle', () => {
  it('real mode never restores a cached identity before server validation', async () => {
    localStorage.setItem('cps-auth-v1', JSON.stringify({ ...user('cached-admin'), roleId: 'super', scopeType: 'platform' }))
    const auth = await import('./auth')
    expect(auth.getCurrentUser()).toBeNull()
  })
  it('logout immediately removes the old principal and cannot erase a newer login', async () => {
    const logoutResponse = deferred<Response>()
    const fetcher = vi.fn().mockResolvedValueOnce(signedIn('brand-a')).mockReturnValueOnce(logoutResponse.promise).mockResolvedValueOnce(signedIn('brand-b'))
    vi.stubGlobal('fetch', fetcher)
    const auth = await import('./auth')
    await auth.login('brand-a', 'fixture')
    const pending = auth.logout()
    expect(auth.getCurrentUser()).toBeNull()
    const nextLogin = auth.login('brand-b', 'fixture')
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    logoutResponse.resolve(Response.json({ ok: true }))
    await pending
    await nextLogin
    expect(auth.getCurrentUser()?.account).toBe('brand-b')
  })

  it('a stale bootstrap failure cannot clear a newer authenticated account', async () => {
    const bootstrap = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(bootstrap.promise).mockResolvedValueOnce(signedIn('brand-b')))
    const auth = await import('./auth')
    const pending = auth.bootstrapAuth()
    const nextLogin = auth.login('brand-b', 'fixture')
    bootstrap.resolve(new Response('{}', { status: 401 }))
    expect(await pending).toBe(false)
    await nextLogin
    expect(auth.getCurrentUser()?.account).toBe('brand-b')
  })

  it('latest overlapping login wins and cookie requests never overlap', async () => {
    const first = deferred<Response>()
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(signedIn('brand-b'))
    vi.stubGlobal('fetch', fetcher)
    const auth = await import('./auth')
    const old = auth.login('brand-a', 'fixture').catch((error) => error)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    const latest = auth.login('brand-b', 'fixture')
    await Promise.resolve()
    expect(fetcher).toHaveBeenCalledTimes(1)
    first.resolve(signedIn('brand-a'))
    expect(await old).toMatchObject({ status: 401 })
    await latest
    expect(auth.getCurrentUser()?.account).toBe('brand-b')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each(['login', 'refresh'])('logout is ordered after an in-flight %s cookie response', async (operation) => {
    const response = deferred<Response>()
    const fetcher = vi.fn().mockReturnValueOnce(response.promise).mockResolvedValueOnce(Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetcher)
    const auth = await import('./auth')
    const old = (operation === 'login' ? auth.login('brand-a', 'fixture') : auth.bootstrapAuth()).catch((error) => error)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    const ended = auth.logout()
    expect(auth.getCurrentUser()).toBeNull()
    await Promise.resolve()
    expect(fetcher).toHaveBeenCalledTimes(1)
    response.resolve(signedIn('brand-a'))
    await old
    await ended
    expect(fetcher.mock.calls[1][0]).toMatch(/\/auth\/logout$/)
    expect(auth.getCurrentUser()).toBeNull()
  })

  it('definitive refresh revocation rejects an already in-flight old-account response', async () => {
    const delayed = deferred<Response>()
    const fetcher = vi.fn().mockResolvedValueOnce(signedIn('brand-a')).mockReturnValueOnce(delayed.promise)
      .mockResolvedValueOnce(new Response('{}', { status: 401 })).mockResolvedValueOnce(new Response('{}', { status: 401 }))
    vi.stubGlobal('fetch', fetcher)
    const auth = await import('./auth')
    const { api } = await import('./http')
    await auth.login('brand-a', 'fixture')
    const oldRead = api('/portal/brand/orders')
    await expect(api('/portal/summary')).rejects.toMatchObject({ status: 401 })
    expect(auth.getCurrentUser()).toBeNull()
    delayed.resolve(Response.json({ private: 'brand-a' }))
    await expect(oldRead).rejects.toMatchObject({ status: 401 })
  })
})
