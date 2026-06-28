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
} from "../lib/catalog.js";
import { buildPack, cleanTopic, createSystemPrompt, svgForPack } from "../lib/contentEngine.js";
import { templateSourceCatalog, visualStyleCatalog } from "../lib/visualEngine.js";
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
  generateExplainAnimationAsset,
  generateReactVideoAsset,
  generatePack,
  getCreditBalance,
  getFactoryConfig,
  estimateFactoryJob,
  generateFactoryJob,
  getBillingPlans,
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
} from "../lib/apiClient.js";
import { getStoredEvents, trackEvent } from "../lib/analytics.js";
import { PlatformIcon } from "../components/PlatformIcon.jsx";
import { collectPreviewImageUrls, toExportUrl } from "../lib/exportUrl.js";
import { TemplateGallery } from "../components/TemplateGallery.jsx";
import { loadTemplatePrefs, resolveStyleForPack } from "../lib/templateRegistry.js";
import { buildTemplateApiPayload } from "../lib/templateApiPayload.js";

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
  assets: "Visual Studio",
  publish: "Publish",
  autopilot: "Autopilot",
  series: "Series",
  engagement: "Engagement",
  review: "Review",
  api: "API",
  business: "Business"
};

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
  const files = [result.pngPath, result.thumbnailPath, ...(result.files || [])].filter(Boolean);
  const seen = new Set();
  const unique = files.filter((f) => {
    if (seen.has(f)) return false;
    seen.add(f);
    return true;
  });
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


export function FactoryView({ setTopic, setGeneratedPack, setPlatform, navigateView, notify, logActivity }) {
  const [config, setConfig] = useState(null);
  const [credits, setCredits] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    assetType: "carousel",
    platform: "xhs",
    intent: "educate",
    prompt: "用 AI 做一组能卖会员的内容素材",
    audience: "小白创作者和小商家",
    product: "AI 素材工厂",
    style: "premium",
    modelPreset: "balanced",
    count: 1,
    duration: 12
  });

  useEffect(() => {
    refreshFactory(false);
  }, []);

  useEffect(() => {
    if (!form.prompt.trim()) return;
    const timer = window.setTimeout(() => estimateJob(false), 350);
    return () => window.clearTimeout(timer);
  }, [form.assetType, form.platform, form.intent, form.prompt, form.style, form.modelPreset, form.count, form.duration]);

  async function refreshFactory(showToast = true) {
    try {
      const [cfg, creditData] = await Promise.all([getFactoryConfig(), getCreditBalance()]);
      setConfig(cfg);
      setCredits(creditData.credits);
      if (showToast) notify("素材工厂配置已刷新");
    } catch (error) {
      notify("素材工厂接口未连接");
      logActivity(`Factory 配置失败 · ${error.message}`);
    }
  }

  async function estimateJob(showToast = true) {
    try {
      const data = await estimateFactoryJob(form);
      setEstimate(data);
      if (showToast) notify(`预计消耗 ${data.creditsEstimated} 积分`);
    } catch (error) {
      logActivity(`Factory 预估失败 · ${error.message}`);
    }
  }

  async function generateJob() {
    if (!form.prompt.trim()) {
      notify("先输入一句话主题");
      return;
    }
    setBusy(true);
    try {
      const data = await generateFactoryJob(form);
      setResult(data);
      setCredits(data.credits);
      const pack = data.result?.pack;
      if (pack) {
        setGeneratedPack?.(pack);
        setTopic?.(form.prompt);
        setPlatform?.(form.platform === "generic" ? "xhs" : form.platform);
      }
      notify(data.ok ? "素材已生成并扣减积分" : "生成失败，积分已退回");
      logActivity(`Factory · ${form.assetType} · ${data.ok ? "completed" : "failed"}`);
    } catch (error) {
      notify("素材生成失败");
      logActivity(`Factory 生成失败 · ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  const assetTypes = config?.assetTypes || [];
  const styles = config?.styles || [];
  const presets = config?.modelPresets || [];
  const available = credits?.availableCredits ?? credits?.balance ?? 0;
  const previewFiles = collectPreviewImageUrls(
    result?.result?.assets?.files,
    result?.result?.assets?.files?.map?.((item) => item),
    result?.result?.motionPreview?.thumbnailPath
  );

  return (
    <div className="emptyView factoryView">
      <div className="card factoryHero">
        <div className="cardHead">
          <div className="hLeft"><Sparkles size={14} /><span>AI 素材工厂 · 小白向导</span></div>
          <div className="headRight">
            <span className="statusPill ok">余额 {available} 积分</span>
            <button className="microBtn" onClick={() => refreshFactory()}><RefreshCw size={12} /> 刷新</button>
          </div>
        </div>
        <div className="factoryHero__content">
          <span className="factoryKicker">Material factory for non-designers</span>
          <h1>把一句话变成能发布、能扣费、能复用的素材</h1>
          <p>小白走向导，团队走 Agent OS。先生成图文、商品图提示词和视频分镜，再进入预览、发布、互动和复盘。</p>
          <div className="factoryHero__actions">
            <button className="primaryBtn" onClick={generateJob} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} 立即生成</button>
            <button className="ghostBtn" onClick={() => navigateView?.("studio")}><LayoutDashboard size={14} /> 高级工作台</button>
          </div>
        </div>
        <div className="factoryMetrics">
          <Metric label="当前计划" value={credits?.plan || "free"} />
          <Metric label="可用积分" value={available} />
          <Metric label="预计消耗" value={estimate?.creditsEstimated || "-"} />
          <Metric label="模型网关" value={estimate?.providerPlan?.provider || "local"} />
        </div>
      </div>

      <div className="row row-2">
        <div className="card factoryWizard">
          <div className="cardHead"><div className="hLeft"><Wand2 size={14} /><span>生成向导</span></div><span className="cardHint">6 步完成</span></div>

          <label>1. 你要做什么？</label>
          <div className="factoryChoiceGrid">
            {assetTypes.map((item) => (
              <button key={item.id} className={form.assetType === item.id ? "factoryChoice on" : "factoryChoice"} onClick={() => setForm((s) => ({ ...s, assetType: item.id, platform: item.defaultPlatform || s.platform }))}>
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>

          <label>2. 发到哪里？</label>
          <select value={form.platform} onChange={(e) => setForm((s) => ({ ...s, platform: e.target.value }))}>
            {Object.entries(platformMeta).map(([id, meta]) => <option key={id} value={id}>{meta.name}</option>)}
            <option value="generic">通用导出</option>
          </select>

          <label>3. 输入一句话</label>
          <textarea rows={4} value={form.prompt} onChange={(e) => setForm((s) => ({ ...s, prompt: e.target.value }))} placeholder="例如：帮我做一组卖 AI 素材工厂会员的小红书图文" />

          <div className="settingsGrid">
            <label><span>受众</span><input value={form.audience} onChange={(e) => setForm((s) => ({ ...s, audience: e.target.value }))} /></label>
            <label><span>产品/服务</span><input value={form.product} onChange={(e) => setForm((s) => ({ ...s, product: e.target.value }))} /></label>
          </div>

          <label>4. 选择风格</label>
          <div className="factoryChoiceGrid styleChoices">
            {styles.map((item) => (
              <button key={item.id} className={form.style === item.id ? "factoryChoice on" : "factoryChoice"} onClick={() => setForm((s) => ({ ...s, style: item.id }))}>
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>

          <label>5. 模型与积分</label>
          <div className="modeRow">
            {presets.map((item) => <button key={item.id} className={form.modelPreset === item.id ? "on" : ""} onClick={() => setForm((s) => ({ ...s, modelPreset: item.id }))}>{item.label}</button>)}
          </div>
          {estimate?.warnings?.length > 0 && <div className="factoryWarnings">{estimate.warnings.map((w) => <span key={w}>{w}</span>)}</div>}

          <div className="modalActions">
            <button className="ghostBtn" onClick={() => estimateJob()}><Gauge size={14} /> 重新预估</button>
            <button className="primaryBtn" onClick={generateJob} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} 生成并扣积分</button>
          </div>
        </div>

        <div className="card factoryResult">
          <div className="cardHead"><div className="hLeft"><ImageIcon size={14} /><span>结果预览</span></div><span className="cardHint">可继续进入 Agent OS</span></div>
          {!result && (
            <div className="factoryEmptyState">
              <div className="factoryEmptyState__orb"><Sparkles size={22} /></div>
              <strong>还没有生成结果</strong>
              <p>左侧填一句话后，系统会先预估积分，再生成素材包。失败会退回预扣积分。</p>
              <div className="factoryEmptyState__steps">
                <span>预估积分</span><span>生成素材</span><span>写入账单</span>
              </div>
            </div>
          )}
          {busy && (
            <div className="factorySkeleton" aria-label="正在生成素材">
              <i /><i /><i />
            </div>
          )}
          {result?.result?.pack && (
            <div className="copyBlock">
              <div className="copyMeta"><span>{result.result.type}</span><small>{result.job?.id}</small></div>
              <h2>{result.result.pack.title}</h2>
              <pre>{result.result.pack.platformCopy?.[form.platform]?.body || result.result.pack.platformCopy?.xhs?.body || result.result.gateway?.output}</pre>
            </div>
          )}
          {previewFiles.length > 0 && <div className="visualPreview__imgRow">{previewFiles.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="" /></a>)}</div>}
          {result?.result?.imagePrompt && <pre className="jsonBlock">{result.result.imagePrompt}</pre>}
          {result?.result?.storyboard && <pre className="jsonBlock">{JSON.stringify(result.result.storyboard, null, 2)}</pre>}
          {result?.usage && <div className="factoryUsage"><Metric label="已扣积分" value={result.usage.credits_charged} /><Metric label="Provider" value={result.usage.provider} /><Metric label="Tokens" value={result.usage.input_units + result.usage.output_units} /></div>}
          <div className="modalActions">
            <button className="ghostBtn" onClick={() => navigateView?.("preview")} disabled={!result?.result?.pack}><Wand2 size={14} /> Preview Hub</button>
            <button className="ghostBtn" onClick={() => navigateView?.("studio")} disabled={!result?.result?.pack}><LayoutDashboard size={14} /> Studio 深编</button>
            <button className="ghostBtn" onClick={() => navigateView?.("publish")} disabled={!result?.result?.pack}><Send size={14} /> 发布助手</button>
            <button className="ghostBtn" onClick={() => navigateView?.("business")}><DatabaseZap size={14} /> 积分账单</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StudioView(props) {
  const {
    topic,
    setTopic,
    direction,
    setDirection,
    tone,
    setTone,
    extraContext,
    setExtraContext,
    pack,
    platform,
    setPlatform,
    currentCopy,
    cleanTitle,
    titleIndex,
    setTitleIndex,
    activeFrame,
    setActiveFrame,
    isPlaying,
    setIsPlaying,
    frame,
    agentStep,
    agentRunning,
    runAgent,
    copyText,
    exportSvg,
    exportJson,
    openPublish,
    streamSource,
    smokeResult,
    smokeRunning,
    runSmokeTest
  } = props;

  return (
    <div className="studio">
      <section className="row row-3">
        <div className="card inputCard">
          <div className="cardHead">
            <div className="hLeft"><PenLine size={14} /><span>输入</span></div>
            <span className="cardHint">主体 + 方向 + 语气 + 上下文</span>
          </div>

          <label htmlFor="topic">主体</label>
          <textarea
            id="topic"
            rows={2}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如：用 Claude 做一个能自己跑活的小红书账号"
          />

          <label>方向</label>
          <div className="dirGrid">
            {directionLibrary.map((d) => (
              <button
                key={d.id}
                className={d.id === direction ? "dir on" : "dir"}
                style={{ "--c": d.accent }}
                onClick={() => setDirection(d.id)}
              >
                <strong>{d.label}</strong>
                <span>{d.desc}</span>
              </button>
            ))}
          </div>

          <div className="splitRow">
            <div>
              <label>语气</label>
              <div className="toneRow">
                {Object.entries(toneProfiles).map(([id, t]) => (
                  <button key={id} className={id === tone ? "ton on" : "ton"} onClick={() => setTone(id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="context">补充上下文</label>
              <input
                id="context"
                type="text"
                placeholder="例：账号刚 3 个月 / 目标海外用户 / 想引导加微信"
                value={extraContext}
                onChange={(e) => setExtraContext(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="card agentCard">
          <div className="cardHead">
            <div className="hLeft"><Bot size={14} /><span>Agent 链路</span></div>
            <div className="headRight">
              <button className="microBtn" onClick={runSmokeTest} disabled={smokeRunning}>
                {smokeRunning ? <Loader2 size={12} className="spin" /> : <ImageIcon size={12} />}
                {smokeRunning ? "测试中" : "一键图文测试"}
              </button>
              <button className="microBtn" onClick={runAgent} disabled={agentRunning}>
                {agentRunning ? <Loader2 size={12} className="spin" /> : <Play size={12} />}
                {agentRunning ? "运行中" : "运行"}
              </button>
            </div>
          </div>
          <div className="sourceLine">
            <span>生成来源</span>
            <b>{streamSource === "bff" ? "BFF / SSE" : streamSource === "local-fallback" ? "本地回退" : streamSource}</b>
          </div>
          <div className="sourceLine">
            <span>一键图文测试</span>
            <b>生成小红书内容包 → 导出 PNG → 创建 draft runbook；不直接控制浏览器</b>
          </div>
          {smokeResult && (
            <div className="smokeSummary">
              <div className="smokeRow">
                <span className="smokeTag" data-state={smokeResult.browserExecuted ? "exec" : "queued"}>
                  {smokeResult.browserExecuted ? "已浏览器执行" : "已入队 Codex App"}
                </span>
                <span className="smokeMeta">pack {smokeResult.pack?.id?.slice(-12) || "-"}</span>
                <span className="smokeMeta">runbook {smokeResult.runbook?.id?.slice(-12) || "-"}</span>
              </div>
              <div className="smokeFiles">
                {(smokeResult.assets?.files || []).slice(0, 5).map((path) => (
                  <span key={path} className="fileChip" title={path}>{path.split("/").pop()}</span>
                ))}
              </div>
            </div>
          )}
          <div className="stages">
            {agentStages.map((stage, i) => {
              const done = i < agentStep || agentStep >= agentStages.length;
              const active = i === agentStep && agentRunning;
              return (
                <div key={stage.key} className={`stage ${done ? "done" : ""} ${active ? "active" : ""}`}>
                  <div className="stageDot">
                    {done ? <Check size={12} /> : active ? <Loader2 size={12} className="spin" /> : i + 1}
                  </div>
                  <div>
                    <strong>{stage.name}</strong>
                    <span>{stage.detail}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card scoreCard">
          <div className="cardHead">
            <div className="hLeft"><Gauge size={14} /><span>生成评分</span></div>
            <span className="cardHint">{rubric.length} 项质量门槛</span>
          </div>
          <div className="scoreList">
            {pack.scores.map((s) => (
              <div key={s.name} className="scoreItem" data-tier={scoreTier(s.score)}>
                <div className="scoreTop">
                  <div className="scoreName"><MiniIcon name={s.icon} /> {s.name}</div>
                  <b>{s.score}</b>
                </div>
                <span>{s.rule}</span>
                <div className="bar"><i style={{ width: `${s.score}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card titleCard">
        <div className="cardHead">
          <div className="hLeft"><Wand2 size={14} /><span>候选标题</span></div>
          <span className="cardHint">点击选用 · 影响本屏标题预览</span>
        </div>
        <div className="titleRow">
          {pack.titleCandidates.map((t, i) => (
            <button key={t} className={i === titleIndex ? "titleBtn on" : "titleBtn"} onClick={() => setTitleIndex(i)}>
              <span>0{i + 1}</span>
              <strong>{t}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="row row-2">
        <div className="card platformCard">
          <div className="cardHead">
            <div className="hLeft"><Globe size={14} /><span>平台输出</span></div>
            <button className="microBtn" onClick={() => copyText(currentCopy.body, `${platformMeta[platform].name} 文案`)}>
              <Copy size={12} /> 复制
            </button>
          </div>
          <PlatformTabs platform={platform} setPlatform={setPlatform} />

          <CopyBlock platform={platform} currentCopy={currentCopy} title={cleanTitle} />

          <div className="quickEdits">
            <button onClick={() => setTone("sharp")} className={tone === "sharp" ? "on" : ""}><Flame size={12} /> 更锋利</button>
            <button onClick={() => setTone("human")} className={tone === "human" ? "on" : ""}><MessageSquareText size={12} /> 更真人</button>
            <button onClick={() => setTone("playful")} className={tone === "playful" ? "on" : ""}><Sparkles size={12} /> 更有梗</button>
            <button onClick={() => setTone("expert")} className={tone === "expert" ? "on" : ""}><Target size={12} /> 更专业</button>
          </div>
        </div>

        <div className="card videoCard">
          <div className="cardHead">
            <div className="hLeft"><Film size={14} /><span>视频分镜</span></div>
            <button className="microBtn" onClick={() => setIsPlaying((v) => !v)}>
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              {isPlaying ? "暂停" : "预览"}
            </button>
          </div>

          <div className="stage">
            <div className="stageScreen">
              <div className="stageBars"><i /><i /><i /></div>
              <span className="stageTime">{frame.time}</span>
              <strong>{frame.overlay}</strong>
              <p>{frame.visual}</p>
              <div className="stageVoice"><span>VO</span><em>{frame.voice}</em></div>
            </div>

            <div className="frameList">
              {pack.videoFrames.map((f, i) => (
                <button key={f.time} className={i === activeFrame ? "frame on" : "frame"} onClick={() => setActiveFrame(i)}>
                  <b>{f.time}</b>
                  <span>{f.shot}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="card cardsCard">
        <div className="cardHead">
          <div className="hLeft"><ImageIcon size={14} /><span>图文卡片样机</span></div>
          <div className="headRight">
            <button className="microBtn" onClick={exportSvg}><Download size={12} /> SVG</button>
            <button className="microBtn" onClick={exportJson}><FileJson size={12} /> JSON</button>
            <button className="microBtn" onClick={openPublish}><Send size={12} /> 发布</button>
          </div>
        </div>
        <div className="cardStrip">
          {pack.cards.map((c, i) => <VisualCard card={c} index={i} key={`${c.tone}-${i}`} />)}
        </div>
      </section>
    </div>
  );
}

export function PublishView(props) {
  const {
    pack,
    platform,
    setPlatform,
    currentCopy,
    publishStatus,
    draftTask,
    preparePublish,
    openPlatform,
    markPublished,
    notify,
    logActivity,
    copyText,
    openModal
  } = props;
  const [pendingTasks, setPendingTasks] = useState([]);
  const [runbook, setRunbook] = useState(null);
  const [publishMode, setPublishMode] = useState("draft");
  const [scheduledAt, setScheduledAt] = useState("");

  async function createRunbook() {
    try {
      const response = await createCodexRunbook({ pack, platforms: [platform], mode: publishMode, scheduledAt });
      setRunbook(response.runbook);
      notify("Codex runbook 已入队");
      logActivity(`Codex · ${publishMode} runbook 已入队`);
      await refreshPendingTasks();
    } catch (error) {
      notify("Codex runbook 创建失败");
      logActivity(`Codex runbook 失败 · ${error.message}`);
    }
  }

  async function refreshPendingTasks() {
    try {
      const response = await listPendingCodexTasks();
      setPendingTasks(response.tasks || []);
      notify("已刷新 Codex 任务");
    } catch (error) {
      notify("Codex pending-tasks 未连接");
      logActivity(`Codex pending 失败 · ${error.message}`);
    }
  }

  return (
    <div className="emptyView">
      <div className="card">
        <div className="cardHead">
          <div className="hLeft"><MousePointerClick size={14} /><span>发布助手</span></div>
          <div className="headRight">
            <button className="microBtn" onClick={openModal}><Clipboard size={12} /> 流程弹窗</button>
            <button className="microBtn" onClick={() => copyText(pack.automationPrompt, "Agent 发布指令")}><Copy size={12} /> 复制指令</button>
          </div>
        </div>
        <PlatformTabs platform={platform} setPlatform={setPlatform} />
        <div className="publishOps">
          <div className="guardrailPanel">
            <ShieldCheck size={18} />
            <strong>显式发布授权</strong>
            <p>默认 draft。这个按钮只创建 Codex app 待执行 runbook，不等于已经打开浏览器或发布。只有这里选择 publish 或 schedule 后生成的 runbook，才允许本地执行器进入最终发布/预约动作；遇到登录、验证码、风控或高风险内容必须回传 waiting_for_user。</p>
            <div className="modeRow">
              {["draft", "publish", "schedule"].map((mode) => <button key={mode} className={publishMode === mode ? "on" : ""} onClick={() => setPublishMode(mode)}>{mode}</button>)}
            </div>
            <input type="text" placeholder="预约时间，例如 今晚 20:30" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
          <CopyBlock platform={platform} currentCopy={currentCopy} title={currentCopy.title} />
        </div>
        <div className="publishSteps">
          <Step done icon={<Check size={14} />} title="内容包已生成" text={`${platformMeta[platform].name} · ${platformMeta[platform].format}`} />
          <Step done={publishStatus !== "idle"} icon={<Bot size={14} />} title="生成 Agent 指令" text="标题、正文、标签、素材路径、确认页停留规则" />
          <Step done={publishStatus === "opened" || publishStatus === "done"} icon={<ExternalLink size={14} />} title="打开已登录网页端" text="由 Codex、本地浏览器扩展或 Browser-Use 执行" />
          <Step done={publishStatus === "done"} icon={<Lock size={14} />} title="显式发布/预约" text="默认 draft；publish/schedule 必须由 runbook mode 明确授权" />
        </div>
        <div className="modalActions">
          <button className="ghostBtn" onClick={createRunbook}><Bot size={14} /> 入队 Codex app（未执行浏览器）</button>
          <button className="ghostBtn" onClick={refreshPendingTasks}><RefreshCw size={14} /> 刷新任务</button>
          <button className="ghostBtn" onClick={preparePublish}><Clipboard size={14} /> 兼容草稿</button>
          <button className="ghostBtn" onClick={openPlatform}><ExternalLink size={14} /> 打开网页端</button>
          <button className="primaryBtn" onClick={markPublished}><CheckCircle2 size={14} /> 标记已发布</button>
        </div>
      </div>

      {runbook && (
        <div className="card">
          <div className="cardHead">
            <div className="hLeft"><Bot size={14} /><span>Codex Runbook</span></div>
            <span className="cardHint">npm run codex:poll 可轮询这些任务</span>
          </div>
          <pre className="jsonBlock">{JSON.stringify(runbook, null, 2)}</pre>
        </div>
      )}

      <div className="card">
        <div className="cardHead">
          <div className="hLeft"><Activity size={14} /><span>Pending Codex Tasks</span></div>
          <span className="cardHint">persistent server/data/state.json</span>
        </div>
        <div className="eventGrid">
          {pendingTasks.map((task) => (
            <article key={task.id}>
              <strong>{task.id}</strong>
              <span>{task.status} · {task.platform} · {task.mode}</span>
              <code>{task.type}</code>
            </article>
          ))}
          {!pendingTasks.length && <p className="loopHint">暂无 pending/running/waiting_for_user 任务。</p>}
        </div>
      </div>

      {draftTask && (
        <div className="card">
          <div className="cardHead">
            <div className="hLeft"><Clipboard size={14} /><span>发布任务对象</span></div>
            <span className="cardHint">{draftTask.stopCondition}</span>
          </div>
          <pre className="jsonBlock">{JSON.stringify(draftTask, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export function BusinessView() {
  const [billing, setBilling] = useState(null);
  const [plans, setPlans] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    refreshBilling();
  }, []);

  async function refreshBilling() {
    setLoading(true);
    try {
      const [creditData, planData] = await Promise.all([getCreditBalance(), getBillingPlans()]);
      setBilling(creditData);
      setPlans(planData);
    } catch {
      setBilling(null);
    } finally {
      setLoading(false);
    }
  }

  const credits = billing?.credits;
  const usage = billing?.usage || [];
  const livePlans = plans?.plans || [];

  return (
    <div className="emptyView businessView">
      <div className="card">
        <div className="cardHead">
          <div className="hLeft"><DatabaseZap size={14} /><span>会员 / 积分 / Token 商业化</span></div>
          <div className="headRight">
            <span className="statusPill ok">{billing ? "ledger live" : "docs fallback"}</span>
            <button className="microBtn" onClick={refreshBilling} disabled={loading}>{loading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} 刷新</button>
          </div>
        </div>
        <div className="factoryMetrics">
          <Metric label="当前计划" value={credits?.plan || "free"} />
          <Metric label="可用积分" value={credits?.availableCredits ?? "-"} />
          <Metric label="余额" value={credits?.balance ?? "-"} />
          <Metric label="本月赠送" value={credits?.includedMonthlyCredits ?? "-"} />
        </div>
        <p className="loopHint">MVP 已落地 credits ledger stub：素材工厂生成会记录 usage_events 并扣减 credit_ledger。真实支付、订阅 webhook 和发票后续接入。</p>
      </div>

      <div className="card">
        <div className="cardHead">
          <div className="hLeft"><Sparkles size={14} /><span>定价包装</span></div>
          <span className="cardHint">payment coming soon</span>
        </div>
        <div className="pricingGrid">
          {(livePlans.length ? livePlans : pricingTiers).map((tier) => {
            const id = tier.id || tier.plan;
            const recommended = id === "creator" || id === "Creator";
            return (
              <article key={id} className={recommended ? "pricingTier pricingTier--featured" : "pricingTier"}>
                {recommended && <span className="pricingTier__badge">最受欢迎</span>}
                <strong>{tier.name || tier.plan}</strong>
                <b>{tier.price}</b>
                <span>{tier.audience}</span>
                <p>{tier.features?.join(" / ") || tier.limits}</p>
                <button className={recommended ? "primaryBtn" : "microBtn"} disabled>升级即将开放</button>
              </article>
            );
          })}
        </div>
      </div>

      <div className="row row-2">
        <div className="card">
          <div className="cardHead"><div className="hLeft"><Activity size={14} /><span>最近积分流水</span></div><span className="cardHint">credit_ledger</span></div>
          <div className="eventGrid">
            {(credits?.recentLedger || []).slice(0, 8).map((item) => (
              <article key={item.id}>
                <strong>{item.type} · {item.amount}</strong>
                <span>balance {item.balance_after}</span>
                <code>{item.reason || item.job_id}</code>
              </article>
            ))}
            {!credits?.recentLedger?.length && <p className="loopHint">暂无积分流水。去素材工厂生成一次即可看到扣费记录。</p>}
          </div>
        </div>

        <div className="card">
          <div className="cardHead"><div className="hLeft"><BarChart3 size={14} /><span>最近模型用量</span></div><span className="cardHint">usage_events</span></div>
          <div className="eventGrid">
            {usage.slice(0, 8).map((item) => (
              <article key={item.id}>
                <strong>{item.modality} · {item.task}</strong>
                <span>{item.provider} / {item.model}</span>
                <code>{item.credits_charged} credits · {item.input_units + item.output_units} units</code>
              </article>
            ))}
            {!usage.length && <p className="loopHint">暂无模型用量记录。</p>}
          </div>
        </div>
      </div>

      <div className="row row-2">
        <div className="card">
          <div className="cardHead"><div className="hLeft"><TrendingUp size={14} /><span>路线图</span></div></div>
          <div className="roadmap">
            {roadmapItems.map((item) => (
              <article key={item.version}>
                <span>{item.version}</span>
                <strong>{item.title}</strong>
                <p>{item.items.join(" / ")}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="cardHead"><div className="hLeft"><ShieldCheck size={14} /><span>合规与数据表</span></div></div>
          <div className="tableList">
            {[...databaseTables, "credit_accounts", "credit_ledger", "usage_events", "factory_jobs"].map((table) => <code key={table}>{table}</code>)}
          </div>
        </div>
      </div>
    </div>
  );
}
