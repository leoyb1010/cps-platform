import { hash } from "./contentEngine.js";
import { platformMeta } from "./catalog.js";
import { getSocialVisualPreset } from "./designGrammar.js";
import { CJK_FONT_STACK, fontRegistryCss } from "./fontRegistry.js";

const ratioMap = {
  "3:4": { w: 1080, h: 1440 },
  "4:5": { w: 1080, h: 1350 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "1.91:1": { w: 1200, h: 628 },
  "16:9": { w: 1280, h: 720 }
};

const platformRatio = {
  xhs: "3:4",
  douyin: "9:16",
  x: "1.91:1",
  weibo: "3:4",
  zhihu: "16:9",
  bilibili: "16:9",
  instagram: "4:5",
  linkedin: "1.91:1"
};

const engineCatalog = {
  cover: { engine: "satori-compatible", stage: "stage-1", output: "png", realExport: true },
  "xhs-carousel": { engine: "html-css-playwright", stage: "stage-1", output: "6xpng", realExport: true },
  "info-card": { engine: "satori-compatible", stage: "stage-1", output: "png", realExport: true },
  infographic: { engine: "html-infographic", stage: "stage-1", output: "png", realExport: true },
  chart: { engine: "chartjs-compatible", stage: "stage-1", output: "png+json", realExport: true },
  "motion-video": { engine: "hyperframes-style", stage: "stage-1", output: "html+thumbnail", realExport: true },
  "explain-animation": { engine: "motion-canvas", stage: "stage-2", output: "manifest", realExport: false },
  "brand-video": { engine: "remotion", stage: "stage-3", output: "manifest", realExport: false }
};

export const visualInspirationLibrary = [
  {
    id: "reveal-js",
    source: "https://github.com/hakimel/reveal.js",
    absorbed: ["section-based HTML decks", "fragments as progressive disclosure", "slide transitions as narrative punctuation"]
  },
  {
    id: "impress-js",
    source: "https://github.com/impress/impress.js",
    absorbed: ["CSS 3D transforms", "canvas-like spatial storytelling", "zoom and rotation as scene grammar"]
  },
  {
    id: "motion-canvas",
    source: "https://github.com/motion-canvas/motion-canvas",
    absorbed: ["code-authored animation timelines", "object-level motion intent", "exportable frame sequences"]
  },
  {
    id: "motion-primitives",
    source: "https://github.com/ibelick/motion-primitives",
    absorbed: ["small polished UI transitions", "panel swaps", "hover-free motion that still reads in screenshots"]
  },
  {
    id: "hyperframes",
    source: "https://github.com/heygen-com/hyperframes",
    absorbed: ["HTML-native video compositions", "seekable frame-accurate timelines", "agent-friendly render contracts"]
  }
];

export const templateSourceCatalog = [
  {
    id: "tabler",
    label: "Tabler Dashboard UI Kit",
    source: "https://github.com/tabler/tabler",
    license: "MIT",
    family: "admin-dashboard",
    templates: ["admin-shell", "metric-cards", "data-table", "profile-card", "settings-panel"],
    absorbed: [
      "dense but calm dashboard grids",
      "compact metric cards with clear labels",
      "sidebar/topbar shell with small UI details",
      "subtle component animation instead of decorative effects"
    ]
  },
  {
    id: "sneat",
    label: "Sneat Bootstrap 5 Admin",
    source: "https://github.com/themeselection/sneat-bootstrap-html-admin-template-free",
    license: "MIT",
    family: "admin-dashboard",
    templates: ["soft-admin-home", "analytics-card", "rounded-stat", "app-panel"],
    absorbed: [
      "soft surfaces and warm neutral admin palette",
      "friendly rounded cards",
      "developer-oriented app dashboard composition",
      "modular widgets that can become XHS panels"
    ]
  },
  {
    id: "star-admin",
    label: "Star Admin",
    source: "https://github.com/BootstrapDash/StarAdmin-Free-Bootstrap-Admin-Template",
    license: "MIT",
    family: "admin-dashboard",
    templates: ["gradient-dashboard", "status-widget", "activity-feed", "chart-panel"],
    absorbed: [
      "higher-contrast SaaS dashboard panels",
      "status widgets and activity feeds",
      "gradient accents used sparingly for hierarchy",
      "admin chart blocks repurposed as social explainer frames"
    ]
  },
  {
    id: "startbootstrap",
    label: "Start Bootstrap",
    source: "https://github.com/startbootstrap",
    license: "MIT per template",
    family: "landing-portfolio",
    templates: ["sb-admin", "sb-admin-2", "creative", "freelancer", "agency", "landing-page", "personal", "stylish-portfolio"],
    absorbed: [
      "one-page landing sections",
      "hero plus feature strip",
      "portfolio and agency narrative blocks",
      "Bootstrap spacing rhythm for quick structured pages"
    ]
  },
  {
    id: "html5up",
    label: "HTML5 UP",
    source: "https://html5up.net/",
    license: "Creative Commons Attribution",
    family: "landing-portfolio",
    templates: [
      "Paradigm Shift", "Massively", "Ethereal", "Story", "Dimension", "Editorial", "Forty", "Stellar",
      "Multiverse", "Phantom", "Hyperspace", "Future Imperfect", "Solid State", "Lens", "Fractal",
      "Eventually", "Spectral", "Photon", "Highlights", "Landed", "Strata", "Read Only", "Alpha",
      "Directive", "Aerial", "Twenty", "Big Picture", "Tessellate", "Prologue", "Helios", "Telephasic",
      "Strongly Typed", "Parallelism", "Escape Velocity", "Astral", "Striped", "Dopetrope", "Miniport",
      "TXT", "Verti", "Zerofour", "Arcana", "Halcyonic", "Minimaxing"
    ],
    absorbed: [
      "responsive editorial and portfolio storytelling",
      "split-screen hero structures",
      "large atmospheric section rhythm translated into social-safe frames",
      "landing-page narrative arcs without copying assets or code"
    ]
  },
  {
    id: "github-free-admin-topic",
    label: "GitHub Topic: free-admin-template",
    source: "https://github.com/topics/free-admin-template",
    license: "varies by repository",
    family: "discovery-source",
    templates: ["topic-ranked-admin-scan"],
    absorbed: [
      "star-sorted admin template discovery",
      "broader dashboard pattern vocabulary",
      "future import candidates with license checks"
    ]
  },
  {
    id: "github-html-template-topic",
    label: "GitHub Topic: html-template",
    source: "https://github.com/topics/html-template",
    license: "varies by repository",
    family: "discovery-source",
    templates: ["topic-ranked-html-scan"],
    absorbed: [
      "general HTML template discovery",
      "landing page and portfolio vocabulary expansion",
      "future import candidates with license checks"
    ]
  },
  {
    id: "baoyu-recipes",
    label: "Baoyu Skill Visual Recipes",
    source: "https://github.com/JimLiu/baoyu-skills",
    license: "workflow/prompt reference",
    family: "social-visual-recipes",
    templates: [
      "xhs-image-cards",
      "xhs-style-cute",
      "xhs-style-fresh",
      "xhs-style-warm",
      "xhs-style-bold",
      "xhs-style-minimal",
      "xhs-style-retro",
      "xhs-style-notion",
      "dense-infographic",
      "process-storyboard",
      "markdown-to-html"
    ],
    absorbed: [
      "12 XHS styles x 8 layouts x palette overrides as a product recipe grammar",
      "baoyu presets: cute-share, product-review, warning, pro-summary, retro-ranking and knowledge-card",
      "21 infographic layouts and 22 style families as selectable/randomized template inventory",
      "dense information cards for XHS and WeChat-style reading",
      "process-first storyboard cards instead of empty decorative video scenes",
      "content preservation and privacy stripping as publishing guardrails"
    ]
  },
  {
    id: "guizang-ppt",
    label: "Guizang PPT Skill",
    source: "https://github.com/op7418/guizang-ppt-skill",
    license: "skill template reference",
    family: "presentation-visual-system",
    templates: ["guizang-swiss", "guizang-magazine", "data-hero", "modular-grid", "editorial-ink"],
    absorbed: [
      "Swiss International Style with strict grids, IKB accent, large typography and hairlines",
      "electronic magazine rhythm with serif headlines, ink/paper palette and editorial hierarchy",
      "deck-like section rhythm translated into social cards and short motion scenes",
      "pre-flight discipline: real classes, safe text boxes, no invented layout names"
    ]
  },
  {
    id: "hyperframes",
    label: "Hyperframes HTML Video",
    source: "https://github.com/heygen-com/hyperframes",
    license: "Apache-2.0",
    family: "html-native-video",
    templates: ["hf-agent-motion", "hf-kinetic-captions", "hf-data-pulse"],
    absorbed: [
      "plain HTML compositions with data-composition metadata",
      "seekable animation hooks that agents can write and render deterministically",
      "local MP4 export path that can later switch to @hyperframes/producer"
    ]
  }
];

export const visualStyleCatalog = {
  "auto-diverse": {
    label: "Auto Diverse",
    note: "同一品牌方向下按主题稳定轮换版式，避免每次都像同一个模板。",
    templates: {
      cover: ["guizang-swiss-cover", "baoyu-minimal-cover", "baoyu-bold-cover", "guizang-magazine-cover", "baoyu-fresh-cover", "product-command", "soft-dashboard-cover", "split-editorial-cover"],
      "info-card": ["guizang-swiss-grid", "baoyu-notion-card", "baoyu-fresh-card", "guizang-magazine-brief", "baoyu-warm-card", "dashboard-stack", "dense-knowledge-card", "editorial-brief"],
      infographic: ["guizang-swiss-map", "baoyu-notion-map", "baoyu-bold-map", "dense-modules", "baoyu-retro-map", "manual-grid"],
      chart: ["data-frame"],
      "motion-video": ["hf-agent-motion", "guizang-swiss-motion", "baoyu-bold-motion", "guizang-magazine-motion", "baoyu-minimal-motion", "kinetic-type", "spatial-deck", "ui-story"]
    }
  },
  "guizang-swiss": {
    label: "Guizang Swiss",
    note: "接入 guizang-ppt-skill 的瑞士国际主义语法：IKB、网格、发丝线、大字号对比，适合科技/工程/数据内容。",
    sourceIds: ["guizang-ppt"],
    templates: {
      cover: ["guizang-swiss-cover"],
      "xhs-carousel": ["dense-knowledge-carousel"],
      "info-card": ["guizang-swiss-grid"],
      infographic: ["guizang-swiss-map"],
      chart: ["data-frame"],
      "motion-video": ["guizang-swiss-motion"]
    }
  },
  "guizang-magazine": {
    label: "Guizang Magazine",
    note: "接入 guizang-ppt-skill 的电子杂志语法：墨色纸底、衬线标题、编辑部层级，适合观点、复盘和故事。",
    sourceIds: ["guizang-ppt"],
    templates: {
      cover: ["guizang-magazine-cover"],
      "xhs-carousel": ["dense-knowledge-carousel"],
      "info-card": ["guizang-magazine-brief"],
      infographic: ["guizang-magazine-map"],
      chart: ["data-frame"],
      "motion-video": ["guizang-magazine-motion"]
    }
  },
  "baoyu-cute": {
    label: "Baoyu Cute",
    note: "接入 baoyu-xhs-images 的 cute-share/girly 语法：粉、桃、薄荷、爱心星星和贴纸感，适合生活方式与轻分享。",
    sourceIds: ["baoyu-recipes"],
    recipe: { id: "cute-share", style: "cute", layouts: ["sparse", "balanced", "list"] },
    templates: {
      cover: ["baoyu-cute-cover"],
      "xhs-carousel": ["dense-knowledge-carousel"],
      "info-card": ["baoyu-cute-card"],
      infographic: ["baoyu-cute-map"],
      chart: ["data-frame"],
      "motion-video": ["baoyu-cute-motion"]
    }
  },
  "baoyu-fresh": {
    label: "Baoyu Fresh",
    note: "接入 baoyu-xhs-images 的 fresh/product-review/nature-flow 语法：薄荷绿、天空蓝、叶子云朵和清爽网格。",
    sourceIds: ["baoyu-recipes"],
    recipe: { id: "product-review", style: "fresh", layouts: ["comparison", "flow", "balanced"] },
    templates: {
      cover: ["baoyu-fresh-cover"],
      "xhs-carousel": ["dense-knowledge-carousel"],
      "info-card": ["baoyu-fresh-card"],
      infographic: ["baoyu-fresh-map"],
      chart: ["data-frame"],
      "motion-video": ["baoyu-fresh-motion"]
    }
  },
  "baoyu-warm": {
    label: "Baoyu Warm",
    note: "接入 baoyu-xhs-images 的 cozy-story 语法：奶油纸底、暖橙、便签和柔和生活感。",
    sourceIds: ["baoyu-recipes"],
    recipe: { id: "cozy-story", style: "warm", layouts: ["balanced", "comparison", "flow"] },
    templates: {
      cover: ["baoyu-warm-cover"],
      "xhs-carousel": ["dense-knowledge-carousel"],
      "info-card": ["baoyu-warm-card"],
      infographic: ["baoyu-warm-map"],
      chart: ["data-frame"],
      "motion-video": ["baoyu-warm-motion"]
    }
  },
  "baoyu-bold": {
    label: "Baoyu Bold Warning",
    note: "接入 baoyu-xhs-images 的 warning/versus 语法：黑底、红橙黄、高对比、编号警示，适合避坑和强提醒。",
    sourceIds: ["baoyu-recipes"],
    recipe: { id: "warning", style: "bold", layouts: ["list", "comparison", "quadrant"] },
    templates: {
      cover: ["baoyu-bold-cover"],
      "xhs-carousel": ["dense-knowledge-carousel"],
      "info-card": ["baoyu-bold-card"],
      infographic: ["baoyu-bold-map"],
      chart: ["data-frame"],
      "motion-video": ["baoyu-bold-motion"]
    }
  },
  "baoyu-minimal": {
    label: "Baoyu Minimal",
    note: "接入 baoyu-xhs-images 的 pro-summary/clean-quote 语法：白底、细线、单强调色、大留白，适合专业总结。",
    sourceIds: ["baoyu-recipes"],
    recipe: { id: "pro-summary", style: "minimal", layouts: ["sparse", "balanced", "dense"] },
    templates: {
      cover: ["baoyu-minimal-cover"],
      "xhs-carousel": ["dense-knowledge-carousel"],
      "info-card": ["baoyu-minimal-card"],
      infographic: ["baoyu-minimal-map"],
      chart: ["data-frame"],
      "motion-video": ["baoyu-minimal-motion"]
    }
  },
  "baoyu-retro": {
    label: "Baoyu Retro",
    note: "接入 baoyu-xhs-images 的 retro-ranking/throwback 语法：旧纸、印章、虚线、复古徽章和排行感。",
    sourceIds: ["baoyu-recipes"],
    recipe: { id: "retro-ranking", style: "retro", layouts: ["list", "balanced", "flow"] },
    templates: {
      cover: ["baoyu-retro-cover"],
      "xhs-carousel": ["dense-knowledge-carousel"],
      "info-card": ["baoyu-retro-card"],
      infographic: ["baoyu-retro-map"],
      chart: ["data-frame"],
      "motion-video": ["baoyu-retro-motion"]
    }
  },
  "baoyu-notion": {
    label: "Baoyu Notion Knowledge",
    note: "接入 baoyu-xhs-images 的 knowledge-card/checklist/concept-map 语法：手绘线、极简知识卡、密集但有秩序。",
    sourceIds: ["baoyu-recipes"],
    recipe: { id: "knowledge-card", style: "notion", layouts: ["dense", "list", "mindmap"] },
    templates: {
      cover: ["baoyu-notion-cover"],
      "xhs-carousel": ["dense-knowledge-carousel"],
      "info-card": ["baoyu-notion-card"],
      infographic: ["baoyu-notion-map"],
      chart: ["data-frame"],
      "motion-video": ["baoyu-notion-motion"]
    }
  },
  "admin-tabler": {
    label: "Tabler Admin",
    note: "清爽高密度后台视觉，适合把 AI 工作流、数据复盘和系统能力讲成产品界面。",
    sourceIds: ["tabler"],
    templates: {
      cover: ["product-command"],
      "info-card": ["dashboard-stack"],
      infographic: ["manual-grid"],
      chart: ["data-frame"],
      "motion-video": ["ui-story"]
    }
  },
  "admin-sneat": {
    label: "Sneat Soft Admin",
    note: "柔和后台卡片和友好数据组件，适合教程、清单、轻量产品化解释。",
    sourceIds: ["sneat"],
    templates: {
      cover: ["soft-dashboard-cover"],
      "info-card": ["soft-widget-grid"],
      infographic: ["manual-grid"],
      chart: ["data-frame"],
      "motion-video": ["soft-ui-story"]
    }
  },
  "admin-star": {
    label: "Star Admin",
    note: "更强对比的 SaaS 仪表盘风格，适合趋势、结果和状态变化。",
    sourceIds: ["star-admin"],
    templates: {
      cover: ["gradient-dashboard-cover"],
      "info-card": ["status-widget-grid"],
      infographic: ["manual-grid"],
      chart: ["data-frame"],
      "motion-video": ["dashboard-pulse"]
    }
  },
  "startbootstrap-landing": {
    label: "Start Bootstrap Landing",
    note: "落地页/作品集式叙事，适合把复杂主题讲成第一屏 offer + 特性模块。",
    sourceIds: ["startbootstrap"],
    templates: {
      cover: ["landing-hero"],
      "info-card": ["feature-grid"],
      infographic: ["manual-grid"],
      chart: ["data-frame"],
      "motion-video": ["landing-scroll"]
    }
  },
  "html5up-editorial": {
    label: "HTML5 UP Editorial",
    note: "编辑部、作品集和强氛围单页的结构语法，适合观点、人物、产品故事。",
    sourceIds: ["html5up"],
    templates: {
      cover: ["split-editorial-cover"],
      "info-card": ["editorial-brief"],
      infographic: ["manual-grid"],
      chart: ["data-frame"],
      "motion-video": ["spatial-deck"]
    }
  },
  "editorial-magazine": {
    label: "Editorial Magazine",
    note: "更像杂志封面和深度文章页，适合观点、判断和复盘。",
    templates: {
      cover: ["magazine-cover"],
      "info-card": ["editorial-brief"],
      infographic: ["manual-grid"],
      chart: ["data-frame"],
      "motion-video": ["spatial-deck"]
    }
  },
  "product-ui": {
    label: "Product UI",
    note: "更像高质感产品界面和系统截图，适合 AI 工具、工作流和硬件对比。",
    templates: {
      cover: ["product-command"],
      "info-card": ["dashboard-stack"],
      infographic: ["manual-grid"],
      chart: ["data-frame"],
      "motion-video": ["ui-story"]
    }
  },
  "swiss-modern": {
    label: "Swiss Modern",
    note: "克制、网格、强层级，适合方法论和结构化清单。",
    templates: {
      cover: ["swiss-poster"],
      "info-card": ["manual-grid"],
      infographic: ["manual-grid"],
      chart: ["data-frame"],
      "motion-video": ["kinetic-type"]
    }
  },
  "kinetic-pitch": {
    label: "Kinetic Pitch",
    note: "更重动效和节奏，适合短视频解释、冲突和反转。",
    templates: {
      cover: ["product-command"],
      "info-card": ["dashboard-stack"],
      infographic: ["manual-grid"],
      chart: ["data-frame"],
      "motion-video": ["kinetic-type", "spatial-deck", "ui-story"]
    }
  },
  "xhs-product-real-scene": {
    label: "XHS Product Real Scene",
    note: "产品实景优先：截图/操作流/功能证据必须占画面主体，适合个人产品、工具实测和产品系列内容。",
    sourceIds: ["baoyu-recipes"],
    recipe: {
      id: "xhs-product-real-scene",
      requiredAssets: ["productScreenshots"],
      qaRules: ["screenshot-visible", "no-empty-center", "safe-area", "human-copy"]
    },
    templates: {
      cover: ["product-real-cover"],
      "xhs-carousel": ["product-real-carousel"],
      "info-card": ["product-flow-card"],
      infographic: ["dense-product-map"],
      chart: ["data-frame"],
      "motion-video": ["product-storyboard"]
    }
  },
  "xhs-dense-infographic": {
    label: "XHS Dense Infographic",
    note: "吸收 baoyu-infographic 的高密度结构，把复杂主题讲成模块化大图，而不是空泛海报。",
    sourceIds: ["baoyu-recipes"],
    recipe: {
      id: "xhs-dense-infographic",
      layouts: ["dense-modules", "bento-grid", "comparison-matrix", "linear-progression"],
      qaRules: ["text-density", "safe-area", "clear-hierarchy"]
    },
    templates: {
      cover: ["swiss-poster"],
      "xhs-carousel": ["dense-knowledge-carousel"],
      "info-card": ["dense-knowledge-card"],
      infographic: ["dense-modules"],
      chart: ["data-frame"],
      "motion-video": ["dense-storyboard"]
    }
  },
  "xhs-process-storyboard": {
    label: "XHS Process Storyboard",
    note: "把教程、复盘、产品操作做成步骤化分镜，适合替代上下文字、中间空白的视频模板。",
    sourceIds: ["baoyu-recipes"],
    recipe: {
      id: "xhs-process-storyboard",
      layouts: ["flow", "timeline", "before-after"],
      qaRules: ["scene-has-substance", "safe-area", "no-empty-center"]
    },
    templates: {
      cover: ["product-command"],
      "xhs-carousel": ["process-story-carousel"],
      "info-card": ["product-flow-card"],
      infographic: ["linear-process-map"],
      chart: ["data-frame"],
      "motion-video": ["process-storyboard"]
    }
  },
  "hyperframes-agent-motion": {
    label: "Hyperframes Agent Motion",
    note: "吸收 Hyperframes 的 HTML-native 视频语法：每个成片都是可寻址、可回放、可由 agent 修改的 HTML composition。",
    sourceIds: ["hyperframes"],
    recipe: {
      id: "hyperframes-agent-motion",
      layouts: ["seekable-scenes", "kinetic-captions", "data-pulse"],
      qaRules: ["composition-metadata", "frame-accurate-seek", "no-empty-scene"]
    },
    templates: {
      cover: ["product-command"],
      "xhs-carousel": ["process-story-carousel"],
      "info-card": ["dense-knowledge-card"],
      infographic: ["linear-process-map"],
      chart: ["data-frame"],
      "motion-video": ["hf-agent-motion", "hf-kinetic-captions", "hf-data-pulse"]
    }
  }
};

export const baoyuTemplateRepository = {
  sourceId: "baoyu-recipes",
  xhsImages: {
    styles: ["cute", "fresh", "warm", "bold", "minimal", "retro", "pop", "notion", "chalkboard", "study-notes", "screen-print", "sketch-notes"],
    layouts: ["sparse", "balanced", "dense", "list", "comparison", "flow", "mindmap", "quadrant"],
    palettes: ["macaron", "warm", "neon"],
    presets: [
      "knowledge-card",
      "checklist",
      "concept-map",
      "swot",
      "tutorial",
      "classroom",
      "study-guide",
      "hand-drawn-edu",
      "sketch-card",
      "sketch-summary",
      "cute-share",
      "girly",
      "cozy-story",
      "product-review",
      "nature-flow",
      "warning",
      "versus",
      "clean-quote",
      "pro-summary",
      "retro-ranking",
      "throwback",
      "pop-facts",
      "hype",
      "poster",
      "editorial",
      "cinematic"
    ]
  },
  infographic: {
    layouts: [
      "linear-progression",
      "binary-comparison",
      "comparison-matrix",
      "hierarchical-layers",
      "tree-branching",
      "hub-spoke",
      "structural-breakdown",
      "bento-grid",
      "iceberg",
      "bridge",
      "funnel",
      "isometric-map",
      "dashboard",
      "periodic-table",
      "comic-strip",
      "story-mountain",
      "jigsaw",
      "venn-diagram",
      "winding-roadmap",
      "circular-flow",
      "dense-modules"
    ],
    styles: [
      "craft-handmade",
      "claymation",
      "kawaii",
      "storybook-watercolor",
      "chalkboard",
      "cyberpunk-neon",
      "bold-graphic",
      "aged-academia",
      "corporate-memphis",
      "technical-schematic",
      "origami",
      "pixel-art",
      "ui-wireframe",
      "subway-map",
      "ikea-manual",
      "knolling",
      "lego-brick",
      "pop-laboratory",
      "morandi-journal",
      "retro-pop-grid",
      "hand-drawn-edu",
      "retro-popup-pop"
    ]
  },
  coverImage: {
    types: ["hero", "conceptual", "typography", "metaphor", "scene", "minimal"],
    palettes: ["warm", "elegant", "cool", "dark", "earth", "vivid", "pastel", "mono", "retro", "duotone", "macaron"],
    renderings: ["flat-vector", "hand-drawn", "painterly", "digital", "pixel", "chalk", "screen-print"],
    textLevels: ["none", "title-only", "title-subtitle", "text-rich"],
    moods: ["subtle", "balanced", "bold"],
    fonts: ["clean", "handwritten", "serif", "display"]
  },
  slideDeck: {
    textures: ["clean", "grid", "organic", "pixel", "paper"],
    moods: ["professional", "warm", "cool", "vibrant", "dark", "neutral"],
    typography: ["geometric", "humanist", "handwritten", "editorial", "technical"],
    densities: ["minimal", "balanced", "dense"],
    presets: ["blueprint", "chalkboard", "corporate", "minimal", "sketch-notes", "watercolor", "dark-atmospheric", "notion", "bold-editorial", "editorial-infographic", "fantasy-animation", "intuition-machine", "pixel-art", "scientific", "vector-illustration", "vintage"]
  },
  articleIllustrator: {
    types: ["infographic", "scene", "flowchart", "comparison", "framework", "timeline"],
    styles: ["notion", "elegant", "warm", "minimal", "blueprint", "watercolor", "editorial", "scientific"],
    palettes: ["macaron", "warm", "neon"]
  },
  comic: {
    layouts: ["standard", "cinematic", "dense", "splash", "mixed", "webtoon", "four-panel"],
    artStyles: ["ligne-claire", "manga", "realistic", "ink-brush", "chalk", "minimalist"],
    tones: ["neutral", "warm", "dramatic", "energetic", "romantic", "vintage", "action"],
    presets: ["ohmsha", "wuxia", "shoujo"]
  }
};

export const mergedTemplateRepository = {
  sources: templateSourceCatalog,
  visualStyles: visualStyleCatalog,
  guizang: {
    sourceId: "guizang-ppt",
    styles: ["electronic-magazine-ink", "swiss-international"],
    electronicMagazine: {
      themes: ["light", "dark", "hero-light", "hero-dark"],
      layouts: [
        "hero-cover",
        "act-divider",
        "data-poster",
        "text-image",
        "image-grid",
        "pipeline",
        "question-page",
        "big-quote",
        "before-after",
        "mixed-media"
      ],
      components: [
        "chrome",
        "foot",
        "h-hero",
        "h-xl",
        "lead",
        "meta-row",
        "stat-card",
        "pipeline",
        "frame-img",
        "callout",
        "kicker"
      ],
      motionRecipes: ["cascade", "hero", "quote", "directional", "pipeline"]
    },
    swissInternational: {
      accents: ["ikb-blue", "lemon-yellow", "lemon-green", "safety-orange"],
      layouts: Array.from({ length: 22 }, (_, index) => `S${String(index + 1).padStart(2, "0")}`),
      lockedRules: [
        "16-column grid",
        "paper/ink/accent only",
        "light 200/300 title weights",
        "hairline separators",
        "registered data-layout only",
        "bottom nav safe area"
      ],
      imageSlots: ["S15", "S16", "S22"],
      motionRecipes: ["scale-number", "bar-rise", "stroke-draw", "timeline-sequence", "grid-reveal"]
    }
  },
  baoyu: baoyuTemplateRepository
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeIntent(intent = "auto") {
  if (intent === "auto") return ["cover", "info-card", "infographic", "chart", "motion-video"];
  return [intent].filter((item) => engineCatalog[item]);
}

function pickFrom(list, seed) {
  if (!list?.length) return "";
  return list[hash(seed) % list.length];
}

export function resolveVisualTemplate(pack, intent, style = "auto-diverse") {
  const family = visualStyleCatalog[style] || visualStyleCatalog["auto-diverse"];
  const templates = family.templates?.[intent] || visualStyleCatalog["auto-diverse"].templates[intent] || [intent];
  return pickFrom(templates, `${pack.id}:${pack.title}:${intent}:${style}`);
}

export function visualSize(ratio = "3:4") {
  return ratioMap[ratio] || ratioMap["3:4"];
}

export function buildVisualPlan(pack, platform = "xhs", intent = "auto", options = {}) {
  const ratio = options.ratio || platformRatio[platform] || "3:4";
  const intents = normalizeIntent(intent);
  const style = options.style || "auto-diverse";
  const family = visualStyleCatalog[style] || visualStyleCatalog["auto-diverse"];
  const templates = Object.fromEntries(intents.map((type) => [type, resolveVisualTemplate(pack, type, style)]));
  const templateSources = templateSourceCatalog.filter((source) => (family.sourceIds || []).includes(source.id));
  return {
    id: `visual-${pack.id}-${hash(`${platform}-${intent}-${ratio}-${style}`)}`,
    packId: pack.id,
    platform,
    platformName: platformMeta[platform]?.name || platformMeta.xhs.name,
    ratio,
    style,
    styleLabel: family.label,
    templates,
    templateSources,
    inspirations: visualInspirationLibrary,
    audience: pack.domain || "general",
    recipe: family.recipe || null,
    assets: intents.map((type) => ({
      type,
      ...engineCatalog[type],
      ratio: type === "motion-video" ? "9:16" : ratio,
      templateId: templates[type],
      status: engineCatalog[type].realExport ? "renderable" : "scaffold_only",
      recipeId: family.recipe?.id || null,
      qaRules: family.recipe?.qaRules || []
    })),
    codexBoundary: {
      browserExecuted: false,
      publishModeDefault: "draft",
      finalPublishRequiresExplicitMode: true
    }
  };
}

export function buildChartSpec(pack, sourceData = {}) {
  const labels = sourceData.labels?.length ? sourceData.labels : pack.scores.map((item) => item.name);
  const values = sourceData.values?.length ? sourceData.values : pack.scores.map((item) => item.score);
  return {
    id: `chart-${pack.id}-${hash(labels.join("|"))}`,
    title: sourceData.title || `${pack.core} 内容质量雷达`,
    chartType: sourceData.chartType || "bar",
    labels,
    values,
    unit: sourceData.unit || "score",
    insight: sourceData.insight || `${pack.direction.label} 内容包的强项集中在 ${pack.scores.slice().sort((a, b) => b.score - a.score)[0]?.name || "钩子"}。`,
    sourceLabel: sourceData.sourceLabel || "content_pack_score_summary",
    note: "Agent 归纳/评分可视化，不等同于平台真实统计数据。"
  };
}

function baseHtml({ title, size, body, background = "#07090d" }) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title><style>
  ${fontRegistryCss()}
  :root{font-family:${CJK_FONT_STACK};color:#f8fafc;background:${background}}
  body{margin:0;background:${background};display:grid;place-items:start;padding:0}.visual-root{width:${size.w}px;height:${size.h}px;box-sizing:border-box;overflow:hidden;position:relative;background:${background};color:#f8fafc}
  *{box-sizing:border-box} .muted{color:#7f827c}.pill{display:inline-flex;padding:10px 18px;background:#111;color:#f8f4ea;font-weight:900}.brand{position:absolute;left:54px;right:54px;bottom:38px;display:flex;justify-content:space-between;color:#77756d;font-size:20px}.grid-bg{position:absolute;inset:0;background-image:linear-gradient(rgba(20,22,18,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(20,22,18,.055) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(to bottom,black,transparent 86%)}
  ${body.css || ""}</style></head><body>${body.html}</body></html>`;
}

function hyperframesRootAttrs({ pack, size, template = "agent-motion", duration = 14, fps = 24 } = {}) {
  const compositionId = `${pack?.id || "agent-studio"}-${template}`.replace(/[^a-zA-Z0-9_.-]/g, "-");
  return [
    `data-composition-id="${escapeHtml(compositionId)}"`,
    `data-start="0"`,
    `data-duration="${Number(duration) || 14}"`,
    `data-width="${Number(size?.w) || 1080}"`,
    `data-height="${Number(size?.h) || 1920}"`,
    `data-fps="${Number(fps) || 24}"`,
    `data-hyperframes-template="${escapeHtml(template)}"`,
    `data-agent-studio-render-contract="seekable-html-video"`
  ].join(" ");
}

function shortText(value, max = 72) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function lengthClass(value) {
  const length = String(value || "").replace(/\s+/g, "").length;
  if (length >= 48) return "is-extra-long";
  if (length >= 34) return "is-long";
  if (length >= 22) return "is-medium";
  return "is-short";
}

function splitLines(value, max = 5) {
  return String(value || "")
    .split(/\n|。|；|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function evidenceAssets(pack = {}) {
  const sources = [
    pack.productScreenshots,
    pack.evidenceAssets,
    pack.localAssets,
    pack.assets?.files
  ];
  return sources.flatMap((items) => Array.isArray(items) ? items : []).filter(Boolean).slice(0, 6);
}

function assetUrl(file) {
  const value = String(typeof file === "object" && file ? file.path || file.url || file.src : file || "");
  if (!value) return "";
  if (/^(https?:|file:|data:)/.test(value)) return value;
  if (value.startsWith("/")) return `file://${value}`;
  return value;
}

function productShotHtml(asset, label = "Product UI") {
  if (asset) {
    const caption = typeof asset === "object" && asset ? asset.caption || asset.label || "" : "";
    return `<figure class="product-shot has-asset"><img src="${escapeHtml(assetUrl(asset))}" alt="${escapeHtml(label)}"/>${caption ? `<figcaption>${escapeHtml(compactChinese(caption, 28))}</figcaption>` : ""}</figure>`;
  }
  return `<figure class="product-shot mock-shot" data-fallback="true">
    <div class="mock-toolbar"><i></i><i></i><i></i><span>${escapeHtml(label)}</span></div>
    <div class="mock-body"><aside><b></b><b></b><b></b><b></b></aside><main><strong></strong><p></p><p></p><section><i></i><i></i><i></i></section></main></div>
  </figure>`;
}

function hasEvidenceAssets(pack = {}) {
  return evidenceAssets(pack).length > 0;
}

function compactChinese(value, max = 72) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[0-9一二三四五六七八九十]+[.、]\s*/g, "")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function shortHeadline(value, fallback = "先看这个判断", max = 15) {
  const text = String(value || fallback)
    .replace(/[：:｜|].*$/g, "")
    .replace(/\s+/g, "")
    .trim();
  return compactChinese(text || fallback, max);
}

function xhsTopicLabel(pack) {
  const source = `${pack.core || ""} ${pack.title || ""}`.toLowerCase();
  if (source.includes("deepseek") && source.includes("token")) return "DeepSeek V4";
  if (source.includes("mac") && (source.includes("统一内存") || source.includes("nvidia"))) return "Mac vs GPU";
  return shortHeadline(pack.core || pack.title, "这件事值得看", 15);
}

function buildXhsCarouselCards(pack) {
  if (Array.isArray(pack.xhsCarouselPlan?.cards) && pack.xhsCarouselPlan.cards.length >= 6) {
    return pack.xhsCarouselPlan.cards.slice(0, 6).map((item, index) => ({
      kind: index === 0 ? "cover" : index === 5 ? "cta" : item.layout === "contrast" ? "contrast" : "point",
      layout: item.layout || ["hero", "editorial", "dashboard", "timeline", "contrast", "debate"][index],
      kicker: item.kicker,
      title: item.title,
      body: item.body,
      bullets: Array.isArray(item.bullets) ? item.bullets : [],
      note: item.note,
      page: padNumber(index)
    }));
  }

  const sourceCards = Array.isArray(pack.cards) ? pack.cards : [];
  if (sourceCards.length >= 6 && sourceCards.some((item) => String(item.body || "").length > 50)) {
    const layouts = ["hero", "editorial", "dashboard", "timeline", "contrast", "debate"];
    return sourceCards.slice(0, 6).map((item, index) => {
      const bodyLines = splitLines(item.body || "", 4).filter(Boolean);
      let fallbackBullets = index === 3 && Array.isArray(pack.playbook)
        ? pack.playbook.slice(0, 4)
        : bodyLines;
      if (index === 3 && /本地模型|云端模型|Mac/i.test(`${pack.core || ""} ${pack.title || ""}`)) {
        fallbackBullets = ["隐私材料 → 本地", "超过 8K/多文件 → 云端", "每天 20 次以上 → 本地", "最终交付 → 云端复核"];
      }
      return {
        kind: index === 0 ? "cover" : index === 5 ? "cta" : item.tone === "warn" ? "contrast" : "point",
        layout: layouts[index],
        kicker: item.eyebrow || ["开场", "反例", "判断", "方法", "边界", "收束"][index],
        title: compactChinese(item.headline || pack.title, index === 0 ? 18 : 16),
        body: compactChinese(item.body || pack.claims?.[index] || pack.core, index === 0 ? 82 : 96),
        bullets: fallbackBullets.slice(0, 4).map((line) => compactChinese(line, 24)),
        note: index === 4 ? compactChinese(pack.antiPattern || pack.claims?.[2] || "", 58) : "",
        page: padNumber(index)
      };
    });
  }

  const card = (index) => sourceCards[index] || {};
  const topic = xhsTopicLabel(pack);
  const isDeepSeekToken = `${pack.core || ""} ${pack.title || ""}`.toLowerCase().includes("deepseek") && `${pack.core || ""} ${pack.title || ""}`.toLowerCase().includes("token");
  const claim = isDeepSeekToken
    ? "真正的信号不是排名，而是长任务有没有迁过去。"
    : compactChinese(pack.claims?.[0] || card(2).headline || pack.core, 58);
  const anti = isDeepSeekToken
    ? "榜单更像热力图：它记录大家把多少任务塞给这个模型。"
    : compactChinese(pack.antiPattern || card(1).body || "只看热闹，不看工作流是否真的迁移。", 64);
  const steps = isDeepSeekToken
    ? ["长上下文任务变多", "代码和文档任务变多", "多轮 Agent 任务变多"]
    : (Array.isArray(pack.playbook) && pack.playbook.length
      ? pack.playbook.slice(0, 3).map((item) => compactChinese(item, 28))
      : splitLines(card(3).body, 3).map((item) => compactChinese(item, 28)));
  return [
    {
      kind: "cover",
      layout: "hero",
      kicker: card(0).eyebrow || pack.direction?.label || "热点拆解",
      title: topic,
      body: isDeepSeekToken ? "先别急着封神。这期不争绝对排名，只看 token 暴涨背后的真实迁移。" : compactChinese(card(0).body || `先别急着站队，这期只拆 ${pack.core} 真正值得看的信号。`, 70),
      bullets: ["不写死榜单神话", "看使用迁移", "看真实场景"]
    },
    {
      kind: "point",
      layout: "editorial",
      kicker: "先纠偏",
      title: "别只看排名",
      body: anti,
      bullets: ["榜单是热力图", "不是能力判决书"],
      note: "排名能说明注意力聚集，但不能直接证明模型能力已经定型。"
    },
    {
      kind: "point",
      layout: "dashboard",
      kicker: "核心判断",
      title: "看工作流迁移",
      body: claim,
      bullets: ["文档分析", "代码理解", "Agent 多轮任务"],
      note: "如果用户愿意把更长、更脏、更不确定的任务交给它，才说明信任在迁移。"
    },
    {
      kind: "steps",
      layout: "timeline",
      kicker: "怎么判断",
      title: "看三个信号",
      body: "判断一个模型是不是正在进入主力区，不看热搜，看它被交给什么任务。",
      bullets: steps.length ? steps : ["长上下文变多", "多轮执行变多", "复盘成本变低"]
    },
    {
      kind: "contrast",
      layout: "contrast",
      kicker: "反方意见",
      title: "也可能是泡沫",
      body: compactChinese(card(4).body || "新模型刚出时，大家会集中测试、反复跑提示词，token 暴涨不一定能持续。", 74),
      bullets: ["测试期偏高", "迁移未必稳定", "成本敏感会回落"],
      note: "所以这期的重点不是给结论，而是给你一个观察框架。"
    },
    {
      kind: "cta",
      layout: "debate",
      kicker: "评论区接力",
      title: "你站哪边？",
      body: compactChinese(card(5).body || pack.platformCopy?.xhs?.body || "评论区说一个真实场景，我会把反对意见做成下一期。", 80),
      bullets: ["生产力迁移", "试新模型泡沫"]
    }
  ].map((item, index) => ({ ...item, page: padNumber(index) }));
}

function padNumber(index) {
  return String(index + 1).padStart(2, "0");
}

function guizangCards(pack, count = 4) {
  const cards = Array.isArray(pack.cards) ? pack.cards : [];
  return Array.from({ length: count }, (_, index) => {
    const card = cards[index + 1] || cards[index] || {};
    return {
      no: padNumber(index),
      eyebrow: compactChinese(card.eyebrow || `MODULE ${padNumber(index)}`, 10),
      title: compactChinese(card.headline || card.title || pack.title, 22),
      body: compactChinese(card.body || pack.claims?.[index] || pack.core, 78)
    };
  });
}

function renderGuizangSwissCoverHtml(pack, plan) {
  const size = visualSize(plan.ratio);
  const titleClass = lengthClass(pack.title);
  const kicker = compactChinese(pack.cards?.[0]?.eyebrow || pack.direction?.label || "SYSTEM BRIEF", 14);
  const body = compactChinese(pack.claims?.[0] || pack.cards?.[0]?.body || pack.core, 88);
  return baseHtml({
    title: pack.title,
    size,
    body: {
      css: `.visual-root{padding:52px;background:#f7f7f2;color:#111;font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}.visual-root::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(0,47,167,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(0,47,167,.12) 1px,transparent 1px);background-size:54px 54px}.chrome{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;padding-bottom:18px;font-size:22px;font-weight:700}.chrome b{color:#002FA7}.hero{position:relative;z-index:2;height:calc(100% - 124px);display:grid;grid-template-rows:auto 1fr auto;gap:28px;padding-top:38px}.kicker{display:inline-flex;align-self:start;padding:12px 16px;background:#002FA7;color:#fff;font-size:24px;font-weight:800;letter-spacing:.02em}.title{margin:0;max-width:900px;font-size:86px;line-height:.98;font-weight:300;letter-spacing:0;text-wrap:balance}.title.is-medium{font-size:76px}.title.is-long{font-size:66px;line-height:1.02}.title.is-extra-long{font-size:56px;line-height:1.06}.title strong{font-weight:700}.bottom{display:grid;grid-template-columns:1fr 280px;gap:34px;align-items:end;border-top:2px solid #111;padding-top:24px}.bottom p{margin:0;font-size:32px;line-height:1.38;font-weight:500;color:#222}.stamp{height:190px;background:#002FA7;color:#fff;display:grid;place-items:center;font-size:62px;font-weight:200}.brand{z-index:3;color:#4b5563}`,
      html: `<main class="visual-root" data-template="guizang-swiss-cover"><div class="chrome"><span>GUIZANG SWISS / ${escapeHtml(plan.platformName)}</span><b>01</b></div><section class="hero"><span class="kicker">${escapeHtml(kicker)}</span><h1 class="title ${titleClass}">${escapeHtml(pack.title)}</h1><div class="bottom"><p>${escapeHtml(body)}</p><div class="stamp">IKB</div></div></section><div class="brand"><span>${escapeHtml(pack.core)}</span><span>grid / hairline / contrast</span></div></main>`
    },
    background: "#f7f7f2"
  });
}

function renderGuizangMagazineCoverHtml(pack, plan) {
  const size = visualSize(plan.ratio);
  const titleClass = lengthClass(pack.title);
  const kicker = pack.cards?.[0]?.eyebrow || pack.direction?.label || "FIELD ISSUE";
  const body = compactChinese(pack.claims?.[0] || pack.cards?.[0]?.body || pack.core, 92);
  return baseHtml({
    title: pack.title,
    size,
    body: {
      css: `.visual-root{padding:52px;background:#f3eadf;color:#181512;font-family:Georgia,"Times New Roman","Songti SC","PingFang SC",serif}.mast{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #181512;padding-bottom:18px}.mast b{font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;font-size:30px;letter-spacing:.12em}.mast span{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;line-height:1.35;text-align:right;color:#675f56}.headline{margin:54px 0 0;max-width:860px;font-size:82px;line-height:.96;font-weight:800;letter-spacing:0;text-wrap:balance}.headline.is-medium{font-size:72px}.headline.is-long{font-size:62px;line-height:1}.headline.is-extra-long{font-size:52px;line-height:1.06}.plate{position:absolute;right:52px;bottom:250px;width:360px;height:440px;border:2px solid #181512;background:linear-gradient(135deg,#181512 0 22%,#b95b42 22% 42%,#e8d7c2 42% 64%,#6f8f7a 64% 82%,#181512 82%);box-shadow:18px 18px 0 #181512}.deck{position:absolute;left:52px;right:455px;bottom:150px;border-top:2px solid #181512;border-bottom:2px solid #181512;padding:22px 0}.deck small{font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#a23b2d;font-size:18px;font-weight:900;letter-spacing:.12em}.deck p{margin:10px 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;font-size:29px;line-height:1.42;font-weight:650}.brand{font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#6c6258}`,
      html: `<main class="visual-root" data-template="guizang-magazine-cover"><div class="mast"><b>INK SYSTEM</b><span>${escapeHtml(plan.platformName)}<br/>${escapeHtml(kicker)}</span></div><h1 class="headline ${titleClass}">${escapeHtml(pack.title)}</h1><div class="plate"></div><section class="deck"><small>EDITORIAL CLAIM</small><p>${escapeHtml(body)}</p></section><div class="brand"><span>${escapeHtml(pack.core)}</span><span>electronic magazine / ink paper</span></div></main>`
    },
    background: "#f3eadf"
  });
}

function renderGuizangSwissGridHtml(pack, plan) {
  const size = visualSize(plan.ratio);
  const modules = guizangCards(pack, 4).map((card, index) => `<article class="${index === 3 ? "accent" : ""}"><small>${escapeHtml(card.no)} / ${escapeHtml(card.eyebrow)}</small><h2>${escapeHtml(card.title)}</h2><p>${escapeHtml(card.body)}</p></article>`).join("");
  return baseHtml({
    title: `${pack.title} guizang swiss grid`,
    size,
    body: {
      css: `.visual-root{padding:48px;background:#f7f7f2;color:#111}.head{display:grid;grid-template-columns:150px 1fr;gap:28px;border-bottom:2px solid #111;padding-bottom:22px}.head b{font-size:88px;line-height:.9;font-weight:250;color:#002FA7}.head h1{margin:0;font-size:52px;line-height:1.04;font-weight:350;max-width:780px}.grid{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:18px}.grid article{min-height:250px;border-top:2px solid #111;padding:20px 0 22px;display:grid;grid-template-rows:auto auto 1fr}.grid article.accent{background:#002FA7;color:#fff;padding:22px}.grid small{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;line-height:1.3;color:#002FA7;text-transform:uppercase}.grid article.accent small{color:rgba(255,255,255,.7)}.grid h2{font-size:34px;line-height:1.1;margin:14px 0 12px;font-weight:750;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}.grid p{font-size:25px;line-height:1.38;margin:0;color:#333;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}.grid article.accent p{color:rgba(255,255,255,.88)}.takeaway{position:absolute;left:48px;right:48px;bottom:86px;border-top:2px solid #111;padding-top:18px;font-size:28px;line-height:1.32;font-weight:650}.brand{color:#555}`,
      html: `<main class="visual-root" data-template="guizang-swiss-grid"><header class="head"><b>04</b><h1>${escapeHtml(pack.cards?.[0]?.headline || pack.title)}</h1></header><section class="grid">${modules}</section><p class="takeaway">${escapeHtml(compactChinese(pack.claims?.[0] || pack.core, 88))}</p><div class="brand"><span>${escapeHtml(pack.core)}</span><span>guizang swiss grid</span></div></main>`
    },
    background: "#f7f7f2"
  });
}

function renderGuizangMagazineBriefHtml(pack, plan) {
  const size = visualSize(plan.ratio);
  const modules = guizangCards(pack, 4).map((card) => `<article><b>${escapeHtml(card.no)}</b><div><small>${escapeHtml(card.eyebrow)}</small><h2>${escapeHtml(card.title)}</h2><p>${escapeHtml(card.body)}</p></div></article>`).join("");
  return baseHtml({
    title: `${pack.title} guizang magazine brief`,
    size,
    body: {
      css: `.visual-root{padding:52px;background:#f3eadf;color:#181512;font-family:Georgia,"Times New Roman","Songti SC","PingFang SC",serif}.kicker{font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;font-size:18px;font-weight:950;letter-spacing:.14em;color:#9f3a2d}.title{font-size:56px;line-height:1.02;margin:18px 0 28px;font-weight:850;max-width:820px}.layout{display:grid;grid-template-columns:1fr 1fr;gap:20px;border-top:2px solid #181512;padding-top:22px}article{display:grid;grid-template-columns:62px minmax(0,1fr);gap:18px;border-bottom:1px solid rgba(24,21,18,.32);padding:18px 0;min-height:190px;overflow:hidden}article b{font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#9f3a2d;font-size:42px;line-height:1}article small{font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#7d7166;font-size:16px;font-weight:900;text-transform:uppercase}article h2{font-size:30px;line-height:1.1;margin:8px 0 9px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}article p{font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;margin:0;color:#504942;font-size:20px;line-height:1.36;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}.pull{position:absolute;left:52px;right:52px;bottom:84px;border-top:2px solid #181512;padding-top:18px;font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;font-size:26px;line-height:1.36;font-weight:750}.brand{font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#6c6258}`,
      html: `<main class="visual-root" data-template="guizang-magazine-brief"><div class="kicker">GUIZANG / EDITORIAL BRIEF</div><h1 class="title">${escapeHtml(pack.cards?.[0]?.headline || pack.title)}</h1><section class="layout">${modules}</section><p class="pull">${escapeHtml(compactChinese(pack.claims?.[0] || pack.core, 96))}</p><div class="brand"><span>${escapeHtml(pack.core)}</span><span>ink hierarchy / magazine rhythm</span></div></main>`
    },
    background: "#f3eadf"
  });
}

const baoyuPalettes = {
  cute: { bg: "#fff7fb", paper: "#fffdf6", ink: "#5b2b46", muted: "#9b6a82", accent: "#ff69b4", accent2: "#ffb3c7", soft: "#e9d8fd", mark: "♡" },
  fresh: { bg: "#f0fff4", paper: "#ffffff", ink: "#173a2c", muted: "#4f7b6a", accent: "#48bb78", accent2: "#90cdf4", soft: "#dff7ea", mark: "✓" },
  warm: { bg: "#fff7ed", paper: "#fffaf0", ink: "#5a3218", muted: "#8a6244", accent: "#ed8936", accent2: "#f6ad55", soft: "#fed7aa", mark: "✦" },
  bold: { bg: "#090909", paper: "#171717", ink: "#ffffff", muted: "#f5c16c", accent: "#ef3f24", accent2: "#f7ff00", soft: "#2b1b12", mark: "!" },
  minimal: { bg: "#fafafa", paper: "#ffffff", ink: "#111111", muted: "#6f7377", accent: "#2563eb", accent2: "#111111", soft: "#f1f5f9", mark: "—" },
  retro: { bg: "#f3e0c7", paper: "#f9ecd6", ink: "#4d3428", muted: "#8c6b55", accent: "#c55a5a", accent2: "#b8860b", soft: "#ead2b5", mark: "※" },
  pop: { bg: "#fff500", paper: "#ffffff", ink: "#121212", muted: "#5b21b6", accent: "#ff2d55", accent2: "#00d5ff", soft: "#ffd6e7", mark: "★" },
  notion: { bg: "#fbfaf7", paper: "#ffffff", ink: "#1f2933", muted: "#64707d", accent: "#2f6f9f", accent2: "#111827", soft: "#eef2f7", mark: "○" },
  chalkboard: { bg: "#10251d", paper: "#163427", ink: "#f7f4df", muted: "#b8d8bf", accent: "#ffd166", accent2: "#7dd3fc", soft: "#214637", mark: "✓" },
  "study-notes": { bg: "#f8fbff", paper: "#ffffff", ink: "#1e3a8a", muted: "#64748b", accent: "#ef4444", accent2: "#facc15", soft: "#dbeafe", mark: "!" },
  "screen-print": { bg: "#f5e9d7", paper: "#fff7e8", ink: "#111111", muted: "#59453a", accent: "#f97316", accent2: "#0891b2", soft: "#ffd6a5", mark: "◆" },
  "sketch-notes": { bg: "#f8f1df", paper: "#fffaf0", ink: "#27313a", muted: "#65717c", accent: "#e8655a", accent2: "#a8d8ea", soft: "#d5c6e0", mark: "✎" }
};

function baoyuVariantFromTemplate(template = "", fallback = "notion") {
  return Object.keys(baoyuPalettes).find((name) => template.includes(`baoyu-${name}`)) || fallback;
}

function baoyuCards(pack, count = 4) {
  const cards = Array.isArray(pack.cards) ? pack.cards : [];
  return Array.from({ length: count }, (_, index) => {
    const card = cards[index + 1] || cards[index] || {};
    return {
      no: padNumber(index),
      eyebrow: compactChinese(card.eyebrow || `POINT ${padNumber(index)}`, 12),
      title: compactChinese(card.headline || card.title || pack.title, 24),
      body: compactChinese(card.body || pack.claims?.[index] || pack.core, 78)
    };
  });
}

function renderBaoyuCoverHtml(pack, plan, variant = "notion") {
  const size = visualSize(plan.ratio);
  const p = baoyuPalettes[variant] || baoyuPalettes.notion;
  const titleClass = lengthClass(pack.title);
  const cards = baoyuCards(pack, 3);
  const chips = cards.map((card) => `<span>${escapeHtml(card.eyebrow)}</span>`).join("");
  const dark = variant === "bold" || variant === "chalkboard";
  return baseHtml({
    title: `${pack.title} baoyu ${variant} cover`,
    size,
    body: {
      css: `.visual-root{padding:54px;background:${p.bg};color:${p.ink};font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}.visual-root::before{content:"";position:absolute;inset:28px;border:3px ${variant === "retro" ? "dashed" : "solid"} ${dark ? "rgba(255,255,255,.24)" : p.ink};opacity:${variant === "minimal" ? ".18" : ".55"}}.visual-root::after{content:"${p.mark}";position:absolute;right:70px;top:88px;width:154px;height:154px;border-radius:${variant === "minimal" || variant === "screen-print" ? "0" : "50%"};display:grid;place-items:center;background:${p.accent};color:${variant === "fresh" || variant === "warm" ? p.ink : p.paper};font-size:86px;font-weight:1000;transform:rotate(${variant === "bold" ? "-8deg" : "6deg"});box-shadow:${variant === "minimal" ? "none" : `12px 12px 0 ${p.ink}`}}.kicker{position:relative;z-index:2;display:inline-flex;padding:12px 18px;border:3px solid ${p.ink};background:${p.paper};box-shadow:${variant === "minimal" ? "none" : `7px 7px 0 ${p.ink}`};font-size:24px;font-weight:950;color:${p.accent}}h1{position:relative;z-index:2;margin:58px 0 0;max-width:790px;font-size:82px;line-height:1.02;font-weight:${variant === "minimal" ? "650" : "1000"};letter-spacing:0;text-wrap:balance}h1.is-medium{font-size:72px}h1.is-long{font-size:62px;line-height:1.05}h1.is-extra-long{font-size:52px;line-height:1.1}.panel{position:absolute;left:54px;right:54px;bottom:132px;z-index:2;padding:26px 28px;border:3px solid ${p.ink};background:${p.paper};box-shadow:${variant === "minimal" ? "none" : `12px 12px 0 ${p.ink}`}}.panel p{margin:0;font-size:30px;line-height:1.38;font-weight:800;color:${dark ? p.ink : "#2f3437"}}.chips{position:relative;z-index:2;margin-top:34px;display:flex;flex-wrap:wrap;gap:14px;max-width:760px}.chips span{padding:10px 15px;border:2px solid ${p.ink};border-radius:${variant === "minimal" || variant === "screen-print" ? "0" : "999px"};background:${p.soft};font-size:20px;font-weight:900}.brand{color:${p.muted};z-index:3}`,
      html: `<main class="visual-root" data-template="baoyu-${escapeHtml(variant)}-cover"><div class="kicker">${escapeHtml(plan.styleLabel || `Baoyu ${variant}`)} / ${escapeHtml(plan.platformName)}</div><h1 class="${titleClass}">${escapeHtml(pack.title)}</h1><div class="chips">${chips}</div><section class="panel"><p>${escapeHtml(compactChinese(pack.claims?.[0] || pack.cards?.[0]?.body || pack.core, 92))}</p></section><div class="brand"><span>${escapeHtml(pack.core)}</span><span>baoyu ${escapeHtml(variant)} style</span></div></main>`
    },
    background: p.bg
  });
}

function renderBaoyuInfoCardHtml(pack, plan, variant = "notion") {
  const size = visualSize(plan.ratio);
  const p = baoyuPalettes[variant] || baoyuPalettes.notion;
  const cards = baoyuCards(pack, 4);
  const modules = cards.map((card, index) => `<article class="${index === 0 ? "leadCard" : ""}"><b>${escapeHtml(card.no)}</b><div><small>${escapeHtml(card.eyebrow)}</small><h2>${escapeHtml(card.title)}</h2><p>${escapeHtml(card.body)}</p></div></article>`).join("");
  return baseHtml({
    title: `${pack.title} baoyu ${variant} card`,
    size,
    body: {
      css: `.visual-root{padding:48px;background:${p.bg};color:${p.ink}}.head{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:start;margin-bottom:24px}.head h1{margin:0;font-size:50px;line-height:1.06;font-weight:950;max-width:720px}.badge{min-width:110px;height:110px;display:grid;place-items:center;border:3px solid ${p.ink};background:${p.accent};color:${variant === "fresh" || variant === "warm" ? p.ink : p.paper};box-shadow:${variant === "minimal" ? "none" : `8px 8px 0 ${p.ink}`};font-size:54px;font-weight:1000}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.grid article{min-height:220px;padding:20px;border:3px solid ${p.ink};background:${p.paper};box-shadow:${variant === "minimal" ? "none" : `8px 8px 0 ${p.ink}`};display:grid;grid-template-columns:58px minmax(0,1fr);gap:14px;overflow:hidden}.grid article.leadCard{background:${p.soft}}article b{font-size:38px;line-height:1;color:${p.accent}}article small{display:block;color:${p.muted};font-size:16px;font-weight:950;text-transform:uppercase}article h2{margin:8px 0 9px;font-size:29px;line-height:1.12;font-weight:950;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}article p{margin:0;font-size:21px;line-height:1.35;color:${variant === "bold" || variant === "chalkboard" ? p.ink : "#3e464a"};display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}.takeaway{position:absolute;left:48px;right:48px;bottom:84px;padding:18px 22px;border:3px solid ${p.ink};background:${p.paper};font-size:25px;line-height:1.35;font-weight:850}.brand{color:${p.muted}}`,
      html: `<main class="visual-root" data-template="baoyu-${escapeHtml(variant)}-card"><header class="head"><h1>${escapeHtml(pack.cards?.[0]?.headline || pack.title)}</h1><div class="badge">${p.mark}</div></header><section class="grid">${modules}</section><p class="takeaway">${escapeHtml(compactChinese(pack.claims?.[0] || pack.core, 92))}</p><div class="brand"><span>${escapeHtml(pack.core)}</span><span>baoyu ${escapeHtml(variant)} / style x layout</span></div></main>`
    },
    background: p.bg
  });
}

function renderMagazineCoverHtml(pack, plan) {
  const size = visualSize(plan.ratio);
  const kicker = pack.cards?.[0]?.eyebrow || pack.direction?.label || "FIELD NOTES";
  const titleClass = lengthClass(pack.title);
  const pull = shortText(pack.claims?.[1] || pack.cards?.[1]?.body || pack.core, 110);
  return baseHtml({
    title: pack.title,
    size,
    body: {
      css: `.visual-root{padding:46px 52px;background:#f5f1e8;color:#171717;font-family:Georgia,"Times New Roman","PingFang SC",serif}.mast{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #171717;padding-bottom:15px;font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}.mast strong{font-size:31px;letter-spacing:.08em}.mast span{font-size:18px;color:#5f5a51;text-align:right;line-height:1.25}.issue{margin-top:34px;display:grid;grid-template-columns:120px 1fr;gap:26px}.issue b{font-family:Inter,sans-serif;font-size:96px;line-height:.82}.issue p{margin:0;color:#6a645a;font-size:22px;line-height:1.4}.headline{margin:64px 0 0;font-size:78px;line-height:.95;font-weight:950;letter-spacing:0;text-wrap:balance;max-width:780px}.headline.is-medium{font-size:68px}.headline.is-long{font-size:58px;line-height:1}.headline.is-extra-long{font-size:48px;line-height:1.06}.photoBox{position:absolute;right:52px;bottom:185px;width:336px;height:420px;border:2px solid #171717;background:linear-gradient(135deg,#171717 0 18%,#d9d3c8 18% 37%,#8ea997 37% 56%,#c66b4d 56% 74%,#171717 74%);box-shadow:18px 18px 0 #171717}.photoBox::before{content:"";position:absolute;left:-46px;top:58px;width:92px;height:92px;border-radius:50%;background:#c66b4d}.deck{position:absolute;left:52px;right:430px;bottom:152px;border-top:1px solid #171717;border-bottom:1px solid #171717;padding:18px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}.deck small{display:block;font-size:17px;font-weight:900;letter-spacing:.08em;color:#8b2d20}.deck p{margin:8px 0 0;font-size:27px;line-height:1.32}.foot{position:absolute;left:52px;right:52px;bottom:44px;display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:end;font-family:Inter,sans-serif;color:#5f5a51;font-size:17px}.foot i{display:block;height:10px;background:repeating-linear-gradient(90deg,#171717 0 8px,transparent 8px 16px)}`,
      html: `<main class="visual-root"><div class="mast"><strong>AGENT FIELD</strong><span>${escapeHtml(plan.platformName)}<br/>${escapeHtml(plan.styleLabel || "Editorial")}</span></div><section class="issue"><b>01</b><p>${escapeHtml(kicker)}<br/>A practical note on what actually changes when the system starts running locally.</p></section><h1 class="headline ${titleClass}">${escapeHtml(pack.title)}</h1><div class="photoBox"></div><section class="deck"><small>EDITORIAL CLAIM</small><p>${escapeHtml(pull)}</p></section><div class="foot"><span>${escapeHtml(pack.core)}</span><i></i><span style="text-align:right">${escapeHtml(platformMeta[plan.platform]?.handle || "LOCAL")}</span></div></main>`
    },
    background: "#f5f1e8"
  });
}

function renderProductCommandCoverHtml(pack, plan) {
  const size = visualSize(plan.ratio);
  const titleClass = lengthClass(pack.title);
  const bullets = pack.cards.slice(1, 4).map((card) => `<li><b>${escapeHtml(card.eyebrow)}</b><span>${escapeHtml(shortText(card.headline, 30))}</span></li>`).join("");
  return baseHtml({
    title: pack.title,
    size,
    body: {
      css: `.visual-root{padding:48px;background:#0b0f14;color:#eaf2f8}.aurora{position:absolute;inset:0;background:radial-gradient(circle at 18% 12%,rgba(89,196,255,.16),transparent 28%),radial-gradient(circle at 92% 8%,rgba(255,214,102,.16),transparent 23%),linear-gradient(180deg,#0b0f14,#12191d);pointer-events:none}.top{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center;color:#97a7b3;font-size:19px}.window{position:relative;z-index:2;margin-top:38px;border:1px solid rgba(213,227,238,.18);border-radius:16px;background:rgba(16,25,31,.82);box-shadow:0 24px 90px rgba(0,0,0,.32);overflow:hidden}.windowHead{height:56px;display:flex;align-items:center;gap:10px;padding:0 18px;border-bottom:1px solid rgba(213,227,238,.14);color:#9eb0bc}.dot{width:12px;height:12px;border-radius:50%;background:#ff6b57}.dot:nth-child(2){background:#ffc64d}.dot:nth-child(3){background:#35d07f}.terminal{padding:34px}.prompt{font-family:"JetBrains Mono",ui-monospace,monospace;color:#7dd3fc;font-size:22px;margin-bottom:24px}.headline{font-size:72px;line-height:1.02;margin:0 0 30px;font-weight:950;text-wrap:balance}.headline.is-medium{font-size:64px}.headline.is-long{font-size:54px}.headline.is-extra-long{font-size:45px;line-height:1.08}.commandGrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:26px}li{list-style:none;margin:0;padding:16px;border:1px solid rgba(213,227,238,.13);border-radius:12px;background:rgba(255,255,255,.035)}ul{display:contents;margin:0;padding:0}li b{display:block;color:#facc15;font-size:16px;margin-bottom:8px}li span{display:block;font-size:22px;line-height:1.24}.spec{position:relative;z-index:2;margin-top:18px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.spec span{padding:13px 14px;border-radius:999px;background:rgba(125,211,252,.08);border:1px solid rgba(125,211,252,.18);color:#c9edf9;font-size:19px;text-align:center}.device{position:absolute;right:44px;bottom:42px;width:310px;height:222px;border-radius:24px;background:linear-gradient(135deg,#24333d,#0f151a);border:1px solid rgba(255,255,255,.18);box-shadow:0 28px 60px rgba(0,0,0,.42)}.device::after{content:"";position:absolute;left:54px;right:54px;bottom:-24px;height:24px;border-radius:0 0 30px 30px;background:#151b21}.brand{z-index:3;color:#80909b}`,
      html: `<main class="visual-root"><div class="aurora"></div><div class="top"><span>${escapeHtml(plan.platformName)} / LOCAL AI WORKBENCH</span><span>${escapeHtml(pack.direction?.label || "SYSTEM")}</span></div><section class="window"><div class="windowHead"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span>agent-studio://visual-command</span></div><div class="terminal"><div class="prompt">$ run visual_pack --style product-ui</div><h1 class="headline ${titleClass}">${escapeHtml(pack.title)}</h1><ul class="commandGrid">${bullets}</ul></div></section><div class="spec"><span>local-first</span><span>browser-runbook</span><span>trace-ready</span></div><div class="device"></div><div class="brand"><span>${escapeHtml(pack.core)}</span><span>${escapeHtml(platformMeta[plan.platform]?.handle || "AGENT STUDIO")}</span></div></main>`
    },
    background: "#0b0f14"
  });
}

function renderProductRealCoverHtml(pack, plan) {
  const size = visualSize(plan.ratio);
  const titleClass = lengthClass(pack.title);
  const assets = evidenceAssets(pack);
  const bullets = pack.cards.slice(1, 4).map((card, index) => `<li><b>${padNumber(index)}</b><span>${escapeHtml(compactChinese(card.headline || card.body, 22))}</span></li>`).join("");
  return baseHtml({
    title: pack.title,
    size,
    body: {
      css: `.visual-root{padding:48px;background:#f6f7f2;color:#141714}.header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}.kicker{font-size:24px;line-height:1.35;font-weight:950;color:#586056}.tag{padding:12px 16px;border:2px solid #141714;background:#fff;box-shadow:7px 7px 0 #141714;font-size:20px;font-weight:950}.title{margin:30px 0 22px;font-size:66px;line-height:1.04;font-weight:1000;text-wrap:balance;max-width:760px}.title.is-medium{font-size:58px}.title.is-long{font-size:50px}.title.is-extra-long{font-size:43px;line-height:1.1}.sceneGrid{display:grid;grid-template-columns:1fr 270px;gap:24px;align-items:stretch}.product-shot{height:560px;border:3px solid #141714;border-radius:26px;background:#fff;box-shadow:14px 14px 0 #141714;overflow:hidden}.product-shot img{width:100%;height:100%;object-fit:cover;object-position:top left;display:block}.mock-toolbar{height:58px;display:flex;align-items:center;gap:10px;padding:0 18px;border-bottom:2px solid #e1e5dc;background:#fbfcf8}.mock-toolbar i{width:14px;height:14px;border-radius:50%;background:#f05d4f}.mock-toolbar i:nth-child(2){background:#f6c453}.mock-toolbar i:nth-child(3){background:#4caf6d}.mock-toolbar span{margin-left:8px;font-size:18px;font-weight:900;color:#6b7468}.mock-body{height:502px;display:grid;grid-template-columns:168px 1fr}.mock-body aside{padding:20px;background:#edf1e8;border-right:2px solid #e1e5dc}.mock-body aside b{display:block;height:36px;margin-bottom:14px;border-radius:10px;background:#d7decf}.mock-body main{padding:28px}.mock-body strong{display:block;width:68%;height:54px;border-radius:14px;background:#141714}.mock-body p{display:block;height:26px;margin:20px 0 0;border-radius:999px;background:#d9dfd1}.mock-body p:nth-of-type(2){width:70%}.mock-body section{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:34px}.mock-body section i{height:148px;border-radius:18px;background:#eef1ea;border:2px solid #dfe5da}.points{display:grid;gap:14px;margin:0;padding:0;list-style:none}.points li{min-height:112px;padding:18px;border:2px solid #141714;background:#fff;box-shadow:8px 8px 0 #141714}.points b{display:block;color:#dc3f35;font-size:26px;line-height:1}.points span{display:block;margin-top:12px;font-size:25px;line-height:1.28;font-weight:950}.claim{margin:28px 0 0;padding:20px 24px;border-left:8px solid #dc3f35;background:#fff;font-size:27px;line-height:1.42;font-weight:850;color:#30362f}.brand{color:#6b7468}`,
      html: `<main class="visual-root" data-recipe="product-real-scene"><header class="header"><span class="kicker">${escapeHtml(plan.styleLabel || "Product real scene")}</span><span class="tag">实景 / 流程 / 取舍</span></header><h1 class="title ${titleClass}">${escapeHtml(pack.title)}</h1><section class="sceneGrid">${productShotHtml(assets[0], pack.core || "Product UI")}<ul class="points">${bullets}</ul></section><p class="claim">${escapeHtml(compactChinese(pack.claims?.[0] || pack.cards?.[0]?.body || "这期只讲产品能看见的部分：功能、取舍、实际流程，不讲私有配置和敏感信息。", 82))}</p><div class="brand"><span>${escapeHtml(pack.core)}</span><span>real product evidence first</span></div></main>`
    },
    background: "#f6f7f2"
  });
}

function renderDashboardCoverHtml(pack, plan, variant = "soft") {
  const size = visualSize(plan.ratio);
  const soft = variant === "soft";
  const gradient = variant === "gradient";
  const titleClass = lengthClass(pack.title);
  const stats = pack.scores.slice(0, 3).map((score, index) => `<article><span>${escapeHtml(score.name)}</span><b>${escapeHtml(score.score)}</b><i style="width:${Math.max(12, score.score)}%"></i></article>`).join("");
  const palette = soft
    ? { bg: "#f6f1eb", panel: "#ffffff", ink: "#22212a", muted: "#777182", accent: "#7467f0", accent2: "#ffab5f" }
    : gradient
      ? { bg: "#10141f", panel: "rgba(255,255,255,.08)", ink: "#f9fafb", muted: "#a6afc2", accent: "#8b5cf6", accent2: "#22d3ee" }
      : { bg: "#f7f9fc", panel: "#ffffff", ink: "#172033", muted: "#667085", accent: "#206bc4", accent2: "#2fb344" };
  return baseHtml({
    title: pack.title,
    size,
    body: {
      css: `.visual-root{padding:42px;background:${palette.bg};color:${palette.ink}}.visual-root::before{content:"";position:absolute;inset:0;background:${gradient ? "radial-gradient(circle at 82% 8%,rgba(139,92,246,.32),transparent 28%),radial-gradient(circle at 12% 24%,rgba(34,211,238,.18),transparent 30%)" : "linear-gradient(135deg,rgba(255,255,255,.45),transparent)"};pointer-events:none}.appShell{position:relative;z-index:2;height:calc(100% - 76px);display:grid;grid-template-columns:190px 1fr;gap:18px}.side{border-radius:22px;background:${palette.panel};border:1px solid ${gradient ? "rgba(255,255,255,.14)" : "rgba(20,24,35,.08)"};padding:18px;box-shadow:0 20px 50px ${gradient ? "rgba(0,0,0,.24)" : "rgba(38,45,70,.09)"}}.side b{display:block;font-size:25px;margin-bottom:26px}.nav{display:grid;gap:10px}.nav i{height:34px;border-radius:12px;background:${gradient ? "rgba(255,255,255,.09)" : "rgba(32,107,196,.08)"}}.nav i:nth-child(2){background:${palette.accent}}.main{display:grid;grid-template-rows:auto 1fr;gap:18px}.top{display:flex;gap:12px}.chip{height:46px;min-width:118px;border-radius:16px;background:${palette.panel};border:1px solid ${gradient ? "rgba(255,255,255,.14)" : "rgba(20,24,35,.08)"}}.hero{position:relative;border-radius:26px;background:${palette.panel};border:1px solid ${gradient ? "rgba(255,255,255,.14)" : "rgba(20,24,35,.08)"};padding:32px;overflow:hidden;box-shadow:0 20px 60px ${gradient ? "rgba(0,0,0,.26)" : "rgba(38,45,70,.11)"}}.hero::after{content:"";position:absolute;right:-80px;top:-70px;width:260px;height:260px;border-radius:50%;background:${palette.accent};opacity:${gradient ? ".35" : ".12"}}.eyebrow{color:${palette.accent};font-weight:900;font-size:20px}.title{position:relative;z-index:2;font-size:64px;line-height:1.02;margin:18px 0 24px;font-weight:950;text-wrap:balance;max-width:690px}.title.is-medium{font-size:58px}.title.is-long{font-size:48px}.title.is-extra-long{font-size:40px;line-height:1.08}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;position:relative;z-index:2}article{border-radius:18px;background:${gradient ? "rgba(255,255,255,.08)" : "rgba(32,107,196,.055)"};border:1px solid ${gradient ? "rgba(255,255,255,.1)" : "rgba(32,107,196,.1)"};padding:16px}article span{display:block;color:${palette.muted};font-size:16px;margin-bottom:8px}article b{display:block;font-size:34px;margin-bottom:12px}article i{display:block;height:7px;border-radius:99px;background:linear-gradient(90deg,${palette.accent},${palette.accent2})}.brand{z-index:3;color:${palette.muted}}`,
      html: `<main class="visual-root"><section class="appShell"><aside class="side"><b>${escapeHtml(soft ? "Sneat" : gradient ? "Star" : "Tabler")} OS</b><div class="nav"><i></i><i></i><i></i><i></i><i></i></div></aside><section class="main"><div class="top"><i class="chip"></i><i class="chip"></i><i class="chip"></i></div><div class="hero"><span class="eyebrow">${escapeHtml(plan.styleLabel || "Dashboard")}</span><h1 class="title ${titleClass}">${escapeHtml(pack.title)}</h1><div class="stats">${stats}</div></div></section></section><div class="brand"><span>${escapeHtml(pack.core)}</span><span>${escapeHtml(plan.templateSources?.[0]?.label || "dashboard inspired")}</span></div></main>`
    },
    background: palette.bg
  });
}

function renderLandingHeroCoverHtml(pack, plan) {
  const size = visualSize(plan.ratio);
  const titleClass = lengthClass(pack.title);
  const features = pack.cards.slice(1, 4).map((card, index) => `<article><b>${padNumber(index)}</b><span>${escapeHtml(shortText(card.headline, 36))}</span></article>`).join("");
  return baseHtml({
    title: pack.title,
    size,
    body: {
      css: `.visual-root{padding:46px;background:#f8fafc;color:#111827}.nav{display:flex;justify-content:space-between;align-items:center;font-size:20px;color:#475569}.nav b{font-size:28px;color:#111827}.hero{margin-top:72px;display:grid;grid-template-columns:1fr 310px;gap:34px;align-items:center}.copy small{display:inline-flex;padding:9px 14px;border-radius:999px;background:#ffedd5;color:#9a3412;font-size:17px;font-weight:900}.copy h1{font-size:74px;line-height:1;margin:22px 0 20px;font-weight:950;text-wrap:balance}.copy h1.is-medium{font-size:66px}.copy h1.is-long{font-size:56px}.copy h1.is-extra-long{font-size:46px;line-height:1.06}.copy p{font-size:28px;line-height:1.38;color:#475569;margin:0;max-width:570px}.visual{height:520px;border-radius:34px;background:linear-gradient(160deg,#0f172a,#2563eb 48%,#f97316);position:relative;overflow:hidden;box-shadow:0 28px 90px rgba(37,99,235,.22)}.visual::before{content:"";position:absolute;inset:38px;border:1px solid rgba(255,255,255,.42);border-radius:24px}.visual::after{content:"";position:absolute;left:54px;right:54px;bottom:64px;height:170px;border-radius:26px;background:rgba(255,255,255,.2);backdrop-filter:blur(8px)}.features{position:absolute;left:46px;right:46px;bottom:128px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}article{padding:18px;border-radius:20px;background:#fff;border:1px solid #e5e7eb;box-shadow:0 14px 38px rgba(15,23,42,.08)}article b{display:block;color:#2563eb;font-size:20px;margin-bottom:8px}article span{font-size:21px;line-height:1.24;font-weight:850}.brand{color:#64748b}`,
      html: `<main class="visual-root"><div class="nav"><b>${escapeHtml(pack.core)}</b><span>Start Bootstrap inspired</span></div><section class="hero"><div class="copy"><small>ONE PAGE OFFER</small><h1 class="${titleClass}">${escapeHtml(pack.title)}</h1><p>${escapeHtml(shortText(pack.claims?.[0] || pack.cards?.[0]?.body || pack.core, 110))}</p></div><div class="visual"></div></section><section class="features">${features}</section><div class="brand"><span>${escapeHtml(plan.platformName)}</span><span>${escapeHtml(plan.styleLabel)}</span></div></main>`
    },
    background: "#f8fafc"
  });
}

function renderSplitEditorialCoverHtml(pack, plan) {
  const size = visualSize(plan.ratio);
  const titleClass = lengthClass(pack.title);
  return baseHtml({
    title: pack.title,
    size,
    body: {
      css: `.visual-root{padding:0;background:#101018;color:#f8fafc}.split{height:100%;display:grid;grid-template-columns:42% 58%}.media{position:relative;background:linear-gradient(145deg,#7c3aed,#14b8a6 48%,#f59e0b);overflow:hidden}.media::before{content:"";position:absolute;inset:36px;border:1px solid rgba(255,255,255,.5)}.media::after{content:"";position:absolute;left:-80px;bottom:82px;width:320px;height:520px;background:rgba(255,255,255,.22);transform:rotate(-18deg)}.copy{padding:62px 56px;display:flex;flex-direction:column;justify-content:center}.copy small{color:#94a3b8;font-size:19px;font-weight:900;letter-spacing:.1em}.copy h1{font-size:76px;line-height:.98;margin:30px 0;font-weight:950;text-wrap:balance}.copy h1.is-medium{font-size:66px}.copy h1.is-long{font-size:56px}.copy h1.is-extra-long{font-size:46px;line-height:1.06}.copy p{font-size:29px;line-height:1.4;color:#cbd5e1;max-width:560px}.rail{position:absolute;right:22px;top:28px;bottom:28px;display:flex;writing-mode:vertical-rl;justify-content:space-between;color:#94a3b8;font-size:18px}.brand{z-index:3;color:#94a3b8}`,
      html: `<main class="visual-root"><section class="split"><div class="media"></div><div class="copy"><small>HTML5 UP / EDITORIAL FRAME</small><h1 class="${titleClass}">${escapeHtml(pack.title)}</h1><p>${escapeHtml(shortText(pack.claims?.[0] || pack.cards?.[0]?.body || pack.core, 120))}</p></div></section><div class="rail"><span>${escapeHtml(plan.platformName)}</span><span>${escapeHtml(pack.core)}</span></div><div class="brand"><span>${escapeHtml(plan.styleLabel)}</span><span>responsive story grammar</span></div></main>`
    },
    background: "#101018"
  });
}

export function renderSatoriLikeCoverHtml(pack, plan) {
  const template = plan.templates?.cover || resolveVisualTemplate(pack, "cover", plan.style);
  if (template === "guizang-swiss-cover") return renderGuizangSwissCoverHtml(pack, plan);
  if (template === "guizang-magazine-cover") return renderGuizangMagazineCoverHtml(pack, plan);
  if (template.startsWith("baoyu-")) return renderBaoyuCoverHtml(pack, plan, baoyuVariantFromTemplate(template));
  if (template === "magazine-cover") return renderMagazineCoverHtml(pack, plan);
  if (template === "product-real-cover") return hasEvidenceAssets(pack) ? renderProductRealCoverHtml(pack, plan) : renderProductCommandCoverHtml(pack, plan);
  if (template === "product-command") return renderProductCommandCoverHtml(pack, plan);
  if (template === "soft-dashboard-cover") return renderDashboardCoverHtml(pack, plan, "soft");
  if (template === "gradient-dashboard-cover") return renderDashboardCoverHtml(pack, plan, "gradient");
  if (template === "landing-hero") return renderLandingHeroCoverHtml(pack, plan);
  if (template === "split-editorial-cover") return renderSplitEditorialCoverHtml(pack, plan);

  const size = visualSize(plan.ratio);
  const isDark = hash(pack.title) % 2 === 0;
  const body = shortText(pack.claims?.[0] || pack.cards?.[0]?.body || pack.core, 84);
  const titleClass = lengthClass(pack.title);
  return baseHtml({
    title: pack.title,
    size,
    body: {
      css: `.visual-root{padding:58px;background:${isDark ? "#080806" : "#ebe7dd"};color:${isDark ? "#f7f2e8" : "#1f211b"}}.visual-root::before{content:"";position:absolute;inset:34px;border:1px solid ${isDark ? "rgba(247,242,232,.28)" : "rgba(31,33,27,.22)"};pointer-events:none}.visual-root::after{content:"";position:absolute;right:-350px;top:96px;width:560px;height:560px;border:54px solid ${isDark ? "#f7f2e8" : "#1f211b"};border-radius:50%;opacity:.34;z-index:0;pointer-events:none}.index,.meta,.titlePanel{position:relative;z-index:2}.index{font-size:154px;line-height:.82;font-weight:1000}.label{position:absolute;left:246px;top:84px;z-index:3;background:${isDark ? "#f7f2e8" : "#1f211b"};color:${isDark ? "#111" : "#f7f2e8"};padding:12px 18px;font-size:39px;line-height:1.05;font-weight:950;max-width:390px}.meta{margin-top:84px;font-size:24px;line-height:1.45;max-width:470px;color:${isDark ? "#d7d1c6" : "#54564d"}}.titlePanel{margin:130px 0 0;width:690px;max-width:100%;padding:8px 0 18px;background:${isDark ? "linear-gradient(90deg,#080806 0%,rgba(8,8,6,.92) 76%,rgba(8,8,6,0) 100%)" : "linear-gradient(90deg,#ebe7dd 0%,rgba(235,231,221,.94) 76%,rgba(235,231,221,0) 100%)"}}.title{margin:0;font-size:66px;line-height:1.08;font-weight:950;max-width:650px;text-wrap:balance;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:5;overflow:hidden}.title.is-medium{font-size:58px;max-width:660px}.title.is-long{font-size:50px;line-height:1.12;max-width:690px}.title.is-extra-long{font-size:42px;line-height:1.14;max-width:700px;-webkit-line-clamp:6}.quote{position:absolute;left:58px;right:58px;bottom:96px;z-index:3;display:grid;grid-template-columns:12px 1fr;gap:20px;padding:20px 22px 20px 0;background:${isDark ? "linear-gradient(90deg,#080806 0%,rgba(8,8,6,.9) 82%,rgba(8,8,6,0) 100%)" : "linear-gradient(90deg,#ebe7dd 0%,rgba(235,231,221,.94) 82%,rgba(235,231,221,0) 100%)"};font-size:28px;line-height:1.42;color:${isDark ? "#e6dfd4" : "#373a31"}}.quote i{display:block;width:4px;background:${isDark ? "#f7f2e8" : "#1f211b"}}.brand{z-index:3;color:${isDark ? "#9c968d" : "#77756d"}}`,
      html: `<main class="visual-root"><div class="index">01</div><div class="label">${escapeHtml(pack.cards?.[0]?.eyebrow || "选题")}</div><p class="meta">留白不是装饰，而是一种取舍。先确定别人应该先看到什么，再安排其余信息。</p><section class="titlePanel"><h1 class="title ${titleClass}">${escapeHtml(pack.title)}</h1></section><div class="quote"><i></i><span>${escapeHtml(body)}</span></div><div class="brand"><span>${escapeHtml(pack.core)}</span><span>${escapeHtml(platformMeta[plan.platform]?.handle || "AGENT STUDIO")}</span></div></main>`
    }
  });
}

function renderDashboardStackInfoCardHtml(pack, plan, variant = "tabler") {
  const size = visualSize(plan.ratio);
  const dark = variant === "star";
  const soft = variant === "sneat";
  const palette = dark
    ? { bg: "#111827", panel: "#1f2937", ink: "#f9fafb", muted: "#a7b0c0", accent: "#a855f7", accent2: "#06b6d4" }
    : soft
      ? { bg: "#f8f2ec", panel: "#ffffff", ink: "#272335", muted: "#817a8a", accent: "#7367f0", accent2: "#ff9f43" }
      : { bg: "#f5f7fb", panel: "#ffffff", ink: "#172033", muted: "#64748b", accent: "#206bc4", accent2: "#2fb344" };
  const widgets = pack.cards.slice(1, 5).map((card, index) => `<article><div><b>${escapeHtml(card.eyebrow)}</b><strong>${escapeHtml(shortText(card.headline, 34))}</strong></div><p>${escapeHtml(shortText(card.body, 88))}</p><i style="width:${54 + index * 11}%"></i></article>`).join("");
  return baseHtml({
    title: `${pack.title} dashboard card`,
    size,
    body: {
      css: `.visual-root{padding:44px;background:${palette.bg};color:${palette.ink}}.frame{height:100%;display:grid;grid-template-columns:210px 1fr;gap:18px}.side{border-radius:24px;background:${palette.panel};border:1px solid ${dark ? "rgba(255,255,255,.08)" : "rgba(23,32,51,.08)"};padding:22px}.side b{font-size:28px}.side i{display:block;height:36px;border-radius:13px;background:${dark ? "rgba(255,255,255,.08)" : "rgba(32,107,196,.07)"};margin-top:14px}.side i:nth-child(3){background:${palette.accent}}.content{display:grid;grid-template-rows:auto 1fr;gap:16px}.header{border-radius:24px;background:${palette.panel};border:1px solid ${dark ? "rgba(255,255,255,.08)" : "rgba(23,32,51,.08)"};padding:24px;display:flex;justify-content:space-between;gap:18px}.header h1{font-size:42px;line-height:1.06;margin:0;font-weight:950;max-width:610px}.header span{color:${palette.muted};font-size:18px;text-align:right}.widgets{display:grid;grid-template-columns:1fr 1fr;gap:14px}article{border-radius:24px;background:${palette.panel};border:1px solid ${dark ? "rgba(255,255,255,.08)" : "rgba(23,32,51,.08)"};padding:22px;display:grid;align-content:start;gap:13px;box-shadow:0 18px 45px ${dark ? "rgba(0,0,0,.18)" : "rgba(23,32,51,.08)"}}article b{display:block;color:${palette.accent};font-size:15px;margin-bottom:8px}article strong{display:block;font-size:27px;line-height:1.16}article p{margin:0;color:${palette.muted};font-size:20px;line-height:1.34}article i{display:block;height:8px;border-radius:999px;background:linear-gradient(90deg,${palette.accent},${palette.accent2})}.brand{color:${palette.muted}}`,
      html: `<main class="visual-root"><section class="frame"><aside class="side"><b>${escapeHtml(plan.styleLabel || "Admin UI")}</b><i></i><i></i><i></i><i></i><i></i></aside><section class="content"><header class="header"><h1>${escapeHtml(pack.cards?.[0]?.headline || pack.title)}</h1><span>${escapeHtml(plan.templateSources?.[0]?.label || "dashboard source")}<br/>${escapeHtml(plan.platformName)}</span></header><div class="widgets">${widgets}</div></section></section><div class="brand"><span>${escapeHtml(pack.core)}</span><span>dashboard pattern library</span></div></main>`
    },
    background: palette.bg
  });
}

function renderFeatureGridInfoCardHtml(pack, plan) {
  const size = visualSize(plan.ratio);
  const features = pack.cards.slice(1, 6).map((card, index) => `<article><b>${padNumber(index)}</b><h2>${escapeHtml(shortText(card.headline, 34))}</h2><p>${escapeHtml(shortText(card.body, 92))}</p></article>`).join("");
  return baseHtml({
    title: `${pack.title} landing features`,
    size,
    body: {
      css: `.visual-root{padding:54px;background:#ffffff;color:#111827}.hero{display:grid;grid-template-columns:1fr 250px;gap:32px;align-items:end;margin-bottom:34px}.hero small{color:#f97316;font-size:17px;font-weight:950;letter-spacing:.12em}.hero h1{font-size:55px;line-height:1.04;margin:10px 0 0;font-weight:950}.badge{height:250px;border-radius:38px;background:linear-gradient(145deg,#2563eb,#14b8a6);position:relative;box-shadow:0 28px 80px rgba(37,99,235,.18)}.badge::after{content:"";position:absolute;inset:36px;border:1px solid rgba(255,255,255,.55);border-radius:26px}.features{display:grid;grid-template-columns:1fr 1fr;gap:14px}article{min-height:186px;padding:22px;border:1px solid #e5e7eb;border-radius:22px;background:#f8fafc}article b{display:block;color:#2563eb;font-size:21px;margin-bottom:12px}article h2{font-size:29px;line-height:1.1;margin:0 0 10px}article p{margin:0;color:#475569;font-size:21px;line-height:1.32}.brand{color:#64748b}`,
      html: `<main class="visual-root"><section class="hero"><div><small>LANDING PAGE MODULE</small><h1>${escapeHtml(pack.cards?.[0]?.headline || pack.title)}</h1></div><div class="badge"></div></section><section class="features">${features}</section><div class="brand"><span>${escapeHtml(plan.templateSources?.[0]?.label || "Start Bootstrap")}</span><span>${escapeHtml(pack.core)}</span></div></main>`
    },
    background: "#ffffff"
  });
}

export function renderXhsCarouselHtml(pack, plan = {}) {
  const size = visualSize("3:4");
  const template = plan.templates?.["xhs-carousel"] || resolveVisualTemplate(pack, "xhs-carousel", plan.style);
  if (template === "product-real-carousel" || template === "process-story-carousel") {
    return renderProductSceneCarouselHtml(pack, plan, template);
  }
  const cards = buildXhsCarouselCards(pack);
  const family = visualStyleCatalog[plan.style] || visualStyleCatalog["html5up-editorial"];
  const source = (plan.templateSources?.[0] || templateSourceCatalog.find((item) => (family.sourceIds || []).includes(item.id)) || templateSourceCatalog.find((item) => item.id === "html5up"));
  const renderedCards = cards.map((card, index) => {
    const bulletHtml = card.bullets.slice(0, 3).map((bullet) => `<li>${escapeHtml(compactChinese(bullet, 18))}</li>`).join("");
    const isCta = card.kind === "cta";
    const note = card.note ? `<p class="note">${escapeHtml(compactChinese(card.note, 58))}</p>` : "";
    const metricHtml = card.bullets.slice(0, 3).map((bullet, metricIndex) => `<article><small>signal ${metricIndex + 1}</small><b>${escapeHtml(compactChinese(bullet, 12))}</b><i></i></article>`).join("");
    const timelineHtml = card.bullets.slice(0, 3).map((bullet, metricIndex) => `<li><b>${padNumber(metricIndex)}</b><span>${escapeHtml(compactChinese(bullet, 18))}</span></li>`).join("");
    const content = {
      hero: `<main class="content heroBlock">
        <p class="source">${escapeHtml(source?.label || "Template Library")} inspired</p>
        <h1>${escapeHtml(card.title)}</h1>
        <p class="body">${escapeHtml(card.body)}</p>
        <ul class="bullets pillList">${bulletHtml}</ul>
      </main>`,
      editorial: `<main class="content editorialBlock">
        <div class="chapterNo">${padNumber(index)}</div>
        <div>
          <p class="source">${escapeHtml(source?.label || "Template Library")} / editorial note</p>
          <h1>${escapeHtml(card.title)}</h1>
          <p class="body">${escapeHtml(card.body)}</p>
        </div>
        <aside class="quoteBox">${escapeHtml(card.note || "把现象和判断分开，才不会被热榜牵着走。")}</aside>
      </main>`,
      dashboard: `<main class="content dashboardBlock">
        <p class="source">${escapeHtml(source?.label || "Template Library")} / signal board</p>
        <h1>${escapeHtml(card.title)}</h1>
        <p class="body">${escapeHtml(card.body)}</p>
        <section class="metricGrid">${metricHtml}</section>
        ${note}
      </main>`,
      timeline: `<main class="content timelineBlock">
        <p class="source">${escapeHtml(source?.label || "Template Library")} / decision path</p>
        <h1>${escapeHtml(card.title)}</h1>
        <p class="body">${escapeHtml(card.body)}</p>
        <ol class="timelineList">${timelineHtml}</ol>
      </main>`,
      contrast: `<main class="content contrastBlock">
        <p class="source">${escapeHtml(source?.label || "Template Library")} / counter view</p>
        <h1>${escapeHtml(card.title)}</h1>
        <p class="body">${escapeHtml(card.body)}</p>
        <section class="splitGrid">${card.bullets.slice(0, 2).map((bullet, splitIndex) => `<article><small>${splitIndex === 0 ? "支持" : "保留"}</small><b>${escapeHtml(compactChinese(bullet, 14))}</b></article>`).join("")}</section>
        ${note}
      </main>`,
      debate: `<main class="content debateBlock">
        <p class="source">${escapeHtml(source?.label || "Template Library")} / comment prompt</p>
        <h1>${escapeHtml(card.title)}</h1>
        <p class="body">${escapeHtml(card.body)}</p>
        <div class="voteRow">${card.bullets.slice(0, 2).map((bullet) => `<span>${escapeHtml(compactChinese(bullet, 12))}</span>`).join("")}</div>
      </main>`
    }[card.layout] || `<main class="content"><h1>${escapeHtml(card.title)}</h1><p class="body">${escapeHtml(card.body)}</p><ul class="bullets">${bulletHtml}</ul></main>`;
    return `<section class="xhs-card ${card.kind} layout-${card.layout}" data-page="${index + 1}">
      <header class="topline">
        <span>${escapeHtml(card.kicker)}</span>
        <b>${card.page}</b>
      </header>
      ${content}
      <footer>
        <span>${escapeHtml(index === 0 ? "手机端 3 秒读完" : isCta ? "评论 = 下一期选题" : pack.core)}</span>
        <i></i>
      </footer>
    </section>`;
  }).join("");

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(pack.title)} · 小红书6图</title><style>
  :root{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f4efe5;color:#111827}
  *{box-sizing:border-box}body{margin:0;background:#f4efe5}.xhs-deck{display:grid;gap:24px;padding:24px}.xhs-card{width:${size.w}px;height:${size.h}px;overflow:hidden;position:relative;padding:80px;background:#f7f2e8;color:#111827;display:flex;flex-direction:column;border:0}
  .xhs-card::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(17,24,39,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(17,24,39,.055) 1px,transparent 1px);background-size:40px 40px;z-index:0}
  .xhs-card::after{content:"";position:absolute;right:80px;top:248px;width:230px;height:230px;border:28px solid rgba(239,68,68,.12);border-radius:50%;z-index:0}
  .topline,.content,footer{position:relative;z-index:2}.topline{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:4px solid #111827;padding-bottom:22px;min-height:74px}.topline span{font-size:32px;line-height:1.25;font-weight:900}.topline b{font-size:52px;line-height:1;color:#ef4444}
  .content{flex:1;display:flex;flex-direction:column;justify-content:center;gap:32px}.source{margin:0;color:#6b7280;font-size:30px;line-height:1.5;font-weight:800}.content h1{margin:0;max-width:820px;font-size:88px;line-height:1.12;font-weight:1000;letter-spacing:0}.body{margin:0;max-width:820px;font-size:42px;line-height:1.58;font-weight:700;color:#374151;word-break:break-word}.note{margin:0;max-width:820px;padding:26px 30px;border-left:10px solid #ef4444;background:rgba(255,255,255,.6);font-size:34px;line-height:1.5;font-weight:800;color:#374151}.bullets{display:grid;gap:20px;margin:8px 0 0;padding:0;list-style:none;max-width:870px}.bullets li{min-height:76px;padding:18px 28px;border:4px solid #111827;border-radius:8px;background:#fffdf8;box-shadow:12px 12px 0 #111827;font-size:36px;line-height:1.35;font-weight:900;word-break:break-word}
  footer{min-height:58px;display:flex;justify-content:space-between;align-items:flex-end;color:#6b7280;font-size:28px;line-height:1.4;font-weight:800}footer i{width:160px;height:12px;border-radius:999px;background:#111827}
  .heroBlock h1{font-size:96px;max-width:760px}.heroBlock .body{font-size:44px}.editorialBlock{display:grid;grid-template-columns:170px 1fr;grid-template-rows:auto auto;align-content:center}.chapterNo{grid-row:1 / span 2;font-size:150px;line-height:.85;font-weight:1000;color:#ef4444}.quoteBox{grid-column:2;margin-top:8px;padding:30px;border:4px solid #111827;background:#fffdf8;box-shadow:12px 12px 0 #111827;font-size:34px;line-height:1.46;font-weight:900;color:#111827}.dashboardBlock{justify-content:center}.metricGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.metricGrid article{min-height:180px;padding:22px;border:4px solid #111827;background:#fffdf8;box-shadow:10px 10px 0 #111827}.metricGrid small{display:block;color:#ef4444;font-size:24px;line-height:1.3;font-weight:900}.metricGrid b{display:block;margin-top:18px;font-size:34px;line-height:1.25}.metricGrid i{display:block;margin-top:22px;height:12px;border-radius:99px;background:#ef4444}.timelineBlock{justify-content:center}.timelineList{display:grid;gap:22px;margin:8px 0 0;padding:0;list-style:none}.timelineList li{display:grid;grid-template-columns:92px 1fr;align-items:center;min-height:118px;border-top:4px solid #111827}.timelineList b{color:#ef4444;font-size:58px;line-height:1}.timelineList span{font-size:38px;line-height:1.35;font-weight:950}.contrast::after{border-radius:0;transform:rotate(8deg);border-color:rgba(17,24,39,.08)}.splitGrid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.splitGrid article{min-height:210px;padding:28px;border:4px solid #111827;background:#fffdf8;box-shadow:12px 12px 0 #111827}.splitGrid small{display:block;font-size:28px;color:#ef4444;font-weight:950}.splitGrid b{display:block;margin-top:20px;font-size:42px;line-height:1.25}.cta{background:#111827;color:#f9fafb}.cta::before{background-image:linear-gradient(rgba(249,250,251,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(249,250,251,.05) 1px,transparent 1px)}.cta::after{border-color:rgba(250,204,21,.18)}.cta .topline{border-color:#f9fafb}.cta .body,.cta .source, .cta footer{color:#d1d5db}.debateBlock h1{font-size:96px}.voteRow{display:grid;grid-template-columns:1fr 1fr;gap:22px}.voteRow span{min-height:110px;padding:26px 30px;border:4px solid #f9fafb;background:#facc15;color:#111827;box-shadow:12px 12px 0 #f9fafb;font-size:38px;line-height:1.3;font-weight:1000}
  </style></head><body><main class="xhs-deck">${renderedCards}</main></body></html>`;
}

function renderProductSceneCarouselHtml(pack, plan = {}, template = "product-real-carousel") {
  const size = visualSize("3:4");
  const assets = evidenceAssets(pack);
  const sourceCards = Array.isArray(pack.cards) ? pack.cards : [];
  const cards = Array.from({ length: 6 }, (_, index) => {
    const card = sourceCards[index] || sourceCards[index % Math.max(1, sourceCards.length)] || {};
    const fallbackTitles = ["真实界面先看这里", "为什么要有标签", "为什么挂到项目", "回看比记录更重要", "少入口，少负担", "下一期继续拆"];
    const fallbackBodies = [
      "这套产品不是为了把笔记写复杂，而是让每条记录能进入下一次判断。",
      "标签不是越多越好，只留下未来真的会用来找回材料的词。",
      "项目让 note 回到真实推进的事情里，不再散成孤立片段。",
      "增长复盘最怕写完就沉底，回看入口决定它还能不能继续发挥作用。",
      "个人工具先克制入口，减少整理负担，才可能长期用下去。",
      "下期继续拆 AI 辅助整理：帮人收束，而不是替人胡写。"
    ];
    const body = compactChinese(card.body || fallbackBodies[index], index === 0 ? 52 : 66);
    return {
      kind: card.tone || "product",
      layout: index === 0 ? "cover" : index === 5 ? "wrap" : ["editorial", "dashboard", "timeline", "contrast"][index - 1] || "editorial",
      kicker: card.eyebrow || (template === "process-story-carousel" ? "操作流程" : "产品实景"),
      title: compactChinese(card.headline || fallbackTitles[index], index === 0 ? 18 : 20),
      body,
      bullets: (card.points || splitLines(card.body || body, 3)).map((item) => compactChinese(item, 22)).filter(Boolean),
      page: padNumber(index)
    };
  });
  const isProcess = template === "process-story-carousel";
  const renderedCards = cards.map((card, index) => {
    const shot = productShotHtml(assets[index] || assets[0], `${pack.core || "Product"} ${index + 1}`);
    const bulletItems = (card.bullets?.length ? card.bullets : splitLines(card.body, 3)).slice(0, 2);
    const bullets = bulletItems
      .map((bullet, bulletIndex) => `<li><b>${padNumber(bulletIndex)}</b><span>${escapeHtml(compactChinese(bullet, 20))}</span></li>`).join("");
    const body = compactChinese(card.body || card.note || pack.claims?.[index % (pack.claims?.length || 1)] || "", index === 0 ? 58 : 74);
    const layout = index === 0 ? "cover" : index === cards.length - 1 ? "wrap" : card.layout;
    return `<section class="xhs-card product-card layout-${layout}" data-recipe="product-real-scene" data-page="${index + 1}">
      <header class="topline"><span>${escapeHtml(card.kicker || (isProcess ? "操作流程" : "产品实景"))}</span><b>${card.page}</b></header>
      <main class="content">
        <section class="copy">
          <p class="source">${escapeHtml(isProcess ? "PROCESS STORYBOARD" : "REAL PRODUCT SCENE")}</p>
          <h1>${escapeHtml(compactChinese(card.title, index === 0 ? 16 : 18))}</h1>
          <p class="body">${escapeHtml(body)}</p>
        </section>
        ${shot}
        <ol class="stepList">${bullets}</ol>
      </main>
      <footer><span>${escapeHtml(index === 0 ? "截图说话，不讲玄学" : index === cards.length - 1 ? "评论区继续拆功能" : compactChinese(pack.core, 18))}</span><i></i></footer>
    </section>`;
  }).join("");

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(pack.title)} · 产品实景小红书</title><style>
  :root{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#eef1e8;color:#111}
  *{box-sizing:border-box}body{margin:0;background:#eef1e8}.xhs-deck{display:grid;gap:24px;padding:24px}.xhs-card{width:${size.w}px;height:${size.h}px;overflow:hidden;position:relative;padding:70px 72px 88px;background:#f8f9f4;color:#111;display:flex;flex-direction:column}.xhs-card::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(17,17,17,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(17,17,17,.04) 1px,transparent 1px);background-size:36px 36px}.topline,.content,footer{position:relative;z-index:2}.topline{min-height:64px;display:flex;justify-content:space-between;align-items:flex-end;border-bottom:4px solid #111;padding-bottom:16px}.topline span{font-size:30px;line-height:1.25;font-weight:950}.topline b{font-size:50px;line-height:1;color:#dc3f35}.content{flex:1;display:flex;flex-direction:column;gap:18px;padding:22px 0 12px;min-height:0}.copy{display:grid;gap:9px;flex:0 0 auto}.source{margin:0;color:#66705f;font-size:28px;line-height:1.25;font-weight:950;letter-spacing:.03em}.copy h1{margin:0;font-size:50px;line-height:1.1;font-weight:1000;text-wrap:balance}.body{margin:0;font-size:30px;line-height:1.33;font-weight:760;color:#394036}.product-shot{height:610px;flex:0 0 610px;margin:0;border:4px solid #111;border-radius:18px;background:#fff;box-shadow:9px 9px 0 #111;overflow:hidden;display:grid;place-items:center;padding:12px}.product-shot img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;object-position:center;display:block}.product-shot figcaption{position:absolute;left:18px;right:18px;bottom:18px;padding:8px 12px;border:2px solid #111;background:rgba(255,255,255,.9);font-size:24px;line-height:1.25;font-weight:900}.mock-toolbar{height:58px;display:flex;align-items:center;gap:10px;padding:0 18px;border-bottom:2px solid #dfe5d8;background:#fcfdf9}.mock-toolbar i{width:14px;height:14px;border-radius:50%;background:#f05d4f}.mock-toolbar i:nth-child(2){background:#f6c453}.mock-toolbar i:nth-child(3){background:#4caf6d}.mock-toolbar span{margin-left:8px;font-size:28px;font-weight:900;color:#6b7468}.mock-body{height:502px;display:grid;grid-template-columns:170px 1fr}.mock-body aside{padding:20px;background:#edf1e8;border-right:2px solid #dfe5d8}.mock-body aside b{display:block;height:34px;margin-bottom:14px;border-radius:10px;background:#d6dfcf}.mock-body main{padding:28px}.mock-body strong{display:block;width:66%;height:50px;border-radius:13px;background:#111}.mock-body p{height:24px;margin:18px 0 0;border-radius:999px;background:#dae1d2}.mock-body p:nth-of-type(2){width:72%}.mock-body section{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:30px}.mock-body section i{height:118px;border-radius:16px;background:#eef1ea;border:2px solid #dfe5d8}.stepList{display:grid;grid-template-columns:1fr;gap:9px;margin:0;padding:0;list-style:none;flex:0 0 auto}.stepList li{min-height:62px;padding:10px 16px;border:3px solid #111;background:#fff;box-shadow:5px 5px 0 #111;display:grid;grid-template-columns:56px 1fr;gap:10px;align-items:center;overflow:hidden}.stepList b{display:block;color:#dc3f35;font-size:29px;line-height:1}.stepList span{display:block;margin-top:0;font-size:27px;line-height:1.15;font-weight:950;word-break:break-word}footer{min-height:46px;display:flex;justify-content:space-between;align-items:center;color:#66705f;font-size:27px;font-weight:900}footer span{max-width:700px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}footer i{width:145px;height:10px;border-radius:999px;background:#111}.layout-cover .copy h1{font-size:58px}.layout-cover .body{font-size:31px}.layout-cover .product-shot{height:640px;flex-basis:640px}.layout-wrap{background:#111;color:#f8f9f4}.layout-wrap::before{background-image:linear-gradient(rgba(248,249,244,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(248,249,244,.055) 1px,transparent 1px)}.layout-wrap .topline{border-color:#f8f9f4}.layout-wrap .body,.layout-wrap .source, .layout-wrap footer{color:#d8ded0}.layout-wrap .product-shot,.layout-wrap .stepList li{box-shadow:5px 5px 0 #f8f9f4;border-color:#f8f9f4}.layout-wrap footer i{background:#f8f9f4}
  </style></head><body><main class="xhs-deck">${renderedCards}</main></body></html>`;
}

function renderEditorialBriefInfoCardHtml(pack, plan) {
  const size = visualSize(plan.ratio);
  const sections = pack.cards.slice(1, 5).map((card, index) => `<article><b>${padNumber(index)}</b><div><h2>${escapeHtml(card.headline)}</h2><p>${escapeHtml(shortText(card.body, 118))}</p></div></article>`).join("");
  return baseHtml({
    title: `${pack.title} editorial brief`,
    size,
    body: {
      css: `.visual-root{padding:50px;background:#f4f0e8;color:#191919;font-family:Georgia,"Times New Roman","PingFang SC",serif}.kicker{font-family:Inter,sans-serif;font-size:18px;font-weight:950;letter-spacing:.14em;color:#9f3a2d}.title{font-size:55px;line-height:1.02;margin:18px 0 30px;font-weight:950;max-width:780px}.layout{display:grid;grid-template-columns:1fr 1fr;gap:18px;border-top:2px solid #191919;padding-top:20px}article{display:grid;grid-template-columns:62px 1fr;gap:18px;border-bottom:1px solid rgba(25,25,25,.26);padding:18px 0;min-height:176px}article b{font-family:Inter,sans-serif;font-size:38px;line-height:1;color:#9f3a2d}article h2{font-size:30px;line-height:1.12;margin:0 0 10px}article p{font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;margin:0;color:#555047;font-size:20px;line-height:1.36}.pull{position:absolute;left:50px;right:50px;bottom:82px;font-size:25px;line-height:1.36;border-top:1px solid #191919;padding-top:18px}.brand{color:#686259}`,
      html: `<main class="visual-root"><div class="kicker">${escapeHtml(plan.templateSources?.[0]?.label || "HTML5 UP")} / EDITORIAL SYSTEM</div><h1 class="title">${escapeHtml(pack.title)}</h1><section class="layout">${sections}</section><p class="pull">${escapeHtml(shortText(pack.claims?.[0] || pack.core, 120))}</p><div class="brand"><span>${escapeHtml(pack.core)}</span><span>${escapeHtml(plan.platformName)}</span></div></main>`
    },
    background: "#f4f0e8"
  });
}

function renderProductFlowInfoCardHtml(pack, plan) {
  const size = visualSize(plan.ratio);
  const assets = evidenceAssets(pack);
  const steps = pack.cards.slice(1, 5).map((card, index) => `<article><b>${padNumber(index)}</b><h2>${escapeHtml(compactChinese(card.headline, 24))}</h2><p>${escapeHtml(compactChinese(card.body, 62))}</p></article>`).join("");
  return baseHtml({
    title: `${pack.title} product flow`,
    size,
    body: {
      css: `.visual-root{padding:48px;background:#f7f8f3;color:#101410}.header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #101410;padding-bottom:18px}.header span{font-size:22px;font-weight:950;color:#66705f}.header b{font-size:38px;line-height:1;color:#d94736}.layout{margin-top:26px;display:grid;grid-template-columns:430px 1fr;gap:24px}.product-shot{height:720px;border:3px solid #101410;border-radius:24px;background:#fff;box-shadow:12px 12px 0 #101410;overflow:hidden}.product-shot img{width:100%;height:100%;object-fit:cover;object-position:top left}.mock-toolbar{height:52px;display:flex;align-items:center;gap:9px;padding:0 16px;border-bottom:2px solid #e4e8de;background:#fcfdf9}.mock-toolbar i{width:13px;height:13px;border-radius:50%;background:#e75649}.mock-toolbar i:nth-child(2){background:#f4bf4f}.mock-toolbar i:nth-child(3){background:#5aae73}.mock-toolbar span{margin-left:8px;font-size:17px;font-weight:900;color:#697366}.mock-body{height:668px;display:grid;grid-template-columns:128px 1fr}.mock-body aside{padding:18px;background:#edf1e8;border-right:2px solid #e4e8de}.mock-body aside b{display:block;height:32px;margin-bottom:12px;border-radius:9px;background:#d7dfcf}.mock-body main{padding:24px}.mock-body strong{display:block;width:78%;height:46px;border-radius:13px;background:#101410}.mock-body p{height:23px;margin:18px 0 0;border-radius:999px;background:#d9dfd2}.mock-body section{display:grid;gap:13px;margin-top:30px}.mock-body section i{height:104px;border-radius:16px;background:#eef1ea;border:2px solid #dfe6d9}.copy h1{margin:0 0 20px;font-size:48px;line-height:1.08;font-weight:1000;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}.steps{display:grid;gap:14px}article{display:grid;grid-template-columns:68px minmax(0,1fr);gap:8px 14px;min-height:132px;padding:16px;border:2px solid #101410;background:#fff;box-shadow:8px 8px 0 #101410;overflow:hidden}article b{grid-row:1 / span 2;font-size:42px;line-height:1;color:#d94736}article h2{grid-column:2;margin:0;font-size:27px;line-height:1.12;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}article p{grid-column:2;margin:0;color:#4c5549;font-size:19px;line-height:1.32;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}.brand{color:#66705f}`,
      html: `<main class="visual-root" data-recipe="product-real-scene"><header class="header"><span>${escapeHtml(plan.styleLabel || "Product Flow")}</span><b>FLOW</b></header><section class="layout">${productShotHtml(assets[1] || assets[0], pack.core || "Product UI")}<div class="copy"><h1>${escapeHtml(pack.cards?.[0]?.headline || pack.title)}</h1><section class="steps">${steps}</section></div></section><div class="brand"><span>${escapeHtml(pack.core)}</span><span>功能截图 + 操作路径</span></div></main>`
    },
    background: "#f7f8f3"
  });
}

function renderDenseKnowledgeInfoCardHtml(pack, plan) {
  const size = visualSize(plan.ratio);
  const modules = pack.cards.slice(1, 6).map((card, index) => `<article><small>${padNumber(index)} / module</small><h2>${escapeHtml(compactChinese(card.headline, 24))}</h2><p>${escapeHtml(compactChinese(card.body, 72))}</p></article>`).join("");
  return baseHtml({
    title: `${pack.title} dense knowledge`,
    size,
    body: {
      css: `.visual-root{padding:44px;background:#f3f0e8;color:#151515}.sheet{height:100%;border:3px solid #151515;padding:28px;background:#fbf8ef;box-shadow:14px 14px 0 #151515}.top{display:grid;grid-template-columns:140px 1fr;gap:22px;border-bottom:3px solid #151515;padding-bottom:20px}.top b{font-size:88px;line-height:.9;color:#e05a3b}.top h1{margin:0;font-size:47px;line-height:1.08;font-weight:1000}.grid{margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:14px}.grid article{min-height:188px;padding:18px;border:2px solid #151515;background:#fff}.grid article:nth-child(3){background:#e8f0df}.grid article:nth-child(4){background:#f6dfd4}.grid article:nth-child(5){grid-column:span 2;background:#e4edf3;min-height:154px}.grid small{display:block;color:#e05a3b;font-size:17px;font-weight:950;text-transform:uppercase}.grid h2{font-size:28px;line-height:1.12;margin:8px 0}.grid p{font-size:21px;line-height:1.34;margin:0;color:#444}.takeaway{position:absolute;left:72px;right:72px;bottom:84px;padding-top:16px;border-top:3px solid #151515;font-size:26px;line-height:1.34;font-weight:900}.brand{color:#68645d}`,
      html: `<main class="visual-root"><section class="sheet"><header class="top"><b>INFO</b><h1>${escapeHtml(pack.title)}</h1></header><section class="grid">${modules}</section><p class="takeaway">${escapeHtml(compactChinese(pack.claims?.[0] || "先给结构，再给细节。读者能带走一个判断，比看完一堆装饰更重要。", 92))}</p></section><div class="brand"><span>${escapeHtml(pack.core)}</span><span>${escapeHtml(plan.styleLabel || "Dense Infographic")}</span></div></main>`
    },
    background: "#f3f0e8"
  });
}

export function renderInfoCardHtml(pack, plan) {
  const template = plan.templates?.["info-card"] || resolveVisualTemplate(pack, "info-card", plan.style);
  if (template === "guizang-swiss-grid") return renderGuizangSwissGridHtml(pack, plan);
  if (template === "guizang-magazine-brief") return renderGuizangMagazineBriefHtml(pack, plan);
  if (template.startsWith("baoyu-")) return renderBaoyuInfoCardHtml(pack, plan, baoyuVariantFromTemplate(template));
  if (template === "product-flow-card") return hasEvidenceAssets(pack) ? renderProductFlowInfoCardHtml(pack, plan) : renderDenseKnowledgeInfoCardHtml(pack, plan);
  if (template === "dense-knowledge-card") return renderDenseKnowledgeInfoCardHtml(pack, plan);
  if (template === "dashboard-stack") return renderDashboardStackInfoCardHtml(pack, plan, "tabler");
  if (template === "soft-widget-grid") return renderDashboardStackInfoCardHtml(pack, plan, "sneat");
  if (template === "status-widget-grid") return renderDashboardStackInfoCardHtml(pack, plan, "star");
  if (template === "feature-grid") return renderFeatureGridInfoCardHtml(pack, plan);
  if (template === "editorial-brief") return renderEditorialBriefInfoCardHtml(pack, plan);

  const size = visualSize(plan.ratio);
  const preset = getSocialVisualPreset("rawGridManual");
  const cards = pack.cards.slice(1, 5).map((card, index) => {
    const lines = splitLines(card.body, 3).map((line) => `<li>${escapeHtml(shortText(line, 42))}</li>`).join("");
    return `<article>
      <b>${padNumber(index)}</b>
      <div>
        <span>${escapeHtml(card.eyebrow)}</span>
        <h2>${escapeHtml(card.headline)}</h2>
        <ul>${lines}</ul>
      </div>
    </article>`;
  }).join("");
  return baseHtml({
    title: `${pack.title} info card`,
    size,
    body: {
      css: `.visual-root{padding:54px;background:#ede9df;color:${preset.palette.ink}}.visual-root::before{content:"";position:absolute;inset:28px;border:1px solid rgba(23,25,20,.22);pointer-events:none}.header{position:relative;z-index:2;display:grid;grid-template-columns:178px 1fr;gap:22px;align-items:start}.num{font-size:142px;line-height:.78;font-weight:1000}.titleBox{background:${preset.palette.ink};color:#f9f4e8;padding:18px 24px;width:max-content;max-width:720px}.titleBox h1{font-size:44px;line-height:1.1;margin:0;font-weight:950;text-wrap:balance}.intro{position:relative;z-index:1;margin:46px 0 42px;display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:34px;align-items:end}.intro p{font-size:27px;line-height:1.44;margin:0;color:#4e5148;max-width:560px}.diagram{height:218px;position:relative;opacity:.72;overflow:hidden}.oval{position:absolute;right:0;border-radius:50%;background:${preset.palette.ink};z-index:0}.o1{width:58px;height:22px;top:4px}.o2{width:92px;height:34px;top:46px}.o3{width:134px;height:50px;top:102px}.o4{width:206px;height:72px;top:184px;transform:translateY(-70px)}.cards{position:relative;z-index:2;display:grid;gap:16px;background:linear-gradient(#ede9df 0%,rgba(237,233,223,.96) 100%)}article{display:grid;grid-template-columns:90px 1fr;gap:22px;min-height:164px;padding:16px 0;border-top:2px solid rgba(23,25,20,.18)}article b{font-size:58px;line-height:.9;font-weight:1000;color:${preset.palette.ink}}article span{font-size:19px;font-weight:900;color:#6a6d63}article h2{font-size:30px;line-height:1.14;margin:5px 0 9px;font-weight:950}ul{margin:0;padding-left:22px;color:#41443d;font-size:22px;line-height:1.36}.brand{color:#74756f}`,
      html: `<main class="visual-root"><section class="header"><div class="num">04</div><div class="titleBox"><h1>${escapeHtml(pack.cards?.[0]?.headline || pack.title)}</h1></div></section><section class="intro"><p>当信息很多时，层级不是装饰，是观看路径。把内容分成主标题、证据、动作和检查项，画面才会有秩序。</p><div class="diagram"><i class="oval o1"></i><i class="oval o2"></i><i class="oval o3"></i><i class="oval o4"></i></div></section><section class="cards">${cards}</section><div class="brand"><span>${escapeHtml(pack.core)}</span><span>LAYOUT / HIERARCHY / ALIGNMENT</span></div></main>`
    },
    background: "#ede9df"
  });
}

export function renderInfographicHtml(pack, plan = {}) {
  let template = plan.templates?.infographic || resolveVisualTemplate(pack, "infographic", plan.style);
  if (template === "guizang-swiss-map") return renderGuizangSwissGridHtml(pack, plan);
  if (template === "guizang-magazine-map") return renderGuizangMagazineBriefHtml(pack, plan);
  if (template.startsWith("baoyu-")) return renderBaoyuInfoCardHtml(pack, plan, baoyuVariantFromTemplate(template));
  if (template === "dense-product-map" && !hasEvidenceAssets(pack)) template = "dense-modules";
  if (["dense-modules", "dense-product-map", "linear-process-map"].includes(template)) {
    return renderRecipeInfographicHtml(pack, plan, template);
  }
  const size = visualSize(plan.ratio || "3:4");
  const preset = getSocialVisualPreset("rawGridManual");
  const modules = pack.cards.slice(1, 5).map((card, index) => `
    <article class="module">
      <div class="moduleNo">RULE ${String.fromCharCode(65 + index)}</div>
      <h2>${escapeHtml(card.headline)}</h2>
      <p>${escapeHtml(shortText(card.body, 112)).replace(/\n/g, "<br/>")}</p>
    </article>
  `).join("");
  return baseHtml({
    title: `${pack.title} infographic`,
    size,
    body: {
      css: `.visual-root{padding:44px;background:${preset.palette.paper};color:${preset.palette.ink}}.visual-root::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(22,25,20,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(22,25,20,.055) 1px,transparent 1px);background-size:34px 34px}.sheet{position:relative;z-index:1;height:100%;border:1px solid rgba(22,25,20,.28);padding:28px}.top{display:flex;align-items:flex-end;gap:18px;border-bottom:2px solid ${preset.palette.line};padding-bottom:16px}.top b{font-size:72px;line-height:.9;font-weight:1000}.top h1{font-size:48px;line-height:1.04;margin:0;font-weight:1000}.theory{margin-top:22px;padding:18px 22px;background:rgba(255,255,255,.54);border:1px solid ${preset.palette.line};box-shadow:0 18px 28px rgba(68,71,58,.13)}.theory small{display:block;font-size:18px;font-weight:950;color:${preset.palette.muted}}.theory h2{font-size:38px;line-height:1.08;margin:6px 0 8px}.theory p{font-size:24px;line-height:1.34;margin:0;color:#474b42}.compare{margin:24px 0;display:grid;grid-template-columns:1fr 1fr;gap:22px}.panel{height:310px;background:#f7f5ec;border:1px solid rgba(22,25,20,.28);padding:18px;position:relative}.panel::before,.panel::after{content:"";position:absolute;width:26px;height:26px;border-color:${preset.palette.ink};opacity:.55}.panel::before{left:10px;top:10px;border-left:2px solid;border-top:2px solid}.panel::after{right:10px;bottom:10px;border-right:2px solid;border-bottom:2px solid}.panel h3{font-size:22px;margin:0 0 14px}.ratioHigh{position:absolute;left:34px;right:34px;top:78px;height:150px;background:linear-gradient(135deg,#d7a887,#95b49b)}.ratioLow{position:absolute;left:118px;right:118px;top:106px;height:92px;background:linear-gradient(135deg,#83938c,#e0b980);border-radius:50%}.caption{position:absolute;left:18px;right:18px;bottom:18px;font-size:22px;font-weight:900;text-align:center}.modules{display:grid;gap:14px}.module{background:rgba(255,255,255,.62);border:1px solid rgba(22,25,20,.2);padding:17px 20px}.moduleNo{font-size:17px;font-weight:950;color:${preset.palette.muted}}.module h2{font-size:29px;line-height:1.1;margin:5px 0 7px}.module p{font-size:22px;line-height:1.3;margin:0;color:#454940}.bars{position:absolute;left:28px;right:28px;bottom:14px;display:flex;justify-content:space-between;opacity:.55}.bars i{width:78px;height:18px;background:repeating-linear-gradient(90deg,${preset.palette.ink} 0 4px,transparent 4px 8px)}.brand{z-index:2}`,
      html: `<main class="visual-root"><section class="sheet"><div class="top"><b>01.</b><h1>${escapeHtml(pack.title)}</h1></div><section class="theory"><small>THEORY MODULE</small><h2>视觉降噪</h2><p>如无必要，勿增实体。删除噪音，让读者先看见结构，再看见细节。</p></section><section class="compare"><div class="panel"><h3>[ HIGH RATIO 高图版率 ]</h3><div class="ratioHigh"></div><div class="caption">释放活力，适合吸睛</div></div><div class="panel"><h3>[ LOW RATIO 低图版率 ]</h3><div class="ratioLow"></div><div class="caption">传递专业与克制</div></div></section><section class="modules">${modules}</section><div class="bars"><i></i><i></i><i></i></div></section><div class="brand"><span>${escapeHtml(pack.core)}</span><span>FORMULA / SYSTEM COMPLETE</span></div></main>`
    },
    background: "#eef0e6"
  });
}

function renderRecipeInfographicHtml(pack, plan = {}, template = "dense-modules") {
  const size = visualSize(plan.ratio || "3:4");
  const isProcess = template === "linear-process-map";
  const isProduct = template === "dense-product-map";
  const assets = evidenceAssets(pack);
  const modules = pack.cards.slice(1, 6).map((card, index) => `<article>
    <small>${isProcess ? "STEP" : "MODULE"} ${padNumber(index)}</small>
    <h2>${escapeHtml(compactChinese(card.headline, 24))}</h2>
    <p>${escapeHtml(compactChinese(card.body, 74))}</p>
  </article>`).join("");
  return baseHtml({
    title: `${pack.title} recipe infographic`,
    size,
    body: {
      css: `.visual-root{padding:44px;background:#f0ede4;color:#141414}.sheet{height:100%;position:relative;border:3px solid #141414;background:#fbf8ef;padding:28px;box-shadow:14px 14px 0 #141414;overflow:hidden}.top{display:grid;grid-template-columns:132px 1fr;gap:20px;align-items:start;border-bottom:3px solid #141414;padding-bottom:18px}.top b{font-size:72px;line-height:.9;color:#dc3f35}.top h1{font-size:44px;line-height:1.08;margin:0;font-weight:1000}.map{margin-top:22px;display:grid;grid-template-columns:${isProduct ? "360px 1fr" : "1fr"};gap:20px}.product-shot{height:500px;border:3px solid #141414;border-radius:22px;background:#fff;box-shadow:10px 10px 0 #141414;overflow:hidden}.product-shot img{width:100%;height:100%;object-fit:cover;object-position:top left}.mock-toolbar{height:48px;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:2px solid #e1e5dc;background:#fcfdf9}.mock-toolbar i{width:12px;height:12px;border-radius:50%;background:#f05d4f}.mock-toolbar i:nth-child(2){background:#f6c453}.mock-toolbar i:nth-child(3){background:#4caf6d}.mock-toolbar span{font-size:16px;font-weight:900;color:#6b7468}.mock-body{height:452px;display:grid;grid-template-columns:112px 1fr}.mock-body aside{padding:16px;background:#edf1e8;border-right:2px solid #e1e5dc}.mock-body aside b{display:block;height:28px;margin-bottom:10px;border-radius:8px;background:#d7decf}.mock-body main{padding:20px}.mock-body strong{display:block;width:68%;height:42px;border-radius:12px;background:#141414}.mock-body p{height:21px;margin:16px 0 0;border-radius:999px;background:#d9dfd1}.mock-body section{display:grid;gap:10px;margin-top:24px}.mock-body section i{height:78px;border-radius:14px;background:#eef1ea;border:2px solid #dfe5da}.modules{display:grid;grid-template-columns:${isProcess ? "1fr" : "1fr 1fr"};gap:14px}.modules article{min-height:${isProcess ? "118px" : "164px"};padding:16px;border:2px solid #141414;background:#fff}.modules article:nth-child(2n){background:#e7efe1}.modules article:nth-child(3n){background:#f6dfd4}.modules small{display:block;color:#dc3f35;font-size:16px;font-weight:950}.modules h2{font-size:26px;line-height:1.12;margin:7px 0}.modules p{font-size:20px;line-height:1.32;margin:0;color:#40483d}.takeaway{position:absolute;left:28px;right:28px;bottom:24px;border-top:3px solid #141414;padding-top:14px;font-size:24px;line-height:1.34;font-weight:900}.brand{z-index:2;color:#6b675f}`,
      html: `<main class="visual-root" data-recipe="${escapeHtml(plan.recipe?.id || "xhs-dense-infographic")}"><section class="sheet"><header class="top"><b>${escapeHtml(isProcess ? "FLOW" : "MAP")}</b><h1>${escapeHtml(pack.title)}</h1></header><section class="map">${isProduct ? productShotHtml(assets[0], pack.core || "Product UI") : ""}<div class="modules">${modules}</div></section><p class="takeaway">${escapeHtml(compactChinese(pack.claims?.[0] || "结构先行：让读者一眼看到模块、关系和下一步动作。", 86))}</p></section><div class="brand"><span>${escapeHtml(pack.core)}</span><span>${escapeHtml(plan.styleLabel || "recipe infographic")}</span></div></main>`
    },
    background: "#f0ede4"
  });
}

export function renderChartHtml(chartSpec, plan = {}) {
  const size = visualSize(plan.ratio || "3:4");
  const max = Math.max(...chartSpec.values, 1);
  const bars = chartSpec.labels.map((label, index) => {
    const value = Number(chartSpec.values[index] || 0);
    const width = Math.max(8, Math.round((value / max) * 100));
    return `<div class="bar-row"><span>${escapeHtml(label)}</span><div class="track"><i style="width:${width}%"></i></div><b>${escapeHtml(value)}${escapeHtml(chartSpec.unit === "score" ? "" : chartSpec.unit)}</b></div>`;
  }).join("");
  return baseHtml({
    title: chartSpec.title,
    size,
    body: {
      css: `.visual-root{padding:62px;background:linear-gradient(160deg,#0f172a,#111827);}.pill{background:#22c55e}.title{font-size:58px;line-height:1.06;letter-spacing:-.06em;margin:46px 0 18px}.insight{font-size:28px;line-height:1.35;color:#cbd5e1;margin-bottom:44px}.chart{display:grid;gap:24px}.bar-row{display:grid;grid-template-columns:230px 1fr 92px;align-items:center;gap:18px;font-size:25px}.track{height:36px;background:#263244;border-radius:999px;overflow:hidden;border:1px solid #334155}.track i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#22c55e,#7c3aed)}.bar-row b{text-align:right;color:#fff}.note{position:absolute;left:62px;right:62px;bottom:92px;color:#94a3b8;font-size:24px}.brand{bottom:42px}`,
      html: `<main class="visual-root"><span class="pill">CHART · ${escapeHtml(chartSpec.chartType)}</span><h1 class="title">${escapeHtml(chartSpec.title)}</h1><p class="insight">${escapeHtml(chartSpec.insight)}</p><section class="chart">${bars}</section><p class="note">${escapeHtml(chartSpec.note)}</p><div class="brand"><span>${escapeHtml(chartSpec.sourceLabel)}</span><span>chartjs-compatible</span></div></main>`
    }
  });
}

// NOTE: the old placeholder motion renderer (decorative empty .visual boxes that produced large
// blank areas in the video) has been removed. All motion now flows through renderContentMotionHtml
// (dense, full-frame, animated) or renderProductStoryboardMotionHtml (real product screenshots).

// Product storyboard: every frame shows a real product screenshot. Same deterministic __seek
// timeline as the content renderer (header number, growing rule, staggered copy, the screenshot
// flex-fills the lower frame and reveals in) so it gets identical smooth motion.
function renderProductStoryboardMotionHtml(pack, plan, template) {
  const size = visualSize("9:16");
  const assets = evidenceAssets(pack);
  const isDense = template === "dense-storyboard";
  const frames = (pack.videoFrames?.length ? pack.videoFrames : pack.cards.slice(0, 6).map((card, index) => ({
    time: `${index * 2}-${index * 2 + 2}s`,
    shot: card.eyebrow || "scene",
    overlay: card.headline || pack.title,
    voice: card.body || pack.core
  }))).slice(0, 6);

  const theme = {
    bg: isDense ? "#f4f0e8" : "#f6f7f2", ink: "#15130f", ink2: "#3c382f",
    sub: "#6b7468", accent: "#d94736", panel: "#ffffff", line: "rgba(20,18,15,.12)"
  };

  const scenes = frames.map((frame, index) => {
    const title = compactChinese(frame.overlay || pack.title, 22);
    return `<section class="scene scene-product">`
      + `<div class="sHead"><div class="sNo">${padNumber(index)}</div>`
      + `<div class="sMeta">${escapeHtml(compactChinese(frame.shot || "scene", 12))}${frame.time ? `<b>${escapeHtml(frame.time)}</b>` : ""}</div></div>`
      + `<div class="rule" data-grow></div>`
      + `<div class="sBody">`
      + `<div class="kick" data-reveal="0">实景演示</div>`
      + `<h1 class="h ${motionTitleClass(title)}" data-reveal="1">${escapeHtml(title)}</h1>`
      + `<p class="lead" data-reveal="2">${escapeHtml(compactChinese(frame.voice || pack.core, 60))}</p>`
      + `<div class="shotWrap" data-reveal="3">${productShotHtml(assets[index] || assets[0], `${pack.core || "Product"} scene ${index + 1}`)}</div>`
      + `</div></section>`;
  }).join("");
  const dots = frames.map(() => `<i class="pdot"></i>`).join("");

  const css = motionCss(theme)
    + `.scene-product .sBody{justify-content:flex-start;gap:20px;padding-top:6px}`
    + `.scene-product .h{margin:0}.scene-product .h.xl{font-size:88px}.scene-product .h.lg{font-size:74px}.scene-product .h.md{font-size:60px}`
    + `.scene-product .lead{font-size:36px;line-height:1.34}`
    + `.shotWrap{flex:1 1 auto;min-height:0;display:flex;margin-top:6px}`
    + `.product-shot{flex:1 1 auto;min-height:0;width:100%;border:4px solid ${theme.ink};border-radius:26px;background:#fff;box-shadow:12px 12px 0 ${theme.ink};overflow:hidden;display:flex;flex-direction:column}`
    + `.product-shot.has-asset img{width:100%;flex:1 1 auto;min-height:0;object-fit:cover;object-position:top left;display:block}`
    + `.product-shot figcaption{flex:0 0 auto;padding:18px 24px;font-size:26px;font-weight:850;color:${theme.ink2};border-top:2px solid ${theme.line};background:#fff}`
    + `.mock-toolbar{flex:0 0 auto;height:64px;display:flex;align-items:center;gap:12px;padding:0 22px;border-bottom:2px solid #dfe5d8;background:#fcfdf9}`
    + `.mock-toolbar i{width:16px;height:16px;border-radius:50%;background:#f05d4f}`
    + `.mock-toolbar i:nth-child(2){background:#f6c453}.mock-toolbar i:nth-child(3){background:#4caf6d}`
    + `.mock-toolbar span{margin-left:10px;font-size:20px;font-weight:900;color:#6b7468}`
    + `.mock-body{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:190px 1fr}`
    + `.mock-body aside{padding:24px;background:#edf1e8;border-right:2px solid #dfe5d8}`
    + `.mock-body aside b{display:block;height:38px;margin-bottom:16px;border-radius:12px;background:#d6dfcf}`
    + `.mock-body main{padding:34px}`
    + `.mock-body strong{display:block;width:66%;height:60px;border-radius:16px;background:#111}`
    + `.mock-body p{height:28px;margin:22px 0 0;border-radius:999px;background:#dae1d2}`
    + `.mock-body section{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:38px}`
    + `.mock-body section i{height:150px;border-radius:20px;background:#eef1ea;border:2px solid #dfe5d8}`;

  return baseHtml({
    title: `${pack.title} product storyboard`,
    size,
    background: theme.bg,
    body: {
      css,
      html: `<main class="visual-root" data-recipe="product-real-scene" ${hyperframesRootAttrs({ pack, size, template })}>${scenes}`
        + `<div class="foot"><span>${escapeHtml(plan?.styleLabel || "每帧都有产品画面")}</span><div class="dots">${dots}</div></div>`
        + `</main>${motionTimelineScript()}`
    }
  });
}

function sceneKindLabel(kind) {
  return ({ hook: "钩子", contrast: "先纠偏", steps: "怎么做", takeaway: "记住", cta: "评论区", statement: "核心判断" })[kind] || "核心判断";
}

// Infer the visual archetype of a beat from its scripted text so the right dense layout is used.
// First beat is always the hook, last is the CTA; the middle uses keyword hints.
function inferSceneKind(index, last, frame) {
  if (index === 0) return "hook";
  if (index === last) return "cta";
  const blob = `${frame.shot || ""} ${frame.overlay || ""} ${frame.voice || ""}`;
  if (/(对比|别|不要|不是|误区|反差|纠偏|坑|错|vs|VS)/.test(blob)) return "contrast";
  if (/(步|怎么|流程|判断|方法|配置|阈值|路由|清单|先.{0,6}再)/.test(blob)) return "steps";
  return "statement";
}

// Turn a narration sentence into short, screen-readable bullet points by splitting on Chinese and
// ASCII clause separators. This surfaces the real substance inside `voice` as a visible list so the
// frame carries information density instead of a single line of text.
function clausePoints(text, max = 3, maxLen = 18) {
  return String(text || "")
    .split(/[，,、。；;\n]+/)
    .map((part) => compactChinese(part.trim(), maxLen))
    .filter((part) => part.replace(/\s+/g, "").length >= 2)
    .slice(0, max);
}

// Build dense, full-frame video scenes from the pack's REAL substance. The pack's videoFrames are
// the actual storyboard the content engine wrote (time / shot / overlay / voice), so we use them as
// the spine and enrich each beat with the matching card / claim / playbook content. Every scene is
// shaped to FILL the 9:16 frame with usable information instead of one truncated sentence.
export function videoScenesFromPack(pack) {
  const cards = Array.isArray(pack.cards) ? pack.cards : [];
  const claims = Array.isArray(pack.claims) ? pack.claims : [];
  const playbook = (Array.isArray(pack.playbook) ? pack.playbook : [])
    .map((step) => compactChinese(step, 46)).filter(Boolean);
  const frames = Array.isArray(pack.videoFrames) ? pack.videoFrames : [];

  const spine = frames.length >= 3
    ? frames
    : cards.slice(0, 6).map((card, index) => ({
        time: ["00:00", "00:04", "00:10", "00:18", "00:27", "00:36"][index] || "",
        shot: card.eyebrow || "",
        overlay: card.headline || pack.title,
        voice: card.body || claims[index] || pack.core,
        visual: ""
      }));

  const count = Math.max(3, Math.min(7, spine.length));
  const last = count - 1;

  return spine.slice(0, count).map((frame, index) => {
    const kind = inferSceneKind(index, last, frame);
    const title = compactChinese(frame.overlay || cards[index]?.headline || pack.title, 26);
    const voice = compactChinese(frame.voice || cards[index]?.body || claims[index] || "", 86);
    const base = {
      no: padNumber(index),
      kind,
      time: frame.time || "",
      shot: compactChinese(frame.shot || sceneKindLabel(kind), 12),
      title,
      body: voice
    };

    if (kind === "hook") {
      const agenda = spine.slice(1, count)
        .map((item) => compactChinese(item.overlay || "", 18)).filter(Boolean).slice(0, 3);
      return { ...base, lead: voice, agenda };
    }
    if (kind === "contrast") {
      return {
        ...base,
        wrong: compactChinese(pack.antiPattern || cards[index]?.body || "只看热闹，不看流程是否真的改变。", 44),
        right: compactChinese(claims[0] || voice || title, 44),
        tags: clausePoints(voice, 3, 16)
      };
    }
    if (kind === "steps") {
      const steps = (playbook.length ? playbook : splitLines(voice, 4).map((line) => compactChinese(line, 34)))
        .filter(Boolean).slice(0, 4);
      return { ...base, lead: voice, steps };
    }
    if (kind === "cta") {
      const recap = spine.slice(0, last)
        .map((item) => compactChinese(item.overlay || "", 14)).filter(Boolean).slice(0, 3);
      return { ...base, recap, prompt: compactChinese(pack.discussionPrompt || voice || "评论区聊聊你的做法。", 40) };
    }
    return { ...base, chips: clausePoints(voice, 3, 18) };
  });
}

function motionTitleClass(text) {
  const len = String(text || "").replace(/\s+/g, "").length;
  if (len <= 10) return "xl";
  if (len <= 20) return "lg";
  return "md";
}

// Each scene body fills the frame with a kicker, a large headline, and a kind-specific dense block
// (agenda / comparison / numbered steps / key-point chips / recap). Every element carries a
// data-reveal index so the timeline can stagger them in for real motion.
function renderMotionSceneBody(scene) {
  const heading = `<div class="kick" data-reveal="0">${escapeHtml(sceneKindLabel(scene.kind))}</div>`
    + `<h1 class="h ${motionTitleClass(scene.title)}" data-reveal="1">${escapeHtml(scene.title)}</h1>`;

  if (scene.kind === "hook") {
    const agenda = (scene.agenda || [])
      .map((item, i) => `<li data-reveal="${i + 3}"><span>${padNumber(i)}</span><p>${escapeHtml(item)}</p></li>`).join("");
    return heading
      + (scene.lead ? `<p class="lead" data-reveal="2">${escapeHtml(scene.lead)}</p>` : "")
      + (agenda ? `<ul class="agenda">${agenda}</ul>` : "");
  }
  if (scene.kind === "contrast") {
    const tags = (scene.tags || [])
      .map((item, i) => `<span class="tag" data-reveal="${i + 4}">${escapeHtml(item)}</span>`).join("");
    return heading
      + `<div class="cols">`
      + `<div class="col wrong" data-reveal="2"><b>✕ 常见做法</b><p>${escapeHtml(scene.wrong)}</p></div>`
      + `<div class="col right" data-reveal="3"><b>✓ 更好的做法</b><p>${escapeHtml(scene.right)}</p></div>`
      + `</div>${tags ? `<div class="tags">${tags}</div>` : ""}`;
  }
  if (scene.kind === "steps") {
    const items = (scene.steps || [])
      .map((text, i) => `<li data-reveal="${i + 2}"><b>${i + 1}</b><p>${escapeHtml(text)}</p></li>`).join("");
    return heading + `<ol class="steps">${items}</ol>`;
  }
  if (scene.kind === "cta") {
    const recap = (scene.recap || [])
      .map((item, i) => `<li data-reveal="${i + 2}"><span>${padNumber(i)}</span><p>${escapeHtml(item)}</p></li>`).join("");
    return heading
      + (recap ? `<ul class="recap">${recap}</ul>` : "")
      + (scene.prompt ? `<p class="prompt" data-reveal="5">💬 ${escapeHtml(scene.prompt)}</p>` : "");
  }
  // statement
  const chips = (scene.chips || [])
    .map((item, i) => `<li data-reveal="${i + 3}"><i></i><p>${escapeHtml(item)}</p></li>`).join("");
  return heading
    + (scene.body ? `<p class="lead bar" data-reveal="2">${escapeHtml(scene.body)}</p>` : "")
    + (chips ? `<ul class="chips">${chips}</ul>` : "");
}

// Map the chosen visual style/template onto a video color theme so the video reads like the rest of
// the template library instead of one hardcoded look.
function motionTheme(hint = "") {
  const t = String(hint).toLowerCase();
  if (/hf-|hyperframes|agent-motion/.test(t)) {
    return { bg: "#05070a", ink: "#f8fafc", ink2: "#dbe7f3", sub: "#8fa3b8", accent: "#38bdf8", panel: "rgba(56,189,248,.08)", line: "rgba(148,163,184,.22)" };
  }
  if (/landing|editorial|magazine|swiss|html5up|startbootstrap|light|paper|notion|fresh/.test(t)) {
    return { bg: "#f4f1ea", ink: "#15130f", ink2: "#3c382f", sub: "#8a8576", accent: "#e0452f", panel: "#ffffff", line: "rgba(20,18,15,.12)" };
  }
  if (/dashboard|admin|tabler|sneat|star|ui-story|product|cyber|tech/.test(t)) {
    return { bg: "#0b1220", ink: "#f2f6fc", ink2: "#cdd8ea", sub: "#7d8aa3", accent: "#38bdf8", panel: "rgba(255,255,255,.06)", line: "rgba(255,255,255,.13)" };
  }
  return { bg: "#0c0b0a", ink: "#f6f1e7", ink2: "#d9d2c4", sub: "#8b857a", accent: "#e23a2e", panel: "rgba(246,241,231,.06)", line: "rgba(246,241,231,.12)" };
}

function motionCss(theme) {
  return [
    `.visual-root{--accent:${theme.accent};--ink:${theme.ink};--ink2:${theme.ink2};--sub:${theme.sub};--panel:${theme.panel};--line:${theme.line};background:${theme.bg};color:${theme.ink};font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}`,
    `.scene{position:absolute;inset:0;padding:96px 80px 200px;display:flex;flex-direction:column;opacity:0;visibility:hidden;will-change:transform,opacity}`,
    `.sHead{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex:0 0 auto}`,
    `.sNo{font-size:150px;line-height:.7;font-weight:1000;color:var(--accent);letter-spacing:-.05em}`,
    `.sMeta{text-align:right;font-size:28px;font-weight:850;color:var(--sub);line-height:1.35}`,
    `.sMeta b{display:block;font-size:32px;color:var(--ink)}`,
    `.rule{height:10px;margin:28px 0 0;background:var(--accent);transform:scaleX(0);transform-origin:left center;border-radius:99px;flex:0 0 auto}`,
    // Center the content group: lists are substantial bordered cards, so the frame fills with only
    // modest symmetric breathing room — no asymmetric top gap, and no over-spread of light beats.
    `.sBody{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:26px;padding-top:8px}`,
    `.kick{font-size:32px;font-weight:950;letter-spacing:.14em;color:var(--accent);text-transform:uppercase}`,
    `.h{margin:0 0 4px;font-weight:1000;line-height:1.05;text-wrap:balance;color:var(--ink)}`,
    `.h.xl{font-size:110px}.h.lg{font-size:90px}.h.md{font-size:70px}`,
    `.lead{margin:0;font-size:42px;line-height:1.45;font-weight:600;color:var(--ink2)}`,
    `.lead.bar{padding-left:34px;border-left:10px solid var(--accent)}`,
    `.agenda{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:20px}`,
    `.agenda li{display:flex;align-items:center;gap:26px;background:var(--panel);border:2px solid var(--line);border-radius:22px;padding:28px 34px}`,
    `.agenda span{font-size:42px;font-weight:1000;color:var(--accent);min-width:78px}`,
    `.agenda p{margin:0;font-size:46px;font-weight:850;color:var(--ink);line-height:1.2}`,
    `.cols{display:flex;flex-direction:column;gap:24px}`,
    `.col{border:3px solid;border-radius:26px;padding:34px 38px;background:var(--panel)}`,
    `.col b{display:block;font-size:32px;font-weight:950;margin-bottom:16px}`,
    `.col p{margin:0;font-size:44px;line-height:1.32;font-weight:800;color:var(--ink)}`,
    `.col.wrong{border-color:#ef4444}.col.wrong b{color:#ff6b60}`,
    `.col.right{border-color:#22c55e}.col.right b{color:#34d27f}`,
    `.tags{display:flex;flex-wrap:wrap;gap:16px}`,
    `.tag{font-size:30px;font-weight:850;color:var(--ink2);background:var(--panel);border:2px solid var(--line);border-radius:99px;padding:12px 26px}`,
    `.steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:20px}`,
    `.steps li{display:grid;grid-template-columns:88px 1fr;gap:30px;align-items:center;background:var(--panel);border:2px solid var(--line);border-radius:24px;padding:28px 34px}`,
    `.steps b{font-size:68px;line-height:1;font-weight:1000;color:var(--accent);text-align:center}`,
    `.steps p{margin:0;font-size:42px;line-height:1.26;font-weight:850;color:var(--ink)}`,
    `.chips{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:20px}`,
    `.chips li{display:flex;align-items:center;gap:26px;background:var(--panel);border:2px solid var(--line);border-radius:22px;padding:26px 32px}`,
    `.chips i{width:24px;height:24px;border-radius:5px;background:var(--accent);flex:0 0 auto;transform:rotate(45deg)}`,
    `.chips p{margin:0;font-size:46px;font-weight:850;color:var(--ink);line-height:1.2}`,
    `.recap{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:20px}`,
    `.recap li{display:flex;align-items:center;gap:26px;background:var(--panel);border:2px solid var(--line);border-radius:22px;padding:28px 34px}`,
    `.recap span{font-size:40px;font-weight:1000;color:var(--accent);min-width:74px}`,
    `.recap p{margin:0;font-size:46px;font-weight:850;color:var(--ink);line-height:1.2}`,
    `.prompt{margin:0;font-size:40px;font-weight:900;color:var(--ink);background:var(--panel);border:2px solid var(--line);border-radius:22px;padding:28px 34px}`,
    `.foot{position:absolute;left:80px;right:80px;bottom:62px;display:flex;align-items:center;justify-content:space-between;color:var(--sub);font-size:26px;font-weight:800;z-index:5}`,
    `.dots{display:flex;gap:12px}`,
    `.pdot{width:16px;height:16px;border-radius:99px;background:var(--accent);opacity:.28}`,
    `[data-reveal]{opacity:0}`
  ].join("");
}

// Deterministic, frame-accurate timeline. The export renderer drives __seek(t) per frame (so motion
// is real, not a binary opacity cut); standalone browsers auto-play via requestAnimationFrame. No
// CSS animations are used, so the output is reproducible frame by frame.
function motionTimelineScript() {
  return "<script>(function(){"
    + "var scenes=[].slice.call(document.querySelectorAll('.scene'));"
    + "var dots=[].slice.call(document.querySelectorAll('.pdot'));"
    + "var N=scenes.length||1;globalThis.__sceneCount=N;globalThis.__coverT=N>0?(0.72/N):0;"
    + "function cl(x,a,b){return x<a?a:(x>b?b:x);}function eo(x){x=cl(x,0,1);return 1-Math.pow(1-x,3);}"
    + "function apply(s,p,on){"
    + "if(!on){s.style.opacity=0;s.style.visibility='hidden';return;}"
    + "var en=eo(p/0.16);s.style.visibility='visible';s.style.opacity=cl(en,0,1);s.style.transform='translateY('+((1-en)*30)+'px)';"
    + "var rv=s.querySelectorAll('[data-reveal]');for(var k=0;k<rv.length;k++){var idx=Number(rv[k].getAttribute('data-reveal'))||0;var rp=cl(eo((p-(0.05+idx*0.06))/0.12),0,1);rv[k].style.opacity=rp;rv[k].style.transform='translateY('+((1-rp)*24)+'px)';}"
    + "var gr=s.querySelectorAll('[data-grow]');for(var g=0;g<gr.length;g++){gr[g].style.transform='scaleX('+eo((p-0.04)/0.34)+')';}"
    + "}"
    + "function seek(t){t=cl(t,0,1);var pos=t*N;var ai=Math.min(N-1,Math.floor(pos>=N?N-1:pos));for(var i=0;i<N;i++){var on=(i===ai);apply(scenes[i],on?cl(pos-i,0,1):0,on);}for(var d=0;d<dots.length;d++){dots[d].style.opacity=(d===ai)?1:0.28;}}"
    + "globalThis.__seek=seek;seek(globalThis.__coverT);"
    + "var DUR=11000,HOLD=900,t0=null;"
    + "function tick(ts){if(globalThis.__controlled)return;if(t0===null)t0=ts;var e=ts-t0;var t=e<HOLD?globalThis.__coverT:cl((e-HOLD)/DUR,0,1);seek(t);if(e<HOLD+DUR+1600){requestAnimationFrame(tick);}else{seek(1);}}"
    + "requestAnimationFrame(tick);"
    + "})();</scr" + "ipt>";
}

export function renderContentMotionHtml(pack, plan, template) {
  const size = visualSize("9:16");
  const scenes = videoScenesFromPack(pack);
  const theme = motionTheme(`${template || plan?.templates?.["motion-video"] || ""} ${plan?.style || ""} ${plan?.styleLabel || ""}`);
  const sceneHtml = scenes.map((scene) => (
    `<section class="scene scene-${scene.kind}">`
    + `<div class="sHead"><div class="sNo">${scene.no}</div>`
    + `<div class="sMeta">${escapeHtml(scene.shot)}${scene.time ? `<b>${escapeHtml(scene.time)}</b>` : ""}</div></div>`
    + `<div class="rule" data-grow></div>`
    + `<div class="sBody">${renderMotionSceneBody(scene)}</div>`
    + `</section>`
  )).join("");
  const dots = scenes.map(() => `<i class="pdot"></i>`).join("");

  return baseHtml({
    title: `${pack.title} motion`,
    size,
    background: theme.bg,
    body: {
      css: motionCss(theme),
      html: `<main class="visual-root" ${hyperframesRootAttrs({ pack, size, template })}>${sceneHtml}`
        + `<div class="foot"><span>${escapeHtml(plan?.styleLabel || pack.core || "")}</span><div class="dots">${dots}</div></div>`
        + `</main>${motionTimelineScript()}`
    }
  });
}

export function renderMotionHtml(pack, plan) {
  const template = plan?.templates?.["motion-video"] || resolveVisualTemplate(pack, "motion-video", plan?.style);
  // Real product screenshots get the dedicated storyboard (each frame shows the actual UI). Every
  // other style routes through the dense, full-frame, animated content renderer — the old hollow
  // placeholder renderers (decorative empty boxes) are no longer used for video.
  if (template === "product-storyboard" && hasEvidenceAssets(pack)) {
    return renderProductStoryboardMotionHtml(pack, plan, template);
  }
  return renderContentMotionHtml(pack, plan, template);
}

export function buildExplainAnimationManifest(pack, platform = "bilibili") {
  return {
    type: "explain_animation",
    engine: "motion-canvas",
    status: "template_ready",
    platform,
    templateId: "concept-flow",
    sourceFile: `${pack.id}-motion-canvas.tsx`,
    concepts: pack.cards.slice(0, 4).map((card) => ({ name: card.eyebrow, description: card.headline })),
    complexityScore: Math.min(88, 52 + pack.cards.length * 5),
    next: "Use Codex/local renderer to materialize this manifest into a Motion Canvas project when the toolchain is installed."
  };
}

export function buildReactVideoManifest(pack, platform = "linkedin") {
  return {
    type: "react_video",
    engine: "remotion",
    status: "enterprise_template_ready",
    platform,
    compositionId: "brand-report-video",
    templateId: "content-pack-report",
    duration: 45,
    ratio: platform === "linkedin" ? "16:9" : "9:16",
    licenseWarning: "Remotion commercial usage may require license review before enterprise deployment.",
    sections: pack.cards.slice(0, 5).map((card) => ({ title: card.headline, body: card.body })),
    next: "Render only after Remotion license and local/cloud render setup are configured."
  };
}
