import { describe, expect, it, vi } from "vitest";
import {
  buildAgentRunbook,
  buildCommentMaintenanceTask,
  buildPack,
  buildResearchBrief,
  buildSourceItems,
  buildTopicCandidates,
  createSystemPrompt,
  detectDomain,
  renderHtmlDeck
} from "./contentEngine.js";
import { getStoredEvents, trackEvent } from "./analytics.js";
import {
  buildChartSpec,
  buildVisualPlan,
  templateSourceCatalog,
  renderInfoCardHtml,
  renderMotionHtml,
  renderSatoriLikeCoverHtml,
  renderXhsCarouselHtml,
  visualStyleCatalog
} from "./visualEngine.js";

describe("detectDomain", () => {
  it("detects core creator domains", () => {
    expect(detectDomain("用 Claude 做 Agent 工作流")).toBe("ai");
    expect(detectDomain("面试问为什么离职")).toBe("career");
    expect(detectDomain("减脂餐和跑步计划")).toBe("fitness");
  });
});

describe("buildPack", () => {
  it("builds a complete commercial content pack", () => {
    const pack = buildPack("用 Claude 做一个能自己跑活的小红书账号", "insight", "balanced", 1, "目标用户是个人创作者");

    expect(pack.cards).toHaveLength(6);
    expect(pack.videoFrames.length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(pack.platformCopy)).toContain("xhs");
    expect(Object.keys(pack.platformCopy)).toContain("linkedin");
    expect(pack.titleCandidates).toHaveLength(3);
    expect(pack.policy.rules).toContain("最终发布需人工确认");
    expect(pack.automationPrompt).toContain("不要点击最终发布");
  });

  it("overlays real-model creative content through the formatting + sanitize pipeline", () => {
    const creative = {
      title: "模型给的标题",
      titleCandidates: ["候选一", "候选二", "候选三"],
      claims: ["模型判断一 https://secret.example.com", "模型判断二"],
      antiPattern: "模型反例",
      playbook: ["模型步骤一", "模型步骤二"],
      cards: [{ eyebrow: "钩子", headline: "模型卡片标题", body: "模型卡片正文" }]
    };
    const pack = buildPack("AI Agent 自动化自媒体", "insight", "balanced", 1, "", { creative });

    expect(pack.version).toBe("0.4-model");
    expect(pack.title).toBe("模型给的标题");
    expect(pack.cards).toHaveLength(6); // model card 1 overlaid, rest padded from deterministic
    expect(pack.cards[0].headline).toBe("模型卡片标题");
    expect(pack.claims).toHaveLength(3); // padded to 3 so downstream claims[2] is defined
    // private URLs in model output are still scrubbed by sanitizePublicCopy
    expect(pack.claims[0]).not.toContain("secret.example.com");
    expect(Object.keys(pack.platformCopy)).toContain("xhs");
  });

  it("is unchanged when no creative override is provided", () => {
    const base = buildPack("AI Agent 自动化自媒体", "insight", "balanced", 1, "");
    expect(base.version).toBe("0.3-local");
  });

  it("adds a comment-driven discussion hook to Xiaohongshu content", () => {
    const pack = buildPack("Mac 统一内存对比 NVIDIA 显卡在本地模型部署的差异", "insight", "balanced", 1, "");

    const lastCard = pack.cards.at(-1);
    expect(lastCard.eyebrow === "推荐方案" || /本地|混合/.test(lastCard.headline)).toBe(true);
    expect(pack.platformCopy.xhs.body).toMatch(/评论区|下一期/);
    expect(pack.videoFrames.at(-1).overlay).toMatch(/混合路由|下一期|互动/);
    expect(pack.videoFrames.at(-1).voice).toMatch(/云端|下一期|本地/);
  });

  it("changes outputs by domain instead of only stitching words", () => {
    const ai = buildPack("AI Agent 自动化自媒体", "howto", "expert", 2, "");
    const career = buildPack("简历里写负责项目为什么没感觉", "howto", "expert", 2, "");

    expect(ai.domain).toBe("ai");
    expect(career.domain).toBe("career");
    expect(ai.cards[2].body).not.toEqual(career.cards[2].body);
  });

  it("builds an agent-first browser runbook", () => {
    const pack = buildPack("用 Claude 做一个能自己跑活的小红书账号", "insight", "balanced", 1, "");
    const runbook = buildAgentRunbook({ pack, platforms: ["xhs", "x"], mode: "schedule", scheduledAt: "今晚 20:30" });

    expect(runbook.version).toBe("0.5-codex-local");
    expect(runbook.executor).toBe("agent-controller");
    expect(runbook.controller).toBe("codex-app-local");
    expect(runbook.tasks).toHaveLength(2);
    expect(runbook.tasks[0].executor).toBe("agent-controller");
    expect(runbook.tasks[0].requiresLoggedInBrowser).toBe(true);
    expect(runbook.tasks[0].safety.allowedFinalPublish).toBe(true);
    expect(runbook.tasks[0].forbiddenActions).toContain("不要尝试绕过验证码");
    expect(runbook.agentContract.runtime).toContain("Mac local browser");
    expect(runbook.agentContract.codexRole).toContain("orchestrate_agents");
  });

  it("builds a comment maintenance task", () => {
    const task = buildCommentMaintenanceTask({ platform: "xhs", publishUrl: "https://www.xiaohongshu.com/explore/test", maxReplies: 6 });

    expect(task.type).toBe("browser_comment_maintenance_task");
    expect(task.executor).toBe("agent-controller");
    expect(task.controller).toBe("codex-app-local");
    expect(task.replyPolicy.maxReplies).toBe(6);
    expect(task.replyPolicy.highRiskRequiresHuman).toBe(true);
    expect(task.outputs).toContain("topic_candidates");
  });

  it("uses product-specific, less templated copy for personal product topics", () => {
    const pack = buildPack("Leonote 个人 note 产品概览，13年商业及增长岗位手搓产品分享", "insight", "human", 1, "隐藏域名、服务器地址和账号信息，只展示功能截图");

    expect(pack.cards[0].eyebrow).toBe("产品实景");
    expect(pack.cards[0].body).toContain("公开可展示");
    expect(pack.platformCopy.xhs.body).not.toContain("赋能");
    expect(pack.platformCopy.xhs.body).not.toContain("服务器地址");
    expect(pack.videoFrames[0].visual).toContain("产品首页截图");
  });

  it("removes unsafe public terms before generating publish copy", () => {
    const unsafePhrase = ["亚洲", "AV"].join("");
    const pack = buildPack(`Leonote ${unsafePhrase} 测试`, "insight", "human", 1, "不要出现色情或服务器地址");
    const serialized = JSON.stringify({
      core: pack.core,
      title: pack.title,
      cards: pack.cards,
      videoFrames: pack.videoFrames,
      platformCopy: pack.platformCopy
    });

    expect(serialized).not.toContain(unsafePhrase);
    expect(serialized).not.toContain("色情");
    expect(serialized).not.toContain("服务器地址");
    expect(serialized).toContain("[不适合公开内容]");

    const prompt = createSystemPrompt({
      topic: `Leonote ${unsafePhrase} 测试`,
      direction: "insight",
      tone: "human",
      extraContext: "不要出现色情或服务器地址"
    });
    expect(prompt).not.toContain(unsafePhrase);
    expect(prompt).not.toContain("色情");
    expect(prompt).not.toContain("服务器地址");
  });

  it("builds research sources, briefs, and topic candidates", () => {
    const sourceItems = buildSourceItems({ topic: "Codex app 自动运营小红书" });
    const brief = buildResearchBrief({ topic: "Codex app 自动运营小红书", sourceItems });
    const topics = buildTopicCandidates({ brief, limit: 3 });

    expect(sourceItems.length).toBeGreaterThan(0);
    expect(sourceItems[0]).toHaveProperty("clean_markdown");
    expect(brief.sources).toHaveLength(sourceItems.length);
    expect(topics).toHaveLength(3);
    expect(topics[0]).toHaveProperty("score_json");
  });

  it("renders an HTML card deck", () => {
    const pack = buildPack("用 Claude 做一个能自己跑活的小红书账号", "insight", "balanced", 1, "");
    const html = renderHtmlDeck(pack, "xhs");

    expect(html).toContain("<!doctype html>");
    expect(html).toContain(pack.title);
    expect(html).toContain("class=\"deck\"");
  });
});

describe("local analytics", () => {
  it("ignores malformed stored events", () => {
    const storage = new Map([["agent-studio-events", JSON.stringify({ bad: true })]]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value)
      }
    });

    expect(getStoredEvents()).toEqual([]);
    trackEvent("pack.generated", { source: "test" });

    expect(getStoredEvents()).toHaveLength(1);
    expect(getStoredEvents()[0].name).toBe("pack.generated");
    vi.unstubAllGlobals();
  });
});

describe("visualEngine", () => {
  it("keeps long cover titles inside the generated template", () => {
    const pack = buildPack("这是一个很长很长的中文标题用来测试小红书封面不会把文字压到引用区域或者直接溢出画布", "insight", "balanced", 1, "");
    const plan = buildVisualPlan(pack, "xhs", "cover", { style: "swiss-modern" });
    const html = renderSatoriLikeCoverHtml(pack, plan);

    expect(html).toContain("is-extra-long");
    expect(html).toContain("-webkit-line-clamp:6");
  });

  it("clips decorative info-card ovals inside their diagram frame", () => {
    const pack = buildPack("用 Claude 做一个能自己跑活的小红书账号", "insight", "balanced", 1, "");
    const plan = buildVisualPlan(pack, "xhs", "info-card", { style: "swiss-modern" });
    const html = renderInfoCardHtml(pack, plan);

    expect(html).toContain(".diagram{height:218px;position:relative;opacity:.72;overflow:hidden}");
  });

  it("labels generated chart data as agent-derived rather than factual platform analytics", () => {
    const pack = buildPack("用 Claude 做一个能自己跑活的小红书账号", "insight", "balanced", 1, "");
    const chart = buildChartSpec(pack);

    expect(chart.note).toContain("不等同于平台真实统计数据");
  });

  it("absorbs requested external template sources into the visual style library", () => {
    const ids = templateSourceCatalog.map((source) => source.id);

    expect(ids).toContain("tabler");
    expect(ids).toContain("sneat");
    expect(ids).toContain("star-admin");
    expect(ids).toContain("startbootstrap");
    expect(ids).toContain("html5up");
    expect(ids).toContain("github-free-admin-topic");
    expect(ids).toContain("github-html-template-topic");
    expect(ids).toContain("baoyu-recipes");
    expect(visualStyleCatalog["admin-tabler"].sourceIds).toContain("tabler");
    expect(visualStyleCatalog["xhs-product-real-scene"].recipe.id).toBe("xhs-product-real-scene");
  });

  it("renders different template families for the same content", () => {
    const pack = buildPack("Mac 统一内存对比 NVIDIA 显卡在本地模型部署的差异", "insight", "balanced", 1, "");
    const tablerPlan = buildVisualPlan(pack, "xhs", "info-card", { style: "admin-tabler" });
    const html5upPlan = buildVisualPlan(pack, "xhs", "info-card", { style: "html5up-editorial" });
    const motionPlan = buildVisualPlan(pack, "xhs", "motion-video", { style: "startbootstrap-landing" });

    expect(renderInfoCardHtml(pack, tablerPlan)).toContain("dashboard pattern library");
    expect(renderInfoCardHtml(pack, html5upPlan)).toContain("EDITORIAL SYSTEM");
    const motionHtml = renderMotionHtml(pack, motionPlan);
    expect(motionHtml).toContain('class="scene');
    expect(motionHtml).toContain("别二选一");
    expect(motionHtml).toContain("混合路由");
  });

  it("renders a mobile-safe six-card XHS carousel shell", () => {
    const pack = buildPack("DeepSeek v4 登顶 token 消耗榜 top1", "trend", "sharp", 1, "");
    const plan = buildVisualPlan(pack, "xhs", "xhs-carousel", { style: "html5up-editorial" });
    const html = renderXhsCarouselHtml(pack, plan);

    expect(html.match(/class="xhs-card/g)).toHaveLength(6);
    expect(html).toContain("width:1080px;height:1440px");
    expect(html).toContain("padding:80px");
    expect(html).toContain("font-size:88px");
  });

  it("renders product-real-scene assets with recipe QA metadata", () => {
    const pack = {
      ...buildPack("Leonote 个人 note 产品概览", "insight", "human", 1, "产品截图优先"),
      localAssets: ["/tmp/leonote-shot.png"]
    };
    const plan = buildVisualPlan(pack, "xhs", "xhs-carousel", { style: "xhs-product-real-scene" });
    const html = renderXhsCarouselHtml(pack, plan);

    expect(plan.recipe.id).toBe("xhs-product-real-scene");
    expect(plan.assets[0].qaRules).toContain("screenshot-visible");
    expect(html).toContain("data-recipe=\"product-real-scene\"");
    expect(html).toContain("file:///tmp/leonote-shot.png");
    expect(html).toContain("object-fit:contain");
    expect(html).not.toContain("object-fit:cover");
    expect(html).not.toContain("榜单是热力图");
    expect(html).not.toContain("测试期偏高");
  });
});
