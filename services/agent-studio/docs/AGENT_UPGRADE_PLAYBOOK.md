# Agent Studio 全面升级吸收文档

> 目标：把当前 Agent Studio 从“内容生成 + 发布 runbook 原型”，升级为一个可商业化的 **本地 Agent 社媒运营系统**。  
> 核心执行方式：云端/本地生成与编排，**部署电脑上的 Codex app 浏览器自动化**负责真实网页采集、发布、评论维护和数据复盘。  
> 重要前提：部署机器已经安装并可使用 Codex app，因此浏览器执行层默认优先走 Codex app 本地自动化，而不是云端浏览器或平台 API。

---

## 1. 当前产品判断

当前仓库已经具备以下基础：

- 前端工作台：`src/main.jsx`
- 内容引擎：`src/lib/contentEngine.js`
- 平台/Agent 配置：`src/lib/catalog.js`
- BFF API：`server/src/index.js`
- 请求 schema：`server/src/schema.js`
- Agent API：
  - `GET /api/agent/manifest`
  - `POST /api/agent/runbook`
  - `POST /api/agent/comments`
  - `POST /api/generate`
  - `POST /api/publish/draft`
- 当前方向已经从人用 SaaS 转成 **Agent-first local executor**。

需要补齐的是：

1. 信息采集 Agent
2. 研究与选题 Agent
3. HTML/CSS 素材渲染器
4. Codex 浏览器发布执行 runbook
5. 评论维护闭环
6. 数据复盘和 brand learning
7. Agent Run Console
8. 商业化级别的数据模型、日志、权限、安全边界

---

## 2. 产品最终形态

目标流程：

```text
每天定时启动
  ↓
Agent 搜集社媒/网页/竞品/评论信息
  ↓
生成素材池 source_items
  ↓
研究 Agent 产出 research_briefs
  ↓
选题 Agent 产出 topic_candidates
  ↓
内容 Agent 生成多平台 content_pack
  ↓
HTML Renderer 生成图文/长图/视频分镜素材
  ↓
Codex app 操作本机浏览器发布/预约
  ↓
Codex app 维护评论区
  ↓
Codex app 读取后台数据
  ↓
复盘 Agent 写入 brand_learnings
  ↓
下一轮选题更准
```

产品定位：

```text
Agent-first creator operating system
```

不是普通社媒排程工具，而是：

```text
本地浏览器执行 + AI 研究生成 + 多平台内容运营闭环
```

---

## 3. 需要学习和吸收的 GitHub 仓库

### 3.1 信息采集层

#### firecrawl/firecrawl

- URL: https://github.com/firecrawl/firecrawl
- Stars: 约 124k+
- 作用：搜索、抓取、清洗网页，给 Agent 产出 LLM-friendly 内容。

需要学习：

- search / scrape / crawl 的 API 设计
- 网页转 Markdown / JSON 的清洗方式
- source metadata 保存方式
- 失败重试、限流、队列设计
- 面向 Agent 的数据返回格式

落到本项目：

```text
POST /api/research/search
POST /api/research/scrape
POST /api/research/collect
```

新增数据结构：

```ts
source_item = {
  id,
  source_url,
  source_platform,
  title,
  raw_text,
  clean_markdown,
  summary,
  captured_at,
  credibility_score,
  relevance_score,
  content_angles,
  evidence_quotes
}
```

---

#### unclecode/crawl4ai

- URL: https://github.com/unclecode/crawl4ai
- Stars: 约 66k+
- 作用：开源 LLM-friendly crawler/scraper。

需要学习：

- 面向 LLM 的 crawler 输出格式
- 深度抓取、页面过滤、内容压缩
- 对动态网页的处理策略
- chunking 和 markdown 清洗

落到本项目：

```text
Research Browser / Research Scraper
```

用于：

- 抓知乎回答
- 抓博客/招聘/行业文章
- 抓竞品主页
- 抓内容评论页

---

#### ScrapeGraphAI/Scrapegraph-ai

- URL: https://github.com/ScrapeGraphAI/Scrapegraph-ai
- Stars: 约 26k+
- 作用：用自然语言定义抓取目标，AI scraper。

需要学习：

- “我要从页面里提取什么”的自然语言任务设计
- graph-based scraping pipeline
- schema-driven extraction
- LLM extraction 与传统 DOM parsing 的组合

落到本项目：

```text
POST /api/research/extract
```

示例任务：

```json
{
  "url": "竞品账号页面",
  "instruction": "提取最近 10 条内容的标题、互动数、评论高频问题",
  "schema": {
    "posts": [
      {
        "title": "string",
        "published_at": "string",
        "likes": "number",
        "comments": "number",
        "content_angle": "string"
      }
    ]
  }
}
```

---

#### jina-ai/reader

- URL: https://github.com/jina-ai/reader
- Stars: 约 10k+
- 作用：把 URL 转成 LLM-friendly 输入。

需要学习：

- 极简 URL-to-text 接口
- 对 Agent 友好的读取方式
- 快速把外部链接转成 prompt context

落到本项目：

```text
source_url -> clean_text -> research_brief
```

适合用于轻量网页读取，而不是复杂浏览器任务。

---

### 3.2 研究与选题 Agent

#### assafelovic/gpt-researcher

- URL: https://github.com/assafelovic/gpt-researcher
- Stars: 约 27k+
- 作用：自主研究 Agent。

需要学习：

- query planning
- 多来源检索
- source grounding
- report synthesis
- citation 保留
- research task lifecycle

落到本项目：

```text
POST /api/research/brief
POST /api/research/topics
```

新增结构：

```ts
research_brief = {
  id,
  topic,
  sources,
  facts,
  contradictions,
  audience_pains,
  contrarian_angle,
  suggested_formats,
  risk_flags
}
```

---

#### langchain-ai/open_deep_research

- URL: https://github.com/langchain-ai/open_deep_research
- Stars: 约 11k+
- 作用：深度研究流程参考。

需要学习：

- multi-step research workflow
- research state management
- plan -> search -> synthesize -> final answer

落到本项目：

```text
Daily Research Agent
```

每天自动生成：

```text
今日热点
竞品在讲什么
用户在问什么
哪些内容不建议碰
今天最值得做的 5 个选题
```

---

#### deepset-ai/haystack

- URL: https://github.com/deepset-ai/haystack
- Stars: 约 25k+
- 作用：RAG / agent pipeline / retrieval orchestration。

需要学习：

- pipeline 设计
- retriever / ranker / generator 分层
- metadata filtering
- production RAG 结构

落到本项目：

```text
source_items -> retrieval -> topic_candidates -> content_pack
```

后续可以接：

- brand knowledge base
- historical post memory
- comment memory
- industry source library

---

### 3.3 浏览器自动化执行层

#### browser-use/browser-use

- URL: https://github.com/browser-use/browser-use
- Stars: 约 95k+
- 作用：让 AI Agent 操作网页。

需要学习：

- browser task abstraction
- page observation
- action planning
- login/session handling
- failure recovery
- screenshots / trace

落到本项目：

```text
Codex Browser Executor
```

重点用于：

- 发布
- 预约
- 评论读取
- 评论回复
- 后台数据读取
- 竞品页面观察

---

#### microsoft/playwright-mcp

- URL: https://github.com/microsoft/playwright-mcp
- Stars: 约 33k+
- 作用：通过 MCP 暴露 Playwright 浏览器能力。

需要学习：

- MCP tool schema
- 浏览器能力如何暴露给 Agent
- screenshot / click / type / DOM snapshot 设计
- Agent 可调用工具边界

落到本项目：

```text
/api/agent/manifest
/api/agent/runbook
```

要让 Codex 读取 manifest 后知道：

```text
这个产品有哪些任务
平台入口在哪
要填什么
什么时候停
失败怎么回传
```

---

#### browserbase/stagehand

- URL: https://github.com/browserbase/stagehand
- Stars: 约 22k+
- 作用：Browser Agent SDK。

需要学习：

- higher-level browser action abstraction
- act / observe / extract 设计
- 托管浏览器商业化形态
- 任务 trace 与 debug

落到本项目：

用于未来云端执行版本：

```text
Cloud Browser Executor
```

但当前优先级低于 Codex app 本机浏览器。

---

#### Skyvern-AI/skyvern

- URL: https://github.com/Skyvern-AI/skyvern
- Stars: 约 21k+
- 作用：AI 浏览器工作流自动化。

需要学习：

- 表单填写
- 多步骤任务
- 任务状态
- 失败恢复
- 审计日志

落到本项目：

```text
agent_run
browser_task
trace
failure_reason
retry_policy
```

---

### 3.4 社媒产品层

#### gitroomhq/postiz-app

- URL: https://github.com/gitroomhq/postiz-app
- Stars: 约 30k+
- 作用：agentic social media scheduling tool。

需要学习：

- 多平台 composer
- 内容日历
- 社媒账号连接
- 排程模型
- post / draft / media 的数据结构
- AI agent 与社媒排程结合方式

落到本项目：

```text
content_pack
draft
publish
schedule
account_session
workspace
```

---

#### gitroomhq/postiz-agent

- URL: https://github.com/gitroomhq/postiz-agent
- Stars: 约 200+
- 作用：给 Claude / OpenClaw 等 Agent 用的社媒 CLI。

需要学习：

- Agent-facing CLI/API 设计
- 如何把社媒任务暴露给 Agent
- 参数设计和认证方式

落到本项目：

当前的 `/api/agent/manifest` 和 `/api/agent/runbook` 应继续强化，做成 Agent 友好的协议。

---

#### trypostit/trypost

- URL: https://github.com/trypostit/trypost
- Stars: 约 170+
- 作用：开源社媒排程平台。

需要学习：

- MCP Server
- REST API
- brand profile
- AI carousel generator
- workspace / teams
- analytics

落到本项目：

```text
Brand Voice Profile
AI Carousel
Team Review
Analytics Dashboard
```

---

#### AJaySi/ALwrity

- URL: https://github.com/AJaySi/ALwrity
- Stars: 约 1k+
- 作用：AI Digital Marketing Platform。

需要学习：

- AI content strategy
- SEO / social media / analytics 组合
- digital marketing workflow

落到本项目：

适合参考：

- 内容策略页
- 多渠道营销视角
- 复盘与 remarketing

---

### 3.5 工作流和商业化层

#### n8n-io/n8n

- URL: https://github.com/n8n-io/n8n
- Stars: 约 189k+
- 作用：工作流自动化平台。

需要学习：

- workflow node model
- credential management
- scheduler
- retry
- execution logs
- self-host/cloud 商业化模式

落到本项目：

```text
workflow_run
node_run
credential
schedule
retry_policy
```

---

#### langgenius/dify

- URL: https://github.com/langgenius/dify
- Stars: 约 142k+
- 作用：Agentic workflow development platform。

需要学习：

- Agent app 组织方式
- workflow builder
- knowledge base
- prompt / model provider 管理
- 团队和权限

落到本项目：

```text
Agent Run Console
Brand Knowledge Base
Model Provider Settings
```

---

#### FlowiseAI/Flowise

- URL: https://github.com/FlowiseAI/Flowise
- Stars: 约 53k+
- 作用：可视化 AI Agent Builder。

需要学习：

- 节点式流程可视化
- Agent 工具配置
- prompt chain / agent chain 组织方式

落到本项目：

不建议早期做重型可视化 builder，但可以参考：

```text
Agent task graph
Run timeline
Node status
```

---

#### activepieces/activepieces

- URL: https://github.com/activepieces/activepieces
- Stars: 约 22k+
- 作用：AI workflow automation / MCP。

需要学习：

- connector ecosystem
- MCP server integration
- agent workflow
- event trigger

落到本项目：

```text
Social platform connectors
Research connectors
Browser executor connector
Notification connector
```

---

## 4. Codex app 浏览器自动化在本产品里的定位

Codex app 浏览器自动化是核心执行引擎，不只是发布按钮。

本产品部署机器默认具备 Codex app 自动化能力，因此系统设计应采用：

```text
Agent Studio BFF 生成任务 / runbook
  ↓
Codex app 在本机读取 runbook
  ↓
Codex app 操作本机浏览器或 Codex 内置浏览器
  ↓
使用用户真实登录态完成采集、发布、评论维护、数据读取
  ↓
截图 / trace / 结果回传给 Agent Studio
```

这意味着：

1. 不需要优先做云端 cookie 托管。
2. 不需要优先申请小红书、微博、抖音等官方发布 API。
3. 不需要把用户账号密码交给 SaaS。
4. 真实发布、评论、后台数据读取都优先由本机 Codex app 完成。
5. `BROWSER_AGENT_RUNTIME` 的默认值应理解为 `codex-app-local`。

建议 `.env`：

```env
BROWSER_AGENT_RUNTIME=codex-app-local
```

如果未来支持云端执行，再增加：

```env
BROWSER_AGENT_RUNTIME=codex-app-local | browser-use | stagehand | playwright-mcp
```

### 4.1 Research Browser

用于：

- 搜小红书关键词
- 搜微博话题
- 看 X 搜索结果
- 看知乎问题/回答
- 看 B站视频评论
- 打开竞品主页

产出：

```text
source_items
topic_signals
competitor_observations
comment_questions
```

### 4.2 Verification Browser

用于：

- 打开原始链接
- 检查事实
- 截图留证
- 读取发布时间
- 判断素材是否可引用

### 4.3 Publishing Browser

用于：

- 打开创作中心
- 检查登录态
- 上传 HTML Renderer 导出的 PNG/MP4
- 填标题
- 填正文
- 填标签
- 选择发布时间
- 点击发布/预约，或停在确认页

在当前部署前提下，发布任务应直接生成给 Codex app 执行的步骤，不要只生成抽象描述。

示例：

```json
{
  "executor": "codex-app-local",
  "platform": "xhs",
  "mode": "schedule",
  "requiresLoggedInBrowser": true,
  "openUrl": "https://creator.xiaohongshu.com/",
  "localAssets": [
    "/absolute/path/to/exported-card-01.png",
    "/absolute/path/to/exported-card-02.png"
  ],
  "steps": [
    "打开 openUrl",
    "检查当前是否已登录，如果未登录则暂停并提示用户手动登录",
    "进入发布图文笔记入口",
    "上传 localAssets 中的图片",
    "填写标题",
    "填写正文",
    "添加话题标签",
    "选择预约时间",
    "截图确认页面",
    "如果 mode=schedule 且用户授权，则点击预约；否则停在确认页"
  ],
  "traceRequired": true,
  "screenshotRequired": true
}
```

### 4.4 Comment Browser

用于：

- 打开已发布帖子
- 读取评论
- 点赞/回复低风险评论
- 高风险评论暂停确认
- 提取下一期选题

### 4.5 Analytics Browser

用于：

- 打开创作者后台
- 读取阅读/点赞/收藏/评论/粉丝变化
- 截图后台数据
- 生成 4h/24h/72h 复盘

---

## 5. 必须新增的数据模型

### 5.1 source_items

```sql
source_items(
  id,
  brand_id,
  source_url,
  source_platform,
  source_type,
  title,
  raw_text,
  clean_markdown,
  summary,
  evidence_json,
  credibility_score,
  relevance_score,
  captured_at
)
```

### 5.2 research_briefs

```sql
research_briefs(
  id,
  brand_id,
  topic,
  source_item_ids,
  brief_json,
  risk_flags,
  created_at
)
```

### 5.3 topic_candidates

```sql
topic_candidates(
  id,
  brand_id,
  research_brief_id,
  title,
  angle,
  target_platforms,
  score_json,
  status,
  created_at
)
```

### 5.4 browser_tasks

```sql
browser_tasks(
  id,
  brand_id,
  platform,
  account_label,
  mode,
  runbook_json,
  status,
  trace_url,
  screenshot_urls,
  error_message,
  created_at,
  completed_at
)
```

### 5.5 agent_runs

```sql
agent_runs(
  id,
  brand_id,
  run_type,
  status,
  input_json,
  output_json,
  cost_json,
  started_at,
  completed_at
)
```

### 5.6 brand_learnings

```sql
brand_learnings(
  id,
  brand_id,
  source_publish_id,
  learning_json,
  created_at
)
```

---

## 6. 必须新增 API

### Research

```text
POST /api/research/collect
POST /api/research/brief
POST /api/research/topics
GET  /api/research/sources
```

### Browser Executor

```text
POST /api/agent/runbook
POST /api/agent/browser-task
POST /api/agent/trace
GET  /api/agent/runs/:id
```

### Asset Renderer

```text
POST /api/assets/render-html
POST /api/assets/export-png
POST /api/assets/export-video
```

### Comments

```text
POST /api/agent/comments/read
POST /api/agent/comments/reply-draft
POST /api/agent/comments/maintain
```

### Analytics

```text
POST /api/analytics/collect
POST /api/analytics/brief
POST /api/analytics/learning
```

---

## 7. HTML Asset Renderer 方案

不要优先依赖图片生成 API。优先做稳定的 HTML/CSS 渲染。

流程：

```text
content_pack JSON
  ↓
HTML/CSS template
  ↓
Playwright screenshot
  ↓
PNG deck / long image
  ↓
Codex Browser 上传平台
```

视频流程：

```text
videoFrames JSON
  ↓
HTML animation / Remotion
  ↓
ffmpeg export
  ↓
MP4
```

新增目录建议：

```text
renderer/
  templates/
    xhs-card-deck.html
    instagram-carousel.html
    weibo-long-image.html
    video-storyboard.html
  src/
    renderDeck.js
    exportPng.js
    exportVideo.js
```

---

## 8. Codex 浏览器 runbook 标准

每个平台 runbook 必须包含：

```json
{
  "platform": "xhs",
  "executor": "codex-app-local",
  "mode": "draft | publish | schedule",
  "requiresLoggedInBrowser": true,
  "openUrl": "https://creator.xiaohongshu.com/",
  "steps": [
    "检查登录态",
    "进入创作页",
    "选择内容类型",
    "上传素材",
    "填写标题",
    "填写正文",
    "添加标签",
    "选择发布时间",
    "截图确认",
    "根据 mode 停止/发布/预约"
  ],
  "stopCondition": "draft 模式停在最终确认页",
  "traceRequired": true,
  "failureRecovery": [
    "未登录则暂停并提示用户登录",
    "上传失败重试一次",
    "找不到按钮则截图回传",
    "出现验证码/风控则停止，不绕过"
  ]
}
```

### 8.1 Codex app 专用 runbook 字段

因为部署机器具备 Codex app 自动化能力，runbook 需要比普通 API task 更具体：

```ts
type CodexBrowserRunbook = {
  executor: "codex-app-local";
  platform: string;
  mode: "draft" | "publish" | "schedule";
  accountLabel: string;
  openUrl: string;
  requiresLoggedInBrowser: true;
  localAssets: string[];
  content: {
    title: string;
    body: string;
    tags: string[];
  };
  steps: string[];
  stopCondition: string;
  traceRequired: true;
  screenshotRequired: true;
  failureRecovery: string[];
  forbiddenActions: string[];
}
```

必须加入：

```json
{
  "forbiddenActions": [
    "不要尝试绕过验证码",
    "不要绕过平台风控",
    "不要在未登录账号时继续执行",
    "不要在未授权时点击最终发布",
    "不要批量重复发布同一内容"
  ]
}
```

---

## 9. 安全和合规边界

必须写死的原则：

1. 只操作用户已登录且授权的账号
2. 不绕过验证码
3. 不绕过风控
4. 不批量重复轰炸
5. 每个平台有每日发布上限
6. 每次浏览器任务必须有 trace
7. 高风险评论必须人工确认
8. 自动发布必须显式 `mode=publish` 或 `mode=schedule`
9. 默认模式为 `draft`

建议三种模式：

```text
Draft Mode:
只填草稿，停在确认页

Assist Mode:
填草稿，用户确认后发布

Autopilot Mode:
在预设规则内自动发布/预约/低风险回复
```

---

## 10. 实施优先级

### Phase 1: Research Agent

目标：产品每天能自己找内容。

任务：

- 新增 `source_items`
- 新增 `/api/research/collect`
- 接 Firecrawl 或 Crawl4AI
- 生成 research brief
- 生成 topic candidates

验收：

```text
输入账号方向
每天产出 10 个候选选题
每个选题有来源证据和平台建议
```

---

### Phase 2: HTML Asset Renderer

目标：稳定生成可上传素材。

任务：

- 新增 HTML card deck template
- 用 Playwright 导出 PNG
- 支持小红书 6-8 张卡片
- 支持 Instagram carousel
- 支持微博长图

验收：

```text
content_pack -> PNG deck
图片尺寸适合平台
文字不溢出
风格一致
```

---

### Phase 3: Codex Browser Publishing

目标：Codex 可以真实操作本机浏览器发布。

任务：

- 强化 `/api/agent/runbook`
- 新增平台专属 runbook
- 先做小红书
- 再做 X / 微博 / 知乎
- trace 和截图回传

验收：

```text
用户登录小红书
Agent 打开创作页
上传 PNG deck
填标题/正文/标签
停在确认页或预约
```

当前部署电脑有 Codex app，因此 Phase 3 不需要等待第三方浏览器自动化服务。  
优先直接做：

```text
Agent Studio 生成 Codex runbook
→ 用户在 Codex app 中执行该 runbook
→ Codex app 操作浏览器
→ 结果回传
```

第一版可以只支持：

```text
小红书 draft / schedule
```

第二版再支持：

```text
微博 draft / schedule
X publish / schedule
知乎回答草稿
B站专栏草稿
```

---

### Phase 4: Comment Maintenance

目标：发完后自动维护内容。

任务：

- 读取评论
- 评论分类
- 回复草稿
- 低风险自动回复
- 高风险暂停确认
- 选题信号写回 topic_candidates

验收：

```text
打开帖子评论页
提取评论
生成回复建议
产生下一轮选题
```

---

### Phase 5: Analytics Loop

目标：数据反哺内容策略。

任务：

- 打开创作者后台
- 读取 4h/24h/72h 数据
- 保存 metrics
- 生成 learning
- 写入 brand_learnings

验收：

```text
知道哪类标题/卡片/平台表现更好
下一轮生成会使用历史学习
```

---

## 11. Agent 执行时必须遵守

执行升级的 Agent 必须：

1. 先读当前代码，不要重写整个项目
2. 保留现有 API 风格和目录结构
3. 不删除用户已有修改
4. 每个阶段补测试
5. 每个浏览器执行任务必须有安全边界
6. 不把 API key 写进前端
7. 不提交 `.env`
8. 运行：

```bash
npm test
npm run build
npm audit --audit-level=moderate
```

9. 如果改了产品能力，同步更新：

```text
README.md
docs/ARCHITECTURE.md
docs/COMMERCIALIZATION.md
server/db/schema.sql
server/policies/default-policy.md
```

---

## 12. 推荐最终架构

```text
Agent Studio Web
  - 查看内容包
  - 查看素材
  - 查看任务状态
  - 人工确认

BFF API
  - generate
  - research
  - assets
  - runbook
  - comments
  - analytics

Research Layer
  - Firecrawl / Crawl4AI
  - GPT Researcher style synthesis
  - source_items
  - research_briefs

Content Layer
  - LLM structured generation
  - platform adapters
  - brand voice profile

Asset Layer
  - HTML/CSS templates
  - PNG export
  - video export

Codex App Local Browser Executor
  - collect
  - verify
  - publish
  - comment
  - analytics
  - runs on the deployment Mac
  - uses the user's logged-in browser session
  - returns screenshots and traces

Memory Layer
  - posts
  - comments
  - metrics
  - brand_learnings
```

---

## 13. 一句话给执行 Agent

不要把这个产品做成普通“AI 写文案工具”。  
要做成：

```text
一个会自己看平台、找素材、做内容、用本机浏览器发布、维护评论、读取数据并自我学习的 Agent-first 社媒运营系统。
```

---

## 14. 给 Codex app 执行器的特别说明

后续执行 Agent 如果运行在这台部署电脑上，应默认具备以下能力：

```text
1. 可以打开 localhost 上的 Agent Studio。
2. 可以调用 Agent Studio BFF API。
3. 可以打开社交平台网页端。
4. 可以利用用户已登录账号。
5. 可以上传本地生成的 PNG / MP4 / SVG 等素材。
6. 可以截图页面状态。
7. 可以把结果、错误、截图路径回写给 Agent Studio。
```

因此升级时不要只设计“云端 API 自动发布”。  
优先设计：

```text
本机 Codex app 自动化执行
```

推荐新增接口：

```text
POST /api/codex/runbook
POST /api/codex/task-result
POST /api/codex/screenshot
GET  /api/codex/pending-tasks
```

推荐新增本地任务状态：

```ts
codex_task = {
  id,
  type: "research" | "publish" | "comment" | "analytics",
  platform,
  mode,
  status: "pending" | "running" | "waiting_for_user" | "completed" | "failed",
  runbook_json,
  result_json,
  screenshots,
  trace,
  created_at,
  updated_at
}
```

Codex app 执行规范：

```text
1. 执行前读取 runbook。
2. 每个关键页面截图。
3. 遇到登录、验证码、风控，停止并反馈。
4. mode=draft 时停在最终确认页。
5. mode=publish/schedule 时必须确认 runbook 显式授权。
6. 发布完成后返回 post_url 或截图证据。
7. 失败时返回失败步骤和页面截图。
```
