import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let store, directory;
beforeAll(async () => {
  directory=mkdtempSync(join(tmpdir(),'cps-credit-audit-'));
  process.env.AGENT_STUDIO_DATA_DIR=directory;
  store=await import('./store.js');
});
afterAll(() => { delete process.env.AGENT_STUDIO_DATA_DIR; rmSync(directory,{recursive:true,force:true}); });

describe('job-scoped credit invariants', () => {
  it('failed reservation cannot mint credit or release another job', () => {
    const workspaceId='denied';
    store.reserveCredits({workspaceId,amount:900,jobId:'other'});
    expect(()=>store.reserveCredits({workspaceId,amount:200,jobId:'denied'})).toThrow();
    store.refundCredits({workspaceId,amount:200,jobId:'denied'});
    expect(store.getCreditAccount(workspaceId)).toMatchObject({balance:1000,reserved_credits:900});
  });
  it('failed execution releases reservation without minting a refund', () => {
    const workspaceId='release';
    store.reserveCredits({workspaceId,amount:100,jobId:'job'});
    store.refundCredits({workspaceId,amount:100,jobId:'job'});
    store.refundCredits({workspaceId,amount:100,jobId:'job'});
    expect(store.getCreditAccount(workspaceId)).toMatchObject({balance:1000,reserved_credits:0});
    expect(store.listCreditLedger(workspaceId)).toHaveLength(1);
  });
  it('successful debit and later genuine refund each happen once', () => {
    const workspaceId='consume';
    store.reserveCredits({workspaceId,amount:100,jobId:'job'});
    store.reserveCredits({workspaceId,amount:100,jobId:'job'});
    store.consumeCredits({workspaceId,amount:100,jobId:'job'});
    store.consumeCredits({workspaceId,amount:100,jobId:'job'});
    expect(store.getCreditAccount(workspaceId)).toMatchObject({balance:900,reserved_credits:0});
    store.refundCredits({workspaceId,amount:100,jobId:'job'});
    store.refundCredits({workspaceId,amount:100,jobId:'job'});
    expect(store.getCreditAccount(workspaceId)).toMatchObject({balance:1000,reserved_credits:0});
    expect(store.listCreditLedger(workspaceId)).toHaveLength(2);
  });
  it('rejects mismatched, invalid and foreign-workspace claims', () => {
    const workspaceId='claims';
    store.reserveCredits({workspaceId,amount:100,jobId:'job'});
    expect(()=>store.consumeCredits({workspaceId,amount:101,jobId:'job'})).toThrow();
    store.refundCredits({workspaceId:'other',amount:100,jobId:'job'});
    for(const amount of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])
      expect(()=>store.reserveCredits({workspaceId,amount,jobId:'bad'})).toThrow();
    expect(store.getCreditAccount(workspaceId)).toMatchObject({balance:1000,reserved_credits:100});
  });
});
