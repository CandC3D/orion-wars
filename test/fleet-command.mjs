import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(process.argv.includes('--source')?process.argv[process.argv.indexOf('--source')+1]:path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
const mod=p=>import(pathToFileURL(path.join(root,p)).href);
const {createCommandSession}=await mod('arena/command-host.js');
const {layoutContactMap,reportCamera,intersects}=await mod('arena/contact-map-layout.js');
const {formationOrders}=await mod('arena/formation-orders.js');
const {allHoldOrders}=await mod('src/captains/orders.js');
const {stockPack}=await mod('src/construction/index.js');
const tuning=JSON.parse(fs.readFileSync(path.join(root,'data/tactical-tuning.json'))),loadouts=JSON.parse(fs.readFileSync(path.join(root,'data/loadouts.json')));
let groups=0;const check=(name,fn)=>{fn();console.log('ok: '+name);groups++;};
const scenario=()=>({name:'Command fixture',seed:'main-command-1',map:{widthHexes:72,heightHexes:40},maxTurns:12,terrain:[],sides:[
  {faction:'EAR',ships:[{className:'destroyer',q:-18,r:0,facing:0}]},{faction:'KRE',ships:[{className:'destroyer',q:18,r:0,facing:3}]}]});
const host=(s=scenario(),side='A',mode='authored',t=tuning)=>createCommandSession({scenario:s,side,mode},t,loadouts);
check('All seven bundled scenarios launch under finite contacts from either commanded side',()=>{
  for(const file of ['asterion-line','formation-column','formation-echelon','formation-loose','small-action','first-obstacles','twin-moons']){
    const s=JSON.parse(fs.readFileSync(path.join(root,`arena/scenarios/${file}.json`)));
    for(const side of ['A','B']){const h=host(s,side,'bundled'),view=h.session.view().observation;
      assert.equal(view.side,side);assert.equal(view.contactProfile,'finite-contacts/1');
      assert.equal(view.own.length,s.sides[side==='A'?0:1].ships.length);assert.equal(h.mission.side,side);
    }
  }
});
check('Host does not expose the battle; setup, tuning, library inputs and outputs are isolated',()=>{
  const s=scenario(),t=structuredClone(tuning),l=structuredClone(loadouts),raw=JSON.stringify({s,t,l});
  const h=createCommandSession({scenario:s,side:'B',mode:'quick'},t,l),first=h.session.view();
  assert.deepEqual(Object.keys(h).sort(),['mission','session']);assert.deepEqual(Object.keys(h.session).sort(),['step','view']);
  assert.equal(JSON.stringify({s,t,l}),raw);s.sides[0].ships[0].q=0;t.hullClasses.destroyer.sensorRating=5;
  assert.deepEqual(h.session.view(),first);assert.ok(Object.isFrozen(h.mission));assert.ok(Object.isFrozen(first));
  const keys=Object.keys(h.mission);for(const k of ['battle','ships','seed','rng','result','scenario'])assert.ok(!keys.includes(k));
  assert.equal(first.observation.contacts.length,0);
});
check('Quick fleets stay strict; authored floors warn without changing the roster; JSON flags cannot waive quick floors',()=>{
  const t=structuredClone(tuning);t.hullClasses.destroyer.minFleetPoints=99;
  const s=scenario();s.fleetFloorPolicy='warn';s.historicalFloorOverride=true;
  assert.throws(()=>host(s,'A','quick',t));const h=host(s,'A','authored',t);
  assert.ok(h.mission.warnings.length);assert.equal(h.session.view().observation.own.length,1);
  assert.equal(h.mission.fleetFloorPolicy,'warn');
});
check('Body deployment and impossible objectives remain hard errors; fields and fog are legal',()=>{
  const s=scenario();s.terrain=[{type:'moon',q:-18,r:0}];assert.throws(()=>host(s));
  for(const type of ['nebula','asteroids']){s.terrain=[{type,q:-18,r:0}];assert.ok(host(s).session.view());}
  s.terrain=[];s.victory={type:'flagship',protectedClass:{A:'battleship',B:'battleship'}};assert.throws(()=>host(s));
});
check('Pinned custom arcs and positions reach own telemetry unchanged; restart is deterministic and never re-pins',()=>{
  const s=scenario(),pack=stockPack('EAR','destroyer',tuning,loadouts);
  pack.design.mounts[0].faces=[5];pack.design.mounts[0].position={x:.2,y:-.4,z:0};s.sides[0].ships[0].designPack=pack;
  const a=host(s),b=host(structuredClone(s));assert.deepEqual(a.session.view(),b.session.view());
  const own=a.session.view().observation.own[0];assert.deepEqual(own.mounts[0].arc,[5]);assert.deepEqual(own.mounts[0].position,{x:.2,y:-.4,z:0});
  const orders=allHoldOrders(a.session.view().observation);assert.deepEqual(a.session.step(orders),b.session.step(structuredClone(orders)));
  assert.deepEqual(host(s).session.view().observation.own[0].mounts[0].arc,[5]);
});
check('Side B commands only side B, omitted ships hold, and a foreign order is atomically refused',()=>{
  const h=host(scenario(),'B'),first=h.session.view(),orders=allHoldOrders(first.observation);
  assert.ok(Object.keys(orders).every(id=>id.startsWith('B-')));
  const bad=h.session.step({'A-destroyer-1':{plan:[{turn:0,forward:1},{turn:0,forward:0},{turn:0,forward:0}],target:'auto',reserve:.3}});
  assert.equal(bad.ok,false);assert.deepEqual(h.session.view(),first);
  const next=h.session.step({});assert.equal(next.ok,true);assert.deepEqual(next.frame.observation.own[0].pos,first.observation.own[0].pos);
});
check('Malformed host setup, unsafe JSON, huge boards and unknown policy reject before construction',()=>{
  const s=scenario();let invoked=0;
  assert.throws(()=>createCommandSession({get side(){invoked++;return 'A';},scenario:s,mode:'quick'},tuning,loadouts));assert.equal(invoked,0);
  for(const mutate of [x=>x.side='C',x=>x.mode='warn',x=>x.raw=true,x=>x.scenario.map.widthHexes=9999,x=>x.scenario.map.heightHexes=2.5]){
    const setup={mode:'quick',side:'A',scenario:scenario()};mutate(setup);assert.throws(()=>createCommandSession(setup,tuning,loadouts));
  }
});
check('Formation planning and camera/layout depend only on own telemetry and current reports',()=>{
  const h=host(),view=h.session.view().observation;
  const orders=formationOrders(view.own,3,'advance',s=>s);assert.equal(Object.keys(orders).length,1);assert.equal(orders[view.own[0].id].plan[2].forward,0);
  const camera=reportCamera(view.own,view.map);assert.ok(camera.zoom>1);assert.deepEqual(view.own[0].pos,{q:-18,r:0});
  const ships=Array.from({length:4},(_,i)=>({id:'own-'+i,pos:{q:0,r:0},name:'Light Cruiser '+i}));
  const actions=[1,2,3].map(round=>({round,kind:'hold',end:{q:0,r:0}}));
  for(const font of [16,35,42]){const layout=layoutContactMap(ships,actions,{project:()=>({x:450,y:260}),font,icon:font*1.6,label:s=>s.name});
    assert.equal(layout.course.length,1);assert.match(layout.course[0].text,/A1 F \/ A2 F \/ A3 F/);
    const boxes=[...layout.markers,...layout.labels,...layout.course].map(x=>x.box);
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert.equal(intersects(boxes[i],boxes[j],0),false,`font ${font}: ${i}/${j}`);
    assert.ok(layout.markers.some(m=>m.x!==m.anchor.x||m.y!==m.anchor.y));
  }
});
console.log(`Fleet Command: ${groups} groups passed.`);
