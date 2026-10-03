// ════════════════════════════════════════════════════════════════
//  真实后端 HTTP 客户端 —— access token 内存保存 + 401 静默刷新 + 凭证 cookie
//  通过 VITE_API_MODE 切换：'real'（调后端）/ 其它（前端 mock 模式，本文件不启用）
// ════════════════════════════════════════════════════════════════
export const API_BASE: string = import.meta.env.VITE_API_BASE || 'http://localhost:3001'
export const API_MODE: string = import.meta.env.VITE_API_MODE || 'mock'
export const isRealApi = API_MODE === 'real'

let sessionVersion = 0
let accessToken: string | null = null
let principalId: string | null = null
export const getSessionVersion = () => sessionVersion
export const getPrincipalId = () => principalId
export const setAccessToken = (t: string | null, userId?: string) => {
  accessToken = t
  principalId = t ? userId ?? null : null
  sessionVersion += 1
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

const REQUEST_TIMEOUT_MS = 15000 // 请求超时：弱网下不再无限挂起，超时归一为可读错误

// Cookie-changing responses must arrive in request order. Rejecting stale JSON
// alone cannot undo Set-Cookie already applied by the browser. Use one queue per
// tab plus the same Web Lock across tabs; callers capture their bearer up front.
let authQueue: Promise<unknown> = Promise.resolve()
function serializeAuthRequest(run: () => Promise<Response>): Promise<Response> {
  const result = authQueue.then(() =>
    typeof navigator !== 'undefined' && 'locks' in navigator
      ? navigator.locks.request('cps-auth-refresh', run)
      : run(),
  )
  authQueue = result.catch(() => {})
  return result
}

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  const bearer = accessToken
  // 调用方未自带 signal 时，挂 15s 超时（AbortSignal.timeout 现代浏览器均支持）
  const hasExternalSignal = !!init.signal
  try {
    const run = () => fetch(API_BASE + path, {
      ...init,
      signal: init.signal ?? (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined),
      credentials: 'include',
      headers: {
        // GET/无 body 请求不带 Content-Type：避免让本可为"简单请求"的 GET 触发多余 CORS 预检
        ...(init.body != null ? { 'Content-Type': 'application/json' } : {}),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(init.headers || {}),
      },
    })
    return await (/^\/auth\/(login|refresh|logout|change-password)$/.test(path) ? serializeAuthRequest(run) : run())
  } catch (e) {
    const aborted = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')
    // 外部传入 signal 的主动取消（如 useApi 组件卸载/竞态清理）≠ 超时：原样抛出，
    // 让调用方按"已取消"处理，不误报"请求超时"。我们自挂的超时才归一为可读超时错误。
    if (aborted && hasExternalSignal) throw e
    // 超时/网络错误归一为 status=0 的 ApiError，供上层区分（0=网络/超时→保留旧数据，非 403）并给用户可读提示。
    throw new ApiError(0, aborted ? '请求超时，请检查网络后重试' : '网络异常，请稍后重试')
  }
}

// 会话丢失回调（auth 层注册）：刷新彻底失败时清登录态，避免"僵尸控制台"。
// 用回调而非直接 import auth —— auth 依赖本模块，反向静态依赖会成环。
let authLostCb: (() => void) | null = null
export function onAuthLost(cb: () => void) {
  authLostCb = cb
}

let refreshing: { version: number; promise: Promise<boolean> } | null = null
async function tryRefresh(): Promise<boolean> {
  if (!refreshing || refreshing.version !== sessionVersion) {
    const startedVersion = sessionVersion
    const request = { version: startedVersion, promise: Promise.resolve(false) }
    const doRefresh = async () => {
      try {
        if (sessionVersion !== startedVersion) return false
        const r = await raw('/auth/refresh', { method: 'POST' })
        if (sessionVersion !== startedVersion) return false
        if (!r.ok) {
          if (r.status === 401 || r.status === 403) authLostCb?.()
          return false
        }
        const d = await r.json()
        if (sessionVersion !== startedVersion || typeof d?.access !== 'string' || !d.access) return false
        // Another tab may have replaced the shared cookie with another account.
        // Never replay this tab's operation under that different principal.
        if (principalId && d.user?.id !== principalId) {
          setAccessToken(null)
          authLostCb?.()
          return false
        }
        // Refresh rotates the credential within the same principal generation.
        accessToken = d.access
        return true
      } catch {
        return false
      } finally {
        setTimeout(() => { if (refreshing === request) refreshing = null }, 0)
      }
    }
    // All cookie-changing auth endpoints share raw's queue and cross-tab lock.
    request.promise = doRefresh()
    refreshing = request
  }
  return refreshing.promise
}

export async function api<T = unknown>(path: string, init: RequestInit = {}, responseType: 'json' | 'blob' = 'json'): Promise<T> {
  const startedVersion = sessionVersion
  const assertCurrentSession = () => {
    if (sessionVersion !== startedVersion) throw new ApiError(401, '登录账户已变更，请在当前账户重新操作')
  }
  let res = await raw(path, init)
  assertCurrentSession()
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const ok = await tryRefresh()
    assertCurrentSession()
    if (ok) {
      res = await raw(path, init)
      assertCurrentSession()
    }
  }
  if (!res.ok) {
    let msg = `请求失败 (${res.status})`
    let details: unknown
    try {
      const e = await res.json()
      msg = e.message || msg
      details = e
    } catch {
      /* ignore */
    }
    assertCurrentSession()
    throw new ApiError(res.status, msg, details)
  }
  if (res.status === 204) return undefined as T
  const data = (responseType === 'blob' ? await res.blob() : await res.json()) as T
  assertCurrentSession()
  return data
}

export const http = {
  get: <T>(p: string) => api<T>(p),
  post: <T>(p: string, body?: unknown, headers?: Record<string, string>) =>
    api<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined, headers }),
  patch: <T>(p: string, body?: unknown) => api<T>(p, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
}
