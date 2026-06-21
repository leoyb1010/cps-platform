# 依赖漏洞研判（npm audit triage）

> CI 跑 `npm audit`。前端 0 high → 阻断。后端现存若干 high/critical，**全部是传递依赖**，
> 逐条研判后判定「本项目不可触发」，故 CI 报告但不阻断；引入**新可利用**漏洞时人工处理。
> 本文件记录每条的研判依据，避免「非阻断」变成「无脑忽略」。

## 后端现存告警逐条研判

| 包 | 来源(传递路径) | 告警 | 本项目是否可触发 | 处置 |
|---|---|---|---|---|
| `multer` (high) | `@nestjs/platform-express` → multer | 深层嵌套字段名 DoS / 中断上传清理不全 | **否** —— 全项目无任何文件上传(`multipart/form-data`)端点，multer 代码路径不被调用 | 监控；NestJS 升级带新 multer 时跟进 |
| `esbuild` (moderate) | `vitest` → esbuild | dev-server 任意站点可读响应 | **否** —— esbuild 仅测试/构建期用，生产不跑 dev-server | dev-only，无生产暴露 |
| `js-yaml` (moderate) | `@nestjs/swagger` → js-yaml | merge key 二次复杂度 DoS | **否(低)** —— 仅 /docs 生成 OpenAPI 时解析受控的内部文档，不解析外部 YAML | 监控；生产可关闭 /docs |
| 其余 (moderate/high) | 同上链路的传递项 | 同类 | 否 | 随框架版本升级自然消化 |

## 为什么不直接 `npm audit fix --force`

`--force` 会把 `@nestjs/core`/`vitest`/`@nestjs/swagger` **降级或跨大版本升级**（破坏性变更），
导致整个后端无法构建、测试套件失效。用「破坏可用系统」换「不可触发的传递告警」不划算。

## 真正该做的（生产化阶段）

1. **跟随上游**：定期 `npm outdated` + 跟进 NestJS 11.x 补丁版本，待官方修复 multer/js-yaml 链路。
2. **引入 `audit-ci` + allowlist**：把上述已研判项加进 allowlist，使「新出现的、未研判的」漏洞才阻断 CI。
3. **关闭生产 /docs**：生产环境不暴露 Swagger，进一步缩小 js-yaml 面。
4. **Dependabot**：开 GitHub Dependabot 自动 PR 升级，人工 review 合并。

## 结论

当前后端 high/critical 告警 **均不可被本项目利用**（无上传路由 / dev-only / 受控内部解析）。
CI 保留扫描以发现**新增**风险，但不因这些已研判的传递告警阻断流水线。
