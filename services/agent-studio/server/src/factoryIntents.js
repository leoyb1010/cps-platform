// Business goals are distinct from the content engine's template directions.
// Preserve the original API intent (including the CPS UI's convert/retain values).
export const FACTORY_INTENTS = {
  educate: { direction: 'insight', goal: '面向初次了解产品的读者，说明使用场景与适用边界。', action: '结合自己的实际需求，先了解再选择。' },
  sell: { direction: 'tool', goal: '面向有购买意向的潜在客户，解释产品适用场景与购买前需要确认的信息。', action: '核对适用场景、价格和服务条款后，再决定是否购买。' },
  convert: { direction: 'tool', goal: '面向有购买意向的潜在客户，解释产品适用场景与购买前需要确认的信息。', action: '核对适用场景、价格和服务条款后，再决定是否购买。' },
  retain: { direction: 'howto', goal: '面向已购买的既有客户，复盘实际使用价值并说明续费前需要确认的信息。', action: '续费前，请核对已用权益、后续需求、当前价格和服务条款，再决定是否续费。' },
  promote: { direction: 'tool', goal: '说明产品或活动的适用人群与参与条件。', action: '确认活动条件与实际需求后，再决定是否参与。' },
  explain: { direction: 'howto', goal: '通过具体步骤解释如何使用产品。', action: '选择一个适合自己的场景，按步骤验证效果。' },
  announce: { direction: 'trend', goal: '清楚说明本次更新内容及影响。', action: '核对更新说明，确认哪些变化适用于自己。' },
  summarize: { direction: 'insight', goal: '提炼关键事实与适用边界。', action: '对照实际需求，检查关键结论是否适用。' },
  grow: { direction: 'debate', goal: '通过有依据的观点鼓励讨论与分享。', action: '分享你的实际经验与不同看法。' },
};
export const FACTORY_INTENT_IDS = Object.keys(FACTORY_INTENTS);
