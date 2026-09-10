import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { validateScaleRows, SIZES, mm } from './scale.js';
import { artProfile, METAL_FINISH } from './hull-art.js';
import {FACTION_PALETTES,factionRegion,validateFactionPalette} from './faction-palettes.js';
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

check('three current local hulls, each painted with an explicit register, stand and per-hull region map',()=>{
  validateAssets(manifest);
  for(const asset of manifest.assets)assert.ok(fs.existsSync(new URL(asset.url,import.meta.url)));
  assert.equal(manifest.assets.filter(a=>a.paint==='painted-1987').length,3);
  const stale=structuredClone(manifest);stale.assets[0].url='../../assets/game/ships/earth_frigate.glb';assert.throws(()=>validateAssets(stale),/current/);
  const missing=structuredClone(manifest);delete missing.assets[0].register;
  assert.throws(()=>validateAssets(missing),/classification/);
  const mixed=structuredClone(manifest);mixed.assets[0].register='both';assert.throws(()=>validateAssets(mixed),/classification/);
  const wrongHeight=structuredClone(manifest);wrongHeight.assets[0].stand.height+=1;assert.throws(()=>validateAssets(wrongHeight),/uniform/);
});

const sourceConfigs=JSON.parse(fs.readFileSync(new URL('./hull-sources.json',import.meta.url)));
for(const [faction,config] of Object.entries(sourceConfigs))check(faction+' current derivative preserves its own geometry, colours and fixtures',()=>{
  const prep=JSON.parse(fs.readFileSync(new URL('./prepared/'+config.output+'-preparation.json',import.meta.url)));
  const sourceURL=new URL('./source/'+config.source,import.meta.url),derivedURL=new URL('./prepared/'+prep.output,import.meta.url);
  assert.equal(createHash('sha256').update(fs.readFileSync(sourceURL)).digest('hex'),prep.sourceSha256);
  assert.equal(createHash('sha256').update(fs.readFileSync(derivedURL)).digest('hex'),prep.outputSha256);
  assert.equal(prep.sourceComponentCount,prep.outputComponentCount);assert.equal(prep.outputComponentCount,{EAR:2,KRE:3,VRA:33}[faction]);
  assert.ok(prep.maximumVertexToSurfaceErrorMm<({EAR:.27,KRE:.05,VRA:.18}[faction]));
  assert.ok(prep.outputBytes<prep.sourceBytes/5);assert.ok(prep.outputTriangles<({EAR:11500,KRE:14000,VRA:4250}[faction]));
  const asset=manifest.assets.find(a=>a.faction===faction);
  assert.equal(asset.url,'./prepared/'+config.output+'.glb');
  const raw=readGLB(sourceURL),primitive=raw.json.meshes[0].primitives[0],colours=raw.attribute(primitive.attributes.COLOR_0),counts={};
  for(const c of colours){const key=colourKey(c);counts[key]=(counts[key]??0)+1;}
  assert.deepEqual(counts,config.colours);assert.equal(colours.length,{EAR:361896,KRE:250524,VRA:42192}[faction]);
  const tri=raw.attribute(primitive.indices).flat();for(let i=0;i<tri.length;i+=3)assert.equal(new Set(tri.slice(i,i+3).map(j=>colourKey(colours[j]))).size,1);
  const derived=readGLB(derivedURL),p=derived.json.meshes[0].primitives[0];
  assert.equal(derived.json.accessors[p.indices].count/3,prep.outputTriangles);
  for(const name of ['POSITION','NORMAL','COLOR_0'])assert.ok(derived.attribute(p.attributes[name]).every(v=>v.every(Number.isFinite)));
  const map=validateRegionMap(JSON.parse(fs.readFileSync(new URL(asset.regionMap,import.meta.url))),faction);
  assert.deepEqual(map.palette.map(p=>p.key).sort(),Object.keys(config.colours).sort());
  for(const key of Object.keys(counts))assert.ok(Math.abs(map.sourceCoverage[key]-map.derivativeCoverage[key])<({EAR:.0004,KRE:.0002,VRA:.0065}[faction]));
  const missing=structuredClone(map);delete missing.palette[0].register;assert.throws(()=>validateRegionMap(missing),/classification/);
  const mixed=structuredClone(map);mixed.palette[0].register='energetic';assert.throws(()=>validateRegionMap(mixed),/physical paint/);
  const invented=structuredClone(map);invented.features.guessedFixture={};assert.throws(()=>validateRegionMap(invented),/confirmed/);
  assert.throws(()=>validateRegionMap(map,faction==='EAR'?'KRE':'EAR'),/different hull/);
  if(faction==='KRE'){assert.equal(map.features.exhaust.faces.length,18);assert.equal(map.features.beamEmitter.faces.length,312);}
  if(faction==='EAR'){assert.equal(map.features.exhaust.region,'e91d2d');assert.equal(map.features.exhaust.faces.length,12);assert.equal(map.features.beamEmitter.faces.length,179);}
  if(faction==='VRA'){assert.deepEqual(map.features,{});assert.equal(asset.sockets.weapon,undefined);}
});
check('Crystal comparison is a reduced current hull with exact palette, retained components and no invented anatomy',()=>{
  const config=JSON.parse(fs.readFileSync(new URL('./comparison-source.json',import.meta.url))),prep=JSON.parse(fs.readFileSync(new URL('./prepared/crystal-preparation.json',import.meta.url)));
  for(const [file,hash] of [['source/'+config.source,prep.sourceSha256],['prepared/crystal.glb',prep.outputSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(new URL('./'+file,import.meta.url))).digest('hex'),hash);
  assert.equal(prep.sourceTriangles,23642);assert.equal(prep.outputTriangles,11742);assert.equal(prep.sourceComponentCount,53);assert.equal(prep.outputComponentCount,53);
  assert.ok(prep.maximumVertexToSurfaceErrorMm<.15);assert.ok(prep.outputBytes<400000);assert.equal(prep.miniatureLengthMm,90);
  const map=JSON.parse(fs.readFileSync(new URL('./prepared/crystal-regions.json',import.meta.url))),palette=Object.keys(config.colours).map(k=>factionRegion('VRA',k));
  validateRegionMap(map,'VRA',{palette,confirmedEffects:[]});assert.deepEqual(map.features,{});
  const wrongProfile={palette:structuredClone(palette),confirmedEffects:[]};wrongProfile.palette[0].classification='metal';assert.throws(()=>validateRegionMap(map,'VRA',wrongProfile),/cannot override faction/);
  const derived=readGLB(new URL('./prepared/crystal.glb',import.meta.url)),dp=derived.json.meshes[0].primitives[0],positions=derived.attribute(dp.attributes.POSITION);assert.ok(Math.abs(Math.max(...positions.map(p=>p[0]))-Math.min(...positions.map(p=>p[0]))-9)<1e-5);assert.equal(map.patches.filter(p=>p.region==='46b749').length,8);
  assert.equal(map.palette.find(p=>p.key==='75cedb').classification,'paint');assert.equal(map.energyAttachments['46b749'].designated,false);
  assert.ok(Math.abs(map.sourceCoverage['46b749']-.010906055827283948)<1e-10);
  const raw=readGLB(new URL('./source/'+config.source,import.meta.url)),p=raw.json.meshes[0].primitives[0],counts={};
  for(const c of raw.attribute(p.attributes.COLOR_0)){const key=colourKey(c);counts[key]=(counts[key]??0)+1;}
  assert.deepEqual(counts,config.colours);
});

check('shared hex values retain different per-hull interpretations',()=>{
  const green=f=>artProfile(f).palette.find(p=>p.key==='46b749');
  assert.match(green('KRE').role,/hull green/);assert.match(green('EAR').role,/nav fitting/);assert.match(green('VRA').role,/no inferred function/);
  assert.match(artProfile('EAR').palette.find(p=>p.key==='e91d2d').role,/multiple parts/);
  assert.equal(artProfile('EAR').palette.length,9);assert.throws(()=>artProfile('ZAN'),/Missing hull-specific/);
});
check('Chris\'s material and emissive rulings apply per hull, including the large metal regions',()=>{
  const expected={EAR:{metal:['bfc7cc','e1ad34'],energy:['e91d2d','fafafa','46b749']},KRE:{metal:['a97b50'],energy:['f5831f','ffdd1a','fafafa']},VRA:{metal:['e1ad34'],energy:['7e3f98','d3bfe5','e91d2d']}};
  for(const [f,p] of Object.entries(expected)){
    assert.deepEqual(artProfile(f).palette.filter(r=>r.classification==='metal').map(r=>r.key).sort(),p.metal.sort());
    assert.deepEqual(artProfile(f).palette.filter(r=>r.classification==='emissive-designated').map(r=>r.key).sort(),p.energy.sort());
  }
  const earthGold=artProfile('EAR').palette.find(r=>r.key==='e1ad34');assert.equal(earthGold.classification,'metal');assert.equal(earthGold.metal,'gold');assert.equal(earthGold.uncertainty,undefined);
  assert.ok(METAL_FINISH.metalness>=.3&&METAL_FINISH.metalness<=.6);assert.ok(METAL_FINISH.roughness>=.6);assert.ok(METAL_FINISH.edgeRoughness>=.5);
});
check('faction palette contracts reject foreign colours and preserve the classified extensions',()=>{
  for(const [faction,p] of Object.entries(FACTION_PALETTES.factions))validateFactionPalette(faction,Object.keys(p.regions));
  assert.throws(()=>validateFactionPalette('EAR',['c8e4bd']),/export fault/);
  assert.throws(()=>validateFactionPalette('VRA',['a97b50']),/export fault/);
  assert.throws(()=>validateFactionPalette('KRE',['75cedb']),/export fault/);
  assert.throws(()=>validateFactionPalette('EAR',[]),/Missing/);
  assert.throws(()=>validateFactionPalette('EAR',['bfc7cc'],{expectedKeys:['bfc7cc','e1ad34']}),/Changed per-hull/);
  assert.equal(factionRegion('EAR','a7adb1').metal,'alternate-steel');
  assert.notDeepEqual(factionRegion('EAR','a7adb1').finishTint,[1,1,1]);
  assert.equal(factionRegion('KRE','c8e4bd').finish,'dead-flat');
  assert.equal(factionRegion('VRA','75cedb').classification,'paint');assert.equal(factionRegion('VRA','75cedb').variant,undefined);
  for(const [faction,p] of Object.entries(FACTION_PALETTES.factions))for(const [key,r] of Object.entries(p.regions))if(r.variant){assert.equal(faction,'VRA');assert.equal(key,'46b749');}
  assert.ok(!artProfile('EAR').palette.some(p=>p.key==='a7adb1'),'No synthetic alternate-grey frigate region');
});
check('Monoceros gold occupies only the authored sensor-dish region',()=>{
  const config=sourceConfigs.EAR,b=config.materialBounds.e1ad34,source=readGLB(new URL('./source/'+config.source,import.meta.url));
  const p=source.json.meshes[0].primitives[0],c=source.attribute(p.attributes.COLOR_0),pos=source.attribute(p.attributes.POSITION);
  const inside=(v,min,max)=>v.every((n,k)=>n>=min[k]&&n<=max[k]);let count=0;
  for(let i=0;i<c.length;i++)if(colourKey(c[i])==='e1ad34'){assert.ok(inside(pos[i],b.sourceMin,b.sourceMax));count++;}
  assert.equal(count,12480);assert.equal(inside([0,0,0],b.sourceMin,b.sourceMax),false);
  const map=JSON.parse(fs.readFileSync(new URL('./prepared/monoceros-regions.json',import.meta.url))),gold=map.patches.filter(p=>p.region==='e1ad34');
  assert.equal(gold.length,1);assert.equal(gold[0].triangles,467);assert.ok(inside(gold[0].min,b.preparedMin,b.preparedMax));assert.ok(inside(gold[0].max,b.preparedMin,b.preparedMax));
});
check('every energy attachment is inert, exact and rejects missing classification or invented activation',()=>{
  for(const a of manifest.assets){
    const map=validateRegionMap(JSON.parse(fs.readFileSync(new URL(a.regionMap,import.meta.url))));
    const bad=structuredClone(map);delete bad.palette[0].classification;assert.throws(()=>validateRegionMap(bad),/classification/);
    const swapped=structuredClone(map);swapped.palette.find(p=>p.classification==='metal').classification='paint';assert.throws(()=>validateRegionMap(swapped),/classification/);
    const active=structuredClone(map);Object.values(active.energyAttachments)[0].enabledByDefault=true;assert.throws(()=>validateRegionMap(active),/activate/);
    const absent=structuredClone(map);delete absent.energyAttachments[absent.palette[0].key];assert.throws(()=>validateRegionMap(absent),/every region/);
    const fakeFace=structuredClone(map);Object.values(fakeFace.energyAttachments).find(e=>e.designated).faces.push(999999);assert.throws(()=>validateRegionMap(fakeFace),/exact region faces/);
    assert.ok(Math.abs(Object.values(map.sourceCoverage).reduce((a,b)=>a+b,0)-1)<1e-10);
  }
});
check('clear ship parts are restricted to authored Vraygon green and cannot become energy',()=>{
  const p=artProfile('VRA').palette.find(r=>r.key==='46b749');assert.equal(p.classification,'paint');assert.equal(p.variant.classification,'moulded transparent');
  assert.equal(artProfile('KRE').palette.find(r=>r.key===p.key).variant,undefined);
  assert.equal(artProfile('EAR').palette.find(r=>r.key===p.key).variant,undefined);
  const map=JSON.parse(fs.readFileSync(new URL('./prepared/shard-regions.json',import.meta.url)));
  assert.equal(map.energyAttachments[p.key].designated,false);assert.deepEqual(map.energyAttachments[p.key].faces,[]);
  assert.ok(Math.abs(map.sourceCoverage.ffdd1a-.2717547926559144)<1e-10);
});
check('physical scale rejects errors and preserves the requested reference sizes',()=>{
  assert.equal(mm(95),9.5);assert.equal(SIZES.mugBody[1],95);assert.equal(SIZES.d6,16);
  assert.deepEqual(SIZES.rulebook,[216,28,279]);assert.deepEqual(SIZES.notebook,[216,6,279]);
  assert.equal(SIZES.pencilLength,190);assert.equal(Math.sqrt(3)*BUDGETS.hexRadius*10,32);
  const rows=JSON.parse(fs.readFileSync(new URL('./evidence/review.json',import.meta.url))).captures.planning.scaleMeasurements;
  validateScaleRows(rows);assert.deepEqual(rows.map(r=>r.object),['Tabletop','Board card','Printed hex','Hardback rulebook','Box lid','Mug body','Mug including handle','D20','D6','Spiral notebook body','Pencil','Black base skirt','Black base pyramid','Black tapered post','EAR frigate','KRE frigate','VRA frigate']);
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
  const files=['app.js','renderer.js','materials.js','table.js','fixture.js','contract.js','scale.js','hull-paint.js','hull-art.js'];
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
