import { resolveRequestContext } from './requestContext.js';

export async function enforceRequestBoundary(c, next) {
  if (c.req.path === '/api/health') return next();
  const ctx = resolveRequestContext(c);
  if (ctx.isAuthenticated) {
    // Only these families use explicit per-request workspace IDs throughout.
    // Legacy local automation/settings remain single-user and cannot be exposed
    // through a production multi-tenant gateway as though they were isolated.
    if (!/^\/api\/(factory|billing)\//.test(c.req.path)) {
      return c.json({ok:false,message:'This local-only route is unavailable in gateway mode'},403);
    }
  } else {
    const hosts=new Set(['localhost','127.0.0.1','::1','[::1]']);
    if (!hosts.has(new URL(c.req.url).hostname)) return c.json({ok:false,message:'Local demo only'},403);
    const origin=c.req.header('origin');
    if (origin) {
      try {
        if (!hosts.has(new URL(origin).hostname)) return c.json({ok:false,message:'Untrusted request origin'},403);
      } catch {return c.json({ok:false,message:'Invalid request origin'},403)}
    }
  }
  return next();
}
