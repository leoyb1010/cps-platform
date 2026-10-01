import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin='http://127.0.0.1:45173';
const output=process.env.AUDIT_UI_OUTPUT || '/tmp/cps-studio-ui-audit';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const evidence=[];
try {
  for(const width of [1440,1024,390]){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
    const page=await context.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      return url.origin===origin || ['data:','blob:'].includes(url.protocol) ? route.continue() : route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**',socket=>socket.close());
    await page.goto(origin,{waitUntil:'networkidle'});
    await page.getByRole('link',{name:'素材工厂',exact:true}).click();
    await page.screenshot({path:`${output}/factory-${width}.png`,fullPage:true});
    const state=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,text:document.body.innerText.slice(0,300)}));
    assert(state.text.length>60,'Studio rendered an empty shell');
    assert(state.scroll<=state.width+1,'Studio has horizontal page overflow');
    assert.deepEqual(errors,[],'Studio has uncaught browser errors');
    evidence.push({viewport:width,...state,errors});
    await context.close();
  }
}finally{await browser.close()}
await writeFile(`${output}/results.json`,JSON.stringify(evidence,null,2));
