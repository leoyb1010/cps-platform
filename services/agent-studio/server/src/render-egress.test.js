import { createServer } from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { loadIsolatedHtml } from './renderSafety.js';

describe('real Chromium generated-document boundary',()=>{
  it('blocks popup first navigation and all localhost canary requests',async()=>{
    let requests=0;
    const canary=createServer((_request,response)=>{requests++;response.end('synthetic canary')});
    canary.on('upgrade',(_request,socket)=>{requests++;socket.destroy()});
    canary.listen(0,'127.0.0.1');await once(canary,'listening');
    const target=`http://127.0.0.1:${canary.address().port}`;
    let browser;
    try{
      browser=await chromium.launch({headless:true});
      const context=await browser.newContext({serviceWorkers:'block'});
      const page=await context.newPage();
      await loadIsolatedHtml(page,`<div class="visual-root">Synthetic render fixture</div>
        <img src="${target}/image"><iframe src="${target}/frame"></iframe>
        <style>body{background-image:url('${target}/style')}</style>
        <script>
          fetch('${target}/fetch').catch(()=>{});
          try{navigator.sendBeacon('${target}/beacon','fixture')}catch{}
          try{new WebSocket('${target.replace('http:','ws:')}/socket')}catch{}
          try{window.open('${target}/popup','_blank')}catch{}
          try{window.open('about:blank','_blank')?.location.replace('${target}/blank-popup')}catch{}
          globalThis.fixtureExecuted=true;
        </script>`);
      await page.waitForFunction(()=>globalThis.fixtureExecuted===true);
      // Let queued navigation tasks reach context interception; every destination
      // is our disposable loopback listener, never an external service.
      await page.waitForTimeout(250);
      expect(requests).toBe(0);
      expect(context.pages()).toHaveLength(1);
      expect(await page.locator('.visual-root').innerText()).toBe('Synthetic render fixture');
      await context.close();
    }finally{
      await browser?.close();
      await new Promise(resolve=>canary.close(resolve));
    }
  },15000);
});
