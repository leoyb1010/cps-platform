import { useState } from 'react'
import { Search, CheckCircle2, Clock, ShieldCheck, ArrowLeft, ShoppingBag, XCircle } from 'lucide-react'
import { useToast } from '../../components/ui/overlays'
import { money } from '../../lib/format'

/**
 * C 端「我的订阅」—— 支付后动线的终点，免登录（套餐号+手机尾号）查开通进度。
 * 演示态：本地根据落地页/套餐号合成一份进度视图；真实态由 /market/me 查 fulfillment。
 * 合规三步退订（原因→挽留报价→确认），路径不超过 3 步（事前防线要求）。
 */

interface SubItem { name: string; status: 'active' | 'pending' | 'cancelled'; renewAt: string; price: number }

// 演示：任意套餐号都给一份可信进度（3 项，2 已开通 1 开通中）
function demoProgress(): { bundleId: string; items: SubItem[] } {
  return {
    bundleId: 'B-DEMO-A1B2C3',
    items: [
      { name: '有道词典 VIP 连续包月', status: 'active', renewAt: '2026-08-02', price: 39.9 },
      { name: '喜马拉雅 VIP 连续包月', status: 'active', renewAt: '2026-08-02', price: 25 },
      { name: '芒果 TV 移动会员连续包月', status: 'pending', renewAt: '—', price: 19 },
    ],
  }
}

export default function MySubscriptions() {
  const toast = useToast()
  const [code, setCode] = useState('')
  const [tail, setTail] = useState('')
  const [touched, setTouched] = useState(false)
  const [result, setResult] = useState<ReturnType<typeof demoProgress> | null>(null)
  const [unsubName, setUnsubName] = useState<string | null>(null)

  const codeOk = !!code.trim()
  const tailOk = tail.length === 4
  const query = () => {
    // 演示：套餐号非空 + 尾号 4 位即返回；真实态调 /market/me
    setTouched(true)
    if (!codeOk || !tailOk) return
    setResult(demoProgress())
  }
  // 确认退订：条目置为 cancelled（到期不续），当前周期权益保留
  const confirmUnsub = (name: string) => {
    setResult((r) => (r ? { ...r, items: r.items.map((it) => (it.name === name ? { ...it, status: 'cancelled' as const } : it)) } : r))
    toast({ tone: 'good', text: '已退订，当前周期结束后不再扣费' })
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[440px] bg-surface shadow-[var(--shadow-pop)]">
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
          <a href="#/market" className="grid h-8 w-8 place-items-center rounded-lg text-ink-4 hover:bg-surface-muted"><ArrowLeft size={16} /></a>
          <div className="flex items-center gap-2"><ShoppingBag size={16} className="text-brand" /><span className="text-[14px] font-semibold text-ink">我的订阅</span></div>
        </div>

        <div className="px-5 py-6">
          {!result ? (
            <>
              <h1 className="text-[20px] font-semibold tracking-[-0.015em] text-ink">查询订阅开通进度</h1>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">输入套餐号与手机尾号即可查看，无需登录。</p>
              <div className="mt-5 space-y-3">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-ink-2">套餐号</label>
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="B-XXXXXX（支付成功页可见）"
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] outline-none focus:border-brand" />
                  {touched && !codeOk && <p className="mt-1 text-[11px] text-alert-ink">请输入套餐号</p>}
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-ink-2">手机尾号 4 位</label>
                  <input value={tail} onChange={(e) => setTail(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="下单手机号后 4 位"
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] outline-none focus:border-brand tnum" />
                  {touched && !tailOk && <p className="mt-1 text-[11px] text-alert-ink">请输入 4 位手机尾号</p>}
                </div>
                <button onClick={query} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover">
                  <Search size={15} /> 查询进度
                </button>
              </div>
              <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-ink-4"><ShieldCheck size={12} className="text-good-ink" /> 演示模式 · 输入套餐号与尾号即可查看示例进度</div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12px] text-ink-4">套餐号</div>
                  <div className="tnum text-[15px] font-semibold text-ink">{result.bundleId}</div>
                </div>
                <button onClick={() => setResult(null)} className="text-[12px] text-ink-4 hover:text-ink-2">重新查询</button>
              </div>

              <div className="mt-4 space-y-2.5">
                {result.items.map((it, i) => (
                  <div key={`${it.name}-${i}`} className="rounded-xl border border-line bg-surface p-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {it.status === 'active' ? <CheckCircle2 size={16} className="text-good-ink" /> : it.status === 'cancelled' ? <XCircle size={16} className="text-ink-4" /> : <Clock size={16} className="text-warn-ink" />}
                        <span className="text-[13px] font-medium text-ink">{it.name}</span>
                      </div>
                      <span className={it.status === 'active' ? 'rounded-full bg-good-soft px-2 py-0.5 text-[10.5px] font-medium text-good-ink' : it.status === 'cancelled' ? 'rounded-full bg-surface-sunken px-2 py-0.5 text-[10.5px] font-medium text-ink-4' : 'rounded-full bg-warn-soft px-2 py-0.5 text-[10.5px] font-medium text-warn-ink'}>
                        {it.status === 'active' ? '已开通' : it.status === 'cancelled' ? '已退订 · 到期不续' : '开通中'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-ink-4">
                      <span className={it.status === 'cancelled' ? 'line-through' : undefined}>下次续费 {it.renewAt}</span>
                      <span className="tnum">{money(it.price)}/期</span>
                    </div>
                    {it.status === 'active' && (
                      <button onClick={() => setUnsubName(it.name)} className="mt-2 text-[11.5px] font-medium text-ink-4 transition-colors hover:text-alert-ink">退订该订阅</button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {unsubName && <UnsubscribeFlow name={unsubName} onConfirm={() => confirmUnsub(unsubName)} onClose={() => setUnsubName(null)} />}
    </div>
  )
}

/* 合规三步退订：原因 → 挽留报价 → 确认。路径不超过 3 步（事前防线要求，越顺畅越好）。 */
function UnsubscribeFlow({ name, onConfirm, onClose }: { name: string; onConfirm: () => void; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [reason, setReason] = useState('')
  const REASONS = ['价格偏高', '使用频率低', '功能不满足', '临时不需要', '其他']
  return (
    <div className="fixed inset-0 z-[100] grid place-items-end sm:place-items-center" style={{ animation: 'fadeIn .2s both' }}>
      <div className="absolute inset-0 bg-ink/45" onClick={onClose} />
      <div className="relative w-full max-w-[440px] rounded-t-2xl bg-surface p-5 shadow-[var(--shadow-pop)] sm:rounded-2xl" style={{ animation: 'revUpSm .22s both' }}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[14px] font-semibold text-ink">退订 · {name}</span>
          <span className="tnum text-[11px] text-ink-4">{step} / 3</span>
        </div>
        {step === 1 && (
          <>
            <p className="text-[12.5px] text-ink-3">方便告诉我们退订原因吗？（帮助我们改进）</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button key={r} onClick={() => setReason(r)} className={reason === r ? 'rounded-full border border-brand bg-brand/[0.06] px-3 py-1.5 text-[12px] font-medium text-brand' : 'rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-2 hover:border-line-strong'}>{r}</button>
              ))}
            </div>
            <button disabled={!reason} onClick={() => setStep(2)} className="mt-4 w-full rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40">下一步</button>
          </>
        )}
        {step === 2 && (
          <>
            <div className="rounded-xl border border-brand/25 bg-brand-soft/40 p-4 text-center">
              <div className="text-[13px] font-semibold text-ink">留下来，续费立减 5 元</div>
              <p className="mt-1 text-[11.5px] text-ink-3">下个周期起享受专属挽留优惠，可随时再退订。</p>
              <button onClick={onClose} className="mt-3 w-full rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover">领取优惠并保留</button>
            </div>
            <button onClick={() => setStep(3)} className="mt-3 w-full text-center text-[12.5px] text-ink-4 hover:text-ink-2">仍要退订 →</button>
          </>
        )}
        {step === 3 && (
          <>
            <p className="text-[12.5px] text-ink-3">确认退订后，本订阅到期不再续费，已购权益在当前周期内继续有效。</p>
            <div className="mt-4 flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-xl border border-line px-4 py-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-muted">再想想</button>
              <button onClick={() => { onConfirm(); onClose() }} className="flex-1 rounded-xl bg-alert px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90">确认退订</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
