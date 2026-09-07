// Production worker on an isolated ephemeral listener. No user storage/session.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname,sep,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const root=resolve('.'),out=await fs.mkdtemp(join(tmpdir(),'manual-spinal-browser-'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+sep))throw Error('Path');res.writeHead(200,{'Content-Type':mime[extname(p)]||'application/octet-stream'}).end(await fs.readFile(p));}catch{res.writeHead(404).end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));assert.notEqual(server.address().port,8642);
const {chromium}=await import(pathToFileURL('C:/Users/chorr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
let browser;const checks=[],errors=[];const pass=s=>{checks.push(s);console.log('PASS '+s);};
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1512,height:1100},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  // Disclosed passive recorder of the page's own worker protocol, no replacement.
  await page.addInitScript(()=>{window.testMessages=[];window.testPackets=[];const Base=Worker;window.Worker=class extends Base{constructor(...args){super(...args);this.addEventListener('message',e=>window.testMessages.push(structuredClone(e.data)));}postMessage(data,...args){window.testPackets.push(structuredClone(data));return super.postMessage(data,...args);}};});
  await page.goto(`http://127.0.0.1:${server.address().port}/arena/play.html`);
  await page.locator('#setup-mode').selectOption('authored');
  const fixture=await fs.readFile('arena/scenarios/asterion-line.json');
  await page.locator('#scenario-file').setInputFiles({name:'asterion.json',mimeType:'application/json',buffer:fixture});
  await page.waitForFunction(()=>document.querySelector('#import-note').textContent.includes('Ready:'));
  await page.locator('#begin').click();await page.waitForFunction(()=>!document.querySelector('#resolve-orders').disabled);
  const gun=await page.locator('#own-vessel option').evaluateAll(a=>a.find(o=>o.value.includes('gunstar')).value);
  await page.locator('#own-vessel').selectOption(gun);
  assert.match(await page.locator('#spinal-control').textContent(),/MOBILE.*COLD/s);
  assert.ok(Number(await page.locator('[data-movement-radius]').getAttribute('data-movement-radius'))>0);
  const frame=()=>page.evaluate(()=>{for(const m of [...window.testMessages].reverse()){if(m.value?.frame)return m.value.frame;if(m.value?.frames?.length)return m.value.frames.at(-1);}return null;});
  const before=(await frame()).observation.own.find(s=>s.id===gun).pos;
  const execute=async()=>{await page.locator('#resolve-orders').click();await page.waitForFunction(()=>!document.querySelector('#resolve-orders').disabled);};
  const move=async(turn,forward)=>{await page.locator('[data-field=kind]').selectOption('move');await page.locator('[data-field=turn]').fill(String(turn));await page.locator('[data-field=turn]').dispatchEvent('change');await page.locator('[data-field=forward]').fill(String(forward));await page.locator('[data-field=forward]').dispatchEvent('change');};
  await move(0,1);await execute();
  let own=(await frame()).observation.own.find(s=>s.id===gun);
  assert.deepEqual(own.pos,{q:before.q+1,r:before.r});assert.equal(own.spinal.charge,0);pass('Real cold gunstar moves without automatic charge');
  await page.locator('[data-spinal=charge]').click();assert.match(await page.locator('#spinal-control').textContent(),/Execute: start charging/);
  assert.equal(await page.locator('[data-movement-radius]').count(),0);
  await execute();own=(await frame()).observation.own.find(s=>s.id===gun);assert.equal(own.spinal.charge,20);
  assert.match(await page.locator('#spinal-control').textContent(),/IMMOBILE.*CHARGING/s);pass('Prepare command reaches engine; active bank and lock displayed');
  await page.locator('[data-spinal=vent]').click();await move(1,1);
  assert.ok(Number(await page.locator('[data-movement-radius]').getAttribute('data-movement-radius'))>0);
  const chargedPos=own.pos;await execute();own=(await frame()).observation.own.find(s=>s.id===gun);
  assert.equal(own.spinal.charge,0);assert.equal(own.spinal.cooldown,2);assert.notDeepEqual(own.pos,chargedPos);
  assert.match(await page.locator('#spinal-control').textContent(),/MOBILE.*COOLING/s);pass('Abort and helm in one packet move ship; cooldown truthful');
  const packets=await page.evaluate(()=>window.testPackets.filter(p=>p.type==='step'));
  // The host may call the request orders rather than step; inspect all wire data.
  assert.match(JSON.stringify(await page.evaluate(()=>window.testPackets)),/"spinal":"charge"/);
  assert.match(JSON.stringify(await page.evaluate(()=>window.testPackets)),/"spinal":"vent"/);
  await page.locator('#restart-command').click();await page.waitForFunction(()=>document.querySelector('#clock').textContent.includes('TURN 1 · PLANNING')&&!document.querySelector('#resolve-orders').disabled);
  for(const cls of ['light-cruiser','heavy-cruiser','gunstar']){
    const id=await page.locator('#own-vessel option').evaluateAll((a,cls)=>a.find(o=>o.value.includes(cls)).value,cls);
    await page.locator('#own-vessel').selectOption(id);
    assert.equal(await page.locator('#arc-mount').inputValue(),'');
    assert.match(await page.locator('#range-summary').textContent(),/WHOLE battery/);
    assert.ok(await page.locator('[data-battery-family=beam]').count(),JSON.stringify({cls,errors,summary:await page.locator('#range-summary').textContent(),svg:(await page.locator('#contact-map').innerHTML()).slice(0,150)}));
    if(cls!=='gunstar')assert.match(await page.locator('#weapon-range-key').textContent(),/REAR/);
  }
  const lc=await page.locator('#own-vessel option').evaluateAll(a=>a.find(o=>o.value.includes('light-cruiser')).value);
  await page.locator('#own-vessel').selectOption(lc);
  const allFaces=await page.evaluate(()=>{
    const a=document.querySelector(`[data-ship="${document.querySelector('#own-vessel').value}"] [data-hex-anchor]`);
    const x=+a.getAttribute('cx'),y=+a.getAttribute('cy'),scale=Math.min(900/68,520/42)*Number(document.querySelector('#zoom').value);
    const path=document.querySelector('[data-battery-family=beam] path');
    return [[6,0],[6,-6],[0,-6],[-6,0],[-6,6],[0,6]].every(([q,r])=>path.isPointInFill(new DOMPoint(x+(q+r/2)*scale,y+r*scale*.866)));
  });
  assert.ok(allFaces,'LC whole beam battery must shade forward, both sides AND direct rear');
  await page.screenshot({path:join(out,'light-cruiser-whole-battery.png')});
  await page.locator('#arc-mount').selectOption('3');
  assert.deepEqual(await page.locator('[data-arc-face]').evaluateAll(a=>a.map(e=>Number(e.dataset.arcFace))),[4,5,6]);
  assert.match(await page.locator('#arc-caption').textContent(),/ONE mount.*other weapons hidden/);
  assert.match(await page.locator('#range-summary').textContent(),/beam.*16 hex/);pass('Whole battery default and explicit rear mount/band selection');
  await page.locator('#own-vessel').selectOption(gun);await move(1,1);
  for(const viewport of [{width:1512,height:1100},{width:1000,height:700},{width:390,height:844}]){
    await page.setViewportSize(viewport);if(viewport.width<761)await page.locator('[data-station-view=orders]').click();
    await page.locator('.station-panel:not([hidden])').evaluate(e=>e.scrollTop=0);
    const boxes=await page.locator('[data-field=forward], [data-spinal=charge], #resolve-orders').evaluateAll(a=>a.map(e=>{const b=e.getBoundingClientRect();return {id:e.id||e.dataset.field||'charge',top:b.top,bottom:b.bottom,height:innerHeight,hit:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===e};}));
    console.log(JSON.stringify({viewport,boxes}));
    await page.screenshot({path:join(out,`gunstar-${viewport.width}.png`)});
    assert.ok(boxes.every(b=>b.top>=0&&b.bottom<=b.height&&b.hit),JSON.stringify(boxes));
    await page.locator('[data-spinal=charge]').click();
    const queued=await page.locator('[data-field=forward]').evaluate(e=>{const r=e.getBoundingClientRect();return r.bottom<innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;});
    assert.ok(queued,'Queued charging warning must not bury the helm');
    await page.locator('[data-spinal=charge]').click();
  }
  pass('Helm, spinal controls and Execute hit-testable without scrolling at three widths');
  // Authored production scenario: distant carrier, gunstar deliberately facing
  // away. Four real charging turns create a ready-but-ineligible bank.
  await page.setViewportSize({width:1000,height:700});
  await page.goto(`http://127.0.0.1:${server.address().port}/arena/play.html`);
  const readyFixture=JSON.parse(fixture);readyFixture.terrain=[];readyFixture.map={widthHexes:100,heightHexes:60};
  Object.assign(readyFixture.sides[0].ships[0],{q:0,r:0,facing:3});
  readyFixture.sides[1].ships.forEach(s=>s.q+=29); // Retain legal fleet floors; move enemies beyond initial weapon range.
  await page.locator('#setup-mode').selectOption('authored');
  await page.locator('#scenario-file').setInputFiles({name:'ready-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(readyFixture))});
  await page.waitForFunction(()=>document.querySelector('#import-note').textContent.includes('Ready:'));
  await page.locator('#begin').click();await page.waitForFunction(()=>!document.querySelector('#resolve-orders').disabled);
  await page.locator('#own-vessel').selectOption(gun);
  await page.locator('[data-spinal=charge]').click();
  for(let i=0;i<4;i++)await execute();
  assert.match(await page.locator('#spinal-control').textContent(),/IMMOBILE.*READY/s);
  assert.match(await page.locator('.spinal-firing').textContent(),/No current contact|Outside bearing arc/);
  assert.ok(await page.locator('[data-ship]').filter({hasText:'LOCKED'}).count());
  await move(0,1);await page.locator('.station-panel:not([hidden])').evaluate(e=>e.scrollTop=0);
  await page.screenshot({path:join(out,'gunstar-ready-blocked-1000.png')});
  assert.ok(await page.locator('[data-field=forward]').evaluate(e=>{const r=e.getBoundingClientRect();return [[r.x+2,r.y+2],[r.right-2,r.bottom-2],[r.x+r.width/2,r.y+r.height/2]].every(([x,y])=>document.elementFromPoint(x,y)===e);}),'Ready reason must not clip or bury helm');
  pass('Real ready-but-blocked bank shows READY, IMMOBILE, reason and map LOCKED; helm remains reachable');
  assert.deepEqual(errors,[]);pass('No page errors');
}finally{await browser?.close();await new Promise(ok=>server.close(ok));await fs.writeFile(join(out,'results.json'),JSON.stringify({checks,errors},null,2));console.log(out);}
