// Deterministic local browser executor (P1).
//
// Drives your REAL logged-in Chrome profile via Playwright persistent context to consume publish
// tasks from /api/codex/pending-tasks. This is the reliable replacement for the agentic
// computer-use executor: same real session / fingerprint / human pace (so there is nothing to
// "bypass" on the platform side), but fast, free and deterministic.
//
// Safety: opt-in (you start it), browser is VISIBLE, default is DRAFT and it NEVER clicks the final
// publish button unless the task mode is publish/schedule AND EXECUTOR_ALLOW_PUBLISH=1. On anything
// uncertain (not logged in, captcha, structure change) it stops and reports waiting_for_user with a
// screenshot instead of guessing.
//
// Usage:
//   node scripts/playwright-executor.js
// Env:
//   BFF_URL                     default http://127.0.0.1:48787
//   EXECUTOR_PROFILE_DIR        Chrome user-data-dir to reuse your real login (default under ~/Library)
//   EXECUTOR_CHANNEL            chrome | msedge | chromium   (default chrome)
//   EXECUTOR_POLL_INTERVAL_MS   default 5000
//   EXECUTOR_AUTOFILL           1 to attempt platform draft fill (default 0 = open + handoff)
//   EXECUTOR_ALLOW_PUBLISH      1 to allow final publish for mode=publish/schedule (default 0)
//   EXECUTOR_SHOT_DIR           screenshot output dir (default os.tmpdir()/agent-studio-shots)

import path from "node:path";
import os from "node:os";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.BFF_URL || "http://127.0.0.1:48787";
const pollIntervalMs = Number(process.env.EXECUTOR_POLL_INTERVAL_MS || 5000);
const channel = process.env.EXECUTOR_CHANNEL || "chrome";
const autofill = process.env.EXECUTOR_AUTOFILL === "1";
const allowPublish = process.env.EXECUTOR_ALLOW_PUBLISH === "1";
const profileDir = process.env.EXECUTOR_PROFILE_DIR
  || path.join(os.homedir(), "Library", "Application Support", "AgentStudioContentOS", "executor-chrome-profile");
const shotDir = process.env.EXECUTOR_SHOT_DIR || path.join(os.tmpdir(), "agent-studio-shots");

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`${pathname} -> ${response.status}`);
  return response.json();
}

function reportResult({ task, status, screenshots = [], failureReason = "", postUrl = "", trace = [] }) {
  return api("/api/codex/task-result", {
    method: "POST",
    body: JSON.stringify({
      taskId: task.id,
      status,
      platform: task.platform,
      screenshots,
      postUrl,
      failureReason,
      trace
    })
  });
}

// Heuristic login check: a logged-out creator page redirects to / shows an explicit login control.
async function looksLoggedOut(page) {
  const url = page.url();
  if (/login|signin|passport|\/auth/i.test(url)) return true;
  const loginControl = await page
    .locator("text=/登录|登入|sign in|log in/i")
    .first()
    .isVisible()
    .catch(() => false);
  return loginControl;
}

async function screenshot(context, task, page) {
  await mkdir(shotDir, { recursive: true });
  const file = path.join(shotDir, `${task.id}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return file;
}

// Conservative per-platform draft fill. Selectors WILL drift; every step is best-effort and any
// miss falls back to a human handoff rather than guessing. Validate against the live site before
// trusting unattended.
async function tryDraftFill(page, task) {
  const copy = task.runbook_json?.content || {};
  if (task.platform === "xhs") {
    // Xiaohongshu web creator publish page. Image/text note composer.
    const title = String(copy.title || "").slice(0, 20);
    const body = String(copy.body || "");
    const titleBox = page.locator('input[placeholder*="标题"], textarea[placeholder*="标题"]').first();
    if (await titleBox.isVisible().catch(() => false)) await titleBox.fill(title).catch(() => {});
    const bodyBox = page.locator('[contenteditable="true"], textarea[placeholder*="正文"], textarea[placeholder*="输入"]').first();
    if (await bodyBox.isVisible().catch(() => false)) await bodyBox.fill(body).catch(() => {});
    return true;
  }
  return false;
}

async function handleTask(context, task) {
  const page = await context.newPage();
  const openUrl = task.runbook_json?.openUrl || task.runbook_json?.candidateUrls?.[0];
  const trace = [{ at: new Date().toISOString(), action: "executor_opened", url: openUrl }];
  try {
    await reportResult({ task, status: "running", trace });
    if (!openUrl) {
      await reportResult({ task, status: "failed", failureReason: "task has no openUrl", trace });
      return;
    }
    await page.goto(openUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);

    if (await looksLoggedOut(page)) {
      const shot = await screenshot(context, task, page);
      await reportResult({
        task,
        status: "waiting_for_user",
        screenshots: [shot],
        failureReason: "目标账号未登录。请在弹出的真实浏览器里登录后，任务会在下次轮询重试。",
        trace
      });
      return;
    }

    const filled = autofill ? await tryDraftFill(page, task).catch(() => false) : false;
    const canPublish = allowPublish && (task.mode === "publish" || task.mode === "schedule");
    const shot = await screenshot(context, task, page);

    // Draft posture (default): never click final publish. Stop at the composer for human review.
    if (!canPublish) {
      await reportResult({
        task,
        status: "waiting_for_user",
        screenshots: [shot],
        failureReason: filled
          ? "已在真实浏览器填好草稿并停在确认页，请人工检查后发布。"
          : "已在真实浏览器打开发布页（未自动填写）。设 EXECUTOR_AUTOFILL=1 可尝试填稿；当前停在确认页等人工。",
        trace: [...trace, { at: new Date().toISOString(), action: filled ? "draft_filled" : "opened_only" }]
      });
      return;
    }

    // Explicit publish authorized: still leave the actual final click to a maintained per-platform
    // routine. Until that routine is validated against the live site, hand off rather than risk a
    // wrong/duplicate post.
    await reportResult({
      task,
      status: "waiting_for_user",
      screenshots: [shot],
      failureReason: "mode=publish 已授权，但最终发布动作需经过校验过的平台脚本；当前停在确认页等待接管。",
      trace: [...trace, { at: new Date().toISOString(), action: "publish_authorized_awaiting_validated_routine" }]
    });
  } catch (error) {
    const shot = await screenshot(context, task, page).catch(() => "");
    await reportResult({
      task,
      status: "waiting_for_user",
      screenshots: shot ? [shot] : [],
      failureReason: `executor error: ${error?.message || String(error)}`,
      trace
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  await mkdir(profileDir, { recursive: true });
  console.log(`[executor] real-profile dir: ${profileDir}`);
  console.log(`[executor] channel=${channel} autofill=${autofill} allowPublish=${allowPublish}`);
  console.log(`[executor] watching ${baseUrl} every ${pollIntervalMs}ms (visible browser)`);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel,
    viewport: { width: 1280, height: 900 }
  });

  const shutdown = async () => {
    await context.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  for (;;) {
    try {
      const data = await api("/api/codex/pending-tasks");
      const task = (data.tasks || []).find((item) => item.status === "pending" && item.type === "publish");
      if (task) {
        console.log(`[executor] claim ${task.id} ${task.platform} mode=${task.mode}`);
        await handleTask(context, task);
      }
    } catch (error) {
      console.error(`[executor] ${error?.message || error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

// Only auto-run when invoked directly.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
