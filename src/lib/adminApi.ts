// ════════════════════════════════════════════════════════════════
//  后台管理 — 真实后端 API（成员 / 角色 / 权限点 / 审计）+ useApi 取数 Hook
//  真实模式(VITE_API_MODE=real)下调后端；mock 模式直接用 fallback，不发请求。
//  说明：业务读写的 mock 契约见 ./api.ts（L2）；服务端业务端点见 bizApi。
// ════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { http, isRealApi } from './http'

export interface RemoteMember {
  id: string
  name: string
  account: string
  roleId: string
  roleName: string
  status: string
  scopeType: string
}
export interface RemoteRole {
  id: string
  name: string
  description: string
  permissions: string[]
  builtin: boolean
}
export interface RemoteAudit {
  id: string
  actorName: string
  role: string
  action: string
  resource: string
  resourceId: string
  category: string
  detail: string
  at: string
}

export const adminApi = {
  members: () => http.get<RemoteMember[]>('/members'),
  roles: () => http.get<RemoteRole[]>('/roles'),
  updateRole: (id: string, permissions: string[]) => http.patch<{ ok: boolean; detail?: string }>(`/roles/${id}`, { permissions }),
  updateMember: (id: string, body: { roleId?: string; status?: string }) => http.patch<{ ok: boolean; detail?: string }>(`/members/${id}`, body),
  audit: (category?: string) => http.get<RemoteAudit[]>(`/audit-logs${category && category !== 'all' ? `?category=${category}` : ''}`),
}

export const bizApi = {
  summary: () => http.get('/summary'),
  clearSettlement: (id: string) => http.post<{ ok: boolean; detail?: string }>(`/settlements/${id}/clear`),
  reconcile: (id: string) => http.post<{ ok: boolean; detail?: string }>(`/settlements/${id}/reconcile`),
  refundTicket: (id: string) => http.post<{ ok: boolean; detail?: string }>(`/tickets/${id}/refund`),
  setMerchant: (id: string, state: string, label?: string) => http.post<{ ok: boolean; detail?: string }>(`/merchants/${id}/state`, { state, label }),
  setAgent: (id: string, status: string) => http.post<{ ok: boolean; detail?: string }>(`/agents/${id}/status`, { status }),
}

type ApiState<T> = { data: T | null; loading: boolean; error: string | null; reload: () => void }

/** 真实模式下取数；mock 模式直接返回 fallback（不发请求）。 */
export function useApi<T>(fetcher: () => Promise<T>, fallback: T, deps: unknown[] = []): ApiState<T> {
  const [data, setData] = useState<T | null>(isRealApi ? null : fallback)
  const [loading, setLoading] = useState(isRealApi)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!isRealApi) {
      setData(fallback)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    fetcher()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e?.message || '加载失败'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps])

  return { data, loading, error, reload: () => setTick((t) => t + 1) }
}
