import { createHmac, timingSafeEqual } from "node:crypto";

// P0-7 租户身份仅来自 CPS 网关注入的「签名服务端头」。
//   校验 HMAC(secret, workspaceId\nuserId) 通过 → 采信其 workspaceId/userId（真实租户）；
//   否则一律锁到隔离的 "default" 工作区——绝不再从 body/query/x-workspace-id 取身份，
//   因为那些客户端可伪造，会让持 aigc.view 的用户自选 workspaceId 越权访问他人租户的作业/积分。
function verifyInternalSignature(secret, workspaceId, userId, signature) {
  if (!secret || !workspaceId || !signature) return false;
  const expected = createHmac("sha256", secret).update(`${workspaceId}\n${userId}`).digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(String(signature), "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function resolveRequestContext(c, _body = {}) {
  const secret = process.env.AIGC_INTERNAL_SECRET || "";
  const signedWorkspace = c.req.header("x-internal-workspace-id") || "";
  const signedUser = c.req.header("x-internal-user-id") || "";
  const signature = c.req.header("x-internal-sign") || "";
  const requestId = c.req.header("x-request-id") || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 可信路径：CPS 网关注入的签名头且 HMAC 校验通过 → 采信真实租户身份。
  if (verifyInternalSignature(secret, signedWorkspace, signedUser, signature)) {
    return {
      workspaceId: sanitizeId(signedWorkspace),
      userId: sanitizeId(signedUser || "cps-user"),
      requestId,
      plan: "free",
      isAuthenticated: true,
      authMode: "cps-gateway",
    };
  }

  // 无有效签名：锁到隔离的 "default" 工作区，绝不采信客户端传入的 workspaceId/userId（防越权自选租户）。
  //   配了 secret（生产/网关部署）→ 绕过签名的请求只能落 default；没配 secret（独立开发/直连演示）同样落 default。
  //   两种情况都不再从 body/query/x-workspace-id/x-user-id 取身份。
  return {
    workspaceId: "default",
    userId: "local-user",
    requestId,
    plan: "free",
    isAuthenticated: false,
    authMode: secret ? "locked-default" : "local-stub",
  };
}

export function sanitizeId(value) {
  const id = String(value || "default").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "-").replace(/-+/g, "-").slice(0, 80);
  return id || "default";
}
