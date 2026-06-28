export const directionLibrary = [
  { id: "insight", label: "深度洞察", desc: "提出非共识观点，给行业内人士看", accent: "#7C5CFF" },
  { id: "howto", label: "可执行方法", desc: "拆解步骤，可被收藏复用", accent: "#22C55E" },
  { id: "story", label: "真实故事", desc: "用第一人称叙事打动情绪", accent: "#F59E0B" },
  { id: "debate", label: "争议立场", desc: "锋利观点引发讨论与转发", accent: "#EF4444" },
  { id: "trend", label: "热点借势", desc: "结合近期话题，做快内容", accent: "#06B6D4" },
  { id: "tool", label: "工具拆解", desc: "评测、教程、对比型内容", accent: "#EC4899" }
];

export const toneProfiles = {
  balanced: { label: "克制专业", desc: "客观、有判断，不煽动" },
  sharp: { label: "锋利直接", desc: "观点鲜明，适合 X / 微博" },
  human: { label: "真人口语", desc: "去模板，像朋友说话" },
  playful: { label: "轻松有梗", desc: "短视频脚本、抖音/小红书友好" },
  expert: { label: "高阶专业", desc: "面向同行与付费用户" }
};

export const platformMeta = {
  xhs: {
    name: "小红书",
    handle: "RED",
    format: "图文笔记 · 7P",
    color: "#FF2741",
    openUrl: "https://www.xiaohongshu.com/explore",
    job: "标题钩子 + 收藏率，封面是入口",
    char: 1000,
    automation: "browser-first"
  },
  douyin: {
    name: "抖音",
    handle: "DOUYIN",
    format: "短视频 · 30–60s",
    color: "#25F4EE",
    openUrl: "https://creator.douyin.com/",
    job: "3 秒留人，反差或冲突开场",
    char: 250,
    automation: "browser-first"
  },
  x: {
    name: "X",
    handle: "X",
    format: "Thread · 6–10 条",
    color: "#E7E9EA",
    openUrl: "https://x.com/compose/post",
    job: "强观点先行，结构化展开",
    char: 280,
    automation: "api-or-browser"
  },
  weibo: {
    name: "微博",
    handle: "WEIBO",
    format: "短帖 + 长图",
    color: "#FF8200",
    openUrl: "https://weibo.com/",
    job: "热点 + 情绪 + 互动话题",
    char: 2000,
    automation: "browser-first"
  },
  zhihu: {
    name: "知乎",
    handle: "ZHIHU",
    format: "回答 / 想法",
    color: "#0084FF",
    openUrl: "https://www.zhihu.com/",
    job: "结构化论证，反例 + 数据",
    char: 5000,
    automation: "browser-first"
  },
  bilibili: {
    name: "B站",
    handle: "B",
    format: "中视频 · 5–10min",
    color: "#FB7299",
    openUrl: "https://member.bilibili.com/platform/upload-manager/article",
    job: "故事化叙事 + 弹幕互动点",
    char: 3000,
    automation: "browser-first"
  },
  instagram: {
    name: "Instagram",
    handle: "IG",
    format: "Carousel / Reel",
    color: "#E1306C",
    openUrl: "https://www.instagram.com/",
    job: "视觉为先，英文短文案",
    char: 2200,
    automation: "api-or-browser"
  },
  linkedin: {
    name: "LinkedIn",
    handle: "IN",
    format: "Post · 长文",
    color: "#0A66C2",
    openUrl: "https://www.linkedin.com/feed/",
    job: "行业洞察 + 个人立场",
    char: 3000,
    automation: "api-or-browser"
  }
};

export const rubric = [
  { name: "钩子强度", rule: "前 3 秒能否让人停下来", icon: "Flame" },
  { name: "信息密度", rule: "单位篇幅是否给到新信息", icon: "Layers" },
  { name: "立场清晰", rule: "是否有可被引用的判断句", icon: "Target" },
  { name: "可执行性", rule: "看完是否能立刻去做点什么", icon: "Zap" },
  { name: "互动设计", rule: "结尾是否制造下一轮内容", icon: "MessageSquareText" }
];

export const apiSlots = [
  {
    key: "OPENAI_API_KEY",
    name: "LLM 内容引擎",
    status: "必需",
    icon: "Sparkles",
    usage: "选题、生成、改稿、平台适配、评论回复、复盘",
    env: "server"
  },
  {
    key: "BROWSER_AGENT_RUNTIME",
    name: "浏览器自动化",
    status: "必需",
    icon: "Globe",
    usage: "Codex / Browser-Use 控制已登录网页端填充草稿",
    env: "desktop-or-server"
  },
  {
    key: "VISUAL_ENGINE_LOCAL",
    name: "Visual Studio 本地引擎",
    status: "内置",
    icon: "ImageIcon",
    usage: "Satori-compatible 封面/信息卡、Chart-compatible 图表、Hyperframes-style motion HTML、Motion Canvas/Remotion scaffold",
    env: "local-playwright",
    aliases: ["SATORI_COMPATIBLE", "CHART_COMPATIBLE", "HYPERFRAMES_STYLE", "MOTION_CANVAS_SCAFFOLD", "REMOTION_SCAFFOLD"]
  },
  {
    key: "IMAGE_GENERATION_API",
    name: "封面 / 图文",
    status: "推荐",
    icon: "ImageIcon",
    usage: "生成封面、轮播卡片、对比图（Recraft / Ideogram / Flux）",
    env: "server"
  },
  {
    key: "VIDEO_RENDER_API",
    name: "视频渲染",
    status: "可选",
    icon: "Film",
    usage: "脚本 → 配音 → 字幕 → 渲染（HeyGen / Sora / Runway）",
    env: "server"
  },
  {
    key: "TREND_SOURCE_API",
    name: "热点情报",
    status: "可选",
    icon: "TrendingUp",
    usage: "X/微博/小红书热搜，竞品近期内容（Tavily / 飞瓜 / 新榜）",
    env: "server",
    aliases: ["TAVILY_API_KEY", "FIRECRAWL_API_KEY", "JINA_API_KEY"]
  },
  {
    key: "ANALYTICS_API",
    name: "数据回流",
    status: "可选",
    icon: "BarChart3",
    usage: "阅读、互动、粉丝增长，进入下一轮选题池",
    env: "server",
    aliases: ["POSTHOG_API_KEY", "VITE_POSTHOG_KEY"]
  },
  {
    key: "DATABASE_URL",
    name: "持久化数据库",
    status: "推荐",
    icon: "Database",
    usage: "用户、品牌、选题、任务、发布记录、复盘记忆（Postgres / Supabase / Neon）",
    env: "server",
    aliases: ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEON_REST_URL"]
  }
];

export const agentStages = [
  { key: "ingest", name: "解析主体与方向", detail: "提取核心实体、用户画像、目标平台" },
  { key: "research", name: "热点 & 竞品扫描", detail: "拉近 7 天同主题高互动内容，提炼差异角度" },
  { key: "outline", name: "选题与立意", detail: "按方向生成 3 个候选标题与论点" },
  { key: "generate", name: "多平台内容生成", detail: "按平台格式产出文案 / 分镜 / 卡片" },
  { key: "assets", name: "素材准备", detail: "封面、轮播图、配音稿、字幕、缩略图" },
  { key: "policy", name: "合规闸门", detail: "敏感词、平台限制、发布频率与最终确认校验" },
  { key: "publish", name: "网页端填充", detail: "Codex 打开已登录平台填入草稿，停在确认页" },
  { key: "review", name: "数据回流与复盘", detail: "采集评论 / 互动，进入下一轮选题" }
];

export const pricingTiers = [
  { plan: "Free", price: "$0", audience: "试用用户", limits: "每月 10 条，带水印，1 个账号" },
  { plan: "Pro", price: "$29/mo", audience: "个人创作者", limits: "无水印，5 个账号，基础素材生成" },
  { plan: "Team", price: "$99/mo", audience: "MCN / 小团队", limits: "多人协作、审核流、竞品雷达" },
  { plan: "Enterprise", price: "定制", audience: "企业品牌号", limits: "私有部署、合规导出、本地浏览器执行" }
];

export const roadmapItems = [
  { version: "v0.3", title: "真实生成闭环", items: ["BFF + SSE", "LLM 结构化输出", "发布草稿接口", "基础埋点"] },
  { version: "v0.4", title: "Agent Visual Studio", items: ["Satori-compatible 封面/信息卡", "Chart-compatible 数据卡", "Hyperframes-style motion HTML", "Motion Canvas / Remotion scaffold"] },
  { version: "v0.5", title: "情报与复盘", items: ["热点雷达", "评论池", "竞品 mirror", "24h/72h 复盘"] },
  { version: "v1.0", title: "Agent 闭环", items: ["多 Agent 并发", "自学习 brand_learnings", "Tauri 桌面端", "企业合规"] }
];

export const databaseTables = [
  "users(id, email, plan, created_at)",
  "brands(id, user_id, voice_profile_json, default_platforms)",
  "topics(id, brand_id, core, direction, tone, status, created_at)",
  "packs(id, topic_id, generation, pack_json, llm_meta_json, created_at)",
  "drafts(id, pack_id, platform, copy_json, asset_urls, status, draft_url)",
  "publishes(id, draft_id, post_url, posted_at, posted_by)",
  "metrics(id, publish_id, snapshot_at, views, likes, comments, saves, raw_json)",
  "comments(id, publish_id, author, text, sentiment, intent, captured_at)",
  "brand_learnings(id, brand_id, source_publish_id, learning_json, created_at)"
];
