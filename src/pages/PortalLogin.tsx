import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, AlertCircle } from 'lucide-react'
import { Button } from '../components/ui/primitives'
import { Field, Input } from '../components/ui/forms'
import { login, type User } from '../lib/auth'
import { isRealApi } from '../lib/http'

// 客户门户登录入口（独立于内部 /login）：
// 不暴露内部演示账户列表；登录后按 scopeType 分流到对应门户。
export function homeForScope(u: User | null): string {
  const t = u?.scopeType ?? 'platform'
  if (t === 'brand') return '/portal/brand'
  if (t === 'agent') return '/portal/agent'
  return '/' // 平台用户误从门户登录 → 回内部控制台
}

export default function PortalLogin() {
  const nav = useNavigate()
  const [account, setAccount] = useState('')
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (busy) return
    setErr('')
    setBusy(true)
    try {
      const u = await login(account.trim(), pwd)
      nav(homeForScope(u), { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '登录失败，请重试')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid-bg grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-[380px]" style={{ animation: 'revUpSm .45s cubic-bezier(.22,1,.36,1) both' }}>
        <div className="mb-7 flex flex-col items-center gap-3">
          <img src="./youdao-logo.png" alt="网易有道" className="h-7 w-auto" />
          <div className="text-center">
            <div className="text-[15px] font-semibold text-ink">订阅增长 · 客户门户</div>
            <div className="mt-0.5 text-[12px] text-ink-4">品牌方 / 代理商登录</div>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
            className="space-y-3.5"
          >
            <Field label="账号">
              <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="品牌方 / 代理商账号" autoFocus />
            </Field>
            <Field label="密码">
              <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="密码" />
            </Field>
            {err && (
              <div className="flex items-center gap-1.5 rounded-md bg-brand-soft px-2.5 py-1.5 text-[12px] text-brand-ink" role="alert">
                <AlertCircle size={13} /> {err}
              </div>
            )}
            <Button variant="primary" type="submit" loading={busy} className="w-full">
              登录 <ArrowRight size={15} />
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-4">
          {isRealApi ? '数据按账户隔离 · 仅显示与你账户相关的数据' : '演示态：客户门户需连接真实后端以保证数据隔离'}
        </p>
      </div>
    </div>
  )
}
