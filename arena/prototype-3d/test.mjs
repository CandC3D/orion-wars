import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { validateScaleRows, SIZES, mm } from './scale.js';
import { readGLB, colourKey } from './glb-data.mjs';
import { BUDGETS, FORMAT, validateAssets, validateRegionMap, validateProjection, projectContactFrame, displayLayout, hexWorld, cameraPose } from './contract.js';
import { planning, exchange, shield, anonymous } from './fixture.js';
import { createPlayback } from '../contact-playback.js';
import { DIRS } from '../../src/tactical/hex.js';
let passed=0;
const check=(label,fn)=>{fn();passed++;console.log('ok:',label);};
const manifest=JSON.parse(fs.readFileSync(new URL('./assets.json',import.meta.url)));
const safeFrame=(contacts=[{id:'enemy',faction:'KRE',className:'frigate',pos:{q:2,r:0},facing:3}])=>({format:'player-contact-frame/1',phase:'resolution',turn:1,observation:{
  own:[{id:'own',faction:'EAR',className:'frigate',pos:{q:-2,r:0},facing:0,destroyed:false}],contacts}});
const outgoing={kind:'beam',direction:'outgoing',outcome:'resolved',shooterId:'own',targetId:'enemy',source:{q:-2,r:0},destination:{q:2,r:0}};

check('the local Three.js build and addons match the pinned r180 integrity manifest',()=>{
  const integrity=JSON.parse(fs.readFileSync(new URL('./vendor/three-r180/integrity.json',import.meta.url)));
  assert.equal(integrity.version,'0.180.0');
  for(const [file,hash] of Object.entries(integrity.sha256))assert.equal(createHash('sha256').update(fs.readFileSync(new URL('./vendor/three-r180/'+file,import.meta.url))).digest('hex'),hash,file);
});

check('three existing hulls, explicit register and stand contracts, exactly one paint candidate using an authored region map',()=>{
  validateAssets(manifest);
  for(const asset of manifest.assets)assert.ok(fs.existsSync(new URL(asset.url,import.meta.url)));
  assert.equal(manifest.assets.filter(a=>a.paint==='candidate-1987').length,1);
  const missing=structuredClone(manifest);delete missing.assets[0].register;
  assert.throws(()=>validateAssets(missing),/classification/);
  const mixed=structuredClone(manifest);mixed.assets[0].register='both';assert.throws(()=>validateAssets(mixed),/classification/);
  const wrongHeight=structuredClone(manifest);wrongHeight.assets[0].stand.height+=1;assert.throws(()=>validateAssets(wrongHeight),/uniform/);
});

check('current Sparrowhawk derivative preserves geometry AND the seven authored COLOR_0 regions',()=>{
  const prep=JSON.parse(fs.readFileSync(new URL('./prepared/preparation.json',import.meta.url)));
  const source=fs.readFileSync(new URL('./source/'+prep.source,import.meta.url));
  const json=JSON.parse(source.subarray(20,20+source.readUInt32LE(12)));
  assert.equal(json.materials.length,1);assert.equal(json.images,undefined);
  assert.equal(json.materials[0].emissiveFactor,undefined);assert.equal(json.materials[0].pbrMetallicRoughness.baseColorTexture,undefined);
  assert.equal(createHash('sha256').update(source).digest('hex'),prep.sourceSha256);
  const derived=fs.readFileSync(new URL('./prepared/'+prep.output,import.meta.url));
  assert.equal(createHash('sha256').update(derived).digest('hex'),prep.outputSha256);
  assert.equal(prep.sourceComponentCount,prep.outputComponentCount);assert.equal(prep.outputComponentCount,3);
  assert.ok(prep.outputTriangles<14000);assert.ok(prep.maximumVertexToSurfaceErrorMm<.05);
  assert.equal(manifest.assets.find(a=>a.faction==='KRE').url,'./prepared/sparrowhawk.glb');
  assert.equal(manifest.assets.find(a=>a.faction==='KRE').regionMap,'./prepared/regions.json');
  assert.equal(prep.authoredColourRegions,true);assert.equal(prep.sourceColourAttribute,'COLOR_0');
  const raw=readGLB(new URL('./source/'+prep.source,import.meta.url)),primitive=raw.json.meshes[0].primitives[0];
  const colours=raw.attribute(primitive.attributes.COLOR_0),counts={};for(const c of colours){const key=colourKey(c);counts[key]=(counts[key]??0)+1;}
  assert.deepEqual(counts,{'126936':101052,'46b749':55350,a97b50:58557,f5831f:17751,fafafa:264,ffdd1a:15549,e91d2d:2001});
  const tri=raw.attribute(primitive.indices).flat();for(let i=0;i<tri.length;i+=3)assert.equal(new Set(tri.slice(i,i+3).map(j=>colourKey(colours[j]))).size,1);
  const map=validateRegionMap(JSON.parse(fs.readFileSync(new URL('./prepared/regions.json',import.meta.url))));
  for(const key of Object.keys(counts))assert.ok(Math.abs(map.sourceCoverage[key]-map.derivativeCoverage[key])<.0002);
  assert.equal(map.features.exhaust.region,'f5831f');assert.equal(map.features.exhaust.faces.length,18);
  assert.equal(map.features.beamEmitter.region,'ffdd1a');assert.equal(map.features.beamEmitter.faces.length,312);
  const missing=structuredClone(map);delete missing.palette[0].register;assert.throws(()=>validateRegionMap(missing),/classification/);
  const mixed=structuredClone(map);mixed.palette[3].register='energetic';assert.throws(()=>validateRegionMap(mixed),/physical paint/);
  const invented=structuredClone(map);invented.features.smallDome=map.features.beamEmitter;assert.throws(()=>validateRegionMap(invented),/confirmed/);
});
check('physical scale rejects errors and preserves the requested reference sizes',()=>{
  assert.equal(mm(95),9.5);assert.equal(SIZES.mugBody[1],95);assert.equal(SIZES.d6,16);
  assert.deepEqual(SIZES.rulebook,[216,28,279]);assert.deepEqual(SIZES.notebook,[216,6,279]);
  assert.equal(SIZES.pencilLength,190);assert.equal(Math.sqrt(3)*BUDGETS.hexRadius*10,32);
  const rows=JSON.parse(fs.readFileSync(new URL('./evidence/review.json',import.meta.url))).captures.planning.scaleMeasurements;
  validateScaleRows(rows);assert.deepEqual(rows.map(r=>r.object),['Tabletop','Board card','Printed hex','Hardback rulebook','Box lid','Mug body','Mug including handle','D20','D6','Spiral notebook body','Pencil','Black hex base','Black post','EAR frigate','KRE frigate','VRA frigate']);
  assert.throws(()=>validateScaleRows([{object:'bad mug',actualMm:[18],referenceMm:[95]}]),/Scale mismatch/);
  for(const a of manifest.assets)assert.equal(a.length*10,SIZES.miniatures[a.faction]);
});
check('no procedural panel grid or faction base paint survives the revision',()=>{
  const paint=fs.readFileSync(new URL('./materials.js',import.meta.url),'utf8');
  assert.doesNotMatch(paint,/brushHash|vBrushPos|candidatePaint/);
  const renderer=fs.readFileSync(new URL('./renderer.js',import.meta.url),'utf8');
  assert.doesNotMatch(renderer,/baseColour|setColorAt|labelTexture|krelath_frigate/);
  assert.match(renderer,/painted black flight posts/);assert.match(renderer,/painted black hex bases/);
});

check('fixture packets are frozen, classified projections; shield is explicitly authored',()=>{
  for(const packet of [planning,exchange,shield,anonymous]){validateProjection(packet);assert.ok(Object.isFrozen(packet));assert.ok(Object.isFrozen(packet.units[0].hex));}
  assert.equal(shield.events[0].confirmation,'authored-own-shield');
  assert.equal(exchange.events[0].outcome,'resolved');assert.equal(exchange.events[0].kind,'beam');
});
check('both known event-time endpoints allow a hull-to-hull beam',()=>{
  const p=projectContactFrame(safeFrame(),[outgoing]);assert.equal(p.events[0].kind,'beam');
  assert.deepEqual(p.events[0].source,{id:'own',hex:{q:-2,r:0}});assert.deepEqual(p.events[0].destination,{id:'enemy',hex:{q:2,r:0}});
});
check('missing source coordinates are never recovered from a currently visible hull',()=>{
  const e={...outgoing};delete e.source;
  const p=projectContactFrame(safeFrame(),[e]);assert.equal(p.events[0].kind,'anonymous');assert.equal(p.events[0].source,undefined);
  assert.equal(p.events[0].bearing,undefined);
});
check('unknown endpoints and hidden raw geometry cannot affect the projection',()=>{
  const frame=safeFrame(),raw={...outgoing,shooterId:'unseen',source:{q:120,r:40},shooterPos:{q:90,r:30},weapon:{name:'secret'}};
  const p=projectContactFrame(frame,[raw]);raw.source={q:-999,r:999};raw.weapon={name:'different secret'};
  assert.deepEqual(projectContactFrame(frame,[raw]),p);
  assert.equal(p.events[0].source,undefined);assert.equal(p.events[0].kind,'anonymous');
  assert.equal(JSON.stringify(p).includes('secret'),false);
});
check('incoming missile impacts suppress even an accidentally supplied known launcher',()=>{
  const e={...outgoing,kind:'missile'};const p=projectContactFrame(safeFrame(),[e]);
  assert.equal(p.events[0].source,undefined);assert.equal(p.events[0].kind,'anonymous');
});
check('no disclosed endpoints means no geometry, trail, direction or shooter',()=>{
  const e={kind:'beam',outcome:'resolved',shooterId:'hidden-a',targetId:'hidden-b',source:{q:8,r:1},destination:{q:9,r:1}};
  assert.deepEqual(projectContactFrame(safeFrame(),[e]).events,[]);
});
check('contact loss removes the report without announcing destruction',()=>{
  const p=projectContactFrame(safeFrame([]),[{kind:'contact-lost',contactId:'enemy'},{...outgoing,outcome:'dead-target'}]);
  assert.equal(p.units.some(u=>u.id==='enemy'),false);assert.equal(p.units.some(u=>u.confirmedDestroyed),false);
  assert.equal(p.events[0].kind,'anonymous');assert.equal(p.events[0].outcome,'unconfirmed');
});
check('resolved and a shield face are not confirmations of hit, shield flare or enemy kill',()=>{
  const p=projectContactFrame(safeFrame(),[{...outgoing,face:2,damage:99,hit:true,destroyed:true}]);
  assert.equal(p.events[0].kind,'beam');assert.equal(p.units.some(u=>u.confirmedDestroyed),false);
  assert.equal(p.events.some(e=>e.kind==='shield-flare'),false);
});
check('the renderer packet rejects raw fields, missing confirmation and unknown endpoint ids',()=>{
  for(const [key,value] of [['rng',{}],['battle',{}],['ships',[]]])assert.throws(()=>validateProjection({...planning,[key]:value}),/not permitted/);
  const p=structuredClone(exchange);p.events[0].source.id='hidden';assert.throws(()=>validateProjection(p),/currently projected/);
  const q=structuredClone(shield);delete q.events[0].confirmation;assert.throws(()=>validateProjection(q),/confirmation/);
  const r=structuredClone(shield);r.events[0].destination.id='KRE-FF-1';assert.throws(()=>validateProjection(r),/own confirmation/);
  const s=structuredClone(planning);s.units[1].confirmedDestroyed=true;assert.throws(()=>validateProjection(s),/enemy kill/);
});
check('raw battle input cannot enter through the safe-frame adapter',()=>{
  assert.throws(()=>projectContactFrame({fleets:[],rng:{state:1}}),/player contact frame/);
  const f=safeFrame();f.observation.own[0].captain={name:'not needed'};f.observation.own[0].hull={secret:1};
  const p=projectContactFrame(f);assert.equal(p.units[0].hull,undefined);assert.equal(p.units[0].captain,undefined);
  assert.equal(p.format,FORMAT);
});
check('shared-hex layout is deterministic and tethers to unchanged rule coordinates',()=>{
  const units=planning.units.map(u=>({...u,hex:{q:1,r:2}})),before=structuredClone(units);
  const a=displayLayout(units),b=displayLayout([...units].reverse());assert.deepEqual(a,b);assert.deepEqual(units,before);
  const centre=hexWorld({q:1,r:2});
  for(const p of Object.values(a)){assert.deepEqual(p.anchor,centre);assert.ok(Math.hypot(p.x-centre.x,p.z-centre.z)<BUDGETS.hexRadius);assert.ok(p.baseScale<1);}
});
check('world projection preserves all six planar headings and distances',()=>{
  for(const [i,d] of DIRS.entries()){
    const p=hexWorld(d),angle=Math.atan2(-p.z,p.x);assert.ok(Math.abs(Math.cos(angle)-Math.cos(i*Math.PI/3))<1e-10);
    assert.ok(Math.abs(Math.sin(angle)-Math.sin(i*Math.PI/3))<1e-10);
    assert.ok(Math.abs(Math.hypot(p.x,p.z)-Math.sqrt(3)*BUDGETS.hexRadius)<1e-10);
  }
});
check('every camera interpolation, including bad/out-of-range input, respects both floors',()=>{
  for(const p of [NaN,-1,2,...Array.from({length:501},(_,i)=>i/500)]){
    const c=cameraPose(p);assert.ok(c.y>=BUDGETS.cameraFloor);
    assert.ok(Math.atan2(c.y-c.targetY,Math.hypot(c.x,c.z))*180/Math.PI>=BUDGETS.pitchFloor-1e-10);
    assert.ok(c.blur<=BUDGETS.focusBlurPixels);
  }
  assert.equal(cameraPose(0).blur,0);assert.equal(cameraPose(1).blur,3);
});
check('the production prototype imports only the existing playback clock as shared runtime',()=>{
  const files=['app.js','renderer.js','materials.js','table.js','fixture.js','contract.js','scale.js','hull-paint.js'];
  for(const file of files){const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/from\s+['"][^'"]*src\//);assert.doesNotMatch(source,/new\s+THREE\.Clock|performance\.now|Date\.now|setInterval|setTimeout|requestAnimationFrame/);
  }
  assert.match(fs.readFileSync(new URL('app.js',import.meta.url),'utf8'),/from '\.\.\/contact-playback\.js'/);
});

// Test the unchanged shared clock with synthetic active time. One camera hold followed by one effect.
let time=0,pending=[];const clock=createPlayback({now:()=>time,raf:fn=>pending.push(fn)});
const cameraTicks=[],effectTicks=[];
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const advance=async ms=>{time+=ms;const callbacks=pending;pending=[];callbacks.forEach(fn=>fn(time));await settle();};
const run=clock.run([{events:[{kind:'beam'}]}],{onFrame:(_,{hold})=>hold(100,p=>cameraTicks.push(p)),durationFor:()=>100,onTick:(_,p)=>effectTicks.push(p)});
await settle();await advance(25);clock.pause();const before=[...cameraTicks];await advance(1000);
assert.deepEqual(cameraTicks,before);assert.deepEqual(effectTicks,[]);clock.resume();await settle();await advance(75);await advance(50);
assert.equal(cameraTicks.at(-1),1);assert.ok(effectTicks.at(-1)>=.5);clock.pause();const effectBefore=[...effectTicks];await advance(500);
assert.deepEqual(effectTicks,effectBefore);clock.skip();await advance(1);assert.equal((await run).finished,true);assert.equal(effectTicks.at(-1),1);
passed++;console.log('ok: the same active clock freezes camera and effects and skip settles the event');

console.log(`\nTabletop prototype: ${passed} checks passed.`);
