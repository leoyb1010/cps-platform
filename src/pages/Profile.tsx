import { PageHeader, Card, CardTitle, Badge } from '../components/ui/primitives'
import { useAuth, ROLES, permsOf } from '../lib/auth'

const SCOPE_LABEL: Record<string, string> = { platform: '平台级（全部数据）', brand: '品牌级（仅自己品牌）', agent: '代理级（仅自己）' }

export default function Profile() {
  const user = useAuth()
  if (!user) return null
  const role = ROLES[user.roleId]
  const perms = [...permsOf(user)]
  return (
    <>
      <PageHeader title="个人资料" desc="当前登录账户的身份、角色与数据范围。" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle title="账户信息" desc="身份与登录" />
          <div className="mt-1 flex items-center gap-3.5">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand/10 text-[20px] font-semibold text-brand">{user.name.slice(0, 1)}</div>
            <div>
              <div className="text-[15px] font-semibold text-ink">{user.name}</div>
              <div className="mt-0.5 text-[12.5px] text-ink-4">账号 {user.account}</div>
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            <Row k="角色" v={<Badge tone="brand">{role?.name ?? user.roleId}</Badge>} />
            <Row k="数据范围" v={<span className="text-[12.5px] text-ink-2">{SCOPE_LABEL[user.scopeType ?? 'platform'] ?? user.scopeType}</span>} />
            {user.scopeId && <Row k="范围对象" v={<span className="tnum text-[12.5px] text-ink-2">{user.scopeId}</span>} />}
          </div>
        </Card>

        <Card>
          <CardTitle title="角色权限" desc={`${role?.desc ?? ''} · 共 ${perms.length} 个权限点`} />
          <div className="mt-1 flex flex-wrap gap-1.5">
            {perms.map((p) => (
              <span key={p} className="tnum rounded-md bg-surface-muted px-2 py-1 text-[11px] text-ink-3">{p}</span>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-surface-muted p-3 text-[11.5px] leading-relaxed text-ink-3">
            权限由后端 RBAC 下发（路由级 + 操作级 + 数据级）。修改角色须经成员与角色页，本页只读。
          </div>
        </Card>
      </div>
    </>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2.5">
      <span className="text-[12px] text-ink-4">{k}</span>
      {v}
    </div>
  )
}
