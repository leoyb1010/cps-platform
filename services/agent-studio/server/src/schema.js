import { z } from "zod";
import { directionLibrary, platformMeta, toneProfiles } from "../../src/lib/catalog.js";

export const DirectionEnum = z.enum(directionLibrary.map((item) => item.id));
export const ToneEnum = z.enum(Object.keys(toneProfiles));
export const PlatformEnum = z.enum(Object.keys(platformMeta));

// Accept a valid URL or an empty string. Empty form fields are common and
// should not fail validation the way bare z.string().url() does.
const OptionalUrl = z.union([z.string().url(), z.literal("")]);

export const GenerateRequestSchema = z.object({
  topic: z.string().min(1).max(160),
  direction: DirectionEnum.default("insight"),
  tone: ToneEnum.default("balanced"),
  generation: z.number().int().min(1).max(9999).default(1),
  extraContext: z.string().max(800).optional().default(""),
  stream: z.boolean().optional().default(false),
  brandVoice: z.string().max(2000).optional()
});

export const DraftRequestSchema = z.object({
  pack: z.object({
    id: z.string(),
    core: z.string(),
    platformCopy: z.record(z.any()),
    automationPrompt: z.string()
  }).passthrough(),
  platform: PlatformEnum,
  confirmFinalPublish: z.literal(false)
});

export const AgentRunRequestSchema = z.object({
  pack: z.object({
    id: z.string(),
    core: z.string(),
    direction: z.any(),
    domain: z.string().optional(),
    tone: z.string().optional(),
    policy: z.any().optional(),
    platformCopy: z.record(z.any())
  }).passthrough(),
  platforms: z.array(PlatformEnum).min(1).max(8),
  mode: z.enum(["draft", "publish", "schedule"]).default("draft"),
  scheduledAt: z.string().max(80).optional().default(""),
  accountLabel: z.string().max(80).optional().default("Leo"),
  localAssets: z.array(z.string()).max(20).optional().default([])
});

export const ResearchCollectRequestSchema = z.object({
  topic: z.string().min(1).max(160),
  platform: z.string().max(40).optional().default("web"),
  sources: z.array(z.object({
    url: z.string().optional(),
    title: z.string().optional(),
    text: z.string().optional(),
    platform: z.string().optional(),
    type: z.string().optional()
  }).passthrough()).max(20).optional().default([])
});

export const ResearchBriefRequestSchema = z.object({
  topic: z.string().min(1).max(160),
  sourceItems: z.array(z.any()).max(50).optional().default([])
});

export const ResearchTopicsRequestSchema = z.object({
  brief: z.any().optional(),
  topic: z.string().min(1).max(160).optional(),
  limit: z.number().int().min(1).max(10).optional().default(5)
});

export const BrowserTaskRequestSchema = z.object({
  task: z.any(),
  runId: z.string().optional(),
  status: z.enum(["pending", "running", "waiting_for_user", "completed", "failed"]).optional().default("pending")
});

export const AutopilotSettingsRequestSchema = z.object({
  enabled: z.boolean().optional(),
  platform: PlatformEnum.optional(),
  mode: z.enum(["draft", "publish", "schedule"]).optional(),
  accountLabel: z.string().max(80).optional(),
  timezone: z.string().max(80).optional(),
  contentSource: z.enum(["manual-or-auto", "manual-only", "auto-only"]).optional(),
  defaultTopic: z.string().max(160).optional(),
  videoDurationSeconds: z.number().int().min(6).max(45).optional(),
  videoFps: z.number().int().min(4).max(24).optional(),
  // Flexible posting schedule: define your own windows (count, times, content type, direction,
  // tone). Omit to keep the current/default windows.
  windows: z.array(z.object({
    id: z.string().max(24).optional(),
    label: z.string().max(40).optional(),
    start: z.string().regex(/^\d{1,2}:\d{2}$/, "expected HH:MM"),
    end: z.string().regex(/^\d{1,2}:\d{2}$/, "expected HH:MM"),
    contentType: z.enum(["image", "video"]).optional().default("image"),
    direction: DirectionEnum.optional(),
    tone: ToneEnum.optional()
  }).passthrough()).min(1).max(12).optional()
});

export const AutopilotTopicRequestSchema = z.object({
  title: z.string().min(1).max(160),
  source: z.enum(["manual", "auto", "imported"]).optional().default("manual"),
  status: z.enum(["queued", "locked", "planned", "used", "archived"]).optional().default("queued"),
  priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
  direction: DirectionEnum.optional(),
  tone: ToneEnum.optional(),
  visualStyle: z.string().max(80).optional(),
  contentKind: z.enum(["standalone", "series"]).optional().default("standalone"),
  seriesId: z.string().max(160).optional().default(""),
  seriesTitle: z.string().max(160).optional().default(""),
  seriesEpisodeId: z.string().max(160).optional().default(""),
  seriesEpisodeIndex: z.number().int().min(1).max(999).nullable().optional().default(null),
  localAssets: z.array(z.string().min(1).max(1000)).max(20).optional().default([]),
  notes: z.string().max(600).optional().default("")
});

export const AutopilotTopicUpdateSchema = z.object({
  status: z.enum(["queued", "locked", "planned", "used", "archived"]).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  notes: z.string().max(600).optional()
});

export const TraceRequestSchema = z.object({
  taskId: z.string(),
  status: z.enum(["pending", "running", "waiting_for_user", "completed", "failed"]),
  platform: PlatformEnum.optional(),
  postUrl: OptionalUrl.optional(),
  draftUrl: OptionalUrl.optional(),
  screenshots: z.array(z.string()).optional().default([]),
  trace: z.any().optional(),
  failureReason: z.string().max(1000).optional().default("")
});

export const RenderHtmlRequestSchema = z.object({
  pack: z.object({
    id: z.string(),
    title: z.string(),
    core: z.string(),
    direction: z.any(),
    cards: z.array(z.any())
  }).passthrough(),
  platform: PlatformEnum.optional().default("xhs"),
  style: z.string().max(80).optional(),
  pickMode: z.enum(["recommend", "random", "manual"]).optional(),
  templateRecipeId: z.string().max(80).optional().nullable(),
  excludeAgpl: z.boolean().optional(),
  pinRecipe: z.boolean().optional()
});

const VisualIntentEnum = z.enum(["auto", "cover", "xhs-carousel", "info-card", "infographic", "chart", "motion-video", "explain-animation", "brand-video"]);

export const VisualPlanRequestSchema = z.object({
  pack: z.object({
    id: z.string(),
    title: z.string(),
    core: z.string(),
    direction: z.any(),
    cards: z.array(z.any()),
    scores: z.array(z.any()).optional().default([])
  }).passthrough(),
  platform: PlatformEnum.optional().default("xhs"),
  intent: VisualIntentEnum.optional().default("auto"),
  style: z.string().max(80).optional().default("sharp-editorial"),
  ratio: z.string().max(20).optional(),
  duration: z.number().int().min(4).max(90).optional(),
  fps: z.number().int().min(1).max(60).optional(),
  renderBackend: z.enum(["local", "hyperframes"]).optional(),
  pickMode: z.enum(["recommend", "random", "manual"]).optional(),
  templateRecipeId: z.string().max(80).optional().nullable(),
  excludeAgpl: z.boolean().optional(),
  pinRecipe: z.boolean().optional()
});

export const ChartAssetRequestSchema = z.object({
  pack: z.object({
    id: z.string(),
    title: z.string(),
    core: z.string(),
    direction: z.any(),
    scores: z.array(z.any()).optional().default([]),
    cards: z.array(z.any()).optional().default([])
  }).passthrough(),
  platform: PlatformEnum.optional().default("xhs"),
  chartType: z.enum(["bar", "line", "doughnut", "radar", "bubble", "funnel", "mixed", "horizontal-bar"]).optional().default("bar"),
  title: z.string().max(120).optional(),
  labels: z.array(z.string().max(60)).max(12).optional(),
  values: z.array(z.number()).max(12).optional(),
  unit: z.string().max(24).optional(),
  insight: z.string().max(240).optional(),
  sourceLabel: z.string().max(80).optional(),
  style: z.string().max(80).optional().default("auto-diverse")
});

export const VisualExportRequestSchema = z.object({
  pack: z.object({
    id: z.string(),
    title: z.string(),
    core: z.string(),
    direction: z.any(),
    cards: z.array(z.any())
  }).passthrough(),
  platform: PlatformEnum.optional().default("xhs"),
  engines: z.array(VisualIntentEnum).max(8).optional().default(["cover", "info-card", "chart", "motion-video"]),
  mode: z.enum(["draft", "publish", "schedule"]).default("draft"),
  scheduledAt: z.string().max(80).optional().default(""),
  accountLabel: z.string().max(80).optional().default("Leo")
});

export const CommentMaintenanceRequestSchema = z.object({
  platform: PlatformEnum,
  publishUrl: OptionalUrl.optional().default(""),
  brandVoice: z.string().max(1000).optional().default("克制、真诚、有帮助"),
  maxReplies: z.number().int().min(1).max(50).optional().default(12)
});

export const EngagementSettingsRequestSchema = z.object({
  enabled: z.boolean().optional(),
  platform: PlatformEnum.optional(),
  accountLabel: z.string().max(80).optional(),
  checkIntervalMinutes: z.number().int().min(5).max(24 * 60).optional(),
  monitorComments: z.boolean().optional(),
  monitorMessages: z.boolean().optional(),
  allowCommentAutoReply: z.boolean().optional(),
  allowMessageAutoReply: z.boolean().optional(),
  maxRepliesPerRun: z.number().int().min(1).max(30).optional(),
  brandVoice: z.string().max(1000).optional()
});

export const EngagementCheckRequestSchema = z.object({
  reason: z.string().max(120).optional().default("manual")
});

const EngagementChannelEnum = z.enum(["comment", "message"]);
const EngagementRiskEnum = z.enum(["low", "medium", "high"]);
const EngagementStatusEnum = z.enum(["pending", "running", "waiting_for_user", "completed", "failed"]);

export const EngagementRecordRequestSchema = z.object({
  taskId: z.string().min(1).max(160),
  status: EngagementStatusEnum.optional().default("completed"),
  platform: PlatformEnum.optional().default("xhs"),
  summary: z.string().max(1000).optional().default(""),
  screenshots: z.array(z.string()).max(30).optional().default([]),
  trace: z.any().optional(),
  failureReason: z.string().max(1000).optional().default(""),
  items: z.array(z.object({
    id: z.string().max(160).optional(),
    channel: EngagementChannelEnum,
    author: z.string().max(120).optional().default(""),
    text: z.string().max(2000).optional().default(""),
    sourceUrl: OptionalUrl.optional().default(""),
    postTitle: z.string().max(160).optional().default(""),
    receivedAt: z.string().max(80).optional().default(""),
    risk: EngagementRiskEnum.optional(),
    intent: z.string().max(80).optional().default("unknown"),
    sentiment: z.string().max(80).optional().default("neutral"),
    replyDraft: z.string().max(1000).optional().default(""),
    replied: z.boolean().optional().default(false),
    replyText: z.string().max(1000).optional().default(""),
    requiresHuman: z.boolean().optional()
  }).passthrough()).max(100).optional().default([])
});

export const SeriesCreateRequestSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(800).optional().default(""),
  platform: PlatformEnum.optional().default("xhs"),
  direction: DirectionEnum.optional().default("insight"),
  tone: ToneEnum.optional().default("balanced"),
  visualStyle: z.string().max(80).optional().default("auto-diverse"),
  accountLabel: z.string().max(80).optional().default("Leo"),
  status: z.enum(["active", "paused", "archived"]).optional().default("active"),
  cadence: z.string().max(80).optional().default("3-7 posts"),
  seedTopics: z.array(z.string().min(1).max(160)).max(30).optional().default([])
});

export const SeriesUpdateRequestSchema = SeriesCreateRequestSchema.partial();

export const SeriesEpisodeRequestSchema = z.object({
  topic: z.string().max(160).optional().default(""),
  notes: z.string().max(600).optional().default(""),
  status: z.enum(["planned", "queued", "published", "archived"]).optional().default("planned")
});

export const SeriesEpisodeQueueRequestSchema = z.object({
  status: z.enum(["queued", "locked"]).optional().default("queued"),
  priority: z.enum(["low", "normal", "high"]).optional().default("high")
});

export const AnalyticsCollectRequestSchema = z.object({
  platform: PlatformEnum.optional().default("xhs"),
  publishUrl: z.string().optional().default(""),
  event: z.string().max(120).optional().default("$pageview"),
  days: z.number().int().min(1).max(90).optional().default(7)
});

export const AnalyticsBriefRequestSchema = z.object({
  snapshots: z.array(z.any()).optional().default([])
});

export const GraphicSmokeRequestSchema = z.object({
  topic: z.string().min(1).max(160),
  direction: DirectionEnum.default("insight"),
  tone: ToneEnum.default("balanced"),
  extraContext: z.string().max(800).optional().default(""),
  platform: PlatformEnum.optional().default("xhs"),
  mode: z.enum(["draft", "publish", "schedule"]).default("draft"),
  scheduledAt: z.string().max(80).optional().default(""),
  accountLabel: z.string().max(80).optional().default("Leo")
});

export const AssetRequestSchema = z.object({
  packId: z.string(),
  platform: PlatformEnum.optional(),
  brief: z.string().min(1).max(1000)
});

export const FactoryAssetTypeEnum = z.enum(["carousel", "social_pack", "image", "poster", "ad", "video"]);
export const FactoryModelPresetEnum = z.enum(["cheap", "balanced", "quality", "fast"]);

export const FactoryEstimateRequestSchema = z.object({
  workspaceId: z.string().max(80).optional(),
  userId: z.string().max(80).optional(),
  assetType: FactoryAssetTypeEnum.default("carousel"),
  platform: z.string().max(40).optional().default("xhs"),
  intent: z.enum(["educate", "sell", "promote", "explain", "announce", "summarize", "grow"]).optional().default("educate"),
  prompt: z.string().min(1).max(600),
  audience: z.string().max(240).optional().default(""),
  product: z.string().max(240).optional().default(""),
  extraContext: z.string().max(800).optional().default(""),
  style: z.string().max(80).optional().default("premium"),
  modelPreset: FactoryModelPresetEnum.optional().default("balanced"),
  count: z.number().int().min(1).max(12).optional().default(1),
  duration: z.number().int().min(6).max(90).optional().default(12),
  tone: ToneEnum.optional().default("balanced"),
  generation: z.number().int().min(1).max(9999).optional()
});

export const FactoryGenerateRequestSchema = FactoryEstimateRequestSchema.extend({
  confirmCredits: z.boolean().optional().default(true)
});
