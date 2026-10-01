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
    await page.getByRole('button',{name:/社媒文案包/}).waitFor();
    await page.waitForLoadState('networkidle');
    await page.screenshot({path:`${output}/factory-${width}.png`,fullPage:true});
    const state=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,text:document.body.innerText.slice(0,300)}));
    assert(state.text.length>60,'Studio rendered an empty shell');
    assert(state.scroll<=state.width+1,'Studio has horizontal page overflow');
    assert.deepEqual(errors,[],'Studio has uncaught browser errors');
    const fields=page.locator('.factoryWizard .settingsGrid input');
    assert.equal(await fields.count(),2);
    const sizes=await fields.evaluateAll(nodes=>nodes.map(node=>({height:node.getBoundingClientRect().height,font:Number.parseFloat(getComputedStyle(node).fontSize),type:node.type})));
    for(const size of sizes){assert.equal(size.type,'text');assert(size.height >= (width===390?44:38));if(width===390)assert(size.font>=16)}
    await page.getByLabel('受众',{exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:`${output}/factory-form-${width}.png`});
    const flows=[];
    if(width===390){
      const prompt=page.getByPlaceholder('例如：帮我做一组卖 AI 素材工厂会员的小红书图文');
      await prompt.fill('');await page.getByRole('button',{name:'生成并扣积分',exact:true}).click();
      await page.getByText('先输入一句话主题',{exact:true}).waitFor();flows.push('empty prompt validation');
      await page.getByRole('button',{name:/社媒文案包/}).click();
      await prompt.fill('Synthetic local audit copy for a fictional stationery product');
      let release;const gate=new Promise(resolve=>{release=resolve});let attempts=0;
      await page.route('**/api/factory/generate',async route=>{
        attempts++;
        if(attempts===1){await gate;return route.fulfill({status:503,contentType:'application/json',body:'{"message":"Synthetic temporary outage"}'})}
        return route.continue();
      });
      await page.getByRole('button',{name:'生成并扣积分',exact:true}).click();
      await page.waitForFunction(()=>[...document.querySelectorAll('.factoryView .primaryBtn')].every(button=>button.disabled));
      await page.screenshot({path:`${output}/factory-loading-${width}.png`});release();
      await page.getByRole('alert').filter({hasText:'素材生成失败'}).waitFor();
      assert.equal(await page.locator('.toast[data-variant=error] [data-status-icon=error]').count(),1);
      assert.equal(await page.locator('.toast [data-status-icon=success]').count(),0);
      await page.screenshot({path:`${output}/factory-error-${width}.png`});
      await page.getByRole('button',{name:'生成并扣积分',exact:true}).click();
      await page.locator('.factoryResult .copyBlock').waitFor();
      await page.getByRole('status').filter({hasText:'素材已生成并扣减积分'}).waitFor();
      assert.equal(attempts,2,'loading state must not submit duplicate generation');
      await page.locator('.factoryResult').scrollIntoViewIfNeeded();
      await page.screenshot({path:`${output}/factory-retry-success-${width}.png`});
      flows.push('controlled 503 error and local fallback retry','busy actions disabled without duplicate submission');
    }
    assert.deepEqual(errors,[],'Studio flow has uncaught browser errors');
    evidence.push({viewport:width,...state,sizes,flows,errors});
    await context.close();
  }
}finally{await browser.close()}
await writeFile(`${output}/results.json`,JSON.stringify(evidence,null,2));
