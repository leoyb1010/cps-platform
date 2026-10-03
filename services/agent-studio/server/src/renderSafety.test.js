import { describe, expect, it, vi } from 'vitest';
import { safeExportSegment, loadIsolatedHtml } from './renderSafety.js';

describe('rendering filesystem and network boundary',()=>{
  it('rejects dot-directory traversal and bounds client identifiers',()=>{
    for(const value of ['.','..'])expect(()=>safeExportSegment(value)).toThrow('Invalid export identifier');
    expect(safeExportSegment('../outside')).toBe('..-outside');
    expect(safeExportSegment('x'.repeat(1000))).toHaveLength(120);
  });
  it('loads HTML with no host-file origin and denies external/file/loopback traffic',async()=>{
    let gate;
    const context={route:vi.fn(async(_pattern,callback)=>{gate=callback}),routeWebSocket:vi.fn(),on:vi.fn()};
    const frame = {};
    const page={context:()=>context,mainFrame:()=>frame,goto:vi.fn()};
    await loadIsolatedHtml(page,'<div>synthetic</div>');
    expect(page.goto).toHaveBeenCalledWith('https://render.invalid/document', { waitUntil: 'networkidle' });
    const documentRoute = { request: () => ({ url: () => 'https://render.invalid/document', isNavigationRequest: () => true, frame: () => frame }), fulfill: vi.fn() };
    await gate(documentRoute);
    const response = documentRoute.fulfill.mock.calls[0][0];
    expect(response.headers['Content-Security-Policy']).toContain('sandbox allow-scripts;');
    expect(response.headers['Content-Security-Policy']).not.toContain('allow-popups');
    expect(response.headers['Content-Security-Policy']).not.toContain('allow-same-origin');
    expect(response.body).toBe('<div>synthetic</div>');
    for(const url of ['file:///tmp/private-fixture','http://127.0.0.1/private','https://provider.invalid/private']){
      const route={request:()=>({url:()=>url}),abort:vi.fn(),continue:vi.fn()};gate(route);
      expect(route.abort).toHaveBeenCalled();expect(route.continue).not.toHaveBeenCalled();
    }
    const embedded={request:()=>({url:()=> 'data:image/png;base64,fixture'}),abort:vi.fn(),continue:vi.fn()};gate(embedded);
    expect(embedded.continue).toHaveBeenCalled();
  });
});
