import { platformMeta } from "../../src/lib/catalog.js";
import {
  DEFAULT_ACCOUNT_LABEL,
  getCodexTask,
  getEngagementState,
  listCodexTasks,
  listEngagementItems,
  listEngagementRuns,
  putCodexTask,
  putEngagementItems,
  putEngagementRun,
  putEngagementSettings,
  putAutopilotTopic // <-- added for auto-topic
} from "./store.js";
import { draftHumanReply } from "./engagementCreative.js";
import { executePlaywrightTask } from "./playwrightExecutor.js";

function maybeExecutePlaywright(taskId) {
  if (globalThis.process?.env?.NATIVE_PLAYWRIGHT_ENABLED === "true") {
    executePlaywrightTask(taskId).catch(console.error);
  }
}

const defaultBrandVoice = "克制、真诚、有帮助，不索要隐私，不承诺医疗/法律/金融结果";

const highRiskPattern = /身份证|手机号|电话|微信|邮箱|住址|地址|转账|收款|付款|退款|红包|银行卡|密码|验证码|账号|登录|隐私|未成年|自杀|抑郁|诊断|治疗|吃药|医院|律师|起诉|合同|赔偿|股票|基金|期货|加密货币|币圈|贷款|借钱|收益保证|投资建议|诈骗|违法|侵权|删帖|举报|骂人|骗子/i;
const mediumRiskPattern = /合作|商务|报价|多少钱|价格|购买|怎么买|链接|教程|推荐|争议|反对|不认同|错了|为什么|怎么|能不能|可以吗|\?|\？/i;

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function cleanText(value, max = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function minutesSince(value, now = new Date()) {
  const time = value ? new Date(value).getTime() : 0;
  if (!time || Number.isNaN(time)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - time) / 60000;
}

function engagementTaskStaleMinutes(settings = {}) {
  const envValue = Number(globalThis.process?.env?.ENGAGEMENT_TASK_STALE_MINUTES || 0);
  if (Number.isFinite(envValue) && envValue > 0) return envValue;
  return Math.max(45, Number(settings.checkIntervalMinutes || 30) * 1.5);
}

async function failStaleEngagementTask(task, settings, now = new Date()) {
  const updatedAt = now.toISOString();
  const threshold = engagementTaskStaleMinutes(settings);
  const failureReason = `Engagement task was still ${task.status} after ${Math.round(threshold)} minutes, so it was marked failed to unblock the next monitor run.`;
  await putCodexTask({
    ...task,
    status: "failed",
    result_json: {
      taskId: task.id,
      status: "failed",
      platform: task.platform || settings.platform,
      screenshots: task.screenshots || [],
      trace: task.trace || [],
      failureReason,
      updated_at: updatedAt
    },
    failureReason,
    updated_at: updatedAt
  });
  await putEngagementRun({
    id: task.id,
    taskId: task.id,
    status: "failed",
    platform: task.platform || settings.platform,
    accountLabel: settings.accountLabel,
    summary: "互动监控任务超时未被本地浏览器执行器消费，已自动失败并释放队列。",
    itemsCount: 0,
    repliedCount: 0,
    highRiskCount: 0,
    screenshots: task.screenshots || [],
    trace: task.trace || null,
    failureReason,
    created_at: task.created_at || updatedAt,
    updated_at: updatedAt
  });
}

function itemIdFor(item, index = 0) {
  const seed = [
    item.channel || "item",
    item.author || "",
    item.text || "",
    item.sourceUrl || "",
    item.receivedAt || "",
    index
  ].join(":");
  return `eng-${hashText(seed)}`;
}

export function normalizeEngagementSettings(current = {}, patch = {}) {
  return {
    enabled: Boolean(patch.enabled ?? current.enabled ?? false),
    platform: patch.platform || current.platform || "xhs",
    accountLabel: cleanText(patch.accountLabel ?? current.accountLabel ?? DEFAULT_ACCOUNT_LABEL, 80) || DEFAULT_ACCOUNT_LABEL,
    checkIntervalMinutes: clampNumber(patch.checkIntervalMinutes ?? current.checkIntervalMinutes, 5, 24 * 60, 30),
    monitorComments: Boolean(patch.monitorComments ?? current.monitorComments ?? true),
    monitorMessages: Boolean(patch.monitorMessages ?? current.monitorMessages ?? true),
    allowCommentAutoReply: Boolean(patch.allowCommentAutoReply ?? current.allowCommentAutoReply ?? true),
    allowMessageAutoReply: Boolean(patch.allowMessageAutoReply ?? current.allowMessageAutoReply ?? false),
    maxRepliesPerRun: clampNumber(patch.maxRepliesPerRun ?? current.maxRepliesPerRun, 1, 30, 8),
    brandVoice: cleanText(patch.brandVoice ?? current.brandVoice ?? defaultBrandVoice, 1000) || defaultBrandVoice,
    lastQueuedAt: cleanText(patch.lastQueuedAt ?? current.lastQueuedAt ?? "", 80)
  };
}

export function classifyEngagementItem(item) {
  const text = cleanText(typeof item === "string" ? item : item?.text);
  const channel = typeof item === "object" && item?.channel === "message" ? "message" : "comment";
  const risk = highRiskPattern.test(text) ? "high" : mediumRiskPattern.test(text) ? "medium" : "low";
  const intent = highRiskPattern.test(text)
    ? "sensitive"
    : /合作|商务|报价|价格|多少钱/.test(text)
      ? "business"
      : /选题|下期|想看|讲讲|推荐/.test(text)
        ? "topic_signal"
        : /怎么|为什么|能不能|可以吗|\?|\？/.test(text)
          ? "question"
          : /谢谢|有用|收藏|赞|学到了|认同/.test(text)
            ? "resonance"
            : "general";
  const sentiment = /垃圾|骗人|骗子|错了|离谱|反对|不行|骂/.test(text)
    ? "negative"
    : /谢谢|有用|收藏|赞|学到了|认同|厉害/.test(text)
      ? "positive"
      : "neutral";

  return {
    channel,
    risk,
    intent,
    sentiment,
    requiresHuman: risk !== "low"
  };
}

export function draftReplyForItem(item, settings = {}) {
  const merged = { ...classifyEngagementItem(item), ...item };
  const text = cleanText(merged.text, 80) || "这个问题";
  const voice = cleanText(settings.brandVoice, 80) || "克制、真诚、有帮助";

  if (merged.risk === "high") {
    return "这个问题涉及隐私、专业判断或平台风险，我先记录下来，人工确认后再回复你。";
  }

  if (merged.channel === "message" && !settings.allowMessageAutoReply) {
    return `收到，我先把你的问题「${text}」记录下来，稍后人工确认后给你更准确的回复。`;
  }

  if (merged.intent === "business") {
    return "收到，可以先简单说下你的需求、预算和时间范围。我会先判断是否适合合作，再继续沟通。";
  }

  if (merged.intent === "question" || merged.risk === "medium") {
    return `可以，我理解你问的是「${text}」。先给一个短结论：要看具体场景和约束，别只看单个参数。我会把这个点整理成更完整的一期。`;
  }

  if (merged.intent === "topic_signal") {
    return "这个选题值得展开，我先记到下一期主题池里，后面补一个更具体的版本。";
  }

  if (merged.sentiment === "positive") {
    return "谢谢认可，我会继续把结论讲得更具体，也会把关键步骤补成可执行版本。";
  }

  return `谢谢反馈，我先记下这个点。回复会保持${voice}，后面会补一个更具体的展开。`;
}

export function buildEngagementMonitorTask(settingsInput = {}, reason = "manual") {
  const settings = normalizeEngagementSettings(settingsInput);
  const meta = platformMeta[settings.platform] || platformMeta.xhs;
  const scopes = [
    settings.monitorComments ? "comments" : "",
    settings.monitorMessages ? "messages" : ""
  ].filter(Boolean);
  const openUrl = settings.platform === "xhs" ? "https://creator.xiaohongshu.com/new/home" : meta.openUrl;

  return {
    id: `engagement-${settings.platform}-${Date.now()}`,
    type: "browser_engagement_monitor_task",
    executor: "codex-app-local",
    platform: settings.platform,
    platformName: meta.name,
    mode: "monitor_reply",
    reason,
    accountLabel: settings.accountLabel,
    openUrl,
    candidateUrls: [
      openUrl,
      "https://creator.xiaohongshu.com/",
      "https://www.xiaohongshu.com/im",
      meta.openUrl
    ].filter(Boolean),
    requiresLoggedInBrowser: true,
    engagement: {
      scopes,
      recordEndpoint: "POST /api/engagement/record",
      commentsEnabled: settings.monitorComments,
      messagesEnabled: settings.monitorMessages
    },
    objective: `用浏览器控制能力直接操作本机已登录浏览器，检查 ${meta.name} 当前登录账号的评论和私信，有新互动时按安全策略尝试回复并回写产品。`,
    browserSteps: [
      "使用 Codex/Chrome 浏览器控制能力直接操作本机真实登录浏览器，不调用平台私有接口，不绕过验证码或风控。",
      "直接使用当前浏览器登录态继续执行；不识别、不确认、不匹配小红书账号名称，也不要因为账号名称不同而阻塞。",
      settings.monitorComments ? "进入通知、互动或评论管理区域，读取未处理评论；只处理当前账号内容相关评论。" : "跳过评论读取。",
      settings.monitorMessages ? "进入私信或消息区域，读取未处理私信；避免展开与任务无关的敏感历史上下文。" : "跳过私信读取。",
      "把每条互动记录为 channel、author、text、sourceUrl、postTitle、receivedAt，并按低/中/高风险分类。",
      "低风险评论可在 maxRepliesPerRun 限额内回复；中高风险、隐私、医疗、法律、金融、账号安全和争吵内容只生成草稿并要求人工确认。",
      settings.allowMessageAutoReply ? "低风险私信允许回复，但不要索要隐私、联系方式或作出承诺。" : "私信默认只生成草稿，不直接发送。",
      "每次动作后截图关键页面；最后 POST /api/engagement/record 回写 items、replyDraft、replied、requiresHuman、screenshots 和 trace。"
    ],
    replyPolicy: {
      brandVoice: settings.brandVoice,
      maxRepliesPerRun: settings.maxRepliesPerRun,
      allowCommentAutoReply: settings.allowCommentAutoReply,
      allowMessageAutoReply: settings.allowMessageAutoReply,
      highRiskRequiresHuman: true,
      mediumRiskRequiresHuman: true,
      noPrivateDataRequest: true,
      noMedicalLegalFinancialAdvice: true,
      noArguments: true,
      noSpam: true
    },
    expectedRecordSchema: {
      taskId: "string",
      status: "completed | failed | waiting_for_user",
      items: [{
        channel: "comment | message",
        author: "string",
        text: "string",
        risk: "low | medium | high",
        replyDraft: "string",
        replied: "boolean",
        requiresHuman: "boolean"
      }],
      screenshots: ["absolute local path or browser screenshot reference"],
      trace: "browser action trace"
    },
    traceRequired: true,
    screenshotRequired: true,
    forbiddenActions: [
      "不要绕过验证码、登录、风控或平台限制",
      "不要使用未授权账号",
      "不要批量模板化刷回复",
      "不要索要或外泄用户隐私",
      "不要在医疗、法律、金融、账号安全问题上给确定性建议",
      "不要和用户争吵或攻击对方"
    ]
  };
}

export async function getEngagementSnapshot() {
  const raw = getEngagementState();
  const settings = normalizeEngagementSettings(raw.settings);
  const pendingTasks = listCodexTasks(["pending", "running", "waiting_for_user"])
    .filter((task) => task.engagement || task.runbook_json?.engagement);

  return {
    ok: true,
    settings,
    pendingTasks,
    recentRuns: listEngagementRuns(20),
    recentItems: listEngagementItems(60),
    policy: {
      comments: settings.allowCommentAutoReply ? "low-risk-auto-reply" : "draft-only",
      messages: settings.allowMessageAutoReply ? "low-risk-auto-reply" : "draft-only",
      highRisk: "human-review-required"
    }
  };
}

export async function saveEngagementSettings(patch) {
  const settings = normalizeEngagementSettings(getEngagementState().settings, patch);
  await putEngagementSettings(settings);
  return getEngagementSnapshot();
}

export async function queueEngagementCheck({ reason = "manual" } = {}) {
  const settings = normalizeEngagementSettings(getEngagementState().settings);
  if (!settings.monitorComments && !settings.monitorMessages) {
    throw new Error("comments and messages monitoring are both disabled");
  }

  const now = new Date();
  const activeTasks = listCodexTasks(["pending", "running", "waiting_for_user"])
    .filter((task) => task.engagement || task.runbook_json?.engagement);
  for (const task of activeTasks) {
    const age = minutesSince(task.updated_at || task.created_at, now);
    const isAutoRecoverable = ["pending", "running"].includes(task.status)
      && age > engagementTaskStaleMinutes(settings);
    if (isAutoRecoverable) await failStaleEngagementTask(task, settings, now);
  }

  const existing = listCodexTasks(["pending", "running", "waiting_for_user"])
    .find((task) => task.engagement || task.runbook_json?.engagement);
  if (existing) {
    return { ok: true, status: "already_pending", task: existing, snapshot: await getEngagementSnapshot() };
  }

  const task = buildEngagementMonitorTask(settings, reason);
  const createdAt = new Date().toISOString();
  const codexTask = {
    id: task.id,
    type: "engagement",
    platform: task.platform,
    mode: "monitor_reply",
    status: "pending",
    engagement: true,
    runbook_json: task,
    result_json: null,
    screenshots: [],
    trace: null,
    created_at: createdAt,
    updated_at: createdAt
  };

  await putCodexTask(codexTask);
  maybeExecutePlaywright(task.id);

  await putEngagementRun({
    id: task.id,
    taskId: task.id,
    status: "pending",
    reason,
    platform: task.platform,
    accountLabel: settings.accountLabel,
    summary: "待 Codex 浏览器执行",
    itemsCount: 0,
    repliedCount: 0,
    highRiskCount: 0,
    screenshots: [],
    trace: null,
    created_at: createdAt,
    updated_at: createdAt
  });
  await putEngagementSettings({ lastQueuedAt: createdAt });

  return { ok: true, status: "queued", task: codexTask, snapshot: await getEngagementSnapshot() };
}

export async function recordEngagementResult(input) {
  const now = new Date().toISOString();
  const settings = normalizeEngagementSettings(getEngagementState().settings);
  const task = getCodexTask(input.taskId);
  const normalizedItems = await Promise.all((input.items || []).map(async (raw, index) => {
    const classified = classifyEngagementItem(raw);
    const risk = raw.risk || classified.risk;
    const channel = raw.channel || classified.channel;
    const intent = raw.intent || classified.intent;
    const policyRequiresHuman = risk !== "low"
      || (channel === "message" && !settings.allowMessageAutoReply)
      || (channel === "comment" && !settings.allowCommentAutoReply);
    const requiresHuman = Boolean(raw.requiresHuman ?? policyRequiresHuman);
    
    let replyDraft = raw.replyDraft || raw.replyText;
    if (!replyDraft) {
      replyDraft = await draftHumanReply({ item: { ...raw, channel, risk, intent }, settings });
    }

    const item = {
      id: raw.id || itemIdFor({ ...raw, channel }, index),
      taskId: input.taskId,
      platform: input.platform || task?.platform || settings.platform,
      channel,
      author: cleanText(raw.author, 120),
      text: cleanText(raw.text),
      sourceUrl: cleanText(raw.sourceUrl, 500),
      postTitle: cleanText(raw.postTitle, 160),
      receivedAt: cleanText(raw.receivedAt, 80),
      risk,
      intent,
      sentiment: raw.sentiment || classified.sentiment,
      replyDraft: cleanText(replyDraft, 1000),
      replied: Boolean(raw.replied),
      replyText: cleanText(raw.replyText, 1000),
      requiresHuman,
      last_seen_at: now,
      updated_at: now,
      created_at: raw.created_at || now
    };
    
    // Topic Signal to Autopilot Queue (Phase 2 Task)
    if (intent === "topic_signal") {
      await putAutopilotTopic({
        id: `topic-auto-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        title: `用户提问: ${item.text}`,
        source: "engagement",
        status: "draft"
      });
    }

    return item;
  }));

  if (normalizedItems.length) {
    await putEngagementItems(normalizedItems);
  }

  const repliedCount = normalizedItems.filter((item) => item.replied).length;
  const highRiskCount = normalizedItems.filter((item) => item.risk === "high").length;
  const summary = input.summary || `读取 ${normalizedItems.length} 条互动，已回复 ${repliedCount} 条，高风险 ${highRiskCount} 条。`;
  const run = {
    id: input.taskId,
    taskId: input.taskId,
    status: input.status,
    platform: input.platform || task?.platform || settings.platform,
    summary,
    itemsCount: normalizedItems.length,
    repliedCount,
    highRiskCount,
    screenshots: input.screenshots || [],
    trace: input.trace || null,
    failureReason: input.failureReason || "",
    created_at: task?.created_at || now,
    updated_at: now
  };
  await putEngagementRun(run);

  if (task) {
    await putCodexTask({
      ...task,
      status: input.status,
      result_json: { ...input, summary, items: normalizedItems },
      screenshots: input.screenshots || [],
      trace: input.trace || null,
      updated_at: now
    });
  }

  return { ok: true, run, items: normalizedItems, snapshot: await getEngagementSnapshot() };
}

export async function engagementTick(now = new Date()) {
  const settings = normalizeEngagementSettings(getEngagementState().settings);
  if (!settings.enabled) {
    return { ok: true, enabled: false, queued: false, reason: "disabled", snapshot: await getEngagementSnapshot() };
  }

  const last = settings.lastQueuedAt ? new Date(settings.lastQueuedAt).getTime() : 0;
  const intervalMs = settings.checkIntervalMinutes * 60 * 1000;
  if (last && now.getTime() - last < intervalMs) {
    return {
      ok: true,
      enabled: true,
      queued: false,
      reason: "interval_not_reached",
      nextAt: new Date(last + intervalMs).toISOString(),
      snapshot: await getEngagementSnapshot()
    };
  }

  const result = await queueEngagementCheck({ reason: "scheduler" });
  return { ...result, enabled: true, queued: result.status === "queued" };
}

export function startEngagementScheduler({ tickMs = 60000 } = {}) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await engagementTick(new Date());
    } catch (error) {
      console.error("[engagement] tick failed", error);
    } finally {
      running = false;
    }
  };

  const initial = setTimeout(run, 2500);
  initial.unref?.();
  const timer = setInterval(run, tickMs);
  timer.unref?.();
  return timer;
}
