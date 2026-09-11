// Browser evidence for the supplied board lettering, not a new camera or scene.
// PLAYWRIGHT_MODULE / PROTOTYPE_BROWSER work as in review.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {BOARD_MARKS} from './brand/board-marks.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),out=path.join(here,'evidence/brand');
await fs.mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.glb':'model/gltf-binary','.png':'image/png'};
const server=createServer(async(req,res)=>{try{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep))throw Error('Outside workspace');
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
}catch{res.writeHead(404).end('Not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PROTOTYPE_BROWSER?{executablePath:process.env.PROTOTYPE_BROWSER}:{})});
 const page=await browser.newPage({viewport:{width:1600,height:1080},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/arena/prototype-3d/index.html`);
 await page.waitForFunction(()=>window.tabletopPrototype?.ready,{},{timeout:25000});
 const checks={browser:browser.version(),viewport:{width:1600,height:1080},captures:{},sourceHashes:{}};
 for(const kind of ['planning','beam']){
  const evidence=await page.evaluate(k=>window.tabletopPrototype.capturePose(k,.48),kind);
  checks.captures[kind]={camera:evidence.actualCamera,drawCalls:evidence.drawCalls,triangles:evidence.triangles,materialTextureMiB:evidence.materialTextureMiB};
  await page.locator('.frame').screenshot({path:path.join(out,kind==='beam'?'resolution.png':'planning.png')});
 }
 const art=await page.evaluate(async()=>{
  const {BOARD_MARKS}=await import('./brand/board-marks.js'),{fillBoardMark,BOARD_BRAND}=await import('./brand/board-print.js'),{boardTexture}=await import('./materials.js');
  const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const results={},reference=canvas(1000,340),r=reference.getContext('2d');r.fillStyle='#253b45';r.fillRect(0,0,1000,340);
  for(const [key,mark] of Object.entries(BOARD_MARKS)){
   const [x,y,w,h]=mark.viewBox,original=canvas(w,h),compiled=canvas(w,h),a=original.getContext('2d'),b=compiled.getContext('2d');
   const img=new Image();img.src='./brand/'+mark.source;await img.decode();a.drawImage(img,0,0,w,h);
   b.fillStyle='#FFFBEB';b.translate(-x,-y);fillBoardMark(b,mark);
   const source=a.getImageData(0,0,w,h).data,target=b.getImageData(0,0,w,h).data;
   let difference=0,sourceArea=0,solidMismatch=0,maxDifference=0;
   for(let i=3;i<source.length;i+=4){const delta=Math.abs(source[i]-target[i]);difference+=delta;sourceArea+=source[i];maxDifference=Math.max(maxDifference,delta);if((source[i]===255&&target[i]===0)||(source[i]===0&&target[i]===255))solidMismatch++;}
   results[key]={paths:mark.paths.length,groups:mark.groups,alphaDifferenceFraction:difference/sourceArea,solidMismatchPixels:solidMismatch,maxAlphaDifference:maxDifference};
   r.drawImage(img,key==='wordmark'?24:96,key==='wordmark'?12:268,w,h);
  }
  const texture=boardTexture(),header=canvas(texture.image.width,Math.ceil(112*texture.image.width/1152));
  header.getContext('2d').drawImage(texture.image,0,0);
  const dimensions={width:texture.image.width,height:texture.image.height,boardMipMiB:texture.image.width*texture.image.height*4*4/3/1048576,gridInsetBelowPlayingFieldMm:10*320/768};
  const pixels=texture.image.getContext('2d').getImageData(0,0,texture.image.width,128).data;
  let gridInkInMargin=0;for(let y=104;y<128;y++)for(let x=40;x<1496;x++){const i=(y*1536+x)*4;if(pixels[i]===113&&pixels[i+1]===133&&pixels[i+2]===134)gridInkInMargin++;}
  if(gridInkInMargin)throw Error('Hex grid intrudes into header margin');dimensions.gridInkPixelsInMargin=gridInkInMargin;
  const assets={header:header.toDataURL(),source:reference.toDataURL()};texture.dispose();
  return {results,dimensions,layout:BOARD_BRAND,assets};
 });
 for(const [key,mark] of Object.entries(BOARD_MARKS)){
  const hash=createHash('sha256').update(await fs.readFile(path.join(here,'brand',mark.source))).digest('hex');
  assert.equal(hash,mark.sha256,'Compiled outline data is stale');checks.sourceHashes[mark.source]=hash;
  assert.equal(art.results[key].solidMismatchPixels,0,'Supplied silhouette changed');
  assert.ok(art.results[key].alphaDifferenceFraction<.001,'Outline coverage differs by more than 0.1%');
 }
 for(const [key,file] of [['header','header.png'],['source','source-outlines.png']])await fs.writeFile(path.join(out,file),Buffer.from(art.assets[key].split(',')[1],'base64'));
 delete art.assets;checks.art=art;checks.errors=errors;
 assert.deepEqual(errors,[]);assert.ok(checks.captures.planning.materialTextureMiB<=24);
 const sourceFiles=['materials.js','renderer.js','contract.js','brand/board-print.js','brand/board-marks.js','brand/build-board-marks.mjs'];
 checks.implementationHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,createHash('sha256').update(await fs.readFile(path.join(here,f))).digest('hex')])));
 await fs.writeFile(path.join(out,'checks.json'),JSON.stringify(checks,null,2)+'\n');
 console.log(JSON.stringify(checks,null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
