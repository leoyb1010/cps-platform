import { creativeModelConfigured, createChatCompletion } from "./creativeModel.js";
import { estimateCredits } from "./credits.js";

function nowMs() {
  return Date.now();
}

function estimateTokens(value) {
  return Math.max(1, Math.ceil(String(value || "").length / 4));
}

function compact(value, max = 1200) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function modelGatewayStatus() {
  return {
    text: {
      configured: creativeModelConfigured(),
      provider: creativeModelConfigured() ? "openai-compatible" : "local-fallback",
      presets: ["cheap", "balanced", "quality", "fast"]
    },
    image: {
      configured: Boolean(globalThis.process?.env?.IMAGE_GENERATION_API),
      provider: globalThis.process?.env?.IMAGE_GENERATION_API ? "external-image-api" : "mock-image",
      presets: ["cheap", "balanced", "quality", "fast"]
    },
    video: {
      configured: Boolean(globalThis.process?.env?.VIDEO_RENDER_API),
      provider: globalThis.process?.env?.VIDEO_RENDER_API ? "external-video-api" : "local-motion/mock-video",
      presets: ["cheap", "balanced", "quality", "fast"]
    }
  };
}

export async function runModel({ workspaceId = "default", userId = "local-user", modality = "text", task = "content_pack", preset = "balanced", input = {}, idempotencyKey = "" } = {}) {
  const started = nowMs();
  const estimate = estimateCredits({ assetType: modality === "text" ? "text" : modality, modelPreset: preset, duration: input.duration, count: input.count });
  try {
    if (modality === "text") {
      const result = await runTextModel({ task, preset, input });
      const outputText = typeof result.output === "string" ? result.output : JSON.stringify(result.output || "");
      const usage = {
        inputTokens: estimateTokens(JSON.stringify(input)),
        outputTokens: estimateTokens(outputText),
        totalTokens: estimateTokens(JSON.stringify(input)) + estimateTokens(outputText),
        estimated: true,
        latencyMs: nowMs() - started
      };
      return {
        ok: true,
        workspaceId,
        userId,
        provider: result.provider,
        model: result.model,
        modality,
        task,
        preset,
        output: result.output,
        usage,
        creditsEstimated: estimate.credits,
        creditsCharged: estimate.credits,
        idempotencyKey
      };
    }

    if (modality === "image") {
      const prompt = buildImagePrompt(input);
      return {
        ok: true,
        workspaceId,
        userId,
        provider: globalThis.process?.env?.IMAGE_GENERATION_API ? "external-image-api" : "mock-image",
        model: input.model || preset,
        modality,
        task,
        preset,
        output: {
          status: globalThis.process?.env?.IMAGE_GENERATION_API ? "provider_configured_not_called_in_mvp" : "mock_ready",
          prompt,
          images: [],
          next: "接入真实生图 provider 后，这里会返回 image URLs / asset IDs。"
        },
        usage: { inputTokens: estimateTokens(prompt), outputTokens: 0, totalTokens: estimateTokens(prompt), estimated: true, latencyMs: nowMs() - started },
        creditsEstimated: estimate.credits,
        creditsCharged: estimate.credits,
        idempotencyKey
      };
    }

    if (modality === "video") {
      const storyboard = buildVideoStoryboard(input);
      return {
        ok: true,
        workspaceId,
        userId,
        provider: globalThis.process?.env?.VIDEO_RENDER_API ? "external-video-api" : "mock-video",
        model: input.model || preset,
        modality,
        task,
        preset,
        output: {
          status: globalThis.process?.env?.VIDEO_RENDER_API ? "provider_configured_not_called_in_mvp" : "storyboard_ready",
          storyboard,
          next: "接入真实生视频 provider 后，这里会返回 async job / mp4 URL。"
        },
        usage: { inputTokens: estimateTokens(JSON.stringify(input)), outputTokens: estimateTokens(JSON.stringify(storyboard)), totalTokens: estimateTokens(JSON.stringify(input)) + estimateTokens(JSON.stringify(storyboard)), estimated: true, latencyMs: nowMs() - started },
        creditsEstimated: estimate.credits,
        creditsCharged: estimate.credits,
        idempotencyKey
      };
    }

    throw new Error(`Unsupported modality: ${modality}`);
  } catch (error) {
    return {
      ok: false,
      workspaceId,
      userId,
      provider: "model-gateway",
      model: preset,
      modality,
      task,
      preset,
      output: null,
      usage: { inputTokens: estimateTokens(JSON.stringify(input)), outputTokens: 0, totalTokens: estimateTokens(JSON.stringify(input)), estimated: true, latencyMs: nowMs() - started },
      creditsEstimated: estimate.credits,
      creditsCharged: 0,
      error: error?.message || String(error),
      idempotencyKey
    };
  }
}

async function runTextModel({ task, preset, input }) {
  const topic = input.prompt || input.topic || "AI 内容素材";
  const system = [
    "你是 AI 素材工厂的创意总监，只输出可直接用于生产的内容。",
    "内容要具体、有场景、有动作，避免空泛套话。",
    "如果是小红书/图文，请给出标题、正文结构、6张卡片要点、标签。",
    "如果是商品/广告/视频，请输出可交给生图或生视频模型的 prompt/分镜。"
  ].join("\n");
  const user = JSON.stringify({ task, preset, ...input, topic });

  if (creativeModelConfigured()) {
    const text = await createChatCompletion({ system, user, temperature: preset === "quality" ? 0.82 : 0.7, responseFormat: "text" });
    return { provider: "openai-compatible", model: preset, output: compact(text, 5000) };
  }

  return {
    provider: "local-fallback",
    model: "deterministic-copywriter",
    output: [
      `主题：${topic}`,
      "",
      "生成建议：",
      "1. 先用反常识标题抓住注意力。",
      "2. 中间用 3 个具体场景/步骤证明价值。",
      "3. 结尾给出可评论的问题或行动指令。",
      "",
      `模型预设：${preset}`
    ].join("\n")
  };
}

function buildImagePrompt(input = {}) {
  const topic = input.prompt || input.topic || "AI 内容素材";
  const style = input.style || "premium editorial";
  const platform = input.platform || "xhs";
  return [
    `Create a high-converting ${platform} visual asset about: ${topic}.`,
    `Style: ${style}.`,
    "Composition: clear hero subject, readable negative space, mobile-first crop, commercial lighting.",
    "Avoid tiny text, distorted hands, watermarks, logos unless provided by user."
  ].join(" ");
}

function buildVideoStoryboard(input = {}) {
  const topic = input.prompt || input.topic || "AI 内容素材";
  const duration = Number(input.duration || 12);
  return [
    { time: "0-3s", shot: "Hook", visual: `用强视觉提出 ${topic} 的痛点`, voice: "别先解释，先给结果。" },
    { time: "3-7s", shot: "Proof", visual: "展示 2-3 个生成前后/步骤/证据画面", voice: "让用户看到它真的能落地。" },
    { time: `7-${duration}s`, shot: "CTA", visual: "收束到可保存的清单或行动按钮", voice: "收藏这套流程，下次直接复用。" }
  ];
}
