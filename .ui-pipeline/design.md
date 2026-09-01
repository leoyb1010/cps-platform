# Design Direction

## Direction decision

- Options considered and structural differences: A“值班台”以待办和工作流为首读；B“流程时间线”以业务生命周期为主轴；C“可定制桌面”由用户摆放模块。
- Chosen option and evidence: 选择 A。现有 store 已提供角色待办、风险、结算和运营数据，可直接形成下一步动作；无需用户先配置，也不改变业务规则。
- Existing visual authority to preserve: 有道品牌红、克制的边框与卡片、等宽金额、权限过滤、现有表格/抽屉/确认组件。

## Originality contract

- Visitor mode: Operate
- Product truth: 平台价值来自跨模块闭环，不来自模块数量或专业术语。
- Concept spine: 把复杂的订阅增长平台收成一张“今天的值班台”，每个信号都指向可执行的下一步。
- First viewport / primary task region: 左侧约 2/3 为今日待办，右侧约 1/3 为角色主动作与三条工作流状态；下方才是经营脉搏与完整数据入口。
- First-read object and primary action: “今天要处理的事”及最紧急事项；主按钮随角色进入结算、风控或运营工作台。
- Spatial thesis: 固定窄侧栏 + 单组展开；内容区用明确的主次双栏，减少等权卡片网格；桌面紧凑、移动端顺序堆叠。
- Material and asset strategy: 以真实待办、状态、金额和业务对象为主要材料；插图只用于空态，不承担导航。
- Product-specific signature: 首页三条“工作流脉搏”同时展示增长、资金、风险的当前状态和下一步，体现本产品的跨模块闭环。
- Motion grammar: 只对路由切换、抽屉、状态反馈做短距离淡入/位移；不自动重播数字和大面积错落进场。
- Expression intensity (`Quiet` / `Expressive` / `Cinematic`): Quiet
- Explicit anti-defaults: 不用工程网格制造专业感；不把全部 KPI 放在首屏；不按内部业务模型堆导航；不靠大圆角和渐变稀释密度。

## Asset Director

- Primary material carrying the product truth:
- Real screenshots / photography / generated imagery:
- Illustration / data graphics / 3D objects:
- Crop, resolution, lighting, and consistency contract:
- Asset loading and fallback strategy:

## System

- Typography: 标题 20px/600；区块标题 14px/600；正文 13px；金额与编号保留等宽字体，但避免整页数字化。
- Color and surfaces: 品牌红只用于主动作和紧急信号；大部分导航与卡片使用中性表面，语义色只说明状态。
- Grid and spacing: 8px 基准；首屏 2:1 双栏；卡片间距 12–16px；移除背景工程网格。
- Shape and borders: 6–10px 圆角，低阴影、清晰分隔；减少卡片套卡片。
- Iconography and imagery: Lucide 线性图标；同一层级统一 16–18px；空态沿用现有插图。
- Density: 默认“核心信息”，完整模式保留全部分析和明细；表格继续支持舒适/紧凑。

## Composition

- Reading or task path: 待办 → 角色主动作 → 工作流状态 → 经营提醒/数据 → 完整明细。
- Major regions and their jobs: 侧栏负责稳定定位；顶栏只保留页面定位、搜索、帮助和通知；首页负责开始工作；二级页负责完成任务。
- Scale and density rhythm: 首屏一个大任务区、一个窄上下文区；其后使用紧凑条目和少量统计，不再连续均匀卡片墙。
- Responsive structural changes: 1024px 以下双栏变单栏；768px 以下侧栏变抽屉；移动端主动作全宽、表格横向滚动或转换摘要。

## Components and tokens

- Existing component source:
- Components to reuse:
- New components justified:
- Token changes:

## Motion budget

- Primary motion engine: CSS transitions/animations（沿用现有 tokens）。
- Functional transitions: 页面 160–180ms 淡入上移；导航折叠 160ms；弹窗/抽屉 220–320ms；按钮反馈 120ms。
- Dominant effect, if any: 无装饰性主效果；状态变化为唯一注意力来源。
- Reduced-motion behavior: 全部入场和位移动画立即落值，功能不依赖动画。
- Target-device frame, main-thread, GPU, bundle, and memory budget: 不新增动画依赖；仅 transform/opacity；避免同时动画超过 3 个主要元素。

## State matrix

| Surface | Loading | Empty | Error | Success | Disabled | Long content | Responsive |
|---|---|---|---|---|---|---|---|
| | | | | | | | |
