<h1 align="center">
  Agent Studio
</h1>

<p align="center">
  <b>AI 素材工厂 + 本地内容 Agent OS</b><br>
  一句话生成图文 / 视频脚本 / 商业素材 · 积分计费闭环 · 预览发布互动复盘全链路
</p>

<p align="center">
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Runtime-Mac%20local%20agent-111827?style=flat-square" alt="Mac local agent runtime">
  <img src="https://img.shields.io/badge/Frontend-React%2019-46D58C?style=flat-square&logo=react&logoColor=07100B" alt="React 19">
  <img src="https://img.shields.io/badge/BFF-Hono-FF5A1F?style=flat-square" alt="Hono BFF">
  <img src="https://img.shields.io/badge/Store-SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Renderer-Playwright-2EAD33?style=flat-square&logo=playwright&logoColor=white" alt="Playwright renderer">
  <img src="https://img.shields.io/badge/Billing-credits%20ledger-D7FF6B?style=flat-square&logoColor=07100B" alt="Credits ledger">
</p>

<p align="center">
  <sub>面向小白的素材工厂入口 + 面向团队的高级 Agent 运营系统,共用一套内容引擎、视觉引擎、模型网关和积分账本。</sub>
</p>

## 1. 这是什么

Agent Studio 是一个 local-first 的内容生产与运营系统,现在是 **双层产品**:

- **Beginner 模式 · 素材工厂 (Material Factory)**：小白入口。选类型 -> 选平台 -> 输入一句话 -> 选风格 -> 看积分预估 -> 生成 -> 预览/导出。支持小红书图文、社媒文案包、AI 生图、商品/活动海报、广告素材、短视频脚本。
- **Advanced 模式 · Agent OS**：保留原有高级运营能力。选题研究、内容工作台、Visual Studio、Preview Hub、发布助手、Autopilot 自动发布、系列内容、互动监控、数据复盘。

两层共用同一套底座:内容引擎、视觉引擎、模板库、Playwright 渲染、模型网关、积分账本。素材工厂产物可一键继续进入 Agent OS。

安全边界(护城河,保持不变):不存平台密码、不绕过验证码/风控、不批量重复发帖,浏览器动作默认 draft,只有显式 `mode=publish/schedule` 才允许最终发布,且全程要求已授权账号 + trace + 截图。

## 2. v0.8 关键更新

| 模块 | 更新 |
|---|---|
| 素材工厂 | 新增 `#/factory` 小白向导入口,6 类素材、6 种风格、4 档模型预设,生成即预览 |
| 模型网关 | 新增 `server/src/modelGateway.js`,统一 text / image / video 入口,无 key 时本地 fallback,不中断流程 |
| 积分账本 | 新增 `credit_accounts` / `credit_ledger` / `usage_events` / `factory_jobs`,生成走「预估 -> 预扣 -> 记录用量 -> 消费 -> 失败退款」闭环 |
| 计费 API | 新增 `/api/billing/plans`、`/api/billing/credits`、`/api/billing/usage`,Business 页展示真实余额、流水和用量 |
| Workspace | 新增请求级 `requestContext`,新接口显式传 `workspaceId`,不再依赖进程全局状态 |
| 视觉升级 | 按 taste-skill 审阅:深绿黑主题、电光绿主色、纹理质感、tactile 交互、focus/skip-link/reduced-motion、空/加载/错误态、SEO/OG meta |

## 3. 架构

```text
React 控制台 (素材工厂 + Agent OS 双入口)
  -> Hono BFF API
    -> 内容引擎 contentEngine + 模型网关 modelGateway
    -> 视觉引擎 visualEngine + 模板库 templateRegistry
    -> Playwright 本地渲染 (PNG / motion / video)
    -> SQLite 状态库 + 积分账本 + usage_events
      -> Codex 待执行任务队列
        -> 本机已登录浏览器执行器 (draft 默认)
          -> trace / 截图 / 互动 / 复盘 回写
```

关键文件:

- `src/views/AllViews.jsx`：素材工厂 `FactoryView`、Business 计费页、Studio、Publish 等视图。
- `src/lib/contentEngine.js`：内容包、runbook、研究、评论、复盘 builders。
- `src/lib/visualEngine.js`：视觉引擎合约和 HTML 渲染器。
- `server/src/index.js`：Agent + Factory + Billing API surface。
- `server/src/factory.js`：素材工厂编排,串联模型网关、引擎、渲染、积分。
- `server/src/modelGateway.js`：text/image/video 统一模型网关。
- `server/src/credits.js`：积分套餐、估算、汇总。
- `server/src/store.js`：SQLite 持久化,含 workspace、积分、用量、factory_jobs。
- `server/src/requestContext.js`：请求级 workspace/user 解析。

## 4. 快速开始

```bash
git clone https://github.com/leoyb1010/agent-studio.git
cd agent-studio
pnpm install
pnpm exec playwright install chromium
cp .env.example .env
pnpm build
PORT=48787 FRONTEND_PORT=45173 pnpm run local:start
```

本地控制台:

```text
http://127.0.0.1:45173/
```

打开后默认进入工作台;素材工厂在左侧导航顶部 Beginner 分组,高级模块在 Agent OS 分组。

## 5. 素材工厂 smoke test

```bash
# 查看配置和积分
curl http://127.0.0.1:48787/api/factory/config
curl http://127.0.0.1:48787/api/billing/credits

# 预估积分(不扣费)
curl -X POST http://127.0.0.1:48787/api/factory/estimate \
  -H 'Content-Type: application/json' \
  -d '{"assetType":"carousel","platform":"xhs","intent":"educate","prompt":"用 AI 做小红书素材","modelPreset":"balanced"}'

# 生成(扣费,失败退款)
curl -X POST http://127.0.0.1:48787/api/factory/generate \
  -H 'Content-Type: application/json' \
  -d '{"assetType":"social_pack","platform":"xhs","intent":"educate","prompt":"用 AI 做小红书素材","modelPreset":"cheap"}'
```

预期:`estimate` 返回 `creditsEstimated`;`generate` 返回 `job` + `result` + `usage` + 扣费后的 `credits`。

## 6. 主要 API

### 素材工厂 / 计费

| API | 用途 |
|---|---|
| `GET /api/factory/config` | 素材类型、风格、模型预设、provider 状态、当前积分 |
| `POST /api/factory/estimate` | 估算积分,不扣费 |
| `POST /api/factory/generate` | 生成素材,预扣 -> 调网关 -> 复用引擎 -> 消费/退款 |
| `GET /api/factory/jobs` | 列出 workspace 的生成任务 |
| `GET /api/billing/plans` | 会员套餐 (Free / Creator / Studio / Agency) |
| `GET /api/billing/credits` | 当前余额、流水 |
| `GET /api/billing/usage` | 模型用量 usage_events |

### Agent OS (保留)

`/api/generate`、`/api/research/*`、`/api/assets/*`、`/api/smoke/graphic`、`/api/autopilot/*`、`/api/series/*`、`/api/engagement/*`、`/api/codex/*`、`/api/analytics/*`。完整列表见 `GET /api/agent/manifest` 和 `GET /api/health`。

## 7. 模型与 provider 配置

`cp .env.example .env` 后按需填写:

| 变量 | 作用 |
|---|---|
| `CREATIVE_TEXT_API_KEY` / `OPENAI_API_KEY` | 文本生成走真实模型,未配置走本地 fallback |
| `CREATIVE_TEXT_BASE_URL` / `CREATIVE_TEXT_MODEL` | OpenAI 兼容 endpoint 和模型 |
| `IMAGE_GENERATION_API` | 生图 provider(占位,未配置时网关返回 prompt/mock) |
| `VIDEO_RENDER_API` | 生视频 provider(占位,未配置时返回分镜 + 本地 motion preview) |
| `TAVILY_API_KEY` / `FIRECRAWL_API_KEY` / `JINA_API_KEY` | 研究采集 |
| `POSTHOG_*` | 数据复盘 |
| `DATABASE_URL` / `SUPABASE_*` / `NEON_REST_URL` | 生产数据库(本地默认 SQLite) |

无任何 key 时整套流程仍可本地跑通,用于演示。

## 8. 积分与会员(MVP stub)

| 计划 | 价格 | 月度积分 | 面向 |
|---|---|---|---|
| Free | ¥0 | 1000 | 试用 / 本地 demo |
| Creator | ¥69/月 | 3000 | 个人创作者 / 博主 |
| Studio | ¥199/月 | 10000 | 小团队 / MCN / 代运营 |
| Agency | 定制 | 50000 | 多客户代理 / 企业 |

参考扣费:图文 10、社媒文案 5、生图 20 起、生视频 100 起(按秒加权)。真实支付、订阅 webhook、发票为后续阶段,当前账本已就绪。

## 9. 测试与构建

```bash
pnpm test     # vitest, 56 passed
pnpm build    # vite build
pnpm exec playwright install chromium   # 首次需要,渲染/视频测试依赖
```

## 10. 安全边界

- 前端不放 API Key,不提交 `.env`。
- 不保存社媒平台密码,不绕过 CAPTCHA / 风控,不批量重复发帖。
- 默认 draft;`publish` / `schedule` 必须显式传入。
- 浏览器任务必须提供 trace 和关键截图,高风险评论必须人工确认。
- 模型 API 用量记录在服务端 `usage_events`,不泄露 key 到前端或日志。

## 11. 设计规范

视觉层基于 [taste-skill](https://github.com/Leonxlnx/taste-skill) 审阅升级,已安装的 SKILL 文档在 `.agents/skills/`,锁定在 `skills-lock.json`。核心规则:克制单一主色、纹理与深度、完整交互状态、可访问性、零 em-dash。

## 12. License

Private project unless a license file is added.
