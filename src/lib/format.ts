// 统一格式化工具 —— 金额、百分比、日期、紧凑数字

export function yuan(n: number, opts?: { decimals?: number; sign?: boolean }) {
  const d = opts?.decimals ?? 2
  const s = n.toLocaleString('zh-CN', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })
  return (opts?.sign && n > 0 ? '+' : '') + '¥' + s
}

// 万元口径（大额展示）
export function wan(n: number, decimals = 1) {
  const v = n / 1e4
  return v.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
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
