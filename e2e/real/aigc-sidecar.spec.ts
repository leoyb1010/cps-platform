import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test, expect, type Page } from '@playwright/test'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../../server/node_modules/@prisma/client')
const db = new PrismaClient()
const output = '/tmp/cps-role-ui-audit/sidecar'
interface Job { id:string; workspace_id:string; intent:string; status:string; input_json:{intent:string}; credits_charged:number; output_json:{copy?:{body:string};assets?:{files:string[]}} }
interface Credits { credits:{balance:number;availableCredits:number;reservedCredits:number;recentLedger:Array<{job_id:string;amount:number}>};usage:Array<{job_id:string}> }
async function read<T>(page:Page,path:string):Promise<T>{return page.evaluate(async p=>{const modulePath='/src/lib/http.ts';const {http}=await import(/* @vite-ignore */modulePath);return http.get(p)},path)}
async function login(page:Page,account:string){await page.goto(account==='admin'?'/#/login':'/#/portal/login');await page.locator('input').first().fill(account);await page.locator('input[type=password]').fill('demo');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page).not.toHaveURL(/\/login$/)}
test.beforeEach(async({context})=>{mkdirSync(output,{recursive:true});await context.route('**/*',route=>{const u=new URL(route.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort()})})
test.afterAll(async()=>{await db.$disconnect()})
for(const account of ['admin','brand','agent'])test(`real ${account} → Nest → Studio text generation, ledger and CPS attribution`,async({page})=>{
 await login(page,account)
 const config=await read<{workspaceId:string;providers:Record<string,{configured:boolean}>}>(page,'/aigc/factory/config')
 const workspace=account==='admin'?'platform':account==='brand'?'brand-youdao':'agent-a-2041'
 expect(config.workspaceId).toBe(workspace);expect(Object.values(config.providers).every(p=>!p.configured)).toBe(true)
 const start=await read<Credits>(page,'/aigc/billing/credits');let balance=start.credits.balance
 const jobs:string[]=[]
 for(const intent of ['educate','convert','retain']){
  await page.goto(account==='admin'?'/#/aigc':`/#/portal/${account}/aigc`)
  if(account==='admin')await page.getByRole('button',{name:'生成素材',exact:true}).click()
  const form=account==='admin'?page.getByRole('dialog'):page.locator('main')
  await expect(form.locator('select').first().locator('option[value=social_pack]')).toHaveCount(1)
  await form.locator('select').nth(0).selectOption('social_pack');await form.locator('select').nth(1).selectOption(intent);await form.locator('select').nth(2).selectOption('cheap')
  await form.locator('textarea').fill(`Synthetic ${account} ${intent} notebook membership`)
  const estimateResponse=page.waitForResponse(r=>r.url().endsWith('/aigc/factory/estimate')&&r.request().method()==='POST')
  await form.getByRole('button',{name:'先估算积分 →',exact:true}).click();const er=await estimateResponse;expect(er.status()).toBe(200);const estimate=await er.json()
  const generatedResponse=page.waitForResponse(r=>r.url().endsWith('/aigc/factory/generate')&&r.request().method()==='POST')
  await form.getByRole('button',{name:`生成 · ${estimate.creditsEstimated} 积分`,exact:true}).click();const response=await generatedResponse;expect(response.status()).toBe(200)
  const result=await response.json();const job:Job=result.job;jobs.push(job.id)
  expect(job.status).toBe('completed');expect(job.workspace_id).toBe(workspace);expect(job.intent).toBe(intent);expect(job.input_json.intent).toBe(intent);expect(job.credits_charged).toBe(estimate.creditsEstimated)
  balance-=estimate.creditsEstimated
  const billing=await read<Credits>(page,'/aigc/billing/credits');expect(billing.credits).toMatchObject({balance,availableCredits:balance,reservedCredits:0})
  expect(billing.credits.recentLedger.filter(e=>e.job_id===job.id&&e.amount<0)).toHaveLength(1);expect(billing.usage.filter(e=>e.job_id===job.id)).toHaveLength(1)
  const reopened=await read<{job:Job}>(page,`/aigc/factory/jobs/${job.id}`);expect(reopened.job.output_json.copy?.body).toBe(result.result.copy.body)
  if(intent==='retain')expect(result.result.copy.body).toContain('既有客户')
  const rows=await db.asset.findMany({where:{jobId:job.id}})
  if(account==='admin')expect(rows).toHaveLength(0)
  else{expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject(account==='brand'?{brandId:'youdao',agentId:null}:{brandId:null,agentId:'A-2041'})}
  const article=page.locator('article').filter({hasText:job.id});await expect(article).toBeVisible();await article.getByText('查看素材',{exact:true}).click();await expect(article.getByTestId('generated-copy')).toContainText(intent==='retain'?'既有客户':'Synthetic')
  mkdirSync(output,{recursive:true});await page.screenshot({path:`${output}/${account}-${intent}.png`,fullPage:true})
 }
 await page.reload();await expect(page.locator('article').filter({hasText:jobs[2]})).toBeVisible();expect((await read<{jobs:Job[]}>(page,'/aigc/factory/jobs')).jobs.filter(j=>jobs.includes(j.id))).toHaveLength(3)
 writeFileSync(`${output}/${account}-readback.json`,JSON.stringify({workspace,jobs,balance,provider:'local-fallback',network:'loopback only'},null,2))
})
for(const account of ['admin','brand','agent'])test(`${account} retrieves and downloads actual PNG bytes from the owned result`,async({page})=>{
 test.setTimeout(120000);await login(page,account)
 const before=await read<Credits>(page,'/aigc/billing/credits')
 const result=await page.evaluate(async()=>{const p='/src/lib/http.ts';const {http}=await import(/* @vite-ignore */p);const input={assetType:'carousel',platform:'xhs',intent:'retain',prompt:'Synthetic notebook membership',modelPreset:'cheap'};const estimate=await http.post('/aigc/factory/estimate',input);const generated=await http.post('/aigc/factory/generate',input);return {estimate,generated}})
 expect(result.generated.ok).toBe(true);expect(result.generated.job.credits_charged).toBe(result.estimate.creditsEstimated)
 const files:string[]=result.generated.result.assets.files;expect(files).toHaveLength(6)
 for(const file of files){expect(file.startsWith(process.env.AGENT_STUDIO_EXPORTS_DIR+'/')).toBe(true);expect(statSync(file).size).toBeGreaterThan(1000);expect(readFileSync(file).subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a')}
 expect(await db.asset.count({where:{jobId:result.generated.job.id}})).toBe(account==='admin'?0:1)
 await page.goto(account==='admin'?'/#/aigc':`/#/portal/${account}/aigc`);const article=page.locator('article').filter({hasText:result.generated.job.id});await expect(article).toBeVisible();await article.getByText('查看素材',{exact:true}).click()
 const imageUrl=`**/aigc/factory/jobs/${result.generated.job.id}/assets/0`
 await page.route(imageUrl,route=>route.fulfill({status:503,contentType:'application/json',body:'{"message":"Synthetic image read outage"}'}))
 await article.getByRole('button',{name:'查看图片 1',exact:true}).click();await expect(article.getByRole('alert')).toContainText('图片暂时无法读取')
 await page.unroute(imageUrl)
 const bytesResponse=page.waitForResponse(r=>r.url().includes(`/jobs/${result.generated.job.id}/assets/0`));await article.getByRole('button',{name:'查看图片 1',exact:true}).click();const png=await bytesResponse
 expect(png.status()).toBe(200);expect(png.headers()['content-type']).toContain('image/png');expect(png.headers()['content-security-policy']).toContain("default-src 'none'");expect(Number(png.headers()['content-length'])).toBe(readFileSync(files[0]).length)
 await expect(article.getByRole('img',{name:'生成图片 1',exact:true})).toBeVisible();await expect.poll(()=>article.getByRole('img',{name:'生成图片 1',exact:true}).evaluate((n:HTMLImageElement)=>n.naturalWidth)).toBeGreaterThan(0)
 const image=article.getByRole('img',{name:'生成图片 1',exact:true})
 const browserBytes=await image.evaluate(async(n:HTMLImageElement)=>Array.from(new Uint8Array(await (await fetch(n.src)).arrayBuffer())))
 expect(Buffer.from(browserBytes).equals(readFileSync(files[0]))).toBe(true)
 writeFileSync(`${output}/${account}-png-transport.json`,JSON.stringify({job:result.generated.job.id,sourceBytes:readFileSync(files[0]).length,browserBlobBytes:browserBytes.length,cdpRetainedBytes:await png.body().then(bytes=>bytes.length).catch(()=>null),exactBrowserBytes:true},null,2))
 const downloadEvent=page.waitForEvent('download');await article.getByRole('link',{name:'下载图片 1',exact:true}).click();const downloaded=await downloadEvent;const downloadPath=await downloaded.path();expect(downloadPath).toBeTruthy();expect(readFileSync(downloadPath!).equals(readFileSync(files[0]))).toBe(true)
 await page.screenshot({path:`${output}/${account}-real-carousel-preview.png`,fullPage:true})
 
 const after=await read<Credits>(page,'/aigc/billing/credits');expect(after.credits.balance).toBe(before.credits.balance-result.estimate.creditsEstimated);expect(after.credits.reservedCredits).toBe(0)
 mkdirSync(output,{recursive:true});writeFileSync(`${output}/${account}-carousel-readback.json`,JSON.stringify({jobId:result.generated.job.id,files,charge:result.estimate.creditsEstimated},null,2))
})

for(const account of ['admin','brand'])test(`${account} repeated generate has one debit; interrupted old acknowledgment preserves a newer draft`,async({page})=>{
 await login(page,account);const before=await read<Credits>(page,'/aigc/billing/credits')
 await page.goto(account==='admin'?'/#/aigc':'/#/portal/brand/aigc');if(account==='admin')await page.getByRole('button',{name:'生成素材',exact:true}).click()
 const form=account==='admin'?page.getByRole('dialog'):page.locator('main');await expect(form.locator('select').first().locator('option[value=social_pack]')).toHaveCount(1);await form.locator('select').first().selectOption('social_pack');await form.locator('select').nth(2).selectOption('cheap');await form.locator('textarea').fill('Synthetic accepted request A')
 let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{release=r}),arrived=new Promise<void>(r=>{entered=r});let posts=0;let accepted:{job:Job}|undefined
 await page.route('**/aigc/factory/generate',async route=>{posts+=1;const response=await route.fetch();accepted=await response.json();entered();await gate;await route.fulfill({response})})
 try{
  await form.getByRole('button',{name:'生成',exact:true}).evaluate((button:HTMLButtonElement)=>{button.click();button.click()});await arrived;expect(posts).toBe(1)
  await expect(form.locator('textarea')).toBeDisabled()
  if(account==='admin'){await form.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'生成素材',exact:true}).click();await page.getByRole('dialog').locator('textarea').fill('New draft B must survive')}
  release();await expect(page.locator('article').filter({hasText:accepted!.job.id})).toBeVisible()
  if(account==='admin')await expect(page.getByRole('dialog').locator('textarea')).toHaveValue('New draft B must survive')
  const billing=await read<Credits>(page,'/aigc/billing/credits');expect(billing.credits.balance).toBe(before.credits.balance-accepted!.job.credits_charged);expect(billing.credits.recentLedger.filter(e=>e.job_id===accepted!.job.id&&e.amount<0)).toHaveLength(1);expect(posts).toBe(1)
  await page.screenshot({path:`${output}/${account}-accepted-request-draft-ownership.png`,fullPage:true})
 }finally{release()}
})
