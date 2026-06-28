import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react'
import { Button } from '../components/ui/primitives'
import { Field, Input } from '../components/ui/forms'
import { login, DEMO_USERS, ROLES } from '../lib/auth'
import { isRealApi } from '../lib/http'
import { hydrateFromServer } from '../lib/store'

export default function Login() {
  const nav = useNavigate()
  const [account, setAccount] = useState('admin')
  const [pwd, setPwd] = useState('demo')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (busy) return
    setErr('')
    setBusy(true)
    try {
      await login(account.trim() || 'admin', pwd || 'demo')
      await hydrateFromServer()
      nav('/', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '登录失败，请重试')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid-bg grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-[380px]" style={{ animation: 'revUpSm .45s cubic-bezier(.22,1,.36,1) both' }}>
        {/* brand */}
        <div className="mb-7 flex flex-col items-center gap-3">
          <img src="./youdao-logo.png" alt="网易有道" className="h-7 w-auto" />
          <div className="text-center">
            <div className="text-[15px] font-semibold text-ink">订阅增长交易与风险清结算平台</div>
            <div className="mt-0.5 text-[12px] text-ink-4">请登录后进入控制台</div>
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
            <Button variant="primary" type="submit" loading={busy} className="w-full">
              登录 <ArrowRight size={15} />
            </Button>
          </form>

          <div className="mt-4 border-t border-line pt-3.5">
            <div className="mb-2 flex items-center gap-1.5 text-[11.5px] text-ink-4">
              <ShieldCheck size={13} /> 演示账户（点击一键填入，密码 demo）
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_USERS.map((u) => (
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
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-4">
          {isRealApi ? '真实后端鉴权（NestJS · JWT + 刷新令牌，服务端 RBAC）' : '演示态鉴权（前端 mock）· 接口形态对齐 v4 后端契约，真实后端就绪即可切换'}
        </p>
      </div>
    </div>
  )
}
