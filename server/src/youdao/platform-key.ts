import { createHash, createPrivateKey } from 'crypto'
import { DEMO_RSA_PRIVATE } from './demo-keys'

/**
 * 有道出站回调 · 平台私钥单点收敛。
 *
 * 私钥从 env 注入时经常被"压成一行"：docker compose / .env / CI 的 heredoc 会把换行写成字面 `\n`
 * （scripts/prepare-deploy-env.sh 就是这么产出的），有的还会再套一层引号或带 Windows `\r`。
 * Node `crypto.createPrivateKey` 只认真实换行，拿到字面 `\n` 会直接抛 `error:1E08010C:DECODER routines`——
 * 而且是在首次签回调时才炸，启动看起来一切正常。这里统一归一化 + 启动期真解析，把问题前移到进程启动。
 */

/** 把 env 里各种写法的 PEM 归一成 Node crypto 可解析的多行文本。 */
export function normalizePem(raw: string): string {
  let s = (raw ?? '').trim()
  // 剥掉一层包裹引号（.env 里 KEY="..." 写法经某些加载器后引号会保留）
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    s = s.slice(1, -1)
  }
  // 先处理双重转义 `\\n`（shell 脚本 printf 再经 compose 解析可能残留），再处理单层 `\n`
  s = s.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n')
  s = s.replace(/\r/g, '')
  // 行尾多余空白、多余空行清掉，保证 BEGIN/END 各占一行
  s = s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n')
  return s.length ? s + '\n' : ''
}

/** 真解析：能被 crypto.createPrivateKey 接受才算合法私钥（而不是"含 PRIVATE KEY 字样"）。 */
export function isParsablePrivateKey(pem: string): boolean {
  try {
    createPrivateKey({ key: pem, format: 'pem' })
    return true
  } catch {
    return false
  }
}

/** 运行期取平台私钥：env 有值则归一化后使用；否则回退仓库内 demo 私钥（仅演示，生产由 assertPlatformPrivateKey 拒绝）。 */
export function loadPlatformPrivateKey(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.YOUDAO_PLATFORM_PRIVATE_KEY
  if (raw && raw.trim()) return normalizePem(raw)
  return DEMO_RSA_PRIVATE
}

const fingerprint = (pem: string) => createHash('sha256').update(pem.replace(/\s+/g, '')).digest('hex')

/**
 * 生产启动闸：① 必须是 PEM 私钥；② 不能是仓库公开的 demo 私钥；③ 归一化后必须能被 createPrivateKey 解析。
 * 任一不满足即抛错拒启——宁可起不来，也不要"起来了但回调签名一定失败 / 可被伪造"。
 */
export function assertPlatformPrivateKey(raw: string | undefined): void {
  const pem = normalizePem(raw ?? '')
  if (!pem.includes('PRIVATE KEY')) {
    throw new Error('[安全] 生产环境 YOUDAO_PLATFORM_PRIVATE_KEY 未设置真实 RSA 私钥（PEM）——回退 demo 私钥会被伪造回调')
  }
  if (fingerprint(pem) === fingerprint(DEMO_RSA_PRIVATE)) {
    throw new Error('[安全] YOUDAO_PLATFORM_PRIVATE_KEY 使用了仓库内公开的 demo 私钥——生产必须换成自有私钥')
  }
  if (!isParsablePrivateKey(pem)) {
    throw new Error(
      '[安全] YOUDAO_PLATFORM_PRIVATE_KEY 无法被 Node crypto 解析（PEM 损坏 / 换行转义异常）——请用 openssl genrsa 2048 重新生成，' +
        '多行 PEM 或以 \\n 表示换行的单行均可',
    )
  }
}
