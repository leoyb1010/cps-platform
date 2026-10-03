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

describe('ordinary product brief fidelity',()=>{
 const brief='虚构青禾读书会员，每月三本科普书摘要，年费99元。面向已订阅客户，回顾实际阅读情况后提醒自主续费，不承诺额外优惠。';
 it('all platform copy and all six cards remain on the stated membership facts and renewal decision',()=>{
  const pack=buildPack(brief,'howto','balanced',1,'',{businessGoal:FACTORY_INTENTS.retain,businessBrief:brief,businessIntent:'retain'});
  for(const copy of Object.values(pack.platformCopy)){
   expect(copy.body).toContain('每月三本科普书摘要');expect(copy.body).toContain('年费99元');expect(copy.body).not.toContain('评论区');expect(copy.body).not.toContain('先分任务再选工具');expect(copy.body.trim().endsWith(FACTORY_INTENTS.retain.action)).toBe(true);
  }
  expect(pack.cards).toHaveLength(6);expect(pack.cards[0].body).toContain('年费99元');expect(pack.cards[2].body).toContain('实际使用频次');expect(pack.cards[3].body).toContain('相同需求');expect(pack.cards.at(-1).body).toBe(FACTORY_INTENTS.retain.action);expect(pack.videoFrames[0].voice).toContain('青禾读书会员');expect(pack.videoFrames.at(-1).voice).toContain('续费');
 });
 it.each(['educate','convert','retain'])('real local %s generation keeps concrete notebook facts and its chosen action',async intent=>{
  const prompt='虚构青禾笔记本，采用可回收纸材，适合日常记录；每本24元。不承诺提高学习成绩。';
  const result=await factory.generateFactoryJob({workspaceId:`brief-${intent}`,userId:'synthetic'},{assetType:'social_pack',prompt,intent,modelPreset:'cheap'});
  expect(result.ok).toBe(true);expect(result.result.copy.body).toContain('可回收纸材');expect(result.result.copy.body).toContain('每本24元');expect(result.result.copy.body).not.toContain('先分任务再选工具');expect(result.result.copy.body.trim().endsWith(FACTORY_INTENTS[intent].action)).toBe(true);expect(result.job.input_json.prompt).toBe(prompt);
 });
});
