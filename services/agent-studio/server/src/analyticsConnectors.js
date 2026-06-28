function env(key) {
  return globalThis.process?.env?.[key] || "";
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} failed: ${response.status}`);
  return response.json();
}

async function collectPostHog({ event = "$pageview", days = 7 }) {
  const key = env("POSTHOG_API_KEY") || env("VITE_POSTHOG_KEY");
  const projectId = env("POSTHOG_PROJECT_ID");
  const host = env("POSTHOG_HOST") || "https://app.posthog.com";
  if (!key || !projectId) return null;

  const after = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const data = await fetchJson(`${host}/api/projects/${projectId}/events/?event=${encodeURIComponent(event)}&after=${encodeURIComponent(after)}&limit=100`, {
    headers: { Authorization: `Bearer ${key}` }
  });
  const results = Array.isArray(data.results) ? data.results : [];
  return {
    provider: "posthog",
    event,
    window: `${days}d`,
    count: results.length,
    samples: results.slice(0, 5).map((item) => ({
      timestamp: item.timestamp,
      distinct_id: item.distinct_id,
      properties: item.properties
    }))
  };
}

export async function collectAnalyticsSnapshots({ platform, publishUrl = "", event, days }) {
  const errors = [];
  const snapshots = [];

  try {
    const posthog = await collectPostHog({ event, days });
    if (posthog) {
      snapshots.push({
        window: posthog.window,
        views: posthog.count,
        likes: 0,
        comments: 0,
        saves: 0,
        provider: posthog.provider,
        source: event || "$pageview",
        samples: posthog.samples
      });
    }
  } catch (error) {
    errors.push(error.message);
  }

  return {
    connector: snapshots.length ? "posthog" : "local-analytics-runbook",
    snapshots,
    errors,
    platform,
    publishUrl
  };
}
