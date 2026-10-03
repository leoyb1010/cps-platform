import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { GeneratedMaterials, type GeneratedMaterial } from './GeneratedMaterials'
const calls=vi.hoisted(()=>({jobs:vi.fn(),image:vi.fn()}))
vi.mock('../../lib/aigcApi',()=>({aigcApi:calls}))
let root:Root,host:HTMLDivElement
const job={id:'persisted-job',asset_type:'social_pack',prompt:'Synthetic saved copy',status:'completed',credits_charged:4,output_json:{copy:{body:'既有客户续费提示'}}}
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);calls.jobs.mockReset().mockResolvedValue({jobs:[job]});calls.image.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()})
const render=async(recent:GeneratedMaterial[]=[])=>act(async()=>root.render(<GeneratedMaterials recent={recent}/>))
it('reload reads saved actual output, deduplicates a current job and renders content as text',async()=>{
 calls.jobs.mockResolvedValue({jobs:[{...job,output_json:{copy:{body:'<img src=x onerror=alert(1)> 既有客户续费提示'}}}]})
 await render([{jobId:job.id,assetLabel:'文案',prompt:job.prompt,credits:4}])
 expect(host.querySelectorAll('article')).toHaveLength(1);expect(host.textContent).toContain('消耗 4 积分');expect(host.textContent).toContain('既有客户续费提示');expect(host.querySelector('img')).toBeNull()
})
it('failed history read retains current output and Retry recovers without another generation',async()=>{
 calls.jobs.mockRejectedValueOnce(new Error('synthetic outage'))
 await render([{jobId:'fresh',assetLabel:'文案',prompt:'Fresh output',output:{copy:{body:'Fresh usable text'}}}])
 expect(host.querySelector('[role=alert]')).toBeTruthy();expect(host.textContent).toContain('Fresh usable text')
 await act(async()=>host.querySelector('button')!.click())
 expect(host.querySelector('[role=alert]')).toBeNull();expect(host.textContent).toContain('Fresh usable text');expect(host.textContent).toContain('既有客户续费提示')
})
it('retired history response cannot overwrite a newer authoritative read',async()=>{
 let resolve!:(v:unknown)=>void;calls.jobs.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
 await render();await render([{jobId:'new',assetLabel:'文案',prompt:'New',output:{copy:{body:'New copy'}}}]);await act(async()=>resolve({jobs:[{...job,id:'stale',prompt:'Stale'}]}))
 expect(host.textContent).toContain('New copy');expect(host.textContent).not.toContain('Stale')
})
it('shows actual prompt-only and storyboard outputs without claiming finished media',async()=>{
 calls.jobs.mockResolvedValue({jobs:[{...job,id:'image',asset_type:'image',output_json:{type:'image',imagePrompt:'Actual image prompt',images:[],pack:{platformCopy:{xhs:{body:'Generic copy must not stand in for image'}}}}},{...job,id:'video',asset_type:'video',output_json:{type:'video',storyboard:[{voice:'Actual renewal storyboard'}]}}]})
 await render();expect(host.textContent).toContain('Actual image prompt');expect(host.textContent).toContain('尚未生成可用图片');expect(host.textContent).toContain('Actual renewal storyboard');expect(host.textContent).toContain('未生成最终视频文件');expect(host.textContent).not.toContain('Generic copy must not stand in for image')
})
