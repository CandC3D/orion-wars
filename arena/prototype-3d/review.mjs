// Run with a locally installed Playwright or PLAYWRIGHT_MODULE pointing to its index.mjs.
// Serves only this worktree on an ephemeral loopback port, closes its own browser and server.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const out=path.join(here,'evidence');await fs.mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.svg':'image/svg+xml','.md':'text/plain'};
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep))throw new Error('outside workspace');
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
}catch{res.writeHead(404).end('not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.PROTOTYPE_BROWSER?{executablePath:process.env.PROTOTYPE_BROWSER}:{})});
  const page=await browser.newPage({viewport:{width:1600,height:1080},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(origin+'/arena/prototype-3d/index.html');
  try{await page.waitForFunction(()=>window.tabletopPrototype?.ready,{},{timeout:25000});}
  catch(e){await page.screenshot({path:path.join(out,'startup-failure.png'),fullPage:true});console.log(await page.locator('#status').textContent());throw e;}
  const result={browser:browser.version(),viewport:{width:1600,height:1080},captures:{},checks:{}};
  for(const kind of ['planning','beam','shield','anonymous']){
    result.captures[kind]=await page.evaluate(k=>window.tabletopPrototype.capturePose(k,.48),kind);
    await page.locator('.frame').screenshot({path:path.join(out,kind+'.png')});
  }
  result.checks.physicalIsolation=await page.evaluate(()=>window.tabletopPrototype.physicalInvariant());
  assert.ok(result.checks.physicalIsolation.identical,'energy changed physical or shadow buffer');
  result.checks.occlusion=await page.evaluate(()=>window.tabletopPrototype.depthEvidence());
  assert.equal(result.checks.occlusion.behindSamples,0,'energy shines through opaque board');
  assert.ok(result.checks.occlusion.frontSamples>0,'occlusion probe never rendered');
  result.checks.classification=await page.evaluate(async()=>{
    const T=await import('three'),{physicalMaterial,physicalMesh,validateScene}=await import('./materials.js');
    const scene=new T.Scene(),mesh=physicalMesh('test',new T.BoxGeometry(),physicalMaterial('test'));
    scene.add(mesh);validateScene(scene);let missingObject=false,missingMaterial=false,emission=false,energyLight=false;
    delete mesh.userData.register;try{validateScene(scene);}catch{missingObject=true;}
    mesh.userData.register='physical';delete mesh.material.userData.register;try{validateScene(scene);}catch{missingMaterial=true;}
    mesh.material.userData.register='physical';mesh.material.emissive.set('red');try{validateScene(scene);}catch{emission=true;}
    const energy=new T.Scene();energy.userData.register='energetic';energy.add(new T.PointLight());try{validateScene(energy);}catch{energyLight=true;}
    mesh.geometry.dispose();mesh.material.dispose();return {missingObject,missingMaterial,emission,energyLight};
  });
  assert.ok(Object.values(result.checks.classification).every(Boolean));
  await page.evaluate(()=>window.tabletopPrototype.capturePose('planning'));
  await page.click('#exchange');
  await page.waitForFunction(()=>window.tabletopPrototype.inspect().camera.y<29);
  await page.click('#pause');
  const before=await page.evaluate(()=>window.tabletopPrototype.inspect());
  await new Promise(resolve=>setTimeout(resolve,180));
  const after=await page.evaluate(()=>window.tabletopPrototype.inspect());
  assert.deepEqual(after,before,'pause moved camera/effects');result.checks.pause=true;
  await page.click('#skip');await page.waitForFunction(()=>!window.tabletopPrototype.running);
  assert.equal((await page.evaluate(()=>window.tabletopPrototype.inspect())).camera.blur,0);result.checks.skip=true;
  await page.check('#reduced');await page.click('#exchange');await page.waitForFunction(()=>!window.tabletopPrototype.running);
  assert.equal((await page.evaluate(()=>window.tabletopPrototype.inspect())).camera.blur,0);result.checks.reducedMotion=true;
  const gl=await page.evaluate(()=>{const g=document.querySelector('canvas').getContext('webgl2');const e=g.getExtension('WEBGL_debug_renderer_info');return{vendor:g.getParameter(e?e.UNMASKED_VENDOR_WEBGL:g.VENDOR),renderer:g.getParameter(e?e.UNMASKED_RENDERER_WEBGL:g.RENDERER)};});
  result.gpu=gl;result.errors=errors;
  // Submission + GPU completion at 1920x1080 for THIS three-hull study, not the deferred scale test.
  result.timing=await page.evaluate(async()=>{
    const canvas=document.querySelector('canvas');canvas.style.width='1920px';canvas.style.height='1080px';
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    window.tabletopPrototype.capturePose('beam',.48);
    const g=canvas.getContext('webgl2'),samples=[];
    for(let i=0;i<70;i++){await new Promise(requestAnimationFrame);const began=performance.now();window.tabletopPrototype.renderForReview();g.finish();if(i>=10)samples.push(performance.now()-began);}
    samples.sort((a,b)=>a-b);const size=window.tabletopPrototype.inspect();canvas.style.width='';canvas.style.height='';
    return {samples:samples.length,width:size.width,height:size.height,meanMs:samples.reduce((n,x)=>n+x,0)/samples.length,p95Ms:samples[Math.ceil(samples.length*.95)-1],maxMs:samples.at(-1),method:'JS submission plus gl.finish; 10 warmup, 60 samples; no full-board claim'};
  });
  assert.deepEqual(errors,[]);
  const fallback=await browser.newPage({viewport:{width:1000,height:800}});
  await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
  await fallback.goto(origin+'/arena/prototype-3d/index.html');
  await fallback.waitForFunction(()=>document.querySelector('#status').textContent.includes('WebGL2 is unavailable'));
  assert.ok(await fallback.locator('#fallback a').isVisible());result.checks.svgFallback=true;
  await fs.writeFile(path.join(out,'review.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({checks:result.checks,timing:result.timing,gpu:result.gpu,errors:result.errors,captures:Object.fromEntries(Object.entries(result.captures).map(([k,v])=>[k,{drawCalls:v.drawCalls,triangles:v.triangles}]))},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
