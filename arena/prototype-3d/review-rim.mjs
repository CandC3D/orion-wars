import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),out=path.join(here,'evidence/rim');
await fs.mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))throw Error('outside');res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.PROTOTYPE_BROWSER?{executablePath:process.env.PROTOTYPE_BROWSER}:{})});
  const page=await browser.newPage({viewport:{width:1600,height:1080},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/arena/prototype-3d/rim-study.html');
  try{await page.waitForFunction(()=>window.rimStudy?.ready,{},{timeout:25000});}catch(e){console.log(await page.locator('#study-status').textContent(),errors);throw e;}
  const result={browser:browser.version(),viewport:{width:1600,height:1080,deviceScaleFactor:1},sizes:[],headings:[],details:{},errors};
  const max=await page.evaluate(()=>window.rimStudy.limits.maximumCapHeightMm);
  async function capture(h,heading=0,detail=null){return page.evaluate(([h,o,d])=>window.rimStudy.capture(h,o,d),[h,heading,detail]);}
  async function crops(name,m){const stage=await page.locator('.stage').boundingBox();for(const u of m.units){
    if(!u.best)continue;const b=u.best.bounds;
    await page.screenshot({path:path.join(out,name+'-'+u.code+'.png'),clip:{x:Math.floor(stage.x+b.x-5),y:Math.floor(stage.y+b.y-5),width:Math.ceil(b.width+10),height:Math.ceil(b.height+10)}});
  }}
  for(const h of [1,1.5,2,2.3,2.6,max]){
    const r=await capture(h),tag=h===max?'max':String(h);result.sizes.push(r);
    await page.locator('.stage').screenshot({path:path.join(out,'planning-'+tag+'.png')});await crops('native-'+tag,r.measure);
    assert.equal(r.measure.units.find(u=>u.id.startsWith('EAR')).code,null);
    assert.deepEqual(r.measure.units.filter(u=>u.code).map(u=>u.code).sort(),['KFG-01','VFG-04']);
    assert.ok(r.fit.every(f=>f.minYmm>0&&f.maxYmm<3&&f.faces===6&&f.physical));
    assert.ok(r.stats.mounting.every(m=>m.opaque&&Math.abs(m.exposedMm-30)<.001));
    assert.ok(r.stats.triangles<=70000&&r.stats.drawCalls<=90);
    assert.equal(r.stats.visibleEnergyObjects,0);
  }
  for(let i=0;i<6;i++){const r=await capture(max,i);result.headings.push(r.measure);assert.ok(r.measure.units.filter(u=>u.code).every(u=>u.best?.frontFacing));}
  await capture(max);result.transitGeometry=await page.evaluate(()=>window.rimStudy.transitSweep());
  assert.ok(result.transitGeometry.every(r=>r.measure.units.filter(u=>u.code).every(u=>u.best?.frontFacing)));
  result.paper=await page.evaluate(()=>window.rimStudy.setPaper(true));
  await page.locator('.stage').screenshot({path:path.join(out,'paper-planning-max.png')});await crops('paper-native-max',result.paper.measure);
  await page.evaluate(()=>window.rimStudy.setPaper(false));
  for(const f of ['EAR','KRE','VRA']){result.details[f]=await capture(max,0,f);await page.locator('.stage').screenshot({path:path.join(out,f+'-rim-detail.png')});}
  await capture(max);result.lightsOff=await page.evaluate(()=>window.rimStudy.lightsOff());assert.equal(result.lightsOff.physicalNonzeroPixels,0);
  result.oversizeRejected=await page.evaluate(()=>{try{window.rimStudy.capture(3.1);return false;}catch{return true;}});assert.equal(result.oversizeRejected,true);
  await page.goto('http://127.0.0.1:'+server.address().port+'/arena/prototype-3d/index.html');
  await page.waitForFunction(()=>window.tabletopPrototype?.ready);
  await page.evaluate(()=>window.tabletopPrototype.capturePose('planning',.48));
  const baseline=await page.locator('.frame').screenshot({path:path.join(out,'default-board.png')});
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  result.defaultBoard={expectedSha256:hash(await fs.readFile(path.join(here,'evidence/planning.png'))),actualSha256:hash(baseline)};
  assert.equal(result.defaultBoard.expectedSha256,result.defaultBoard.actualSha256,'Accepted board changed without requesting rim study');
  await page.evaluate(()=>window.tabletopPrototype.capturePose('beam',.48));result.defaultEnergyIsolation=await page.evaluate(()=>window.tabletopPrototype.physicalInvariant());assert.ok(result.defaultEnergyIsolation.identical);
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'measurements.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({sizes:result.sizes.map(r=>({height:r.measure.capHeightMm,codes:r.measure.units.filter(u=>u.code).map(u=>({code:u.code,capPixels:u.best.capPixels,widthPixels:u.best.widthPixels,inkWidthMm:u.inkWidthMm}))})),lightsOff:result.lightsOff,errors},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
