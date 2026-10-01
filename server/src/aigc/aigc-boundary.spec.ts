import { afterEach, describe, expect, it, vi } from 'vitest'
import { AigcController } from './aigc.controller'

afterEach(()=>vi.unstubAllGlobals())
function response(){return {statusCode:200,body:null as any,status(code:number){this.statusCode=code;return this},json(body:any){this.body=body;return this},setHeader(){return this},send(body:any){this.body=body;return this}}}
describe('AIGC tenant gateway',()=>{
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
