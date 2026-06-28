import { buildAgentRunbook, buildPack } from "../../src/lib/contentEngine.js";
import { creativeModelConfigured, generateCreativeContent } from "./creativeModel.js";
import { buildSeriesEpisodePack } from "../../src/lib/seriesEngine.js";
import { buildVisualPlan, renderInfographicHtml, renderInfoCardHtml, renderMotionHtml, renderSatoriLikeCoverHtml, visualSize } from "../../src/lib/visualEngine.js";
import { exportMotionVideo, exportVisualPng } from "./renderer.js";
import {
  DEFAULT_ACCOUNT_LABEL,
  clearAutopilotDailyPlans,
  findAutopilotSlot,
  getAutopilotPlan,
  getAutopilotState,
  getSeriesProfile,
  listAutopilotPlans,
  listCodexTasks,
  putAgentRun,
  putAutopilotPlan,
  putAutopilotSettings,
  putAutopilotTopic,
  putCodexTask,
  updateAutopilotSlot,
  updateAutopilotTopic
} from "./store.js";

// Default posting windows. These are only the fallback — the real schedule is a flexible config
// point stored in autopilot.settings.windows, so users can change times, counts, content type,
// direction and tone per slot without touching code.
export const autopilotWindows = [
  { id: "morning", label: "上午图文", start: "08:00", end: "09:00", contentType: "image", direction: "insight", tone: "balanced" },
  { id: "noon", label: "中午视频", start: "12:00", end: "13:00", contentType: "video", direction: "howto", tone: "expert" },
  { id: "evening", label: "晚间图文", start: "20:00", end: "21:00", contentType: "image", direction: "story", tone: "human" }
];

const autoTopicSeeds = [
  "Mac 本地 AI 工作流到底能替个人创作者省掉哪些重复劳动",
  "Codex 浏览器自动化为什么比平台接口模拟更适合社媒发布",
  "小红书账号自动化最容易踩的风控边界和正确做法",
  "AI 时代高配 MacBook 的真实生产力场景",
  "一个人如何用本机 Agent 跑选题、制图、发布和复盘",
  "本地长期运行的内容系统需要哪些安全开关",
  "AI 工具很多，但真正能跑起来的自动化闭环长什么样",
  "内容创作者该如何把评论区变成下一篇选题池"
];

const autopilotVisualStyles = [
  "guizang-swiss",
  "guizang-magazine",
  "baoyu-cute",
  "baoyu-fresh",
  "baoyu-warm",
  "baoyu-bold",
  "baoyu-minimal",
  "baoyu-retro",
  "baoyu-notion",
  "xhs-dense-infographic",
  "xhs-process-storyboard",
  "admin-tabler",
  "admin-sneat",
  "admin-star",
  "startbootstrap-landing",
  "html5up-editorial",
  "editorial-magazine",
  "product-ui",
  "swiss-modern",
  "kinetic-pitch"
];

const DEFAULT_AUTOPILOT_TASK_STALE_MINUTES = 90;

function autopilotTaskStaleMinutes() {
  const value = Number(globalThis.process?.env?.AUTOPILOT_TASK_STALE_MINUTES || DEFAULT_AUTOPILOT_TASK_STALE_MINUTES);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_AUTOPILOT_TASK_STALE_MINUTES;
}

export function normalizeAutopilotSettings(current = {}, patch = {}) {
  return {
    enabled: Boolean(patch.enabled ?? current.enabled ?? false),
    platform: patch.platform || current.platform || "xhs",
    mode: patch.mode || current.mode || "publish",
    accountLabel: patch.accountLabel || current.accountLabel || DEFAULT_ACCOUNT_LABEL,
    timezone: patch.timezone || current.timezone || "Asia/Shanghai",
    contentSource: patch.contentSource || current.contentSource || "manual-or-auto",
    defaultTopic: String(patch.defaultTopic ?? current.defaultTopic ?? "").slice(0, 160),
    videoDurationSeconds: Math.max(8, Number(patch.videoDurationSeconds || current.videoDurationSeconds || 14)),
    videoFps: Math.max(18, Number(patch.videoFps || current.videoFps || 24)),
    windows: normalizeWindows(patch.windows ?? current.windows)
  };
}

export function dateKeyFor(date = new Date(), timezone = "Asia/Shanghai") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function parseTime(value) {
  const [hh, mm] = String(value).split(":").map((item) => Number.parseInt(item, 10));
  return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
}

function timeLabel(minutes) {
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function normalizeTimeString(value, fallback) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hh = Math.min(23, Math.max(0, Number(match[1])));
  const mm = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function normalizeWindow(window = {}, index = 0) {
  const start = normalizeTimeString(window.start, "08:00");
  let end = normalizeTimeString(window.end, start);
  if (parseTime(end) < parseTime(start)) end = start;
  const baseId = String(window.id || `slot${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || `slot${index + 1}`;
  return {
    id: baseId,
    label: String(window.label || `发布窗口 ${index + 1}`).slice(0, 40),
    start,
    end,
    contentType: window.contentType === "video" ? "video" : "image",
    direction: String(window.direction || "insight").slice(0, 40),
    tone: String(window.tone || "balanced").slice(0, 40)
  };
}

// The schedule is user-configurable. Empty/invalid config falls back to the default windows so
// Autopilot always has a valid plan to build. Slot ids are de-duplicated because they key the
// per-day plan (`${dateKey}-${windowId}`).
export function normalizeWindows(windows) {
  if (!Array.isArray(windows) || windows.length === 0) return autopilotWindows;
  const seen = new Set();
  const cleaned = windows.slice(0, 12).map((window, index) => {
    const normalized = normalizeWindow(window, index);
    let id = normalized.id;
    let suffix = 1;
    while (seen.has(id)) id = `${normalized.id}-${suffix++}`;
    seen.add(id);
    return { ...normalized, id };
  });
  return cleaned.length ? cleaned : autopilotWindows;
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickVisualStyle(slot, seed = 0) {
  if (slot.visualStyle) return slot.visualStyle;
  const topic = `${slot.topic || ""} ${slot.extraContext || ""}`.toLowerCase();
  // Rotate among topic-appropriate skins, seeded so each generation of the same topic looks
  // different instead of always reusing one fixed template.
  const rotate = (pool) => pool[hashText(`${slot.topic}:${slot.contentType}:${seed}`) % pool.length];
  if (/(leonote|个人note|产品|工具|手搓|截图|实景|功能|操作流程)/i.test(topic)) {
    return rotate(["guizang-swiss", "baoyu-minimal", "baoyu-notion", "product-ui", "xhs-dense-infographic"]);
  }
  if (/(流程|教程|步骤|怎么做|实操|复盘)/i.test(topic)) {
    return rotate(["guizang-swiss", "baoyu-notion", "baoyu-fresh", "xhs-process-storyboard", "guizang-magazine"]);
  }
  if (/(信息图|高密度|框架|地图|清单|对比)/i.test(topic)) {
    return rotate(["guizang-swiss", "baoyu-notion", "baoyu-bold", "xhs-dense-infographic", "swiss-modern"]);
  }
  if (/(避坑|坑|风险|警惕|注意|不能|别|重要|必看)/i.test(topic)) {
    return rotate(["baoyu-bold", "guizang-swiss", "baoyu-minimal"]);
  }
  if (/(生活|健康|日常|情绪|温暖|自然|习惯|自我)/i.test(topic)) {
    return rotate(["baoyu-fresh", "baoyu-warm", "baoyu-cute", "guizang-magazine"]);
  }
  return rotate(autopilotVisualStyles);
}

function normalizeContentKind(record = {}) {
  return record.contentKind === "series" ? "series" : "standalone";
}

function publicTopic(topic = {}) {
  const contentKind = normalizeContentKind(topic);
  return {
    ...topic,
    contentKind,
    seriesId: contentKind === "series" ? topic.seriesId || "" : "",
    seriesTitle: contentKind === "series" ? topic.seriesTitle || "" : "",
    seriesEpisodeId: contentKind === "series" ? topic.seriesEpisodeId || "" : "",
    seriesEpisodeIndex: contentKind === "series" ? topic.seriesEpisodeIndex || null : null,
    localAssets: Array.isArray(topic.localAssets) ? topic.localAssets : []
  };
}

function publicSlot(slot = {}) {
  const contentKind = normalizeContentKind(slot);
  return {
    ...slot,
    contentKind,
    seriesId: contentKind === "series" ? slot.seriesId || "" : "",
    seriesTitle: contentKind === "series" ? slot.seriesTitle || "" : "",
    seriesEpisodeId: contentKind === "series" ? slot.seriesEpisodeId || "" : "",
    seriesEpisodeIndex: contentKind === "series" ? slot.seriesEpisodeIndex || null : null,
    localAssets: Array.isArray(slot.localAssets) ? slot.localAssets : []
  };
}

function publicPlan(plan) {
  if (!plan) return plan;
  return {
    ...plan,
    slots: (plan.slots || []).map(publicSlot)
  };
}

async function buildPackForSlot(slot, generation) {
  if (slot.contentKind === "series" && slot.seriesId && slot.seriesEpisodeId) {
    const profile = getSeriesProfile(slot.seriesId);
    const episode = (profile?.episodes || []).find((item) => item.id === slot.seriesEpisodeId);
    if (episode?.packPreview) {
      return { ...episode.packPreview, localAssets: Array.isArray(slot.localAssets) ? slot.localAssets : [] };
    }
    if (profile && episode) {
      const previousEpisodes = (profile.episodes || [])
        .filter((item) => Number(item.index || 0) < Number(episode.index || slot.seriesEpisodeIndex || 0));
      return {
        ...buildSeriesEpisodePack({
        series: { ...profile, episodes: previousEpisodes },
        topic: episode.title || slot.topic,
        notes: episode.notes || slot.extraContext || "",
        generation
        }),
        localAssets: Array.isArray(slot.localAssets) ? slot.localAssets : []
      };
    }
  }
  // Best-effort real-model generation; falls back to the deterministic pack on any error so an
  // Autopilot slot never fails just because the model is slow or unreachable.
  let creative = null;
  if (creativeModelConfigured()) {
    try {
      creative = await generateCreativeContent({
        topic: slot.topic,
        direction: slot.direction || "insight",
        tone: slot.tone || "balanced",
        extraContext: slot.extraContext || ""
      });
    } catch {
      creative = null;
    }
  }
  return {
    ...buildPack(slot.topic, slot.direction || "insight", slot.tone || "balanced", generation, slot.extraContext || "", { creative }),
    localAssets: Array.isArray(slot.localAssets) ? slot.localAssets : []
  };
}

function seededUnit(seed) {
  return (hashText(seed) % 100000) / 100000;
}

function scheduledIso(dateKey, minuteOfDay, timezone) {
  const offset = timezone === "Asia/Shanghai" ? "+08:00" : "";
  return new Date(`${dateKey}T${timeLabel(minuteOfDay)}:00${offset}`).toISOString();
}

function slotDateKey(slot) {
  return String(slot.id || "").slice(0, 10);
}

function slotWindowEnd(slot, timezone) {
  return new Date(scheduledIso(slotDateKey(slot), parseTime(slot.window?.end || "23:59"), timezone));
}

export function slotAutoQueueCutoff(slot, timezone, staleMinutes = autopilotTaskStaleMinutes()) {
  const scheduledMs = new Date(slot.scheduledFor).getTime();
  const staleCutoffMs = Number.isFinite(scheduledMs) ? scheduledMs + staleMinutes * 60000 : 0;
  return new Date(Math.max(slotWindowEnd(slot, timezone).getTime(), staleCutoffMs));
}

export function randomTimeInWindow({ dateKey, slotId, start, end }) {
  const startMinute = parseTime(start);
  const endMinute = parseTime(end);
  const guard = endMinute - startMinute > 24 ? 6 : 0;
  const min = startMinute + guard;
  const max = Math.max(min, endMinute - guard - 1);
  const span = Math.max(1, max - min + 1);
  return min + Math.floor(seededUnit(`${dateKey}:${slotId}:${start}:${end}`) * span);
}

function pickTopic({ dateKey, slot, settings, topicQueue = [] }) {
  const manualAllowed = settings.contentSource !== "auto-only";
  const autoAllowed = settings.contentSource !== "manual-only";
  const available = topicQueue
    .filter((item) => ["queued", "locked"].includes(item.status || "queued"))
    .sort((a, b) => {
      if ((a.status || "") === "locked" && (b.status || "") !== "locked") return -1;
      if ((b.status || "") === "locked" && (a.status || "") !== "locked") return 1;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });

  if (manualAllowed && available.length) {
    const chosen = available[hashText(`${dateKey}:${slot.id}`) % available.length];
    const contentKind = chosen.contentKind === "series" ? "series" : "standalone";
    return {
      topic: chosen.title,
      topicSource: "manual",
      topicId: chosen.id,
      direction: chosen.direction || slot.direction,
      tone: chosen.tone || slot.tone,
      extraContext: chosen.notes || "",
      visualStyle: chosen.visualStyle || "",
      contentKind,
      seriesId: contentKind === "series" ? chosen.seriesId || "" : "",
      seriesTitle: contentKind === "series" ? chosen.seriesTitle || "" : "",
      seriesEpisodeId: contentKind === "series" ? chosen.seriesEpisodeId || "" : "",
      seriesEpisodeIndex: contentKind === "series" ? chosen.seriesEpisodeIndex || null : null,
      localAssets: Array.isArray(chosen.localAssets) ? chosen.localAssets : []
    };
  }

  if (!autoAllowed && settings.defaultTopic) {
    return {
      topic: settings.defaultTopic,
      topicSource: "default",
      direction: slot.direction,
      tone: slot.tone,
      extraContext: "",
      visualStyle: "",
      contentKind: "standalone",
      seriesId: "",
      seriesTitle: "",
      seriesEpisodeId: "",
      seriesEpisodeIndex: null,
      localAssets: []
    };
  }

  if (!autoAllowed) {
    // contentSource = manual-only with no queued topic and no defaultTopic: do not invent an
    // auto topic. Return a "none" marker so the scheduler skips this slot instead of silently
    // publishing generic auto content that contradicts the manual-only setting.
    return {
      topic: "",
      topicSource: "none",
      direction: slot.direction,
      tone: slot.tone,
      extraContext: "",
      visualStyle: "",
      contentKind: "standalone",
      seriesId: "",
      seriesTitle: "",
      seriesEpisodeId: "",
      seriesEpisodeIndex: null,
      localAssets: []
    };
  }

  const pool = settings.defaultTopic ? [settings.defaultTopic, ...autoTopicSeeds] : autoTopicSeeds;
  const topic = pool[hashText(`${dateKey}:${slot.id}:auto`) % pool.length];
  return {
    topic,
    topicSource: "auto",
    direction: slot.direction,
    tone: slot.tone,
    extraContext: "主题由本机 Autopilot 根据长期偏好和内容系统定位自动选择。",
    visualStyle: "",
    contentKind: "standalone",
    seriesId: "",
    seriesTitle: "",
    seriesEpisodeId: "",
    seriesEpisodeIndex: null,
    localAssets: []
  };
}

export function buildDailyPlan({ settings, dateKey, topicQueue = [], now = new Date() }) {
  const normalized = normalizeAutopilotSettings(settings);
  const createdAt = now.toISOString();
  const slots = normalized.windows.map((slot) => {
    const minute = randomTimeInWindow({ dateKey, slotId: slot.id, start: slot.start, end: slot.end });
    const topic = pickTopic({ dateKey, slot, settings: normalized, topicQueue });
    return {
      id: `${dateKey}-${slot.id}`,
      slot: slot.id,
      label: slot.label,
      platform: normalized.platform,
      accountLabel: normalized.accountLabel,
      mode: normalized.mode,
      contentType: slot.contentType,
      window: { start: slot.start, end: slot.end },
      scheduledTime: timeLabel(minute),
      scheduledFor: scheduledIso(dateKey, minute, normalized.timezone),
      status: "planned",
      topic: topic.topic,
      topicSource: topic.topicSource,
      topicId: topic.topicId || null,
      direction: topic.direction,
      tone: topic.tone,
      extraContext: topic.extraContext,
      visualStyle: topic.visualStyle || "",
      contentKind: topic.contentKind || "standalone",
      seriesId: topic.seriesId || "",
      seriesTitle: topic.seriesTitle || "",
      seriesEpisodeId: topic.seriesEpisodeId || "",
      seriesEpisodeIndex: topic.seriesEpisodeIndex || null,
      localAssets: topic.localAssets || [],
      assets: null,
      runbookId: null,
      codexTaskIds: [],
      failureReason: "",
      created_at: createdAt,
      updated_at: createdAt
    };
  });

  return {
    id: `autopilot-${dateKey}`,
    date: dateKey,
    timezone: normalized.timezone,
    enabled: normalized.enabled,
    slots,
    created_at: createdAt,
    updated_at: createdAt
  };
}

export async function ensureTodayPlan(now = new Date()) {
  const autopilot = getAutopilotState();
  const settings = normalizeAutopilotSettings(autopilot.settings);
  const dateKey = dateKeyFor(now, settings.timezone);
  const existing = getAutopilotPlan(dateKey);
  if (existing) return existing;

  const plan = buildDailyPlan({
    settings,
    dateKey,
    topicQueue: autopilot.topicQueue,
    now
  });
  await putAutopilotPlan(plan);

  for (const slot of plan.slots) {
    if (slot.topicId) {
      await updateAutopilotTopic(slot.topicId, {
        status: "planned",
        assignedSlotId: slot.id,
        assignedDate: plan.date
      });
    }
  }

  return plan;
}

export async function getAutopilotSnapshot({ ensurePlan = true } = {}) {
  const autopilot = getAutopilotState();
  const settings = normalizeAutopilotSettings(autopilot.settings);
  // On-demand mode: when Autopilot is disabled we do NOT auto-create a daily schedule. Plans only
  // appear when the user enables scheduling or generates on demand, so "no schedule" stays empty.
  const shouldEnsure = ensurePlan && settings.enabled;
  const today = shouldEnsure ? await ensureTodayPlan(new Date()) : getAutopilotPlan(dateKeyFor(new Date(), settings.timezone));
  const pendingTasks = listCodexTasks(["pending", "running", "waiting_for_user"])
    .filter((task) => task.autopilot || task.runbook_json?.autopilot);

  return {
    ok: true,
    settings,
    windows: settings.windows,
    defaultWindows: autopilotWindows,
    topicQueue: (autopilot.topicQueue || []).map(publicTopic),
    today: publicPlan(today),
    recentPlans: listAutopilotPlans(7).map(publicPlan),
    pendingTasks
  };
}

export async function clearAutopilotPlans() {
  await clearAutopilotDailyPlans();
  return getAutopilotSnapshot({ ensurePlan: false });
}

export async function saveAutopilotSettings(patch) {
  const current = getAutopilotState().settings;
  const previousWindows = JSON.stringify(normalizeWindows(current?.windows));
  const settings = normalizeAutopilotSettings(current, patch);
  await putAutopilotSettings(settings);
  const today = getAutopilotPlan(dateKeyFor(new Date(), settings.timezone));
  if (today) {
    const windowsChanged = JSON.stringify(settings.windows) !== previousWindows;
    const untouched = (today.slots || []).every((slot) => slot.status === "planned");
    if (windowsChanged && untouched) {
      // Schedule changed before anything ran today: rebuild today's plan from the new windows and
      // re-link queued topics so the new config takes effect immediately instead of next day.
      const rebuilt = buildDailyPlan({
        settings,
        dateKey: today.date,
        topicQueue: getAutopilotState().topicQueue,
        now: new Date()
      });
      await putAutopilotPlan(rebuilt);
      for (const slot of rebuilt.slots) {
        if (slot.topicId) {
          await updateAutopilotTopic(slot.topicId, { status: "planned", assignedSlotId: slot.id, assignedDate: rebuilt.date });
        }
      }
    } else {
      const now = new Date().toISOString();
      await putAutopilotPlan({
        ...today,
        enabled: settings.enabled,
        slots: (today.slots || []).map((slot) => {
          if (slot.status !== "planned") return slot;
          return {
            ...slot,
            platform: settings.platform,
            mode: settings.mode,
            accountLabel: settings.accountLabel,
            updated_at: now
          };
        }),
        updated_at: now
      });
    }
  }
  return getAutopilotSnapshot();
}

export async function addAutopilotTopic(input) {
  const now = new Date().toISOString();
  const contentKind = input.contentKind === "series" ? "series" : "standalone";
  const topic = {
    id: `topic-${hashText(`${input.title}:${now}`).toString(16)}-${Date.now()}`,
    title: String(input.title || "").trim(),
    source: input.source || "manual",
    status: input.status || "queued",
    priority: input.priority || "normal",
    direction: input.direction || "",
    tone: input.tone || "",
    visualStyle: input.visualStyle || "",
    contentKind,
    seriesId: contentKind === "series" ? input.seriesId || "" : "",
    seriesTitle: contentKind === "series" ? input.seriesTitle || "" : "",
    seriesEpisodeId: contentKind === "series" ? input.seriesEpisodeId || "" : "",
    seriesEpisodeIndex: contentKind === "series" ? input.seriesEpisodeIndex || null : null,
    localAssets: Array.isArray(input.localAssets) ? input.localAssets : [],
    notes: String(input.notes || "").slice(0, 600),
    created_at: now,
    updated_at: now
  };
  if (!topic.title) throw new Error("topic title is required");
  await putAutopilotTopic(topic);
  return getAutopilotSnapshot();
}

async function materializeSlot(slot, settings) {
  const generation = Date.now();
  const pack = await buildPackForSlot(slot, generation);
  let assets;
  const visualStyle = pickVisualStyle(slot, generation);

  if (slot.contentType === "video") {
    const plan = buildVisualPlan(pack, slot.platform, "motion-video", { ratio: "9:16", style: visualStyle });
    const html = renderMotionHtml(pack, plan);
    const video = await exportMotionVideo({
      pack,
      platform: slot.platform,
      html,
      duration: settings.videoDurationSeconds,
      fps: settings.videoFps
    });
    assets = {
      type: "video",
      renderer: video.renderer || "agent-studio-local",
      renderBackend: video.renderBackend || "local",
      requestedBackend: video.requestedBackend || video.renderBackend || "local",
      fallbackReason: video.fallbackReason || "",
      visualStyle,
      visualTemplates: plan.templates,
      templateSources: plan.templateSources,
      files: [video.videoPath, video.thumbnailPath].filter(Boolean),
      video
    };
  } else {
    const coverPlan = buildVisualPlan(pack, slot.platform, "cover", { ratio: "3:4", style: visualStyle });
    const infoPlan = buildVisualPlan(pack, slot.platform, "info-card", { ratio: "3:4", style: visualStyle });
    const infographicPlan = buildVisualPlan(pack, slot.platform, "infographic", { ratio: "3:4", style: visualStyle });
    const cover = await exportVisualPng({
      id: pack.id,
      category: "autopilot-images",
      html: renderSatoriLikeCoverHtml(pack, coverPlan),
      fileName: `${slot.platform}-${slot.id}-cover`,
      viewport: visualSize(coverPlan.ratio)
    });
    const info = await exportVisualPng({
      id: pack.id,
      category: "autopilot-images",
      html: renderInfoCardHtml(pack, infoPlan),
      fileName: `${slot.platform}-${slot.id}-info-card`,
      viewport: visualSize(infoPlan.ratio)
    });
    const infographic = await exportVisualPng({
      id: pack.id,
      category: "autopilot-images",
      html: renderInfographicHtml(pack, infographicPlan),
      fileName: `${slot.platform}-${slot.id}-infographic`,
      viewport: visualSize(infographicPlan.ratio)
    });
    assets = {
      type: "image",
      renderer: "visual-style-library",
      visualStyle,
      visualTemplates: {
        ...coverPlan.templates,
        ...infoPlan.templates,
        ...infographicPlan.templates
      },
      templateSources: coverPlan.templateSources,
      files: [cover.pngPath, info.pngPath, infographic.pngPath].filter(Boolean),
      exports: { cover, info, infographic }
    };
  }

  const runbook = buildAgentRunbook({
    pack,
    platforms: [slot.platform],
    mode: slot.mode,
    scheduledAt: slot.scheduledFor,
    accountLabel: slot.accountLabel,
    localAssets: assets.files
  });
  const now = new Date().toISOString();

  await putAgentRun({
    id: runbook.id,
    run_type: "autopilot_publish",
    status: "pending",
    input_json: { slot, settings },
    output_json: { pack, assets, runbook },
    started_at: now,
    completed_at: null
  });

  const codexTaskIds = [];
  for (const task of runbook.tasks) {
    const codexTask = {
      id: `${slot.id}-${task.id}`,
      type: "publish",
      platform: task.platform,
      mode: task.mode,
      status: "pending",
      autopilot: true,
      autopilotSlotId: slot.id,
      runbook_json: {
        ...task,
        id: `${slot.id}-${task.id}`,
        autopilot: {
          slotId: slot.id,
          label: slot.label,
          contentType: slot.contentType,
          scheduledFor: slot.scheduledFor,
          scheduledTime: slot.scheduledTime,
          topicSource: slot.topicSource,
          contentKind: slot.contentKind || "standalone",
          seriesId: slot.seriesId || "",
          seriesTitle: slot.seriesTitle || "",
          seriesEpisodeId: slot.seriesEpisodeId || "",
          seriesEpisodeIndex: slot.seriesEpisodeIndex || null
        }
      },
      result_json: null,
      screenshots: [],
      trace: null,
      created_at: now,
      updated_at: now
    };
    await putCodexTask(codexTask);
    codexTaskIds.push(codexTask.id);
  }

  return { pack, assets, runbook, codexTaskIds };
}

export async function queueAutopilotSlot(slotId, { force = false } = {}) {
  const found = findAutopilotSlot(slotId);
  if (!found) throw new Error("slot not found");
  const { slot } = found;
  if (!force && ["generating", "queued", "published"].includes(slot.status)) return slot;

  const settings = normalizeAutopilotSettings(getAutopilotState().settings);
  await updateAutopilotSlot(slot.id, { status: "generating", failureReason: "" });
  try {
    const result = await materializeSlot({ ...slot, status: "generating" }, settings);
    return updateAutopilotSlot(slot.id, {
      status: "queued",
      assets: result.assets,
      runbookId: result.runbook.id,
      codexTaskIds: result.codexTaskIds,
      packId: result.pack.id,
      queued_at: new Date().toISOString(),
      failureReason: ""
    });
  } catch (error) {
    await updateAutopilotSlot(slot.id, {
      status: "failed",
      failureReason: error.message || "slot materialization failed"
    });
    throw error;
  }
}

export async function autopilotTick(now = new Date()) {
  const settings = normalizeAutopilotSettings(getAutopilotState().settings);
  // On-demand mode: when disabled, the scheduler does nothing — no plan is created, nothing is
  // queued. Content is produced only when the user generates or enables a schedule.
  if (!settings.enabled) {
    return {
      ok: true,
      enabled: false,
      reason: "disabled_on_demand",
      queued: [],
      snapshot: await getAutopilotSnapshot({ ensurePlan: false })
    };
  }

  const plan = await ensureTodayPlan(now);
  const queued = [];

  {
    for (const slot of plan.slots || []) {
      const cutoff = slotAutoQueueCutoff(slot, settings.timezone);
      const recoverableMissed = slot.status === "missed" && cutoff.getTime() >= now.getTime();
      if (slot.status !== "planned" && !recoverableMissed) continue;
      if (!slot.topic || slot.topicSource === "none") continue;
      if (new Date(slot.scheduledFor).getTime() > now.getTime()) continue;
      if (cutoff.getTime() < now.getTime()) {
        await updateAutopilotSlot(slot.id, {
          status: "missed",
          failureReason: "错过发布窗口，自动调度未补发。可手动入队。"
        });
        continue;
      }
      const updated = await queueAutopilotSlot(slot.id);
      queued.push(updated);
    }
  }

  return {
    ok: true,
    enabled: settings.enabled,
    date: plan.date,
    queued,
    snapshot: await getAutopilotSnapshot({ ensurePlan: false })
  };
}

export function startAutopilotScheduler({ tickMs = 60000 } = {}) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await autopilotTick(new Date());
    } catch (error) {
      console.error("[autopilot] tick failed", error);
    } finally {
      running = false;
    }
  };

  const initial = setTimeout(run, 1500);
  initial.unref?.();
  const timer = setInterval(run, tickMs);
  timer.unref?.();
  return timer;
}
