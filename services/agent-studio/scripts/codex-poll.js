const baseUrl = globalThis.process?.env?.BFF_URL || "http://127.0.0.1:48787";
const intervalMs = Number(globalThis.process?.env?.CODEX_POLL_INTERVAL_MS || 5000);

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response.json();
}

async function markRunning(task) {
  await request("/api/codex/task-result", {
    method: "POST",
    body: JSON.stringify({
      taskId: task.id,
      status: "running",
      platform: task.platform,
      screenshots: task.screenshots || [],
      trace: [{ at: new Date().toISOString(), action: "codex_poller_claimed" }]
    })
  });
}

async function markWaiting(task) {
  const payload = {
    taskId: task.id,
    status: "waiting_for_user",
    platform: task.platform,
    screenshots: task.screenshots || [],
    failureReason: "Codex app/local browser executor must perform this runbook and post trace back.",
    trace: [{ at: new Date().toISOString(), action: "handoff_to_local_browser_executor", runbook: task.runbook_json }]
  };

  await request("/api/codex/task-result", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (task.engagement || task.runbook_json?.engagement) {
    await request("/api/engagement/record", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        summary: "已交接给 Codex 浏览器执行器，等待读取评论和私信。"
      })
    });
  }
}

async function tick() {
  const data = await request("/api/codex/pending-tasks");
  const task = data.tasks?.find((item) => item.status === "pending");
  if (!task) {
    console.log(`[${new Date().toISOString()}] no pending tasks`);
    return;
  }

  console.log(`[${new Date().toISOString()}] claimed ${task.id} ${task.platform} ${task.mode}`);
  console.log(JSON.stringify(task.runbook_json, null, 2));
  await markRunning(task);
  await markWaiting(task);
}

console.log(`Codex poller watching ${baseUrl} every ${intervalMs}ms`);
for (;;) {
  try {
    await tick();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${error.message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
