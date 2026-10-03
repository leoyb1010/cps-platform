import { beforeAll, afterAll, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
let dir, store, readFactoryPng, root;
const ctx={workspaceId:'synthetic-owner',userId:'synthetic-author'};
const png=Buffer.from('89504e470d0a1a0a00000000','hex');
beforeAll(async()=>{
 dir=mkdtempSync(join(tmpdir(),'factory-owned-png-'));root=join(dir,'exports');mkdirSync(root);
 process.env.AGENT_STUDIO_DATA_DIR=join(dir,'db');process.env.AGENT_STUDIO_EXPORTS_DIR=root;
 store=await import('./store.js');({readFactoryPng}=await import('./factoryAssets.js'));
});
afterAll(()=>{delete process.env.AGENT_STUDIO_DATA_DIR;delete process.env.AGENT_STUDIO_EXPORTS_DIR;rmSync(dir,{recursive:true,force:true})});
function job(id,file){store.createFactoryJob(ctx.workspaceId,{id,status:'completed',output:{assets:{files:[file]}}});return id}
it('returns only bytes from the requested owned job',async()=>{const file=join(root,'owned.png');writeFileSync(file,png);job('owned',file);expect(await readFactoryPng(ctx,'owned','0')).toEqual(png);expect(await readFactoryPng({workspaceId:'other'},'owned','0')).toBeNull()});
it('missing, invalid and out-of-range indexes return unavailable',async()=>{for(const index of ['-1','../0','1','999','NaN'])expect(await readFactoryPng(ctx,'owned',index)).toBeNull();expect(await readFactoryPng(ctx,'missing','0')).toBeNull()});
it('does not render generated HTML or mislabeled non-PNG bytes',async()=>{for(const [name,body] of [['file.html',png],['file.png',Buffer.from('<script>alert(1)</script>')]]){const file=join(root,name);writeFileSync(file,body);job(name,file);expect(await readFactoryPng(ctx,name,'0')).toBeNull()}});
it('does not follow outside-root files or symbolic links',async()=>{const external=join(dir,'outside.png');writeFileSync(external,png);job('external',external);const link=join(root,'link.png');symlinkSync(external,link);job('linked',link);expect(await readFactoryPng(ctx,'external','0')).toBeNull();expect(await readFactoryPng(ctx,'linked','0')).toBeNull()});
