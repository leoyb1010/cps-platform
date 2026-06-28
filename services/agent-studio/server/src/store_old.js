import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(serverRoot, "data");
const storePath = path.join(dataDir, "state.json");
export const DEFAULT_ACCOUNT_LABEL = "Leo";

const initialState = {
  codexTasks: [],
  agentRuns: [],
  traces: [],
  autopilot: {
    settings: {
      enabled: false,
      platform: "xhs",
      mode: "publish",
      accountLabel: DEFAULT_ACCOUNT_LABEL,
      timezone: "Asia/Shanghai",
      contentSource: "manual-or-auto",
      defaultTopic: "",
      videoDurationSeconds: 12,
      videoFps: 8
    },
    topicQueue: [],
    dailyPlans: []
  },
  engagement: {
    settings: {
      enabled: false,
      platform: "xhs",
      accountLabel: DEFAULT_ACCOUNT_LABEL,
      checkIntervalMinutes: 30,
      monitorComments: true,
      monitorMessages: true,
      allowCommentAutoReply: true,
      allowMessageAutoReply: false,
      maxRepliesPerRun: 8,
      brandVoice: "克制、真诚、有帮助，不索要隐私，不承诺医疗/法律/金融结果",
      lastQueuedAt: ""
    },
    runs: [],
    items: []
  },
  series: {
    profiles: []
  }
};

let state = structuredClone(initialState);

function normalizeState(raw = {}) {
  const base = structuredClone(initialState);
  const autopilot = raw.autopilot || {};
  const engagement = raw.engagement || {};
  const series = raw.series || {};

  return {
    ...base,
    ...raw,
    codexTasks: Array.isArray(raw.codexTasks) ? raw.codexTasks : base.codexTasks,
    agentRuns: Array.isArray(raw.agentRuns) ? raw.agentRuns : base.agentRuns,
    traces: Array.isArray(raw.traces) ? raw.traces : base.traces,
    autopilot: {
      ...base.autopilot,
      ...autopilot,
      settings: {
        ...base.autopilot.settings,
        ...(autopilot.settings || {})
      },
      topicQueue: Array.isArray(autopilot.topicQueue) ? autopilot.topicQueue : base.autopilot.topicQueue,
      dailyPlans: Array.isArray(autopilot.dailyPlans) ? autopilot.dailyPlans : base.autopilot.dailyPlans
    },
    engagement: {
      ...base.engagement,
      ...engagement,
      settings: {
        ...base.engagement.settings,
        ...(engagement.settings || {})
      },
      runs: Array.isArray(engagement.runs) ? engagement.runs : base.engagement.runs,
      items: Array.isArray(engagement.items) ? engagement.items : base.engagement.items
    },
    series: {
      ...base.series,
      ...series,
      profiles: Array.isArray(series.profiles) ? series.profiles : base.series.profiles
    }
  };
}

// Serialize writes so overlapping requests cannot interleave file writes and
// corrupt state.json. Each save is also written atomically via a temp file +
// rename, so a crash mid-write never truncates the canonical file.
let writeChain = Promise.resolve();

export async function loadState() {
  await mkdir(dataDir, { recursive: true });
  try {
    const raw = await readFile(storePath, "utf8");
    state = normalizeState(JSON.parse(raw));
  } catch {
    state = structuredClone(initialState);
    await saveState();
  }
  return state;
}

export async function saveState() {
  const run = writeChain.then(async () => {
    await mkdir(dataDir, { recursive: true });
    const payload = JSON.stringify(state, null, 2);
    const tmpPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, payload, "utf8");
    await rename(tmpPath, storePath);
  });
  // Keep the chain alive even if one write fails, so later writes still run.
  writeChain = run.catch(() => {});
  return run;
}

function upsert(collection, item) {
  const index = state[collection].findIndex((entry) => entry.id === item.id);
  if (index >= 0) state[collection][index] = item;
  else state[collection].push(item);
  return item;
}

export async function putCodexTask(task) {
  const saved = upsert("codexTasks", task);
  await saveState();
  return saved;
}

export function getCodexTask(id) {
  return state.codexTasks.find((task) => task.id === id) || null;
}

export function listCodexTasks(statuses) {
  if (!statuses?.length) return state.codexTasks;
  return state.codexTasks.filter((task) => statuses.includes(task.status));
}

export async function putAgentRun(run) {
  const saved = upsert("agentRuns", run);
  await saveState();
  return saved;
}

export function getAgentRun(id) {
  return state.agentRuns.find((run) => run.id === id) || null;
}

export async function putTrace(trace) {
  const saved = upsert("traces", { id: trace.taskId, ...trace });
  await saveState();
  return saved;
}

export function getTrace(taskId) {
  return state.traces.find((trace) => trace.taskId === taskId || trace.id === taskId) || null;
}

export function getAutopilotState() {
  return state.autopilot;
}

export async function putAutopilotSettings(settings) {
  state.autopilot.settings = {
    ...state.autopilot.settings,
    ...settings,
    updated_at: new Date().toISOString()
  };
  await saveState();
  return state.autopilot.settings;
}

export async function putAutopilotTopic(topic) {
  const saved = upsertNested("autopilot.topicQueue", topic);
  await saveState();
  return saved;
}

export async function updateAutopilotTopic(id, patch) {
  const topic = state.autopilot.topicQueue.find((item) => item.id === id);
  if (!topic) return null;
  Object.assign(topic, patch, { updated_at: new Date().toISOString() });
  await saveState();
  return topic;
}

export function getAutopilotPlan(dateKey) {
  return state.autopilot.dailyPlans.find((plan) => plan.date === dateKey) || null;
}

export function listAutopilotPlans(limit = 7) {
  return [...state.autopilot.dailyPlans]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, limit);
}

export async function putAutopilotPlan(plan) {
  const saved = upsertNested("autopilot.dailyPlans", plan);
  await saveState();
  return saved;
}

export async function clearAutopilotDailyPlans() {
  state.autopilot.dailyPlans = [];
  await saveState();
  return state.autopilot.dailyPlans;
}

export function findAutopilotSlot(slotId) {
  for (const plan of state.autopilot.dailyPlans) {
    const slot = (plan.slots || []).find((item) => item.id === slotId);
    if (slot) return { plan, slot };
  }
  return null;
}

export async function updateAutopilotSlot(slotId, patch) {
  const found = findAutopilotSlot(slotId);
  if (!found) return null;
  Object.assign(found.slot, patch, { updated_at: new Date().toISOString() });
  found.plan.updated_at = found.slot.updated_at;
  await saveState();
  return found.slot;
}

export function getEngagementState() {
  return state.engagement;
}

export async function putEngagementSettings(settings) {
  state.engagement.settings = {
    ...state.engagement.settings,
    ...settings,
    updated_at: new Date().toISOString()
  };
  await saveState();
  return state.engagement.settings;
}

export async function putEngagementRun(run) {
  const saved = upsertNested("engagement.runs", run);
  await saveState();
  return saved;
}

export function listEngagementRuns(limit = 20) {
  return [...state.engagement.runs]
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, limit);
}

export async function putEngagementItems(items) {
  const saved = [];
  for (const item of items) {
    saved.push(upsertNested("engagement.items", item));
  }
  await saveState();
  return saved;
}

export function listEngagementItems(limit = 60) {
  return [...state.engagement.items]
    .sort((a, b) => String(b.last_seen_at || b.created_at || "").localeCompare(String(a.last_seen_at || a.created_at || "")))
    .slice(0, limit);
}

export function getSeriesState() {
  return state.series;
}

export function getSeriesProfile(id) {
  return state.series.profiles.find((profile) => profile.id === id) || null;
}

export function listSeriesProfiles() {
  return [...state.series.profiles]
    .sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
}

export async function putSeriesProfile(profile) {
  const saved = upsertNested("series.profiles", profile);
  await saveState();
  return saved;
}

export async function updateSeriesProfile(id, patch) {
  const profile = getSeriesProfile(id);
  if (!profile) return null;
  Object.assign(profile, patch, { updated_at: new Date().toISOString() });
  await saveState();
  return profile;
}

export async function putSeriesEpisode(seriesId, episode) {
  const profile = getSeriesProfile(seriesId);
  if (!profile) return null;
  if (!Array.isArray(profile.episodes)) profile.episodes = [];
  const index = profile.episodes.findIndex((item) => item.id === episode.id);
  if (index >= 0) profile.episodes[index] = episode;
  else profile.episodes.push(episode);
  profile.updated_at = new Date().toISOString();
  await saveState();
  return episode;
}

export async function updateSeriesEpisode(seriesId, episodeId, patch) {
  const profile = getSeriesProfile(seriesId);
  if (!profile?.episodes) return null;
  const episode = profile.episodes.find((item) => item.id === episodeId);
  if (!episode) return null;
  Object.assign(episode, patch, { updated_at: new Date().toISOString() });
  profile.updated_at = episode.updated_at;
  await saveState();
  return episode;
}

function upsertNested(pathKey, item) {
  const [root, collection] = pathKey.split(".");
  const list = state[root][collection];
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index >= 0) list[index] = item;
  else list.push(item);
  return item;
}
