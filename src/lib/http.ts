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

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(API_BASE + path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers || {}),
    },
  })
}

let refreshing: Promise<boolean> | null = null
async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
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
    })()
  }
  return refreshing
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
