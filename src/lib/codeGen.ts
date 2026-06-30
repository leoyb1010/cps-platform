// 有道续费对接 · 签名+请求代码生成（纯前端，零密钥外泄；私钥一律占位符）。
// 每个模板把「按 key 升序拼接 → SHA256withRSA 签 → base64」写成可读步骤，让合作方代码与有道验签逐字对齐。

export interface CodeGenInput {
  baseUrl: string
  path: string
  method: 'POST' | 'GET'
  params: Record<string, string>
}

const PRIV_PLACEHOLDER = '<YOUR_RSA_PRIVATE_KEY.pem>'

function sortedPairs(params: Record<string, string>): [string, string][] {
  return Object.entries(params)
    .filter(([k, v]) => k !== 'sign' && v !== null && v !== undefined && v !== '')
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}
export function stringToSign(params: Record<string, string>): string {
  return sortedPairs(params).map(([k, v]) => `${k}=${v}`).join('&')
}

export function genCurl(i: CodeGenInput): string {
  const sts = stringToSign(i.params)
  const fields = sortedPairs(i.params)
  const formArgs = fields.map(([k, v]) => `  -d '${k}=${v}' \\`).join('\n')
  return `# 1. 待签名串（key 升序、剔除空值与 sign）
STR='${sts}'
# 2. 用私钥 SHA256withRSA 签名 → base64
SIGN=$(printf '%s' "$STR" | openssl dgst -sha256 -sign ${PRIV_PLACEHOLDER} | openssl base64 -A)
# 3. 携带 sign 发起请求
curl -X ${i.method} '${i.baseUrl}${i.path}' \\
${formArgs}
  -d "sign=$SIGN"`
}

export function genNode(i: CodeGenInput): string {
  return `import { createSign } from 'crypto'
import { readFileSync } from 'fs'

const params = ${JSON.stringify(i.params, null, 2)}
const privateKey = readFileSync('${PRIV_PLACEHOLDER}', 'utf8')

// 1. 待签名串
const base = Object.entries(params)
  .filter(([k, v]) => k !== 'sign' && v != null && v !== '')
  .sort((a, b) => (a[0] < b[0] ? -1 : 1))
  .map(([k, v]) => \`\${k}=\${v}\`).join('&')
// 2. SHA256withRSA → base64
const signer = createSign('sha256'); signer.update(base, 'utf8')
const sign = signer.sign(privateKey, 'base64')
// 3. 请求
const body = new URLSearchParams({ ...params, sign })
const res = await fetch('${i.baseUrl}${i.path}', { method: '${i.method}', body })
console.log(await res.json())`
}

export function genJava(i: CodeGenInput): string {
  return `// 待签名串：参数按 key 升序，k=v& 拼接，剔除空值与 sign
String base = "${stringToSign(i.params)}";
// SHA256withRSA 签名 → base64
Signature signature = Signature.getInstance("SHA256withRSA");
signature.initSign(privateKey); // PKCS8 私钥
signature.update(base.getBytes(StandardCharsets.UTF_8));
String sign = Base64.getEncoder().encodeToString(signature.sign());
// 携带 sign 以 form-data POST 到 ${i.baseUrl}${i.path}`
}

export function genPython(i: CodeGenInput): string {
  return `from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
import base64, requests

params = ${JSON.stringify(i.params)}
with open('${PRIV_PLACEHOLDER}', 'rb') as f:
    private_key = serialization.load_pem_private_key(f.read(), password=None)

# 1. 待签名串
items = sorted((k, v) for k, v in params.items() if k != 'sign' and v not in (None, ''))
base = '&'.join(f'{k}={v}' for k, v in items)
# 2. SHA256withRSA → base64
sig = private_key.sign(base.encode(), padding.PKCS1v15(), hashes.SHA256())
sign = base64.b64encode(sig).decode()
# 3. 请求
r = requests.${i.method.toLowerCase()}('${i.baseUrl}${i.path}', data={**params, 'sign': sign})
print(r.json())`
}

export const LANGS = [
  { key: 'curl', label: 'curl', gen: genCurl },
  { key: 'node', label: 'Node.js', gen: genNode },
  { key: 'java', label: 'Java', gen: genJava },
  { key: 'python', label: 'Python', gen: genPython },
] as const
