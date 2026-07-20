import { useState } from 'react'
import { Modal, useToast } from './overlays'
import { Button } from './primitives'
import { Field, Input, Select } from './forms'
import { ROLES, type RoleId } from '../../lib/auth'
import { isRealApi } from '../../lib/http'
import { adminApi } from '../../lib/adminApi'
import { cx, copyText } from '../../lib/format'
import { buildMemberUpdatePayload } from '../../lib/memberAccess'

const ROLE_OPTS = (Object.keys(ROLES) as RoleId[]).map((r) => ({ id: r, name: ROLES[r].name }))
// 角色 → scopeType（内部角色 platform；客户角色 brand/agent，需指定 scopeId）
const roleScopeType = (r: string): 'platform' | 'brand' | 'agent' => (r === 'brand' ? 'brand' : r === 'agent' ? 'agent' : 'platform')

// 共享邀请成员弹窗（受控 + 校验 + 真实建号）。Members(#9) 与 Settings(#19) 复用。
// 接通已有 POST /members（createMember）：argon2 临时密码、角色↔scope 强校验，返回明文密码一次供转交。
export function InviteMemberModal({ scopeOptions, onClose, onDone }: { scopeOptions?: { brands: { id: string; name: string }[]; agents: { id: string; name: string }[] }; onClose: () => void; onDone?: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ account: '', name: '', roleId: 'ops' as RoleId, scopeId: '' })
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ account: string; tempPassword: string } | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const scopeType = roleScopeType(form.roleId)
  const needScope = scopeType !== 'platform'
  const scopeList = scopeType === 'brand' ? (scopeOptions?.brands ?? []) : scopeType === 'agent' ? (scopeOptions?.agents ?? []) : []
  const canSend = form.account.trim().length > 0 && form.name.trim().length > 0 && (!needScope || !!form.scopeId)
  const send = async () => {
    if (!canSend) return
    if (!isRealApi) { toast({ tone: 'good', text: `已建号 ${form.account} · 角色「${ROLES[form.roleId].name}」（演示态）` }); onClose(); onDone?.(); return }
    setBusy(true)
    try {
      const r = await adminApi.createMember({ name: form.name.trim(), account: form.account.trim(), roleId: form.roleId, scopeType, scopeId: needScope ? form.scopeId : undefined })
      if (r.ok && r.tempPassword) { setCreated({ account: form.account.trim(), tempPassword: r.tempPassword }); onDone?.() }
      else toast({ tone: 'alert', text: r.detail || '建号被拒绝' })
    } catch { toast({ tone: 'alert', text: '请求失败，请重试' }) } finally { setBusy(false) }
  }
  // 建号成功 → 展示一次性临时密码（仅此一次，供运营转交）
  if (created) {
    return (
      <Modal open onClose={onClose} title="成员已创建" footer={<Button variant="primary" onClick={onClose}>完成</Button>}>
        <div className="space-y-3">
          <div className="rounded-lg border border-good/30 bg-good-soft/40 p-3.5 text-[12.5px] text-ink-2">账号 <b className="tnum">{created.account}</b> 已创建并分配角色。请将下方一次性临时密码转交本人，首次登录后建议修改。</div>
          <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted p-3">
            <span className="text-[12px] text-ink-3">临时密码</span>
            <button onClick={() => { void copyText(created.tempPassword); toast({ tone: 'good', text: '已复制' }) }} className="tnum rounded-md bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink ring-1 ring-line hover:ring-brand/40">{created.tempPassword}</button>
          </div>
          <div className="text-[11px] text-ink-4">密码仅展示这一次，关闭后无法再次查看（仅以哈希存库）。</div>
        </div>
      </Modal>
    )
  }
  return (
    <Modal open onClose={onClose} title="邀请成员 / 建号" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><button disabled={!canSend || busy} onClick={send} className={cx('rounded-lg px-3 py-1.5 text-[13px] font-medium text-white', canSend && !busy ? 'bg-brand hover:bg-brand-hover' : 'cursor-not-allowed bg-ink-4')}>{busy ? '建号中…' : '创建账号'}</button></>}>
      <div className="space-y-3.5">
        <Field label="登录账号（邮箱 / 手机）" required><Input value={form.account} onChange={(e) => set('account', e.target.value)} placeholder="name@company.com" /></Field>
        <Field label="显示名" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="如：王运营" /></Field>
        <Field label="分配角色"><Select aria-label="分配角色" value={form.roleId} onChange={(e) => set('roleId', e.target.value as RoleId)}>{ROLE_OPTS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        {needScope && (
          <Field label={scopeType === 'brand' ? '归属品牌' : '归属代理'} required hint="客户角色必须绑定具体主体（数据级隔离）">
            <Select aria-label={scopeType === 'brand' ? '归属品牌' : '归属代理'} value={form.scopeId} onChange={(e) => set('scopeId', e.target.value)}>
              <option value="">选择{scopeType === 'brand' ? '品牌' : '代理'}…</option>
              {scopeList.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.id}）</option>)}
            </Select>
          </Field>
        )}
        <div className="rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">RBAC 三级权限：路由级 + 操作级 + 数据级（品牌/代理只见自身）。创建后生成一次性临时密码，所有写操作进审计日志。</div>
      </div>
    </Modal>
  )
}

// 管理成员（改角色 / 停用）。real 调 adminApi.updateMember（端点已存在）。
export function ManageMemberModal({ member, canChangeRole, onClose, onDone }: { member: { id: string; name: string; roleId: string; status: string }; canChangeRole: boolean; onClose: () => void; onDone?: () => void }) {
  const toast = useToast()
  const [roleId, setRoleId] = useState(member.roleId)
  const [disabled, setDisabled] = useState(member.status === 'disabled')
  const save = async () => {
    const body = buildMemberUpdatePayload(
      { roleId: member.roleId, status: member.status },
      { roleId, status: disabled ? 'disabled' : 'active' },
      canChangeRole,
    )
    if (Object.keys(body).length === 0) {
      toast({ tone: 'info', text: '没有需要保存的修改' })
      onClose()
      return
    }
    if (isRealApi) {
      const r = await adminApi.updateMember(member.id, body).catch(() => ({ ok: false, detail: '请求失败' }))
      if (r.ok) { toast({ tone: 'good', text: `${member.name} 已更新` }); onClose(); onDone?.() }
      else toast({ tone: 'alert', text: r.detail || '更新被拒绝' })
      return
    }
    toast({ tone: 'good', text: `${member.name}：角色「${ROLES[roleId as RoleId]?.name ?? roleId}」${disabled ? ' · 已停用' : ''}` })
    onClose(); onDone?.()
  }
  return (
    <Modal open onClose={onClose} title={`管理成员 · ${member.name}`} footer={<><Button variant="ghost" onClick={onClose}>取消</Button><button onClick={save} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">保存</button></>}>
      <div className="space-y-3.5">
        {canChangeRole
          ? <Field label="角色"><Select aria-label="角色" value={roleId} onChange={(e) => setRoleId(e.target.value)}>{ROLE_OPTS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          : <Field label="角色"><div className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[13px] text-ink-2">{ROLES[member.roleId as RoleId]?.name ?? member.roleId}<span className="ml-2 text-[11px] text-ink-4">仅超级管理员可变更</span></div></Field>}
        <label className="flex items-center justify-between rounded-lg border border-line p-3">
          <div><div className="text-[12.5px] font-medium text-ink">停用账户</div><div className="text-[11px] text-ink-4">停用后无法登录，可恢复</div></div>
          <input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} className="h-4 w-4 accent-brand" />
        </label>
        <div className="rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">账户状态变更后，该成员已签发的令牌即时失效，需重新登录。</div>
      </div>
    </Modal>
  )
}
