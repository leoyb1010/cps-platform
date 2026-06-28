import { agentStages } from "./catalog.js";
import { buildPack } from "./contentEngine.js";

const API_BASE = import.meta.env.VITE_API_BASE || "";

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function parseSseBlock(block) {
  const lines = block.split("\n");
  let event = "message";
  const data = [];
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (!data.length) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) };
  } catch {
    return { event, data: data.join("\n") };
  }
}

export async function fetchTemplateRegistry({ platform = "xhs", excludeAgpl = true } = {}) {
  const qs = new URLSearchParams({ platform, excludeAgpl: excludeAgpl ? "true" : "false" });
  const response = await fetch(`${API_BASE}/api/templates/registry?${qs}`);
  if (!response.ok) throw new Error(`Template registry failed: ${response.status}`);
  return response.json();
}

export async function pickTemplateOnServer({ pack, platform, pickMode, templateRecipeId, excludeAgpl }) {
  return postJson("/api/templates/pick", { pack, platform, pickMode, templateRecipeId, excludeAgpl });
}

export async function reportTemplateOutcome({ recipeId, success }) {
  return postJson("/api/templates/report", { recipeId, success });
}

export async function lintTemplateHtml(html, options = {}) {
  return postJson("/api/templates/lint", { html, ...options });
}

export async function healthCheck() {
  const response = await fetch(`${API_BASE}/api/health`, { method: "GET" });
  if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
  return response.json();
}

export async function getFactoryConfig() {
  const response = await fetch(`${API_BASE}/api/factory/config`, { method: "GET" });
  if (!response.ok) throw new Error(`Factory config failed: ${response.status}`);
  return response.json();
}

export async function estimateFactoryJob(payload) {
  return postJson("/api/factory/estimate", payload);
}

export async function generateFactoryJob(payload) {
  return postJson("/api/factory/generate", { ...payload, confirmCredits: true });
}

export async function getFactoryJobs(limit = 30) {
  const response = await fetch(`${API_BASE}/api/factory/jobs?limit=${encodeURIComponent(limit)}`, { method: "GET" });
  if (!response.ok) throw new Error(`Factory jobs failed: ${response.status}`);
  return response.json();
}

export async function getCreditBalance() {
  const response = await fetch(`${API_BASE}/api/billing/credits`, { method: "GET" });
  if (!response.ok) throw new Error(`Credits failed: ${response.status}`);
  return response.json();
}

export async function getBillingPlans() {
  const response = await fetch(`${API_BASE}/api/billing/plans`, { method: "GET" });
  if (!response.ok) throw new Error(`Billing plans failed: ${response.status}`);
  return response.json();
}

export async function generatePack({ input, onEvent }) {
  try {
    const response = await fetch(`${API_BASE}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream"
      },
      body: JSON.stringify({ ...input, stream: true })
    });

    if (!response.ok || !response.body) {
      throw new Error(`Generate failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalPack = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        const parsed = parseSseBlock(block);
        if (!parsed) continue;
        onEvent?.(parsed);
        if (parsed.event === "pack") finalPack = parsed.data;
      }
    }

    if (finalPack) {
      return { pack: finalPack, source: "bff" };
    }
    throw new Error("Generate stream ended without pack");
  } catch (error) {
    for (let index = 0; index < agentStages.length; index += 1) {
      await sleep(90);
      onEvent?.({ event: "stage", data: { index, stage: agentStages[index], source: "local-fallback" } });
    }
    return {
      pack: buildPack(input.topic, input.direction, input.tone, input.generation, input.extraContext),
      source: "local-fallback",
      error: error.message
    };
  }
}

export async function createDraftTask({ pack, platform }) {
  const response = await fetch(`${API_BASE}/api/publish/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pack, platform, confirmFinalPublish: false })
  });

  if (!response.ok) {
    throw new Error(`Draft task failed: ${response.status}`);
  }
  return response.json();
}

export async function getAgentManifest() {
  const response = await fetch(`${API_BASE}/api/agent/manifest`, { method: "GET" });
  if (!response.ok) throw new Error(`Agent manifest failed: ${response.status}`);
  return response.json();
}

export async function createAgentRunbook({ pack, platforms, mode = "draft", scheduledAt = "", accountLabel = "Leo" }) {
  const response = await fetch(`${API_BASE}/api/agent/runbook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pack, platforms, mode, scheduledAt, accountLabel })
  });

  if (!response.ok) {
    throw new Error(`Agent runbook failed: ${response.status}`);
  }
  return response.json();
}

export async function createCommentMaintenanceTask({ platform, publishUrl, brandVoice, maxReplies }) {
  const response = await fetch(`${API_BASE}/api/agent/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform, publishUrl, brandVoice, maxReplies })
  });

  if (!response.ok) {
    throw new Error(`Comment task failed: ${response.status}`);
  }
  return response.json();
}

async function postJson(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response.json();
}

export async function collectResearch({ topic, platform = "web", sources = [] }) {
  return postJson("/api/research/collect", { topic, platform, sources });
}

export async function createResearchBrief({ topic, sourceItems }) {
  return postJson("/api/research/brief", { topic, sourceItems });
}

export async function createTopicCandidates({ topic, brief, limit = 5 }) {
  return postJson("/api/research/topics", { topic, brief, limit });
}

export async function renderHtmlDeckAsset({ pack, platform }) {
  const response = await fetch(`${API_BASE}/api/assets/render-html`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pack, platform })
  });
  if (!response.ok) throw new Error(`Render HTML failed: ${response.status}`);
  return response.text();
}

export async function exportPngDeck(payload) {
  return postJson("/api/assets/export-png", payload);
}

export async function createVisualPlan({ pack, platform, intent = "auto", style = "auto-diverse", ratio }) {
  return postJson("/api/assets/visual-plan", { pack, platform, intent, style, ratio });
}

function visualPayload({ pack, platform, style, ratio, pickMode, templateRecipeId, excludeAgpl, ...rest }) {
  return { pack, platform, style, ratio, pickMode, templateRecipeId, excludeAgpl, ...rest };
}

export async function generateCoverAsset(opts) {
  return postJson("/api/assets/cover", visualPayload({ ...opts, intent: "cover" }));
}

export async function generateInfoCardAsset(opts) {
  return postJson("/api/assets/info-card", visualPayload({ ...opts, intent: "info-card" }));
}

export async function generateInfographicAsset(opts) {
  return postJson("/api/assets/infographic", visualPayload({ ...opts, intent: "infographic" }));
}

export async function generateXhsCarouselAsset(opts) {
  return postJson("/api/assets/xhs-carousel", visualPayload({ ...opts, platform: "xhs", intent: "xhs-carousel", ratio: "3:4" }));
}

export async function generateChartAsset(opts) {
  return postJson("/api/assets/chart", visualPayload(opts));
}

export async function generateMotionHtmlAsset(opts) {
  return postJson("/api/assets/motion-html", visualPayload({ ...opts, intent: "motion-video", ratio: "9:16" }));
}

export async function exportVideoAsset(opts) {
  return postJson("/api/assets/export-video", visualPayload({ ...opts, intent: "motion-video", ratio: "9:16" }));
}

export async function generateExplainAnimationAsset({ pack, platform }) {
  return postJson("/api/assets/explain-animation", { pack, platform, intent: "explain-animation" });
}

export async function generateReactVideoAsset({ pack, platform }) {
  return postJson("/api/assets/react-video", { pack, platform, intent: "brand-video" });
}

export async function runGraphicSmokeTest({ topic, direction, tone, extraContext = "", platform = "xhs", mode = "draft", scheduledAt = "", accountLabel = "Leo" }) {
  return postJson("/api/smoke/graphic", { topic, direction, tone, extraContext, platform, mode, scheduledAt, accountLabel });
}

export async function listPendingCodexTasks() {
  const response = await fetch(`${API_BASE}/api/codex/pending-tasks`, { method: "GET" });
  if (!response.ok) throw new Error(`Pending tasks failed: ${response.status}`);
  return response.json();
}

export async function createCodexRunbook({ pack, platforms, mode = "draft", scheduledAt = "", accountLabel = "Leo" }) {
  return postJson("/api/codex/runbook", { pack, platforms, mode, scheduledAt, accountLabel });
}

export async function getAutopilot() {
  const response = await fetch(`${API_BASE}/api/autopilot`, { method: "GET" });
  if (!response.ok) throw new Error(`Autopilot failed: ${response.status}`);
  return response.json();
}

export async function saveAutopilotSettings(settings) {
  return postJson("/api/autopilot/settings", settings);
}

export async function addAutopilotTopic(topic) {
  return postJson("/api/autopilot/topics", topic);
}

export async function updateAutopilotTopic(id, patch) {
  return postJson(`/api/autopilot/topics/${encodeURIComponent(id)}`, patch);
}

export async function runAutopilotTick() {
  return postJson("/api/autopilot/tick", {});
}

export async function clearAutopilotPlans() {
  return postJson("/api/autopilot/plans/clear", {});
}

export async function queueAutopilotSlot(id, force = false) {
  return postJson(`/api/autopilot/slots/${encodeURIComponent(id)}/queue`, { force });
}

export async function getEngagement() {
  const response = await fetch(`${API_BASE}/api/engagement`, { method: "GET" });
  if (!response.ok) throw new Error(`Engagement failed: ${response.status}`);
  return response.json();
}

export async function saveEngagementSettings(settings) {
  return postJson("/api/engagement/settings", settings);
}

export async function queueEngagementCheck(reason = "manual") {
  return postJson("/api/engagement/check-now", { reason });
}

export async function getSeries() {
  const response = await fetch(`${API_BASE}/api/series`, { method: "GET" });
  if (!response.ok) throw new Error(`Series failed: ${response.status}`);
  return response.json();
}

export async function createSeriesProfile(profile) {
  return postJson("/api/series", profile);
}

export async function updateSeriesProfile(id, patch) {
  return postJson(`/api/series/${encodeURIComponent(id)}`, patch);
}

export async function addSeriesEpisode(id, episode) {
  return postJson(`/api/series/${encodeURIComponent(id)}/episodes`, episode);
}

export async function queueSeriesEpisode(seriesId, episodeId, options = {}) {
  return postJson(`/api/series/${encodeURIComponent(seriesId)}/episodes/${encodeURIComponent(episodeId)}/queue`, options);
}

export async function collectAnalytics({ platform, publishUrl = "" }) {
  return postJson("/api/analytics/collect", { platform, publishUrl });
}

export async function createAnalyticsBrief({ snapshots = [] }) {
  return postJson("/api/analytics/brief", { snapshots });
}

export async function saveAnalyticsLearning({ publishId, keep, change }) {
  return postJson("/api/analytics/learning", { publishId, keep, change });
}
