import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const serverRoot = resolve(__dirname, '../..')

function removeSqliteFiles(dbPath: string) {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try {
      rmSync(`${dbPath}${suffix}`)
    } catch {
      /* file may not exist */
    }
  }
}

function runPrisma(args: string[], databaseUrl: string) {
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
    // ponytail: remove once Prisma's macOS schema-engine no longer needs Rust
    // logging initialized to avoid an empty "Schema engine error".
    RUST_LOG: 'info',
  }
  try {
    execFileSync('npx', ['prisma', ...args], { cwd: serverRoot, env, encoding: 'utf8', stdio: 'pipe' })
  } catch (e) {
    const err = e as { message?: string; stdout?: string; stderr?: string }
    const detail = [err.stdout, err.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`npx prisma ${args.join(' ')} failed${detail ? `\n${detail}` : `\n${err.message ?? ''}`}`)
  }
}

export function resetPrismaTestDb(name: string): string {
  // 带 worker PID：多个 Vitest/Codex 进程并行时不会互删对方正在使用的 SQLite 文件。
  const dbPath = join('/tmp', `cps-platform-${name}-${process.pid}.db`)
  const databaseUrl = `file:${dbPath}`
  removeSqliteFiles(dbPath)
  process.env.DATABASE_URL = databaseUrl
  runPrisma(['db', 'push', '--skip-generate', '--accept-data-loss'], databaseUrl)
  return databaseUrl
}

export function cleanupPrismaTestDb(databaseUrl?: string) {
  if (!databaseUrl?.startsWith('file:')) return
  removeSqliteFiles(databaseUrl.slice('file:'.length))
}
