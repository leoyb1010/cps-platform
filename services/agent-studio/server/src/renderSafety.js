// Exported media is generated from self-contained HTML. Rendering must not turn
// user content into a browser with access to host files, services or the internet.
export function safeExportSegment(value) {
  const segment = String(value || 'asset').replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 120);
  if (segment === '.' || segment === '..') throw new Error('Invalid export identifier');
  return segment || 'asset';
}

export async function loadIsolatedHtml(page, html) {
  const context = page.context();
  // Context routing includes a popup's first navigation; page routing does not.
  await context.route('**/*', route => {
    const url = route.request().url();
    return /^(data|blob):/.test(url) ? route.continue() : route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**', socket => socket.close());
  context.on('page', popup => { if (popup !== page) void popup.close().catch(() => {}); });
  const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  // setContent keeps an opaque origin instead of giving generated scripts file://
  // access. Install CSP before the first user-controlled element can be parsed.
  await page.setContent(`<meta http-equiv="Content-Security-Policy" content="${csp}">` + html, { waitUntil: 'networkidle' });
}
