// ════════════════════════════════════════════════════════════════
//  真实后端 HTTP 客户端 —— access token 内存保存 + 401 静默刷新 + 凭证 cookie
//  通过 VITE_API_MODE 切换：'real'（调后端）/ 其它（前端 mock 模式，本文件不启用）
// ════════════════════════════════════════════════════════════════
export const API_BASE: string = import.meta.env.VITE_API_BASE || 'http://localhost:3001'
export const API_MODE: string = import.meta.env.VITE_API_MODE || 'mock'
export const isRealApi = API_MODE === 'real'

let accessToken: string | null = null
export const setAccessToken = (t: string | null) => {
  accessToken = t
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

const REQUEST_TIMEOUT_MS = 15000 // 请求超时：弱网下不再无限挂起，超时归一为可读错误

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  // 调用方未自带 signal 时，挂 15s 超时（AbortSignal.timeout 现代浏览器均支持）
  const signal = init.signal ?? (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined)
  try {
    return await fetch(API_BASE + path, {
      ...init,
      signal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init.headers || {}),
      },
    })
  } catch (e) {
    // 超时(TimeoutError/AbortError) 与网络错误归一为 status=0 的 ApiError，
    // 供上层区分（0=网络/超时→保留旧数据，非 403）并给用户可读提示。
    const timeout = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')
    throw new ApiError(0, timeout ? '请求超时，请检查网络后重试' : '网络异常，请稍后重试')
  }
}

// 会话丢失回调（auth 层注册）：刷新彻底失败时清登录态，避免"僵尸控制台"。
// 用回调而非直接 import auth —— auth 依赖本模块，反向静态依赖会成环。
let authLostCb: (() => void) | null = null
export function onAuthLost(cb: () => void) {
  authLostCb = cb
}

let refreshing: Promise<boolean> | null = null
async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    const doRefresh = async () => {
      try {
        const r = await raw('/auth/refresh', { method: 'POST' })
        if (!r.ok) return false
        const d = await r.json()
        setAccessToken(d.access)
        return true
      } catch {
        return false
      } finally {
        setTimeout(() => (refreshing = null), 0)
      }
    }
    // 跨标签页串行化：刷新令牌旋转是一次性的，两个 tab 并发 refresh 会触发服务端
    // 重放检测（按令牌被盗处理，吊销全会话族）。Web Locks 保证同刻只有一个 tab 在旋转。
    refreshing =
      typeof navigator !== 'undefined' && 'locks' in navigator
        ? navigator.locks.request('cps-auth-refresh', doRefresh)
        : doRefresh()
  }
  const ok = await refreshing
  if (!ok) authLostCb?.()
  return ok
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await raw(path, init)
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const ok = await tryRefresh()
    if (ok) res = await raw(path, init)
  }
  if (!res.ok) {
    let msg = `请求失败 (${res.status})`
    try {
      const e = await res.json()
      msg = e.message || msg
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const http = {
  get: <T>(p: string) => api<T>(p),
  post: <T>(p: string, body?: unknown, headers?: Record<string, string>) =>
    api<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined, headers }),
  patch: <T>(p: string, body?: unknown) => api<T>(p, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
}
