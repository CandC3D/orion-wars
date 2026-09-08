// Real production page/worker; passive protocol recorder only. Own listener,
// isolated profile, and all browser output goes to a unique temporary folder.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname,sep,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=resolve('.'),out=await fs.mkdtemp(join(tmpdir(),'console-followup-'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+sep))throw Error('Path');res.writeHead(200,{'Content-Type':mime[extname(p)]||'application/octet-stream'}).end(await fs.readFile(p));}catch{res.writeHead(404).end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));assert.notEqual(server.address().port,8642);
const {chromium}=await import(pathToFileURL('C:/Users/chorr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
let browser;const checks=[],errors=[];const pass=s=>{checks.push(s);console.log('PASS '+s);};
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1512,height:1100},reducedMotion:'no-preference'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.testMessages=[];window.testPackets=[];const Base=Worker;
    window.Worker=class extends Base{constructor(...args){super(...args);this.addEventListener('message',e=>window.testMessages.push(structuredClone(e.data)));}postMessage(data,...args){window.testPackets.push(structuredClone(data));return super.postMessage(data,...args);}};
  });
  const start=async()=>{
    await page.goto(`http://127.0.0.1:${server.address().port}/arena/play.html`);
    await page.waitForFunction(()=>!document.querySelector('#begin').disabled);
    await page.locator('#bundled-scenario').selectOption('asterion-line-battleship.json');
    await page.locator('#begin').click();await page.waitForFunction(()=>!document.querySelector('#resolve-orders').disabled);
    const id=await page.locator('[data-ship-key]').evaluateAll(a=>a.find(n=>n.dataset.shipKey.includes('battleship')).dataset.shipKey);
    await page.locator(`[data-ship-key="${id}"]`).click();await page.locator('[data-assign=move]').click();
  };
  const moving=async()=>{
    await page.locator('#resolve-orders').click();
    await page.waitForFunction(()=>!!document.querySelector('[data-sliding]'),null,{timeout:20000});
  };
  const pausedPosition=()=>page.locator('[data-sliding]').first().evaluate(n=>{const b=n.getBoundingClientRect();return {id:n.dataset.ship,x:b.x,y:b.y,phase:n.dataset.sliding};});
  const fit=async()=>{
    const result=await page.evaluate(()=>{const station=document.querySelector('.command-station');return {overflow:station.scrollHeight-station.clientHeight,clipped:[...station.querySelectorAll('button')].filter(n=>{const b=n.getBoundingClientRect();if(!b.width||!b.height)return false;const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return b.bottom>innerHeight||!n.contains(hit);}).map(n=>n.textContent)};});
    assert.ok(result.overflow<=1,JSON.stringify(result));assert.deepEqual(result.clipped,[]);
  };
  await start();await moving();await page.locator('#playback-pause').click();
  const a=await pausedPosition();await page.waitForTimeout(800);const b=await pausedPosition();
  assert.deepEqual(b,a);assert.ok(await page.locator('#resolve-orders').isDisabled());
  await page.screenshot({path:join(out,'motion-paused.png')});pass('Pause freezes the drawn ship and frame for longer than the whole slide');
  await page.locator('#playback-pause').click();
  await page.waitForFunction(phase=>{const n=document.querySelector('[data-sliding]');return !n||n.dataset.sliding!==phase;},a.phase);
  await page.locator('#playback-pause').click();await page.locator('#playback-skip').click();
  await page.waitForFunction(()=>!document.querySelector('#resolve-orders').disabled,null,{timeout:5000});
  assert.equal(await page.locator('[data-sliding]').count(),0);
  assert.equal(await page.evaluate(()=>window.testPackets.filter(p=>p.type==='orders').length),1);
  pass('Resume advances; Skip while paused finishes and sends no extra order');
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-contact').click();const download=await downloadPromise;
  const record=JSON.parse(await fs.readFile(await download.path(),'utf8'));
  const workerFrames=await page.evaluate(()=>{const initial=window.testMessages.find(m=>m.value?.frame)?.value.frame;const done=window.testMessages.find(m=>m.value?.timeline)?.value;return [initial,...done.timeline.map(x=>x.frame)];});
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.ok(Array.isArray(record.timeline));
  assert.equal(record.timeline.length,workerFrames.length);
  assert.equal(digest(record.timeline.map(x=>x.frame)),digest(workerFrames));pass('Animated playback export equals every original worker frame');
  await fit();pass('Maneuver and acquired-target controls fit at 1512x1100');
  await page.locator('[data-assign=move]').click();await page.locator('#resolve-orders').click();
  await page.waitForFunction(()=>!!document.querySelector('.fx-caption'),null,{timeout:20000});
  await page.locator('#playback-pause').click();
  const caption=await page.locator('.fx-caption').textContent();
  await fit();
  assert.match(caption,/^(STRUCK FACE [1-6]|MISS|INTERCEPTED|EVADED|UNCONFIRMED|ARRIVAL|STRIKE RUN|CANNON FIRE|FIRE|LAUNCHED)$/);
  await page.screenshot({path:join(out,'outcome-paused.png')});
  pass('A real combat event produces a readable outcome caption');
  await page.locator('#playback-skip').click();await page.waitForFunction(()=>!document.querySelector('#resolve-orders').disabled);
  await start();await moving();await page.locator('#new-session').click();
  await page.waitForTimeout(700);assert.ok(await page.locator('#contact-station').isHidden());assert.ok(await page.locator('#playback-pause').isDisabled());
  await page.locator('#begin').click();await page.waitForFunction(()=>!document.querySelector('#resolve-orders').disabled);
  assert.match(await page.locator('#clock').textContent(),/TURN 1/);assert.equal(await page.locator('[data-sliding]').count(),0);
  pass('New engagement cancels motion without stale writes into its replacement');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{window.seenSlide=false;new MutationObserver(()=>{if(document.querySelector('[data-sliding]'))window.seenSlide=true;}).observe(document.querySelector('#contact-map'),{subtree:true,attributes:true,childList:true});});
  await page.locator('[data-assign=move]').click();await page.locator('#resolve-orders').click();await page.waitForFunction(()=>!document.querySelector('#resolve-orders').disabled);
  assert.equal(await page.evaluate(()=>window.seenSlide),false);pass('Reduced motion commits frames without interpolation');
  assert.deepEqual(errors,[]);pass('No page errors');
}finally{await browser?.close();await new Promise(ok=>server.close(ok));await fs.writeFile(join(out,'results.json'),JSON.stringify({checks,errors},null,2));console.log(out);}
