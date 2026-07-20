import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, AlertCircle, KeyRound, CheckCircle2 } from 'lucide-react'
import { Button } from '../components/ui/primitives'
import { Field, Input } from '../components/ui/forms'
import { AuthShell } from '../components/layout/AuthShell'
import { changePassword, useAuth } from '../lib/auth'
import { isRealApi } from '../lib/http'

/**
 * 改密页：首登强制改密（mustChangePassword）与主动改密共用。
 * 成功后服务端吊销全部会话 → 本地已登出 → 引导以新密码重新登录。
 */
export default function ChangePassword() {
  const nav = useNavigate()
  const user = useAuth()
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const forced = !!user?.mustChangePassword

  const submit = async () => {
    if (busy) return
    setErr('')
    if (newPwd.length < 8) {
      setErr('新密码至少 8 位')
      return
    }
    if (newPwd !== confirmPwd) {
      setErr('两次输入的新密码不一致')
      return
    }
    if (newPwd === oldPwd) {
      setErr('新密码不能与原密码相同')
      return
    }
    setBusy(true)
    try {
      await changePassword(oldPwd, newPwd)
      setDone(true)
      // 全会话已吊销，2s 后跳登录页以新密码重新登录
      setTimeout(() => nav('/login', { replace: true }), 1800)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '改密失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      footer={
        <p className="text-[11px] leading-relaxed text-ink-4">
          {isRealApi ? '改密后所有已登录会话将失效，需以新密码重新登录。' : '演示模式无需改密。'}
        </p>
      }
    >
      <div className="mb-6">
        <h2 className="t-h1 text-ink">{forced ? '首次登录 · 请设置新密码' : '修改密码'}</h2>
        <p className="mt-1.5 text-[13px] text-ink-3">
          {forced ? '为保障账户安全，初始/临时密码须先改为你自己的密码。' : '修改后需以新密码重新登录。'}
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
        {done ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 size={28} className="text-good-ink" />
            <div className="text-[14px] font-medium text-ink">密码已更新</div>
            <div className="text-[12px] text-ink-3">正在跳转到登录页，请用新密码登录…</div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
            className="space-y-3.5"
          >
            <Field label={forced ? '当前密码（初始/临时）' : '原密码'}>
              <Input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} placeholder="输入当前密码" autoFocus />
            </Field>
            <Field label="新密码" hint="至少 8 位">
              <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="设置新密码" />
            </Field>
            <Field label="确认新密码">
              <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="再次输入新密码" />
            </Field>
            {err && (
              <div className="flex items-center gap-1.5 rounded-md bg-brand-soft px-2.5 py-1.5 text-[12px] text-brand-ink" role="alert">
                <AlertCircle size={13} /> {err}
              </div>
            )}
            <Button variant="primary" type="submit" loading={busy} className="w-full !py-2">
              <KeyRound size={15} /> 更新密码 <ArrowRight size={15} />
            </Button>
          </form>
        )}
      </div>
    </AuthShell>
  )
}
