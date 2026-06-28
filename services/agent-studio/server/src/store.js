import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(serverRoot, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const DEFAULT_ACCOUNT_LABEL = "Leo";

const db = new Database(path.join(dataDir, "agent_studio.db"));
db.pragma("journal_mode = WAL");

const schemaPath = path.join(serverRoot, "src", "db", "schema.sql");
const schemaSql = fs.readFileSync(schemaPath, "utf8");
db.exec(schemaSql);

function migrateSettingsTableIfNeeded() {
  const cols = db.prepare("PRAGMA table_info(settings)").all();
  if (!cols.length) return;
  const pkCols = cols.filter((c) => c.pk > 0).map((c) => c.name);
  if (pkCols.length === 2 && pkCols.includes("workspace_id") && pkCols.includes("key")) return;
  if (pkCols.length === 1 && pkCols[0] === "key") {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings_v2 (
        workspace_id TEXT NOT NULL DEFAULT 'default',
        key TEXT NOT NULL,
        value_json TEXT,
        updated_at TEXT,
        PRIMARY KEY (workspace_id, key)
      );
      INSERT OR IGNORE INTO settings_v2 (workspace_id, key, value_json, updated_at)
        SELECT COALESCE(workspace_id, 'default'), key, value_json, updated_at FROM settings;
      DROP TABLE settings;
      ALTER TABLE settings_v2 RENAME TO settings;
    `);
  }
}
migrateSettingsTableIfNeeded();

let currentWorkspace = "default";

export function setWorkspaceId(id) {
  currentWorkspace = id;
}

// Ensure default workspace
const insertWorkspace = db.prepare(`INSERT OR IGNORE INTO workspaces (id, name, created_at) VALUES (?, ?, ?)`);
insertWorkspace.run("default", "Default Workspace", new Date().toISOString());

// Helpers for JSON fields
function parseJson(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function jsonValue(value, fallback = null) {
  try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); }
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ensureWorkspace(workspaceId = "default", name = "Default Workspace") {
  const id = String(workspaceId || "default");
  insertWorkspace.run(id, id === "default" ? name : name || id, new Date().toISOString());
  db.prepare(`INSERT OR IGNORE INTO credit_accounts (workspace_id, plan, balance, included_monthly_credits, purchased_credits, reserved_credits, updated_at)
    VALUES (?, 'free', 1000, 1000, 0, 0, ?)`).run(id, new Date().toISOString());
  return db.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(id);
}

export function getCreditAccount(workspaceId = "default") {
  ensureWorkspace(workspaceId);
  return db.prepare(`SELECT * FROM credit_accounts WHERE workspace_id = ?`).get(workspaceId);
}

function putLedgerEntry({ workspaceId = "default", userId = "local-user", type, amount, reason = "", jobId = "", usageEventId = "", metadata = {} }) {
  ensureWorkspace(workspaceId);
  const account = getCreditAccount(workspaceId);
  const nextBalance = Number(account.balance || 0) + Number(amount || 0);
  db.prepare(`UPDATE credit_accounts SET balance = ?, updated_at = ? WHERE workspace_id = ?`).run(nextBalance, new Date().toISOString(), workspaceId);
  const entry = {
    id: makeId("ledger"), workspace_id: workspaceId, user_id: userId, type, amount: Number(amount || 0),
    balance_after: nextBalance, reason, job_id: jobId, usage_event_id: usageEventId,
    metadata_json: jsonValue(metadata, {}), created_at: new Date().toISOString()
  };
  db.prepare(`INSERT INTO credit_ledger (id, workspace_id, user_id, type, amount, balance_after, reason, job_id, usage_event_id, metadata_json, created_at)
    VALUES (@id, @workspace_id, @user_id, @type, @amount, @balance_after, @reason, @job_id, @usage_event_id, @metadata_json, @created_at)`).run(entry);
  return { ...entry, metadata_json: parseJson(entry.metadata_json) };
}

export function listCreditLedger(workspaceId = "default", limit = 20) {
  ensureWorkspace(workspaceId);
  return db.prepare(`SELECT * FROM credit_ledger WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`).all(workspaceId, limit)
    .map((row) => ({ ...row, metadata_json: parseJson(row.metadata_json) }));
}

export function grantCredits({ workspaceId = "default", userId = "local-user", amount = 0, reason = "grant", metadata = {} }) {
  return putLedgerEntry({ workspaceId, userId, type: "grant", amount: Math.abs(Number(amount || 0)), reason, metadata });
}

export function reserveCredits({ workspaceId = "default", amount = 0 }) {
  ensureWorkspace(workspaceId);
  const account = getCreditAccount(workspaceId);
  const n = Math.max(0, Number(amount || 0));
  const available = Number(account.balance || 0) - Number(account.reserved_credits || 0);
  if (available < n) throw new Error(`Insufficient credits: need ${n}, available ${available}`);
  db.prepare(`UPDATE credit_accounts SET reserved_credits = reserved_credits + ?, updated_at = ? WHERE workspace_id = ?`).run(n, new Date().toISOString(), workspaceId);
  return getCreditAccount(workspaceId);
}

export function consumeCredits({ workspaceId = "default", userId = "local-user", amount = 0, jobId = "", usageEventId = "", reason = "consume", metadata = {} }) {
  ensureWorkspace(workspaceId);
  const n = Math.max(0, Number(amount || 0));
  const account = getCreditAccount(workspaceId);
  db.prepare(`UPDATE credit_accounts SET reserved_credits = MAX(0, reserved_credits - ?), updated_at = ? WHERE workspace_id = ?`).run(n, new Date().toISOString(), workspaceId);
  if (n === 0) return null;
  if (Number(account.balance || 0) < n) throw new Error(`Insufficient credits: need ${n}, balance ${account.balance}`);
  return putLedgerEntry({ workspaceId, userId, type: "consume", amount: -n, reason, jobId, usageEventId, metadata });
}

export function refundCredits({ workspaceId = "default", userId = "local-user", amount = 0, jobId = "", usageEventId = "", reason = "refund", metadata = {} }) {
  ensureWorkspace(workspaceId);
  const n = Math.max(0, Number(amount || 0));
  db.prepare(`UPDATE credit_accounts SET reserved_credits = MAX(0, reserved_credits - ?), updated_at = ? WHERE workspace_id = ?`).run(n, new Date().toISOString(), workspaceId);
  return n ? putLedgerEntry({ workspaceId, userId, type: "refund", amount: n, reason, jobId, usageEventId, metadata }) : null;
}

export function recordUsageEvent(workspaceId = "default", event = {}) {
  ensureWorkspace(workspaceId);
  const now = new Date().toISOString();
  const row = {
    id: event.id || makeId("usage"), workspace_id: workspaceId, user_id: event.userId || event.user_id || "local-user",
    job_id: event.jobId || event.job_id || "", provider: event.provider || "", model: event.model || "",
    modality: event.modality || "text", task: event.task || "unknown",
    input_units: Number(event.inputUnits || event.input_units || event.usage?.inputTokens || 0),
    output_units: Number(event.outputUnits || event.output_units || event.usage?.outputTokens || 0),
    credits_estimated: Number(event.creditsEstimated || event.credits_estimated || 0),
    credits_charged: Number(event.creditsCharged || event.credits_charged || 0),
    provider_cost_json: jsonValue(event.providerCost || event.provider_cost_json || {}, {}),
    status: event.status || (event.ok === false ? "failed" : "completed"),
    error_message: event.error || event.errorMessage || "",
    metadata_json: jsonValue(event.metadata || event, {}),
    created_at: event.created_at || now,
    completed_at: event.completed_at || now
  };
  db.prepare(`INSERT INTO usage_events (id, workspace_id, user_id, job_id, provider, model, modality, task, input_units, output_units, credits_estimated, credits_charged, provider_cost_json, status, error_message, metadata_json, created_at, completed_at)
    VALUES (@id, @workspace_id, @user_id, @job_id, @provider, @model, @modality, @task, @input_units, @output_units, @credits_estimated, @credits_charged, @provider_cost_json, @status, @error_message, @metadata_json, @created_at, @completed_at)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status, credits_charged=excluded.credits_charged, completed_at=excluded.completed_at, error_message=excluded.error_message`).run(row);
  return { ...row, provider_cost_json: parseJson(row.provider_cost_json), metadata_json: parseJson(row.metadata_json) };
}

export function listUsageEvents(workspaceId = "default", limit = 50) {
  ensureWorkspace(workspaceId);
  return db.prepare(`SELECT * FROM usage_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`).all(workspaceId, limit)
    .map((row) => ({ ...row, provider_cost_json: parseJson(row.provider_cost_json), metadata_json: parseJson(row.metadata_json) }));
}

export function createFactoryJob(workspaceId = "default", job = {}) {
  ensureWorkspace(workspaceId);
  const now = new Date().toISOString();
  const row = {
    id: job.id || makeId("factory"), workspace_id: workspaceId, user_id: job.userId || "local-user",
    asset_type: job.assetType || job.asset_type || "carousel", platform: job.platform || "xhs", intent: job.intent || "educate",
    prompt: job.prompt || "", style: job.style || "auto", model_preset: job.modelPreset || job.model_preset || "balanced",
    status: job.status || "pending", input_json: jsonValue(job.input || job, {}), output_json: jsonValue(job.output || null, null),
    credits_estimated: Number(job.creditsEstimated || 0), credits_charged: Number(job.creditsCharged || 0), failure_reason: job.failureReason || "",
    created_at: job.created_at || now, updated_at: now, completed_at: job.completed_at || null
  };
  db.prepare(`INSERT INTO factory_jobs (id, workspace_id, user_id, asset_type, platform, intent, prompt, style, model_preset, status, input_json, output_json, credits_estimated, credits_charged, failure_reason, created_at, updated_at, completed_at)
    VALUES (@id, @workspace_id, @user_id, @asset_type, @platform, @intent, @prompt, @style, @model_preset, @status, @input_json, @output_json, @credits_estimated, @credits_charged, @failure_reason, @created_at, @updated_at, @completed_at)`).run(row);
  return normalizeFactoryJob(row);
}

export function updateFactoryJob(workspaceId = "default", jobId, patch = {}) {
  const current = getFactoryJob(workspaceId, jobId);
  if (!current) return null;
  const row = {
    ...current,
    output_json: jsonValue(patch.output !== undefined ? patch.output : current.output_json, null),
    status: patch.status || current.status,
    credits_charged: Number(patch.creditsCharged ?? current.credits_charged ?? 0),
    failure_reason: patch.failureReason || current.failure_reason || "",
    updated_at: new Date().toISOString(),
    completed_at: patch.completed_at || (["completed", "failed"].includes(patch.status) ? new Date().toISOString() : current.completed_at)
  };
  db.prepare(`UPDATE factory_jobs SET status=@status, output_json=@output_json, credits_charged=@credits_charged, failure_reason=@failure_reason, updated_at=@updated_at, completed_at=@completed_at WHERE id=@id AND workspace_id=@workspace_id`).run(row);
  return getFactoryJob(workspaceId, jobId);
}

export function getFactoryJob(workspaceId = "default", jobId) {
  ensureWorkspace(workspaceId);
  const row = db.prepare(`SELECT * FROM factory_jobs WHERE workspace_id = ? AND id = ?`).get(workspaceId, jobId);
  return row ? normalizeFactoryJob(row) : null;
}

export function listFactoryJobs(workspaceId = "default", limit = 50) {
  ensureWorkspace(workspaceId);
  return db.prepare(`SELECT * FROM factory_jobs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`).all(workspaceId, limit).map(normalizeFactoryJob);
}

function normalizeFactoryJob(row) {
  return { ...row, input_json: parseJson(row.input_json), output_json: parseJson(row.output_json) };
}

export async function loadState() {
  // SQLite is ready immediately. This async func is kept for backward compat.
  return Promise.resolve();
}

export async function saveState() {
  // better-sqlite3 writes are immediate, nothing to do.
  return Promise.resolve();
}

// --- codexTasks ---

export function getCodexTask(id) {
  const row = db.prepare(`SELECT * FROM codex_tasks WHERE id = ? AND workspace_id = ?`).get(id, currentWorkspace);
  if (!row) return null;
  return {
    ...row,
    engagement: Boolean(row.engagement),
    runbook_json: parseJson(row.runbook_json),
    result_json: parseJson(row.result_json),
    screenshots: parseJson(row.screenshots) || []
  };
}

export async function putCodexTask(task) {
  const traceValue = typeof task.trace === "string" ? task.trace : JSON.stringify(task.trace || null);
  const stmt = db.prepare(`
    INSERT INTO codex_tasks (id, workspace_id, type, platform, mode, status, engagement, runbook_json, result_json, screenshots, trace, created_at, updated_at)
    VALUES (@id, @workspace_id, @type, @platform, @mode, @status, @engagement, @runbook_json, @result_json, @screenshots, @trace, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      status=excluded.status, result_json=excluded.result_json, trace=excluded.trace, updated_at=excluded.updated_at, screenshots=excluded.screenshots
  `);
  stmt.run({
    ...task,
    workspace_id: currentWorkspace,
    engagement: task.engagement ? 1 : 0,
    runbook_json: JSON.stringify(task.runbook_json),
    result_json: JSON.stringify(task.result_json),
    screenshots: JSON.stringify(task.screenshots || []),
    trace: traceValue,
    updated_at: new Date().toISOString()
  });
  return task;
}

export function listCodexTasks(statuses) {
  let rows = db.prepare(`SELECT * FROM codex_tasks WHERE workspace_id = ?`).all(currentWorkspace);
  if (statuses?.length) {
    rows = rows.filter(r => statuses.includes(r.status));
  }
  return rows.map(row => ({
    ...row,
    engagement: Boolean(row.engagement),
    runbook_json: parseJson(row.runbook_json),
    result_json: parseJson(row.result_json),
    screenshots: parseJson(row.screenshots) || []
  }));
}

// --- agentRuns ---

export function getAgentRun(id) {
  const row = db.prepare(`SELECT * FROM agent_runs WHERE id = ? AND workspace_id = ?`).get(id, currentWorkspace);
  if (!row) return null;
  return {
    ...row,
    input_json: parseJson(row.input_json),
    output_json: parseJson(row.output_json)
  };
}

export async function putAgentRun(run) {
  const stmt = db.prepare(`
    INSERT INTO agent_runs (id, workspace_id, run_type, status, input_json, output_json, failure_reason, started_at, completed_at)
    VALUES (@id, @workspace_id, @run_type, @status, @input_json, @output_json, @failure_reason, @started_at, @completed_at)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status, output_json=excluded.output_json, completed_at=excluded.completed_at
  `);
  stmt.run({
    ...run,
    workspace_id: currentWorkspace,
    input_json: JSON.stringify(run.input_json),
    output_json: JSON.stringify(run.output_json),
    failure_reason: run.failure_reason || run.failureReason || ""
  });
  return run;
}

// --- traces ---
export function getTrace(taskId) {
  const row = db.prepare(`SELECT * FROM traces WHERE (task_id = ? OR id = ?) AND workspace_id = ?`).get(taskId, taskId, currentWorkspace);
  return row || null;
}

export async function putTrace(trace) {
  const id = trace.taskId || trace.id;
  const summary = trace.summary || trace.failureReason || trace.status || "";
  const detail = typeof trace.detail === "string" ? trace.detail : JSON.stringify(trace);
  const stmt = db.prepare(`
    INSERT INTO traces (id, workspace_id, type, task_id, run_id, summary, detail, created_at)
    VALUES (@id, @workspace_id, @type, @task_id, @run_id, @summary, @detail, @created_at)
    ON CONFLICT(id) DO UPDATE SET detail=excluded.detail
  `);
  stmt.run({
    ...trace,
    id,
    type: trace.type || trace.platform || "codex_task",
    task_id: trace.taskId,
    run_id: trace.runId || trace.run_id || null,
    summary,
    detail,
    workspace_id: currentWorkspace,
    created_at: new Date().toISOString()
  });
  return trace;
}

// --- Settings Helper ---
export function getSetting(key, defaultObj = {}) {
  const row = db.prepare(`SELECT value_json FROM settings WHERE key = ? AND workspace_id = ?`).get(key, currentWorkspace);
  return row ? parseJson(row.value_json) : defaultObj;
}
export function putSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (workspace_id, key, value_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(workspace_id, key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at
  `).run(currentWorkspace, key, JSON.stringify(value), new Date().toISOString());
  return value;
}

// --- autopilot ---
export function getAutopilotState() {
  const settings = getSetting('autopilot_settings', {
    enabled: false, platform: "xhs", mode: "publish", accountLabel: DEFAULT_ACCOUNT_LABEL,
    timezone: "Asia/Shanghai", contentSource: "manual-or-auto", defaultTopic: "", videoDurationSeconds: 12, videoFps: 8
  });
  const topicQueue = db.prepare(`SELECT * FROM autopilot_topics WHERE workspace_id = ?`).all(currentWorkspace);
  const dailyPlans = db.prepare(`SELECT * FROM autopilot_daily_plans WHERE workspace_id = ?`).all(currentWorkspace)
    .map(r => ({ ...r, plan_json: parseJson(r.plan_json) }));
  
  return { settings, topicQueue, dailyPlans };
}

export async function putAutopilotSettings(settings) {
  const current = getSetting('autopilot_settings', {});
  return putSetting('autopilot_settings', { ...current, ...settings });
}

export async function putAutopilotTopic(topic) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO autopilot_topics (id, workspace_id, title, source, status, core, completed_at, created_at, updated_at)
    VALUES (@id, @workspace_id, @title, @source, @status, @core, @completed_at, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status, title=excluded.title, updated_at=excluded.updated_at
  `).run({
    ...topic,
    workspace_id: currentWorkspace,
    core: topic.core || topic.title || "",
    completed_at: topic.completed_at || null,
    created_at: topic.created_at || now,
    updated_at: now
  });
  return topic;
}

export async function updateAutopilotTopic(id, patch) {
  const topic = db.prepare(`SELECT * FROM autopilot_topics WHERE id = ? AND workspace_id = ?`).get(id, currentWorkspace);
  if (!topic) return null;
  const updated = { ...topic, ...patch };
  await putAutopilotTopic(updated);
  return updated;
}

export function getAutopilotPlan(dateKey) {
  const row = db.prepare(`SELECT * FROM autopilot_daily_plans WHERE date = ? AND workspace_id = ?`).get(dateKey, currentWorkspace);
  return row ? parseJson(row.plan_json) : null;
}

export function listAutopilotPlans(limit = 7) {
  return db.prepare(`SELECT * FROM autopilot_daily_plans WHERE workspace_id = ? ORDER BY date DESC LIMIT ?`)
    .all(currentWorkspace, limit)
    .map(r => parseJson(r.plan_json));
}

export async function putAutopilotPlan(plan) {
  db.prepare(`
    INSERT INTO autopilot_daily_plans (id, workspace_id, date, status, plan_json, run_id, created_at, updated_at)
    VALUES (@id, @workspace_id, @date, @status, @plan_json, @run_id, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET plan_json=excluded.plan_json, updated_at=excluded.updated_at
  `).run({ 
    id: plan.date, workspace_id: currentWorkspace, date: plan.date, status: plan.status || 'draft', 
    plan_json: JSON.stringify(plan), run_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() 
  });
  return plan;
}

export async function clearAutopilotDailyPlans() {
  db.prepare(`DELETE FROM autopilot_daily_plans WHERE workspace_id = ?`).run(currentWorkspace);
  return [];
}

export function findAutopilotSlot(slotId) {
  const plans = listAutopilotPlans(100);
  for (const plan of plans) {
    const slot = (plan.slots || []).find((item) => item.id === slotId);
    if (slot) return { plan, slot };
  }
  return null;
}

export async function updateAutopilotSlot(slotId, patch) {
  const found = findAutopilotSlot(slotId);
  if (!found) return null;
  Object.assign(found.slot, patch, { updated_at: new Date().toISOString() });
  await putAutopilotPlan(found.plan);
  return found.slot;
}

// --- engagement ---
export function getEngagementState() {
  const settings = getSetting('engagement_settings', {
    enabled: false, platform: "xhs", accountLabel: DEFAULT_ACCOUNT_LABEL, checkIntervalMinutes: 30,
    monitorComments: true, monitorMessages: true, allowCommentAutoReply: true, allowMessageAutoReply: false,
    maxRepliesPerRun: 8, brandVoice: "克制、真诚、有帮助，不索要隐私，不承诺医疗/法律/金融结果", lastQueuedAt: ""
  });
  const runs = listEngagementRuns(50);
  const items = listEngagementItems(50);
  return { settings, runs, items };
}

export async function putEngagementSettings(settings) {
  const current = getSetting('engagement_settings', {});
  return putSetting('engagement_settings', { ...current, ...settings });
}

export async function putEngagementRun(run) {
  db.prepare(`
    INSERT INTO engagement_runs (id, workspace_id, task_id, status, reason, platform, account_label, summary, items_count, replied_count, high_risk_count, screenshots, failure_reason, created_at, updated_at)
    VALUES (@id, @workspace_id, @taskId, @status, @reason, @platform, @accountLabel, @summary, @itemsCount, @repliedCount, @highRiskCount, @screenshots, @failureReason, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      status=excluded.status,
      reason=excluded.reason,
      platform=excluded.platform,
      account_label=excluded.account_label,
      summary=excluded.summary,
      items_count=excluded.items_count,
      replied_count=excluded.replied_count,
      high_risk_count=excluded.high_risk_count,
      screenshots=excluded.screenshots,
      failure_reason=excluded.failure_reason,
      updated_at=excluded.updated_at
  `).run({
    ...run, workspace_id: currentWorkspace,
    reason: run.reason || "",
    accountLabel: run.accountLabel || run.account_label || "",
    itemsCount: Number(run.itemsCount || run.items_count || 0),
    repliedCount: Number(run.repliedCount || run.replied_count || 0),
    highRiskCount: Number(run.highRiskCount || run.high_risk_count || 0),
    screenshots: JSON.stringify(run.screenshots || []),
    failureReason: run.failureReason || run.failure_reason || "",
    created_at: run.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  return run;
}

export function listEngagementRuns(limit = 20) {
  return db.prepare(`SELECT * FROM engagement_runs WHERE workspace_id = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?`)
    .all(currentWorkspace, limit).map(r => ({
      ...r, taskId: r.task_id, accountLabel: r.account_label, itemsCount: r.items_count,
      repliedCount: r.replied_count, highRiskCount: r.high_risk_count, failureReason: r.failure_reason,
      screenshots: parseJson(r.screenshots)
    }));
}

export async function putEngagementItems(items) {
  const stmt = db.prepare(`
    INSERT INTO engagement_items (id, workspace_id, task_id, platform, channel, author, text, source_url, post_title, received_at, risk, intent, sentiment, reply_draft, replied, reply_text, requires_human, last_seen_at, updated_at, created_at)
    VALUES (@id, @workspace_id, @taskId, @platform, @channel, @author, @text, @sourceUrl, @postTitle, @receivedAt, @risk, @intent, @sentiment, @replyDraft, @replied, @replyText, @requiresHuman, @last_seen_at, @updated_at, @created_at)
    ON CONFLICT(id) DO UPDATE SET reply_text=excluded.reply_text, replied=excluded.replied, updated_at=excluded.updated_at
  `);
  
  db.transaction(() => {
    for (const item of items) {
      stmt.run({
        ...item, workspace_id: currentWorkspace,
        taskId: item.taskId || '',
        sourceUrl: item.sourceUrl, postTitle: item.postTitle, receivedAt: item.receivedAt,
        replyDraft: item.replyDraft, replyText: item.replyText, requiresHuman: item.requiresHuman ? 1 : 0,
        replied: item.replied ? 1 : 0, updated_at: new Date().toISOString(), created_at: item.created_at || new Date().toISOString()
      });
    }
  })();
  return items;
}

export function listEngagementItems(limit = 60) {
  return db.prepare(`SELECT * FROM engagement_items WHERE workspace_id = ? ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT ?`)
    .all(currentWorkspace, limit).map(r => ({
      ...r, taskId: r.task_id, sourceUrl: r.source_url, postTitle: r.post_title, receivedAt: r.received_at,
      replyDraft: r.reply_draft, replyText: r.reply_text, requiresHuman: Boolean(r.requires_human), replied: Boolean(r.replied)
    }));
}

// --- series ---
export function getSeriesState() {
  const profiles = listSeriesProfiles();
  return { profiles };
}

export function getSeriesProfile(id) {
  const row = db.prepare(`SELECT * FROM series_profiles WHERE id = ? AND workspace_id = ?`).get(id, currentWorkspace);
  if (!row) return null;
  const settingsRow = db.prepare(`SELECT value_json FROM settings WHERE key = ? AND workspace_id = ?`).get(`series_profile_${id}`, currentWorkspace);
  return parseJson(settingsRow?.value_json) || null;
}

export function listSeriesProfiles() {
  const rows = db.prepare(`SELECT * FROM series_profiles WHERE workspace_id = ? ORDER BY COALESCE(updated_at, created_at) DESC`).all(currentWorkspace);
  return rows.map(r => getSeriesProfile(r.id)).filter(Boolean);
}

export async function putSeriesProfile(profile) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO series_profiles (id, workspace_id, title, description, platform, format, schedule, prompt, is_active, created_at, updated_at)
    VALUES (@id, @workspace_id, @title, @description, @platform, @format, @schedule, @prompt, @is_active, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, updated_at=excluded.updated_at
  `).run({
    ...profile,
    workspace_id: currentWorkspace,
    description: profile.description || "",
    platform: profile.platform || "xhs",
    format: profile.format || "xhs_series",
    schedule: profile.schedule || profile.cadence || "",
    prompt: profile.prompt || profile.description || "",
    is_active: profile.is_active ?? profile.status !== "paused" ? 1 : 0,
    created_at: profile.created_at || now,
    updated_at: now
  });
  putSetting(`series_profile_${profile.id}`, profile);
  return profile;
}

export async function updateSeriesProfile(id, patch) {
  const profile = getSeriesProfile(id);
  if (!profile) return null;
  Object.assign(profile, patch, { updated_at: new Date().toISOString() });
  await putSeriesProfile(profile);
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
  await putSeriesProfile(profile);
  return episode;
}

export async function updateSeriesEpisode(seriesId, episodeId, patch) {
  const profile = getSeriesProfile(seriesId);
  if (!profile?.episodes) return null;
  const episode = profile.episodes.find((item) => item.id === episodeId);
  if (!episode) return null;
  Object.assign(episode, patch, { updated_at: new Date().toISOString() });
  profile.updated_at = episode.updated_at;
  await putSeriesProfile(profile);
  return episode;
}
