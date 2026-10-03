import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../server/node_modules/@prisma/client');
const Database = require('../services/agent-studio/node_modules/better-sqlite3');
const db = new PrismaClient();
const base = process.env.AUDIT_API_BASE || 'http://127.0.0.1:3001';
const out = process.env.AUDIT_R2_OUTPUT || '/tmp/cps-role-ui-audit/round2-integration';
const fixture = new Database(process.env.DATABASE_URL.replace(/^file:/, ''));
await mkdir(out, { recursive: true });
async function api(path, access, body, key) {
 const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type':'application/json', ...(access ? {authorization:`Bearer ${access}`} : {}), ...(key ? {'idempotency-key':key} : {}) }, body: body ? JSON.stringify(body) : undefined });
 return {status:response.status,...await response.json()};
}
try {
 const {access} = await api('/auth/login', null, {account:'brand',password:'demo'});
 if(process.argv.includes('--read-after-restart')){
   const old=JSON.parse(await readFile(out+'/restart-fixture.json','utf8'));
   const result=await api(`/aigc/factory/operations/${old.key}`,access);
   assert.equal(result.job.id,old.jobId);assert.equal(result.job.status,'completed');assert.equal(result.result.copy.body,old.copy);
   const balance=(await api('/aigc/billing/credits',access)).credits.balance;assert.equal(balance,old.balance);assert.equal(await db.asset.count({where:{jobId:old.jobId}}),1);
   await writeFile(out+'/restart-readback.json',JSON.stringify({status:'pass',jobId:old.jobId,balance,assetRows:1},null,2));console.log('R2 Studio process restart retained exact original operation and one Asset');
 }else{
   const key='synthetic-r2-'+Date.now();
   const product={name:'虚构青禾读书会员年度订阅',category:'工具',description:'每月三本科普书摘要，年费99元，自主决定是否续费',billingCycle:'yearly',firstPrice:99,renewPrice:99,defaultSharePct:30};
   const beforeRows=await db.product.count({where:{brandId:'youdao',name:product.name}});
   const products=await Promise.all(Array.from({length:12},()=>api('/portal/brand/products',access,product,key)));
   assert(products.every(r=>r.ok));assert.equal(new Set(products.map(r=>r.id)).size,1);assert.equal(await db.product.count({where:{brandId:'youdao',name:product.name}}),beforeRows+1);
   assert.equal(await db.auditLog.count({where:{action:'product.create',resourceId:products[0].id}}),1);
   assert.equal((await api('/portal/brand/products',access,{...product,name:'Changed request'},key)).status,409);
   assert.notEqual((await api('/portal/brand/products',access,product,key+'-new')).id,products[0].id);
   const input={assetType:'social_pack',platform:'xhs',intent:'retain',prompt:'虚构青禾读书会员，每月三本科普书摘要，年费99元。面向已订阅客户，回顾实际阅读情况后提醒自主续费，不承诺额外优惠。',modelPreset:'cheap'};
   const before=(await api('/aigc/billing/credits',access)).credits.balance;
   fixture.exec("CREATE TRIGGER audit_fail_asset BEFORE INSERT ON Asset BEGIN SELECT RAISE(FAIL, 'Synthetic registration outage'); END;");
   const accepted=await api('/aigc/factory/generate',access,input,key);assert.equal(accepted.job.status,'completed');assert.equal(accepted.assetRegistration,'pending');assert.equal(await db.asset.count({where:{jobId:accepted.job.id}}),0);
   fixture.exec('DROP TRIGGER audit_fail_asset');
   const recovered=await api(`/aigc/factory/operations/${key}`,access);assert.equal(recovered.assetRegistration,'registered');assert.equal(recovered.job.id,accepted.job.id);
   const copies=await Promise.all(Array.from({length:12},()=>api('/aigc/factory/generate',access,input,key)));
   assert(copies.every(r=>r.job.id===accepted.job.id&&r.replayed));assert.equal(await db.asset.count({where:{jobId:accepted.job.id}}),1);
   const after=await api('/aigc/billing/credits',access);assert.equal(before-after.credits.balance,accepted.job.credits_charged);assert.equal(accepted.job.credits_charged,4);assert.equal(after.credits.reservedCredits,0);
   assert.equal(after.usage.filter(e=>e.job_id===accepted.job.id).length,1);assert.equal(after.credits.recentLedger.filter(e=>e.job_id===accepted.job.id&&e.amount<0).length,1);
   assert.equal((await api('/aigc/factory/generate',access,{...input,prompt:'Different brief'},key)).status,409);
   assert(recovered.result.copy.body.includes('年费99元'));assert(recovered.result.copy.body.includes('三本科普书摘要'));assert(!recovered.result.copy.body.includes('先分任务再选工具'));assert(!recovered.result.copy.body.includes('评论区'));assert(recovered.result.copy.body.trim().endsWith('再决定是否续费。'));
   const result={status:'pass',product:{parallel:12,rows:1,audits:1,changedPayload:409,independentSameName:true},generation:{parallelReplays:12,jobId:accepted.job.id,actualDebit:before-after.credits.balance,usage:1,debitRows:1,assetRows:1,registrationFailure:'pending',repairedBy:'exact operation GET',changedPayload:409},copy:recovered.result.copy.body};
   await writeFile(out+'/readback.json',JSON.stringify(result,null,2));await writeFile(out+'/restart-fixture.json',JSON.stringify({key,jobId:accepted.job.id,balance:after.credits.balance,copy:recovered.result.copy.body},null,2));console.log(JSON.stringify(result,null,2));
 }
} finally {fixture.exec('DROP TRIGGER IF EXISTS audit_fail_asset');fixture.close();await db.$disconnect()}
