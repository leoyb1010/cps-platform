import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FactoryEstimateRequestSchema, FactoryGenerateRequestSchema } from './schema.js';
import { FACTORY_INTENTS } from './factoryIntents.js';
import { buildPack } from '../../src/lib/contentEngine.js';
import { runModel } from './modelGateway.js';
import { directionLibrary } from '../../src/lib/catalog.js';
let directory, factory;
beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'factory-intents-'));
  process.env.AGENT_STUDIO_DATA_DIR = directory;
  for (const key of ['CREATIVE_TEXT_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'IMAGE_GENERATION_API', 'VIDEO_RENDER_API']) process.env[key] = '';
  factory = await import('./factory.js');
});
afterAll(() => { delete process.env.AGENT_STUDIO_DATA_DIR; rmSync(directory, { recursive: true, force: true }); });
describe('CPS and Studio share business intent semantics', () => {
  it.each(Object.keys(FACTORY_INTENTS))('%s remains accepted by both contracts and uses a real template', intent => {
    const input = { intent, prompt: 'Fictional notebook membership', assetType: 'social_pack' };
    expect(FactoryEstimateRequestSchema.parse(input).intent).toBe(intent);
    expect(FactoryGenerateRequestSchema.parse(input).intent).toBe(intent);
    expect(directionLibrary.some(d => d.id === FACTORY_INTENTS[intent].direction)).toBe(true);
  });
  it.each(['Fictional notebook membership', '本地模型与云端模型'])('retention reaches every supported platform and final video frame: %s', async topic => {
    const goal = FACTORY_INTENTS.retain;
    const pack = buildPack(topic, goal.direction, 'balanced', 1, '', { businessGoal: goal });
    for (const copy of Object.values(pack.platformCopy)) {
      expect(copy.body).toContain('既有客户');
      expect(copy.body).toContain('续费');
    }
    expect(pack.videoFrames.at(-1).voice).toContain('续费');
    const gateway = await runModel({ modality: 'video', input: { prompt: topic, businessGoal: goal.goal, callToAction: goal.action } });
    expect(gateway.output.storyboard.at(-1).voice).toContain('既有客户');
    expect(gateway.output.storyboard.at(-1).voice).toContain('续费');
  });
  it.each(['convert', 'retain'])('%s generates usable local copy with original intent and one actual charge', async intent => {
    const ctx = { workspaceId: `synthetic-${intent}`, userId: 'synthetic-member' };
    const input = FactoryGenerateRequestSchema.parse({ intent, prompt: 'Fictional notebook membership', assetType: 'social_pack', modelPreset: 'cheap', audience: 'Synthetic audience', extraContext: 'Synthetic context' });
    const estimate = factory.estimateFactoryJob(input);
    const result = await factory.generateFactoryJob(ctx, input);
    expect(result.ok).toBe(true);
    expect(result.job.intent).toBe(intent);
    expect(result.job.input_json.intent).toBe(intent);
    expect(result.result.pack.direction.id).toBe(FACTORY_INTENTS[intent].direction);
    expect(result.result.copy.body).toContain(intent === 'retain' ? '既有客户' : '潜在客户');
    expect(result.result.copy.body).toContain(intent === 'retain' ? '续费' : '购买');
    expect(result.result.pack.cards.at(-1).body).toContain(FACTORY_INTENTS[intent].action);
    expect(result.job.credits_charged).toBe(estimate.creditsEstimated);
    const billing = factory.getBillingCredits(ctx);
    expect(billing.credits).toMatchObject({ balance: 1000 - estimate.creditsEstimated, reservedCredits: 0 });
    expect(billing.usage.filter(event => event.job_id === result.job.id)).toHaveLength(1);
    expect(factory.getFactoryJob(ctx, result.job.id).job.output_json.copy.body).toBe(result.result.copy.body);
  });
});
