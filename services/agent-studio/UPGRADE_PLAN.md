# Agent Studio Content OS · 升级与迭代计划

> 当前版本：v0.4（本地长期运行：内容引擎 + Visual Studio + Autopilot + Series + Engagement）
> 运行形态：单 Node/Hono 进程，长期跑在本机；Codex / 浏览器 Agent 用真实登录浏览器执行发布。
> 本文档随代码更新，取代早期 v0.2 原型说明。

---

## 0. 这一轮 review / debug 修了什么（→ 进入 v0.4 稳定线）

| 类别 | 问题 | 修复 |
|---|---|---|
| 部署一致性 | 运行中的安装副本（`~/Library/Application Support/AgentStudioContentOS/app`）和 git 仓库**双向分叉**：运营修复只在安装副本、视觉修复只在仓库 | 把运营修复回流仓库，确立 **git 仓库为唯一真源**；`/api/health` 增加 `packageVersion`/`build`，可一眼看出在跑哪份代码 |
| Autopilot | 浏览器任务完成后 **slot 状态不回写**，看板永远停在 `queued` | `/api/codex/task-result`、`/api/agent/trace` 按结果回写 slot 为 `published`/`failed`（含 `postUrl`、`completed_at`） |
| 队列健壮性 | 卡死任务**永久阻塞队列**（实测 51 个互动任务积压） | `sweepStaleCodexTasks` + engagement 入队前清扫，超时任务自动判失败释放（阈值可用 env 调） |
| 内容生成 | `/api/generate` **从不真正调用 LLM**，只打标签 | 接入 `generateCreativeContent`（DeepSeek/OpenAI 兼容），模型产出经 `buildPack` 平台格式化 + sanitize/policy gate；`/api/generate`、`/api/smoke/graphic`、Autopilot 全部 best-effort 用模型，失败降级到确定性包 |
| 视觉校验 | 小红书 carousel `empty_center` 误杀正常编辑卡 → 端点 **500 崩溃** | 根因：6 卡纵向堆叠、视口仅一卡高，卡 2-6 在屏外 `elementFromPoint` 恒为 null。改为**基于内容文本/图片**判断空卡；renderer 异常时路由返回结构化 **422 + violations**，不再 500 |
| 性能 | renderer 每导出一张图启动一个 Chromium | 共享浏览器实例（断连自动重启），按页关闭 |
| 配置 | `.env.example` `PORT=8787` 与默认 48787 不符；缺 `POSTHOG_PROJECT_ID`/`POSTHOG_HOST` 导致分析配不通；`pickTopic` 在 manual-only 下会 fallback 自动主题 | 全部修正 |

测试：`vitest` 40 passed（含新增 creative 覆盖路径测试）；`vite build` 正常。

---

## 1. 核心架构现状（真源）

```
React 控制台 → Hono BFF API → 内容/研究/视觉 builders → Playwright 本地渲染（共享浏览器）
  → 本地 JSON 状态库（原子写）→ Codex 待执行任务队列（含卡死清扫）
    → 真实登录浏览器执行（Codex computer-use，draft 默认，publish/schedule 显式）
      → trace/截图回写 → slot/engagement 状态更新 → 评论与数据反哺
```

关键文件：
- `src/lib/contentEngine.js`：内容包（支持 `{ creative }` 模型覆盖）、runbook、研究、评论、复盘 builders。
- `server/src/creativeModel.js`：`generateCreativeContent`（主内容）+ `planXhsCarouselWithCreativeModel`（carousel）。
- `server/src/index.js`：Agent API + slot 回写 + 卡死清扫 + carousel 422 兜底 + `/api/health` build 标识。
- `server/src/autopilot.js`：每日三窗口、主题池、素材化（best-effort 模型）、Codex 入队。
- `server/src/engagement.js`：评论/私信监控、回复策略、卡死清扫。
- `server/src/renderer.js`：共享 Chromium、PNG/视频导出、carousel 内容校验。
- `server/src/store.js`：原子写本地状态。

安全边界（不变，且是产品护城河）：不存平台密码、默认 draft、`publish`/`schedule` 显式、trace+截图强制、敏感词硬拦截 + 隐私清洗、用真实登录浏览器（**不绕过风控，而是没有需要绕过的东西**）。

---

## 2. 升级路线

### P1 · 执行层换血（最高杠杆，进行中）
数据显示瓶颈不在生成、不在风控，而在「用 agentic computer-use 逐帧操作浏览器」太慢、太飘（任务超窗口未执行而失败）。

- **主力**：用 Playwright **持久化上下文驱动真实 Chrome user-data-dir**，为每个平台写确定性发布脚本（脚手架见 `scripts/playwright-executor.js`，opt-in，默认 draft，停在确认页）。同一真实 session/指纹/人类节奏，平台侧与「人手动发」无异，但稳定、快、近乎零成本。
- **兜底**：仅当选择器失配/页面结构变化时，交回 computer-use LLM agent「重新找按钮」并回写新选择器。
- **队列协议**：publish 任务保持「超时判失败」（不盲目重试，避免重复发帖）；engagement 由 interval 自然重试。后续加 lease + heartbeat。

### P2 · 让生成全面模型化（已落地核心，可继续打磨）
- ✅ `/api/generate` / smoke / Autopilot 接入真实模型。
- 待办：流式 token（当前先整体生成再播 stage 动画）；为产品/系列主题做专用 system prompt；把 `empty_center` 进一步从硬校验升级为「软信号 + 自动重生成那一张卡」。

### P3 · 可靠性与数据（计划）
- `state.json` 已 ~1.8MB（百级任务）。迁移 **SQLite（better-sqlite3）**：可查询、保留/清理策略、避免单文件膨胀。先双写灰度，再切换。
- 日志轮转；每平台健康面板（成功率、上次成功、结构变更检测）；错过发布窗口主动通知。

### P4 · 闭环增强（远期）
- 评论信号自动回灌选题池（engagement → topicQueue）。
- 24/72h 数据反哺下一轮生成（`brand_learnings` 注入 system prompt），形成「越用越懂账号」。
- 竞品镜像、热点雷达接入已有 research connectors。

---

## 3. 部署与运维约定（避免再次分叉）
1. **git 仓库 = 唯一真源**。改动先进仓库、跑 `pnpm test && pnpm build`，再部署。
2. 部署 = 从仓库构建后同步到 `~/Library/Application Support/AgentStudioContentOS/app`，写入 `BUILD_SHA`，重启。
3. 用 `curl /api/health` 的 `build` 字段确认线上版本与仓库一致。
4. 长期运行进程定期重启（释放浏览器/内存），由 `launchd`/`pm2` 守护。
