import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft, Package, Users, CreditCard, MessageSquareWarning, Receipt } from 'lucide-react'
import { useStore } from '../../lib/store'
import { CHANNEL_LABEL } from '../../lib/data'
import { cx } from '../../lib/format'

interface Hit {
  label: string
  sub: string
  to: string
  icon: React.ReactNode
  kw: string
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const nav = useNavigate()
  const s = useStore()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
    }
  }, [open])

  const hits = useMemo<Hit[]>(() => {
    const all: Hit[] = [
      ...s.brands.map((b) => ({ label: b.name, sub: `品牌 · ${b.category}`, to: `/brands/${b.id}`, icon: <Package size={15} />, kw: b.name + b.id + b.category })),
      ...s.agents.map((a) => ({ label: a.name, sub: `代理 · ${a.id} · 信用分 ${a.creditScore}`, to: '/agents', icon: <Users size={15} />, kw: a.name + a.id })),
      ...s.merchants.map((m) => ({ label: m.id, sub: `商户号 · ${CHANNEL_LABEL[m.channel]} · ${m.mid}`, to: '/merchants', icon: <CreditCard size={15} />, kw: m.id + m.mid })),
      ...s.complaints.map((c) => ({ label: c.id, sub: `工单 · ${c.reason}`, to: '/complaints', icon: <MessageSquareWarning size={15} />, kw: c.id + c.reason })),
      ...s.orders.slice(0, 12).map((o) => ({ label: o.id, sub: `订单 · ${o.plan}`, to: '/orders', icon: <Receipt size={15} />, kw: o.id + o.plan })),
    ]
    const query = q.trim().toLowerCase()
    if (!query) return all.slice(0, 8)
    return all.filter((h) => h.kw.toLowerCase().includes(query)).slice(0, 10)
  }, [q, s])

  useEffect(() => {
    if (sel >= hits.length) setSel(0)
  }, [hits.length, sel])

  if (!open) return null
  const go = (h: Hit) => { nav(h.to); setOpen(false) }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-ink/40" style={{ animation: 'fadeIn .15s both' }} onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]" style={{ animation: 'revUpSm .2s both' }}>
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search size={16} className="text-ink-4" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(hits.length - 1, i + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)) }
              else if (e.key === 'Enter' && hits[sel]) go(hits[sel])
            }}
            placeholder="搜索品牌 / 代理 / 商户号 / 工单 / 订单…"
            className="flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-4"
          />
          <kbd className="tnum rounded-[3px] border border-line px-1.5 text-[10px] text-ink-5">ESC</kbd>
        </div>
        <div className="max-h-[340px] overflow-y-auto py-1.5">
          {hits.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12.5px] text-ink-4">无匹配结果</div>
          ) : (
            hits.map((h, i) => (
              <button
                key={h.to + h.label + i}
                onMouseEnter={() => setSel(i)}
                onClick={() => go(h)}
                className={cx('flex w-full items-center gap-3 px-4 py-2.5 text-left', i === sel ? 'bg-surface-muted' : '')}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-sunken text-ink-3">{h.icon}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-ink">{h.label}</span><span className="block truncate text-[11px] text-ink-4">{h.sub}</span></span>
                {i === sel && <CornerDownLeft size={13} className="text-ink-4" />}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-ink-4">
          <span><kbd className="tnum rounded border border-line px-1">↑↓</kbd> 选择</span>
          <span><kbd className="tnum rounded border border-line px-1">↵</kbd> 打开</span>
          <span className="ml-auto">⌘K 唤起</span>
        </div>
      </div>
    </div>
  )
}
