// 统一格式化工具 —— 金额、百分比、日期、紧凑数字

export function yuan(n: number, opts?: { decimals?: number; sign?: boolean }) {
  const d = opts?.decimals ?? 2
  const s = n.toLocaleString('zh-CN', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })
  return (opts?.sign && n > 0 ? '+' : '') + '¥' + s
}

// 自动选择 元/万/亿
export function money(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1e8) return '¥' + (n / 1e8).toFixed(2) + '亿'
  if (abs >= 1e4) return '¥' + (n / 1e4).toFixed(1) + '万'
  return '¥' + Math.round(n).toLocaleString('zh-CN')
}

export function pct(n: number, decimals = 1) {
  return (
    n.toLocaleString('zh-CN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + '%'
  )
}


export function int(n: number) {
  return Math.round(n).toLocaleString('zh-CN')
}

export function delta(n: number, decimals = 1) {
  const s = Math.abs(n).toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return (n >= 0 ? '+' : '−') + s + '%'
}

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

// 把文本/CSV 内容下载为文件（统一收口各处内联的 Blob 下载逻辑）。
export function downloadText(filename: string, content: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + content], { type: 'text/plain;charset=utf-8' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// 复制到剪贴板（统一入口）：非安全上下文 navigator.clipboard 为 undefined，
// 直接 .then 会 TypeError 崩页。此处 null 检查 + document.execCommand 兜底 + 结果回调。
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to legacy */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// CSV 字段转义：包裹双引号 + 转义内部引号，防逗号/换行破列；
// 前导 = + - @ 加单引号前缀，中和 Excel 公式注入（=cmd()… 攻击）。
export function csvCell(v: unknown): string {
  let s = String(v ?? '')
  if (/^[=+\-@]/.test(s)) s = "'" + s
  return `"${s.replace(/"/g, '""')}"`
}
