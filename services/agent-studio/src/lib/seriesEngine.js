import { directionLibrary, platformMeta, toneProfiles } from "./catalog.js";
import { buildPack, hash } from "./contentEngine.js";
import { visualStyleCatalog } from "./visualEngine.js";

function clean(value, max = 400) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function pickDefaultVisualStyle(title) {
  const candidates = [
    "xhs-product-real-scene",
    "xhs-dense-infographic",
    "xhs-process-storyboard",
    "admin-tabler",
    "admin-sneat",
    "startbootstrap-landing",
    "html5up-editorial",
    "editorial-magazine",
    "product-ui",
    "swiss-modern",
    "kinetic-pitch"
  ];
  return candidates[hash(title || "series") % candidates.length];
}

function lastMeaningfulEpisode(series) {
  return [...(series.episodes || [])]
    .filter((episode) => episode.status !== "archived")
    .sort((a, b) => Number(b.index || 0) - Number(a.index || 0))[0] || null;
}

export function normalizeSeriesProfile(input = {}, existing = {}) {
  const title = clean(input.title ?? existing.title ?? "", 120);
  const visualStyle = input.visualStyle || existing.visualStyle || pickDefaultVisualStyle(title);
  return {
    title,
    description: clean(input.description ?? existing.description ?? "", 800),
    platform: input.platform || existing.platform || "xhs",
    direction: directionLibrary.some((item) => item.id === input.direction) ? input.direction : existing.direction || "insight",
    tone: Object.prototype.hasOwnProperty.call(toneProfiles, input.tone) ? input.tone : existing.tone || "balanced",
    visualStyle: visualStyleCatalog[visualStyle] ? visualStyle : "auto-diverse",
    accountLabel: clean(input.accountLabel ?? existing.accountLabel ?? "Leo", 80) || "Leo",
    status: input.status || existing.status || "active",
    cadence: clean(input.cadence ?? existing.cadence ?? "3-7 posts", 80),
    seedTopics: Array.isArray(input.seedTopics)
      ? input.seedTopics.map((topic) => clean(topic, 160)).filter(Boolean).slice(0, 30)
      : Array.isArray(existing.seedTopics) ? existing.seedTopics : []
  };
}

export function buildSeriesContext(series, topic, notes = "") {
  const previous = lastMeaningfulEpisode(series);
  const episodeNo = (series.episodes || []).length + 1;
  const previousLine = previous
    ? `上一期「${previous.title}」的结论：${previous.recap || previous.core || "已完成铺垫"}。`
    : "这是系列开篇，需要先建立读者为什么要持续看下去。";
  const bridge = previous
    ? `接上上一期，这一篇从「${previous.title}」往下走，解决「${clean(topic, 120)}」。`
    : `这是「${series.title}」第 1 期，用来建立系列主问题和观看预期。`;
  const nextHook = `下一期继续沿着「${series.title}」往下拆，优先回答评论区和私信里的高频问题。`;

  return {
    episodeNo,
    previous,
    previousLine,
    bridge,
    nextHook,
    extraContext: [
      `系列名称：${series.title}`,
      series.description ? `系列定位：${series.description}` : "",
      `统一平台：${platformMeta[series.platform]?.name || series.platform}`,
      `统一视觉风格：${visualStyleCatalog[series.visualStyle]?.label || series.visualStyle}`,
      previousLine,
      `本期承接：${bridge}`,
      notes ? `本期备注：${clean(notes, 600)}` : "",
      "输出要求：标题、正文、卡片和视频分镜必须能接上上一期，避免每期像孤立文章；保留系列名、期数、前情摘要和下一期钩子。"
    ].filter(Boolean).join("\n")
  };
}

export function buildSeriesEpisodePack({ series, topic, notes = "", generation = Date.now() }) {
  const normalized = normalizeSeriesProfile(series, series);
  const context = buildSeriesContext({ ...series, ...normalized }, topic, notes);
  const pack = buildPack(
    topic,
    normalized.direction,
    normalized.tone,
    generation,
    context.extraContext
  );
  const titlePrefix = `第${context.episodeNo}期`;
  const seriesTitle = clean(normalized.title, 40);
  const episodeTitle = pack.title.length > 54 ? pack.title : `${titlePrefix}｜${pack.title}`;
  const seriesTag = seriesTitle.replace(/[^\p{Script=Han}\p{Letter}\p{Number}]+/gu, "").slice(0, 16) || "系列内容";

  const cards = pack.cards.map((card, index) => {
    if (index === 0) {
      return {
        ...card,
        eyebrow: `${titlePrefix} · ${card.eyebrow}`,
        body: `${context.bridge}\n\n${card.body}`
      };
    }
    if (index === pack.cards.length - 1) {
      return {
        ...card,
        headline: "下一期继续接上",
        body: `${card.body}\n\n${context.nextHook}`
      };
    }
    return card;
  });

  const platformCopy = Object.fromEntries(Object.entries(pack.platformCopy).map(([platform, copy]) => {
    const body = [
      `「${normalized.title}」${titlePrefix}`,
      context.previousLine,
      "",
      copy.body,
      "",
      context.nextHook
    ].join("\n");
    return [platform, {
      ...copy,
      title: platform === "xhs" ? `${titlePrefix}｜${copy.title}`.slice(0, 20) : `${titlePrefix}｜${copy.title}`,
      body,
      tags: Array.from(new Set([seriesTag, ...(copy.tags || [])])).slice(0, 10)
    }];
  }));

  return {
    ...pack,
    title: episodeTitle,
    cards,
    platformCopy,
    series: {
      id: series.id || "",
      title: normalized.title,
      episodeNo: context.episodeNo,
      visualStyle: normalized.visualStyle,
      bridge: context.bridge,
      previousEpisodeId: context.previous?.id || null,
      previousLine: context.previousLine,
      nextHook: context.nextHook
    }
  };
}

export function summarizeSeriesEpisode({ series, pack, topic }) {
  const firstClaim = pack.claims?.[0] || pack.cards?.[0]?.headline || topic;
  return {
    title: clean(topic || pack.core, 160),
    core: pack.core,
    recap: clean(firstClaim, 220),
    bridge: pack.series?.bridge || "",
    nextHook: pack.series?.nextHook || `下一期继续沿着「${series.title}」往下拆。`,
    visualStyle: pack.series?.visualStyle || series.visualStyle
  };
}
