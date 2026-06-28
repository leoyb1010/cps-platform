const STORAGE_KEY = "agent-studio-events";

export function trackEvent(name, payload = {}) {
  const event = {
    name,
    payload,
    at: new Date().toISOString()
  };

  try {
    const previous = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    const events = Array.isArray(previous) ? previous : [];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([event, ...events].slice(0, 200)));
  } catch {
    // Analytics must never break the product workflow.
  }

  if (import.meta.env.DEV) {
    console.info("[analytics]", event);
  }
}

export function getStoredEvents() {
  try {
    const events = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}
