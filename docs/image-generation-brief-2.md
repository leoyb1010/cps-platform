# 产品配图生成清单 · 第二批（补充，不动已有）

> 第一批 12 张已接入（AIGC 缩略图 / 超市·落地页 Hero / 空态插画）。
> 本批是**深入扫描后仍缺图、加图能明显提质**的位置——全部为纯图标 / 色块 / 纯文字的地方，
> 接线时**只新增、不改动已有结构**。
> 用法同上：每张一个小节，Prompt 段可整段复制粘贴给生图模型。

---

## ⚠️ 生成前必读（沿用第一批约束）

1. **不写任何真实品牌名**（有道/喜马拉雅/WPS/芒果/知乎/Keep/B站都是真第三方，撞版权）。全部是品类抽象氛围图。
2. **所有 prompt 末尾带 `no text, no logo`** —— 保留。
3. **同组风格统一**——同一次会话连续生成。

**产品主色**：品牌红 `#f5333b`（coral red）· 墨黑灰 ink-grey · 暖白底
**命名规则**：`public/img/分类-用途-描述.webp`，全小写连字符
**已有 12 张不要重复生成**（aigc-thumb-* / hero-market-* / hero-landing-bundle / empty-* / illust-growth）

---

# D 组 · 落地页支付成功氛围图（1 张，优先）

用途：C 端落地页 `LandingPage.tsx` 支付成功态 + 「我的订阅」查询成功页，现在只有一个绿色对勾图标，缺庆祝感。
要求：正方形、轻盈庆祝、珊瑚红+暖色、无文字无品牌。

---

### D1 · 文件名 `illust-success.webp` · 尺寸 800×800

Prompt:

A minimal celebratory illustration for a successful subscription purchase, a glowing coral-red (#f5333b) checkmark badge with soft confetti and sparkles floating around, warm and joyful but clean, generous white space, premium flat editorial style, no text, no logo, high quality

---

# E 组 · 门户经营首页顶部 banner（2 张）

用途：品牌门户「我的经营」+ 代理门户「我的投放」首页，现在都是纯文字 PageHeader，顶部加一条**细长横幅氛围条**能立刻有"控制台"的品质感。
要求：**超宽横幅**（顶部装饰条，内容集中在右侧，左侧极简留给标题文字），珊瑚红品牌调，无文字无品牌。

---

### E1 · 文件名 `banner-brand-home.webp` · 尺寸 2400×600（超宽横幅）

Prompt:

A wide slim decorative header banner for a brand merchant business dashboard, warm coral-red (#f5333b) and soft white gradient, abstract floating data cards, growth arrows and subscription icons concentrated on the right third, left two-thirds kept clean and empty, premium fintech SaaS aesthetic, soft 3D render, no text, no logo, high quality

---

### E2 · 文件名 `banner-agent-home.webp` · 尺寸 2400×600（超宽横幅）

Prompt:

A wide slim decorative header banner for an affiliate/agent marketing dashboard, warm coral-red and orange gradient, abstract megaphone, coins and rising performance charts concentrated on the right third, left two-thirds kept clean and empty, premium SaaS aesthetic, soft 3D render, no text, no logo, high quality

---

# F 组 · 空状态补全（2 张，与第一批 empty-* 同风格）

用途：产品里还有几类空态目前只用 lucide 图标——错误页 `ErrorBoundary` 和"暂无通知/暂无联动事件"。补两张与第一批**完全同款细线条风格**的插画。
要求：**统一细线条插画**（跟 empty-no-data.webp / empty-all-clear.webp 一模一样的画风），白底，友好。

---

### F1 · 文件名 `empty-error.webp` · 尺寸 600×600

Prompt:

Minimal thin line illustration of a friendly disconnected plug or a small caution triangle with a gentle coral-red accent, calm and reassuring not alarming, clean thin line art style matching a minimal line-art icon set, white background, no text, no logo

---

### F2 · 文件名 `empty-bell.webp` · 尺寸 600×600

Prompt:

Minimal thin line illustration of a quiet notification bell with a few soft sleep marks or dots, peaceful "all caught up" mood, clean thin line art style matching a minimal line-art icon set, small coral-red accent, white background, no text, no logo

---

# G 组 · 高清 favicon / 应用图标（1 张，可选）

用途：现在 favicon 是一个纯 SVG 红底"有"字方块，够用但简陋。如果想要更精致的浏览器标签图标可生成。
要求：正方形应用图标，圆角，珊瑚红，一个抽象订阅/联运象征符号（非文字）。
⚠️ 这张若生成，接线时我会**同时保留旧 favicon.svg 作回退**，不破坏现有。

---

### G1 · 文件名 `app-icon.webp` · 尺寸 512×512

Prompt:

A modern app icon on a coral-red (#f5333b) rounded square background, a single clean white abstract symbol representing subscription bundling and connection (interlocking rings or a stylized parcel), centered, flat minimal, crisp, no text, no letters, no logo

---

# 优先级建议

- **只做 D1**：支付成功氛围图。这是 C 端转化终点，一张庆祝图对"完成感"提升最直接，性价比最高。
- **D + E**：再加两条门户首页 banner，品牌/代理门户首页立刻从"纯文字"变"有品质的工作台"。
- **全做**：F 组补齐空态一致性、G 组换精致 favicon。

---

# 生成后我来接线（只增不改）

- **D1 成功图** → 落地页支付成功卡 + 我的订阅查询成功页，替换/叠加在绿色对勾旁（保留对勾语义）。
- **E 组 banner** → 品牌/代理门户首页 PageHeader 上方加一条 banner 条（新增元素，PageHeader 本身不动）。
- **F 组空态** → 错误页 / 通知空态换图（ErrorBoundary 和 bell 空态，现有 EmptyState 组件已支持传图，直接加档）。
- **G1 图标** → `<link rel="icon">` 增加 webp 版本，保留 svg 回退。

---

<sub>基于当前代码逐页扫描 · 全部为品类抽象氛围图不含真实品牌 · 主色对齐 #f5333b · 已有 12 张不重复</sub>
