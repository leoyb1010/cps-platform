import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);const {PrismaClient}=require('../server/node_modules/@prisma/client');const db=new PrismaClient();
const base=process.env.AUDIT_CPS_URL||'http://127.0.0.1:46301';assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
async function api(path,token,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert(r.ok,`${path} status ${r.status}: ${JSON.stringify(data)}`);return data}
try{for(const account of ['admin','brand','agent']){
 const session=await api('/auth/login',null,{account,password:'demo'});const token=session.access;const config=await api('/aigc/factory/config',token);assert(Object.values(config.providers).every(p=>!p.configured));let balance=(await api('/aigc/billing/credits',token)).credits.balance;
 for(const intent of ['educate','convert','retain']){
  const input={assetType:'social_pack',platform:'xhs',intent,prompt:'Synthetic notebook membership',modelPreset:'cheap'};
  const estimate=await api('/aigc/factory/estimate',token,input);const result=await api('/aigc/factory/generate',token,input);assert(result.ok);assert.equal(result.job.intent,intent);assert.equal(result.job.input_json.intent,intent);assert.equal(result.job.credits_charged,estimate.creditsEstimated);balance-=estimate.creditsEstimated;
  const billing=await api('/aigc/billing/credits',token);assert.equal(billing.credits.balance,balance);assert.equal(billing.credits.reservedCredits,0);assert.equal(billing.credits.recentLedger.filter(e=>e.job_id===result.job.id&&e.amount<0).length,1);
  const rows=await db.asset.findMany({where:{jobId:result.job.id}});assert.equal(rows.length,account==='admin'?0:1);if(account==='brand')assert.equal(rows[0].brandId,'youdao');if(account==='agent')assert.equal(rows[0].agentId,'A-2041');
  const saved=await api(`/aigc/factory/jobs/${result.job.id}`,token);assert.equal(saved.job.output_json.copy.body,result.result.copy.body);if(intent==='retain')assert(result.result.copy.body.includes('既有客户'));
  console.log(JSON.stringify({account,intent,workspace:config.workspaceId,charge:result.job.credits_charged,balance,assetRows:rows.length,status:'pass'}));
 }
}}finally{await db.$disconnect()}
