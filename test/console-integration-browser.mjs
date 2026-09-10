// Production console + production worker. Test-only passive protocol recorder;
// isolated browser, ephemeral listener, no user storage or listener access.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname,sep,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const root=resolve('.'),out=await fs.mkdtemp(join(tmpdir(),'console-integration-'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+sep))throw Error('Path');res.writeHead(200,{'Content-Type':mime[extname(p)]||'application/octet-stream'}).end(await fs.readFile(p));}catch{res.writeHead(404).end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));assert.notEqual(server.address().port,8642);
const {chromium}=await import(pathToFileURL('C:/Users/chorr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
// The bundled scenario is editable content (it now has no gunstar). Pin the
// test's required hulls explicitly; keep production host/worker construction.
const gunstarSetup=JSON.parse(await fs.readFile('arena/scenarios/asterion-line.json'));
gunstarSetup.name='Console cannon acceptance fixture';
gunstarSetup.sides[0].ships.forEach((s,i)=>s.className=['gunstar-battlecruiser','heavy-cruiser','light-cruiser','light-cruiser'][i]);
gunstarSetup.sides[1].ships.forEach((s,i)=>s.className=['carrier','heavy-cruiser','light-cruiser','light-cruiser'][i]);
gunstarSetup.victory.protectedClass={A:'gunstar-battlecruiser',B:'carrier'};
let browser;const checks=[],errors=[];const pass=s=>{checks.push(s);console.log('PASS '+s);};
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:2560,height:1440},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.testMessages=[];window.testPackets=[];const Base=Worker;window.Worker=class extends Base{constructor(...args){super(...args);this.addEventListener('message',e=>window.testMessages.push(structuredClone(e.data)));}postMessage(data,...args){window.testPackets.push(structuredClone(data));return super.postMessage(data,...args);}};});
  await page.goto(`http://127.0.0.1:${server.address().port}/arena/play.html`);
  await page.waitForFunction(()=>!document.querySelector('#begin').disabled);
  await page.locator('#setup-mode').selectOption('authored');
  await page.locator('#scenario-file').setInputFiles({name:'cannon-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(gunstarSetup))});
  await page.waitForFunction(()=>document.querySelector('#import-note').textContent.includes('Ready:'));
  await page.locator('#begin').click();await page.waitForFunction(()=>!document.querySelector('#resolve-orders').disabled);
  await page.locator('[data-ship-key*="gunstar"]').waitFor({state:'visible'});
  const gun=await page.locator('[data-ship-key]').evaluateAll(a=>a.find(o=>o.dataset.shipKey.includes('gunstar')).dataset.shipKey);
  const pick=async id=>page.locator(`[data-ship-key="${id}"]`).click();await pick(gun);
  const frame=()=>page.evaluate(()=>{for(const m of [...window.testMessages].reverse()){if(m.value?.frame)return m.value.frame;if(m.value?.frames?.length)return m.value.frames.at(-1);}return null;});
  const execute=async()=>{await page.locator('#resolve-orders').click();await page.waitForFunction(()=>!document.querySelector('#resolve-orders').disabled);};
  const fit=async name=>{
    await page.screenshot({path:join(out,name+'.png')});
    const metrics=await page.evaluate(()=>{
      const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
      const station=document.querySelector('.command-station');
      const clipped=[...station.querySelectorAll('button')].filter(e=>vis(e)&&!e.disabled).filter(e=>{const r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !e.contains(hit)||r.bottom>innerHeight||r.right>innerWidth;}).map(e=>e.outerHTML);
      const forbidden=[...document.querySelectorAll('#contact-station select,#contact-station input[type=range],#contact-station [role=slider],#contact-station [role=tab],#contact-station details')].filter(vis).map(e=>e.outerHTML);
      const outsideLabels=[...document.querySelectorAll('[data-weapon-label]')].filter(e=>{const b=e.getBBox();return b.x<0||b.y<0||b.x+b.width>900||b.y+b.height>520;}).map(e=>e.textContent);
      return {clipped,forbidden,outsideLabels,scrollY,overflow:station.scrollHeight-station.clientHeight};
    });
    console.log(name,JSON.stringify(metrics));assert.deepEqual(metrics.clipped,[]);assert.deepEqual(metrics.forbidden,[]);assert.deepEqual(metrics.outsideLabels,[]);assert.equal(metrics.scrollY,0);assert.ok(metrics.overflow<=1);
  };
  await fit('1440-cold');
  assert.match(await page.locator('#spinal-control').textContent(),/MOBILE.*COLD/s);
  assert.match(await page.locator('#power-well').textContent(),/cannon 0/);
  assert.match(await page.locator('.lamp-spinal title').textContent(),/COLD/);
  const before=(await frame()).observation.own.find(s=>s.id===gun).pos;
  await page.locator('[data-assign=move]').click();await page.locator('[data-helm=forward-inc]').click(); // one hex ahead; Maneuver starts as a turn in place (10 Sept)
  assert.match(await page.locator('#power-well').textContent(),/helm [1-9]/);
  await execute();let own=(await frame()).observation.own.find(s=>s.id===gun);
  assert.deepEqual(own.pos,{q:before.q+1,r:before.r});assert.equal(own.spinal.charge,0);pass('Cold gunstar moves from real helm key; power forecast includes helm');
  await page.locator('[data-spinal=charge]').click();
  assert.match(await page.locator('#power-well').textContent(),/cannon 20/);
  assert.match(await page.locator('#power-well').textContent(),/floor 13/);
  assert.equal(await page.locator('[data-movement-radius]').count(),0);
  await execute();own=(await frame()).observation.own.find(s=>s.id===gun);
  assert.equal(own.spinal.charge,20);assert.match(await page.locator('#spinal-control').textContent(),/IMMOBILE.*CHARGING/s);
  await fit('1440-charging');pass('Prepare reaches resolver; charging lock and post-bank reserve agree');
  await page.locator('[data-spinal=vent]').click();await page.locator('[data-assign=move]').click();await page.locator('[data-helm=port]').click();await page.locator('[data-helm=forward-inc]').click();
  assert.match(await page.locator('#power-well').textContent(),/cannon 0/);
  const chargedPos=own.pos;await execute();own=(await frame()).observation.own.find(s=>s.id===gun);
  assert.equal(own.spinal.charge,0);assert.equal(own.spinal.cooldown,2);assert.notDeepEqual(own.pos,chargedPos);
  pass('Abort and turn-away move execute together; full cooldown remains');
  for(let i=0;i<6;i++)await page.locator('[data-reserve-step="-1"]').click();
  assert.match(await page.locator('.reserve-keys output').textContent(),/^0%$/);
  await page.locator('[data-reserve-step="1"]').click();assert.equal(await page.locator('.reserve-keys output').textContent(),'5%');pass('Reserve can be raised from zero with visible keys');
  await page.locator('#restart-command').click();await page.waitForFunction(()=>document.querySelector('#clock').textContent.includes('TURN 1 · PLANNING')&&!document.querySelector('#resolve-orders').disabled);
  const lc=await page.locator('[data-ship-key]').evaluateAll(a=>a.find(o=>o.dataset.shipKey.includes('light-cruiser')).dataset.shipKey);await pick(lc);
  assert.ok(await page.locator('[data-battery-family=beam]').count());
  for(const [id,faces] of [[1,[1,2,6]],[2,[2,3,4]],[3,[4,5,6]]]){
    await page.locator(`#schematic [data-mount="${id}"]`).click();
    assert.deepEqual(await page.locator('[data-arc-face]').evaluateAll(a=>a.map(e=>+e.dataset.arcFace)),faces);
    assert.ok(await page.locator('#weapon-range-key').isVisible());
    await fit('1440-lc-mount-'+id);
    await page.locator(`#schematic [data-mount="${id}"]`).click();
    assert.ok(await page.locator('[data-battery-family=beam]').count());
  }pass('LC port, starboard and rear lamps isolate correct faces, restore whole battery');
  const view=(await frame()).observation,ship=view.own.find(s=>s.id===lc);
  const ranges=await page.locator('[data-target-key]:not([data-target-key=auto])').evaluateAll(a=>a.map(e=>({id:e.dataset.targetKey,text:e.textContent})));
  for(const r of ranges){const c=view.contacts.find(c=>c.id===r.id),q=c.pos.q-ship.pos.q,s=c.pos.r-ship.pos.r;assert.ok(r.text.includes(Math.max(Math.abs(q),Math.abs(s),Math.abs(q+s))+' hex'));}
  pass('Target keys show hex distance, not Euclidean distance');
  const count=await page.evaluate(()=>window.testPackets.length);await page.locator('#zoom-in').click();await page.locator('#zoom-out').click();await page.locator('#hex-grid').click();await page.locator('#hex-grid').click();
  assert.equal(await page.evaluate(()=>window.testPackets.length),count);pass('Map controls do not send orders');
  await execute();
  await page.locator('#history-prev').click();assert.ok(await page.locator('#resolve-orders').isDisabled());assert.ok(await page.locator('[data-reserve-step="1"]').isDisabled());
  await page.locator('#live-picture').click();assert.ok(await page.locator('#resolve-orders').isEnabled());pass('History keys lock orders and return to live');
  await page.setViewportSize({width:1512,height:1100});await pick(gun);await fit('1100-gunstar');
  await page.setViewportSize({width:2560,height:1440});
  const launch=async fixture=>{
    await page.goto(`http://127.0.0.1:${server.address().port}/arena/play.html`);
    await page.waitForFunction(()=>!document.querySelector('#begin').disabled);
    await page.locator('#setup-mode').selectOption('authored');
    await page.locator('#scenario-file').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await page.waitForFunction(()=>document.querySelector('#import-note').textContent.includes('Ready:'));
    await page.locator('#begin').click();await page.waitForFunction(()=>!document.querySelector('#resolve-orders').disabled);
  };
  await launch(JSON.parse(await fs.readFile('arena/scenarios/asterion-line-battleship.json')));
  const bb=await page.locator('[data-ship-key]').evaluateAll(a=>a.find(o=>o.dataset.shipKey.includes('battleship')).dataset.shipKey);await pick(bb);
  for(const m of (await frame()).observation.own.find(s=>s.id===bb).mounts){
    await page.locator(`#schematic [data-mount="${m.id}"]`).click();
    assert.deepEqual(await page.locator('[data-arc-face]').evaluateAll(a=>a.map(e=>+e.dataset.arcFace)),m.arc);
    await page.locator(`#schematic [data-mount="${m.id}"]`).click();
  }
  await fit('1440-battleship');pass('Every battleship lamp is click-accessible and selects its own arc');
  // Authored fixture changes only initial public setup. Charge and lock follow
  // four actual resolver turns, not mutated worker state or a fake response.
  const readyFixture=structuredClone(gunstarSetup);
  readyFixture.terrain=[];readyFixture.map={widthHexes:100,heightHexes:60};
  Object.assign(readyFixture.sides[0].ships[0],{q:0,r:0,facing:3});readyFixture.sides[1].ships.forEach(s=>s.q+=29);
  await launch(readyFixture);await pick(gun);await page.locator('[data-spinal=charge]').click();
  for(let i=0;i<4;i++)await execute();
  assert.match(await page.locator('#spinal-control').textContent(),/IMMOBILE.*READY/s);
  assert.ok(await page.locator('.spinal-firing').isVisible());
  await fit('1440-ready');pass('Ready bank has visible firing reason, lock and Abort key after four real turns');
  assert.deepEqual(errors,[]);pass('No page errors; both desktop sizes remain in viewport');
}finally{await browser?.close();await new Promise(ok=>server.close(ok));await fs.writeFile(join(out,'results.json'),JSON.stringify({checks,errors},null,2));console.log(out);}
