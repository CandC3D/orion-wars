import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createServer} from 'node:http';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),out=path.join(here,'evidence/fleet/images');await fs.mkdir(out,{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(here,'fleet-assets.json'))),selected=process.argv.slice(2);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const f=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!f.startsWith(root+path.sep))throw Error('outside');res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');res.end(await fs.readFile(f));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PROTOTYPE_BROWSER?{executablePath:process.env.PROTOTYPE_BROWSER}:{})});const page=await browser.newPage({viewport:{width:1100,height:800},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:'+server.address().port+'/arena/prototype-3d/fleet-studio.html');await page.waitForFunction(()=>window.fleetStudio?.ready,{},{timeout:30000});

 const lining=await page.evaluate(async()=>{
  const T=await import('three'),{brushEdgeTexture}=await import('./paint-edges.js'),normal=new T.Vector3(0,1,0),f={normal,p:[new T.Vector3(0,0,0),new T.Vector3(1,0,0),new T.Vector3(0,0,1)]};
  const ink=Array.from({length:8},(_,i)=>({a:new T.Vector3(.05+i*.08,0,-.2),b:new T.Vector3(.05+i*.08,0,1.2)}));
  ink.push({a:new T.Vector3(0,.005,0),b:new T.Vector3(1,.005,0)}); // Different parallel inset must not bleed onto this face.
  const result=brushEdgeTexture([f],{ink,raised:[]}),count=result.texture.image.data[1],ids=[...result.texture.image.data.slice(4,4+count)];result.texture.dispose();return {count,ids,evidence:result.evidence};
 });assert.equal(lining.count,8);assert.deepEqual(lining.ids,[0,1,2,3,4,5,6,7]);
 const flights=[];
 for(const id of ['kre-bomber','kre-interceptor']){
  await page.setViewportSize({width:1600,height:1080});await page.reload();await page.waitForFunction(()=>window.fleetStudio?.ready);
  await page.evaluate(id=>window.fleetStudio.load(id),id);const report=await page.evaluate(()=>window.fleetStudio.planningFlight());assert.equal(report.count,6);assert.equal(report.craftPixels.length,6);
  const dir=path.join(here,'evidence/revision-11');await page.locator('canvas').screenshot({path:path.join(dir,id+'-game-planning.png')});
  const boxes=report.craftPixels,left=Math.floor(Math.min(...boxes.map(b=>b.x))-8),top=Math.floor(Math.min(...boxes.map(b=>b.y))-8),right=Math.ceil(Math.max(...boxes.map(b=>b.x+b.width))+8),bottom=Math.ceil(Math.max(...boxes.map(b=>b.y+b.height))+8),canvas=await page.locator('canvas').boundingBox();
  await page.screenshot({path:path.join(dir,id+'-game-planning-native.png'),clip:{x:canvas.x+left,y:canvas.y+top,width:right-left,height:bottom-top}});flights.push(report);
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(here,'evidence/revision-11/extra-checks.json'),JSON.stringify({lining,flights,errors},null,2)+'\n');console.log('Complete brush coverage, adjacent-plane isolation and two game-planning flight captures passed.');

}finally{await browser?.close();await new Promise(r=>server.close(r));}
