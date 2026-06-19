import { useState } from 'react'
import { UserPlus, Check, ShieldCheck } from 'lucide-react'
import {
  Card,
  CardTitle,
  Stat,
  PageHeader,
  Badge,
  Button,
  Segmented,
  TableShell,
  Th,
  Td,
  Row,
} from '../components/ui/primitives'
import { Modal, useToast } from '../components/ui/overlays'
import { Field, Input, Select } from '../components/ui/forms'
import { DEMO_USERS, ROLES, PERMISSIONS, type RoleId } from '../lib/auth'
import { isRealApi } from '../lib/http'
import { adminApi, useApi } from '../lib/adminApi'
import { cx } from '../lib/format'

const ROLE_IDS = Object.keys(ROLES) as RoleId[]
const PERM_GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))]

// 统一成员/角色视图（mock 用本地常量；real 用服务端数据）
interface MView { id: string; name: string; account: string; roleId: string; roleName: string }
interface RView { id: string; name: string; desc: string; perms: string[] }
const LOCAL_MEMBERS: MView[] = DEMO_USERS.map((u) => ({ id: u.id, name: u.name, account: u.account, roleId: u.roleId, roleName: ROLES[u.roleId].name }))
const LOCAL_ROLES: RView[] = ROLE_IDS.map((r) => ({ id: r, name: ROLES[r].name, desc: ROLES[r].desc, perms: ROLES[r].perms }))

export default function Members() {
  const toast = useToast()
  const [tab, setTab] = useState<'members' | 'roles'>('members')
  const [invite, setInvite] = useState(false)
  const [activeRole, setActiveRole] = useState<string>('super')

  const membersApi = useApi(() => adminApi.members(), [], [])
  const rolesApi = useApi(() => adminApi.roles(), [], [])
  const members: MView[] = isRealApi ? (membersApi.data ?? []).map((m) => ({ id: m.id, name: m.name, account: m.account, roleId: m.roleId, roleName: m.roleName })) : LOCAL_MEMBERS
  const roles: RView[] = isRealApi ? (rolesApi.data ?? []).map((r) => ({ id: r.id, name: r.name, desc: r.description, perms: r.permissions })) : LOCAL_ROLES
  const activeRoleObj = roles.find((r) => r.id === activeRole) ?? roles[0]
  const cnt = (rid: string) => members.filter((m) => m.roleId === rid).length

  return (
    <>
      <PageHeader
        title="成员与角色"
        desc="RBAC：成员归属角色，角色绑定权限点 + 数据范围。路由级 / 操作级 / 数据级三级控制——品牌只见自己、代理只见自己。"
        actions={<Button variant="primary" onClick={() => setInvite(true)}><UserPlus size={14} /> 邀请成员</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card mark><Stat label="成员总数" value={String(members.length)} sub={<span>{roles.length} 个角色</span>} /></Card>
        <Card mark><Stat label="角色数" value={String(roles.length)} sub={<span>权限点 {PERMISSIONS.length} 项</span>} /></Card>
        <Card mark><Stat label="超级管理员" value={String(cnt('super'))} sub={<span>全部权限</span>} /></Card>
        <Card mark><Stat label="只读审计" value={String(cnt('audit'))} sub={<span className="text-good-ink">仅查看 + 导出</span>} /></Card>
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <CardTitle title={tab === 'members' ? '成员列表' : '角色与权限矩阵'} desc={tab === 'members' ? '成员归属角色，角色决定可见与可用' : '角色 × 权限点（演示态可勾选，真实环境保存到后端）'} />
          <Segmented value={tab} onChange={setTab} options={[{ value: 'members', label: '成员' }, { value: 'roles', label: '角色权限' }]} />
        </div>

        {tab === 'members' ? (
          <TableShell className="px-2 pb-2" empty={isRealApi && membersApi.loading ? '正在从服务端加载成员…' : '暂无成员'} head={<><Th className="pl-3">成员</Th><Th>账号</Th><Th>角色</Th><Th>数据范围</Th><Th right>状态</Th><Th right>操作</Th></>}>
            {members.map((u) => (
              <Row key={u.id}>
                <Td className="pl-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-ink ring-1 ring-brand/15">{u.name.slice(0, 1)}</span>
                    <span className="text-[12.5px] font-medium text-ink">{u.name}</span>
                  </div>
                </Td>
                <Td mono>{u.account}</Td>
                <Td><Badge tone={u.roleId === 'super' ? 'brand' : u.roleId === 'audit' ? 'neutral' : 'info'}>{u.roleName}</Badge></Td>
                <Td><span className="text-[12px] text-ink-3">平台级</span></Td>
                <Td right><Badge tone="good" dot>在职</Badge></Td>
                <Td right>
                  <button onClick={() => toast({ tone: 'info', text: `${u.name}：改角色 / 停用（演示）` })} className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-sunken hover:text-ink">管理</button>
                </Td>
              </Row>
            ))}
          </TableShell>
        ) : (
          <div className="grid grid-cols-1 gap-0 px-5 pb-5 lg:grid-cols-[200px_1fr]">
            {/* role list */}
            <div className="flex flex-col gap-1 border-line pb-3 lg:border-r lg:pr-3 lg:pb-0">
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setActiveRole(r.id)}
                  className={cx('rounded-lg px-3 py-2 text-left transition-colors', r.id === activeRole ? 'bg-surface-sunken' : 'hover:bg-surface-muted')}
                >
                  <div className={cx('text-[13px] font-medium', r.id === activeRole ? 'text-ink' : 'text-ink-2')}>{r.name}</div>
                  <div className="text-[11px] text-ink-4">{r.desc} · {r.perms.length} 权限</div>
                </button>
              ))}
            </div>
            {/* permission matrix for active role */}
            {activeRoleObj && (
              <RolePerms
                key={activeRoleObj.id}
                roleId={activeRoleObj.id}
                initial={activeRoleObj.perms}
                onSave={async (perms) => {
                  if (isRealApi) {
                    const r = await adminApi.updateRole(activeRoleObj.id, perms).catch((e) => ({ ok: false, detail: e?.message }))
                    toast(r.ok ? { tone: 'good', text: `「${activeRoleObj.name}」权限已保存到服务端` } : { tone: 'alert', text: r.detail || '保存失败' })
                    if (r.ok) rolesApi.reload()
                  } else {
                    toast({ tone: 'good', text: `「${activeRoleObj.name}」权限已保存` })
                  }
                }}
              />
            )}
          </div>
        )}
      </Card>

      <Modal open={invite} onClose={() => setInvite(false)} title="邀请成员" footer={<><Button variant="ghost" onClick={() => setInvite(false)}>取消</Button><button onClick={() => { setInvite(false); toast({ tone: 'good', text: '邀请已发送' }) }} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover">发送邀请</button></>}>
        <div className="space-y-3.5">
          <Field label="账号（手机号 / 邮箱）" required><Input placeholder="name@youdao.com" /></Field>
          <Field label="姓名"><Input placeholder="张三" /></Field>
          <Field label="角色">
            <Select defaultValue="ops">{ROLE_IDS.map((r) => <option key={r} value={r}>{ROLES[r].name}</option>)}</Select>
          </Field>
          <div className="rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">成员将收到邀请，设置密码后按所选角色获得权限；数据范围默认平台级，品牌/代理租户可限定到具体主体。</div>
        </div>
      </Modal>
    </>
  )
}

function RolePerms({ roleId, initial, onSave }: { roleId: string; initial: string[]; onSave: (perms: string[]) => void | Promise<void> }) {
  const [granted, setGranted] = useState<Set<string>>(new Set(initial))
  const [saving, setSaving] = useState(false)
  const readonly = roleId === 'super'
  const toggle = (key: string) => {
    if (readonly) return
    setGranted((cur) => {
      const n = new Set(cur)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }
  const save = async () => {
    setSaving(true)
    try {
      await onSave([...granted])
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="pt-3 lg:pt-0 lg:pl-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12px] text-ink-3"><ShieldCheck size={14} className="text-ink-4" /> 勾选该角色可执行的权限点</div>
        <Button variant="primary" loading={saving} disabled={readonly} onClick={save} className="!py-1"><Check size={13} /> 保存</Button>
      </div>
      <div className="space-y-3">
        {PERM_GROUPS.map((g) => (
          <div key={g}>
            <div className="mb-1.5 text-[10.5px] font-medium tracking-wide text-ink-4 uppercase">{g}</div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {PERMISSIONS.filter((p) => p.group === g).map((p) => {
                const on = granted.has(p.key)
                return (
                  <button
                    key={p.key}
                    onClick={() => toggle(p.key)}
                    disabled={readonly}
                    className={cx('flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors', on ? 'border-brand/30 bg-brand-soft/40 text-ink' : 'border-line text-ink-3 hover:bg-surface-muted', readonly && 'cursor-default opacity-90')}
                  >
                    <span className={cx('grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border', on ? 'border-brand bg-brand text-white' : 'border-line-strong')}>{on && <Check size={11} />}</span>
                    {p.label}
                    <span className="ml-auto font-mono text-[10px] text-ink-4">{p.key}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {readonly && <div className="mt-3 rounded-lg bg-surface-muted p-2.5 text-[11.5px] text-ink-4">超级管理员拥有全部权限，不可在此取消。</div>}
    </div>
  )
}
