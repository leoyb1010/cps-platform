// Exported media is generated from self-contained HTML. Rendering must not turn
// user content into a browser with access to host files, services or the internet.
export function safeExportSegment(value) {
  const segment = String(value || 'asset').replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 120);
  if (segment === '.' || segment === '..') throw new Error('Invalid export identifier');
  return segment || 'asset';
}

export async function loadIsolatedHtml(page, html) {
  const context = page.context();
  const documentUrl = 'https://render.invalid/document';
  const csp = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  let delivered = false;
  // A response-header sandbox is enforced before scripts execute. Omitting
  // allow-popups prevents about:blank popup navigation races; omitting
  // allow-same-origin keeps the generated document's origin opaque.
  await context.route('**/*', route => {
    const request = route.request();
    if (!delivered && request.url() === documentUrl && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      delivered = true;
      return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'Content-Security-Policy': csp }, body: html });
    }
    return /^(data|blob):/.test(request.url()) ? route.continue() : route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**', socket => socket.close());
  context.on('page', popup => { if (popup !== page) void popup.close().catch(() => {}); });
  // The reserved .invalid URL is fulfilled locally by the route above, never
  // resolved or fetched. CSP sandbox is not supported in a meta element.
  await page.goto(documentUrl, { waitUntil: 'networkidle' });
}
