import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
const calls=vi.hoisted(()=>({run:vi.fn()}));
vi.mock('./modelGateway.js',()=>({modelGatewayStatus:()=>({text:{configured:false},image:{configured:false},video:{configured:false}}),runModel:calls.run}));
let directory,store,factory,db;
const studioRoot=fileURLToPath(new URL('../../',import.meta.url));
const response={ok:true,provider:'local-fallback',model:'synthetic',output:'Local fixture output',usage:{}};
const input={operationKey:'same-op',assetType:'social_pack',intent:'retain',prompt:'Synthetic reading membership',modelPreset:'cheap'};
beforeAll(async()=>{directory=mkdtempSync(join(tmpdir(),'factory-operations-'));process.env.AGENT_STUDIO_DATA_DIR=directory;store=await import('./store.js');factory=await import('./factory.js');db=new Database(join(directory,'agent_studio.db'))});
beforeEach(()=>{calls.run.mockReset().mockResolvedValue(response);for(const name of ['fail_claim','fail_complete','fail_failed'])db.exec(`DROP TRIGGER IF EXISTS ${name}`)});
afterAll(()=>{db.close();delete process.env.AGENT_STUDIO_DATA_DIR;rmSync(directory,{recursive:true,force:true})});
const ctx=name=>({workspaceId:`synthetic-${name}`,userId:'synthetic-author'});
it('concurrent same operation returns pending, then original job with one render, usage and debit',async()=>{
 const owner=ctx('parallel');let release;calls.run.mockImplementationOnce(()=>new Promise(r=>{release=r}));const first=factory.generateFactoryJob(owner,input);
 const pending=await Promise.all(Array.from({length:12},()=>factory.generateFactoryJob(owner,input)));expect(pending.every(r=>r.pending&&r.job.id===pending[0].job.id)).toBe(true);expect(calls.run).toHaveBeenCalledOnce();release(response);const done=await first;
 const replay=await factory.generateFactoryJob(owner,input);expect(replay.job.id).toBe(done.job.id);expect(replay.result).toEqual(done.result);expect(replay.replayed).toBe(true);expect(replay.usage.id).toBe(done.usage.id);expect(calls.run).toHaveBeenCalledOnce();
 const billing=factory.getBillingCredits(owner);expect(billing.credits).toMatchObject({balance:996,reservedCredits:0});expect(billing.credits.recentLedger.filter(e=>e.amount<0)).toHaveLength(1);expect(billing.usage).toHaveLength(1);expect(factory.getFactoryJobs(owner).jobs).toHaveLength(1);
});
it('same key changed body conflicts; same prompt new operation and another owner remain independent',async()=>{
 const owner=ctx('identity');const a=await factory.generateFactoryJob(owner,input);const conflict=await factory.generateFactoryJob(owner,{...input,prompt:'Changed intent'});expect(conflict).toMatchObject({ok:false,status:409});expect(calls.run).toHaveBeenCalledOnce();
 const b=await factory.generateFactoryJob(owner,{...input,operationKey:'new-op'});const other=await factory.generateFactoryJob(ctx('other-owner'),input);expect(b.job.id).not.toBe(a.job.id);expect(other.job.id).not.toBe(a.job.id);expect(factory.getBillingCredits(owner).credits.balance).toBe(992);
});
it('a claim insertion failure rolls back job and reservation together and permits the same operation to retry',async()=>{
 const owner=ctx('claim-rollback');db.exec("CREATE TRIGGER fail_claim BEFORE INSERT ON factory_requests BEGIN SELECT RAISE(ABORT,'Synthetic claim failure'); END;");const failed=await factory.generateFactoryJob(owner,input);expect(failed.ok).toBe(false);expect(factory.getFactoryJobs(owner).jobs).toHaveLength(0);expect(factory.getBillingCredits(owner).credits).toMatchObject({balance:1000,reservedCredits:0});expect(calls.run).not.toHaveBeenCalled();db.exec('DROP TRIGGER fail_claim');expect((await factory.generateFactoryJob(owner,input)).ok).toBe(true);
});
it('terminal-record failure cannot leave a debit or completed usage without its completed job',async()=>{
 const owner=ctx('finish-rollback');db.exec("CREATE TRIGGER fail_complete BEFORE UPDATE OF status ON factory_requests WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'Synthetic terminal failure'); END;");const failed=await factory.generateFactoryJob(owner,input);expect(failed).toMatchObject({ok:false,job:{status:'failed',credits_charged:0}});const billing=factory.getBillingCredits(owner);expect(billing.credits).toMatchObject({balance:1000,reservedCredits:0});expect(billing.credits.recentLedger.every(e=>e.amount>=0)).toBe(true);expect(billing.usage).toHaveLength(1);expect(billing.usage[0].status).toBe('failed');const replay=await factory.generateFactoryJob(owner,input);expect(replay.job.id).toBe(failed.job.id);expect(calls.run).toHaveBeenCalledOnce();
});
it('unknown failure finalization keeps the original pending operation instead of rerunning it',async()=>{
 const owner=ctx('unknown');calls.run.mockRejectedValueOnce(new Error('Synthetic renderer unavailable'));db.exec("CREATE TRIGGER fail_failed BEFORE UPDATE OF status ON factory_requests WHEN NEW.status='failed' BEGIN SELECT RAISE(ABORT,'Synthetic failure finalization'); END;");await expect(factory.generateFactoryJob(owner,input)).rejects.toThrow('Synthetic failure finalization');const pending=await factory.generateFactoryJob(owner,input);expect(pending.pending).toBe(true);expect(calls.run).toHaveBeenCalledOnce();expect(factory.getBillingCredits(owner).credits).toMatchObject({balance:1000,reservedCredits:4});
});
it('completed identity survives a fresh process and returns its original output and current balance',async()=>{
 const owner=ctx('restart');const original=await factory.generateFactoryJob(owner,input);
 const code=`const f=await import('./server/src/factory.js');console.log(JSON.stringify(await f.generateFactoryJob(${JSON.stringify(owner)},${JSON.stringify(input)})));`;
 const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:studioRoot,env:{...process.env,AGENT_STUDIO_DATA_DIR:directory},encoding:'utf8'}).trim());expect(result.replayed).toBe(true);expect(result.job.id).toBe(original.job.id);expect(result.result).toEqual(original.result);expect(result.credits).toMatchObject({balance:996,reservedCredits:0});
});
it('an old populated store gains the additive table without changing old job or credits',()=>{
 const legacy=join(directory,'legacy');mkdirSync(legacy);const old=new Database(join(legacy,'agent_studio.db'));old.exec(readFileSync(join(studioRoot,'server/src/db/schema.sql'),'utf8'));old.exec("DROP TABLE factory_requests; INSERT OR IGNORE INTO workspaces(id,name,created_at) VALUES('legacy','Legacy','2020-01-01'); INSERT INTO credit_accounts(workspace_id,plan,balance,included_monthly_credits,purchased_credits,reserved_credits,updated_at) VALUES('legacy','free',996,1000,0,0,'2020-01-01'); INSERT INTO factory_jobs(id,workspace_id,user_id,status,prompt,credits_charged,created_at,updated_at,output_json) VALUES('legacy-job','legacy','legacy-user','completed','Legacy prompt',4,'2020-01-01','2020-01-01','{\"copy\":{\"body\":\"Legacy copy\"}}');");old.close();
 const code="const f=await import('./server/src/factory.js');console.log(JSON.stringify({job:f.getFactoryJob({workspaceId:'legacy'},'legacy-job').job,credits:f.getBillingCredits({workspaceId:'legacy'}).credits}));";
 const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:studioRoot,env:{...process.env,AGENT_STUDIO_DATA_DIR:legacy},encoding:'utf8'}).trim());expect(result.job.output_json.copy.body).toBe('Legacy copy');expect(result.credits.balance).toBe(996);const reopened=new Database(join(legacy,'agent_studio.db'));expect(reopened.prepare('SELECT COUNT(*) AS n FROM factory_requests').get().n).toBe(0);reopened.close();
});
it('unkeyed callers retain independent generation behavior',async()=>{const owner=ctx('legacy');const{operationKey,...legacy}=input;const a=await factory.generateFactoryJob(owner,legacy),b=await factory.generateFactoryJob(owner,legacy);expect(a.job.id).not.toBe(b.job.id);expect(factory.getBillingCredits(owner).credits.balance).toBe(992)});
it('exact operation lookup finds a pending request older than the history limit without starting it again',async()=>{
 const owner=ctx('old-pending');let release;calls.run.mockImplementationOnce(()=>new Promise(r=>{release=r}));const work=factory.generateFactoryJob(owner,input);
 for(let i=0;i<205;i++)store.createFactoryJob(owner.workspaceId,{userId:owner.userId,assetType:'social_pack',prompt:`Later ${i}`,status:'completed'});
 const result=factory.getFactoryOperation(owner,input.operationKey);expect(result.pending).toBe(true);expect(result.job.prompt).toBe(input.prompt);expect(calls.run).toHaveBeenCalledOnce();expect(factory.getFactoryOperation({...owner,userId:'another-author'},input.operationKey).status).toBe(404);
 release(response);await work;expect(factory.getFactoryOperation(owner,input.operationKey).job.status).toBe('completed');expect(calls.run).toHaveBeenCalledOnce();
});
