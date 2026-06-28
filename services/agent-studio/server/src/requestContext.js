export function resolveRequestContext(c, body = {}) {
  const headerWorkspace = c.req.header("x-workspace-id") || "";
  const queryWorkspace = c.req.query("workspaceId") || "";
  const bodyWorkspace = typeof body?.workspaceId === "string" ? body.workspaceId : "";
  const workspaceId = sanitizeId(headerWorkspace || bodyWorkspace || queryWorkspace || "default");
  const userId = sanitizeId(c.req.header("x-user-id") || body?.userId || "local-user");
  const requestId = c.req.header("x-request-id") || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    workspaceId,
    userId,
    requestId,
    plan: "free",
    isAuthenticated: false,
    authMode: "local-stub"
  };
}

export function sanitizeId(value) {
  const id = String(value || "default").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "-").replace(/-+/g, "-").slice(0, 80);
  return id || "default";
}
