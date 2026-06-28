import fs, { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { agentStages, apiSlots, platformMeta } from "../../src/lib/catalog.js";
import {
  buildAgentRunbook,
  buildCommentMaintenanceTask,
  buildPack,
  buildPlatformBrowserTask,
  buildResearchBrief,
  buildSourceItems,
  buildTopicCandidates,
  createSystemPrompt,
  renderHtmlDeck,
  svgForPack
} from "../../src/lib/contentEngine.js";
import {
  AgentRunRequestSchema,
  AnalyticsBriefRequestSchema,
  AnalyticsCollectRequestSchema,
  AutopilotSettingsRequestSchema,
  AutopilotTopicRequestSchema,
  AutopilotTopicUpdateSchema,
  BrowserTaskRequestSchema,
  ChartAssetRequestSchema,
  CommentMaintenanceRequestSchema,
  DraftRequestSchema,
  EngagementCheckRequestSchema,
  EngagementRecordRequestSchema,
  EngagementSettingsRequestSchema,
  GenerateRequestSchema,
  GraphicSmokeRequestSchema,
  RenderHtmlRequestSchema,
  ResearchBriefRequestSchema,
  ResearchCollectRequestSchema,
  ResearchTopicsRequestSchema,
  SeriesCreateRequestSchema,
  SeriesEpisodeQueueRequestSchema,
  SeriesEpisodeRequestSchema,
  SeriesUpdateRequestSchema,
  TraceRequestSchema,
  VisualExportRequestSchema,
  VisualPlanRequestSchema,
  FactoryEstimateRequestSchema,
  FactoryGenerateRequestSchema
} from "./schema.js";
import { exportDeckPng, exportMotionPreview, exportMotionVideo, exportVisualPng, exportXhsCarouselPng } from "./renderer.js";
import { collectResearchSources } from "./researchConnectors.js";
import { collectAnalyticsSnapshots } from "./analyticsConnectors.js";
import { creativeModelConfigured, generateCreativeContent, planXhsCarouselWithCreativeModel } from "./creativeModel.js";
import {
  buildChartSpec,
  buildExplainAnimationManifest,
  buildReactVideoManifest,
  buildVisualPlan,
  renderChartHtml,
  renderInfographicHtml,
  renderInfoCardHtml,
  renderMotionHtml,
  renderSatoriLikeCoverHtml,
  renderXhsCarouselHtml,
  mergedTemplateRepository,
  templateSourceCatalog,
  visualStyleCatalog,
  visualSize
} from "../../src/lib/visualEngine.js";
import {
  getAgentRun,
  getCodexTask,
  listCodexTasks,
  loadState,
  putAgentRun,
  updateAutopilotSlot,
  updateAutopilotTopic,
  putCodexTask,
  putTrace,
  getSetting,
  putSetting
} from "./store.js";
import {
  filterRecipes,
  getRecipeById,
  loadRecipeRegistry,
  pickRecipe,
  PICK_MODES,
  resolveVisualStyleFromRecipe
} from "../../src/lib/templateRegistry.js";
import { lintVisualHtml } from "./visualLinter.js";
import { executePlaywrightTask } from "./playwrightExecutor.js";
import {
  addAutopilotTopic,
  autopilotTick,
  clearAutopilotPlans,
  ensureTodayPlan,
  getAutopilotSnapshot,
  queueAutopilotSlot,
  saveAutopilotSettings,
  startAutopilotScheduler
} from "./autopilot.js";
import {
  getEngagementSnapshot,
  queueEngagementCheck,
  recordEngagementResult,
  saveEngagementSettings,
  startEngagementScheduler
} from "./engagement.js";
import {
  addSeriesEpisode,
  createSeries,
  getSeriesSnapshot,
  queueSeriesEpisode,
  saveSeries
} from "./series.js";
import { resolveRequestContext } from "./requestContext.js";
import { CREDIT_PLANS } from "./credits.js";
import { modelGatewayStatus } from "./modelGateway.js";
import {
  estimateFactoryJob,
  generateFactoryJob,
  getBillingCredits,
  getFactoryConfig,
  getFactoryJob,
  getFactoryJobs
} from "./factory.js";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function maybeExecutePlaywright(taskId) {
  if (globalThis.process?.env?.NATIVE_PLAYWRIGHT_ENABLED === "true") {
    executePlaywrightTask(taskId).catch(console.error);
  }
}

function resolveExportStyle(data, pack, platform) {
  const weightOverrides = getSetting("template_weights", {});
  const pickMode = data.pickMode || "recommend";
  const pinned = Boolean(data.templateRecipeId) && (pickMode === "manual" || data.pinRecipe === true);

  if (pinned) {
    const recipe = pickRecipe({
      mode: "manual",
      recipeId: data.templateRecipeId,
      pack,
      platform,
      excludeAgpl: data.excludeAgpl !== false,
      weightOverrides
    });
    return { visualStyle: resolveVisualStyleFromRecipe(recipe), recipe };
  }

  if (pickMode === "random" || pickMode === "recommend" || !data.style || data.style === "auto-diverse" || data.style === "sharp-editorial") {
    const recipe = pickRecipe({
      mode: pickMode,
      recipeId: null,
      pack,
      platform,
      excludeAgpl: data.excludeAgpl !== false,
      weightOverrides
    });
    return { visualStyle: resolveVisualStyleFromRecipe(recipe), recipe };
  }

  const recipe = getRecipeById(data.templateRecipeId) || pickRecipe({ mode: "recommend", pack, platform, excludeAgpl: data.excludeAgpl !== false, weightOverrides });
  return { visualStyle: data.style, recipe };
}

function recordTemplateOutcome(recipeId, success) {
  if (!recipeId) return;
  const weights = getSetting("template_weights", {});
  const key = `${recipeId}:${success ? "success" : "fail"}`;
  weights[key] = (weights[key] || 0) + 1;
  putSetting("template_weights", weights);
}

const app = new Hono();
await loadState();

// Build identity so /api/health tells you exactly which code is running — the dev repo and the
// installed copy under ~/Library previously drifted silently. Resolved from package.json + an
// optional BUILD_SHA env or a BUILD_SHA file written at deploy time.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function resolveBuildInfo() {
  let packageVersion = "unknown";
  try {
    packageVersion = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8")).version || packageVersion;
  } catch {}
  let sha = globalThis.process?.env?.BUILD_SHA || "";
  if (!sha) {
    try { sha = readFileSync(path.join(projectRoot, "BUILD_SHA"), "utf8").trim(); } catch {}
  }
  return { packageVersion, build: sha || "dev", startedAt: new Date().toISOString() };
}
const buildInfo = resolveBuildInfo();

const frontendOrigin = globalThis.process?.env?.FRONTEND_ORIGIN
  || `http://127.0.0.1:${globalThis.process?.env?.FRONTEND_PORT || 45173}`;

app.use("*", cors({
  origin: (origin) => {
    if (!origin) return origin;
    if (/^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return origin;
    return frontendOrigin;
  },
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Accept"]
}));

const exportsRoot = path.join(serverRoot, "exports");
if (!fs.existsSync(exportsRoot)) {
  fs.mkdirSync(exportsRoot, { recursive: true });
}
app.use("/exports/*", serveStatic({
  root: exportsRoot,
  rewriteRequestPath: (requestPath) => requestPath.replace(/^\/exports\/?/, "/")
}));

function envStatus(key) {
  return Boolean(globalThis.process?.env?.[key]);
}

function slotConfigured(slot) {
  return [slot.key, ...(slot.aliases || [])].some((key) => envStatus(key));
}

function configuredProviders() {
  return {
    research: {
      tavily: envStatus("TAVILY_API_KEY"),
      firecrawl: envStatus("FIRECRAWL_API_KEY"),
      jina: envStatus("JINA_API_KEY")
    },
    analytics: {
      posthog: envStatus("POSTHOG_API_KEY") || envStatus("VITE_POSTHOG_KEY")
    },
    database: {
      postgres: envStatus("DATABASE_URL"),
      supabase: envStatus("SUPABASE_SECRET_KEY") || envStatus("SUPABASE_SERVICE_ROLE_KEY"),
      neonRest: envStatus("NEON_REST_URL")
    },
    assets: {
      image: envStatus("IMAGE_GENERATION_API"),
      video: envStatus("VIDEO_RENDER_API"),
      creativeText: creativeModelConfigured()
    }
  };
}

function jsonError(c, status, message, details) {
  return c.json({ ok: false, message, details }, status);
}

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    service: "agent-studio-bff",
    version: "0.4",
    packageVersion: buildInfo.packageVersion,
    build: buildInfo.build,
    startedAt: buildInfo.startedAt,
    apiSlots: apiSlots.map((slot) => ({
      key: slot.key,
      name: slot.name,
      required: slot.status === "必需",
      configured: slotConfigured(slot),
      aliases: slot.aliases || []
    })),
    providers: configuredProviders(),
    productModes: ["factory", "agent-os"],
    factory: {
      enabled: true,
      endpoints: ["GET /api/factory/config", "POST /api/factory/estimate", "POST /api/factory/generate", "GET /api/factory/jobs"],
      modelGateway: modelGatewayStatus()
    },
    billing: {
      mode: "stub",
      plans: CREDIT_PLANS.map((plan) => ({ id: plan.id, name: plan.name, monthlyCredits: plan.monthlyCredits }))
    },
    credits: {
      mode: "ledger-stub",
      defaultTrialCredits: 1000
    },
    videoRender: {
      defaultBackend: globalThis.process?.env?.VIDEO_RENDER_BACKEND || "local",
      hyperframesDependency: true,
      fallbackToLocal: globalThis.process?.env?.HYPERFRAMES_STRICT !== "true"
    },
    policy: {
      defaultMode: "draft",
      finalPublishRequiresExplicitMode: true,
      agentCanPublishWhenModeExplicit: true,
      maxDraftsPerRun: 8,
      traceRequired: true,
      screenshotRequired: true,
      loggedInBrowserOnly: true
    },
    autopilot: {
      integratedScheduler: true,
      dailySlots: ["08:00-09:00 image", "12:00-13:00 html-video", "20:00-21:00 image"],
      browserExecution: "codex-pending-task-queue"
    },
    engagement: {
      integratedScheduler: true,
      scopes: ["xhs_comments", "xhs_messages"],
      browserExecution: "codex-pending-task-queue",
      commentAutoReply: "low-risk-only",
      messageAutoReply: "draft-by-default",
      highRiskRequiresHuman: true
    },
    visualLibrary: {
      sourceCount: templateSourceCatalog.length,
      styles: Object.keys(visualStyleCatalog),
      defaultStyle: "auto-diverse"
    },
    series: {
      enabled: true,
      continuity: "series_profile_plus_episode_memory",
      contentKinds: ["standalone", "series"],
      autopilotQueue: true,
      xhsDiscussionPrompt: true
    }
  });
});

app.get("/api/factory/config", async (c) => {
  const ctx = resolveRequestContext(c);
  return c.json(getFactoryConfig(ctx));
});

app.post("/api/factory/estimate", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = FactoryEstimateRequestSchema.safeParse(raw || {});
  if (!parsed.success) return jsonError(c, 400, "Invalid factory estimate request", parsed.error.flatten());
  const ctx = resolveRequestContext(c, parsed.data);
  return c.json({ ...estimateFactoryJob(parsed.data), context: { workspaceId: ctx.workspaceId, userId: ctx.userId } });
});

app.post("/api/factory/generate", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = FactoryGenerateRequestSchema.safeParse(raw || {});
  if (!parsed.success) return jsonError(c, 400, "Invalid factory generate request", parsed.error.flatten());
  const ctx = resolveRequestContext(c, parsed.data);
  const result = await generateFactoryJob(ctx, parsed.data);
  return c.json(result, result.ok ? 200 : 500);
});

app.get("/api/factory/jobs", async (c) => {
  const ctx = resolveRequestContext(c);
  return c.json(getFactoryJobs(ctx, Number(c.req.query("limit") || 30)));
});

app.get("/api/factory/jobs/:id", async (c) => {
  const ctx = resolveRequestContext(c);
  const result = getFactoryJob(ctx, c.req.param("id"));
  return c.json(result, result.ok ? 200 : 404);
});

app.get("/api/billing/plans", (c) => {
  return c.json({ ok: true, mode: "stub", plans: CREDIT_PLANS });
});

app.get("/api/billing/credits", (c) => {
  const ctx = resolveRequestContext(c);
  return c.json(getBillingCredits(ctx));
});

app.get("/api/billing/usage", (c) => {
  const ctx = resolveRequestContext(c);
  return c.json(getBillingCredits(ctx));
});

app.get("/api/autopilot", async (c) => {
  return c.json(await getAutopilotSnapshot());
});

app.post("/api/autopilot/settings", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = AutopilotSettingsRequestSchema.safeParse(raw || {});
  if (!parsed.success) return jsonError(c, 400, "Invalid autopilot settings request", parsed.error.flatten());

  return c.json(await saveAutopilotSettings(parsed.data));
});

app.post("/api/autopilot/topics", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = AutopilotTopicRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid autopilot topic request", parsed.error.flatten());

  try {
    return c.json(await addAutopilotTopic(parsed.data));
  } catch (error) {
    return jsonError(c, 400, error.message || "Invalid autopilot topic");
  }
});

app.post("/api/autopilot/topics/:id", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = AutopilotTopicUpdateSchema.safeParse(raw || {});
  if (!parsed.success) return jsonError(c, 400, "Invalid autopilot topic update", parsed.error.flatten());

  const topic = await updateAutopilotTopic(c.req.param("id"), parsed.data);
  if (!topic) return jsonError(c, 404, "Autopilot topic not found");
  return c.json(await getAutopilotSnapshot({ ensurePlan: false }));
});

app.post("/api/autopilot/plan/today", async (c) => {
  const plan = await ensureTodayPlan(new Date());
  return c.json({ ok: true, plan, snapshot: await getAutopilotSnapshot({ ensurePlan: false }) });
});

app.post("/api/autopilot/tick", async (c) => {
  return c.json(await autopilotTick(new Date()));
});

app.post("/api/autopilot/plans/clear", async (c) => {
  return c.json({ ok: true, snapshot: await clearAutopilotPlans() });
});

app.post("/api/autopilot/slots/:id/queue", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const slot = await queueAutopilotSlot(c.req.param("id"), { force: Boolean(body.force) });
    return c.json({ ok: true, slot, snapshot: await getAutopilotSnapshot({ ensurePlan: false }) });
  } catch (error) {
    return jsonError(c, 400, "Autopilot slot queue failed", error.message || String(error));
  }
});

app.get("/api/engagement", async (c) => {
  return c.json(await getEngagementSnapshot());
});

app.post("/api/engagement/settings", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = EngagementSettingsRequestSchema.safeParse(raw || {});
  if (!parsed.success) return jsonError(c, 400, "Invalid engagement settings request", parsed.error.flatten());

  return c.json(await saveEngagementSettings(parsed.data));
});

app.post("/api/engagement/check-now", async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = EngagementCheckRequestSchema.safeParse(raw || {});
  if (!parsed.success) return jsonError(c, 400, "Invalid engagement check request", parsed.error.flatten());

  try {
    return c.json(await queueEngagementCheck(parsed.data));
  } catch (error) {
    return jsonError(c, 400, "Engagement check queue failed", error.message || String(error));
  }
});

app.post("/api/engagement/record", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = EngagementRecordRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid engagement record request", parsed.error.flatten());

  return c.json(await recordEngagementResult(parsed.data));
});

app.get("/api/series", (c) => {
  return c.json(getSeriesSnapshot());
});

app.post("/api/series", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = SeriesCreateRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid series create request", parsed.error.flatten());

  try {
    return c.json(await createSeries(parsed.data));
  } catch (error) {
    return jsonError(c, 400, "Series create failed", error.message || String(error));
  }
});

app.post("/api/series/:id", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = SeriesUpdateRequestSchema.safeParse(raw || {});
  if (!parsed.success) return jsonError(c, 400, "Invalid series update request", parsed.error.flatten());

  try {
    return c.json(await saveSeries(c.req.param("id"), parsed.data));
  } catch (error) {
    return jsonError(c, 404, "Series update failed", error.message || String(error));
  }
});

app.post("/api/series/:id/episodes", async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = SeriesEpisodeRequestSchema.safeParse(raw || {});
  if (!parsed.success) return jsonError(c, 400, "Invalid series episode request", parsed.error.flatten());

  try {
    return c.json(await addSeriesEpisode(c.req.param("id"), parsed.data));
  } catch (error) {
    return jsonError(c, 400, "Series episode create failed", error.message || String(error));
  }
});

app.post("/api/series/:id/episodes/:episodeId/queue", async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = SeriesEpisodeQueueRequestSchema.safeParse(raw || {});
  if (!parsed.success) return jsonError(c, 400, "Invalid series episode queue request", parsed.error.flatten());

  try {
    return c.json(await queueSeriesEpisode(c.req.param("id"), c.req.param("episodeId"), parsed.data));
  } catch (error) {
    return jsonError(c, 400, "Series episode queue failed", error.message || String(error));
  }
});

// Generate the pack with the real creative model when configured, falling back to the
// deterministic local pack on any error/timeout so generation never hard-fails.
async function buildPackWithCreative(input, generation) {
  let creative = null;
  let creativeError = null;
  if (creativeModelConfigured()) {
    try {
      creative = await generateCreativeContent({
        topic: input.topic,
        direction: input.direction,
        tone: input.tone,
        extraContext: input.extraContext
      });
    } catch (error) {
      creativeError = error?.message || String(error);
    }
  }
  const pack = buildPack(input.topic, input.direction, input.tone, generation, input.extraContext, { creative });
  const source = creative ? "creative-text-model" : creativeModelConfigured() ? "local-pack-model-fallback" : "local-pack";
  return { pack, source, creativeError, modelUsed: Boolean(creative) };
}

app.post("/api/generate", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = GenerateRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid generate request", parsed.error.flatten());

  const input = parsed.data;
  const { pack, source, creativeError } = await buildPackWithCreative(input, input.generation);
  const systemPrompt = createSystemPrompt(input);

  if (!input.stream && !c.req.header("accept")?.includes("text/event-stream")) {
    return c.json({ ok: true, source, creativeError, systemPrompt, pack });
  }

  return streamSSE(c, async (stream) => {
    for (let index = 0; index < agentStages.length; index += 1) {
      await stream.writeSSE({
        event: "stage",
        data: JSON.stringify({ index, stage: agentStages[index], source })
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    await stream.writeSSE({ event: "prompt", data: JSON.stringify({ systemPrompt }) });
    await stream.writeSSE({ event: "pack", data: JSON.stringify(pack) });
    await stream.writeSSE({ event: "done", data: JSON.stringify({ ok: true, source, creativeError }) });
  });
});

app.post("/api/research", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const topic = String(body.topic || "AI Agent 自动化自媒体").trim();
  return c.json({
    ok: true,
    topic,
    candidates: [
      { score: 94, angle: `${topic} 的反常识误区`, source: "trend-radar-placeholder" },
      { score: 88, angle: `${topic} 的 3 步执行清单`, source: "comment-pool-placeholder" },
      { score: 82, angle: `竞品都在讲 ${topic}，但漏掉了什么`, source: "competitor-mirror-placeholder" }
    ],
    nextConnector: "TREND_SOURCE_API"
  });
});

app.post("/api/research/collect", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = ResearchCollectRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid research collect request", parsed.error.flatten());

  const collected = await collectResearchSources(parsed.data);
  const sourceItems = buildSourceItems({ ...parsed.data, sources: collected.providerSources });
  return c.json({
    ok: true,
    connector: collected.connector,
    providerErrors: collected.errors,
    sourceItems
  });
});

app.post("/api/research/brief", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = ResearchBriefRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid research brief request", parsed.error.flatten());

  return c.json({
    ok: true,
    brief: buildResearchBrief(parsed.data)
  });
});

app.post("/api/research/topics", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = ResearchTopicsRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid research topics request", parsed.error.flatten());

  const brief = parsed.data.brief || buildResearchBrief({ topic: parsed.data.topic || "AI Agent 自动化自媒体" });
  return c.json({
    ok: true,
    topics: buildTopicCandidates({ brief, limit: parsed.data.limit })
  });
});

app.get("/api/research/sources", (c) => {
  const topic = c.req.query("topic") || "AI Agent 自动化自媒体";
  return c.json({
    ok: true,
    sourceItems: buildSourceItems({ topic })
  });
});

app.post("/api/assets/visual-plan", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = VisualPlanRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid visual plan request", parsed.error.flatten());

  return c.json({
    ok: true,
    plan: buildVisualPlan(parsed.data.pack, parsed.data.platform, parsed.data.intent, parsed.data)
  });
});

app.get("/api/assets/style-library", (c) => {
  return c.json({
    ok: true,
    defaultStyle: "auto-diverse",
    styles: visualStyleCatalog,
    sources: templateSourceCatalog,
    repository: mergedTemplateRepository
  });
});

app.get("/api/templates/registry", (c) => {
  const platform = c.req.query("platform") || "xhs";
  const excludeAgpl = c.req.query("excludeAgpl") !== "false";
  const recipes = filterRecipes({ platform, excludeAgpl, pickableOnly: true });
  return c.json({
    ok: true,
    version: "1.0.0",
    pickModes: PICK_MODES,
    platform,
    excludeAgpl,
    recipes,
    total: loadRecipeRegistry().length
  });
});

app.post("/api/templates/pick", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const pack = raw?.pack;
  const platform = raw?.platform || "xhs";
  if (!pack?.id) return jsonError(c, 400, "pack required");
  const { visualStyle, recipe } = resolveExportStyle(raw || {}, pack, platform);
  return c.json({ ok: true, visualStyle, recipe });
});

app.post("/api/templates/report", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const recipeId = raw?.recipeId;
  const success = Boolean(raw?.success);
  if (!recipeId) return jsonError(c, 400, "recipeId required");
  recordTemplateOutcome(recipeId, success);
  return c.json({ ok: true, recipeId, success });
});

app.post("/api/templates/lint", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const html = raw?.html;
  if (!html) return jsonError(c, 400, "html required");
  const result = lintVisualHtml(html, {
    minBodyPx: raw?.minBodyPx ?? 28,
    minTextChars: raw?.minTextChars ?? 12
  });
  return c.json({ ok: result.ok, ...result });
});

app.post("/api/assets/cover", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = VisualPlanRequestSchema.safeParse(raw?.pack ? raw : { pack: raw, platform: raw?.platform });
  if (!parsed.success) return jsonError(c, 400, "Invalid cover request", parsed.error.flatten());

  const { visualStyle, recipe } = resolveExportStyle(parsed.data, parsed.data.pack, parsed.data.platform);
  const plan = buildVisualPlan(parsed.data.pack, parsed.data.platform, "cover", { ...parsed.data, style: visualStyle });
  const html = renderSatoriLikeCoverHtml(parsed.data.pack, plan);
  const lint = lintVisualHtml(html, { minBodyPx: recipe?.typography?.minBodyPx ?? 28 });
  if (!lint.ok) {
    return c.json({ ok: false, status: "lint_failed", lint, plan }, 422);
  }
  const size = visualSize(plan.ratio);
  const result = await exportVisualPng({
    id: parsed.data.pack.id,
    category: "covers",
    html,
    fileName: `${parsed.data.platform}-cover`,
    viewport: { width: size.w, height: size.h }
  });
  recordTemplateOutcome(recipe?.id, true);
  return c.json({ ok: true, type: "cover", engine: "satori-compatible", ratio: plan.ratio, platform: parsed.data.platform, recipe, ...result });
});

app.post("/api/assets/info-card", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = VisualPlanRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid info-card request", parsed.error.flatten());

  const { visualStyle, recipe } = resolveExportStyle(parsed.data, parsed.data.pack, parsed.data.platform);
  const plan = buildVisualPlan(parsed.data.pack, parsed.data.platform, "info-card", { ...parsed.data, style: visualStyle });
  const html = renderInfoCardHtml(parsed.data.pack, plan);
  const size = visualSize(plan.ratio);
  const result = await exportVisualPng({
    id: parsed.data.pack.id,
    category: "info-cards",
    html,
    fileName: `${parsed.data.platform}-info-card`,
    viewport: { width: size.w, height: size.h }
  });
  recordTemplateOutcome(recipe?.id, true);
  return c.json({ ok: true, type: "info-card", engine: "satori-compatible", ratio: plan.ratio, platform: parsed.data.platform, recipe, ...result });
});

app.post("/api/assets/infographic", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = VisualPlanRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid infographic request", parsed.error.flatten());

  const { visualStyle, recipe } = resolveExportStyle(parsed.data, parsed.data.pack, parsed.data.platform);
  const plan = buildVisualPlan(parsed.data.pack, parsed.data.platform, "infographic", { ...parsed.data, style: visualStyle });
  const html = renderInfographicHtml(parsed.data.pack, plan);
  const size = visualSize(plan.ratio);
  const result = await exportVisualPng({
    id: parsed.data.pack.id,
    category: "infographics",
    html,
    fileName: `${parsed.data.platform}-infographic`,
    viewport: { width: size.w, height: size.h }
  });
  recordTemplateOutcome(recipe?.id, true);
  return c.json({ ok: true, type: "infographic", engine: "html-infographic", ratio: plan.ratio, platform: parsed.data.platform, recipe, ...result });
});

app.post("/api/assets/xhs-carousel", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = VisualPlanRequestSchema.safeParse({ ...raw, platform: "xhs", intent: "xhs-carousel", ratio: "3:4" });
  if (!parsed.success) return jsonError(c, 400, "Invalid xhs carousel request", parsed.error.flatten());

  const { visualStyle, recipe } = resolveExportStyle(parsed.data, parsed.data.pack, "xhs");
  const plan = buildVisualPlan(parsed.data.pack, "xhs", "xhs-carousel", { ...parsed.data, ratio: "3:4", style: visualStyle });
  let creativePlan = null;
  try {
    creativePlan = await planXhsCarouselWithCreativeModel({ pack: parsed.data.pack, style: plan.style });
  } catch (error) {
    creativePlan = { error: error.message || String(error) };
  }
  const pack = creativePlan?.cards ? { ...parsed.data.pack, xhsCarouselPlan: creativePlan } : parsed.data.pack;
  const html = renderXhsCarouselHtml(pack, plan);
  const planner = creativePlan?.cards ? "creative-text-model" : "local-fallback";
  let result;
  try {
    result = await exportXhsCarouselPng({
      pack,
      platform: "xhs",
      html,
      viewport: visualSize("3:4")
    });
  } catch (error) {
    recordTemplateOutcome(recipe?.id, false);
    // Layout QA threw (e.g. empty_center / safe_area / product-shot rules). Return a structured
    // 422 with the per-page violations so the caller can adjust copy/assets or relax the check,
    // instead of crashing with an opaque 500.
    const detail = error?.message || String(error);
    let checks = null;
    const match = detail.match(/\[.*\]/s);
    if (match) {
      try { checks = JSON.parse(match[0]); } catch { checks = null; }
    }
    return c.json({
      ok: false,
      type: "xhs-carousel",
      status: "layout_check_failed",
      message: "小红书 carousel 版式校验未通过；可调整文案/素材，或放宽校验后重试。",
      planner,
      checks,
      detail,
      creativePlan,
      plan,
      recipe
    }, 422);
  }
  recordTemplateOutcome(recipe?.id, true);
  return c.json({ ok: true, type: "xhs-carousel", engine: "html-css-playwright", planner, creativePlan, ratio: "3:4", platform: "xhs", plan, recipe, ...result });
});

app.post("/api/assets/chart", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = ChartAssetRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid chart request", parsed.error.flatten());

  const plan = buildVisualPlan(parsed.data.pack, parsed.data.platform, "chart", parsed.data);
  const chart = buildChartSpec(parsed.data.pack, parsed.data);
  const html = renderChartHtml(chart, plan);
  const size = visualSize(plan.ratio);
  const result = await exportVisualPng({
    id: parsed.data.pack.id,
    category: "charts",
    html,
    fileName: `${parsed.data.platform}-chart`,
    viewport: { width: size.w, height: size.h }
  });
  return c.json({ ok: true, type: "chart", engine: "chartjs-compatible", chart, ratio: plan.ratio, platform: parsed.data.platform, ...result });
});

app.post("/api/assets/motion-html", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = VisualPlanRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid motion-html request", parsed.error.flatten());

  const plan = buildVisualPlan(parsed.data.pack, parsed.data.platform, "motion-video", { ...parsed.data, ratio: "9:16" });
  const html = renderMotionHtml(parsed.data.pack, plan);
  const result = await exportMotionPreview({ pack: parsed.data.pack, platform: parsed.data.platform, html });
  return c.json({ ok: true, type: "motion_video", engine: "hyperframes-style", status: "preview_ready", ratio: "9:16", platform: parsed.data.platform, ...result });
});

app.post("/api/assets/explain-animation", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = VisualPlanRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid explain-animation request", parsed.error.flatten());

  return c.json({ ok: true, manifest: buildExplainAnimationManifest(parsed.data.pack, parsed.data.platform) });
});

app.post("/api/assets/react-video", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = VisualPlanRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid react-video request", parsed.error.flatten());

  return c.json({ ok: true, manifest: buildReactVideoManifest(parsed.data.pack, parsed.data.platform) });
});

app.post("/api/assets/svg-pack", async (c) => {
  const raw = await c.req.json().catch(() => null);
  if (!raw?.pack?.cards) return jsonError(c, 400, "pack.cards is required");
  return c.text(svgForPack(raw.pack), 200, { "Content-Type": "image/svg+xml; charset=utf-8" });
});

app.post("/api/assets/render-html", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = RenderHtmlRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid render html request", parsed.error.flatten());

  return c.text(renderHtmlDeck(parsed.data.pack, parsed.data.platform), 200, { "Content-Type": "text/html; charset=utf-8" });
});

app.post("/api/assets/export-png", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = RenderHtmlRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid export png request", parsed.error.flatten());

  const platform = parsed.data.platform || "xhs";
  const { visualStyle, recipe } = resolveExportStyle(parsed.data, parsed.data.pack, platform);

  try {
    if (platform === "xhs") {
      const plan = buildVisualPlan(parsed.data.pack, "xhs", "xhs-carousel", { ...parsed.data, ratio: "3:4", style: visualStyle });
      const html = renderXhsCarouselHtml(parsed.data.pack, plan);
      const lint = lintVisualHtml(html, { minBodyPx: recipe?.typography?.minBodyPx ?? 28 });
      if (!lint.ok) {
        recordTemplateOutcome(recipe?.id, false);
        return c.json({ ok: false, status: "lint_failed", lint, recipe, plan }, 422);
      }
      const result = await exportXhsCarouselPng({ pack: parsed.data.pack, platform: "xhs", html });
      recordTemplateOutcome(recipe?.id, true);
      return c.json({
        ok: true,
        status: "exported",
        renderer: "html-css-playwright",
        type: "xhs-carousel",
        recipe,
        plan,
        htmlPath: result.htmlPath,
        files: result.files
      });
    }

    const html = renderHtmlDeck(parsed.data.pack, platform);
    const lint = lintVisualHtml(html, { profile: "legacy-deck", minTextChars: 8 });
    if (!lint.ok) {
      recordTemplateOutcome(recipe?.id, false);
      return c.json({ ok: false, status: "lint_failed", lint, recipe }, 422);
    }
    const result = await exportDeckPng({ pack: parsed.data.pack, platform, html });
    recordTemplateOutcome(recipe?.id, true);
    return c.json({
      ok: true,
      status: "exported",
      renderer: "html-css-playwright",
      type: "legacy-deck",
      recipe,
      htmlPath: result.htmlPath,
      files: result.files
    });
  } catch (error) {
    recordTemplateOutcome(recipe?.id, false);
    return c.json({ ok: false, status: "export_failed", message: error?.message || String(error), recipe }, 500);
  }
});

app.post("/api/smoke/graphic", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = GraphicSmokeRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid graphic smoke request", parsed.error.flatten());

  const input = parsed.data;
  const { pack, source: generationSource } = await buildPackWithCreative(input, Date.now());
  const { visualStyle, recipe } = resolveExportStyle(input, pack, input.platform);
  const visualPlan = buildVisualPlan(pack, input.platform, "auto", { ratio: "3:4", style: visualStyle });
  const coverHtml = renderSatoriLikeCoverHtml(pack, visualPlan);
  const infoHtml = renderInfoCardHtml(pack, visualPlan);
  const chart = buildChartSpec(pack);
  const chartHtml = renderChartHtml(chart, visualPlan);
  const infographicHtml = renderInfographicHtml(pack, visualPlan);
  const motionHtml = renderMotionHtml(pack, visualPlan);
  const cover = await exportVisualPng({ id: pack.id, category: "covers", html: coverHtml, fileName: `${input.platform}-cover`, viewport: visualSize(visualPlan.ratio) });
  const infoCard = await exportVisualPng({ id: pack.id, category: "info-cards", html: infoHtml, fileName: `${input.platform}-info-card`, viewport: visualSize(visualPlan.ratio) });
  const infographic = await exportVisualPng({ id: pack.id, category: "infographics", html: infographicHtml, fileName: `${input.platform}-infographic`, viewport: visualSize(visualPlan.ratio) });
  const chartAsset = await exportVisualPng({ id: pack.id, category: "charts", html: chartHtml, fileName: `${input.platform}-chart`, viewport: visualSize(visualPlan.ratio) });
  const motionPreview = await exportMotionPreview({ pack, platform: input.platform, html: motionHtml });
  const assets = {
    renderer: "visual-engine-pack",
    plan: visualPlan,
    recipe,
    cover,
    infoCard,
    infographic,
    chart: { ...chartAsset, chart },
    motionPreview,
    files: [cover.pngPath, infoCard.pngPath, infographic.pngPath, chartAsset.pngPath, motionPreview.thumbnailPath].filter(Boolean)
  };
  const runbook = buildAgentRunbook({
    pack,
    platforms: [input.platform],
    mode: input.mode,
    scheduledAt: input.scheduledAt,
    accountLabel: input.accountLabel,
    localAssets: assets.files
  });
  const now = new Date().toISOString();

  await putAgentRun({
    id: runbook.id,
    run_type: "graphic_smoke_test",
    status: "pending",
    input_json: input,
    output_json: { pack, assets, runbook },
    started_at: now,
    completed_at: null
  });

  for (const task of runbook.tasks) {
    await putCodexTask({
      id: task.id,
      type: "publish",
      platform: task.platform,
      mode: task.mode,
      status: "pending",
      runbook_json: task,
      result_json: null,
      screenshots: [],
      trace: null,
      created_at: now,
      updated_at: now
    });
    // Trigger native Playwright execution immediately
    maybeExecutePlaywright(task.id);
  }

  return c.json({
    ok: true,
    status: "queued_for_execution",
    browserExecuted: false,
    generationSource,
    next: "Run npm run codex:poll or let Codex app consume GET /api/codex/pending-tasks.",
    pack,
    assets,
    runbook
  });
});

app.post("/api/assets/export-video", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = VisualPlanRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid export video request", parsed.error.flatten());

  const plan = buildVisualPlan(parsed.data.pack, parsed.data.platform, "motion-video", { ...parsed.data, ratio: "9:16" });
  const html = renderMotionHtml(parsed.data.pack, plan);
  const video = await exportMotionVideo({
    pack: parsed.data.pack,
    platform: parsed.data.platform,
    html,
    duration: parsed.data.duration,
    fps: parsed.data.fps,
    backend: parsed.data.renderBackend
  });
  return c.json({
    ok: true,
    status: "exported",
    renderer: video.renderer || "agent-studio-local",
    mp4Exported: true,
    ...video
  });
});

app.post("/api/publish/draft", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = DraftRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid draft request", parsed.error.flatten());

  const { pack, platform } = parsed.data;
  const meta = platformMeta[platform];
  return c.json({
    ok: true,
    status: "prepared",
    guardrail: "draft_mode_no_final_publish",
    task: buildPlatformBrowserTask({ pack, platform, mode: "draft" }),
    legacyTask: {
      id: `draft-${pack.id}-${platform}`,
      platform,
      platformName: meta.name,
      openUrl: meta.openUrl,
      automationMode: meta.automation,
      copy: pack.platformCopy[platform],
      instruction: pack.automationPrompt,
      stopCondition: "stop_on_final_confirmation_page",
      traceRequired: true
    }
  });
});

app.get("/api/agent/manifest", (c) => {
  return c.json({
    ok: true,
    name: "Agent Studio Content OS",
    version: "0.4-agent-first",
    audience: "local Mac agents, not human operators",
    runtime: {
      kind: "mac-local-browser",
      requiresLoggedInAccounts: true,
      browserAutomation: envStatus("BROWSER_AGENT_RUNTIME") ? globalThis.process.env.BROWSER_AGENT_RUNTIME : "codex-app-local"
    },
    capabilities: [
      "generate_platform_content_pack",
      "prepare_browser_publish_tasks",
      "publish_or_schedule_with_explicit_mode",
      "plan_series_content_with_continuity_and_unified_visual_style",
      "distinguish_standalone_vs_series_content_with_explicit_contentKind",
      "maintain_comments_and_extract_topic_signals",
      "monitor_xhs_comments_and_messages_with_browser_reply_policy",
      "return_trace_for_every_browser_action"
    ],
    endpoints: {
      generate: "POST /api/generate",
      researchCollect: "POST /api/research/collect",
      researchBrief: "POST /api/research/brief",
      researchTopics: "POST /api/research/topics",
      styleLibrary: "GET /api/assets/style-library",
      renderHtml: "POST /api/assets/render-html",
      visualPlan: "POST /api/assets/visual-plan",
      cover: "POST /api/assets/cover",
      infoCard: "POST /api/assets/info-card",
      chart: "POST /api/assets/chart",
      motionHtml: "POST /api/assets/motion-html",
      explainAnimation: "POST /api/assets/explain-animation",
      reactVideo: "POST /api/assets/react-video",
      exportPng: "POST /api/assets/export-png",
      graphicSmoke: "POST /api/smoke/graphic",
      draft: "POST /api/publish/draft",
      runbook: "POST /api/agent/runbook",
      browserTask: "POST /api/agent/browser-task",
      trace: "POST /api/agent/trace",
      pendingCodexTasks: "GET /api/codex/pending-tasks",
      autopilot: "GET /api/autopilot",
      autopilotSettings: "POST /api/autopilot/settings",
      autopilotTopics: "POST /api/autopilot/topics",
      autopilotTick: "POST /api/autopilot/tick",
      autopilotSlotQueue: "POST /api/autopilot/slots/:id/queue",
      series: "GET /api/series",
      seriesCreate: "POST /api/series",
      seriesUpdate: "POST /api/series/:id",
      seriesEpisode: "POST /api/series/:id/episodes",
      seriesEpisodeQueue: "POST /api/series/:id/episodes/:episodeId/queue",
      engagement: "GET /api/engagement",
      engagementSettings: "POST /api/engagement/settings",
      engagementCheckNow: "POST /api/engagement/check-now",
      engagementRecord: "POST /api/engagement/record",
      comments: "POST /api/agent/comments",
      commentsRead: "POST /api/agent/comments/read",
      commentsReplyDraft: "POST /api/agent/comments/reply-draft",
      commentsMaintain: "POST /api/agent/comments/maintain",
      analytics: "GET /api/analytics/:id",
      analyticsCollect: "POST /api/analytics/collect",
      analyticsBrief: "POST /api/analytics/brief",
      analyticsLearning: "POST /api/analytics/learning"
    },
    platforms: Object.entries(platformMeta).map(([id, meta]) => ({
      id,
      name: meta.name,
      openUrl: meta.openUrl,
      automation: meta.automation,
      format: meta.format
    })),
    safety: {
      authorizedAccountsOnly: true,
      noRiskControlBypass: true,
      noBulkDuplicatePosting: true,
      traceRequired: true,
      explicitPublishModeRequired: true
    }
  });
});

app.post("/api/agent/runbook", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = AgentRunRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid agent runbook request", parsed.error.flatten());

  const { pack, platforms, mode, scheduledAt, accountLabel, localAssets } = parsed.data;
  const runbook = buildAgentRunbook({ pack, platforms, mode, scheduledAt, accountLabel, localAssets });
  const now = new Date().toISOString();
  await putAgentRun({
    id: runbook.id,
    run_type: "publish_runbook",
    status: "pending",
    input_json: parsed.data,
    output_json: runbook,
    started_at: now,
    completed_at: null
  });
  for (const task of runbook.tasks) {
    await putCodexTask({
      id: task.id,
      type: "publish",
      platform: task.platform,
      mode: task.mode,
      status: "pending",
      runbook_json: task,
      result_json: null,
      screenshots: [],
      trace: null,
      created_at: now,
      updated_at: now
    });
    maybeExecutePlaywright(task.id);
  }
  return c.json({
    ok: true,
    runbook
  });
});

app.post("/api/agent/comments", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = CommentMaintenanceRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid comment maintenance request", parsed.error.flatten());

  return c.json({
    ok: true,
    task: buildCommentMaintenanceTask(parsed.data)
  });
});

app.post("/api/agent/browser-task", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = BrowserTaskRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid browser task request", parsed.error.flatten());

  const task = {
    id: parsed.data.task.id || `task-${Date.now()}`,
    type: parsed.data.task.type || "browser_task",
    platform: parsed.data.task.platform || "unknown",
    mode: parsed.data.task.mode || "draft",
    status: parsed.data.status,
    runbook_json: parsed.data.task,
    result_json: null,
    screenshots: [],
    trace: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await putCodexTask(task);
  return c.json({ ok: true, task });
});

app.post("/api/agent/trace", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = TraceRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid trace request", parsed.error.flatten());

  const trace = { ...parsed.data, updated_at: new Date().toISOString() };
  await putTrace(trace);
  const task = getCodexTask(parsed.data.taskId);
  if (task) {
    await putCodexTask({
      ...task,
      status: parsed.data.status,
      result_json: trace,
      screenshots: parsed.data.screenshots,
      trace: parsed.data.trace || null,
      updated_at: trace.updated_at
    });
    if (task.autopilotSlotId) {
      const slotStatus = parsed.data.status === "completed"
        ? "published"
        : parsed.data.status === "failed"
          ? "failed"
          : parsed.data.status;
      await updateAutopilotSlot(task.autopilotSlotId, {
        status: slotStatus,
        failureReason: parsed.data.failureReason || "",
        completed_at: ["completed", "failed"].includes(parsed.data.status) ? trace.updated_at : undefined,
        postUrl: parsed.data.postUrl || parsed.data.draftUrl || ""
      });
    }
  }
  return c.json({ ok: true, trace });
});

app.get("/api/agent/runs/:id", (c) => {
  const id = c.req.param("id");
  const run = getAgentRun(id);
  if (!run) return jsonError(c, 404, "Agent run not found");
  return c.json({ ok: true, run });
});

app.post("/api/codex/runbook", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = AgentRunRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid codex runbook request", parsed.error.flatten());

  const { pack, platforms, mode, scheduledAt, accountLabel, localAssets } = parsed.data;
  const runbook = buildAgentRunbook({ pack, platforms, mode, scheduledAt, accountLabel, localAssets });
  const now = new Date().toISOString();
  await putAgentRun({
    id: runbook.id,
    run_type: "publish_runbook",
    status: "pending",
    input_json: parsed.data,
    output_json: runbook,
    started_at: now,
    completed_at: null
  });
  for (const task of runbook.tasks) {
    await putCodexTask({
      id: task.id,
      type: "publish",
      platform: task.platform,
      mode: task.mode,
      status: "pending",
      runbook_json: task,
      result_json: null,
      screenshots: [],
      trace: null,
      created_at: now,
      updated_at: now
    });
  }
  return c.json({ ok: true, runbook });
});

app.post("/api/codex/task-result", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = TraceRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid codex task-result request", parsed.error.flatten());

  const trace = { ...parsed.data, updated_at: new Date().toISOString() };
  await putTrace(trace);
  const task = getCodexTask(parsed.data.taskId);
  if (task) {
    await putCodexTask({
      ...task,
      status: parsed.data.status,
      result_json: trace,
      screenshots: parsed.data.screenshots,
      trace: parsed.data.trace || null,
      updated_at: trace.updated_at
    });
    if (task.autopilotSlotId) {
      const slotStatus = parsed.data.status === "completed"
        ? "published"
        : parsed.data.status === "failed"
          ? "failed"
          : parsed.data.status;
      await updateAutopilotSlot(task.autopilotSlotId, {
        status: slotStatus,
        failureReason: parsed.data.failureReason || "",
        completed_at: ["completed", "failed"].includes(parsed.data.status) ? trace.updated_at : undefined,
        postUrl: parsed.data.postUrl || parsed.data.draftUrl || ""
      });
    }
  }
  return c.json({ ok: true, trace });
});

app.post("/api/codex/screenshot", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const taskId = String(body.taskId || "");
  if (!taskId) return jsonError(c, 400, "taskId is required");
  const task = getCodexTask(taskId);
  if (!task) return jsonError(c, 404, "Codex task not found");
  const updatedTask = {
    ...task,
    screenshots: [...(task.screenshots || []), String(body.path || body.url || "screenshot-pending")],
    updated_at: new Date().toISOString()
  };
  await putCodexTask(updatedTask);
  return c.json({ ok: true, task: updatedTask });
});

function minutesSince(value, now = new Date()) {
  const time = value ? new Date(value).getTime() : 0;
  if (!time || Number.isNaN(time)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - time) / 60000;
}

function staleReasonForCodexTask(task, now = new Date()) {
  if (!["pending", "running"].includes(task.status)) return "";

  const autopilot = task.runbook_json?.autopilot;
  if (autopilot?.scheduledFor) {
    const staleMinutes = Number(globalThis.process?.env?.AUTOPILOT_TASK_STALE_MINUTES || 90);
    const age = minutesSince(autopilot.scheduledFor, now);
    if (age > staleMinutes) {
      return `Stale Autopilot publish task: scheduledFor ${autopilot.scheduledFor} was more than ${staleMinutes} minutes old when recovered at ${now.toISOString()}.`;
    }
  }

  if (task.engagement || task.runbook_json?.engagement) {
    const staleMinutes = Number(globalThis.process?.env?.ENGAGEMENT_TASK_STALE_MINUTES || 45);
    const age = minutesSince(task.updated_at || task.created_at, now);
    if (age > staleMinutes) {
      return `Stale engagement task: task stayed ${task.status} for more than ${staleMinutes} minutes without a browser executor result.`;
    }
  }

  if (task.type === "publish" && task.mode === "draft" && !task.autopilot && !task.runbook_json?.autopilot) {
    const staleMinutes = Number(globalThis.process?.env?.MANUAL_DRAFT_TASK_STALE_MINUTES || 12 * 60);
    const age = minutesSince(task.updated_at || task.created_at, now);
    if (age > staleMinutes) {
      return `Stale manual draft task: task stayed ${task.status} for more than ${staleMinutes} minutes and is no longer actionable.`;
    }
  }

  return "";
}

async function failCodexTask(task, failureReason, now = new Date()) {
  const updatedAt = now.toISOString();
  const trace = {
    taskId: task.id,
    status: "failed",
    platform: task.platform,
    screenshots: task.screenshots || [],
    trace: [
      ...(Array.isArray(task.trace) ? task.trace : []),
      { at: updatedAt, action: "stale_task_sweeper", detail: failureReason }
    ],
    failureReason,
    updated_at: updatedAt
  };
  await putTrace(trace);
  await putCodexTask({
    ...task,
    status: "failed",
    result_json: trace,
    screenshots: trace.screenshots,
    trace: trace.trace,
    updated_at: updatedAt
  });
  if (task.autopilotSlotId) {
    await updateAutopilotSlot(task.autopilotSlotId, {
      status: "failed",
      failureReason,
      completed_at: updatedAt,
      postUrl: ""
    });
  }
}

async function sweepStaleCodexTasks(now = new Date()) {
  const activeTasks = listCodexTasks(["pending", "running"]);
  const swept = [];
  for (const task of activeTasks) {
    const reason = staleReasonForCodexTask(task, now);
    if (!reason) continue;
    await failCodexTask(task, reason, now);
    swept.push({ id: task.id, reason });
  }
  return swept;
}

app.get("/api/codex/pending-tasks", async (c) => {
  const swept = await sweepStaleCodexTasks();
  const tasks = listCodexTasks(["pending", "running", "waiting_for_user"]);
  return c.json({ ok: true, swept, tasks });
});

app.post("/api/agent/comments/read", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = CommentMaintenanceRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid comments read request", parsed.error.flatten());
  return c.json({ ok: true, task: buildCommentMaintenanceTask(parsed.data), expectedOutput: "comments[] with author,text,intent,sentiment,risk" });
});

app.post("/api/agent/comments/reply-draft", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const comments = Array.isArray(body.comments) ? body.comments : [];
  return c.json({
    ok: true,
    replies: comments.slice(0, Number(body.maxReplies || 12)).map((comment, index) => ({
      commentId: comment.id || `comment-${index + 1}`,
      risk: /骂|骗|隐私|投资|治疗|违法/.test(String(comment.text || "")) ? "high" : "low",
      draft: `谢谢你的反馈。你提到的「${String(comment.text || "这个问题").slice(0, 40)}」很适合展开成下一期，我会补一个更具体的版本。`,
      requiresHuman: /骂|骗|隐私|投资|治疗|违法/.test(String(comment.text || ""))
    }))
  });
});

app.post("/api/agent/comments/maintain", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = CommentMaintenanceRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 400, "Invalid comments maintain request", parsed.error.flatten());
  const task = buildCommentMaintenanceTask(parsed.data);
  const now = new Date().toISOString();
  await putCodexTask({
    id: task.id,
    type: "comment",
    platform: task.platform,
    mode: "maintain",
    status: "pending",
    runbook_json: task,
    result_json: null,
    screenshots: [],
    trace: null,
    created_at: now,
    updated_at: now
  });
  return c.json({ ok: true, task });
});

app.get("/api/analytics/:id", (c) => {
  const id = c.req.param("id");
  return c.json({
    ok: true,
    publishId: id,
    snapshots: [
      { window: "4h", views: 1200, likes: 86, comments: 12, saves: 39 },
      { window: "24h", views: 8700, likes: 640, comments: 91, saves: 380 },
      { window: "72h", views: 21400, likes: 1410, comments: 230, saves: 960 }
    ],
    learning: "收藏高于点赞，说明方法型卡片更适合延展成系列。"
  });
});

app.post("/api/analytics/collect", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = AnalyticsCollectRequestSchema.safeParse(raw || {});
  if (!parsed.success) return jsonError(c, 400, "Invalid analytics collect request", parsed.error.flatten());

  const { platform, publishUrl } = parsed.data;
  const live = await collectAnalyticsSnapshots(parsed.data);
  return c.json({
    ok: true,
    connector: live.connector,
    snapshots: live.snapshots,
    providerErrors: live.errors,
    task: {
      id: `analytics-${platform}-${Date.now()}`,
      type: "browser_analytics_collect_task",
      executor: "codex-app-local",
      platform,
      openUrl: publishUrl || platformMeta[platform]?.openUrl || platformMeta.xhs.openUrl,
      requiresLoggedInBrowser: true,
      steps: ["打开创作者后台或帖子数据页", "读取阅读、点赞、收藏、评论、粉丝变化", "截图后台数据", "回传 4h/24h/72h 快照"],
      traceRequired: true,
      screenshotRequired: true,
      forbiddenActions: ["不要导出或泄露无关用户隐私", "不要绕过平台访问限制"]
    }
  });
});

app.post("/api/analytics/brief", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = AnalyticsBriefRequestSchema.safeParse(raw || {});
  if (!parsed.success) return jsonError(c, 400, "Invalid analytics brief request", parsed.error.flatten());
  const snapshots = parsed.data.snapshots;
  const totalViews = snapshots.reduce((sum, item) => sum + Number(item.views || item.count || 0), 0);
  return c.json({
    ok: true,
    brief: {
      id: `analytics-brief-${Date.now()}`,
      summary: snapshots.length ? `已基于 ${snapshots[0].provider || "analytics"} 回传数据生成复盘，窗口内观测 ${totalViews} 次事件。` : "暂无真实数据，使用示例复盘。",
      wins: snapshots.length ? ["已有真实数据回流，可把高互动来源写入下一轮选题"] : ["收藏/评论信号高于单纯点赞时，适合延展成系列内容"],
      losses: snapshots.length ? ["当前只接入站内/产品事件，平台原生点赞收藏仍需 Codex 浏览器读取"] : ["前三秒钩子弱或封面信息过密会拉低打开率"],
      nextExperiments: ["同一选题测试反常识标题 vs 执行清单标题", "把高频评论直接改成下一篇开头"]
    }
  });
});

app.post("/api/analytics/learning", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json({
    ok: true,
    learning: {
      id: `learning-${Date.now()}`,
      source_publish_id: body.publishId || null,
      learning_json: {
        keep: body.keep || ["保留强互动 CTA 和评论反哺选题"],
        change: body.change || ["减少泛泛工具清单，增加真实执行证据"],
        applyToNext: true
      },
      created_at: new Date().toISOString()
    }
  });
});

const port = Number(globalThis.process?.env?.PORT || 48787);
const frontendPort = Number(globalThis.process?.env?.FRONTEND_PORT || 45173);
const hostname = globalThis.process?.env?.BFF_HOST || globalThis.process?.env?.HOST || "127.0.0.1";
const staticRoot = globalThis.process?.env?.STATIC_ROOT || "dist";

if (globalThis.process?.env?.SERVE_STATIC !== "false") {
  app.use("/*", async (c, next) => {
    if (c.req.path.startsWith("/api")) return next();
    return serveStatic({
      root: staticRoot,
      rewriteRequestPath: (requestPath) => requestPath === "/" ? "/index.html" : requestPath
    })(c, next);
  });

  app.get("*", async (c, next) => {
    if (c.req.path.startsWith("/api")) return jsonError(c, 404, "API route not found");
    return serveStatic({ root: staticRoot, path: "index.html" })(c, next);
  });
}

startAutopilotScheduler({ tickMs: Number(globalThis.process?.env?.AUTOPILOT_TICK_MS || 60000) });
startEngagementScheduler({ tickMs: Number(globalThis.process?.env?.ENGAGEMENT_TICK_MS || 60000) });

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`Agent Studio BFF running on http://${hostname}:${info.port}`);
});

if (frontendPort && frontendPort !== port) {
  serve({ fetch: app.fetch, port: frontendPort, hostname }, (info) => {
    console.log(`Agent Studio UI running on http://${hostname}:${info.port}`);
  });
}
