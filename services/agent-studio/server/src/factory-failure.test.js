import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportXhsCarouselPng, exportMotionPreview } from './renderer.js';

vi.mock('./renderer.js',()=>({exportXhsCarouselPng:vi.fn().mockRejectedValue(new Error('synthetic render failure')),exportMotionPreview:vi.fn().mockRejectedValue(new Error('synthetic render failure'))}));
vi.mock('./modelGateway.js',()=>({modelGatewayStatus:()=>({text:{configured:false},image:{configured:false},video:{configured:false}}),runModel:vi.fn().mockResolvedValue({ok:true,provider:'fixture',model:'fixture',output:{},usage:{}})}));
let directory,store,factory;
beforeAll(async()=>{
  directory=mkdtempSync(join(tmpdir(),'cps-factory-failure-'));process.env.AGENT_STUDIO_DATA_DIR=directory;
  store=await import('./store.js');factory=await import('./factory.js');
});
afterAll(()=>{delete process.env.AGENT_STUDIO_DATA_DIR;rmSync(directory,{recursive:true,force:true})});
describe('render failure billing truth',()=>{
  it.each(['carousel','video'])('%s empty render is failed and uncharged',async assetType=>{
    if(assetType==='carousel')exportXhsCarouselPng.mockResolvedValueOnce({files:[]});
    else exportMotionPreview.mockResolvedValueOnce({thumbnailPath:null});
    const workspaceId=`fixture-empty-${assetType}`;
    const result=await factory.generateFactoryJob({workspaceId,userId:'fixture'},{assetType,prompt:'Synthetic audit fixture',platform:'xhs'});
    expect(result.ok).toBe(false);expect(result.job.status).toBe('failed');
    expect(store.getCreditAccount(workspaceId)).toMatchObject({balance:1000,reserved_credits:0});
  });
  it.each(['carousel','video'])('%s render failure is failed and uncharged',async assetType=>{
    const workspaceId=`fixture-${assetType}`;
    const result=await factory.generateFactoryJob({workspaceId,userId:'fixture'},{assetType,prompt:'Synthetic audit fixture',platform:'xhs'});
    expect(result.ok).toBe(false);expect(result.job.status).toBe('failed');
    expect(result.job.credits_charged).toBe(0);
    expect(store.getCreditAccount(workspaceId)).toMatchObject({balance:1000,reserved_credits:0});
    expect(store.listCreditLedger(workspaceId).every(entry=>entry.amount===0)).toBe(true);
  });
});
