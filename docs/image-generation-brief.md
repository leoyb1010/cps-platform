# 产品配图生成清单（image2 文生图）

> 用法：每个图片是一个独立小节，`Prompt` 段落可整段复制粘贴到 image2。
> 生成后统一放进 `public/img/`，文件名按小节标题里的名字保存。
> 出图若只有 PNG，丢给我批量转 WebP（体积省 60%+）。

---

## ⚠️ 生成前必读（三条硬约束）

1. **不要在 prompt 里写任何真实品牌名**（网易有道 / 喜马拉雅 / WPS / 芒果TV / 知乎 / Keep / B站 等都是真实第三方品牌，撞版权）。清单里的图全部是「品类抽象氛围图」，不含任何真实品牌标识。
2. **所有 prompt 末尾都带 `no text, no logo`** —— 务必保留。AI 生成的假文字 / 假 logo 会毁掉质感。
3. **A 组 6 张要风格统一** —— 最好在同一次 image2 会话里连续生成，让配色和线条风格一致。

**产品主色（写进 prompt 保持一致）**
- 品牌红：`#f5333b`（coral red）
- 墨黑灰：ink-grey（深色文字/暗色系）
- 底色：暖白 / 极浅灰

**命名规则**：`public/img/分类-用途-描述.webp`，全小写、连字符分隔。
标 `尺寸` 的数字已是建议导出像素（含 2 倍高清）。

---

# A 组 · AIGC 素材缩略图（最优先，6 张）

用途：AIGC 素材实验台每行左侧缩略图 + 详情弹层大图。
要求：**正方形**、抽象营销视觉、无文字无品牌、6 张风格统一。

---

### A1 · 文件名 `aigc-thumb-study.webp` · 尺寸 800×800

Prompt:

A clean modern marketing thumbnail for an online learning subscription, warm coral-red accent (#f5333b), abstract books and light rays, soft gradient background, minimal, no text, no logo, flat editorial illustration style, consistent color system, high quality

---

### A2 · 文件名 `aigc-thumb-audio.webp` · 尺寸 800×800

Prompt:

A vibrant marketing thumbnail for an audio and podcast subscription, warm orange gradient, abstract sound waves and headphones silhouette, cozy commuting mood, minimal, no text, no logo, flat editorial illustration style, consistent color system, high quality

---

### A3 · 文件名 `aigc-thumb-video.webp` · 尺寸 800×800

Prompt:

A dynamic marketing thumbnail for a video streaming subscription, deep orange tones, abstract play button and film frames, cinematic mood, minimal, no text, no logo, flat editorial illustration style, consistent color system, high quality

---

### A4 · 文件名 `aigc-thumb-office.webp` · 尺寸 800×800

Prompt:

A crisp marketing thumbnail for a productivity and office software subscription, red-orange accent, abstract documents and cloud, professional and clean, minimal, no text, no logo, flat editorial illustration style, consistent color system, high quality

---

### A5 · 文件名 `aigc-thumb-fitness.webp` · 尺寸 800×800

Prompt:

An energetic marketing thumbnail for a fitness subscription, dark violet gradient, abstract running figure and heartbeat line, motivational mood, minimal, no text, no logo, flat editorial illustration style, consistent color system, high quality

---

### A6 · 文件名 `aigc-thumb-reading.webp` · 尺寸 800×800

Prompt:

A calm marketing thumbnail for a reading and knowledge subscription, soft blue accent, abstract open book and floating ideas, thoughtful mood, minimal, no text, no logo, flat editorial illustration style, consistent color system, high quality

---

# B 组 · C 端落地页 / 超市主视觉（3 张）

用途：`/land/:id` 落地页顶部 + `/market` 订阅超市 Hero 背景。
要求：横图留左侧文字空间（重要元素别居中）；竖图留顶部标题空间。

---

### B1 · 文件名 `hero-market-main.webp` · 尺寸 2400×1200（横）

Prompt:

Wide hero banner background for a multi-brand subscription supermarket, coral-red (#f5333b) and soft white palette, abstract floating subscription cards and gift boxes on the right side, left side kept clean and empty for text overlay, premium e-commerce mood, soft 3D render, no text, no logo, high quality

---

### B2 · 文件名 `hero-landing-bundle.webp` · 尺寸 1500×2000（竖，移动端）

Prompt:

Vertical mobile landing page hero for a combined subscription bundle offer, warm coral-red gradient, abstract stacked membership cards with a subtle discount sparkle, clean empty top area for a headline, premium mobile commerce mood, soft 3D render, no text, no logo, high quality

---

### B3 · 文件名 `hero-market-texture.webp` · 尺寸 2400×1200（横，纹理底）

Prompt:

Subtle abstract background texture for a subscription marketplace, very light warm grey with faint coral engineering grid lines, minimal premium fintech aesthetic, almost white, seamless, no text, no logo

---

# C 组 · 空状态 / 品类氛围插画（3 张，锦上添花）

用途：空列表、引导卡的插画。
要求：**统一细线条插画风格**，白底或透明底，友好不悲伤。

---

### C1 · 文件名 `empty-no-data.webp` · 尺寸 600×600

Prompt:

Minimal thin line illustration of an empty open box, small coral-red accent, lots of white space, friendly and calm not sad, clean line art style, white background, no text, no logo

---

### C2 · 文件名 `empty-all-clear.webp` · 尺寸 600×600

Prompt:

Minimal thin line illustration of a completed checklist with a coral-red checkmark, clean and reassuring, line art style, white background, no text, no logo

---

### C3 · 文件名 `illust-growth.webp` · 尺寸 1200×800

Prompt:

Minimal editorial line illustration of upward growth, an abstract rising line chart merging with a small plant sprout, coral-red and ink-grey, thin lines, generous white space, premium SaaS brand style, white background, no text, no logo

---

# 生成后怎么接线（我来做）

图片放进 `public/img/` 后告诉我，我负责把它们接进代码：

- **A 组缩略图** → 按素材品类（学习/影音/视频/效率/健身/阅读）映射到 AIGC 实验台每行左侧 + 点开详情的大图位。
- **B 组 Hero** → 落地页 / 超市顶部作背景，叠一层渐变遮罩保证白色标题文字可读。
- **C 组空态图** → 替换现有 `EmptyState` 组件里的 lucide 图标，空列表更有温度。

---

# 优先级建议（不想全做的话）

- **只做 A 组**：性价比最高。"素材实验台"却看不到素材，是产品当前最明显的视觉空洞，补上立刻可信。
- **A + B**：C 端转化面（落地页/超市）也是最该有真实图的地方，加 B 组 3 张质感再上一个台阶。
- **全做**：C 组让空状态和引导页不再是冷冰冰的图标。

---

<sub>清单基于当前代码实际渲染位置生成 · 所有图均为品类抽象氛围图，不含真实品牌标识 · 主色对齐设计令牌 #f5333b</sub>
