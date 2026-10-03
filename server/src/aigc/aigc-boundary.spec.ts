import { afterEach, describe, expect, it, vi } from 'vitest'
import { AigcController } from './aigc.controller'
import { SEED_USERS } from '../rbac/permissions'

afterEach(()=>vi.unstubAllGlobals())
function response(){return {statusCode:200,body:null as any,status(code:number){this.statusCode=code;return this},json(body:any){this.body=body;return this},setHeader(){return this},send(body:any){this.body=body;return this}}}
describe('AIGC tenant gateway',()=>{
  it('actual seed agent gateway headers decode to the historical Studio workspace',async()=>{
    const decoderPath=process.cwd()+'/../services/agent-studio/server/src/gatewayIdentity.js'
    const {decodeGatewayIdentity}=await import(decoderPath)
    const secret='synthetic-secret'
    const seen:any[]=[]
    vi.stubGlobal('fetch',vi.fn(async(_url:string,options:any)=>{
      const h=options.headers
      seen.push(decodeGatewayIdentity(secret,h['x-internal-workspace-id'],h['x-internal-user-id'],h['x-internal-sign']))
      return new Response('{"ok":true,"jobs":[]}',{status:200})
    }))
    const controller=new AigcController({get:(key:string)=>key==='AIGC_INTERNAL_SECRET'?secret:undefined} as any,{} as any)
    for(const account of ['agent','brand','admin']){
      const user=SEED_USERS.find(u=>u.account===account)!
      const res=response()
      await controller.factory({path:'/aigc/factory/jobs',originalUrl:'/aigc/factory/jobs',method:'GET',user} as any,res as any)
      expect(res.statusCode).toBe(200)
    }
    expect(seen).toEqual([{workspaceId:'agent-a-2041',userId:'u-007'},{workspaceId:'brand-youdao',userId:'u-006'},{workspaceId:'platform',userId:'u-001'}])
  })
  it('missing signing secret returns 503 before contacting shared default workspace',async()=>{
    const call=vi.fn();vi.stubGlobal('fetch',call)
    const controller=new AigcController({get:()=>undefined} as any,{} as any)
    const res=response()
    await controller.factory({path:'/aigc/factory/jobs',originalUrl:'/aigc/factory/jobs',method:'GET',user:{id:'user',scopeType:'brand',scopeId:'one'}} as any,res as any)
    expect(res.statusCode).toBe(503);expect(call).not.toHaveBeenCalled()
  })
  it('invalid tenant scope never falls back to platform',async()=>{
    const call=vi.fn();vi.stubGlobal('fetch',call)
    const controller=new AigcController({get:(key:string)=>key==='AIGC_INTERNAL_SECRET'?'synthetic-secret':undefined} as any,{} as any)
    await expect(controller.factory({path:'/aigc/factory/jobs',originalUrl:'/aigc/factory/jobs',method:'GET',user:{id:'user',scopeType:'brand',scopeId:null}} as any,response() as any)).rejects.toThrow('素材工作区身份不完整')
    expect(call).not.toHaveBeenCalled()
  })
})

it('a completed result survives Asset failure and an owned history read repairs registration once', async () => {
 const user={id:'owner',scopeType:'brand',scopeId:'synthetic-brand'}
 const job={id:'synthetic-job',status:'completed',asset_type:'social_pack',prompt:'Synthetic registered material'}
 let persisted=false
 const upsert=vi.fn(async()=>{if(upsert.mock.calls.length===1)throw new Error('Synthetic DB outage');persisted=true;return {id:'stable'}})
 const prisma={asset:{findFirst:vi.fn(async()=>persisted?{id:'stable'}:null),upsert}}
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith('/jobs')?{ok:true,jobs:[job]}:{ok:true,job,result:{},credits:{balance:996}}),{status:200,headers:{'content-type':'application/json'}})))
 const controller=new AigcController({get:(key:string)=>key==='AIGC_INTERNAL_SECRET'?'synthetic-secret':undefined} as any,prisma as any)
 const first=response();await controller.factory({path:'/aigc/factory/generate',originalUrl:'/aigc/factory/generate',method:'POST',headers:{'idempotency-key':'synthetic-operation'},body:{assetType:'social_pack',prompt:job.prompt},user} as any,first as any)
 expect(first.statusCode).toBe(200);expect(JSON.parse(first.body)).toMatchObject({ok:true,job:{id:job.id},assetRegistration:'pending',credits:{balance:996}})
 for(let i=0;i<2;i++){const res=response();await controller.factory({path:'/aigc/factory/jobs',originalUrl:'/aigc/factory/jobs',method:'GET',headers:{},user} as any,res as any);expect(JSON.parse(res.body).jobs[0].assetRegistration).toBe('registered')}
 expect(upsert).toHaveBeenCalledTimes(2);expect(upsert.mock.calls[0]).toEqual(upsert.mock.calls[1])
 const sent=(fetch as any).mock.calls[0][1];expect(JSON.parse(sent.body).operationKey).toBe('synthetic-operation')
})
