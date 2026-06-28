export const CREDIT_PLANS = [
  {
    id: "free",
    name: "Free",
    price: "¥0",
    monthlyCredits: 1000,
    audience: "试用用户 / 本地 demo",
    features: ["素材工厂基础生成", "本地 fallback", "带额度限制", "高级自动化只读体验"]
  },
  {
    id: "creator",
    name: "Creator",
    price: "¥69/月",
    monthlyCredits: 3000,
    audience: "个人创作者 / 小红书博主",
    features: ["无水印导出", "标准生图/图文额度", "Preview Hub", "草稿发布助手"]
  },
  {
    id: "studio",
    name: "Studio",
    price: "¥199/月",
    monthlyCredits: 10000,
    audience: "小团队 / MCN / 代运营",
    features: ["团队 workspace", "批量生成", "Autopilot", "互动监控", "优先队列"]
  },
  {
    id: "agency",
    name: "Agency",
    price: "定制",
    monthlyCredits: 50000,
    audience: "多客户代理商 / 企业",
    features: ["多品牌空间", "私有模型配置", "审计日志", "API 接入", "专属部署"]
  }
];

const BASE_COSTS = {
  text: 5,
  social_pack: 5,
  carousel: 10,
  image: 20,
  poster: 20,
  ad: 24,
  video: 100
};

const PRESET_MULTIPLIER = {
  cheap: 0.75,
  balanced: 1,
  quality: 1.6,
  fast: 1.15
};

export function estimateCredits(input = {}) {
  const assetType = input.assetType || "carousel";
  const preset = input.modelPreset || input.preset || "balanced";
  const count = Math.max(1, Math.min(12, Number(input.count || 1)));
  const duration = Math.max(6, Math.min(90, Number(input.duration || 12)));
  const base = BASE_COSTS[assetType] || BASE_COSTS.carousel;
  const multiplier = PRESET_MULTIPLIER[preset] || 1;
  const videoExtra = assetType === "video" ? Math.ceil(Math.max(0, duration - 10) / 5) * 18 : 0;
  const batchExtra = assetType === "image" || assetType === "poster" || assetType === "ad" ? Math.max(0, count - 1) * Math.ceil(base * 0.65) : 0;
  const credits = Math.max(1, Math.ceil((base + videoExtra + batchExtra) * multiplier));
  return {
    credits,
    assetType,
    preset,
    count,
    duration,
    breakdown: { base, multiplier, videoExtra, batchExtra }
  };
}

export function creditSummary(account, ledger = []) {
  const balance = Number(account?.balance || 0);
  const reserved = Number(account?.reserved_credits || account?.reservedCredits || 0);
  return {
    plan: account?.plan || "free",
    balance,
    reservedCredits: reserved,
    availableCredits: Math.max(0, balance - reserved),
    includedMonthlyCredits: Number(account?.included_monthly_credits || account?.includedMonthlyCredits || 1000),
    purchasedCredits: Number(account?.purchased_credits || account?.purchasedCredits || 0),
    recentLedger: ledger
  };
}
