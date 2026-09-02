# UI Proof

## Verification scope

- Release level: 五轮 UI/UX 改造的发布门禁，覆盖内部控制台、品牌门户、代理商门户和免登录订阅超市。
- Routes / screens: `/`、`/brands`、`/agents`、`/orders`、`/settlement`、`/merchants`、`/risk`、`/complaints`、`/settings`、`/market`、`/portal/brand`、`/portal/agent`、`/portal/agent/payouts`。
- Viewports / devices: 1440×900、1024×900、768×900、390×844。
- Browsers / simulators: Playwright Chromium（Desktop Chrome engine）。

## Evidence

- Screenshots / visual diffs: 基线 `/tmp/cps-ui-audit/baseline-dashboard.png`、`/tmp/cps-ui-audit/baseline-settlement.png`；最终工作台 `/tmp/cps-ui-audit/final-dashboard-{1440,1024,768,390}.png`；品牌门户 `/tmp/cps-ui-audit/final-brand-{1440,1024,768,390}.png`；代理门户 `/tmp/cps-ui-audit/final-agent-{1440,390}.png`。
- Storybook stories and tests: 未使用 Storybook；前端 Vitest 45/45（6 文件），后端 Vitest 244/244（15 文件，含 `platform-key.spec.ts` 8 项私钥归一化/启动闸反向验证）。2026-09-02 于本地磁盘克隆实测（iCloud 同步目录下 node_modules 读取被节流，不可用于计时/门禁）。
- End-to-end interactions: Playwright 17/17（Chromium，19.7s），覆盖 admin、finance、risk、ops、audit、brand、agent；包含导航单组展开、权限收窄、核心/完整切换、退款联动、订单分页、移动菜单、门户任务跳转和超市组合算价。两处竞态已消除：reduced-motion 用例先等首屏 heading 再对 `main.page-in` 取样（此前取到已卸载节点得 `""`）；移动菜单用例预置 `cps-coach-done-console`，避免首登 550ms 后的引导遮罩（z-200）拦截抽屉点击。
- Accessibility checks: 交互控件使用语义化 button/link/dialog/heading；移动菜单具有可访问名；权限与隐藏状态使用真实浏览器断言。
- Console / network checks: 连续访问工作台、品牌、订单、结算、号池，无 console error、pageerror 或 5xx。
- Performance checks: 未新增组件库或动画运行时；生产构建通过；入场仅使用 opacity/transform，错落总延迟压缩到 90ms。Leo UI 仓库检测对主应用 `src/` 已无告警，仅剩独立子服务 `services/agent-studio` 的历史样式。运行页检测仅剩一条“高度 transition”误报；Playwright 逐元素检查确认非 0 秒的 `all/height` transition 数量为 0。
- Reduced-motion check: Chromium `reducedMotion: reduce` 下 `.page-in` 和 `.pulse-dot` 计算样式均为 `animation-name: none`。注：此前 `.page-in` 并不在 `src/index.css` 的 `animation: none` 覆盖列表里（只被全局 0.001ms 时长兜底），该断言本不成立；本轮已把 `.page-in` 显式纳入覆盖列表，反向验证（去掉该行）用例即红。
- CI status: 本轮之前 `main` 连续 5 次 CI 红（docker-smoke 缺 `METRICS_TOKEN`、e2e reduced-motion 断言、`npm audit` high 漏洞），本文件此前记录的"全绿"与 GitHub Actions 实际状态不一致。本轮修复后以 GitHub Actions 结果为准。

## Originality gate

| Axis | Score (0-2) | Rendered evidence |
|---|---:|---|
| Product specificity | 2 | 首屏围绕 CPS 独有的投诉、号池、代理风险、对账差异和逆向冲账待办组织。 |
| Hierarchy | 2 | 待办 → 工作入口 → 经营脉搏 → 完整分析；门户为下一步 → 趋势。 |
| Composition | 2 | 桌面使用主任务+窄上下文双栏，中等宽度改为单列，手机保持同一阅读顺序。 |
| Material and assets | 1 | 门户保留现有品牌图像，但降为低对比质感；主要材料是真实业务状态与数据。 |
| Typography and color | 2 | 品牌红仅用于主操作/紧急信号，经营数字保留等宽特征，卡片标记降为细竖线。 |
| Interaction and motion | 2 | 导航单组展开、核心/完整显式切换、任务直达；移除卡片上浮、压低进场距离与弹性过冲。 |
| Feasibility | 2 | 复用现有 React/Tailwind/primitives/store/RBAC，不改资金规则和路由契约，前后端测试全通过。 |
| **Total** | **13/14** | 达到 11/14，无零分，产品特异性与层级均为 2。 |

- Category-interchangeable regions still visible: 明细表格和通用设置页仍保持成熟中后台形式，它们承载高密度信息，未强行个性化。
- Direction correction required, if any: 无。截图审查中发现的 768px 门户标题挤压已把横排断点从 `sm` 调整到 `lg`。

## Pairwise review

- Baseline compared: 密集 KPI 首页、全部模块同时展开的侧栏、门户大横幅+四卡+图表首屏。
- Independent reviewers: 本轮开发约束不允许启动子代理；采用基线/最终截图、可达性任务断言和原创性量表交叉检查，未伪造外部评审。
- Upgraded-direction preference rate: 未进行用户偏好实验；发布判断依据为任务可达性、多视口视觉和全套自动化结果。
- Product feature / emotional impact / memorability evidence: 首读对象从指标墙改为“李运营，今天先做什么？”和按紧急程度排列的真实待办；门户使用“下一步”作为共同记忆点。

## Snapshot decisions

- Intentional baseline changes: 去除主内容区工程网格；首页默认改为值班台；导航改为任务分类且单组展开；五个高频业务页默认收起解释性大卡和高级分析；门户先给待办。
- Rejected changes: 未删除任何业务能力或路由；未引入新组件库/动画库；未将产品改成过度留白的消费级卡片页。

## Remaining risk

- Known issues: 无主应用发布阻断项。完成检测器因同仓库的独立 `services/agent-studio` 旧字体/网格/边框样式返回非零，该子服务未被本次 CPS 平台 UI 改造引用或修改。
- Deferred work: 真实生产数据下的长文案/极端大表格仍需在上线前使用生产快照做一次内容压力测试。
- Visual verification outstanding: 无；1440/1024/768/390 已在 Chromium 截图审查。
