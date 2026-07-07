# 依赖漏洞审计策略

后端当前执行：

```bash
npm audit --audit-level=moderate
```

截至本次修复，后端依赖审计为 `found 0 vulnerabilities`。CI 已从“报告但不阻断”改为 moderate 级别阻断，避免 auth、RBAC、资金、清结算、审计等链路继续带着未研判漏洞进入 `main`。

## 本次处理

- 将 `vitest` 从 2.x 升级到 4.x，消除旧 Vite/Vitest 链路中的 high/critical 告警。
- 将 `prisma` 与 `@prisma/client` 固定到同一 6.19.3 版本，避免 semver 漂移，并保留与现有 `db push --skip-generate` 脚本兼容。
- 删除 CI 中后端 audit 的 `|| true` 与 `continue-on-error`。

## 例外策略

不再默认接受“传递依赖不可触发”的永久例外。若后续必须临时 allowlist，必须同时写清：

1. advisory 编号与受影响包；
2. 本项目不可触发或影响可控的证据；
3. 到期时间；
4. 复核人和后续升级路径。
