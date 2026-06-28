import { buildPack } from "../../src/lib/contentEngine.js";
import { buildVisualPlan, renderMotionHtml, renderXhsCarouselHtml, visualSize } from "../../src/lib/visualEngine.js";
import { pickRecipe, resolveVisualStyleFromRecipe } from "../../src/lib/templateRegistry.js";
import { exportMotionPreview, exportXhsCarouselPng } from "./renderer.js";
import { CREDIT_PLANS, creditSummary, estimateCredits } from "./credits.js";
import { modelGatewayStatus, runModel } from "./modelGateway.js";
import {
  consumeCredits,
  createFactoryJob,
  getCreditAccount,
  listCreditLedger,
  listFactoryJobs,
  listUsageEvents,
  recordUsageEvent,
  refundCredits,
  reserveCredits,
  updateFactoryJob
} from "./store.js";

export const FACTORY_ASSET_TYPES = [
  { id: "carousel", label: "小红书图文", modality: "text", description: "6 张移动端卡片 + 标题正文标签", defaultPlatform: "xhs" },
  { id: "social_pack", label: "社媒文案包", modality: "text", description: "多平台标题、正文、标签和发布建议", defaultPlatform: "xhs" },
  { id: "image", label: "AI 生图", modality: "image", description: "商品图、封面图、广告图 prompt / provider 产物", defaultPlatform: "xhs" },
  { id: "poster", label: "商品/活动海报", modality: "image", description: "适合投放或货架的移动端海报", defaultPlatform: "generic" },
  { id: "ad", label: "广告素材", modality: "image", description: "卖点明确的转化素材", defaultPlatform: "generic" },
  { id: "video", label: "短视频素材", modality: "video", description: "脚本、分镜、motion preview / 生视频任务", defaultPlatform: "douyin" }
];

export const FACTORY_STYLES = [
  { id: "premium", label: "高级质感", recipeHint: "editorial-magazine", description: "干净留白、适合品牌/知识产品" },
  { id: "real-scene", label: "真实生活", recipeHint: "xhs-product-real-scene", description: "像真实使用体验，不像广告海报" },
  { id: "tutorial", label: "教程步骤", recipeHint: "xhs-process-storyboard", description: "流程、拆解、教学类内容" },
  { id: "viral", label: "爆款信息流", recipeHint: "xhs-dense-infographic", description: "高密度信息、强钩子、适合收藏" },
  { id: "minimal", label: "极简清爽", recipeHint: "swiss-modern", description: "少装饰、强调标题与结构" },
  { id: "business", label: "专业可信", recipeHint: "admin-tabler", description: "数据感、可信赖、适合 B 端" }
];

export const MODEL_PRESETS = [
  { id: "cheap", label: "省积分", description: "优先低成本，本地 fallback 友好" },
  { id: "balanced", label: "推荐", description: "成本和质量平衡" },
  { id: "quality", label: "高质量", description: "更适合正式投放和商业素材" },
  { id: "fast", label: "快速", description: "优先速度和可迭代" }
];

export function getFactoryConfig(ctx) {
  const account = getCreditAccount(ctx.workspaceId);
  return {
    ok: true,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    assetTypes: FACTORY_ASSET_TYPES,
    styles: FACTORY_STYLES,
    modelPresets: MODEL_PRESETS,
    providers: modelGatewayStatus(),
    credits: creditSummary(account, listCreditLedger(ctx.workspaceId, 8)),
    plans: CREDIT_PLANS
  };
}

export function estimateFactoryJob(input = {}) {
  const estimate = estimateCredits(input);
  const assetType = FACTORY_ASSET_TYPES.find((item) => item.id === input.assetType) || FACTORY_ASSET_TYPES[0];
  const modality = assetType.modality;
  const providers = modelGatewayStatus();
  return {
    ok: true,
    creditsEstimated: estimate.credits,
    breakdown: estimate.breakdown,
    steps: stepsForAssetType(assetType.id),
    providerPlan: {
      modality,
      preset: input.modelPreset || "balanced",
      provider: providers[modality]?.provider || "local-fallback",
      configured: Boolean(providers[modality]?.configured)
    },
    warnings: warningsForAssetType(assetType.id, providers)
  };
}

export async function generateFactoryJob(ctx, input = {}) {
  const estimate = estimateFactoryJob(input);
  const assetType = FACTORY_ASSET_TYPES.find((item) => item.id === input.assetType) || FACTORY_ASSET_TYPES[0];
  const job = createFactoryJob(ctx.workspaceId, {
    userId: ctx.userId,
    assetType: assetType.id,
    platform: input.platform || assetType.defaultPlatform || "xhs",
    intent: input.intent || "educate",
    prompt: input.prompt,
    style: input.style || "premium",
    modelPreset: input.modelPreset || "balanced",
    input,
    creditsEstimated: estimate.creditsEstimated,
    status: "running"
  });

  try {
    reserveCredits({ workspaceId: ctx.workspaceId, amount: estimate.creditsEstimated });
    const result = await executeFactoryJob(ctx, job, input, assetType, estimate);
    const usage = recordUsageEvent(ctx.workspaceId, {
      userId: ctx.userId,
      jobId: job.id,
      provider: result.model?.provider || result.gateway?.provider || "local-fallback",
      model: result.model?.model || result.gateway?.model || input.modelPreset || "balanced",
      modality: assetType.modality,
      task: assetType.id,
      usage: result.gateway?.usage,
      creditsEstimated: estimate.creditsEstimated,
      creditsCharged: estimate.creditsEstimated,
      status: "completed",
      metadata: result
    });
    consumeCredits({ workspaceId: ctx.workspaceId, userId: ctx.userId, amount: estimate.creditsEstimated, jobId: job.id, usageEventId: usage.id, reason: `factory:${assetType.id}` });
    const updated = updateFactoryJob(ctx.workspaceId, job.id, { status: "completed", output: result, creditsCharged: estimate.creditsEstimated });
    return {
      ok: true,
      job: updated,
      result,
      usage,
      credits: creditSummary(getCreditAccount(ctx.workspaceId), listCreditLedger(ctx.workspaceId, 8))
    };
  } catch (error) {
    refundCredits({ workspaceId: ctx.workspaceId, userId: ctx.userId, amount: estimate.creditsEstimated, jobId: job.id, reason: "factory_failed" });
    const usage = recordUsageEvent(ctx.workspaceId, {
      userId: ctx.userId,
      jobId: job.id,
      provider: "factory",
      model: input.modelPreset || "balanced",
      modality: assetType.modality,
      task: assetType.id,
      creditsEstimated: estimate.creditsEstimated,
      creditsCharged: 0,
      status: "failed",
      error: error?.message || String(error)
    });
    const updated = updateFactoryJob(ctx.workspaceId, job.id, { status: "failed", output: { error: error?.message || String(error) }, failureReason: error?.message || String(error), creditsCharged: 0 });
    return { ok: false, job: updated, usage, message: error?.message || String(error), credits: creditSummary(getCreditAccount(ctx.workspaceId), listCreditLedger(ctx.workspaceId, 8)) };
  }
}

export function getFactoryJobs(ctx, limit = 30) {
  return { ok: true, jobs: listFactoryJobs(ctx.workspaceId, limit) };
}

export function getFactoryJob(ctx, id) {
  const job = listFactoryJobs(ctx.workspaceId, 200).find((item) => item.id === id);
  return job ? { ok: true, job } : { ok: false, message: "Factory job not found" };
}

export function getBillingCredits(ctx) {
  return { ok: true, credits: creditSummary(getCreditAccount(ctx.workspaceId), listCreditLedger(ctx.workspaceId, 20)), usage: listUsageEvents(ctx.workspaceId, 30) };
}

async function executeFactoryJob(ctx, job, input, assetType, estimate) {
  const platform = input.platform || assetType.defaultPlatform || "xhs";
  const generation = Number(input.generation || Date.now() % 10000 || 1);
  const direction = mapIntentToDirection(input.intent);
  const tone = input.tone || "balanced";
  const gateway = await runModel({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    modality: assetType.modality,
    task: assetType.id,
    preset: input.modelPreset || "balanced",
    input: { ...input, topic: input.prompt, platform, direction, tone }
  });

  const pack = buildPack(input.prompt, direction, tone, generation, input.extraContext || input.audience || "", gateway.ok && assetType.modality === "text" ? { creative: null } : {});

  if (assetType.id === "carousel") {
    const recipe = pickRecipe({ mode: "recommend", pack, platform: "xhs", excludeAgpl: true });
    const visualStyle = resolveVisualStyleFromRecipe(recipe);
    const plan = buildVisualPlan(pack, "xhs", "xhs-carousel", { ratio: "3:4", style: visualStyle });
    const html = renderXhsCarouselHtml(pack, plan);
    let assets = null;
    let warning = "";
    try {
      assets = await exportXhsCarouselPng({ pack, platform: "xhs", html, viewport: visualSize("3:4") });
    } catch (error) {
      warning = error?.message || String(error);
    }
    return { type: "carousel", pack, plan, recipe, assets, warning, gateway, estimate };
  }

  if (assetType.id === "video") {
    const plan = buildVisualPlan(pack, platform, "motion-video", { ratio: "9:16", duration: input.duration || 12 });
    const html = renderMotionHtml(pack, plan);
    let motionPreview = null;
    let warning = "";
    try {
      motionPreview = await exportMotionPreview({ pack, platform, html });
    } catch (error) {
      warning = error?.message || String(error);
    }
    return { type: "video", pack, plan, motionPreview, storyboard: gateway.output?.storyboard || pack.videoFrames, warning, gateway, estimate };
  }

  if (["image", "poster", "ad"].includes(assetType.id)) {
    return { type: assetType.id, pack, imagePrompt: gateway.output?.prompt || input.prompt, images: gateway.output?.images || [], gateway, estimate };
  }

  return { type: "social_pack", pack, copy: pack.platformCopy?.[platform] || pack.platformCopy?.xhs, gateway, estimate };
}

function mapIntentToDirection(intent = "educate") {
  const map = { educate: "insight", sell: "launch", promote: "launch", explain: "tutorial", announce: "launch", summarize: "insight", grow: "opinion" };
  return map[intent] || "insight";
}

function stepsForAssetType(assetType) {
  if (assetType === "carousel") return ["生成内容包", "选择模板", "HTML 排版", "Playwright 导出 PNG", "记录积分消耗"];
  if (assetType === "video") return ["生成脚本", "生成分镜", "生成 motion preview", "记录积分消耗"];
  if (["image", "poster", "ad"].includes(assetType)) return ["生成图像 prompt", "调用/占位生图 provider", "记录积分消耗"];
  return ["生成社媒文案包", "平台化适配", "记录积分消耗"];
}

function warningsForAssetType(assetType, providers) {
  const warnings = [];
  if (["image", "poster", "ad"].includes(assetType) && !providers.image.configured) warnings.push("未配置真实生图 provider，当前会返回可复制 prompt/占位结果。");
  if (assetType === "video" && !providers.video.configured) warnings.push("未配置真实生视频 provider，当前会返回分镜和本地 motion preview。");
  if (!providers.text.configured) warnings.push("未配置文本模型，内容会使用本地 fallback 生成。");
  return warnings;
}
