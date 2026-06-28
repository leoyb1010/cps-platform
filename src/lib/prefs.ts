import { useSyncExternalStore } from 'react'

// 视图偏好（简洁/专家）。external store + localStorage，仿 auth.ts 骨架。
export type ViewMode = 'simple' | 'expert'

const KEY = 'cps-prefs-v1'
function load(): ViewMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'simple' || v === 'expert') return v
  } catch {
    /* ignore */
  }
  return 'simple'
}
let mode: ViewMode = typeof localStorage !== 'undefined' ? load() : 'simple'
const listeners = new Set<() => void>()

export function setViewMode(m: ViewMode) {
  mode = m
  try {
    localStorage.setItem(KEY, m)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}
export function useViewMode(): ViewMode {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => mode,
    () => mode,
  )
}
