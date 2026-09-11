import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createServer} from 'node:http';import assert from 'node:assert/strict';
import {faceFor,DIRS} from '../../src/tactical/hex.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),out=path.join(here,'evidence/revision-11');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))throw Error('outside');res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({headless:true,...(process.env.PROTOTYPE_BROWSER?{executablePath:process.env.PROTOTYPE_BROWSER}:{})});const page=await browser.newPage({viewport:{width:1600,height:1080}}),errors=[],headings=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/arena/prototype-3d/index.html`);await page.waitForFunction(()=>window.tabletopPrototype?.ready);
 const frames=[];
 await page.evaluate(()=>{void window.tabletopPrototype.play();});
 for(const y of [140,110,75,40,26.01]){
  await page.waitForFunction(y=>window.tabletopPrototype.inspect().camera.y<=y,y);
  const r=await page.evaluate(()=>{window.tabletopPrototype.pause();return window.tabletopPrototype.inspect();});
  const file='camera-move-'+frames.length+'.png';await page.locator('.frame').screenshot({path:path.join(out,file)});frames.push({file,camera:r.actualCamera,pose:r.camera});
  assert.ok(r.actualCamera.position[1]>=24&&r.actualCamera.pitch>=32);await page.evaluate(()=>window.tabletopPrototype.resume());
 }
 await page.evaluate(()=>window.tabletopPrototype.skip());await page.waitForFunction(()=>!window.tabletopPrototype.running);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'camera-move.json'),JSON.stringify({source:'actual contact-playback run; paused at sampled heights, resumed between captures',moveDurationMs:1200,frames,errors},null,2)+'\n');
 console.log('Actual playback descent/lens move captured at five points; skip returns to planning.');

}finally{await browser?.close();await new Promise(r=>server.close(r));}
