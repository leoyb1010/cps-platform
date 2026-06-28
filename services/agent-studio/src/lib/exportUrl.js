/** Turn server export paths into browser-loadable URLs (same-origin when UI is proxied). */
export function toExportUrl(filePath) {
  if (!filePath) return "";
  const raw = String(filePath).trim();
  if (/^https?:\/\//i.test(raw)) return raw;

  const normalized = raw.replace(/\\/g, "/");
  const marker = "server/exports/";
  const idx = normalized.indexOf(marker);
  if (idx >= 0) {
    return `/exports/${normalized.slice(idx + marker.length)}`;
  }
  if (normalized.startsWith("/exports/")) return normalized;
  if (normalized.startsWith("exports/")) return `/${normalized}`;

  const base = import.meta.env.VITE_API_BASE || "";
  const name = normalized.split("/").pop();
  return name ? `${base}/exports/${name}` : "";
}

export function collectPreviewImageUrls(...pathGroups) {
  const seen = new Set();
  const out = [];
  for (const group of pathGroups) {
    const list = Array.isArray(group) ? group : [group];
    for (const p of list) {
      const url = toExportUrl(p);
      if (url && !seen.has(url)) {
        seen.add(url);
        out.push(url);
      }
    }
  }
  return out;
}