# UI Brief

## Outcome

- User-visible outcome: 保留现有 CPS、品牌、代理、订单、结算、风控、合约、素材与系统能力，但默认界面从“专业仪表盘”变成一眼能开始工作的任务型产品。
- Success signal: 新用户进入首页后能在首屏识别待办、三条核心工作流和下一步动作；侧栏不再同时暴露全部模块；高频任务无需理解内部术语即可抵达。

## Users and situation

- Primary users: 平台运营、财务、风控客服、审计，以及品牌方和代理商客户。
- Job to be done: 在压力下快速判断“今天先做什么”，进入对应工作台完成运营、结算或风险处置，并随时回看经营结果。
- Environment and devices: 以 1280–1600px 桌面办公为主，同时覆盖 768px 窄桌面/平板与 320–430px 移动端应急处理。
- Visitor mode (`Persuade` / `Operate` / `Read` / `Experience`): Operate

## Product truth

- Unique mechanism: 把投放、订阅、投诉、号池、退款、逆向冲账和结算串成可追踪的跨模块闭环。
- User's real scene: 用户每天打开系统处理异常、推进业务和核对资金；时间紧、角色权限不同，不会先学习平台完整领域模型。
- Primary change created: 从“按系统模块找功能”变为“按工作目标进入流程”，减少寻找入口、理解分类和跨页跳转的成本。
- Real proof, content, data, and assets: 真实角色权限、待办选择器、风险信号、结算差异、工单 SLA、订单与品牌/代理/号池数据。
- Category rut and predictable opposite: 行业默认是密集 KPI 卡片 + 多级专业导航；其可预测反面是过度空白的消费级卡片。两者都不采用，改为任务队列优先、数据作为上下文。

## Feature contract

- Most expensive, slow, or confusing user action: 在十多个模块中判断异常属于哪里、先处理哪一件，以及处理后是否联动到结算/风控/审计。
- Persistent context and states: 当前角色、待办数量、紧急程度、三条核心工作流状态、演示/真实环境、权限范围。
- Product-specific feature opportunity: “今日值班台”把跨模块待办与增长、资金、风险三条工作流压缩到同一首屏，并直接显示下一步。
- Shortcut, gesture, batch, preview, undo, or recovery opportunity: 保留全局搜索与常用置顶；导航使用单组展开；结算继续使用可续跑 Checklist；危险操作维持确认与联动反馈。
- Success / progress / failure / uncertainty feedback: 待办清空态、风险/差异数字、完成提示、服务端拒绝回收真值、加载与空态。
- Feature candidates that differ in behavior, not only appearance: 方案 A 为“角色值班台 + 三工作流入口”（选择）；方案 B 为“流程时间线首页”；方案 C 为“可定制模块桌面”。A 对现有权限和数据兼容最好，学习成本最低。

## Scope

- In scope: 内部控制台与客户门户的信息架构、首页、导航、页面密度、常用操作、视觉层级、动效、响应式和浏览器验收。
- Out of scope: 改写资金规则、后端权限模型、删除业务能力、生产数据迁移。

## Facts and constraints

- Product facts: React 19 + Vite + Tailwind CSS v4；HashRouter；角色权限过滤；演示与真实接口双模式。
- Technical constraints: 保持现有路由兼容与 RBAC；优先复用 primitives、tokens 和 store；不引入新的大型组件库或动画运行时。
- Accessibility / localization constraints: 简体中文；WCAG 2.1 AA；键盘可达；支持 reduced-motion；财务金额保持等宽数字。

## References

- Product references:
- Visual references:
- What to inherit from each reference:
- What must not be copied:

## Assumptions and open decisions

- Assumptions: 商业化首要指标是任务完成效率和上手速度，而不是首屏展示能力总量。
- Open decisions: 后续根据真实浏览器第五轮验收决定是否继续合并品牌/商品、合约/置换等二级页面入口。
