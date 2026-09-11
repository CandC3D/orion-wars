import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createServer} from 'node:http';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),final=process.argv.includes('--final'),out=path.join(here,final?'fleet-sheets':'evidence/fleet/drafts');await fs.mkdir(out,{recursive:true});
const option=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
const selected=option('factions','EAR,KRE,VRA').split(','),revision=option('revision','11');
if(selected.some(f=>!['EAR','KRE','VRA'].includes(f))||!/^\d+$/.test(revision))throw Error('Invalid capture selection');
const manifest=JSON.parse(await fs.readFile(path.join(here,'fleet-assets.json'))),scores=final?JSON.parse(await fs.readFile(path.join(here,option('review','evidence/fleet/scores.json')))):null;
if(final){for(const [p,expected]of Object.entries({...scores.fileEvidence,...Object.assign({},...Object.values(scores.hulls).map(h=>h.evidence))}))assert.equal(createHash('sha256').update(await fs.readFile(path.join(here,p))).digest('hex'),expected,'Review evidence changed: '+p);}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const f=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!f.startsWith(root+path.sep))throw Error('outside');res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');res.end(await fs.readFile(f));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PROTOTYPE_BROWSER?{executablePath:process.env.PROTOTYPE_BROWSER}:{})});const page=await browser.newPage({viewport:{width:3200,height:1000},deviceScaleFactor:1}),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [f,slug]of Object.entries({EAR:'earth',KRE:'krelath',VRA:'vraygon'})){
  if(!selected.includes(f))continue;
  await page.setViewportSize({width:3200,height:1000});
  const hulls=manifest.hulls.filter(h=>h.faction===f);
  if(final){for(const [label,s,w]of [[f,scores.sheets[f],scores.sheetWeights],...hulls.map(h=>[h.id,scores.hulls[h.id],scores.hullWeights])]){assert.ok(s.total>=90&&s.criteria.length===w.length&&s.criteria.every(v=>v>=90&&v<=100),label+' below gate');assert.equal(s.total,Math.round(s.criteria.reduce((sum,v,i)=>sum+v*Math.round(w[i]*100),0)/10)/10,label+' score arithmetic');}}
  await page.goto('http://127.0.0.1:'+server.address().port+'/arena/prototype-3d/fleet-sheets/'+slug+'.html');await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
  const report=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,cells:[...document.querySelectorAll('[data-hull]')].map(x=>x.dataset.hull),strip:[...document.querySelectorAll('[data-strip]')].map(x=>x.dataset.strip),stripWidth:document.querySelector('.strip-row').scrollWidth,stripAvailable:document.querySelector('.strip-row').clientWidth,broken:[...document.images].filter(x=>!x.naturalWidth).length,overflows:[...document.querySelectorAll('.cell,.strip-caption,.filename')].filter(x=>x.scrollWidth>x.clientWidth+1).map(x=>x.textContent)}));
  assert.equal(report.width,3200);assert.deepEqual(report.cells,hulls.map(h=>h.id));assert.deepEqual(report.strip,report.cells);assert.equal(report.broken,0);assert.deepEqual(report.overflows,[]);assert.ok(report.stripWidth<=report.stripAvailable+1);
  await page.screenshot({path:path.join(out,slug+'.png'),fullPage:true});
  {await page.setViewportSize({width:3200,height:Math.max(1000,report.height)});const cells=path.join(here,'evidence/revision-'+revision+'/cells');await fs.mkdir(cells,{recursive:true});for(const h of hulls)await page.locator(`[data-hull="${h.id}"]`).screenshot({path:path.join(cells,h.id+'.png')});await page.setViewportSize({width:3200,height:1000});}
  // Native-size crops permit direct inspection without the full-sheet downscale.
  await page.locator('.strip').screenshot({path:path.join(out,slug+'-strip.png')});
  await page.setViewportSize({width:1600,height:1000});
  await page.locator('body').screenshot({path:path.join(out,slug+'-overview.png')});
  results.push({faction:f,...report});console.log(slug+': '+report.width+' × '+report.height+', '+hulls.length+' complete cells');
 }
 assert.deepEqual(errors,[]);let prior=[];try{prior=JSON.parse(await fs.readFile(path.join(here,'evidence/fleet/sheet-captures.json'))).sheets;}catch{}
 const sheets=[...prior.filter(r=>!selected.includes(r.faction)),...results].sort((a,b)=>a.faction.localeCompare(b.faction));
 await fs.writeFile(path.join(here,'evidence/fleet/sheet-captures.json'),JSON.stringify({final,browser:browser.version(),errors,sheets},null,2)+'\n');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
