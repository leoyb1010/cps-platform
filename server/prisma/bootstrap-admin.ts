/* eslint-disable no-console */
/**
 * 生产首管理员 bootstrap —— 替代演示 seed 在生产建号。
 *
 * 行为：
 *  1. upsert 所有内置角色（RBAC 依赖，无敏感数据）。
 *  2. 若不存在任何 platform/super 用户，则创建首个超管：
 *     - 账号：ADMIN_ACCOUNT（默认 admin）
 *     - 密码：ADMIN_PASSWORD（若未设，随机生成 24 位并打印一次，务必立即保存）
 *     - mustChangePassword=true —— 首次登录强制改密（见 auth 流程）。
 *  3. 已存在超管则跳过（幂等，重启安全）。
 *
 * 用法：NODE_ENV=production ADMIN_PASSWORD=... npm run bootstrap:admin
 */
import { PrismaClient } from '@prisma/client'
import * as argon2 from 'argon2'
import { randomBytes } from 'crypto'
import { ROLE_PRESETS } from '../src/rbac/permissions'

const db = new PrismaClient()

function genPassword(): string {
  // 24 字符 base64url（去掉易混字符），足够强的一次性初始口令
  return randomBytes(18).toString('base64').replace(/[+/=]/g, '').slice(0, 24)
}

async function main() {
  // 1) 内置角色（无敏感数据，可安全 upsert）
  for (const r of ROLE_PRESETS) {
    await db.role.upsert({
      where: { id: r.id },
      update: { name: r.name, description: r.description, permissions: JSON.stringify(r.permissions), builtin: true },
      create: { id: r.id, name: r.name, description: r.description, permissions: JSON.stringify(r.permissions), builtin: true },
    })
  }

  // 2) 已有超管则跳过
  const existing = await db.user.findFirst({ where: { roleId: 'super', scopeType: 'platform' } })
  if (existing) {
    console.log(`[bootstrap] 已存在超管 ${existing.account}，跳过。`)
    return
  }

  const account = process.env.ADMIN_ACCOUNT || 'admin'
  const envPw = process.env.ADMIN_PASSWORD
  const password = envPw && envPw.length >= 8 ? envPw : genPassword()
  const generated = !(envPw && envPw.length >= 8)

  const passwordHash = await argon2.hash(password)
  await db.user.create({
    data: {
      id: 'U-ADMIN-0001',
      name: '系统管理员',
      account,
      roleId: 'super',
      scopeType: 'platform',
      scopeId: null,
      passwordHash,
      mustChangePassword: true,
    },
  })

  console.log('\n──────────────────────────────────────────────')
  console.log(`[bootstrap] 首管理员已创建：账号 = ${account}`)
  if (generated) {
    console.log(`[bootstrap] 初始密码（仅打印这一次，请立即保存）：\n\n    ${password}\n`)
    console.log('[bootstrap] 提示：未设置 ADMIN_PASSWORD，已随机生成。')
  } else {
    console.log('[bootstrap] 初始密码来自 ADMIN_PASSWORD 环境变量。')
  }
  console.log('[bootstrap] 首次登录将强制改密。')
  console.log('──────────────────────────────────────────────\n')
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e)
    db.$disconnect()
    process.exit(1)
  })
