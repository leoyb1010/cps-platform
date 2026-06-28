function env(key) {
  return globalThis.process?.env?.[key] || "";
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} failed: ${response.status}`);
  return response.json();
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = source.url || source.title;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function collectTavily(topic) {
  const key = env("TAVILY_API_KEY") || env("TREND_SOURCE_API");
  if (!key) return [];
  const data = await fetchJson("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query: topic,
      search_depth: "advanced",
      include_answer: true,
      include_raw_content: false,
      max_results: 6
    })
  });
  return (data.results || []).map((item) => ({
    url: item.url,
    title: item.title,
    text: normalizeText(item.content || item.raw_content || item.title),
    platform: "tavily",
    type: "search_result"
  }));
}

async function collectFirecrawl(topic) {
  const key = env("FIRECRAWL_API_KEY");
  if (!key) return [];
  const data = await fetchJson("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: topic, limit: 6 })
  });
  const items = Array.isArray(data.data) ? data.data : [];
  return items.map((item) => ({
    url: item.url,
    title: item.title || item.metadata?.title,
    text: normalizeText(item.markdown || item.description || item.content || item.title),
    platform: "firecrawl",
    type: "search_result"
  }));
}

async function collectJina(topic) {
  const key = env("JINA_API_KEY");
  if (!key) return [];
  const url = `https://s.jina.ai/${encodeURIComponent(topic)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) throw new Error(`Jina search failed: ${response.status}`);
  const data = await response.json().catch(() => null);
  const items = Array.isArray(data?.data) ? data.data : [];
  return items.slice(0, 6).map((item) => ({
    url: item.url,
    title: item.title,
    text: normalizeText(item.content || item.description || item.title),
    platform: "jina",
    type: "search_result"
  }));
}

export async function collectResearchSources({ topic, sources = [], platform = "web" }) {
  const providerResults = await Promise.allSettled([
    collectTavily(topic),
    collectFirecrawl(topic),
    collectJina(topic)
  ]);
  const providerSources = providerResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const errors = providerResults
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason?.message || String(result.reason));

  return {
    providerSources: uniqueSources([...sources, ...providerSources]).filter((source) => source.text || source.title),
    errors,
    connector: providerSources.length ? "live-research-connectors" : "local-codex-research-runbook",
    platform
  };
}
