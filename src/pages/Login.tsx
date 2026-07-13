import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, ShieldCheck, AlertCircle, KeyRound, Clock } from 'lucide-react'
import { Button } from '../components/ui/primitives'
import { Field, Input } from '../components/ui/forms'
import { AuthShell } from '../components/layout/AuthShell'
import { login, DEMO_USERS, ROLES, consumeSessionExpired } from '../lib/auth'
import { isRealApi } from '../lib/http'
import { homeForScope } from './PortalLogin'

export default function Login() {
  const nav = useNavigate()
  const loc = useLocation()
  // 真实模式不预填任何凭证；演示模式预填 admin/demo 便于一键体验
  const [account, setAccount] = useState(isRealApi ? '' : 'admin')
  const [pwd, setPwd] = useState(isRealApi ? '' : 'demo')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [expired] = useState(consumeSessionExpired) // 会话过期弹回：一次性提示"登录已过期"
  // 平台账户列表（品牌/代理演示账户在门户登录页展示，不混入内部入口）
  const platformUsers = DEMO_USERS.filter((u) => (u.scopeType ?? 'platform') === 'platform')
  const submit = async () => {
    if (busy) return
    setErr('')
    setBusy(true)
    try {
      // 真实模式不做 admin/demo 兜底（那是演示便利），凭用户实际输入
      const u = isRealApi ? await login(account.trim(), pwd) : await login(account.trim() || 'admin', pwd || 'demo')
      // 首登/邀请建号须先改密：拦到改密页，不放进控制台
      if (u.mustChangePassword) {
        void nav('/change-password', { replace: true })
        return
      }
      // 深链回跳：从受守卫页被弹到登录 → 登录后回原页（平台账户限内部路由）
      const from = (loc.state as { from?: string } | null)?.from
      const fallback = homeForScope(u)
      void nav(from && !from.startsWith('/portal') && fallback === '/' ? from : fallback, { replace: true })
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
          {isRealApi ? '真实后端鉴权（NestJS · JWT + 刷新令牌，服务端 RBAC）' : '演示态鉴权（前端 mock）· 接口形态对齐后端契约，真实后端就绪即可切换'}
        </p>
      }
    >
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2 lg:hidden">
          <img src="./youdao-logo.png" alt="网易有道" className="logo-mark h-6 w-auto" />
        </div>
        <h2 className="text-[22px] font-semibold tracking-[-0.015em] text-ink">登录控制台</h2>
        <p className="mt-1.5 text-[13px] text-ink-3">订阅增长交易与风险清结算平台 · 平台运营入口</p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
        {expired && (
          <div className="mb-3.5 flex items-center gap-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-[12px] text-warn-ink" role="status">
            <Clock size={13} /> 登录已过期，请重新登录
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="space-y-3.5"
        >
          <Field label="账号">
            <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="admin" autoFocus />
          </Field>
          <Field label="密码">
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="demo" />
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

        {/* 演示账户一键填入仅演示模式展示；真实模式绝不泄露任何账号/口令提示 */}
        {!isRealApi && (
          <div className="mt-4 border-t border-line pt-3.5">
            <div className="mb-2 flex items-center gap-1.5 text-[11.5px] text-ink-4">
              <ShieldCheck size={13} /> 演示账户（点击一键填入，密码 demo）
            </div>
            <div className="flex flex-wrap gap-1.5">
              {platformUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setAccount(u.account)}
                  className="rounded-md border border-line px-2 py-1 text-[11.5px] text-ink-2 transition-colors hover:border-brand hover:text-brand"
                >
                  {u.name}
                  <span className="ml-1 text-ink-4">· {ROLES[u.roleId].name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <a
        href="#/portal/login"
        className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-ink-4 transition-colors hover:text-brand"
      >
        <KeyRound size={12} /> 品牌方 / 代理商请从客户门户登录 →
      </a>
    </AuthShell>
  )
}
