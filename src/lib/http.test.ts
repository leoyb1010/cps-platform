import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(()=>{vi.unstubAllGlobals();vi.resetModules()})
describe('real API refresh boundaries',()=>{
  it('transient refresh outage does not log out a valid session',async()=>{
    const {api,setAccessToken,onAuthLost}=await import('./http')
    setAccessToken('original');const lost=vi.fn();onAuthLost(lost)
    const fetch=vi.fn().mockResolvedValueOnce(new Response('{}',{status:401})).mockResolvedValueOnce(new Response('{}',{status:503}))
    vi.stubGlobal('fetch',fetch)
    await expect(api('/projects')).rejects.toMatchObject({status:401})
    expect(lost).not.toHaveBeenCalled()
  })
  it('actual refresh rejection ends unchanged session',async()=>{
    const {api,setAccessToken,onAuthLost}=await import('./http')
    setAccessToken('original');const lost=vi.fn();onAuthLost(lost)
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('{}',{status:401})).mockResolvedValueOnce(new Response('{}',{status:401})))
    await expect(api('/projects')).rejects.toMatchObject({status:401})
    expect(lost).toHaveBeenCalledOnce()
  })
  it('late refresh cannot resurrect logout or replace a newer login',async()=>{
    const {api,setAccessToken,onAuthLost}=await import('./http')
    const lost=vi.fn();onAuthLost(lost);setAccessToken('old')
    let release!:()=>void
    const waiting=new Promise<void>(r=>{release=r})
    let entered!:()=>void;const started=new Promise<void>(r=>{entered=r})
    const fetch=vi.fn().mockResolvedValueOnce(new Response('{}',{status:401})).mockImplementationOnce(async()=>{entered();await waiting;return Response.json({access:'stale'})}).mockResolvedValue(Response.json({ok:true}))
    vi.stubGlobal('fetch',fetch)
    const request=api('/projects');await started;setAccessToken(null);setAccessToken('new-login');release()
    await expect(request).rejects.toMatchObject({status:401})
    await api('/next')
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer new-login')
    expect(lost).not.toHaveBeenCalled()
  })
})
