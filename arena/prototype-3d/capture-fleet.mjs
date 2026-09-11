import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createServer} from 'node:http';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),out=path.join(here,'evidence/fleet/images');await fs.mkdir(out,{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(here,'fleet-assets.json'))),selected=process.argv.slice(2);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const f=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!f.startsWith(root+path.sep))throw Error('outside');res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');res.end(await fs.readFile(f));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PROTOTYPE_BROWSER?{executablePath:process.env.PROTOTYPE_BROWSER}:{})});const page=await browser.newPage({viewport:{width:1100,height:800},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:'+server.address().port+'/arena/prototype-3d/fleet-studio.html');await page.waitForFunction(()=>window.fleetStudio?.ready,{},{timeout:30000});
 const results=[];
 for(const h of manifest.hulls.filter(h=>!selected.length||selected.includes(h.id))){
  await page.evaluate(id=>window.fleetStudio.load(id),h.id);const views={};
  for(const kind of ['quarter','side','strip']){const result=await page.evaluate(k=>window.fleetStudio.capture(k),kind);views[kind]=result;
   assert.ok(result.camera.position[1]>=24&&result.camera.pitch>=32);assert.equal(result.code,h.code);assert.equal(result.clearVariant,false);assert.equal(result.energyObjects,0);
   assert.ok(Math.abs(result.postExposedMm-30)<.001&&Math.abs(result.postBaseGapMm)<.001&&result.postHullGapMm!==null&&result.postHullGapMm<.001,'Unseated post '+h.id);
   if(kind==='side'&&h.code)assert.ok(Math.max(...result.rimCapPixels)>=12,'Side inspection rim too small '+h.id);
   if(kind!=='strip'){const b=result.bounds;assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=1000&&b.y+b.height<=720,'Clipped '+h.id+' '+kind);}
   await page.locator('canvas').screenshot({path:path.join(out,h.id+'-'+kind+'.png')});
  }
  const blackout=await page.evaluate(()=>window.fleetStudio.blackout());assert.equal(blackout,0,'Physical emission: '+h.id);results.push({id:h.id,views,blackout});console.log(h.id+' captured; '+views.side.triangles+' submitted triangles');
 }
 assert.deepEqual(errors,[]);
 let prior=[];try{prior=JSON.parse(await fs.readFile(path.join(here,'evidence/fleet/captures.json'))).hulls;}catch{}
 const combined=[...prior.filter(h=>manifest.hulls.some(r=>r.id===h.id)&&!results.some(r=>r.id===h.id)),...results].sort((a,b)=>a.id.localeCompare(b.id));
 await fs.writeFile(path.join(here,'evidence/fleet/captures.json'),JSON.stringify({browser:browser.version(),errors,hulls:combined},null,2)+'\n');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
