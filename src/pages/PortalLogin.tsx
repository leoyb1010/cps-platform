import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, AlertCircle, Building2, Megaphone, ShieldCheck } from 'lucide-react'
import { Button } from '../components/ui/primitives'
import { Field, Input } from '../components/ui/forms'
import { AuthShell } from '../components/layout/AuthShell'
import { login, DEMO_USERS, type User } from '../lib/auth'
import { isRealApi } from '../lib/http'

// 客户门户登录入口（独立于内部 /login）：
// 不暴露内部演示账户列表；登录后按 scopeType 分流到对应门户。
export function homeForScope(u: User | null): string {
  const t = u?.scopeType ?? 'platform'
  if (t === 'brand') return '/portal/brand'
  if (t === 'agent') return '/portal/agent'
  if (t === 'platform') return '/' // 平台用户误从门户登录 → 回内部控制台
  return '/portal/login' // 未知 scope：不进任何区（与 RequireScope 一致，避免互相弹跳死循环）
}

const PORTAL_ICON = { brand: Building2, agent: Megaphone } as const

export default function PortalLogin() {
  const nav = useNavigate()
  const loc = useLocation()
  const [account, setAccount] = useState('')
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // 演示模式下展示门户演示账户（brand / agent），让三类入口都能一键体验
  const portalUsers = DEMO_USERS.filter((u) => u.scopeType === 'brand' || u.scopeType === 'agent')
  const submit = async () => {
    if (busy) return
    setErr('')
    setBusy(true)
    try {
      const u = await login(account.trim(), pwd)
      const from = (loc.state as { from?: string } | null)?.from
      const home = homeForScope(u)
      // 深链回跳：仅回落到自己门户区内的路径，避免跨区跳转又被守卫弹回
      nav(from && home !== '/' && from.startsWith(home) ? from : home, { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '登录失败，请重试')
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthShell
      footer={
        <p className="text-[11px] leading-relaxed text-ink-4">
          {isRealApi ? '数据按账户隔离 · 仅显示与你账户相关的数据' : '演示态 · 门户数据来自本地演示数据集，连接真实后端后按账户隔离'}
        </p>
      }
    >
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2 lg:hidden">
          <img src="./youdao-logo.png" alt="网易有道" className="h-6 w-auto" />
        </div>
        <h2 className="text-[22px] font-semibold tracking-[-0.015em] text-ink">客户门户登录</h2>
        <p className="mt-1.5 text-[13px] text-ink-3">品牌方管理接入与结算 · 代理商领取投放与提现</p>
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
          <Button variant="primary" type="submit" loading={busy} className="w-full !py-2">
            登录 <ArrowRight size={15} />
          </Button>
        </form>

        {!isRealApi && (
          <div className="mt-4 border-t border-line pt-3.5">
            <div className="mb-2 flex items-center gap-1.5 text-[11.5px] text-ink-4">
              <ShieldCheck size={13} /> 演示账户（点击一键填入，密码 demo）
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {portalUsers.map((u) => {
                const Icon = PORTAL_ICON[(u.scopeType ?? 'brand') as keyof typeof PORTAL_ICON] ?? Building2
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setAccount(u.account)
                      setPwd('demo')
                    }}
                    className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-left transition-colors hover:border-brand"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-ink">
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-medium text-ink">{u.name}</span>
                      <span className="block text-[10.5px] text-ink-4">{u.scopeType === 'brand' ? '品牌方门户' : '代理商门户'}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <a href="#/login" className="mt-4 block text-center text-[12px] text-ink-4 transition-colors hover:text-brand">
        平台运营人员入口 →
      </a>
    </AuthShell>
  )
}
