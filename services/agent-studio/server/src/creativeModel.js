const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_FALLBACK_MODEL = "deepseek-v4-pro";

function env(key) {
  return globalThis.process?.env?.[key] || "";
}

function extractJsonObject(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function compact(value, max = 80) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeCard(card = {}, index = 0) {
  const layouts = ["hero", "editorial", "dashboard", "timeline", "contrast", "debate"];
  const fallback = layouts[index] || "editorial";
  return {
    layout: layouts.includes(card.layout) ? card.layout : fallback,
    kicker: compact(card.kicker || ["热点借势", "先纠偏", "核心判断", "怎么判断", "反方意见", "评论区接力"][index], 10),
    title: compact(card.title || ["先看结论", "别只看排名", "看工作流迁移", "看三个信号", "也可能是泡沫", "你站哪边？"][index], 15),
    body: compact(card.body || "", 82),
    bullets: Array.isArray(card.bullets) ? card.bullets.slice(0, 3).map((item) => compact(item, 18)) : [],
    note: compact(card.note || "", 64)
  };
}

export function creativeModelConfigured() {
  return Boolean(env("CREATIVE_TEXT_API_KEY") || env("DEEPSEEK_API_KEY") || env("OPENAI_API_KEY"));
}

function creativeModelConfig() {
  const apiKey = env("CREATIVE_TEXT_API_KEY") || env("DEEPSEEK_API_KEY") || env("OPENAI_API_KEY");
  if (!apiKey) return null;
  const baseUrl = (env("CREATIVE_TEXT_BASE_URL") || env("DEEPSEEK_BASE_URL") || env("OPENAI_BASE_URL") || DEFAULT_BASE_URL).replace(/\/+$/g, "");
  const model = env("CREATIVE_TEXT_MODEL") || env("DEEPSEEK_MODEL") || DEFAULT_MODEL;
  const fallbackModel = env("CREATIVE_TEXT_FALLBACK_MODEL") || env("DEEPSEEK_FALLBACK_MODEL") || DEFAULT_FALLBACK_MODEL;
  const timeoutMs = Number(env("CREATIVE_TEXT_TIMEOUT_MS") || 12000);
  return { apiKey, baseUrl, models: [...new Set([model, fallbackModel].filter(Boolean))], timeoutMs };
}

export async function createChatCompletion({ system, user, temperature = 0.7, responseFormat = "text" }) {
  const config = creativeModelConfig();
  if (!config) throw new Error("Creative model not configured");
  
  let lastError = null;
  for (const model of config.models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Authorization": `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature,
          response_format: responseFormat === "json" ? { type: "json_object" } : undefined,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`Model failed: ${response.status}`);
      const payload = await response.json();
      return payload.choices?.[0]?.message?.content || "";
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
    }
  }
  throw lastError;
}

function strList(value, max) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()).slice(0, max) : [];
}

// Real-model content generation for the main pack. Returns the creative core (title, claims,
// antiPattern, playbook, 6 cards) which buildPack folds into its platform formatting + the
// existing sanitize/policy gate. Returns null when no key is set; throws on a hard API error so
// callers can log it and fall back to the deterministic pack.
export async function generateCreativeContent({ topic, direction = "insight", tone = "balanced", extraContext = "" }) {
  const config = creativeModelConfig();
  if (!config) return null;
  let lastError = null;
  for (const model of config.models) {
    try {
      const result = await requestCreativeContent({ ...config, model, topic, direction, tone, extraContext });
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return null;
}

async function requestCreativeContent({ apiKey, baseUrl, model, timeoutMs, topic, direction, tone, extraContext }) {
  const system = [
    "你是多平台内容主理人和增长编辑，只输出 JSON，不要任何解释。",
    "结构遵循：钩子 → 反例 → 核心判断 → 方法 → 可复制 → 互动。",
    "不写 AI 套话（赋能/探索/共创/破局/底层逻辑/抓手/矩阵/降本增效等），讲具体、有观点、有证据。",
    "每张卡必须至少包含一种具体信息：数字阈值、判断条件、场景例子、步骤动作、成本/时间/风险边界、工具/配置取舍。",
    "禁止把 topic 原句换个说法反复写。禁止使用“先想清楚再做小的”“大多数人理解错了”“不是执行问题”这类空泛模板句。",
    "如果主题是工具/模型/硬件选择，必须输出决策矩阵：适合谁、不适合谁、成本、隐私、质量、延迟、维护成本。",
    "如果主题适合视频，cards 和 playbook 必须能直接变成分镜台词，不允许只有抽象观点。",
    "不输出域名、服务器、账号、token 等隐私或基础设施信息。",
    "titleCandidates 给 3 个，每个不超过 24 字；claims 3 条；playbook 3-5 步；cards 正好 6 张。"
  ].join("\n");

  const user = JSON.stringify({
    topic,
    direction,
    tone,
    extraContext,
    requiredJsonShape: {
      title: "",
      titleCandidates: ["", "", ""],
      claims: ["", "", ""],
      antiPattern: "",
      playbook: ["", "", "", ""],
      cards: Array.from({ length: 6 }, () => ({ eyebrow: "", headline: "", body: "" }))
    }
  });

  const content = await createChatCompletion({ system, user, temperature: 0.8, responseFormat: "json" });
  const parsed = extractJsonObject(content);
  if (!parsed || !Array.isArray(parsed.cards) || parsed.cards.length < 1) return null;
  return {
    provider: "openai-compatible",
    model,
    title: typeof parsed.title === "string" ? parsed.title.trim() : "",
    titleCandidates: strList(parsed.titleCandidates, 3),
    claims: strList(parsed.claims, 3),
    antiPattern: typeof parsed.antiPattern === "string" ? parsed.antiPattern.trim() : "",
    playbook: strList(parsed.playbook, 5),
    cards: parsed.cards.slice(0, 6).map((card) => ({
      eyebrow: String(card?.eyebrow || card?.kicker || "").trim(),
      headline: String(card?.headline || card?.title || "").trim(),
      body: String(card?.body || "").trim()
    }))
  };
}

export async function planXhsCarouselWithCreativeModel({ pack, style = "html5up-editorial" }) {
  const apiKey = env("CREATIVE_TEXT_API_KEY") || env("DEEPSEEK_API_KEY") || env("OPENAI_API_KEY");
  if (!apiKey) return null;

  const baseUrl = (env("CREATIVE_TEXT_BASE_URL") || env("DEEPSEEK_BASE_URL") || env("OPENAI_BASE_URL") || DEFAULT_BASE_URL).replace(/\/+$/g, "");
  const model = env("CREATIVE_TEXT_MODEL") || env("DEEPSEEK_MODEL") || DEFAULT_MODEL;
  const fallbackModel = env("CREATIVE_TEXT_FALLBACK_MODEL") || env("DEEPSEEK_FALLBACK_MODEL") || DEFAULT_FALLBACK_MODEL;
  const timeoutMs = Number(env("CREATIVE_TEXT_TIMEOUT_MS") || 12000);
  const models = [...new Set([model, fallbackModel].filter(Boolean))];
  let lastError = null;

  for (const currentModel of models) {
    try {
      return await requestCreativePlan({ apiKey, baseUrl, model: currentModel, timeoutMs, pack, style });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Creative text model failed");
}

async function requestCreativePlan({ apiKey, baseUrl, model, timeoutMs, pack, style }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "你是小红书移动端图文总监，只输出 JSON。",
              "目标是风格一致但每页版式不同，禁止 6 张同一个骨架。",
              "固定 6 张：hero, editorial, dashboard, timeline, contrast, debate。",
              "每张标题不超过 15 字，正文不超过 82 字，bullet 不超过 18 字。",
              "内容要有观点密度、反方视角和评论互动，不要套话。"
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify({
              topic: pack.core,
              title: pack.title,
              style,
              existingCards: pack.cards,
              platformCopy: pack.platformCopy?.xhs,
              requiredJsonShape: {
                cards: [
                  { layout: "hero", kicker: "", title: "", body: "", bullets: ["", "", ""], note: "" },
                  { layout: "editorial", kicker: "", title: "", body: "", bullets: ["", ""], note: "" },
                  { layout: "dashboard", kicker: "", title: "", body: "", bullets: ["", "", ""], note: "" },
                  { layout: "timeline", kicker: "", title: "", body: "", bullets: ["", "", ""], note: "" },
                  { layout: "contrast", kicker: "", title: "", body: "", bullets: ["", "", ""], note: "" },
                  { layout: "debate", kicker: "", title: "", body: "", bullets: ["", ""], note: "" }
                ]
              }
            })
          }
        ]
      })
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Creative text model failed: ${response.status}`);
  }
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(content);
  if (!parsed?.cards?.length) return null;
  return {
    provider: "openai-compatible",
    model,
    style,
    cards: parsed.cards.slice(0, 6).map(normalizeCard)
  };
}
