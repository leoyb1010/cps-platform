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

export function compact(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1e8) return (n / 1e8).toFixed(2) + '亿'
  if (abs >= 1e4) return (n / 1e4).toFixed(1) + '万'
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return String(Math.round(n))
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
