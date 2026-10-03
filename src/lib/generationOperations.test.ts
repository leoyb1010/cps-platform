import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setAccessToken, ApiError } from './http'
import { beginGeneration, pendingGenerations, finishGeneration } from './generationOperations'
import { aigcApi, type GeneratePayload } from './aigcApi'
const payload: GeneratePayload = { assetType:'social_pack',platform:'xhs',intent:'retain',prompt:'Synthetic membership renewal',modelPreset:'cheap' }
beforeEach(()=>{sessionStorage.clear();setAccessToken('synthetic-access',`synthetic-${crypto.randomUUID()}`)})
afterEach(()=>vi.unstubAllGlobals())
it('an unknown response and remounted caller reuse the persisted key; changed content keeps both recoverable',async()=>{
 const fetch=vi.fn().mockRejectedValue(new TypeError('Response lost'));vi.stubGlobal('fetch',fetch)
 await expect(aigcApi.generate(payload)).rejects.toBeInstanceOf(ApiError)
 const original=pendingGenerations()[0];expect(original.key).toBeTruthy();expect(JSON.parse(sessionStorage.getItem(`cps.generation-operations.${original.owner}`)!)[0].key).toBe(original.key)
 await expect(aigcApi.generate({...payload})).rejects.toBeInstanceOf(ApiError)
 expect(new Headers(fetch.mock.calls[0][1].headers).get('Idempotency-Key')).toBe(new Headers(fetch.mock.calls[1][1].headers).get('Idempotency-Key'))
 beginGeneration({...payload,prompt:'New legitimate intent'});expect(pendingGenerations()).toHaveLength(2)
 finishGeneration(original,{ok:true,job:{id:'a',status:'completed'}});expect(pendingGenerations()).toHaveLength(1);expect(pendingGenerations()[0].payload.prompt).toBe('New legitimate intent')
})
it('202 keeps the exact operation pending and does not masquerade as a completed job',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({ok:true,pending:true,job:{id:'running',status:'running'}},{status:202})))
 const result=await aigcApi.generate(payload);expect(result.pending).toBe(true);expect(pendingGenerations()[0]).toMatchObject({state:'pending',jobId:'running'})
})
it('known failed terminal permits a new intent while an unclassified 500 retains its original identity',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(Response.json({ok:false,job:{id:'failed',status:'failed',credits_charged:0},message:'Synthetic failure'},{status:500})).mockResolvedValue(Response.json({message:'Unknown gateway error'},{status:500}));vi.stubGlobal('fetch',fetch)
 const first=beginGeneration(payload);await expect(aigcApi.generate(payload)).rejects.toMatchObject({status:500});expect(pendingGenerations()).toHaveLength(0)
 const next=beginGeneration(payload);expect(next.key).not.toBe(first.key);await expect(aigcApi.generate(payload)).rejects.toMatchObject({status:500});expect(pendingGenerations()[0].key).toBe(next.key)
})
it('registration failure stays recoverable and exact operation read clears it after repair',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(Response.json({ok:true,assetRegistration:'pending',job:{id:'done',status:'completed'}})).mockResolvedValue(Response.json({ok:true,assetRegistration:'registered',job:{id:'done',status:'completed'}}));vi.stubGlobal('fetch',fetch)
 await aigcApi.generate(payload);const pending=pendingGenerations()[0];expect(pending.state).toBe('registration');await aigcApi.operation(pending);expect(pendingGenerations()).toHaveLength(0);expect(fetch.mock.calls[1][0]).toContain(`/operations/${pending.key}`)
})
it('another principal neither sees nor replays the first account operation',async()=>{
 const first=beginGeneration(payload);setAccessToken('other-synthetic-access','other-synthetic-owner');expect(pendingGenerations()).toHaveLength(0);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(aigcApi.operation(first)).rejects.toThrow('登录账户已变更');expect(fetch).not.toHaveBeenCalled()
})
it('storage quota failure cannot revive stale keys or admit an unpersisted operation, then recovers',async()=>{
 const seed=beginGeneration({...payload,prompt:'Seed'});finishGeneration(seed,{ok:true,job:{id:'seed',status:'completed'}})
 const set=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Synthetic quota','QuotaExceededError')})
 expect(()=>beginGeneration(payload)).toThrow('浏览器无法保存重试标识');const held=pendingGenerations()[0];expect(held).toBeTruthy();expect(()=>beginGeneration(payload)).toThrow('浏览器无法保存重试标识');expect(pendingGenerations()[0].key).toBe(held.key)
 finishGeneration(held,{ok:true,job:{id:'known-result',status:'completed'}});expect(pendingGenerations()).toHaveLength(0)
 set.mockRestore();expect(pendingGenerations()).toHaveLength(0);expect(JSON.parse(sessionStorage.getItem(`cps.generation-operations.${held.owner}`)!)).toEqual([])
 const next=beginGeneration(payload);expect(next.key).not.toBe(held.key);expect(pendingGenerations()).toHaveLength(1)
})
it('the explicit original-request recovery path also refuses POST until identity is durable',async()=>{
 const original=beginGeneration(payload)
 const set=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Synthetic quota','QuotaExceededError')})
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
 await expect(aigcApi.generate(payload,original)).rejects.toThrow('浏览器无法保存重试标识');expect(fetch).not.toHaveBeenCalled()
 set.mockRestore();fetch.mockResolvedValue(Response.json({ok:true,job:{id:'restored',status:'completed'}}));await aigcApi.generate(payload,original);expect(fetch).toHaveBeenCalledOnce();expect(new Headers(fetch.mock.calls[0][1].headers).get('Idempotency-Key')).toBe(original.key)
})
