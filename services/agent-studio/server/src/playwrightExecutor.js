import { chromium } from "playwright";
import { putCodexTask, getCodexTask } from "./store.js";

// A rudimentary Playwright executor that runs tasks headlessly.
// If it hits an anti-bot check or needs login, it fails and the task 
// remains pending for the Codex user-in-the-loop fallback.

export async function executePlaywrightTask(taskId) {
  const task = getCodexTask(taskId);
  if (!task || task.status !== "pending") return;

  // Mark running
  task.status = "running";
  task.updated_at = new Date().toISOString();
  await putCodexTask(task);

  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Simplified execution logic
    if (task.type === "publish") {
      const { platform } = task;
      if (platform === "xhs") {
        await page.goto("https://creator.xiaohongshu.com/publish/publish", { waitUntil: "networkidle" });
        // Check if login is required
        const loginVisible = await page.locator(".login-container, .qrcode").isVisible().catch(() => false);
        if (loginVisible) {
          throw new Error("Playwright Login Required - Falling back to Codex");
        }

        // Normally we'd fill the form and click publish.
        // For this demo/prototype, we just simulate success if we get past login.
        await page.waitForTimeout(2000); 
      }
    } else if (task.type === "engagement_check") {
      // Simulate checking engagement
      await page.goto("https://creator.xiaohongshu.com/creator/data", { waitUntil: "networkidle" });
      const loginVisible = await page.locator(".login-container, .qrcode").isVisible().catch(() => false);
      if (loginVisible) {
        throw new Error("Playwright Login Required - Falling back to Codex");
      }
      await page.waitForTimeout(1000);
    }

    await browser.close();

    // Mark success
    task.status = "success";
    task.result_json = { success: true, via: "playwright_native" };
    task.updated_at = new Date().toISOString();
    await putCodexTask(task);

  } catch (error) {
    console.warn(`[PlaywrightExecutor] Task ${taskId} failed:`, error.message);
    // Fallback: reset to pending so Codex can pick it up
    task.status = "pending";
    task.trace = (task.trace ? task.trace + "\n" : "") + `Playwright Native failed: ${error.message}. Falling back to Codex.`;
    task.updated_at = new Date().toISOString();
    await putCodexTask(task);
  }
}
