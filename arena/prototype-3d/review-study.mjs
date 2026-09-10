import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),out=path.join(here,'evidence');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))throw Error('outside');res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PROTOTYPE_BROWSER?{executablePath:process.env.PROTOTYPE_BROWSER}:{})});
 const page=await browser.newPage({viewport:{width:1600,height:1080},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:'+server.address().port+'/arena/prototype-3d/material-study.html');
 try{await page.waitForFunction(()=>window.materialStudy?.ready,{},{timeout:25000});}catch(e){console.log(await page.locator('#study-status').textContent());console.log(errors);throw e;}
 const result={browser:browser.version(),captures:{},checks:{},errors};
 for(const angle of ['side','plan','detail'])for(const mode of ['paint','clear','posts']){
  if(angle==='detail'&&mode==='posts')continue;
  const name=(mode==='posts'?'posts':('crystal-'+mode))+'-'+angle;
  result.captures[name]=await page.evaluate(([m,a])=>window.materialStudy.capture(m,a),[mode,angle]);
  await page.locator('.stage').screenshot({path:path.join(out,name+'.png')});
  assert.ok(result.captures[name].camera.position[1]>=24);assert.ok(result.captures[name].camera.pitch>=32);
  assert.ok(result.captures[name].triangles<90000&&result.captures[name].drawCalls<110,'Isolated comparison budget exceeded');
  assert.ok(result.captures[name].estimatedTargetMiB<160);
 }
 for(const a of ['side','plan','detail'])assert.deepEqual(result.captures['crystal-paint-'+a].camera,result.captures['crystal-clear-'+a].camera);
 for(const m of ['clear','posts']){await page.evaluate(m=>window.materialStudy.capture(m),m);result.checks[m+'LightsOff']=await page.evaluate(()=>window.materialStudy.lightsOff());assert.equal(result.checks[m+'LightsOff'].nonzeroPhysicalPixels,0);}
 for(const m of ['clear','posts']){result.checks[m+'Optics']=await page.evaluate(m=>window.materialStudy.opticsEvidence(m),m);assert.ok(result.checks[m+'Optics'].pixels>500,'Comparison too small');assert.ok(result.checks[m+'Optics'].medianMm>.15,'Optical path collapsed to its numerical floor');}
 result.checks.postShadow=await page.evaluate(()=>window.materialStudy.shadowEvidence());assert.ok(result.checks.postShadow.transmittedPixels<result.checks.postShadow.opaquePixels*.6,'Clear post still casts opaque shadow');
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'material-study.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({captures:Object.fromEntries(Object.entries(result.captures).map(([k,v])=>[k,{triangles:v.triangles,draws:v.drawCalls}])),checks:result.checks,errors},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
