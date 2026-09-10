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
    if(kind==='planning'){
      assert.equal(result.captures.planning.visibleEnergyObjects,0,'static pieces came to life without playback');
      assert.equal(result.captures.planning.clearVariant,false,'clear experiment replaced the painted default');
      const stage=await page.locator('.stage').boundingBox();
      for(const [faction,name] of [['EAR','monoceros'],['KRE','sparrowhawk'],['VRA','shard']]){
        const b=result.captures.planning.hullScreenBounds[faction+'-FF-1'];
        await page.screenshot({path:path.join(out,name+'-planning.png'),clip:{x:Math.floor(stage.x+b.x-10),y:Math.floor(stage.y+b.y-10),width:Math.ceil(b.width+20),height:Math.ceil(b.height+20)}});
      }
    }
  }
  result.checks.planningBrush=await page.evaluate(()=>window.tabletopPrototype.brushEvidence());
  result.checks.visibleRegions=await page.evaluate(()=>window.tabletopPrototype.regionEvidence());
  for(const [faction,r] of Object.entries(result.checks.planningBrush))assert.ok(r.pixelsChangedAbove025>30,'Brushwork invisible at planning size: '+faction);
  result.detailCameras={};
  for(const [faction,name] of [['EAR','monoceros'],['KRE','sparrowhawk'],['VRA','shard']])for(const angle of ['plan','side','stern','bow']){
    result.detailCameras[faction+'-'+angle]=await page.evaluate(([a,f])=>window.tabletopPrototype.captureDetail(a,f),[angle,faction]);
    await page.locator('.stage').screenshot({path:path.join(out,name+'-'+(angle==='plan'?'detail':angle)+'.png')});
  }
  await page.evaluate(()=>window.tabletopPrototype.capturePose('anonymous',.48));
  await page.evaluate(()=>window.tabletopPrototype.capturePose('beam',.48));
  result.checks.lightsOff=await page.evaluate(()=>window.tabletopPrototype.lightsOffEvidence());
  assert.equal(result.checks.lightsOff.physicalNonzeroPixels,0,'bright physical paint emits without room lights');
  assert.ok(result.checks.lightsOff.energeticNonzeroPixels>0,'imagined energy depends on room lights');
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
  result.checks.geometricPaint=await page.evaluate(async()=>{
    const T=await import('three'),{preparePaintGeometry,regionOf}=await import('./hull-paint.js');
    const colour=g=>{const a=[];for(let i=0;i<g.attributes.position.count;i++)a.push(18/255,105/255,54/255);g.setAttribute('color',new T.Float32BufferAttribute(a,3));return g;};
    const box=preparePaintGeometry(colour(new T.BoxGeometry()),'KRE'),plane=preparePaintGeometry(colour(new T.PlaneGeometry()),'KRE');
    const fold=new T.BufferGeometry();fold.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,0,1,1,0,0,0,0,0,0,-1,0],3));fold.computeVertexNormals();
    const folded=preparePaintGeometry(colour(fold),'KRE');let missing=false,unknown=false;
    try{preparePaintGeometry(new T.BoxGeometry(),'KRE');}catch{missing=true;}
    try{regionOf([.8,.05,.9],'KRE');}catch{unknown=true;}
    const result={cubeConvex:box.userData.paint.raisedEdges,cubeConcave:box.userData.paint.concaveEdges,flatPlaneCreases:plane.userData.paint.raisedEdges+plane.userData.paint.concaveEdges,foldConcave:folded.userData.paint.concaveEdges,missingColourRejected:missing,unknownColourRejected:unknown};
    [box,plane,folded,fold].forEach(g=>g.dispose());return result;
  });
  assert.deepEqual(result.checks.geometricPaint,{cubeConvex:12,cubeConcave:0,flatPlaneCreases:0,foldConcave:1,missingColourRejected:true,unknownColourRejected:true});
  result.checks.allMaterialRegions=await page.evaluate(async()=>{
    const T=await import('three'),{ART_PROFILES}=await import('./hull-art.js'),{preparePaintGeometry,candidatePaint}=await import('./hull-paint.js');
    let regions=0,metal=0,energyPaint=0,clearEligible=0;
    for(const [faction,profile] of Object.entries(ART_PROFILES))for(const p of profile.palette){
      const g=new T.PlaneGeometry(),rgb=Array.from({length:g.attributes.position.count},()=>p.rgb).flat();g.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
      const prepared=preparePaintGeometry(g,faction),m=candidatePaint(faction,prepared);
      if([...prepared.attributes.paintMetallic.array].some(v=>v!==(p.classification==='metal'?1:0)))throw Error('Wrong runtime metal region '+faction+'/'+p.key);
      if([...prepared.attributes.paintClear.array].some(v=>v!==(p.variant?1:0)))throw Error('Wrong clear region');
      if(m.emissive.getHex()||m.emissiveIntensity||m.transparent)throw Error('Source region emits or alpha blends');
      regions++;if(p.classification==='metal')metal++;if(p.classification==='emissive-designated')energyPaint++;if(p.variant)clearEligible++;
      prepared.userData.paintEdges.dispose();prepared.dispose();g.dispose();m.dispose();
    }
    return {regions,metal,energyPaint,clearEligible};
  });
  assert.deepEqual(result.checks.allMaterialRegions,{regions:23,metal:3,energyPaint:9,clearEligible:1});
  for(const detail of Object.values(result.detailCameras)){assert.ok(detail.actualCamera.position[1]>=24);assert.ok(detail.actualCamera.pitch>=32);}

  result.clearVariant={};
  for(const angle of ['plan','side'])for(const enabled of [false,true]){
    await page.evaluate(([angle,enabled])=>{window.tabletopPrototype.capturePose('planning');window.tabletopPrototype.setClearVariant(enabled);window.tabletopPrototype.captureDetail(angle,'VRA');},[angle,enabled]);
    const name='shard-'+angle+'-'+(enabled?'clear':'paint');
    await page.locator('.stage').screenshot({path:path.join(out,name+'.png')});
    result.clearVariant[name]=await page.evaluate(e=>window.tabletopPrototype.setClearVariant(e),enabled);
  }
  result.checks.clearLightsOff=await page.evaluate(()=>window.tabletopPrototype.lightsOffEvidence());
  assert.equal(result.checks.clearLightsOff.physicalNonzeroPixels,0);
  await page.evaluate(()=>window.tabletopPrototype.setClearVariant(false));
  for(const angle of ['plan','side']){
    const a=result.clearVariant['shard-'+angle+'-paint'],b=result.clearVariant['shard-'+angle+'-clear'];
    assert.deepEqual(a.actualCamera,b.actualCamera);assert.equal(b.triangles,24);
  }
  for(const enabled of [false,true]){
    result.clearVariant['planning-'+(enabled?'clear':'paint')]=await page.evaluate(e=>{window.tabletopPrototype.capturePose('planning');return window.tabletopPrototype.setClearVariant(e);},enabled);
    await page.locator('.frame').screenshot({path:path.join(out,'planning-'+(enabled?'clear':'paint')+'.png')});
  }
  await page.evaluate(()=>window.tabletopPrototype.setClearVariant(false));

  await page.evaluate(()=>window.tabletopPrototype.capturePose('planning'));
  await page.click('#exchange');
  await page.waitForFunction(()=>window.tabletopPrototype.inspect().camera.y<60);
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
  const dimensions=result.captures.planning.scaleMeasurements;
  const f=n=>Number(n.toFixed(3));
  const scaleText=['# Measured scale - revision 05 (all dimensions unchanged)','',
    '**1 scene unit = 10 mm.** These are physical tabletop dimensions, unrelated to fictional ship metres. X / Y / Z means width / height / depth unless the row says otherwise.',
    '', 'The browser measures the built geometry before its tabletop rotation. The printed hex uses the same 32 mm across-flats geometry as the presentation coordinates. Rows fail at a 0.06 mm discrepancy. The D20 uses opposite vertices (20 mm), not opposite faces.',
    '', '| Object | Measurement | Scene units | Implied actual mm | Reference / chosen mm |',
    '|---|---|---:|---:|---:|',
    ...dimensions.map(r=>'| '+[r.object,r.basis,r.sceneUnits.map(f).join(' x '),r.actualMm.map(f).join(' x '),r.referenceMm.map(f).join(' x ')].join(' | ')+' |'),
    '', 'Current source geometry changes hull height/width; these are measured bounds at the unchanged lengths:',
    '', '| Current hull | Length mm | Height mm | Width mm |', '|---|---:|---:|---:|',
    ...result.captures.planning.assets.map(a=>'| '+a.key+' | '+a.sizeMm.map(f).join(' | ')+' |'),
    '', 'References: mug, dice, rulebook, notebook, pencil, hex and frigate range are the sizes supplied by Fable and Chris. Table (1000 x 700 mm), 480 x 320 mm study board, box lid, 25 mm base and 30 mm post are prototype choices. Book thickness is 28 mm within the supplied 25-30 mm range.',
    '', 'All three samples remain frigates: Vraygon 45 mm, Earth 55 mm, Sparrowhawk 65 mm. This demonstrates size variation within the requested 40-75 mm range, not a validated destroyer/battleship scale ladder. Swift is not loaded.',
    '', 'The notebook row measures its 216 x 279 mm body; the wire loop adds 1.95 mm beyond its left edge and reaches 7.45 mm above the table. The pencil has a 7 mm hexagonal section across corners (6.062 mm across flats), including a real sharpened tip within the 190 mm total. The mug-body reference excludes its handle; the full width is reported separately.',
    '', 'The card is 2 mm thick. Printed faces are 0.05 mm above their substrate to prevent depth interference; this is a render separation, not extra card thickness. Posts meet the actual ray-intersected underside of each hull; their exposed length is uniformly 30 mm. Their contact coordinates are included in evidence/review.json.',
    '', 'Before correction, using the old 1.65-unit hex radius as 32 mm across flats implied 11.197 mm/unit: the mug was only 17.58 mm high x 18.81 mm wide, the D6 8.73 mm, D20 15.67 mm, rulebook about 48.15 x 69.42 mm, notebook 48.15 x 44.79 mm, and pencil 39.19 mm long. Equal 3.8-unit hulls all implied 42.55 mm. Those relative scales were wrong.',
    '', 'This table is regenerated by review.mjs; exact floating-point measurements and all hull length / height / width bounds are in evidence/review.json.', ''].join('\n');
  await fs.writeFile(path.join(here,'SCALE.md'),scaleText);

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
  const clearPage=await browser.newPage({viewport:{width:1600,height:1080}});
  await clearPage.goto(origin+'/arena/prototype-3d/index.html?insert=clear');
  await clearPage.waitForFunction(()=>window.tabletopPrototype?.ready);
  assert.equal(await clearPage.evaluate(()=>window.tabletopPrototype.inspect().clearVariant),true);
  assert.equal(await clearPage.evaluate(()=>window.tabletopPrototype.inspect().visibleEnergyObjects),0);
  await clearPage.close();result.checks.clearVariantURL=true;
  const fallback=await browser.newPage({viewport:{width:1000,height:800}});
  await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
  await fallback.goto(origin+'/arena/prototype-3d/index.html');
  await fallback.waitForFunction(()=>document.querySelector('#status').textContent.includes('WebGL2 is unavailable'));
  assert.ok(await fallback.locator('#fallback a').isVisible());result.checks.svgFallback=true;
  await fs.writeFile(path.join(out,'review.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({checks:result.checks,timing:result.timing,gpu:result.gpu,errors:result.errors,captures:Object.fromEntries(Object.entries(result.captures).map(([k,v])=>[k,{drawCalls:v.drawCalls,triangles:v.triangles}]))},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
