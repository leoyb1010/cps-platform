import { mkdirSync } from 'node:fs'
import { test, expect, type Page, type Browser } from '@playwright/test'
const out='/tmp/cps-role-ui-audit/business'
async function actor(browser:Browser, account?:string){
 const context=await browser.newContext({baseURL:'http://localhost:5273',viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block'})
 await context.route('**/*',route=>{const u=new URL(route.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort()})
 const page=await context.newPage()
 if(account){await page.goto(['brand','agent'].includes(account)?'/#/portal/login':'/#/login');await page.locator('input').first().fill(account);await page.locator('input[type=password]').fill('demo');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page).not.toHaveURL(/\/login$/)}
 return {context,page}
}
async function read<T>(page:Page,path:string):Promise<T>{return page.evaluate(async p=>{const modulePath='/src/lib/http.ts';const {http}=await import(/* @vite-ignore */modulePath);return http.get(p)},path)}
async function capture(page:Page,name:string){await page.waitForLoadState('networkidle');mkdirSync(out,{recursive:true});await page.screenshot({path:`${out}/${name}.png`,fullPage:true})}

test('brand draft → review submission → platform approval → public listing persisted journey',async({browser})=>{
 const brand=await actor(browser,'brand'),admin=await actor(browser,'admin'),visitor=await actor(browser)
 try{
  const name=`Synthetic end-to-end product ${Date.now()}`
  await brand.page.goto('/#/portal/brand/products')
  await brand.page.getByRole('button',{name:'上架商品',exact:true}).click()
  await brand.page.getByPlaceholder('如：会员 VIP 连续包月').fill(name)
  await brand.page.getByRole('button',{name:'创建草稿',exact:true}).click()
  await expect(brand.page.getByRole('dialog')).toHaveCount(0)
  const row=brand.page.getByRole('row').filter({has:brand.page.getByText(name,{exact:true})})
  await row.getByRole('button',{name:'提交审核',exact:true}).click()
  await expect.poll(async()=>(await read<Array<{name:string,status:string}>>(brand.page,'/portal/brand/products')).find(p=>p.name===name)?.status).toBe('pending')
  await capture(brand.page,'brand-product-submitted')
  await admin.page.goto('/#/products')
  const approval=admin.page.getByRole('row').filter({has:admin.page.getByText(name,{exact:true})})
  await approval.getByRole('button',{name:'通过',exact:true}).click()
  await expect.poll(async()=>(await read<Array<{name:string,status:string}>>(admin.page,'/products')).find(p=>p.name===name)?.status).toBe('live')
  await capture(admin.page,'platform-product-approved')
  await brand.page.reload();await expect(brand.page.getByRole('row').filter({has:brand.page.getByText(name,{exact:true})})).toContainText('已上架')
  await visitor.page.goto('/#/market')
  const listed=visitor.page.getByRole('button').filter({has:visitor.page.getByText(name,{exact:true})})
  await expect(listed).toHaveCount(1);await expect(listed).toBeVisible()
  expect((await read<Array<{name:string}>>(visitor.page,'/market/products')).filter(p=>p.name===name)).toHaveLength(1)
  await capture(visitor.page,'public-approved-product')
 }finally{await Promise.all([brand.context.close(),admin.context.close(),visitor.context.close()])}
})

test('agent obtains one real tracking record, reloads plans, validates and persists a payout request',async({browser})=>{
 const {page,context}=await actor(browser,'agent')
 try{
  const before=await read<unknown[]>(page,'/portal/agent/claims')
  await page.goto('/#/portal/agent/market');await page.getByPlaceholder('搜索品牌 / 品类').fill('网易有道')
  await page.getByRole('button',{name:'领取投放',exact:true}).click()
  await expect.poll(async()=>(await read<unknown[]>(page,'/portal/agent/claims')).length).toBe(before.length+1)
  await page.goto('/#/portal/agent/plans');await expect(page.getByText('我领取的投放',{exact:true})).toBeVisible();await capture(page,'agent-claim-readback')
  const prior=await read<unknown[]>(page,'/portal/agent/payout-requests')
  await page.goto('/#/portal/agent/payouts');await page.getByRole('button',{name:'申请提现',exact:true}).click()
  const dialog=page.getByRole('dialog')
  await dialog.getByRole('spinbutton').fill('0');await dialog.getByRole('button',{name:'提交申请',exact:true}).click()
  await expect(dialog.getByText('提现金额需大于 0',{exact:true})).toBeVisible()
  await dialog.getByRole('spinbutton').fill('100');await dialog.getByRole('button',{name:'提交申请',exact:true}).click();await expect(dialog).toHaveCount(0)
  await expect.poll(async()=>(await read<unknown[]>(page,'/portal/agent/payout-requests')).length).toBe(prior.length+1)
  const after=await read<Array<{amount:number,status:string}>>(page,'/portal/agent/payout-requests');expect(after.some(r=>r.amount===100&&r.status==='pending')).toBe(true)
  await page.reload();await expect(page.getByText('提现申请',{exact:true})).toBeVisible();await capture(page,'agent-payout-request-pending')
 }finally{await context.close()}
})
