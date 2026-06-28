import { creativeModelConfigured, createChatCompletion } from "./creativeModel.js";
import { draftReplyForItem } from "./engagement.js";

// Basic filler terms to detect "AI smell"
const aiSmellPattern = /感谢关注|希望对你有帮助|很高兴能帮到你|作为AI|我理解你|首先|其次|最后|总之|可以说/i;

function sanitizeAiCopy(text) {
  // If the reply is too robotic, we might want to trim or adjust.
  // For now, we just return the raw text. A more advanced version would re-prompt or fallback.
  return text.trim();
}

export async function draftHumanReply({ item, settings, recentLearnings = [] }) {
  if (!creativeModelConfigured()) {
    // Fallback to rules if no LLM configured
    return draftReplyForItem(item, settings);
  }

  // Enforce safety manually first
  if (item.risk === "high") {
    return "这个问题涉及隐私、专业判断或平台风险，我先记录下来，人工确认后再回复你。";
  }

  if (item.intent === "business") {
    return "收到，可以先简单说下你的需求、预算和时间范围。我会先判断是否适合合作，再继续沟通。";
  }

  const systemPrompt = `
你是账号主理人，现在在处理真实用户的评论/私信。你的回复必须符合以下原则：
1. 绝对不要像客服。禁止说"感谢反馈"、"我理解你问的是..."、"很高兴为你解答"。
2. 可以短促、口语化，允许使用半句、反问、留白。
3. 你的 Brand Voice 是："${settings.brandVoice}"。
4. 必须包含一个具体的动作（去看某期、某张图、某个步骤）或一个真实边界（不适合谁、别踩什么坑）。
5. 长度：评论 40-120 字；私信 80-200 字。
6. 不要复述用户的原话，用"你提到的那个点"代替。
7. 历史学习参考（务必吸收）：${JSON.stringify(recentLearnings)}
`;

  const userPrompt = `
用户互动内容：${item.text}
互动类型：${item.channel}
原贴标题（如有）：${item.postTitle || "未知"}
`;

  try {
    const rawReply = await createChatCompletion({
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.8,
      responseFormat: "text"
    });
    
    const cleanReply = sanitizeAiCopy(rawReply);
    if (aiSmellPattern.test(cleanReply)) {
      // If it still smells like AI, fallback to rule-based to be safe
      return draftReplyForItem(item, settings);
    }
    
    return cleanReply;
  } catch (error) {
    console.error("[engagementCreative] LLM generation failed:", error);
    return draftReplyForItem(item, settings);
  }
}
