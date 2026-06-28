# Agent Studio for iPad / iPhone：素材工厂实施方案

> 版本：v1.0（2026-06-11）
> 性质：实施方案。前置文档是 `agent-studio-ios-material-factory-assessment.md`（GPT5.5 评估稿），本文档对它做出判定，并给出从零到上线的完整步骤。
> 阅读顺序：先看 §1 需求拆解和 §2 十问十答，确认方向一致；再看 §4–§7 架构与设计；最后按 §8 排期执行。

---

## 0. 一句话方案

**做一个 Universal 原生 App（SwiftUI，iPad 优先），把现有 Agent Studio 已验证的「recipe 约束 + 质量 linter + 可配置 LLM + 确定性兜底」四件资产移植成设备端管线，实现：导入真实素材 → AI 生成内容结构 → 原生卡片编辑（Pencil）→ 脱敏 → 导出即可发布的成品。全程不依赖任何自有服务器。**

---

## 1. 需求拆解：五条硬性要求 → 落地机制 → 验收标准

用户原始要求只有五条，每一条都必须能在验收时被验证，而不是停留在口号。

| # | 原始要求 | 落地机制 | 验收标准（可测） |
|---|---|---|---|
| R1 | iPhone + iPad，主要是 iPad | 一套代码 Universal App；iPad 是主创作台（编辑、批注、出图），iPhone 是采集器 + 审核器（自适应缩减布局，不单独设计界面） | 同一项目在两端打开均可完成完整闭环；iPad 上编辑器支持分屏 + 拖拽 + Pencil |
| R2 | 完全独立在设备上运行 | 无自有后端、无登录、无遥测；渲染、存储、脱敏、导出全部在设备上完成；联网只有一种行为——调用**用户自己配置的** LLM endpoint | 飞行模式下仍能完成「导入 → 结构生成（规则兜底）→ 编辑 → 导出」全流程 |
| R3 | 可以配置 LLM 进去 | LLMKit：多 Provider 抽象（OpenAI 兼容 / Anthropic / Gemini / 设备端 Apple 模型），自定义 baseURL + model + key，Keychain 存储，按任务路由模型档位，详见 §5 | 设置页粘贴任意 OpenAI 兼容 endpoint + key，点「测试连接」通过后即可全功能生成；换 endpoint 不需要改代码 |
| R4 | 素材生产能力要强（满分） | 八个能力维度逐项做满，详见 §6 满分清单：输入广度 / 理解深度 / 结构化 / 视觉质量 / 可编辑性 / 脱敏 / 导出广度 / 离线可用 | §6 每个维度有自己的验收项；总验收 = §9 评测体系全绿 |
| R5 | 出来的东西要可以用 | 质量门（QualityLinter）是导出的**强制关卡**，不是建议：字号、安全区、对比度、占位文案、敏感信息、文字遮挡主体，全部检查通过才允许导出 | 导出的 PNG 组图不经任何二次处理，直接上传小红书发布；§9 真机验收清单逐项通过 |

**对"满分"的诚实定义**：满分不是功能数量，而是"每次导出都达到可发布质量"的稳定性。一个只能出 6 套风格、但每套都过质量门的 App，好于 30 套风格、一半要返工的 App。本方案所有取舍都按这个原则做。

---

## 2. 对 GPT5.5 评估稿的判定（十问十答）

评估稿 §12 留了 10 个评审问题，这里直接给出判定，作为本方案的决策依据。

| # | 问题 | 判定 | 理由 |
|---|---|---|---|
| 1 | 只做素材制造、不做自动发布，定位是否成立？ | **成立** | 与 R2「完全独立」天然一致：自动发布必然依赖浏览器执行器和登录态，iOS 上做不干净。发布动作交给系统 Share Sheet，由用户在平台 App 内完成 |
| 2 | 差异化是否放在 Pencil、素材导入、脱敏、卡片编辑？ | **部分修正** | 这四项是体验差异化，但最大的差异化是**质量门体系**——recipe 约束 + linter 是现有仓库已验证、竞品（Canva/各类 AI 海报工具）没有的资产。Pencil 等是"好用"，质量门是"可用" |
| 3 | MVP 是否只做小红书图文 PNG 组图？ | **是** | 视频只保留"分镜图"（静态 PNG），MP4 放 Phase 2。理由见评估稿 11.2，认同 |
| 4 | Universal 还是先 iPad？ | **一套代码 Universal，但 v1 只打磨 iPad 布局** | SwiftUI 下 iPhone 自适应布局的边际成本很低；但 v1 不为 iPhone 做专属交互设计，它只承担采集 + 审核 + 轻量出图 |
| 5 | 原生卡片渲染模型如何设计？ | **CardDoc 分层文档 + StyleTokens + LayoutTemplate，单一原生渲染管线** | 详见 §4.2/§4.3。关键决策：编辑预览和导出走同一条渲染代码，不存在"预览像、导出不像"的漂移 |
| 6 | template registry 是否适合迁移为 iOS recipe？ | **约束字段直接复用，HTML 模板不搬** | `registry/recipes.json` 的 canvas / typography / safeMargin / qualityProfile 字段原样进 iOS RecipeStore；HTML/CSS 重写为原生 LayoutTemplate，只保留"风格语法"（见 §6.4 迁移表） |
| 7 | 本地规则 / 本地模型 / 云模型三层如何分工？ | **规则=排版+校验+兜底；本地模型=摘要/标题/标签/OCR 后处理；云模型=内容规划/成套文案/多模态理解** | 详见 §5.5。现有 `creativeModel.js` 的"无 key 走确定性 fallback"模式原样保留 |
| 8 | 隐私脱敏能否成为核心卖点？ | **能，且升级为导出强制门** | 脱敏不只是卖点，是 R5「可以用」的必要条件——带 IP/token 的截图发出去就是事故 |
| 9 | 与 Canva / CapCut / Freeform 差异是否够强？ | **组合稀缺** | 单点（做图、AI 文案、批注）都不稀缺；「真实素材驱动 + 多卡内容结构 + 强制质量门 + 自带 LLM 配置 + 全离线」的组合没有现成竞品 |
| 10 | 6 周 MVP 砍什么？ | 砍：视频 MP4、系列内容、选题研究采集、小红书以外平台、>6 套风格、iPhone 专属界面、iCloud 同步、Shortcuts | 保住一条最深的闭环，见 §8 Phase 1 |

**对评估稿的两点补充（评估稿没说透、但对本需求关键的）**：

1. **LLM 可配置不是附属功能，是 P0 架构件。** 评估稿把 AI 层放在技术路线一节带过；但用户明确要求 BYO-LLM（自带模型），这决定了：Provider 抽象、Keychain、结构化输出校验、修复重试、兜底链都必须在 MVP 第 3 周前就位，而不是后补。
2. **质量体系必须最先移植，而不是最后。** 评估稿把"脱敏和检查"排在 Week 5。本方案把 QualityLinter 提前到 Week 2（与渲染管线同周落地），因为它定义了渲染管线的合格标准——先有验收尺子，再写渲染代码。

---

## 3. 产品定义

### 3.1 定位

**Agent Studio 素材工厂（Material Factory）**：随身的、完全离线可用的、AI 驱动的内容素材生产台。输入是截图、照片、录屏、文字、手写、扫描件；输出是直接可发布的图文组图、封面、长图、分镜图和文案包。

### 3.2 四个核心模块（沿用评估稿，边界微调）

```text
┌─────────────────────────────────────────────────────────────┐
│  ① 素材收集箱 Inbox          ② AI 内容规划器 Planner          │
│  导入/扫描/粘贴/分享扩展      主题+素材 → 标题/卡片结构/正文/标签 │
│  自动 OCR/分类/摘要/敏感标记   （走用户配置的 LLM，有兜底）       │
│                                                             │
│  ③ 卡片编辑器 Canvas          ④ 导出交付 Export               │
│  分层画布+模板切换+Pencil批注  质量门 → PNG组图/长图/PDF/文案包  │
│  统一风格+安全区提示          相册/Files/AirDrop/Share Sheet   │
└─────────────────────────────────────────────────────────────┘
```

模块边界规则：素材只进 Inbox；结构只由 Planner 产出；像素只由 Canvas 的渲染管线产出；任何东西离开 App 必须过 Export 的质量门。四个模块之间只通过 CardDoc / ProjectPack 数据模型通信（§4.2）。

### 3.3 iPad 与 iPhone 分工

| 设备 | 角色 | v1 体验 |
|---|---|---|
| iPad | 主创作台 | 三栏布局（项目/素材 → 卡片浏览 → 检查器）；Pencil 批注；分屏拖入素材；全部编辑能力 |
| iPhone | 采集器 + 审核器 | 拍照/扫描/粘贴入库；查看 AI 草稿；改标题改文案级别的轻编辑；一键导出 |

### 3.4 明确不做（v1–v2 红线，沿用评估稿 §2）

不做自动发布、不控制浏览器、不复用 Mac 登录态、不跑本地 Node 服务、不做 WebView 套壳界面、不把现有网页搬进 iPad、不做多人协作、不做模板商店。

---

## 4. 总体架构

### 4.1 架构图

```text
┌──────────────────────────── iOS / iPadOS App（无自有后端） ────────────────────────────┐
│                                                                                      │
│  SwiftUI 界面层（iPad 三栏 / iPhone 栈式）                                              │
│      │                                                                               │
│  ┌───┴────────┬──────────────┬───────────────┬──────────────┐                        │
│  │ IngestKit  │  PlanKit     │  RenderKit    │  ExportKit   │   ← 功能包（SPM）        │
│  │ 素材导入    │  AI 规划      │  渲染+编辑     │  质量门+导出  │                        │
│  │ OCR/分类   │  结构化输出    │  CardDoc引擎  │  PNG/PDF/ZIP │                        │
│  └───┬────────┴──────┬───────┴──────┬────────┴──────┬───────┘                        │
│      │               │              │               │                                │
│  ┌───┴───────────────┴──────────────┴───────────────┴───────┐                        │
│  │ CoreKit：CardDoc 模型 · RecipeStore · StyleTokens          │                        │
│  │ QualityLinter · RedactKit（脱敏）· 确定性兜底生成器          │                        │
│  └───────────────────────────┬───────────────────────────────┘                       │
│                              │                                                       │
│  ┌───────────────────────────┴───────────────┐   ┌─────────────────────────┐         │
│  │ LLMKit：Provider 抽象 + 任务路由 + Keychain │   │ 存储：SwiftData 索引       │         │
│  │  OpenAI兼容 / Anthropic / Gemini / 设备端   │   │ + .asmproj 文档包（Files） │         │
│  └───────────────┬───────────────────────────┘   └─────────────────────────┘         │
└──────────────────┼───────────────────────────────────────────────────────────────────┘
                   │ HTTPS（唯一的对外网络行为，目标由用户配置）
                   ▼
        用户自己的 LLM endpoint（DeepSeek / OpenAI / Claude / 中转站 / 局域网 Ollama…）
```

### 4.2 单一文档模型：ProjectPack 与 CardDoc

整个 App 只有一个事实源。它是现有仓库 `registry/recipes.json` + 内容包结构的原生化版本，字段刻意与 Mac 端对齐，未来两端可以互导。

```jsonc
// ProjectPack（一个项目 = 一个 .asmproj 文档包）
{
  "schemaVersion": 1,
  "title": "MPS vs NVIDIA 实测",
  "platform": "xhs",                    // xhs | wechat | zhihu | bilibili …
  "recipeId": "xhs-product-real-scene", // 引用 RecipeStore，约束字段见下
  "assets": [                           // 素材收集箱内容
    {
      "id": "a1", "type": "screenshot", "file": "assets/a1.png",
      "ocrText": "…", "summary": "终端跑分截图", "tags": ["跑分","终端"],
      "sensitiveHits": [ { "kind": "ip", "rect": [120, 80, 240, 24], "masked": true } ]
    }
  ],
  "copy": {                             // 文案包（Planner 产出，可编辑）
    "titleCandidates": ["…", "…"],
    "body": "…", "hashtags": ["#…"], "commentHook": "…"
  },
  "cards": [ /* CardDoc[]，见下 */ ],
  "exports": [ { "kind": "xhs-carousel-png", "at": "…", "lintReport": "…" } ]
}
```

```jsonc
// CardDoc（一张卡 = 分层文档，画布坐标系固定 1080×1440，导出时按比例缩放到目标尺寸）
{
  "id": "c1",
  "role": "cover",                       // cover | point | steps | contrast | cta …
  "layout": "hero-screenshot",           // 引用 LayoutTemplate
  "canvas": { "w": 1080, "h": 1440, "safeMargin": 72 },
  "layers": [
    { "type": "background", "style": "paper" },
    { "type": "image",  "assetId": "a1", "frame": [72, 320, 936, 760],
      "crop": [0, 0.1, 1, 0.8], "cornerRadius": 24, "isSubject": true },
    { "type": "text",   "roleToken": "headline", "frame": [72, 96, 936, 180],
      "text": "我把 MPS 和 NVIDIA 都跑了一遍", "maxLines": 2 },
    { "type": "text",   "roleToken": "body", "frame": [72, 1120, 936, 200],
      "text": "同一模型、同一参数，差距在这三处", "maxLines": 3 },
    { "type": "mask",   "reason": "ip", "frame": [192, 400, 240, 24] },   // 脱敏遮罩层
    { "type": "pencil", "data": "pencil/c1.drawing" }                     // PKDrawing
  ]
}
```

```jsonc
// Recipe（直接沿用 registry/recipes.json 字段，新增 layoutPool）
{
  "id": "xhs-product-real-scene",
  "label": "小红书 · 产品实景",
  "canvas": { "w": 1080, "h": 1440, "safeMargin": 72 },
  "typography": { "minBodyPx": 30, "titleMaxChars": 14 },
  "qualityProfile": "huashu-strict",
  "styleTokens": "rawGridManual",          // 引用 designGrammar 移植来的 token 集
  "layoutPool": ["hero-screenshot", "split-evidence", "step-strip", "cta-card"],
  "cardCount": { "min": 4, "default": 6, "max": 9 }
}
```

三个不变量（写进代码断言）：

1. 任何像素输出（编辑预览、缩略图、导出 PNG）都由同一个 `CardRenderer.render(card:recipe:scale:)` 产出。
2. 文字层永远不允许与 `isSubject: true` 的图片层主体区域重叠（评估稿 §4.3 的用户红线："不要成图遮挡实际截图内容"）。
3. `mask` 层在渲染时强制位于 image 之上、text/pencil 之下，导出时不可被关闭（只能调整范围）。

### 4.3 渲染管线：原生单管线（关键决策）

**决策：编辑与导出共用一条原生渲染管线（SwiftUI/CoreGraphics），不在 App 内使用 WKWebView 渲染 HTML 模板。**

理由：

- 双引擎（编辑用原生、导出用 WebView 截图）必然产生"预览≠成品"的漂移，直接违反 R5。
- HTML recipe 的价值在"风格语法"（网格、字阶、留白、信息密度规则），不在 CSS 代码本身。语法可以用 StyleTokens + LayoutTemplate 表达（§6.4）。
- WKWebView 渲染无法支持 Pencil 批注层、拖拽改版、安全区实时提示等编辑能力。

实现：

| 环节 | 技术 |
|---|---|
| 画布编辑视图 | SwiftUI Canvas + 手势（拖拽/缩放/旋转），图层即 CardDoc.layers |
| 文本排版 | SwiftUI `Text` 不够精确处用 CoreText（字距、行高、两端对齐、CJK 标点悬挂） |
| 导出位图 | `ImageRenderer`（SwiftUI 视图 → UIImage，指定 scale 保证 1080×1440 实际像素）；复杂卡退化到 `UIGraphicsImageRenderer` 手绘图层树 |
| Pencil 层 | PencilKit `PKCanvasView` 叠加在卡片视图上，`PKDrawing` 序列化进文档包 |
| 字体 | 内置 2–3 套可商用 CJK 字体（思源黑体/宋体子集），保证离线渲染一致 |

**HTML 风格库的对照用法（开发期工具，不进 App）**：移植某套风格时，用现有 Mac 端管线对同一主题出图作为 golden 图，与 iOS 原生渲染结果并排对比验收（§9.1）。这样既复用已验证的视觉资产，又不把 WebView 带进产品。

### 4.4 质量门：QualityLinter（R5 的兑现机制）

直接移植 `server/src/visualLinter.js` 的规则，再加上只有原生端能做的检查：

| 规则 | 来源 | 级别 |
|---|---|---|
| 正文字号 ≥ recipe.minBodyPx（默认 30px@1080） | 移植 visualLinter `small_text` | error |
| 占位文案检测（lorem/待补充/TODO/示例文案…） | 移植 `placeholder_copy` | error |
| 空内容卡检测 | 移植 `empty_center` | error |
| 标题超长（> titleMaxChars） | 移植 recipes.json 约束 | error |
| 安全区违例（内容进入 safeMargin） | 新增 | error |
| 文字/贴纸遮挡主体图（与 isSubject 图层的主体区域求交，主体区域用 Vision 显著性检测 + 用户可修正） | 新增（用户红线） | error |
| 文字对比度 < 4.5:1（WCAG AA） | 新增 | error |
| 素材原始分辨率不足导出尺寸（拉伸糊图） | 新增 | warn |
| 敏感信息命中且未遮罩（IP/端口/域名/邮箱/手机号/key/二维码…） | RedactKit（§6.6） | **block**（必须处理才能导出） |
| CJK 字体未声明 / 回退到非内置字体 | 移植 `font_stack_weak` | warn |

交互：linter 结果以"检查器面板 + 卡片角标"实时显示（编辑时就看到，不是导出时才报错）；error 可逐项点击跳转修复；block 级不可跳过；error 级允许用户显式 override（记录在导出元数据里）。

### 4.5 存储与文件

- **SwiftData**：项目索引、素材标签索引、LLM endpoint 配置（key 除外）、使用统计。
- **`.asmproj` 文档包**（UIDocument package）：manifest.json（ProjectPack）+ assets/ + pencil/ + exports/。好处：Files App 可见、AirDrop 可整包传输、天然支持"导出项目 ZIP"、未来 Mac 端可直接读。
- **Keychain**：所有 API key。绝不进 SwiftData / 文档包 / iCloud 备份（kSecAttrAccessibleWhenUnlockedThisDeviceOnly）。
- **iCloud**（Phase 2）：文档包放 iCloud Drive 即获得同步，不需要自建同步协议。

---

## 5. LLM 可配置层：LLMKit（R3 的兑现机制）

这是用户点名的能力，按 P0 架构件设计。现有 `server/src/creativeModel.js` 已经验证了正确模式（OpenAI 兼容 + 自定义 baseURL + 模型降级 + 超时 + JSON 提取 + 确定性兜底），LLMKit 是它的 Swift 化与多 Provider 扩展。

### 5.1 Provider 抽象

```swift
protocol LLMProvider: Sendable {
    var descriptor: ProviderDescriptor { get }   // 能力声明：vision? jsonMode? streaming?
    func complete(_ request: LLMRequest) async throws -> LLMResponse
    func stream(_ request: LLMRequest) -> AsyncThrowingStream<LLMChunk, Error>
    func validate() async throws -> ProviderHealth   // 设置页「测试连接」
}

struct LLMEndpointConfig: Codable, Identifiable {   // 用户在设置页创建，可建多个
    var id: UUID
    var name: String              // "DeepSeek 官方" / "公司中转" / "家里 Ollama"
    var kind: ProviderKind        // .openAICompatible / .anthropic / .gemini / .appleOnDevice
    var baseURL: URL?             // openAICompatible 必填，例 https://api.deepseek.com
    var modelID: String           // 例 deepseek-v4-flash / claude-sonnet-4-6
    var fallbackModelID: String?  // 同 endpoint 内降级（沿用 creativeModel 模式）
    var apiKeyRef: KeychainRef    // key 本体只在 Keychain
    var timeoutSeconds: Double = 30
}
```

内置四个实现：

| Provider | 覆盖范围 | 说明 |
|---|---|---|
| `OpenAICompatibleProvider` | OpenAI、DeepSeek、Kimi、Qwen、各类中转站、局域网 Ollama/vLLM/LM Studio | 占国内可用 endpoint 的 90%+，`/v1/chat/completions` 协议，支持自签发地址 |
| `AnthropicProvider` | Claude 系列 | `/v1/messages` 协议，原生 vision |
| `GeminiProvider` | Gemini 系列 | generateContent 协议 |
| `AppleOnDeviceProvider` | Apple Foundation Models（iOS 26+，Apple Intelligence 设备） | 免费、离线、零延迟；用 `@Generable` 引导结构化输出；只承担轻任务 |

### 5.2 任务路由：按任务选模型档位，而不是全 App 一个模型

设置页里用户给三个档位各指派一个 endpoint（可以是同一个）：

| 档位 | 承担任务 | 默认特性要求 |
|---|---|---|
| **强档**（heavy） | 内容规划（成套 6–9 卡结构 + 正文 + 标签）、多图理解、风格化重写 | 需 JSON 输出；vision 可选但推荐 |
| **轻档**（light） | 标题候选、标签、单卡重写、摘要润色 | 低延迟优先；可指到便宜模型或设备端模型 |
| **设备档**（onDevice） | OCR 后处理、素材分类打标、离线摘要 | 无网可用；不可用时回退规则引擎 |

路由表是数据不是代码：每个 AI 任务声明 `requiredTier` 和 `degradesTo`，用户改设置即改行为。

### 5.3 结构化输出合约：每个 AI 任务 = prompt + JSON Schema + 校验器 + 兜底

沿用 `creativeModel.js` 的 normalizeCard 思想并制度化。每个任务定义四件套：

1. **Prompt 模板**：系统提示词内嵌平台规范（小红书标题 ≤ recipe.titleMaxChars、每卡一个论点、禁模板腔——直接移植现有 contentEngine 的提示词资产）。
2. **JSON Schema**：如 PlanResult = { titleCandidates[5], cards[{role, layout, kicker≤10字, title≤15字, body≤82字, bullets≤3}], body, hashtags }。
3. **校验 + 修复**：解析失败 → 提取最大 JSON 块重试一次 → 字段级 normalize（截断超长、补默认 layout）→ 仍不合格则降级。
4. **确定性兜底**：无 key / 无网 / 连续失败时，规则引擎用素材 OCR 文本 + 主题词填充 LayoutTemplate，保证永远有结构可编辑（现有仓库"local deterministic fallback"模式）。

这条链保证：**LLM 质量影响内容的好坏，但永远不影响 App 的可用性。**

### 5.4 多模态：截图理解

强档模型支持 vision 时，Planner 把（压缩 + **先脱敏**后的）素材图随请求发送，产出"每张素材适合哪张卡、裁切建议、配文"；不支持 vision 时退化为 OCR 文本 + 用户摘要驱动。**任何图片出网前必须先过 RedactKit 遮罩**——这是硬规则，防止把带 token 的截图发给第三方 API。

### 5.5 三层兜底链（R2「完全独立」的保证）

```text
用户配置的云模型(强/轻档) ──失败/无网──▶ 设备端模型(26+ 设备) ──不可用──▶ 规则引擎(永远可用)
```

每层产出同一个 JSON Schema，上层失败对用户只表现为"生成质量降级 + 一条提示"，不表现为功能不可用。

### 5.6 成本与延迟控制

- 生成以"结构"为单位而不是"全文重来"：单卡重生成、只换标题、只换风格，都是小请求。
- 请求级缓存（同素材同参数 24h 内直接回放）。
- 设置页显示每 endpoint 的调用次数 / 估算 token 用量（本地统计，不上传）。
- 默认温度低（0.4–0.7），结构稳定优先。

### 5.7 安全

- Key 只进 Keychain（ThisDeviceOnly），UI 永远显示掩码，不出现在日志 / 导出包 / 截图录屏（标记为敏感视图 `privacySensitive()`）。
- 设置页明示三类数据去向：什么留在设备（一切）、什么发给用户自己的 endpoint（脱敏后的素材与文本）、什么发给开发者（无）。这也是 App Store 审核的隐私说明底稿。

---

## 6. 素材能力满分清单（R4 的兑现机制）

八个维度，每个维度列"v1 必做 / v2 加强 / 验收"。

### 6.1 输入广度

| | 内容 |
|---|---|
| v1 | PhotosPicker（照片/截图/视频帧）、Files 导入、剪贴板（图/文/URL 文本）、相机拍摄、VisionKit 文档扫描、iPad 分屏拖拽进入收集箱 |
| v2 | Share Extension（任何 App 分享进项目）、录屏视频自动抽帧（AVAssetImageGenerator，按场景切换检测抽 6–12 帧）、语音备忘转文字（Speech framework）、App Intents（"把最近 6 张截图做成小红书图文"） |
| 验收 | 从「素材在相册/网页/纸面上」到「进入项目收集箱」≤ 3 次交互 |

### 6.2 理解深度（素材进箱自动处理，全部设备端）

| | 内容 |
|---|---|
| v1 | Vision OCR（中英混排）、素材类型识别（截图/照片/文档/图表）、规则+轻档摘要、自动标签、敏感信息扫描并标记（§6.6）、可用性评估（分辨率是否够做封面） |
| v2 | 显著性/主体检测（供"文字不压主体"用的主体区域，v1 先用规则+手动框选，v2 上 Vision 显著性）、相似素材去重、按 OCR 内容全文搜索素材库 |
| 验收 | 导入 10 张截图后，无需手动整理即可直接开始生成；每张素材有摘要和标签 |

### 6.3 结构化能力（Planner）

| | 内容 |
|---|---|
| v1 | 输入：主题 + 选中素材 + 平台 + 语气；输出：5 个标题候选、6–9 张卡结构（每卡 role/layout/标题/正文/要点/指派素材）、正文、标签、评论引导。每个输出都落在 §5.3 的 schema 合约里 |
| v2 | 参考案例仿写（贴一篇爆款链接文本，提取结构语法）、系列内容承接（移植 seriesEngine 思想）、分镜模式（视频脚本 → 分镜卡） |
| 验收 | 同一输入生成 3 次，结构均合法可编辑；卡片与素材的指派合理率 ≥ 80%（人评） |

### 6.4 视觉质量：风格库移植（核心资产搬迁）

现有 13 套风格按"是否适合截图驱动的小红书图文"排序，分两批移植。移植的是**风格语法**（StyleTokens + LayoutTemplate + 质量约束），不是 HTML：

| 现有风格（Mac 端） | 移植批次 | 对应 StyleTokens 来源 |
|---|---|---|
| `xhs-product-real-scene` 产品实景 | **v1** | rawGridManual（designGrammar.js） |
| `xhs-dense-infographic` 高密度信息图 | **v1** | rawGridManual + htmlAnythingSwiss 网格语法 |
| `xhs-process-storyboard` 流程分镜 | **v1** | huashuMotion 节奏语法（静态化） |
| `swiss-modern` | **v1** | swissModern |
| `xhs-pastel-carousel` 柔和轮播 | **v1** | xhsPastelCarousel |
| `editorial-magazine` 杂志长文 | **v1** | magazinePoster |
| guizang-swiss / guizang-magazine | v2 | 注意上游 AGPL，只吸收语法、不复制代码与素材 |
| admin-tabler / sneat / star、startbootstrap、html5up、nyt-data-frame、kinetic-pitch | v2 按需 | 后台/landing 类风格对小红书图文优先级低 |

每套风格的移植验收 = §9.1 的 golden 对照：同主题同素材，iOS 出图与 Mac 端出图并排，版式语法一致、质量门全绿。

### 6.5 可编辑性（Canvas 编辑器）

| | 内容 |
|---|---|
| v1 | 多卡横向浏览 + 单卡精修；图层选择/移动/缩放；图片替换与裁切（含主体区域调整）；文本编辑（实时字数与超长提示）；模板切换（同一内容换 layout 不丢数据）；一键统一风格（换 recipe 全组重排）；安全区与出血线常显；Pencil 批注层（圈、箭头、手写）；遮罩编辑 |
| v2 | 贴纸/形状库、参考线吸附、多选对齐分布、历史版本（文档包快照） |
| 验收 | 把 AI 草稿改到"满意可发"平均 ≤ 5 分钟；任何编辑操作后 linter 状态实时更新 |

### 6.6 隐私脱敏（RedactKit）

检测面（移植评估稿 §7.4 清单 + 现有 sanitize 正则资产）：IP、端口、域名、邮箱、手机号、地址、账号名、token/key 形态字符串、订单号、设备名、公司名、二维码（VNDetectBarcodesRequest）。

流程（评估稿四步，落实为强制门）：

1. 素材入箱即扫描（OCR 文本 + 矩形定位），命中处显示红色角标；
2. 用户逐项确认遮罩样式（毛玻璃/色块/马赛克），遮罩成为 mask 层；
3. mask 不允许遮挡主体区域之外随意扩张提示（防止把内容全盖了）；
4. 出网（发给 LLM）前与导出前各强制检查一次，未处理的 block 级命中阻断操作。

验收：内置 20 张含敏感信息的测试截图，检出率 ≥ 95%，零误放行（宁可误报）。

### 6.7 导出广度（ExportKit）

| 目标 | v1 | v2 |
|---|---|---|
| 小红书 PNG 组图（3:4，1080×1440） | ✅ | |
| 封面单图、正文文本 + 标签一键复制 | ✅ | |
| 长图（卡片纵向拼接）、PDF | ✅ | |
| 项目包 ZIP（图 + 文案 + manifest） | ✅ | |
| 1:1 / 9:16 / 16:9 批量重排导出（重排版而非裁切） | | ✅ |
| 分镜图打包、轻量 MP4（图片序列 + 转场，AVFoundation） | | ✅ |

交付通道 v1 全做：保存相册（PHPhotoLibrary，整组一次授权）、保存 Files、AirDrop、Share Sheet（直接分享给小红书/微信 App）。

### 6.8 离线可用

| 场景 | 表现 |
|---|---|
| 无网 + 未配置任何 key | 规则引擎生成结构（基于 OCR 文本与模板），全部编辑/脱敏/导出能力可用 |
| 无网 + 26+ 设备 | 设备端模型承担摘要/标题/标签，体验接近在线轻档 |
| 有网 | 全功能 |

验收：飞行模式完成一个完整项目并导出，全程无报错、无功能灰掉（仅生成质量提示降级）。

---

## 7. 技术选型与工程结构

### 7.1 选型表

| 层 | 选型 | 说明 |
|---|---|---|
| 语言/UI | Swift 6 + SwiftUI | 严格并发；编辑器局部用 UIKit 桥接（PKCanvasView、复杂手势） |
| 最低系统 | **iOS / iPadOS 18.0** | 覆盖近三年设备；Foundation Models 等 26+ 能力用 `if #available` 渐进启用。若决定先只给自己用，可直接定 26 简化代码（见 §11 待决 D1） |
| 数据 | SwiftData（索引） + UIDocument 文档包（内容） | §4.5 |
| 渲染 | SwiftUI Canvas / ImageRenderer / CoreText / UIGraphicsImageRenderer | §4.3 |
| 视觉智能 | Vision（OCR/二维码/显著性）、VisionKit（扫描） | 全设备端 |
| 手写 | PencilKit | 批注层 |
| 设备端 LLM | FoundationModels（26+，`@Generable` 结构化输出） | 轻任务 |
| 网络 | URLSession + 自写 SSE 解析 | 不引第三方网络库，减少供应链面 |
| 测试 | Swift Testing + XCUITest + 快照测试（导出 PNG 与 golden 图做感知哈希对比） | §9 |
| 依赖原则 | 第三方库 ≈ 0 | 全部能力系统框架覆盖；唯一可能的例外是 ZIP（可用 Apple Archive 框架替代） |

### 7.2 工程结构（SPM 多包，单仓库）

```text
AgentStudioMobile/
  App/                      # App target + 场景装配
  Packages/
    CoreKit/                # ProjectPack/CardDoc 模型、RecipeStore、StyleTokens、
                            # QualityLinter、RedactKit、确定性兜底生成器  ← 纯 Swift，无 UI，全单测
    LLMKit/                 # Provider 抽象与四实现、任务路由、schema 校验、Keychain
    IngestKit/              # 导入、OCR、分类、摘要调度
    RenderKit/              # CardRenderer、LayoutTemplate、编辑器画布视图
    ExportKit/              # 质量门装配、PNG/PDF/ZIP、相册/Files/Share
  Resources/
    recipes/                # recipes.json（与 Mac 端 registry 同构）
    fonts/                  # 内置 CJK 字体
    golden/                 # 评测基准图（开发期）
```

CoreKit 不依赖 UIKit/SwiftUI——模型、linter、兜底生成器都可以在 macOS 上跑单测，CI 不需要模拟器即可覆盖核心逻辑。

### 7.3 从现有仓库的迁移映射表

| 现有资产（Mac 仓库） | 去向（iOS） | 迁移方式 |
|---|---|---|
| `registry/recipes.json` 的 canvas/typography/qualityProfile/平台字段 | `Resources/recipes/` + CoreKit RecipeStore | **原样复用**（删 deviceFrame 等 Web 专属字段） |
| `src/lib/designGrammar.js` 的 palette/typography/grammar | CoreKit StyleTokens | 数据翻译（JS 对象 → JSON 资源） |
| `server/src/visualLinter.js` 规则 | CoreKit QualityLinter | 规则移植 + 原生增强（§4.4） |
| `server/src/creativeModel.js` 的 provider/降级/JSON 提取/normalize 模式 | LLMKit | 模式移植（Swift 重写） |
| `src/lib/contentEngine.js` 的提示词、平台规范、卡片角色 | LLMKit 任务定义 + PlanKit | 提示词资产直接搬，结构改为 schema 合约 |
| `src/lib/contentEngine.js` 的敏感词/隐私过滤逻辑 | CoreKit RedactKit | 正则资产搬运 + Vision 增强 |
| 13 套 HTML 风格 | RenderKit LayoutTemplate（分批） | 语法重写，golden 图对照验收（§6.4/§9.1） |
| Playwright 渲染、Hono API、autopilot、engagement、研究采集 | **不迁移** | 属于 Mac 端发布/运营职责，与 iOS 素材工厂解耦 |

---

## 8. 实施步骤

### Phase 0：准备（3–5 天）

| 任务 | 产出 / 验收 |
|---|---|
| 用现有 Mac 端管线生成 golden set：3 主题 × v1 六风格 × 各 6 卡 | `Resources/golden/` 基准图齐全，这是 iOS 渲染的验收尺子 |
| 定稿 ProjectPack / CardDoc / Recipe JSON Schema（§4.2） | schema 文件 + 10 个手写样例通过校验 |
| 提示词资产盘点：从 contentEngine.js 抽出可复用提示词与平台规范 | `PlanKit` 任务定义初稿 |
| 建 Xcode 工程 + SPM 包骨架 + CI（macOS 跑 CoreKit 测试） | 空 App 可在 iPad 真机运行；CI 绿 |

### Phase 1：MVP（6 周）——唯一闭环：导入 → 规划 → 编辑 → 脱敏 → 导出小红书 PNG 组图

每周末有可在真机演示的增量。

**Week 1 骨架与数据**
- CoreKit：ProjectPack/CardDoc 模型 + 文档包读写（.asmproj）+ SwiftData 索引
- 项目列表、新建项目、素材导入（PhotosPicker / Files / 剪贴板 / 拖拽）
- IngestKit：入箱即 Vision OCR + 基础分类
- ✅ 验收：导入 10 张截图，重启 App 数据完好，OCR 文本可见

**Week 2 渲染管线 + 质量门（先立尺子）**
- StyleTokens 资源化（六套 token 进包）；LayoutTemplate 首批 4 个（hero-screenshot / split-evidence / step-strip / cta-card）
- CardRenderer：CardDoc → 视图 → 1080×1440 PNG；编辑预览与导出同源
- QualityLinter v1：字号/安全区/占位/超长/空卡/对比度
- 快照测试：手写样例 CardDoc 渲染输出 vs golden 图对照
- ✅ 验收：硬编码一个 6 卡 ProjectPack，导出 PNG 组图与 Mac 端 golden 版式语法一致，linter 全绿

**Week 3 LLMKit（可配置 LLM 上线）**
- Provider 协议 + OpenAICompatible + Anthropic 两个实现（Gemini/设备端 v1 末尾视余量）
- 设置中心：多 endpoint 管理、Keychain、测试连接、三档位指派
- PlanResult schema 合约 + 校验修复 + 规则兜底生成器
- Planner 流程：主题 + 选素材 → 6 卡结构 + 正文 + 标签，流式显示
- ✅ 验收：配置 DeepSeek 与任一中转站均生成成功；拔掉 key 后兜底结构照常可编辑

**Week 4 编辑器**
- 多卡横向浏览、单卡编辑：文本、图片替换/裁切、图层变换、模板切换、一键统一风格
- 安全区常显；linter 实时角标；单卡增量重生成
- ✅ 验收：把 AI 草稿改成"可发"状态 ≤ 5 分钟（自测 3 个主题）

**Week 5 脱敏 + Pencil**
- RedactKit：正则 + NSDataDetector + 二维码检测，入箱标记 → 遮罩确认流 → 出网/导出双检查
- PencilKit 批注层（圈/箭头/手写），随文档保存
- "文字不压主体"检查接入 linter（v1 用手动主体框 + 规则）
- ✅ 验收：20 张敏感测试图零误放行；Pencil 批注导出清晰

**Week 6 导出与打磨**
- ExportKit：PNG 组图 → 相册（一次授权整组写入）/ Files / AirDrop / Share Sheet；正文 + 标签复制；长图、PDF、项目 ZIP
- iPhone 自适应布局过一遍（采集 + 审核可用即可）
- 性能（10 项目 × 30 素材流畅）、内存（导出 9 卡峰值受控）、崩溃清零
- TestFlight 内测包
- ✅ **MVP DoD**：①飞行模式走通全闭环；②配任一 OpenAI 兼容 endpoint 后生成质量达 golden 水平；③导出 PNG 直接发小红书无返工;④linter/脱敏门全部生效

### Phase 2：素材能力加强（4–6 周，MVP 验证后启动）

录屏抽帧 → 分镜卡；Share Extension；App Intents（Shortcuts 四个动作）;批量平台尺寸重排导出（1:1/9:16/16:9）；设备端 Foundation Models 接入；风格库扩到 10+（含 AGPL 语法吸收合规处理）；iCloud Drive 同步；轻量 MP4；参考案例仿写。

### Phase 3：资产化（按需）

素材库全文检索与复用、品牌规范（自有色板/字体/水印）、历史高表现样式复用、Mac 端互导（.asmproj 双端打开）、上架 App Store（隐私清单 + BYOK 审核话术）。

---

## 9. 质量评测体系（"满分"与"可用"的验证方法）

### 9.1 Golden 对照评测（开发期主尺子）

- 基准：Phase 0 用 Mac 端管线产出的 golden 图。
- 方法：同主题同素材在 iOS 生成 → 并排人工对照（版式语法、信息密度、留白）+ 自动检查（linter 全绿、尺寸/字号达标）。
- 通过线：每套风格 3 主题 × 6 卡，主观"可直接替换 Mac 端产出"且自动检查零 error。

### 9.2 自动化

- CoreKit 单测：模型、linter 每条规则、兜底生成器、schema 校验（macOS 上跑，CI 必过）。
- 快照测试：固定 CardDoc 输入 → 渲染 PNG → 与基准做感知哈希比对，防渲染回归。
- LLMKit 合约测试：录制的真实 API 响应（含畸形 JSON）回放，验证修复链。

### 9.3 真机发布前清单（每个版本执行）

1. 飞行模式全闭环 ✅
2. 三个不同 endpoint（官方/中转/局域网）连通与生成 ✅
3. 导出组图上传小红书：清晰度、安全区、首图吸引力人工确认 ✅
4. 敏感测试集零误放行 ✅
5. iPad 分屏 + 拖拽 + Pencil 全链路 ✅
6. iPhone 采集 → iPad 继续编辑（AirDrop 项目包）✅

---

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| 原生重写 13 套风格工作量失控 | v1 只做 6 套，每套先 4 个 layout；golden 对照逐套验收，不齐不上 |
| 复杂信息图的原生排版达不到 HTML 灵活度 | LayoutTemplate 允许嵌套网格 + 自动收缩字阶；确实做不到的密度，宁可降密度也不破字号下限（质量门优先） |
| LLM endpoint 在部分网络环境不可达 | 多 endpoint 配置 + 失败自动切换 + 三层兜底；连通性测试给出明确诊断（DNS/超时/401/余额） |
| 大图与 9 卡导出内存峰值 | 逐卡渲染流水线、autoreleasepool、素材分级缩放缓存；Week 6 专项压测 |
| App Store 对 BYOK / 用户自配 endpoint 的审核 | 先 TestFlight/自签分发自用；上架时隐私清单写明"开发者零收集"，BYOK 类应用已有大量过审先例，准备审核备注 |
| AGPL 上游（guizang）风格的合规 | 只吸收风格语法（网格/字阶/节奏），不复制代码与素材；v2 处理并留书面说明 |
| 设备端模型可用性碎片化（仅 26+ 且 Apple Intelligence 机型） | 设备档永远只是增强层，规则引擎才是兜底；能力检测 + 优雅隐藏 |
| "文字不压主体"的主体识别不准 | v1 主体框默认全图 60% 中心区 + 用户一次拖拽修正（修正即记住）；v2 上 Vision 显著性自动化 |

---

## 11. 待决问题（不阻塞开工，Phase 1 内定即可）

| # | 问题 | 默认选择（不另行决定就按此执行） |
|---|---|---|
| D1 | 最低系统版本 18 还是 26 | **18**（自用期间若全部设备已是 26，可改 26 简化条件编译） |
| D2 | v1 是否包含 Gemini Provider | 不含（OpenAI 兼容 + Anthropic 已覆盖绝大多数），v1 末尾视余量 |
| D3 | 内置字体选哪两套 | 思源黑体 SC（界面+正文）+ 思源宋体 SC（杂志风格），均 OFL 可商用 |
| D4 | App 显示名 | 「Agent Studio 素材工厂」，target 名 AgentStudioMobile |
| D5 | 兜底规则引擎的卡片文案风格 | 沿用 contentEngine 确定性 fallback 的口吻资产，禁模板腔词表同步移植 |

---

## 12. 立即可做的第一步

1. **今天**：在现有仓库跑 `pnpm run local:start`，用 `POST /api/smoke/graphic` + Visual Studio 给 3 个真实主题出图，存入 golden set（Phase 0 第一项，零新代码）。
2. **本周**：定稿 §4.2 三个 JSON Schema（建议直接在本仓库 `docs/schemas/` 下用 JSON Schema 草案 + 样例文件管理，Mac/iOS 两端共用）。
3. **下周**：建 Xcode 工程，进入 Week 1。

---

## 附：与评估稿的差异一览（速查）

| 主题 | 评估稿 | 本方案 |
|---|---|---|
| 文档性质 | 可行性评估 + 评审问题 | 实施方案 + 判定 + 排期 |
| LLM 层 | 技术路线一节带过 | 升级为 P0 架构件（LLMKit，§5），Week 3 上线 |
| 质量检查 | Week 5 才出现 | Week 2 与渲染同周落地，作为渲染验收尺子 |
| 渲染 | "不建议复刻 HTML"方向性建议 | 明确决策：原生单管线 + golden 对照移植法（§4.3） |
| 脱敏 | 关键卖点 | 升级为出网/导出双强制门（block 级） |
| 兜底 | "不要强依赖本地大模型" | 制度化为三层兜底链 + schema 合约（§5.3/5.5） |
| 排期 | 6 周功能排期 | Phase 0–3 + 每周验收 + MVP DoD + 评测体系（§9） |
