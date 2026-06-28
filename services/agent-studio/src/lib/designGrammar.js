export const designGrammarSources = [
  {
    id: "frontend-slides-editable",
    source: "https://github.com/archlizheng/frontend-slides-editable",
    absorbed: [
      "preset fidelity: layout grammar matters more than color tokens",
      "slot-safe template ports: keep structural grids and decorations locked",
      "viewport fitting: no scrolling or content cramming",
      "show-dont-tell: validate visual direction with rendered previews"
    ]
  },
  {
    id: "huashu-design",
    source: "/Users/leoyuan/.claude/skills/huashu-design",
    absorbed: [
      "HTML is an execution tool, not the medium",
      "choose the expert role by output type: infographic, deck, prototype, or motion",
      "use precise information architecture for data and social infographics",
      "motion should have weight, pauses, and a Slow-Fast-Boom-Stop rhythm"
    ]
  },
  {
    id: "html-anything",
    source: "https://github.com/nexu-io/html-anything",
    absorbed: [
      "HTML is the reader-facing artifact, not a markdown intermediate",
      "skill templates are selected by mode and scenario",
      "social exports need platform-shaped aspect ratios and screenshots",
      "Hyperframes-compatible output should expose frame duration and transition metadata",
      "XHS carousel cards should carry one core point per card and stay within platform image limits"
    ]
  }
];

export const xhsDesignPrinciples = [
  { key: "whitespace", label: "留白", note: "留白不是装饰，而是一种取舍。" },
  { key: "alignment", label: "对齐", note: "对齐不是规则，是秩序。" },
  { key: "type-control", label: "控字", note: "限制字体选择，画面才稳定。" },
  { key: "hierarchy", label: "层级", note: "层级是在回答：你希望别人先看到什么。" },
  { key: "spacing", label: "间距", note: "字、行、模块之间的距离决定质感。" }
];

export const socialVisualPresets = {
  swissModern: {
    label: "Swiss Modern",
    source: "frontend-slides-editable / Swiss Modern",
    fit: ["cover", "info-card", "carousel"],
    palette: {
      paper: "#f6f4ed",
      ink: "#111310",
      muted: "#5f6259",
      accent: "#ff3300",
      line: "rgba(17,19,16,.24)"
    },
    typography: {
      display: "Archivo, Arial Black, sans-serif",
      body: "Nunito, PingFang SC, Microsoft YaHei, sans-serif"
    },
    grammar: [
      "visible grid",
      "large asymmetric numbers",
      "single red or black accent bar",
      "strict horizontal alignment"
    ]
  },
  rawGridManual: {
    label: "Raw Grid Manual",
    source: "XHS tutorial screenshots + Huashu Fathom/Muller-Brockmann",
    fit: ["infographic", "tutorial-card", "long-card"],
    palette: {
      paper: "#eef0e6",
      ink: "#161914",
      muted: "#596052",
      accent: "#8fab8b",
      warm: "#d3b177",
      line: "rgba(22,25,20,.22)"
    },
    typography: {
      display: "Arial Black, Impact, PingFang SC, sans-serif",
      body: "PingFang SC, Microsoft YaHei, sans-serif",
      mono: "JetBrains Mono, ui-monospace, monospace"
    },
    grammar: [
      "technical paper grid",
      "theory module blocks",
      "barcode and crop marks",
      "diagram-first explanation"
    ]
  },
  experimentalJetset: {
    label: "Experimental Jetset",
    source: "Huashu design-styles / Experimental Jetset",
    fit: ["cover", "motion"],
    palette: {
      black: "#080806",
      white: "#f7f2e8",
      red: "#e23a2e",
      blue: "#1f4ed8",
      yellow: "#f0d547"
    },
    typography: {
      display: "Arial Black, Helvetica, PingFang SC, sans-serif",
      body: "Helvetica, PingFang SC, sans-serif"
    },
    grammar: [
      "typography as image",
      "one visual metaphor per card",
      "high contrast",
      "geometry only, no decoration"
    ]
  },
  huashuMotion: {
    label: "Huashu Motion",
    source: "huashu-design / animation-best-practices",
    fit: ["motion-video"],
    rhythm: ["S1 trigger", "S2 generate", "S3 process", "S4 boom", "S5 hold"],
    grammar: [
      "weighted objects",
      "human-readable pause before key result",
      "no linear motion",
      "final frame holds instead of fading away"
    ]
  },
  xhsPastelCarousel: {
    label: "XHS Pastel Carousel",
    source: "html-anything / card-xiaohongshu + deck-xhs-post",
    fit: ["carousel", "xhs-card", "instagram-card"],
    aspect: "1080x1440",
    maxCards: 18,
    recommendedCards: 9,
    palette: {
      cream: "#f8f3ea",
      peach: "#f2d6c8",
      sage: "#c7d8c4",
      lavender: "#d9d1ec",
      ink: "#22201c"
    },
    typography: {
      display: "PingFang SC, Microsoft YaHei, sans-serif",
      body: "PingFang SC, Microsoft YaHei, sans-serif"
    },
    grammar: [
      "cover plus content pages plus CTA",
      "one core point per card",
      "large mobile-readable type",
      "bottom page dots",
      "small watermark and date"
    ]
  },
  htmlAnythingSwiss: {
    label: "HTML Anything Swiss International",
    source: "html-anything / deck-swiss-international",
    fit: ["deck", "analysis-card", "methodology-carousel"],
    aspect: "16:9 or adapted 3:4",
    palette: {
      kleinBlue: "#002FA7",
      lemon: "#FFD500",
      mint: "#C5E803",
      safetyOrange: "#FF6B35",
      paper: "#fafaf8",
      ink: "#0a0a0a"
    },
    grammar: [
      "16-column grid",
      "locked layout pool rather than ad hoc cards",
      "one saturated accent, no gradients",
      "1px hairline borders",
      "no shadows, no blur, no rounded corners"
    ]
  },
  magazinePoster: {
    label: "Magazine Poster",
    source: "html-anything / magazine-poster",
    fit: ["long-poster", "article-visual", "xhs-long-card"],
    palette: {
      paper: "#f5f3ee",
      ink: "#1a1a1a",
      muted: "#67645d"
    },
    typography: {
      display: "Playfair Display, Georgia, serif",
      body: "IBM Plex Serif, Source Serif 4, serif",
      mono: "JetBrains Mono, ui-monospace, monospace"
    },
    grammar: [
      "dateline top bar",
      "oversized serif headline",
      "two-column body",
      "numbered sections",
      "pull quote and signature footer"
    ]
  },
  nytDataFrame: {
    label: "NYT Data Chart Frame",
    source: "html-anything / frame-data-chart-nyt",
    fit: ["chart", "video-frame", "report-card"],
    aspect: "1920x1080",
    palette: {
      paper: "#f7f5ee",
      ink: "#0e0e0e",
      red: "#a91d1d",
      mint: "#5fb38a",
      warmOrange: "#d97757"
    },
    grammar: [
      "kicker with source and category",
      "editorial headline distilled from data",
      "hand-authored SVG charts",
      "3-4 hairline ticks",
      "source and footnote at bottom"
    ]
  },
  hyperframesVideo: {
    label: "Hyperframes Video",
    source: "html-anything / video-hyperframes",
    fit: ["motion-video", "remotion", "video-script"],
    aspect: "1920x1080",
    grammar: [
      "6-10 frame sections",
      "one shot or concept per frame",
      "duration and transition comments",
      "autoplay with keyboard navigation",
      "HYPERFRAMES_META JSON footer"
    ]
  }
};

export function getSocialVisualPreset(key = "rawGridManual") {
  return socialVisualPresets[key] || socialVisualPresets.rawGridManual;
}
