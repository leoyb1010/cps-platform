import { HTTPException } from "hono/http-exception";
import { decodeGatewayIdentity } from "./gatewayIdentity.js";

export function resolveRequestContext(c, _body = {}) {
  const secret = process.env.AIGC_INTERNAL_SECRET || "";
  const signedWorkspace = c.req.header("x-internal-workspace-id") || "";
  const signedUser = c.req.header("x-internal-user-id") || "";
  const signature = c.req.header("x-internal-sign") || "";
  const requestId = c.req.header("x-request-id") || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let identity;
  try { identity = decodeGatewayIdentity(secret, signedWorkspace, signedUser, signature); }
  catch { throw new HTTPException(401, { message: "Noncanonical gateway identity" }); }
  if (identity) {
    return { ...identity, requestId, plan: "free", isAuthenticated: true, authMode: "cps-gateway" };
  }

  // Configured gateways must fail closed; a shared fallback is not tenant isolation.
  if (secret) throw new HTTPException(401, { message: "Valid gateway identity required" });
  if (process.env.NODE_ENV === "production") throw new HTTPException(503, { message: "Gateway identity is not configured" });
  // The unsigned workspace is only for an explicitly non-production local demo.
  return {
    workspaceId: "default",
    userId: "local-user",
    requestId,
    plan: "free",
    isAuthenticated: false,
    authMode: "local-stub",
  };
}
