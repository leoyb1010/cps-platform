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

/* ── 主题（明亮 / 暗色 / 跟随系统）────────────────────────────
   令牌级切换：index.css 在 [data-theme='dark'] 下覆盖全部颜色令牌，
   组件零改动即全量换肤。system 档监听 prefers-color-scheme 实时跟随。 */
export type Theme = 'light' | 'dark' | 'system'

const THEME_KEY = 'cps-theme-v1'
function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'system'
}
let theme: Theme = typeof localStorage !== 'undefined' ? loadTheme() : 'system'
const themeListeners = new Set<() => void>()
const mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

/** 解析后的实际外观（system → 按系统偏好落地） */
export function resolvedTheme(): 'light' | 'dark' {
  if (theme === 'system') return mql?.matches ? 'dark' : 'light'
  return theme
}

function applyTheme() {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolvedTheme()
}
// 跟随系统：系统外观变化时（theme=system）实时切换
mql?.addEventListener?.('change', () => {
  if (theme === 'system') {
    applyTheme()
    themeListeners.forEach((l) => l())
  }
})

export function setTheme(t: Theme) {
  theme = t
  try {
    localStorage.setItem(THEME_KEY, t)
  } catch {
    /* ignore */
  }
  applyTheme()
  themeListeners.forEach((l) => l())
}
export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      themeListeners.add(l)
      return () => themeListeners.delete(l)
    },
    () => theme,
    () => theme,
  )
}
/** 应用启动时套用持久化主题（main.tsx 调一次，避免首帧闪白） */
export function initTheme() {
  applyTheme()
}
