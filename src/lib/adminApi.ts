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

type Ok = { ok: boolean; detail?: string }
export const bizApi = {
  // reads（业务页 real 模式取数）
  summary: <T = unknown>() => http.get<T>('/summary'),
  brands: <T = unknown>() => http.get<T>('/brands'),
  agents: <T = unknown>() => http.get<T>('/agents'),
  merchants: <T = unknown>() => http.get<T>('/merchants'),
  orders: <T = unknown>() => http.get<T>('/orders'),
  settlements: <T = unknown>() => http.get<T>('/settlements'),
  tickets: <T = unknown>() => http.get<T>('/tickets'),
  config: <T = unknown>() => http.get<T>('/config'),
  // writes（store 动作镜像）
  clearSettlement: (id: string) => http.post<Ok>(`/settlements/${id}/clear`),
  reconcile: (id: string) => http.post<Ok>(`/settlements/${id}/reconcile`),
  refundTicket: (id: string) => http.post<Ok>(`/tickets/${id}/refund`),
  refundOrder: (id: string) => http.post<Ok>(`/orders/${id}/refund`),
  updateTicket: (id: string, body: { status?: string; owner?: string; note?: string }) => http.patch<Ok>(`/tickets/${id}`, body),
  setMerchant: (id: string, state: string, label?: string) => http.post<Ok>(`/merchants/${id}/state`, { state, label }),
  addMerchant: (body: { brandId: string; channel: string; weight: number }) => http.post<Ok>('/merchants', body),
  setAgent: (id: string, status: string) => http.post<Ok>(`/agents/${id}/status`, { status }),
  settleAgent: (id: string) => http.post<Ok>(`/agents/${id}/settle`),
  addBrand: (body: { name: string; category: string; feeRate: number; period: number; reservePct: number; path: string }) => http.post<Ok & { id?: string }>('/brands', body),
  setBrandStatus: (id: string, status: string, label?: string) => http.patch<Ok>(`/brands/${id}/status`, { status, label }),
  setBrandConfig: (id: string, body: { feeRate?: number; period?: number; reservePct?: number; path?: string }) => http.patch<Ok>(`/brands/${id}/config`, body),
  setConfig: (body: Record<string, unknown>) => http.post<Ok>('/config', body),
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
