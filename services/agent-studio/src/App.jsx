import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clipboard,
  Clock,
  Copy,
  DatabaseZap,
  Download,
  ExternalLink,
  FileJson,
  Film,
  Flame,
  Gauge,
  Globe,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  Loader2,
  Lock,
  MessageSquareText,
  MousePointerClick,
  Pause,
  PenLine,
  Play,
  Plug,
  Plus,
  Radar,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wand2,
  X,
  Zap
} from "lucide-react";
import {
  agentStages,
  apiSlots,
  databaseTables,
  directionLibrary,
  platformMeta,
  pricingTiers,
  roadmapItems,
  rubric,
  toneProfiles
} from "./lib/catalog.js";
import { buildPack, cleanTopic, createSystemPrompt, svgForPack } from "./lib/contentEngine.js";
import { templateSourceCatalog, visualStyleCatalog } from "./lib/visualEngine.js";
import { PlatformIcon } from "./components/PlatformIcon.jsx";
import {
  collectAnalytics,
  collectResearch,
  addSeriesEpisode,
  createAnalyticsBrief,
  createCodexRunbook,
  createSeriesProfile,
  createDraftTask,
  createResearchBrief,
  createTopicCandidates,
  addAutopilotTopic,
  exportPngDeck,
  generateXhsCarouselAsset,
  getAutopilot,
  generateCoverAsset,
  reportTemplateOutcome,
  generateInfoCardAsset,
  generateChartAsset,
  generateMotionHtmlAsset,
  exportVideoAsset,
  generateExplainAnimationAsset,
  generateReactVideoAsset,
  generatePack,
  getEngagement,
  getSeries,
  healthCheck,
  listPendingCodexTasks,
  queueEngagementCheck,
  queueSeriesEpisode,
  renderHtmlDeckAsset,
  runGraphicSmokeTest,
  runAutopilotTick,
  clearAutopilotPlans,
  saveAnalyticsLearning,
  saveAutopilotSettings,
  saveEngagementSettings,
  queueAutopilotSlot,
  updateAutopilotTopic
} from "./lib/apiClient.js";
import { getStoredEvents, trackEvent } from "./lib/analytics.js";
import { collectPreviewImageUrls, toExportUrl } from "./lib/exportUrl.js";
import { TemplateGallery } from "./components/TemplateGallery.jsx";
import { loadTemplatePrefs, resolveStyleForPack } from "./lib/templateRegistry.js";
import { buildTemplateApiPayload } from "./lib/templateApiPayload.js";
import * as Views from "./views/AllViews.jsx";
import { PreviewHub } from "./views/PreviewHub.jsx";

const iconMap = {
  Flame,
  Layers,
  Target,
  Zap,
  MessageSquareText,
  Sparkles,
  Globe,
  ImageIcon,
  Film,
  TrendingUp,
  BarChart3
};

const viewLabels = {
  research: "Research",
  studio: "Studio",
  preview: "Preview Hub",
  assets: "Visual Studio",
  publish: "Publish",
  autopilot: "Autopilot",
  series: "Series",
  engagement: "Engagement",
  review: "Review",
  api: "API",
  business: "Business",
  factory: "Material Factory"
};

const defaultView = "studio";
const viewRoutes = {
  research: "research",
  studio: "studio",
  preview: "preview",
  assets: "visual-studio",
  publish: "publish",
  autopilot: "autopilot",
  series: "series",
  engagement: "engagement",
  review: "review",
  api: "api",
  business: "business",
  factory: "factory"
};
const routeViews = Object.fromEntries(Object.entries(viewRoutes).map(([view, route]) => [route, view]));

function normalizeRoute(value = "") {
  return String(value)
    .replace(/^#/, "")
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .trim()
    .toLowerCase();
}

function viewFromLocation() {
  if (typeof window === "undefined") return defaultView;
  const hashRoute = normalizeRoute(window.location.hash);
  if (routeViews[hashRoute]) return routeViews[hashRoute];
  const pathRoute = normalizeRoute(window.location.pathname);
  if (routeViews[pathRoute]) return routeViews[pathRoute];
  return defaultView;
}

function viewHref(view) {
  return `#/${viewRoutes[view] || viewRoutes[defaultView]}`;
}

function writeViewHash(view, { replace = false } = {}) {
  if (typeof window === "undefined") return;
  const href = viewHref(view);
  if (window.location.hash === href) return;
  const nextUrl = `${window.location.pathname}${window.location.search}${href}`;
  if (replace) {
    window.history.replaceState({ view }, "", nextUrl);
  } else {
    window.history.pushState({ view }, "", nextUrl);
  }
}

function MiniIcon({ name, size = 14 }) {
  const Comp = iconMap[name] || Circle;
  return <Comp size={size} />;
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function nowLabel() {
  const ts = new Date();
  return `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}:${String(ts.getSeconds()).padStart(2, "0")}`;
}

function scoreTier(score) {
  const n = Number(score) || 0;
  if (n >= 90) return "excellent";
  if (n >= 80) return "good";
  if (n >= 65) return "warn";
  return "risk";
}

export default function App() {
  const [topic, setTopic] = useState("用 Claude 做一个能自己跑活的小红书账号");
  const [direction, setDirection] = useState("insight");
  const [tone, setTone] = useState("balanced");
  const [extraContext, setExtraContext] = useState("");
  const [generation, setGeneration] = useState(1);
  const [generatedPack, setGeneratedPack] = useState(null);
  const [platform, setPlatform] = useState("xhs");
  const [activeFrame, setActiveFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [toast, setToast] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishStatus, setPublishStatus] = useState("idle");
  const [draftTask, setDraftTask] = useState(null);
  const [agentStep, setAgentStep] = useState(-1);
  const [agentRunning, setAgentRunning] = useState(false);
  const [streamSource, setStreamSource] = useState("local");
  const [view, setView] = useState(() => viewFromLocation());
  const [titleIndex, setTitleIndex] = useState(0);
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [activity, setActivity] = useState([
    { t: "刚刚", msg: "工作台就绪：输入主体与方向，开始一轮内容生产" }
  ]);
  const [smokeResult, setSmokeResult] = useState(null);
  const [smokeRunning, setSmokeRunning] = useState(false);
  const [previewImageUrls, setPreviewImageUrls] = useState([]);
  const [activeRecipe, setActiveRecipe] = useState(null);

  const localPack = useMemo(
    () => buildPack(topic, direction, tone, generation, extraContext),
    [topic, direction, tone, generation, extraContext]
  );
  const pack = generatedPack || localPack;

  const currentCopy = pack.platformCopy[platform] || pack.platformCopy.xhs;
  const frame = pack.videoFrames[activeFrame] || pack.videoFrames[0];
  const cleanTitle = pack.titleCandidates[titleIndex] || pack.title;
  const storedEvents = getStoredEvents();

  useEffect(() => {
    const saved = window.localStorage.getItem("agent-studio-state");
    if (!saved) return;
    try {
      const p = JSON.parse(saved);
      if (p.topic) setTopic(p.topic);
      if (p.direction) setDirection(p.direction);
      if (p.tone) setTone(p.tone);
      if (p.platform) setPlatform(p.platform);
      if (p.extraContext) setExtraContext(p.extraContext);
    } catch {
      window.localStorage.removeItem("agent-studio-state");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "agent-studio-state",
      JSON.stringify({ topic, direction, tone, platform, extraContext })
    );
  }, [topic, direction, tone, platform, extraContext]);

  useEffect(() => {
    setGeneratedPack(null);
    setDraftTask(null);
    setPublishStatus("idle");
  }, [topic, direction, tone, extraContext]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = window.setInterval(() => {
      setActiveFrame((current) => (current + 1) % pack.videoFrames.length);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [isPlaying, pack.videoFrames.length]);

  useEffect(() => {
    refreshHealth(false);
  }, []);

  useEffect(() => {
    writeViewHash(viewFromLocation(), { replace: true });
    const syncViewFromUrl = () => setView(viewFromLocation());
    window.addEventListener("hashchange", syncViewFromUrl);
    window.addEventListener("popstate", syncViewFromUrl);
    return () => {
      window.removeEventListener("hashchange", syncViewFromUrl);
      window.removeEventListener("popstate", syncViewFromUrl);
    };
  }, []);

  function navigateView(nextView) {
    setView(nextView);
    writeViewHash(nextView);
  }

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function logActivity(msg) {
    setActivity((items) => [{ t: nowLabel(), msg }, ...items].slice(0, 14));
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`已复制 · ${label}`);
      logActivity(`复制 · ${label}`);
      trackEvent("platform.copied", { label, platform, packId: pack.id });
    } catch {
      notify("复制失败，请手动选择");
    }
  }

  async function refreshHealth(showToast = true) {
    setHealthLoading(true);
    try {
      const data = await healthCheck();
      setHealth(data);
      if (showToast) notify("BFF 服务在线");
    } catch {
      setHealth({
        ok: false,
        service: "agent-studio-bff",
        apiSlots: apiSlots.map((slot) => ({ ...slot, configured: false })),
        policy: { defaultMode: "draft", finalPublishRequiresExplicitMode: true }
      });
      if (showToast) notify("BFF 未连接，当前使用本地内容引擎");
    } finally {
      setHealthLoading(false);
    }
  }

  async function runAgent() {
    if (agentRunning) return;

    const nextGeneration = generation + 1;
    setGeneration(nextGeneration);
    setGeneratedPack(null);
    setAgentRunning(true);
    setAgentStep(-1);
    setActiveFrame(0);
    setTitleIndex(0);
    setStreamSource("connecting");
    logActivity("Agent · 启动真实生成链路");
    trackEvent("agent.run", { topicHash: cleanTopic(topic).length, direction, tone });

    const result = await generatePack({
      input: { topic, direction, tone, generation: nextGeneration, extraContext },
      onEvent: ({ event, data }) => {
        if (event === "stage") {
          setAgentStep(data.index);
          logActivity(`Agent · ${data.stage.name}`);
        }
      }
    });

    setGeneratedPack(result.pack);
    setAgentStep(agentStages.length);
    setAgentRunning(false);
    setStreamSource(result.source);
    trackEvent("pack.generated", {
      source: result.source,
      domain: result.pack.domain,
      direction,
      tone
    });

    if (result.source === "bff") {
      notify("已通过 BFF 生成内容包");
    } else {
      notify("BFF 未连接，已用本地引擎完成生成");
      if (result.error) logActivity(`BFF 回退 · ${result.error}`);
    }
  }

  function exportJson() {
    downloadBlob(`agent-pack-${pack.id}.json`, JSON.stringify(pack, null, 2), "application/json;charset=utf-8");
    notify("已导出内容包");
    logActivity("导出 · JSON 内容包");
  }

  function exportSvg() {
    downloadBlob(`agent-cards-${pack.id}.svg`, svgForPack(pack), "image/svg+xml;charset=utf-8");
    notify("已下载封面样机");
    logActivity("导出 · 封面 SVG 样机");
  }

  function copyEnvTemplate() {
    const tpl = apiSlots.map((slot) => `# ${slot.name}\n${slot.key}=`).join("\n\n");
    copyText(tpl, ".env 模板");
  }

  async function runSmokeTest() {
    if (smokeRunning) return;
    setSmokeRunning(true);
    try {
      const result = await runGraphicSmokeTest({ topic, direction, tone, extraContext, platform: "xhs", mode: "draft" });
      setSmokeResult(result);
      setPreviewImageUrls(collectPreviewImageUrls(result.assets?.files));
      setGeneratedPack(result.pack);
      setPlatform("xhs");
      notify("图文测试包已导出 PNG 并入队 draft runbook");
      logActivity(`Smoke · 导出 ${result.assets?.files?.length || 0} 张 PNG，等待 Codex app 执行`);
    } catch (error) {
      notify("一键图文测试失败");
      logActivity(`Smoke 失败 · ${error.message}`);
    } finally {
      setSmokeRunning(false);
    }
  }

  async function preparePublish() {
    try {
      const response = await createDraftTask({ pack, platform });
      setDraftTask(response.task);
      setPublishStatus("prepared");
      logActivity(`生成发布任务 · ${platformMeta[platform].name}`);
      notify("发布任务已生成");
      trackEvent("publish.prepared", { platform, packId: pack.id, source: "bff" });
    } catch {
      const localTask = {
        id: `local-draft-${pack.id}-${platform}`,
        platform,
        platformName: platformMeta[platform].name,
        openUrl: platformMeta[platform].openUrl,
        automationMode: platformMeta[platform].automation,
        copy: currentCopy,
        instruction: pack.automationPrompt,
        stopCondition: "stop_on_final_confirmation_page",
        traceRequired: true
      };
      setDraftTask(localTask);
      setPublishStatus("prepared");
      logActivity(`生成本地发布任务 · ${platformMeta[platform].name}`);
      notify("BFF 未连接，已生成本地发布任务");
      trackEvent("publish.prepared", { platform, packId: pack.id, source: "local" });
    }
  }

  function openPlatform() {
    window.open((draftTask && draftTask.openUrl) || platformMeta[platform].openUrl, "_blank", "noopener,noreferrer");
    setPublishStatus("opened");
    logActivity(`打开网页端 · ${platformMeta[platform].name}`);
    notify(`已打开 ${platformMeta[platform].name}`);
    trackEvent("publish.opened", { platform, packId: pack.id });
  }

  function markPublished() {
    setPublishStatus("done");
    logActivity(`已人工确认发布 · ${platformMeta[platform].name}`);
    notify("已记录发布完成");
    trackEvent("publish.marked_done", { platform, packId: pack.id });
  }

  const bffOnline = Boolean(health?.ok);

  return (
    <div className="shell">
      <aside className="rail">
        <div className="logo">
          <div className="logoMark"><Sparkles size={18} /></div>
          <div>
            <strong>Agent Studio</strong>
            <span>商业化内容 Agent OS</span>
          </div>
        </div>

        <nav className="railNav" aria-label="主导航">
          <NavButton active={view === "factory"} onClick={() => navigateView("factory")} icon={<Sparkles size={16} />} label="素材工厂" href={viewHref("factory")} />
          <NavButton active={view === "research"} onClick={() => navigateView("research")} icon={<Radar size={16} />} label="选题研究" href={viewHref("research")} />
          <NavButton active={view === "studio"} onClick={() => navigateView("studio")} icon={<LayoutDashboard size={16} />} label="工作台" href={viewHref("studio")} />
          <NavButton active={view === "preview"} onClick={() => navigateView("preview")} icon={<Wand2 size={16} />} label="Preview Hub" href={viewHref("preview")} />
          <NavButton active={view === "assets"} onClick={() => navigateView("assets")} icon={<Boxes size={16} />} label="Visual Studio" href={viewHref("assets")} />
          <NavButton active={view === "publish"} onClick={() => navigateView("publish")} icon={<Send size={16} />} label="发布助手" href={viewHref("publish")} />
          <NavButton active={view === "autopilot"} onClick={() => navigateView("autopilot")} icon={<Bot size={16} />} label="自动发布" href={viewHref("autopilot")} />
          <NavButton active={view === "series"} onClick={() => navigateView("series")} icon={<Layers size={16} />} label="系列内容" href={viewHref("series")} />
          <NavButton active={view === "engagement"} onClick={() => navigateView("engagement")} icon={<MessageSquareText size={16} />} label="互动监控" href={viewHref("engagement")} />
          <NavButton active={view === "review"} onClick={() => navigateView("review")} icon={<Activity size={16} />} label="数据复盘" href={viewHref("review")} />
          <NavButton active={view === "api"} onClick={() => navigateView("api")} icon={<Plug size={16} />} label="API 接入" href={viewHref("api")} />
          <NavButton active={view === "business"} onClick={() => navigateView("business")} icon={<DatabaseZap size={16} />} label="商业化" href={viewHref("business")} />
        </nav>

        <div className="railFoot">
          <div className="boundaryBox">
            <ShieldCheck size={14} />
            <div>
              <strong>自动化边界</strong>
              <p>默认 draft；只有显式 mode=publish/schedule 的 runbook 才允许最终发布或预约。全程要求已登录授权账号、trace 和截图，不绕过验证码/风控。</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="canvas" id="main-content">
        <header className="topbar">
          <div className="crumbs">
            <span>{viewLabels[view]}</span>
            <ChevronRight size={14} />
            <strong>{pack.core}</strong>
            <span className="dirChip" style={{ "--c": pack.direction.accent }}>{pack.direction.label}</span>
            <span className={`statusPill ${bffOnline ? "ok" : "warn"}`}>{bffOnline ? "BFF 在线" : "本地引擎"}</span>
          </div>
          <div className="topActions">
            <button className="ghostBtn" onClick={() => copyText(pack.automationPrompt, "Agent 执行指令")}>
              <Copy size={14} /> 复制指令
            </button>
            <button className="ghostBtn" onClick={runAgent} disabled={agentRunning}>
              {agentRunning ? <Loader2 size={14} className="spin" /> : <Bot size={14} />}
              {agentRunning ? "Agent 运行中" : "运行 Agent"}
            </button>
            <button className="primaryBtn" onClick={runAgent} disabled={agentRunning}>
              <Wand2 size={14} /> 生成内容
            </button>
          </div>
        </header>

        {view === "research" && (
          <ResearchView topic={topic} setTopic={setTopic} notify={notify} logActivity={logActivity} />
        )}

        {view === "factory" && (
          <Views.FactoryView
            setTopic={setTopic}
            setGeneratedPack={setGeneratedPack}
            setPlatform={setPlatform}
            navigateView={navigateView}
            notify={notify}
            logActivity={logActivity}
          />
        )}

        {view === "studio" && (
          <Views.StudioView
            topic={topic}
            setTopic={setTopic}
            direction={direction}
            setDirection={setDirection}
            tone={tone}
            setTone={setTone}
            extraContext={extraContext}
            setExtraContext={setExtraContext}
            pack={pack}
            platform={platform}
            setPlatform={setPlatform}
            currentCopy={currentCopy}
            cleanTitle={cleanTitle}
            titleIndex={titleIndex}
            setTitleIndex={setTitleIndex}
            activeFrame={activeFrame}
            setActiveFrame={setActiveFrame}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            frame={frame}
            agentStep={agentStep}
            agentRunning={agentRunning}
            runAgent={runAgent}
            copyText={copyText}
            exportSvg={exportSvg}
            exportJson={exportJson}
            openPublish={() => navigateView("publish")}
            streamSource={streamSource}
            smokeResult={smokeResult}
            smokeRunning={smokeRunning}
            runSmokeTest={runSmokeTest}
          />
        )}

        {view === "preview" && (
          <PreviewHub
            topic={topic}
            pack={pack}
            platform={platform}
            setPlatform={setPlatform}
            currentCopy={currentCopy}
            cleanTitle={cleanTitle}
            titleIndex={titleIndex}
            setTitleIndex={setTitleIndex}
            activeFrame={activeFrame}
            setActiveFrame={setActiveFrame}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            frame={frame}
            exportSvg={exportSvg}
            exportJson={exportJson}
            openPublish={() => navigateView("publish")}
            copyText={copyText}
            smokeResult={smokeResult}
            previewImageUrls={previewImageUrls}
            streamSource={streamSource}
            activeRecipe={activeRecipe}
          />
        )}

        {view === "assets" && (
          <AssetsView
            pack={pack}
            platform={platform}
            exportSvg={exportSvg}
            exportJson={exportJson}
            copyText={copyText}
            notify={notify}
            logActivity={logActivity}
            onPngExported={(files) => setPreviewImageUrls(collectPreviewImageUrls(files))}
            activeRecipe={activeRecipe}
            setActiveRecipe={setActiveRecipe}
          />
        )}

        {view === "publish" && (
          <Views.PublishView
            pack={pack}
            platform={platform}
            setPlatform={setPlatform}
            currentCopy={currentCopy}
            publishStatus={publishStatus}
            draftTask={draftTask}
            preparePublish={preparePublish}
            openPlatform={openPlatform}
            markPublished={markPublished}
            notify={notify}
            logActivity={logActivity}
            copyText={copyText}
            openModal={() => setPublishOpen(true)}
          />
        )}

        {view === "autopilot" && (
          <AutopilotView
            notify={notify}
            logActivity={logActivity}
            setTopic={setTopic}
          />
        )}

        {view === "series" && (
          <SeriesView
            notify={notify}
            logActivity={logActivity}
            setTopic={setTopic}
          />
        )}

        {view === "engagement" && (
          <EngagementView
            notify={notify}
            logActivity={logActivity}
          />
        )}

        {view === "review" && (
          <ReviewView activity={activity} storedEvents={storedEvents} pack={pack} platform={platform} notify={notify} logActivity={logActivity} />
        )}

        {view === "api" && (
          <ApiView
            health={health}
            healthLoading={healthLoading}
            refreshHealth={refreshHealth}
            copyEnvTemplate={copyEnvTemplate}
            copyText={copyText}
            pack={pack}
            topic={topic}
            direction={direction}
            tone={tone}
            extraContext={extraContext}
          />
        )}

        {view === "business" && <Views.BusinessView />}

        {publishOpen && (
          <PublishModal
            platform={platform}
            publishStatus={publishStatus}
            preparePublish={preparePublish}
            copyText={copyText}
            pack={pack}
            openPlatform={openPlatform}
            markPublished={markPublished}
            close={() => setPublishOpen(false)}
          />
        )}

        {toast && <div className="toast"><Check size={14} />{toast}</div>}
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label, href }) {
  return (
    <a
      className={active ? "on" : ""}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      {icon} {label}
    </a>
  );
}

function ResearchView({ topic, setTopic, notify, logActivity }) {
  const [research, setResearch] = useState(null);
  const [loading, setLoading] = useState(false);

  async function runResearch() {
    setLoading(true);
    try {
      const collected = await collectResearch({ topic, platform: "web" });
      const brief = await createResearchBrief({ topic, sourceItems: collected.sourceItems });
      const topics = await createTopicCandidates({ topic, brief: brief.brief, limit: 5 });
      setResearch({ collected, brief: brief.brief, topics: topics.topics });
      notify("研究链路已完成");
      logActivity(`Research · 生成 ${topics.topics.length} 个候选选题`);
    } catch (error) {
      notify("研究接口未连接");
      logActivity(`Research 失败 · ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="emptyView">
      <div className="row row-2">
        <div className="card inputCard">
          <div className="cardHead">
            <div className="hLeft"><Radar size={14} /><span>Research Agent</span></div>
            <button className="microBtn" onClick={runResearch} disabled={loading}>
              {loading ? <Loader2 size={12} className="spin" /> : <Play size={12} />} 采集/简报/选题
            </button>
          </div>
          <label htmlFor="research-topic">研究主题</label>
          <textarea id="research-topic" rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} />
          <p className="loopHint">后端会优先调用 Tavily / Firecrawl / Jina；未配置或失败时回退到本地 research runbook。这里不会直接控制浏览器。</p>
        </div>
        <div className="card">
          <div className="cardHead">
            <div className="hLeft"><Target size={14} /><span>候选选题</span></div>
            <span className="cardHint">可复制后回到 Studio 生成</span>
          </div>
          <div className="routeList">
            {(research?.topics || []).map((item) => (
              <button key={item.id} className="routeButton" onClick={() => setTopic(item.title)}>{item.title}</button>
            ))}
            {!research?.topics?.length && <span>点击采集后生成下一轮内容角度。</span>}
          </div>
        </div>
      </div>
      {research && (
        <div className="row row-2">
          <div className="card">
            <div className="cardHead"><div className="hLeft"><Globe size={14} /><span>source_items</span></div><span className="cardHint">{research.collected.connector}</span></div>
            <div className="sourceList">
              {(research.collected.sourceItems || []).slice(0, 6).map((item) => (
                <article key={item.id} className="sourceItem">
                  <header>
                    <strong>{item.title}</strong>
                    <div className="sourceScores">
                      <span title="credibility">C{item.credibility_score}</span>
                      <span title="relevance">R{item.relevance_score}</span>
                    </div>
                  </header>
                  <p>{item.summary}</p>
                  <code>{item.source_url}</code>
                </article>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="cardHead"><div className="hLeft"><Clipboard size={14} /><span>research_brief</span></div></div>
            <div className="briefBlock">
              <section><b>Contrarian angle</b><p>{research.brief.contrarian_angle}</p></section>
              <div className="briefSplit">
                <div><b>Facts</b><ul>{(research.brief.facts || []).slice(0, 5).map((f, i) => <li key={i}>{f}</li>)}</ul></div>
                <div><b>Audience pains</b><ul>{(research.brief.audience_pains || []).map((f) => <li key={f}>{f}</li>)}</ul></div>
              </div>
              {!!(research.brief.contradictions || []).length && (
                <section><b>Contradictions</b><ul>{research.brief.contradictions.map((f) => <li key={f}>{f}</li>)}</ul></section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



function PlatformTabs({ platform, setPlatform }) {
  return (
    <div className="platformBar">
      {Object.entries(platformMeta).map(([id, m]) => (
        <button
          key={id}
          className={id === platform ? "pTab on" : "pTab"}
          style={{ "--c": m.color }}
          onClick={() => setPlatform(id)}
        >
          <div className="pHandle"><PlatformIcon platform={id} /></div>
          <div>
            <strong>{m.name}</strong>
            <span>{m.format}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function CopyBlock({ platform, currentCopy, title }) {
  return (
    <div className="copyBlock">
      <div className="copyMeta">
        <span>{platformMeta[platform].job}</span>
        <small>{currentCopy.body.length} / {platformMeta[platform].char}</small>
      </div>
      <h2>{title}</h2>
      <pre>{currentCopy.body}</pre>
      <div className="tagRow">
        {currentCopy.tags.map((t) => <span key={t}>#{t}</span>)}
      </div>
    </div>
  );
}

function AssetsView({ pack, platform, exportSvg, exportJson, copyText, notify, logActivity, onPngExported, activeRecipe, setActiveRecipe }) {
  const [htmlPreview, setHtmlPreview] = useState("");
  const [pngExport, setPngExport] = useState(null);
  const [visualResults, setVisualResults] = useState({});
  const [busy, setBusy] = useState("");
  const [rawOpen, setRawOpen] = useState({});
  const [templatePrefs, setTemplatePrefs] = useState(() => loadTemplatePrefs());
  const { visualStyle } = resolveStyleForPack(pack, platform, templatePrefs);

  const templateApi = () => buildTemplateApiPayload({ pack, platform, prefs: templatePrefs });

  const visualModules = [
    { key: "xhs-carousel", label: "XHS Carousel", engine: "HTML+Playwright", action: generateXhsCarouselAsset, real: "6× PNG" },
    { key: "cover", label: "Cover", engine: "Satori-compatible", action: generateCoverAsset, real: "PNG export" },
    { key: "info-card", label: "Info Card", engine: "Satori-compatible", action: generateInfoCardAsset, real: "PNG export" },
    { key: "chart", label: "Chart", engine: "Chart.js-compatible", action: generateChartAsset, real: "PNG + JSON" },
    { key: "motion-video", label: "Motion Video", engine: "Hyperframes-style", action: generateMotionHtmlAsset, real: "HTML + thumbnail" },
    { key: "motion-mp4", label: "Hyperframes MP4", engine: "Hyperframes-compatible", action: (opts) => exportVideoAsset({ ...opts, renderBackend: "hyperframes", duration: 8, fps: 8 }), real: "MP4 export" },
    { key: "explain-animation", label: "Explain Animation", engine: "Motion Canvas", action: generateExplainAnimationAsset, real: "scaffold" },
    { key: "brand-video", label: "Brand Video", engine: "Remotion", action: generateReactVideoAsset, real: "enterprise scaffold" }
  ];

  async function renderHtml() {
    setBusy("html");
    try {
      const html = await renderHtmlDeckAsset({ pack, platform });
      setHtmlPreview(html);
      notify("HTML deck 已渲染");
      logActivity("素材 · 渲染 HTML deck");
    } catch (error) {
      notify("HTML 渲染失败");
      logActivity(`HTML 渲染失败 · ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  async function exportPng() {
    setBusy("png");
    try {
      const result = await exportPngDeck(templateApi());
      setPngExport(result);
      onPngExported?.(result.files || []);
      if (result.recipe?.id) reportTemplateOutcome({ recipeId: result.recipe.id, success: true }).catch(() => {});
      else if (activeRecipe?.id) reportTemplateOutcome({ recipeId: activeRecipe.id, success: true }).catch(() => {});
      notify("PNG deck 已导出，Preview Hub 可查看");
      logActivity(`素材 · 导出 ${result.files?.length || 0} 张 PNG · ${result.recipe?.label || activeRecipe?.label || visualStyle}`);
    } catch (error) {
      if (activeRecipe?.id) reportTemplateOutcome({ recipeId: activeRecipe.id, success: false }).catch(() => {});
      notify("PNG 导出失败，请确认 Playwright 浏览器已安装");
      logActivity(`PNG 导出失败 · ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  async function runVisualModule(module) {
    setBusy(module.key);
    try {
      const result = await module.action(templateApi());
      setVisualResults((current) => ({ ...current, [module.key]: result }));
      notify(`${module.label} 已生成`);
      logActivity(`Visual · ${module.label} / ${visualStyleCatalog[visualStyle]?.label || visualStyle}`);
    } catch (error) {
      notify(`${module.label} 生成失败`);
      logActivity(`Visual ${module.label} 失败 · ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="emptyView">
      <div className="card cardsCard">
        <div className="cardHead">
          <div className="hLeft"><Boxes size={14} /><span>Visual Studio</span></div>
          <div className="headRight">
            <button className="microBtn" onClick={renderHtml} disabled={busy === "html"}>{busy === "html" ? <Loader2 size={12} className="spin" /> : <Globe size={12} />} HTML</button>
            <button className="microBtn" onClick={exportPng} disabled={busy === "png"}>{busy === "png" ? <Loader2 size={12} className="spin" /> : <ImageIcon size={12} />} Legacy PNG</button>
            <button className="microBtn" onClick={exportSvg}><Download size={12} /> SVG</button>
            <button className="microBtn" onClick={exportJson}><FileJson size={12} /> JSON</button>
            <button className="microBtn" onClick={() => copyText(pack.videoFrames.map((f) => `${f.time} ${f.shot}：${f.voice}`).join("\n"), "视频分镜")}>
              <Film size={12} /> 分镜
            </button>
          </div>
        </div>
        <p className="loopHint">这里生成 Agent 可使用的本地素材资产；Codex App 浏览器发布仍由 runbook 接管，本页不会直接控制平台或点击发布。</p>
        <TemplateGallery
          pack={pack}
          platform={platform}
          prefs={templatePrefs}
          onChange={setTemplatePrefs}
          onResolved={setActiveRecipe}
        />
        <details className="stylePicker stylePicker--legacy">
          <summary>高级：legacy 风格 ID</summary>
          <p className="muted">当前映射：<b>{visualStyleCatalog[visualStyle]?.label || visualStyle}</b></p>
          <div className="tagRow">
            {templateSourceCatalog.slice(0, 7).map((source) => <span key={source.id}>{source.label}</span>)}
          </div>
        </details>
        <div className="assetSummary">
          <Metric label="卡片" value={`${pack.cards.length} 张`} />
          <Metric label="模板" value={activeRecipe?.label || visualStyleCatalog[visualStyle]?.label || visualStyle} />
          <Metric label="HTML Renderer" value={htmlPreview ? "已渲染" : "待生成"} />
          <Metric label="PNG Export" value={pngExport?.files?.length ? `${pngExport.files.length} 张` : "Playwright"} />
        </div>
        <div className="visualGrid">
          {visualModules.map((module) => {
            const result = visualResults[module.key];
            const showRaw = rawOpen[module.key];
            return (
              <article key={module.key} className="visualModule">
                <header>
                  <strong>{module.label}</strong>
                  <span>{module.engine}</span>
                </header>
                <p>{module.real} · {platformMeta[platform].name}</p>
                <div className="moduleActions">
                  <button className="microBtn" onClick={() => runVisualModule(module)} disabled={busy === module.key}>
                    {busy === module.key ? <Loader2 size={12} className="spin" /> : <Wand2 size={12} />} 生成
                  </button>
                  {result && (
                    <button className="microBtn" onClick={() => setRawOpen((s) => ({ ...s, [module.key]: !showRaw }))}>
                      <FileJson size={12} /> {showRaw ? "收起 JSON" : "查看 JSON"}
                    </button>
                  )}
                </div>
                {result && <VisualResultPreview result={result} module={module} />}
                {result && showRaw && <pre className="jsonBlock">{JSON.stringify(result, null, 2)}</pre>}
              </article>
            );
          })}
        </div>
        {pngExport && <PngExportSummary data={pngExport} />}
        {htmlPreview && (
          <div className="htmlPreviewFrame">
            <div className="htmlPreviewHead"><Globe size={12} /> HTML deck 预览（iframe sandboxed）</div>
            <iframe title="html-deck-preview" sandbox="" srcDoc={htmlPreview} />
          </div>
        )}
        <div className="cardStrip">
          {pack.cards.map((c, i) => <VisualCard card={c} index={i} key={`a-${i}`} />)}
        </div>
      </div>
    </div>
  );
}



function AutopilotView({ notify, logActivity, setTopic }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState("");
  const [topicTitle, setTopicTitle] = useState("");
  const [topicNotes, setTopicNotes] = useState("");
  const [windowsDraft, setWindowsDraft] = useState(null);
  const settings = data?.settings || {};
  const today = data?.today;

  useEffect(() => {
    refresh(false);
  }, []);

  useEffect(() => {
    if (data?.settings?.windows && windowsDraft === null) {
      setWindowsDraft(data.settings.windows.map((window) => ({ ...window })));
    }
  }, [data, windowsDraft]);

  async function refresh(showToast = true) {
    setLoading(true);
    try {
      const snapshot = await getAutopilot();
      setData(snapshot);
      if (showToast) notify("Autopilot 已刷新");
    } catch (error) {
      notify("Autopilot 未连接");
      logActivity(`Autopilot 刷新失败 · ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(patch) {
    setSaving("settings");
    try {
      const snapshot = await saveAutopilotSettings({ ...settings, ...patch });
      setData(snapshot);
      notify(patch.enabled === true ? "自动发布已开启" : patch.enabled === false ? "自动发布已暂停" : "设置已保存");
      logActivity("Autopilot · 设置更新");
    } catch (error) {
      notify("设置保存失败");
      logActivity(`Autopilot 设置失败 · ${error.message}`);
    } finally {
      setSaving("");
    }
  }

  function updateWindow(index, patch) {
    setWindowsDraft((prev) => (prev || []).map((window, i) => (i === index ? { ...window, ...patch } : window)));
  }

  function addWindow() {
    setWindowsDraft((prev) => [
      ...(prev || []),
      { label: `窗口 ${(prev?.length || 0) + 1}`, start: "12:00", end: "13:00", contentType: "image", direction: "insight", tone: "balanced" }
    ]);
  }

  function removeWindow(index) {
    setWindowsDraft((prev) => (prev || []).filter((_, i) => i !== index));
  }

  function resetWindows() {
    setWindowsDraft((data?.defaultWindows || []).map((window) => ({ ...window })));
  }

  async function saveWindows() {
    if (!windowsDraft?.length) {
      notify("至少保留一个发布窗口");
      return;
    }
    setSaving("windows");
    try {
      const snapshot = await saveAutopilotSettings({ ...settings, windows: windowsDraft });
      setData(snapshot);
      setWindowsDraft((snapshot.settings?.windows || []).map((window) => ({ ...window })));
      notify("发布窗口已更新");
      logActivity(`Autopilot · 窗口更新（${snapshot.settings?.windows?.length || 0} 个）`);
    } catch (error) {
      notify("窗口保存失败");
      logActivity(`Autopilot 窗口失败 · ${error.message}`);
    } finally {
      setSaving("");
    }
  }

  async function addTopic() {
    if (!topicTitle.trim()) return;
    setSaving("topic");
    try {
      const snapshot = await addAutopilotTopic({ title: topicTitle.trim(), notes: topicNotes.trim(), status: "queued" });
      setData(snapshot);
      setTopicTitle("");
      setTopicNotes("");
      notify("主题已加入队列");
      logActivity("Autopilot · 新增主题");
    } catch (error) {
      notify("主题加入失败");
      logActivity(`Autopilot 主题失败 · ${error.message}`);
    } finally {
      setSaving("");
    }
  }

  async function changeTopicStatus(id, status) {
    setSaving(id);
    try {
      const snapshot = await updateAutopilotTopic(id, { status });
      setData(snapshot);
      notify(status === "archived" ? "主题已归档" : "主题已更新");
    } catch (error) {
      notify("主题更新失败");
      logActivity(`Autopilot 主题更新失败 · ${error.message}`);
    } finally {
      setSaving("");
    }
  }

  async function tickNow() {
    setSaving("tick");
    try {
      const result = await runAutopilotTick();
      setData(result.snapshot);
      notify(result.queued?.length ? `已入队 ${result.queued.length} 个任务` : "暂无到点任务");
      logActivity(`Autopilot · tick queued=${result.queued?.length || 0}`);
    } catch (error) {
      notify("检查失败");
      logActivity(`Autopilot tick 失败 · ${error.message}`);
    } finally {
      setSaving("");
    }
  }

  async function clearPlans() {
    setSaving("clear");
    try {
      const result = await clearAutopilotPlans();
      setData(result.snapshot);
      notify("已清空所有定时计划");
      logActivity("Autopilot · 清空定时计划（随用随时）");
    } catch (error) {
      notify("清空失败");
      logActivity(`Autopilot 清空失败 · ${error.message}`);
    } finally {
      setSaving("");
    }
  }

  async function queueSlot(slot) {
    setSaving(slot.id);
    try {
      const result = await queueAutopilotSlot(slot.id, false);
      setData(result.snapshot);
      notify("已入队 Codex 任务");
      logActivity(`Autopilot · ${slot.label} 已入队`);
    } catch (error) {
      notify("入队失败");
      logActivity(`Autopilot 入队失败 · ${error.message}`);
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="emptyView autopilotView">
      <div className="card autopilotHero">
        <div className="cardHead">
          <div className="hLeft"><Bot size={14} /><span>本机 Autopilot</span></div>
          <div className="headRight">
            <span className={`statusPill ${settings.enabled ? "ok" : "warn"}`}>{settings.enabled ? "运行中" : "已暂停"}</span>
            <button className="microBtn" onClick={() => refresh()} disabled={loading}>
              {loading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} 刷新
            </button>
          </div>
        </div>
        <div className="autopilotMetrics">
          <Metric label="今日计划" value={today?.slots?.length ? `${today.slots.length} 条` : "未生成"} />
          <Metric label="Codex 队列" value={`${data?.pendingTasks?.length || 0} 条`} />
          <Metric label="账号" value={settings.accountLabel || "Leo"} />
          <Metric label="模式" value={settings.mode || "publish"} />
        </div>
        <div className="autopilotActions">
          <button className={settings.enabled ? "ghostBtn" : "primaryBtn"} onClick={() => saveSettings({ enabled: !settings.enabled })} disabled={saving === "settings"}>
            {settings.enabled ? <Pause size={14} /> : <Play size={14} />}
            {settings.enabled ? "暂停自动发布" : "开启自动发布"}
          </button>
          <button className="ghostBtn" onClick={tickNow} disabled={saving === "tick"}>
            {saving === "tick" ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} 检查到点任务
          </button>
          <button className="ghostBtn" onClick={clearPlans} disabled={saving === "clear"}>
            {saving === "clear" ? <Loader2 size={14} className="spin" /> : <X size={14} />} 清空定时计划
          </button>
        </div>
        <p className="loopHint">随用随时：关闭自动发布后系统不再自动排程，按需在工作台生成即可。普通主题默认是单篇内容；只有从“系列内容”生成并入队的期数，才会带系列标识、前情承接和统一视觉风格。</p>
      </div>

      <div className="row row-2">
        <div className="card autopilotSettings">
          <div className="cardHead">
            <div className="hLeft"><ShieldCheck size={14} /><span>发布设置</span></div>
            <span className="cardHint">当前服务内置调度</span>
          </div>
          <div className="settingsGrid">
            <label>
              <span>平台</span>
              <select value={settings.platform || "xhs"} onChange={(e) => saveSettings({ platform: e.target.value })}>
                {Object.entries(platformMeta).map(([id, meta]) => <option key={id} value={id}>{meta.name}</option>)}
              </select>
            </label>
            <label>
              <span>账号</span>
              <input value={settings.accountLabel || ""} onChange={(e) => saveSettings({ accountLabel: e.target.value })} placeholder="Leo" />
            </label>
            <label>
              <span>主题来源</span>
              <select value={settings.contentSource || "manual-or-auto"} onChange={(e) => saveSettings({ contentSource: e.target.value })}>
                <option value="manual-or-auto">手动优先</option>
                <option value="manual-only">只用手动</option>
                <option value="auto-only">只用自动</option>
              </select>
            </label>
            <label>
              <span>默认主题</span>
              <input value={settings.defaultTopic || ""} onChange={(e) => saveSettings({ defaultTopic: e.target.value })} placeholder="AI 本机自动化" />
            </label>
          </div>
          <div className="modeRow">
            {["draft", "publish", "schedule"].map((mode) => (
              <button key={mode} className={settings.mode === mode ? "on" : ""} onClick={() => saveSettings({ mode })}>{mode}</button>
            ))}
          </div>
        </div>

        <div className="card topicComposer">
          <div className="cardHead">
            <div className="hLeft"><PenLine size={14} /><span>主题池</span></div>
            <span className="cardHint">{(data?.topicQueue || []).filter((item) => item.status !== "archived").length} 个可用</span>
          </div>
          <label htmlFor="autopilot-topic">主题</label>
          <input id="autopilot-topic" value={topicTitle} onChange={(e) => setTopicTitle(e.target.value)} placeholder="例如：AI 时代高配 MacBook 能做什么" />
          <label htmlFor="autopilot-notes">备注</label>
          <input id="autopilot-notes" value={topicNotes} onChange={(e) => setTopicNotes(e.target.value)} placeholder="角度、素材、账号状态" />
          <div className="modalActions">
            <button className="ghostBtn" onClick={() => setTopic(topicTitle)} disabled={!topicTitle.trim()}><Wand2 size={14} /> 放到工作台</button>
            <button className="primaryBtn" onClick={addTopic} disabled={saving === "topic" || !topicTitle.trim()}>
              {saving === "topic" ? <Loader2 size={14} className="spin" /> : <Check size={14} />} 加入队列
            </button>
          </div>
        </div>
      </div>

      <div className="card autopilotWindows">
        <div className="cardHead">
          <div className="hLeft"><Clock size={14} /><span>发布窗口 · 定时任务</span></div>
          <span className="cardHint">{(windowsDraft || []).length} 个 · 可灵活配置</span>
        </div>
        <p className="loopHint">不再写死「上午 / 中午 / 晚间」。自定义任意数量的发布窗口、时间段、内容类型、方向与口吻；当天若尚未开始执行，保存后会立即按新排程重排。</p>
        <div className="windowEditor">
          {(windowsDraft || []).map((window, index) => (
            <div
              key={index}
              className="windowRow"
              style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr 0.9fr 0.9fr 1fr 1fr auto", gap: "8px", alignItems: "center", marginBottom: "8px" }}
            >
              <input value={window.label || ""} onChange={(e) => updateWindow(index, { label: e.target.value })} placeholder="窗口名称" />
              <input type="time" value={window.start || "08:00"} onChange={(e) => updateWindow(index, { start: e.target.value })} />
              <input type="time" value={window.end || "09:00"} onChange={(e) => updateWindow(index, { end: e.target.value })} />
              <select value={window.contentType || "image"} onChange={(e) => updateWindow(index, { contentType: e.target.value })}>
                <option value="image">图文</option>
                <option value="video">视频</option>
              </select>
              <select value={window.direction || "insight"} onChange={(e) => updateWindow(index, { direction: e.target.value })}>
                {directionLibrary.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <select value={window.tone || "balanced"} onChange={(e) => updateWindow(index, { tone: e.target.value })}>
                {Object.entries(toneProfiles).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
              </select>
              <button className="microBtn" title="删除窗口" onClick={() => removeWindow(index)} disabled={(windowsDraft || []).length <= 1}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="modalActions">
          <button className="ghostBtn" onClick={addWindow}><Plus size={14} /> 添加窗口</button>
          <button className="ghostBtn" onClick={resetWindows}><RefreshCw size={14} /> 重置默认</button>
          <button className="primaryBtn" onClick={saveWindows} disabled={saving === "windows"}>
            {saving === "windows" ? <Loader2 size={14} className="spin" /> : <Check size={14} />} 保存窗口
          </button>
        </div>
      </div>

      <div className="card">
        <div className="cardHead">
          <div className="hLeft"><Activity size={14} /><span>今日计划</span></div>
          <span className="cardHint">{today?.date || "today"} · {(today?.slots || []).length} 条</span>
        </div>
        <div className="autopilotSlots">
          {(today?.slots || []).map((slot) => (
            <article key={slot.id} className="autopilotSlot" data-status={slot.status}>
              <header>
                <div>
                  <strong>{slot.scheduledTime} · {slot.label}</strong>
                  <span>{slot.window.start}-{slot.window.end} · {slot.contentType === "video" ? "HTML 视频" : "图文"}</span>
                </div>
                <span className="slotStatus">{slot.status}</span>
              </header>
              <p>{slot.topic}</p>
              <div className="slotMeta">
                <span className={slot.contentKind === "series" ? "kindSeries" : ""}>{slot.contentKind === "series" ? "系列" : "单篇"}</span>
                <span>{slot.topicSource}</span>
                <span>{slot.mode}</span>
                <span>{platformMeta[slot.platform]?.name || slot.platform}</span>
                {slot.seriesTitle && <span className="kindSeries">《{slot.seriesTitle}》第 {slot.seriesEpisodeIndex} 期</span>}
              </div>
              <div className="slotActions">
                <button className="microBtn" onClick={() => setTopic(slot.topic)}><Wand2 size={12} /> 工作台</button>
                <button className="microBtn" onClick={() => queueSlot(slot)} disabled={saving === slot.id || ["queued", "generating"].includes(slot.status)}>
                  {saving === slot.id ? <Loader2 size={12} className="spin" /> : <Send size={12} />} 入队
                </button>
              </div>
              {slot.failureReason && <code className="slotError">{slot.failureReason}</code>}
            </article>
          ))}
          {!today?.slots?.length && <p className="loopHint">今日计划尚未生成。</p>}
        </div>
      </div>

      <div className="card">
        <div className="cardHead">
          <div className="hLeft"><Clipboard size={14} /><span>可选主题</span></div>
          <span className="cardHint">queued / locked / planned</span>
        </div>
        <div className="topicQueue">
          {(data?.topicQueue || []).filter((item) => item.status !== "archived").map((item) => (
            <article key={item.id} data-kind={item.contentKind || "standalone"}>
              <strong>{item.title}</strong>
              <span>{item.status} · {item.priority} · {(item.contentKind || "standalone") === "series" ? "系列内容" : "单篇内容"}</span>
              {item.seriesTitle && <span className="seriesFlag">《{item.seriesTitle}》第 {item.seriesEpisodeIndex} 期</span>}
              {item.notes && <p>{item.notes}</p>}
              <div className="slotActions">
                <button className="microBtn" onClick={() => changeTopicStatus(item.id, item.status === "locked" ? "queued" : "locked")} disabled={saving === item.id}>
                  <Lock size={12} /> {item.status === "locked" ? "解锁" : "锁定"}
                </button>
                <button className="microBtn" onClick={() => changeTopicStatus(item.id, "archived")} disabled={saving === item.id}>
                  <X size={12} /> 归档
                </button>
              </div>
            </article>
          ))}
          {!(data?.topicQueue || []).filter((item) => item.status !== "archived").length && <p className="loopHint">暂无手动主题。</p>}
        </div>
      </div>
    </div>
  );
}

function SeriesView({ notify, logActivity, setTopic }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [profile, setProfile] = useState({
    title: "本机 AI 内容系统从 0 到自动运转",
    description: "连续拆解一个人如何用 Mac、Codex、浏览器自动化和小红书运营形成闭环。",
    platform: "xhs",
    direction: "insight",
    tone: "balanced",
    visualStyle: "auto-diverse",
    cadence: "每周 3-7 期",
    seedTopics: "为什么要本机运行内容系统\n每天三条内容怎么排程\n评论区如何变成下一期选题"
  });
  const [episode, setEpisode] = useState({ topic: "", notes: "" });
  const profiles = data?.profiles || [];
  const selected = profiles.find((item) => item.id === selectedId) || profiles[0] || null;

  useEffect(() => {
    refresh(false);
  }, []);

  useEffect(() => {
    if (!selectedId && profiles[0]?.id) setSelectedId(profiles[0].id);
  }, [profiles, selectedId]);

  async function refresh(showToast = true) {
    setLoading(true);
    try {
      const snapshot = await getSeries();
      setData(snapshot);
      if (showToast) notify("系列内容已刷新");
    } catch (error) {
      notify("系列内容未连接");
      logActivity(`Series 刷新失败 · ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function createProfile() {
    if (!profile.title.trim()) return;
    setSaving("profile");
    try {
      const result = await createSeriesProfile({
        ...profile,
        seedTopics: profile.seedTopics.split("\n").map((line) => line.trim()).filter(Boolean)
      });
      setData(result.snapshot);
      setSelectedId(result.profile.id);
      notify("系列已创建");
      logActivity(`Series · 创建 ${result.profile.title}`);
    } catch (error) {
      notify("系列创建失败");
      logActivity(`Series 创建失败 · ${error.message}`);
    } finally {
      setSaving("");
    }
  }

  async function addEpisode() {
    if (!selected) return;
    setSaving("episode");
    try {
      const result = await addSeriesEpisode(selected.id, {
        topic: episode.topic.trim(),
        notes: episode.notes.trim(),
        status: "planned"
      });
      setData(result.snapshot);
      setEpisode({ topic: "", notes: "" });
      setTopic(result.episode.title);
      notify(`第 ${result.episode.index} 期已生成`);
      logActivity(`Series · 生成第 ${result.episode.index} 期`);
    } catch (error) {
      notify("生成下一期失败");
      logActivity(`Series 生成失败 · ${error.message}`);
    } finally {
      setSaving("");
    }
  }

  async function queueEpisode(item) {
    if (!selected) return;
    setSaving(item.id);
    try {
      const result = await queueSeriesEpisode(selected.id, item.id, { status: "queued", priority: "high" });
      setData(result.snapshot);
      notify("已加入自动发布主题池");
      logActivity(`Series · 第 ${item.index} 期加入 Autopilot`);
    } catch (error) {
      notify("加入自动发布失败");
      logActivity(`Series 入队失败 · ${error.message}`);
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="emptyView seriesView">
      <div className="card seriesHero">
        <div className="cardHead">
          <div className="hLeft"><Layers size={14} /><span>系列内容</span></div>
          <div className="headRight">
            <span className="statusPill ok">统一风格 / 连续上下文</span>
            <button className="microBtn" onClick={() => refresh()} disabled={loading}>
              {loading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} 刷新
            </button>
          </div>
        </div>
        <div className="seriesMetrics">
          <Metric label="系列数" value={`${profiles.length} 个`} />
          <Metric label="当前系列" value={selected?.title || "未创建"} />
          <Metric label="已规划期数" value={`${selected?.episodes?.length || 0} 期`} />
          <Metric label="视觉风格" value={selected ? visualStyleCatalog[selected.visualStyle]?.label || selected.visualStyle : "未设置"} />
        </div>
        <p className="loopHint">系列是显式选择：只有在这里创建系列、生成期数并点击“标记为系列并入队”的内容才会连续；普通工作台和普通主题池仍按单篇生成。小红书文案会默认引导评论区互动，把高频问题反哺下一期。</p>
      </div>

      <div className="row row-2">
        <div className="card seriesComposer">
          <div className="cardHead">
            <div className="hLeft"><PenLine size={14} /><span>创建系列</span></div>
            <span className="cardHint">主题连续 + 风格统一</span>
          </div>
          <label>系列名</label>
          <input value={profile.title} onChange={(e) => setProfile((current) => ({ ...current, title: e.target.value }))} />
          <label>系列定位</label>
          <textarea rows={3} value={profile.description} onChange={(e) => setProfile((current) => ({ ...current, description: e.target.value }))} />
          <div className="settingsGrid">
            <label>
              <span>方向</span>
              <select value={profile.direction} onChange={(e) => setProfile((current) => ({ ...current, direction: e.target.value }))}>
                {directionLibrary.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>语气</span>
              <select value={profile.tone} onChange={(e) => setProfile((current) => ({ ...current, tone: e.target.value }))}>
                {Object.entries(toneProfiles).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>视觉风格</span>
              <select value={profile.visualStyle} onChange={(e) => setProfile((current) => ({ ...current, visualStyle: e.target.value }))}>
                {Object.entries(visualStyleCatalog).map(([id, style]) => <option key={id} value={id}>{style.label}</option>)}
              </select>
            </label>
            <label>
              <span>节奏</span>
              <input value={profile.cadence} onChange={(e) => setProfile((current) => ({ ...current, cadence: e.target.value }))} />
            </label>
          </div>
          <label>备选选题，每行一个</label>
          <textarea rows={4} value={profile.seedTopics} onChange={(e) => setProfile((current) => ({ ...current, seedTopics: e.target.value }))} />
          <div className="modalActions">
            <button className="primaryBtn" onClick={createProfile} disabled={saving === "profile"}>
              {saving === "profile" ? <Loader2 size={14} className="spin" /> : <Check size={14} />} 创建系列
            </button>
          </div>
        </div>

        <div className="card seriesNext">
          <div className="cardHead">
            <div className="hLeft"><Sparkles size={14} /><span>生成下一期</span></div>
            <span className="cardHint">会接上上一期</span>
          </div>
          <label>当前系列</label>
          <select value={selected?.id || ""} onChange={(e) => setSelectedId(e.target.value)}>
            {profiles.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          <label>本期主题</label>
          <input value={episode.topic} onChange={(e) => setEpisode((current) => ({ ...current, topic: e.target.value }))} placeholder="留空则从备选选题里取" />
          <label>本期备注</label>
          <textarea rows={4} value={episode.notes} onChange={(e) => setEpisode((current) => ({ ...current, notes: e.target.value }))} placeholder="想承接的评论、反对意见、产品进展" />
          <div className="seriesBridge">
            <strong>前情承接</strong>
            <p>{selected?.episodes?.length ? selected.episodes[selected.episodes.length - 1].recap : "还没有上一期，下一次会作为开篇处理。"}</p>
          </div>
          <div className="modalActions">
            <button className="primaryBtn" onClick={addEpisode} disabled={!selected || saving === "episode"}>
              {saving === "episode" ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />} 生成下一期
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardHead">
          <div className="hLeft"><Clipboard size={14} /><span>系列库</span></div>
          <span className="cardHint">可加入自动发布主题池</span>
        </div>
        <div className="seriesGrid">
          {profiles.map((item) => (
            <article key={item.id} className={item.id === selected?.id ? "selected" : ""}>
              <header>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.status} · {visualStyleCatalog[item.visualStyle]?.label || item.visualStyle}</span>
                </div>
                <button className="microBtn" onClick={() => setSelectedId(item.id)}>选择</button>
              </header>
              <p>{item.description || "暂无定位"}</p>
              <div className="seriesEpisodes">
                {(item.episodes || []).map((ep) => (
                  <section key={ep.id}>
                    <b>第 {ep.index} 期 · {ep.title}</b>
                    <span>{ep.status} · {ep.recap}</span>
                    <div className="slotActions">
                      <button className="microBtn" onClick={() => setTopic(ep.title)}><Wand2 size={12} /> 工作台</button>
                      <button className="microBtn" onClick={() => queueEpisode(ep)} disabled={saving === ep.id || ep.status === "queued"}>
                        {saving === ep.id ? <Loader2 size={12} className="spin" /> : <Send size={12} />} 标记为系列并入队
                      </button>
                    </div>
                  </section>
                ))}
                {!item.episodes?.length && <span>暂无期数</span>}
              </div>
            </article>
          ))}
          {!profiles.length && <p className="loopHint">暂无系列。先创建一个系列，再生成第 1 期。</p>}
        </div>
      </div>
    </div>
  );
}

function EngagementView({ notify, logActivity }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState("");
  const settings = data?.settings || {};
  const recentItems = data?.recentItems || [];
  const recentRuns = data?.recentRuns || [];
  const pendingTasks = data?.pendingTasks || [];

  useEffect(() => {
    refresh(false);
  }, []);

  async function refresh(showToast = true) {
    setLoading(true);
    try {
      const snapshot = await getEngagement();
      setData(snapshot);
      if (showToast) notify("互动监控已刷新");
    } catch (error) {
      notify("互动监控未连接");
      logActivity(`Engagement 刷新失败 · ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(patch) {
    setSaving("settings");
    try {
      const snapshot = await saveEngagementSettings({ ...settings, ...patch });
      setData(snapshot);
      notify(patch.enabled === true ? "互动监控已开启" : patch.enabled === false ? "互动监控已暂停" : "设置已保存");
      logActivity("Engagement · 设置更新");
    } catch (error) {
      notify("设置保存失败");
      logActivity(`Engagement 设置失败 · ${error.message}`);
    } finally {
      setSaving("");
    }
  }

  async function checkNow() {
    setSaving("check");
    try {
      const result = await queueEngagementCheck("manual");
      setData(result.snapshot);
      notify(result.status === "already_pending" ? "已有互动任务待执行" : "互动检查已入队");
      logActivity(`Engagement · ${result.status}`);
    } catch (error) {
      notify("互动检查入队失败");
      logActivity(`Engagement 入队失败 · ${error.message}`);
    } finally {
      setSaving("");
    }
  }

  const commentPolicy = settings.allowCommentAutoReply ? "低风险可回" : "只起草";
  const messagePolicy = settings.allowMessageAutoReply ? "低风险可回" : "只起草";

  return (
    <div className="emptyView engagementView">
      <div className="card engagementHero">
        <div className="cardHead">
          <div className="hLeft"><MessageSquareText size={14} /><span>小红书互动监控</span></div>
          <div className="headRight">
            <span className={`statusPill ${settings.enabled ? "ok" : "warn"}`}>{settings.enabled ? "运行中" : "已暂停"}</span>
            <button className="microBtn" onClick={() => refresh()} disabled={loading}>
              {loading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} 刷新
            </button>
          </div>
        </div>
        <div className="engagementMetrics">
          <Metric label="Codex 队列" value={`${pendingTasks.length} 条`} />
          <Metric label="最近互动" value={`${recentItems.length} 条`} />
          <Metric label="评论策略" value={commentPolicy} />
          <Metric label="私信策略" value={messagePolicy} />
        </div>
        <div className="autopilotActions">
          <button className={settings.enabled ? "ghostBtn" : "primaryBtn"} onClick={() => saveSettings({ enabled: !settings.enabled })} disabled={saving === "settings"}>
            {settings.enabled ? <Pause size={14} /> : <Play size={14} />}
            {settings.enabled ? "暂停监控" : "开启监控"}
          </button>
          <button className="ghostBtn" onClick={checkNow} disabled={saving === "check"}>
            {saving === "check" ? <Loader2 size={14} className="spin" /> : <MousePointerClick size={14} />} 立即检查
          </button>
        </div>
      </div>

      <div className="row row-2">
        <div className="card engagementSettings">
          <div className="cardHead">
            <div className="hLeft"><ShieldCheck size={14} /><span>监控与回复策略</span></div>
            <span className="cardHint">Codex 浏览器执行</span>
          </div>
          <div className="settingsGrid">
            <label>
              <span>平台</span>
              <select value={settings.platform || "xhs"} onChange={(e) => saveSettings({ platform: e.target.value })}>
                {Object.entries(platformMeta).map(([id, meta]) => <option key={id} value={id}>{meta.name}</option>)}
              </select>
            </label>
            <label>
              <span>账号</span>
              <input value={settings.accountLabel || ""} onChange={(e) => saveSettings({ accountLabel: e.target.value })} placeholder="Leo" />
            </label>
            <label>
              <span>检查间隔</span>
              <input type="number" min="5" max="1440" value={settings.checkIntervalMinutes || 30} onChange={(e) => saveSettings({ checkIntervalMinutes: Number(e.target.value) })} />
            </label>
            <label>
              <span>每轮最多回复</span>
              <input type="number" min="1" max="30" value={settings.maxRepliesPerRun || 8} onChange={(e) => saveSettings({ maxRepliesPerRun: Number(e.target.value) })} />
            </label>
          </div>
          <div className="modeRow engagementToggles">
            <button className={settings.monitorComments ? "on" : ""} onClick={() => saveSettings({ monitorComments: !settings.monitorComments })}>评论</button>
            <button className={settings.monitorMessages ? "on" : ""} onClick={() => saveSettings({ monitorMessages: !settings.monitorMessages })}>私信</button>
            <button className={settings.allowCommentAutoReply ? "on" : ""} onClick={() => saveSettings({ allowCommentAutoReply: !settings.allowCommentAutoReply })}>评论自动回</button>
            <button className={settings.allowMessageAutoReply ? "on" : ""} onClick={() => saveSettings({ allowMessageAutoReply: !settings.allowMessageAutoReply })}>私信自动回</button>
          </div>
          <label className="wideLabel">
            <span>回复口吻 (Voice)</span>
            <div className="flex gap-2 mb-2">
              <button className="text-xs bg-gray-100 px-2 py-1 rounded" onClick={() => saveSettings({ brandVoice: "锋利、直言不讳、一针见血，带点反直觉" })}>Sharp</button>
              <button className="text-xs bg-gray-100 px-2 py-1 rounded" onClick={() => saveSettings({ brandVoice: "真诚、共情、温暖，像老朋友" })}>Empathetic</button>
              <button className="text-xs bg-gray-100 px-2 py-1 rounded" onClick={() => saveSettings({ brandVoice: "专业、严谨、有数据支撑，像行业老手" })}>Expert</button>
            </div>
            <textarea value={settings.brandVoice || ""} onChange={(e) => saveSettings({ brandVoice: e.target.value })} rows={3} />
          </label>
          <label className="wideLabel">
            <span>回复调优 (Learnings)</span>
            <textarea value={settings.recentLearnings || ""} onChange={(e) => saveSettings({ recentLearnings: e.target.value })} placeholder="例如：不要让用户加微信；要推荐他们看第3期视频" rows={2} />
          </label>
        </div>

        <div className="card">
          <div className="cardHead">
            <div className="hLeft"><Clipboard size={14} /><span>最近执行</span></div>
            <span className="cardHint">{recentRuns.length} 条</span>
          </div>
          <div className="engagementRuns">
            {recentRuns.slice(0, 8).map((run) => (
              <article key={run.id}>
                <header><strong>{run.status}</strong><span>{new Date(run.updated_at || run.created_at).toLocaleString()}</span></header>
                <p>{run.summary || run.failureReason || "无摘要"}</p>
                <div className="slotMeta">
                  <span>{run.itemsCount || 0} 条</span>
                  <span>{run.repliedCount || 0} 已回</span>
                  <span>{run.highRiskCount || 0} 高风险</span>
                </div>
              </article>
            ))}
            {!recentRuns.length && <p className="loopHint">暂无执行记录。</p>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardHead">
          <div className="hLeft"><Activity size={14} /><span>互动收件箱</span></div>
          <span className="cardHint">评论 / 私信 / 回复草稿</span>
        </div>
        <div className="engagementItems">
          {recentItems.map((item) => (
            <article key={item.id} className="engagementItem" data-risk={item.risk}>
              <header>
                <div>
                  <strong>{item.author || "未知用户"}</strong>
                  <span>{item.channel === "message" ? "私信" : "评论"} · {item.intent || "general"}</span>
                </div>
                <span className={`riskPill ${item.risk || "low"}`}>{item.risk || "low"}</span>
              </header>
              <p>{item.text || "无文本"}</p>
              {item.replyDraft && <code>{item.replied ? item.replyText || item.replyDraft : item.replyDraft}</code>}
              <div className="slotMeta">
                <span>{item.replied ? "已回复" : "未回复"}</span>
                <span>{item.requiresHuman ? "人工确认" : "可自动"}</span>
                <span>{new Date(item.last_seen_at || item.created_at).toLocaleString()}</span>
              </div>
            </article>
          ))}
          {!recentItems.length && <p className="loopHint">暂无互动记录。</p>}
        </div>
      </div>
    </div>
  );
}

function ReviewView({ activity, storedEvents, pack, platform, notify, logActivity }) {
  const [analyticsResult, setAnalyticsResult] = useState(null);
  const [learningResult, setLearningResult] = useState(null);

  async function runAnalyticsLoop() {
    try {
      const collect = await collectAnalytics({ platform });
      const brief = await createAnalyticsBrief({ snapshots: collect.snapshots || [] });
      const learning = await saveAnalyticsLearning({ publishId: pack.id, keep: brief.brief.wins, change: brief.brief.losses });
      setAnalyticsResult({ collect, brief: brief.brief });
      setLearningResult(learning.learning);
      notify("数据复盘任务已生成");
      logActivity("Analytics · collect/brief/learning 闭环完成");
    } catch (error) {
      notify("Analytics 接口未连接");
      logActivity(`Analytics 失败 · ${error.message}`);
    }
  }

  return (
    <div className="emptyView">
      <div className="row row-2">
        <div className="card">
          <div className="cardHead">
            <div className="hLeft"><Activity size={14} /><span>活动日志</span></div>
            <span className="cardHint">实接 Postgres 后持久化</span>
          </div>
          <div className="logList">
            {activity.map((a, i) => <div key={`${a.t}-${i}`} className="logItem"><span>{a.t}</span><p>{a.msg}</p></div>)}
          </div>
        </div>

        <div className="card">
          <div className="cardHead">
            <div className="hLeft"><Radar size={14} /><span>反馈闭环</span></div>
            <button className="microBtn" onClick={runAnalyticsLoop}><BarChart3 size={12} /> 读取 PostHog / 生成复盘任务</button>
          </div>
          <div className="loopLine">
            <span>评论原句</span><ArrowRight size={12} />
            <span>Agent 诊断</span><ArrowRight size={12} />
            <span>下一期选题</span><ArrowRight size={12} />
            <span>复盘报告</span>
          </div>
          <p className="loopHint">接入数据源后，每条评论会被 Agent 分类（咨询 / 反对 / 共鸣 / 选题信号），并在下一轮自动喂回内容池。</p>
          <div className="analyticsGrid">
            <Metric label="预计收藏率" value={`${Math.round(pack.scores[3].score / 10)}%`} />
            <Metric label="互动设计" value={pack.scores[4].score} />
            <Metric label="合规状态" value={pack.policy.status === "pass" ? "通过" : "需复核"} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardHead">
          <div className="hLeft"><BarChart3 size={14} /><span>Analytics / Learning</span></div>
          <span className="cardHint">回写下一轮内容策略</span>
        </div>
        {analyticsResult || learningResult ? (
          <div className="analyticsLearning">
            {analyticsResult?.brief && (
              <article className="learningBlock">
                <header><Radar size={12} /><strong>Brief</strong><span>{analyticsResult.collect?.connector || "local"}</span></header>
                <p>{analyticsResult.brief.summary}</p>
                <div className="learningSplit">
                  <div><b>Wins</b><ul>{(analyticsResult.brief.wins || []).map((item) => <li key={item}>{item}</li>)}</ul></div>
                  <div><b>Losses</b><ul>{(analyticsResult.brief.losses || []).map((item) => <li key={item}>{item}</li>)}</ul></div>
                </div>
              </article>
            )}
            {learningResult?.learning_json && (
              <article className="learningBlock">
                <header><Sparkles size={12} /><strong>Learning</strong><span>{learningResult.id}</span></header>
                <div className="learningSplit">
                  <div><b>Keep</b><ul>{(learningResult.learning_json.keep || []).map((item) => <li key={item}>{item}</li>)}</ul></div>
                  <div><b>Change</b><ul>{(learningResult.learning_json.change || []).map((item) => <li key={item}>{item}</li>)}</ul></div>
                </div>
              </article>
            )}
          </div>
        ) : (
          <p className="loopHint">点击右上「读取 PostHog / 生成复盘任务」生成 brief 与 learning。空状态不会自动跑接口。</p>
        )}
      </div>

      <div className="card">
        <div className="cardHead">
          <div className="hLeft"><BarChart3 size={14} /><span>埋点事件</span></div>
          <span className="cardHint">本地模拟 PostHog / Plausible</span>
        </div>
        <div className="eventGrid">
          {storedEvents.slice(0, 8).map((event, index) => (
            <article key={`${event.at}-${index}`}>
              <strong>{event.name}</strong>
              <span>{new Date(event.at).toLocaleString()}</span>
              <code>{JSON.stringify(event.payload)}</code>
            </article>
          ))}
          {!storedEvents.length && <p className="loopHint">暂无埋点事件。点击生成、复制或发布任务后会出现。</p>}
        </div>
      </div>
    </div>
  );
}

function ApiView({ health, healthLoading, refreshHealth, copyEnvTemplate, copyText, topic, direction, tone, extraContext }) {
  const prompt = createSystemPrompt({ topic, direction, tone, extraContext });

  return (
    <div className="emptyView">
      <div className="card">
        <div className="cardHead">
          <div className="hLeft"><DatabaseZap size={14} /><span>API 接入位</span></div>
          <div className="headRight">
            <button className="microBtn" onClick={() => refreshHealth(true)} disabled={healthLoading}>
              {healthLoading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} 检测 BFF
            </button>
            <button className="microBtn" onClick={copyEnvTemplate}><Copy size={12} /> 复制 .env</button>
          </div>
        </div>
        <div className="apiGrid">
          {apiSlots.map((slot) => {
            const live = health?.apiSlots?.find((item) => item.key === slot.key);
            return (
              <article key={slot.key} className={`apiSlot status-${slot.status === "必需" ? "must" : slot.status === "推荐" ? "rec" : "opt"}`}>
                <header>
                  <MiniIcon name={slot.icon} size={16} />
                  <strong>{slot.name}</strong>
                  <span>{live?.configured ? "已配置" : slot.status}</span>
                </header>
                <code>{slot.key}</code>
                <p>{slot.usage}</p>
              </article>
            );
          })}
        </div>
      </div>

      <div className="row row-2">
        <div className="card">
          <div className="cardHead">
            <div className="hLeft"><Plug size={14} /><span>BFF 路由</span></div>
            <span className="cardHint">已在 server/src/index.js 落地</span>
          </div>
          <div className="routeList">
            {["GET /api/health", "POST /api/generate · SSE", "GET /api/templates/registry", "POST /api/templates/pick", "POST /api/research/collect", "POST /api/research/brief", "POST /api/research/topics", "POST /api/assets/render-html", "POST /api/assets/export-png", "POST /api/assets/export-video", "POST /api/smoke/graphic", "POST /api/agent/runbook", "GET /api/codex/pending-tasks", "POST /api/codex/task-result", "GET /api/engagement", "POST /api/engagement/check-now", "POST /api/engagement/record", "POST /api/agent/comments/maintain", "POST /api/analytics/collect", "POST /api/analytics/brief", "POST /api/analytics/learning"].map((route) => (
              <span key={route}>{route}</span>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="cardHead">
            <div className="hLeft"><Clipboard size={14} /><span>System Prompt 预览</span></div>
            <button className="microBtn" onClick={() => copyText(prompt, "System Prompt")}><Copy size={12} /> 复制</button>
          </div>
          <pre className="jsonBlock">{prompt}</pre>
        </div>
      </div>
    </div>
  );
}



function Metric({ label, value }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function fileBaseName(p) {
  if (!p) return "";
  const str = String(p);
  const slash = str.lastIndexOf("/");
  return slash >= 0 ? str.slice(slash + 1) : str;
}

function fileChip(path) {
  const name = fileBaseName(path);
  if (!name) return null;
  return <code className="fileChip" title={path}>{name}</code>;
}

function VisualResultPreview({ result, module }) {
  if (!result) return null;
  if (result.manifest) {
    const m = result.manifest;
    return (
      <div className="visualPreview">
        <span className="previewTag">manifest · {m.engine || "scaffold"}</span>
        <strong>{m.compositionId || m.templateId || module.label}</strong>
        <p>{m.next || "Scaffold ready; render once toolchain is configured."}</p>
        {m.licenseWarning && <em className="warnNote">{m.licenseWarning}</em>}
      </div>
    );
  }
  const videoUrl = result.videoPath ? toExportUrl(result.videoPath) : "";
  const files = [result.videoPath, result.pngPath, result.thumbnailPath, ...(result.files || [])].filter(Boolean);
  const seen = new Set();
  const unique = files.filter((f) => { if (seen.has(f)) return false; seen.add(f); return true; });
  return (
    <div className="visualPreview">
      <span className="previewTag">{result.type || module.key} · {result.engine || module.engine}</span>
      {result.chart && (
        <div className="miniBars">
          {result.chart.labels.map((label, i) => {
            const max = Math.max(...result.chart.values, 1);
            const w = Math.max(8, Math.round((Number(result.chart.values[i] || 0) / max) * 100));
            return (
              <div key={label} className="miniBarRow">
                <span>{label}</span>
                <div className="miniTrack"><i style={{ width: `${w}%` }} /></div>
                <b>{result.chart.values[i]}</b>
              </div>
            );
          })}
        </div>
      )}
      {unique.length > 0 && (
        <>
          {videoUrl && (
            <a className="videoExportLink" href={videoUrl} target="_blank" rel="noreferrer">
              <Film size={12} /> 打开 MP4
            </a>
          )}
          <div className="visualPreview__imgRow">
            {unique.slice(0, 6).map((filePath) => {
              const url = toExportUrl(filePath);
              return url ? <a key={filePath} href={url} target="_blank" rel="noreferrer"><img src={url} alt="" /></a> : null;
            })}
          </div>
          <div className="filePathList">
            {unique.slice(0, 4).map((filePath) => <div key={filePath} className="filePathRow"><ImageIcon size={11} />{fileChip(filePath)}</div>)}
          </div>
        </>
      )}
      {result.ratio && <em className="metaLine">ratio {result.ratio}</em>}
    </div>
  );
}

function PngExportSummary({ data }) {
  const files = data.files || [];
  const urls = collectPreviewImageUrls(files);
  return (
    <div className="visualPreview pngSummary">
      <span className="previewTag">deck export · {files.length} 张</span>
      {urls.length > 0 && (
        <div className="visualPreview__imgRow">
          {urls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="" /></a>)}
        </div>
      )}
      <div className="filePathList">
        {files.slice(0, 6).map((filePath) => <div key={filePath} className="filePathRow"><ImageIcon size={11} />{fileChip(filePath)}</div>)}
      </div>
      {data.htmlPath && <em className="metaLine">{fileBaseName(data.htmlPath)}</em>}
    </div>
  );
}

function VisualCard({ card, index }) {
  return (
    <article className={`vCard tone-${card.tone}`} style={{ "--accent": card.accent }}>
      <header>
        <span>{card.eyebrow}</span>
        <b>0{index + 1} / 06</b>
      </header>
      <h3>{card.headline}</h3>
      <p>{card.body}</p>
      <footer>
        <i /><i /><i />
      </footer>
    </article>
  );
}

function Step({ done, icon, title, text }) {
  return (
    <article className={done ? "step done" : "step"}>
      <div className="stepIcon">{icon}</div>
      <strong>{title}</strong>
      <p>{text}</p>
    </article>
  );
}

function PublishModal({ platform, publishStatus, preparePublish, copyText, pack, openPlatform, markPublished, close }) {
  return (
    <div className="modalBackdrop" role="presentation" onClick={close}>
      <section className="publishModal" role="dialog" aria-modal="true" aria-label="发布助手" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">PUBLISH ASSISTANT</p>
            <h2>发布到 {platformMeta[platform].name}</h2>
          </div>
          <button className="iconBtn" aria-label="关闭发布助手" onClick={close}><X size={16} /></button>
        </header>
        <p className="modalIntro">
          网页应用本身无法跨域控制其他网站输入框。开放后由 Codex / Browser-Use / 桌面端 Agent 接管：打开已登录网页端、填充标题/正文/标签、上传素材，停在最终确认页等你点击发布。
        </p>
        <div className="publishSteps">
          <Step done icon={<Check size={14} />} title="内容包已生成" text={`${platformMeta[platform].name} · ${platformMeta[platform].format}`} />
          <Step done={publishStatus !== "idle"} icon={<Bot size={14} />} title="生成 Agent 指令" text="包含标题、正文、标签、素材路径和停在确认页的规则" />
          <Step done={publishStatus === "opened" || publishStatus === "done"} icon={<ExternalLink size={14} />} title="打开已登录网页端" text="由 Codex 或当前浏览器会话执行" />
          <Step done={publishStatus === "done"} icon={<Lock size={14} />} title="显式发布/预约" text="默认 draft；publish/schedule 必须由 runbook mode 明确授权" />
        </div>
        <div className="modalActions">
          <button className="ghostBtn" onClick={preparePublish}><Bot size={14} /> 生成 Agent 任务</button>
          <button className="ghostBtn" onClick={() => copyText(pack.automationPrompt, "Agent 执行指令")}><Copy size={14} /> 复制指令</button>
          <button className="ghostBtn" onClick={openPlatform}><ExternalLink size={14} /> 打开网页端</button>
          <button className="primaryBtn" onClick={markPublished}><CheckCircle2 size={14} /> 标记已发布</button>
        </div>
      </section>
    </div>
  );
}
