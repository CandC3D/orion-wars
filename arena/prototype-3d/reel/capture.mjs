import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {DURATION,FRAMES,FPS,timeline} from './timeline.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/chorr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),out=path.resolve(here,'../evidence/pre-alpha-reel-second-cut');await fs.mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const f=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!f.startsWith(root+path.sep))throw Error('outside');res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');res.end(await fs.readFile(f));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,encoder;const errors=[],results=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PROTOTYPE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
 await page.goto('http://127.0.0.1:'+server.address().port+'/arena/prototype-3d/reel/index.html');await page.waitForFunction(()=>window.reel?.ready||window.reelError,{},{timeout:120000});assert.equal(await page.evaluate(()=>window.reelError),undefined);
 const samples=[['planning',2],['descent-middle',3],['turn-middle',3.95],['advance-middle',5.15],['krelath-beams-and-fel-fire',8.5],['earth-beams-and-star',11.7],['vraygon-beam-and-star',15],['fel-fire-in-flight',22.5],['point-defence',24.1],['interception',24.5],['hit-explosion',25.6],['final',31]];
 for(const [name,t] of samples){for(const planning of [false,true]){if(planning&&['planning','final'].includes(name))continue;const data=await page.evaluate(([t,p])=>window.reel.inspect(t,p),[t,planning]);results.push({name:name+(planning?'-planning':''),...data});await page.screenshot({path:path.join(out,name+(planning?'-planning':'')+'.png')});console.log(name+(planning?'-planning':'')+' '+data.triangles+' triangles / '+data.draws+' draws');}}
 const isolation=[];for(const t of [8.5,11.7,15,24.1,25.6]){const row=await page.evaluate(t=>window.reel.isolation(t),t);assert.equal(row.identical,true,'Effects modified physical or shadow buffers');assert.equal(row.energeticLights,0);isolation.push({time:t,...row});}
 const readability=[];for(const t of [8.5,11.7,15,24.1,25.6])readability.push(await page.evaluate(t=>window.reel.measure(t),t));
 await fs.writeFile(path.join(out,'readability.json'),JSON.stringify(readability,null,2)+'\n');
 const onset=[];const schedule=timeline(await page.evaluate(()=>window.reel.packet));
 for(const t of [...new Set(schedule.cues.map(c=>c.time))]){const m=await page.evaluate(t=>window.reel.measure(t,false),t),frame=Math.round(t*FPS),expected=[];
  schedule.beams.forEach((e,i)=>{if(Math.round(e.start*FPS)===frame){expected.push('continuous beam '+i,'hit flash and fireball '+i);if(e.absorbed)expected.push('confirmed struck shield face '+i);}});
  schedule.missiles.forEach((e,i)=>{if(Math.round(e.start*FPS)===frame)expected.push('projectile '+i);if(Math.round(e.end*FPS)===frame){expected.push('hit flash and fireball '+(5+i));if(e.impact.absorbed)expected.push('confirmed struck shield face '+(5+i));}for(let j=0;j<4;j++)if(Math.round((e.end-1+j*.2)*FPS)===frame)expected.push('PD tracer '+(i*4+j));});
  for(const name of expected)assert.ok(m.effects.some(e=>e.effect===name&&e.pixels>0),'Cue without its own visible effect: '+name+' '+t);
  onset.push({time:t,frame,planning:false,expected,effects:m.effects});}

 await fs.writeFile(path.join(out,'cue-onset-frames.json'),JSON.stringify(onset,null,2)+'\n');
 await page.evaluate(()=>window.reel.start());const a=await page.evaluate(()=>window.reel.step(11700));const pixelsA=await page.screenshot();assert.equal(a.time,11.7);await page.evaluate(()=>window.reel.start());const b=await page.evaluate(()=>window.reel.step(11700));assert.deepEqual(a,b);assert.ok(pixelsA.equals(await page.screenshot()),'Repeated stepped frame differs');
 for(let i=0;i<=316;i++){const s=await page.evaluate(t=>window.reel.inspect(t),i/10);assert.ok(s.ships.every(u=>u.clip.every(p=>Math.abs(p[0])<1&&Math.abs(p[1])<1)),'Clipped ship at '+i/10);}
 console.log('Camera and ship bounds passed at every 100 ms');
 if(process.argv.includes('--video')){
  const ffmpeg=process.env.FFMPEG||'C:/Users/chorr/AppData/Local/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe';
  // The bundled build decodes MJPEG, but only encodes PNG. Supply completed
  // quality-100 JPEG frames; delivery stills remain the original PNG captures.
  encoder=spawn(ffmpeg,['-y','-f','image2pipe','-framerate','30','-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libvpx','-b:v','10000k','-crf','8','-deadline','good','-cpu-used','2','-pix_fmt','yuv420p',path.join(out,'pre-alpha-reel-silent.webm')],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let encodingLog='';encoder.stderr.on('data',d=>{encodingLog+=d;});encoder.stdin.on('error',()=>{});const completion=once(encoder,'close');
  await page.evaluate(()=>window.reel.start());let maxTriangles=0,maxDraws=0;
  for(let i=0;i<FRAMES;i++){
   const s=await page.evaluate(ms=>window.reel.step(ms),i*1000/30);assert.ok(Math.abs(s.time-i/30)<1e-8);maxTriangles=Math.max(maxTriangles,s.triangles);maxDraws=Math.max(maxDraws,s.draws);assert.ok(s.triangles<350000&&s.draws<200&&s.targetMiB<110);assert.ok(s.ships.every(u=>u.clip.every(p=>Math.abs(p[0])<1&&Math.abs(p[1])<1)),'Clipped ship');assert.ok(s.endpoints.every(e=>(e.source?.[1]??e.position?.[1])>.6&&(e.target?.[1]??1)>.6));
   if(encoder.exitCode!==null)throw Error(encodingLog);const frame=await page.screenshot({type:'jpeg',quality:100});if(!encoder.stdin.write(frame))await Promise.race([once(encoder.stdin,'drain'),completion.then(()=>{throw Error(encodingLog);})]);
   if(i%30===0)console.log(`Rendered ${i}/${FRAMES} frames (${(i/30).toFixed(0)} seconds)`);
  }
  encoder.stdin.end();const [code]=await completion;await fs.writeFile(path.join(out,'encoding.log'),encodingLog);assert.equal(code,0,encodingLog.slice(-2500));
  results.push({video:{frames:FRAMES,fps:30,width:1920,height:1080,duration:DURATION,codec:'VP8',maxTriangles,maxDraws,clock:'createPlayback / deterministic injected now and raf'}});
 }
 assert.deepEqual(errors,[]);const audit=JSON.stringify({browser:browser.version(),errors,isolation,deterministicStep:true,results},null,2)+'\n';await fs.writeFile(path.join(out,'frame-audit.json'),audit);if(process.argv.includes('--video'))await fs.writeFile(path.join(out,'video-audit.json'),audit);
}finally{await browser?.close();await new Promise(r=>server.close(r));if(encoder&&encoder.exitCode===null)encoder.kill();}
