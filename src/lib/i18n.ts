import { useSyncExternalStore } from 'react'

// ════════════════════════════════════════════════════════════════
//  i18n 骨架 —— 先收口不翻译。文案字典 + Intl 格式化统一入口。
//  目标：现在收口成本 1 周，两年后收口成本 1 个月。默认 zh-CN。
//  渐进迁移：新组件用 t('key')，旧硬编码文案逐步收进字典。
// ════════════════════════════════════════════════════════════════

export type Locale = 'zh-CN' | 'en-US'

// 首批公共文案（示范收口口径；业务文案随重构逐步并入）
const DICT: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    'common.confirm': '确认',
    'common.cancel': '取消',
    'common.save': '保存',
    'common.export': '导出',
    'common.loading': '加载中…',
    'common.empty': '暂无数据',
    'common.retry': '重试',
    'nav.dashboard': '经营总览',
    'nav.settlement': '清结算',
    'nav.risk': '风控合规',
    'action.refund': '退款',
    'action.fuse': '熔断',
  },
  'en-US': {
    'common.confirm': 'Confirm',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.export': 'Export',
    'common.loading': 'Loading…',
    'common.empty': 'No data',
    'common.retry': 'Retry',
    'nav.dashboard': 'Overview',
    'nav.settlement': 'Settlement',
    'nav.risk': 'Risk & Compliance',
    'action.refund': 'Refund',
    'action.fuse': 'Circuit-break',
  },
}

const KEY = 'cps-locale-v1'
function load(): Locale {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'zh-CN' || v === 'en-US') return v
  } catch {
    /* ignore */
  }
  return 'zh-CN'
}
let locale: Locale = typeof localStorage !== 'undefined' ? load() : 'zh-CN'
const listeners = new Set<() => void>()

export function setLocale(l: Locale) {
  locale = l
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn())
}
export function getLocale(): Locale {
  return locale
}
/** 翻译：缺 key 时回退 zh-CN，再回退 key 本身（渐进迁移安全）。 */
export function t(key: string): string {
  return DICT[locale][key] ?? DICT['zh-CN'][key] ?? key
}
export function useLocale(): Locale {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => locale,
    () => locale,
  )
}

// 数字/货币/日期统一走 Intl（口径一处控制，避免各页各写 toLocaleString）
export function fmtNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, opts).format(n)
}
export function fmtCurrency(n: number): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 }).format(n)
}
