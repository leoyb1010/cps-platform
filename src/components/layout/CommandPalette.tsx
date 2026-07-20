import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft, Package, Users, CreditCard, MessageSquareWarning, Receipt, Zap, Landmark, Moon, Sun } from 'lucide-react'
import { useStore, refundOrder, setMerchantState, isOrderRefunded } from '../../lib/store'
import { CHANNEL_LABEL } from '../../lib/data'
import { useCan } from '../../lib/auth'
import { setTheme } from '../../lib/prefs'
import { useToast } from '../ui/overlays'
import { cx } from '../../lib/format'
import { matchAsk, looksLikeQuestion } from '../../lib/askTemplates'
import { MessageCircleQuestion } from 'lucide-react'

interface Hit {
  label: string
  sub: string
  to?: string
  icon: React.ReactNode
  kw: string
  run?: () => void // 动作命中：执行而非跳转
  danger?: boolean // 资金/状态类：需二次确认
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [confirm, setConfirm] = useState<Hit | null>(null)
  const nav = useNavigate()
  const s = useStore()
  const can = useCan()
  const toast = useToast()
  const examples = [
    can('order.refund') ? '退款 订单号' : null,
    can('merchant.write') ? '熔断 商户号' : null,
    can('settlement.clear') ? '开始结算' : null,
  ].filter((x): x is string => !!x)
  const inputHint = examples.length ? `搜索或执行：${examples.join(' · ')}` : '搜索当前角色有权查看的数据'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape') {
        // 分层退出：先关确认弹窗、再关面板（一次 Esc 不应跳过资金确认层直接全关）
        setConfirm((c) => {
          if (c) return null
          setOpen(false)
          return null
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      // 上次 Esc 关面板时若确认弹窗还开着，不清会在下次 ⌘K 直接复活一个资金确认框——
      // 误按一次 Enter 钱就动了。每次唤起都从干净状态开始。
      setConfirm(null)
    }
  }, [open])

  // 可执行动作：⌘K 从"搜索"升级为"动作"。有权限才出现，资金/状态类走二次确认。
  // 高频操作从 3-4 次点击降到一次键入（如「退款 O-99812」「熔断 M-BL-01」「开始结算」）。
  const actions = useMemo<Hit[]>(() => {
    const list: Hit[] = []
    // 全局动作（始终可用）
    list.push({ label: '切换深色主题', sub: '动作 · 主题', icon: <Moon size={15} />, kw: '切暗色 深色 dark theme 主题', run: () => setTheme('dark') })
    list.push({ label: '切换明亮主题', sub: '动作 · 主题', icon: <Sun size={15} />, kw: '切亮色 明亮 light theme 主题', run: () => setTheme('light') })
    if (can('settlement.clear')) list.push({ label: '开始本期结算', sub: '动作 · 进入结算工作台', icon: <Landmark size={15} />, kw: '开始结算 结算工作台 月结 settle', to: '/settlement/run' })
    // 资源型动作：退款(按订单)、熔断/恢复(按号池)——绑定具体资源，需权限 + 确认
    if (can('order.refund')) {
      for (const o of s.orders.filter((o) => o.type !== 'refund' && o.type !== 'chargeback' && !isOrderRefunded(o.id)).slice(0, 20)) {
        list.push({ label: `退款 ${o.id}`, sub: `动作 · ${o.plan} ¥${Math.abs(o.amount)}（自动追回分成）`, icon: <Zap size={15} className="text-brand" />, kw: `退款 refund ${o.id} ${o.plan}`, danger: true, run: () => { refundOrder(o.id); toast({ tone: 'good', text: `${o.id} 已退款，联动冲账完成` }) } })
      }
    }
    if (can('merchant.write')) {
      for (const m of s.merchants.filter((m) => m.state !== 'fused').slice(0, 20)) {
        list.push({ label: `熔断 ${m.id}`, sub: `动作 · 停止进单（${CHANNEL_LABEL[m.channel]}）`, icon: <Zap size={15} className="text-alert-ink" />, kw: `熔断 fuse ${m.id}`, danger: true, run: () => { setMerchantState(m.id, 'fused', '熔断'); toast({ tone: 'alert', text: `${m.id} 已熔断` }) } })
      }
    }
    return list
  }, [s, can, toast])

  const hits = useMemo<Hit[]>(() => {
    const nav: Hit[] = [
      ...s.brands.map((b) => ({ label: b.name, sub: `品牌 · ${b.category}`, to: `/brands/${b.id}`, icon: <Package size={15} />, kw: b.name + b.id + b.category })),
      ...s.agents.map((a) => ({ label: a.name, sub: `代理 · ${a.id}，信用分 ${a.creditScore}`, to: '/agents', icon: <Users size={15} />, kw: a.name + a.id })),
      ...s.merchants.map((m) => ({ label: m.id, sub: `商户号 · ${CHANNEL_LABEL[m.channel]}，${m.mid}`, to: '/merchants', icon: <CreditCard size={15} />, kw: m.id + m.mid })),
      ...s.complaints.map((c) => ({ label: c.id, sub: `工单 · ${c.reason}`, to: '/complaints', icon: <MessageSquareWarning size={15} />, kw: c.id + c.reason })),
      ...s.orders.slice(0, 12).map((o) => ({ label: o.id, sub: `订单 · ${o.plan}`, to: '/orders', icon: <Receipt size={15} />, kw: o.id + o.plan })),
    ]
    const query = q.trim().toLowerCase()
    if (!query) return [...actions.slice(0, 3), ...nav.slice(0, 6)]
    // Ask 平台：仅在「像问句」时出问答行（模板制，不做开放 NL2SQL）。
    // 曾经"命中即出"且置顶：单字关键词（退/几）把「退款 O-99812」的 Enter 劫持去了 /orders——
    // 动作永远排在问答前，问答只答真正的问题。
    const ask: Hit[] = []
    if (looksLikeQuestion(q)) {
      const t = matchAsk(q, can) // 按提问者权限过滤模板（无权限的问题不出答案，防越权窥数）
      if (t) {
        const a = t.run(s)
        ask.push({ label: a.answer, sub: `问答 · ${a.question}`, to: a.to, icon: <MessageCircleQuestion size={15} className="text-violet-ink" />, kw: query })
      }
    }
    // 分词 AND 匹配而非整串子串：placeholder 宣传的「退款 O-99812」中间隔着 kw 里的
    // "refund" 等词，整串 includes 永远匹配不上——按空白拆词逐个命中才符合直觉。
    const tokens = query.split(/\s+/).filter(Boolean)
    const tokenMatch = (h: Hit) => {
      const hay = (h.kw + ' ' + h.label).toLowerCase()
      return tokens.every((t) => hay.includes(t))
    }
    const matchedActions = actions.filter(tokenMatch).slice(0, 5)
    const matchedNav = nav.filter(tokenMatch).slice(0, 7)
    return [...matchedActions, ...ask, ...matchedNav].slice(0, 12)
  }, [q, s, actions, can])

  useEffect(() => {
    if (sel >= hits.length) setSel(0)
  }, [hits.length, sel])

  if (!open) return null
  const go = (h: Hit) => {
    if (h.danger && h.run) { setConfirm(h); return } // 资金/状态类：先确认
    if (h.run) { h.run(); setOpen(false); return }
    if (h.to) { void nav(h.to); setOpen(false) }
  }

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
            placeholder={inputHint}
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
                <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-md', h.run ? 'bg-brand-soft text-brand-ink' : 'bg-surface-sunken text-ink-3')}>{h.icon}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-ink">{h.label}</span><span className="block truncate text-[11px] text-ink-4">{h.sub}</span></span>
                {h.danger && <span className="shrink-0 rounded bg-alert-soft px-1.5 py-0.5 text-[9.5px] font-medium text-alert-ink">需确认</span>}
                {i === sel && <CornerDownLeft size={13} className="text-ink-4" />}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-ink-4">
          <span><kbd className="tnum rounded border border-line px-1">↑↓</kbd> 选择</span>
          <span><kbd className="tnum rounded border border-line px-1">↵</kbd> 执行</span>
          <span className="text-ink-5">{examples.length ? `可执行：${examples.join(' · ')}` : '仅显示当前角色有权查看的结果'}</span>
          <span className="ml-auto">⌘K 唤起</span>
        </div>
      </div>

      {/* 资金/状态类动作二次确认（沿用 Confirm 语义，不绕过守卫） */}
      {confirm && (
        <div className="absolute inset-0 z-[130] grid place-items-center px-4" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-ink/50" onClick={() => setConfirm(null)} />
          <div className="relative w-full max-w-[400px] rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-pop)]" style={{ animation: 'revUpSm .18s both' }}>
            <div className="text-[14px] font-semibold text-ink">确认执行：{confirm.label}</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{confirm.sub}。此操作涉及资金或状态变更，确认后立即生效。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-surface-muted">取消</button>
              <button onClick={() => { confirm.run?.(); setConfirm(null); setOpen(false) }} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">确认执行</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
