import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let directory, store, factory;
const brand = { workspaceId: 'brand-fixture', userId: 'u-fixture' };
const agent = { workspaceId: 'agent-a-2041', userId: 'u-007' };
beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'cps-factory-roles-'));
  process.env.AGENT_STUDIO_DATA_DIR = directory;
  store = await import('./store.js');
  factory = await import('./factory.js');
  for (let i = 0; i < 205; i++) {
    store.createFactoryJob(brand.workspaceId, { id: `history-${i}`, userId: brand.userId, prompt: 'Synthetic role history', created_at: new Date(1700000000000 + i * 1000).toISOString() });
  }
});
afterAll(() => { delete process.env.AGENT_STUDIO_DATA_DIR; rmSync(directory, { recursive: true, force: true }); });

describe('additional role rounds: Studio history and tenant handoff', () => {
  it('a creator can reopen an owned job older than the first 200 rows', () => {
    expect(factory.getFactoryJob(brand, 'history-0')).toMatchObject({ ok: true, job: { id: 'history-0', workspace_id: brand.workspaceId } });
  });
  it('foreign workspace cannot reopen or mutate that job', () => {
    expect(factory.getFactoryJob(agent, 'history-0').ok).toBe(false);
    expect(store.updateFactoryJob(agent.workspaceId, 'history-0', { status: 'completed' })).toBeNull();
    expect(store.getFactoryJob(brand.workspaceId, 'history-0').status).toBe('pending');
    expect(factory.getFactoryJobs(agent).jobs).toEqual([]);
  });
  it.each([-1, 0, NaN, Infinity, 1e8, 2.5])('hostile history limit %s remains finite and bounded', (limit) => {
    const result = factory.getFactoryJobs(brand, limit);
    expect(result.ok).toBe(true);
    expect(result.jobs.length).toBeGreaterThan(0);
    expect(result.jobs.length).toBeLessThanOrEqual(200);
  });
  it('interrupted brand reservations cannot consume or release an agent job', () => {
    store.reserveCredits({ workspaceId: brand.workspaceId, jobId: 'brand-work', amount: 50 });
    store.reserveCredits({ workspaceId: agent.workspaceId, jobId: 'agent-work', amount: 75 });
    expect(() => store.consumeCredits({ workspaceId: brand.workspaceId, jobId: 'agent-work', amount: 75 })).toThrow();
    store.refundCredits({ workspaceId: brand.workspaceId, jobId: 'brand-work', amount: 50 });
    store.refundCredits({ workspaceId: brand.workspaceId, jobId: 'brand-work', amount: 50 });
    expect(factory.getBillingCredits(brand).credits).toMatchObject({ balance: 1000, reservedCredits: 0 });
    expect(factory.getBillingCredits(agent).credits).toMatchObject({ balance: 1000, reservedCredits: 75 });
    store.consumeCredits({ workspaceId: agent.workspaceId, jobId: 'agent-work', amount: 75 });
    store.consumeCredits({ workspaceId: agent.workspaceId, jobId: 'agent-work', amount: 75 });
    expect(factory.getBillingCredits(agent).credits).toMatchObject({ balance: 925, reservedCredits: 0 });
  });
});
