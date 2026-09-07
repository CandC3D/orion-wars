// Focused C0.1 review corrections. --expect-old reproduces the original defects
// on the frozen input without editing it; default mode requires the corrections.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const root = resolve(arg('--source') ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const old = process.argv.includes('--expect-old');
const mod = p => import(pathToFileURL(join(root,p)));
const E = await mod('src/tactical/resolver.js'), S = await mod('src/tactical/ship.js');
const C = await mod('src/tactical/contacts.js'), T = await mod('src/captains/trusted.js');
const O = await mod('src/captains/observation.js'), F = await mod('src/captains/fixtures.js');
const { allHoldOrders } = await mod('src/captains/orders.js');
const { stockPack, upgradeEngineering } = await mod('src/construction/index.js');
const { makePrng } = await mod('src/prng.js');
const data = () => ({ tuning:JSON.parse(fs.readFileSync(join(root,'data/tactical-tuning.json'))),
  loadouts:JSON.parse(fs.readFileSync(join(root,'data/loadouts.json'))) });
const rows = [];
function check(name, fn) { rows.push({name, ...fn()}); console.log(`ok: ${name}`); }
function pair() {
  const {tuning:t,loadouts:l}=data(), rng=makePrng(72);
  const a=S.buildShip('A-one','EAR','destroyer',t,l,rng),b=S.buildShip('B-one','EAR','destroyer',t,l,rng);
  a.pos={q:-12,r:0};b.pos={q:12,r:0};b.facing=3;
  return E.createBattleFromFleets([[a],[b]],t,rng,{maxTurns:2});
}
check('duplicate IDs rejected at session entry', () => {
  const b=pair();b.B[0].id=b.A[0].id;const before=T.fullState(b);
  let rejected=false;try{T.createTrustedSession(b,{A:F.holdCaptain,B:F.holdCaptain});}catch{rejected=true;}
  assert.equal(rejected,!old);
  if(!old)assert.deepEqual(T.fullState(b),before);
  let additionalCases=0;
  const mutations=[x=>x.A.push(structuredClone(x.A[0])),x=>{x.B[0].id=x.A[0].id;x.B[0].destroyed=true;},
    ...['',null,7,'__proto__','constructor','prototype'].map(id=>x=>{x.A[0].id=id;})];
  for(const mutate of mutations){
    const x=pair();mutate(x);const untouched=T.fullState(x);
    let blocked=false;try{T.createTrustedSession(x,{A:F.holdCaptain,B:F.holdCaptain});}catch{blocked=true;}
    assert.equal(blocked,!old);if(!old)assert.deepEqual(T.fullState(x),untouched);additionalCases++;
  }
  return {rejected,additionalCases};
});
check('direct packet replay rejects collisions before mutation', () => {
  const b=pair();b.B[0].id=b.A[0].id;C.enableContacts(b);
  const va=O.sideView(b,'A'),vb=O.sideView(b,'B');
  const pa=allHoldOrders(va),pb=allHoldOrders(vb);
  pa['A-one'].plan[0]={turn:1,forward:2}; // Overwritten by B's hold on the old code.
  const before=T.fullState(b);let rejected=false;
  try{T.executePacket(b,{turn:b.turn,decisions:{A:{orders:pa},B:{orders:pb}}});}catch{rejected=true;}
  assert.equal(rejected,!old);
  if(!old)assert.deepEqual(T.fullState(b),before);
  else assert.equal(b.A[0].movedThisTurn,0); // Wrong-side hold, not a missing-order helm call.
  return {rejected,oldFailure:'A movement overwritten by B hold'};
});
check('late identity corruption rejected before controller calls', () => {
  const b=pair();let calls=0;
  const fn=(v,m)=>{calls++;return F.holdCaptain(v,m);};
  const session=T.createTrustedSession(b,{A:fn,B:fn});b.B[0].id=b.A[0].id;
  let rejected=false;try{T.stepTrusted(session);}catch{rejected=true;}
  assert.equal(rejected,!old);
  if(!old){assert.equal(calls,0);assert.equal(session.packets.length,0);assert.deepEqual(session.memory,{A:null,B:null});}
  return {rejected,calls};
});
check('ship hulls own independent nested data for all 29 legacy and pinned V1/V2 designs', () => {
  let cases=0,aliased=0;
  const {tuning:t,loadouts:l}=data();
  for(const faction of ['EAR','VRA','ZAN','KRE'])for(const name of t.rosters[faction])for(const mode of ['legacy','V1','V2']) {
    const fresh=structuredClone(t), sourceBefore=structuredClone(fresh);
    const pack=mode==='legacy'?null:mode==='V1'?stockPack(faction,name,fresh,l):upgradeEngineering(stockPack(faction,name,fresh,l),fresh);
    const a=S.buildShip('a',faction,name,fresh,l,makePrng(1),pack),b=S.buildShip('b',faction,name,fresh,l,makePrng(1),pack);
    const shared=a.hull===b.hull||a.hull===fresh.hullClasses[name]; if(shared)aliased++;
    if(old && mode==='legacy')assert.equal(shared,true);else assert.equal(shared,false);
    const otherBefore=structuredClone(b.hull),packBefore=structuredClone(pack);
    a.hull.sensorRating=999;
    if(a.hull.hangar){const first=Object.values(a.hull.hangar)[0];first.strength=999;}
    if(!old || mode!=='legacy'){assert.deepEqual(b.hull,otherBefore);assert.deepEqual(fresh,sourceBefore);assert.deepEqual(pack,packBefore);}
    cases++;
  }
  assert.equal(cases,87);assert.equal(aliased,old?29:0);return {cases,aliased};
});
function scanFixture(blind) {
  const {tuning:t,loadouts:l}=data(),rng=makePrng(31);
  const scanner=S.buildShip('A-scanner','EAR','heavy-cruiser',t,l,rng);
  const gun=S.buildShip('A-gun','EAR','destroyer',t,l,rng);
  const hidden=S.buildShip('B-hidden','KRE','destroyer',t,l,rng);
  scanner.pos={q:0,r:0};gun.pos={q:0,r:1};hidden.pos={q:6,r:0};hidden.facing=3;
  hidden.canCloak=true;hidden.cloaked=true;hidden.detected=false;
  // No beam battery => preferredRange defaults to four, below the six-hex gap.
  // Reserve 100% pins the cloaked helm, so no decloak suppression hook or RNG
  // fishing is needed. These are disposable in-memory fixture ships only.
  hidden.mounts=[];hidden.superstructure=hidden.superstructureMax=1000;
  scanner.systems.sensors=blind?t.damage.systemHitsToInoperative:0;
  const b=E.createBattleFromFleets([[scanner,gun],[hidden]],t,rng,{maxTurns:1});C.enableContacts(b);
  const a=allHoldOrders(O.sideView(b,'A')),bo=allHoldOrders(O.sideView(b,'B'));bo['B-hidden'].reserve=1;
  const before=T.fullState(b),preview=E.previewOrders(b,'A-scanner',a['A-scanner']);
  assert.deepEqual(T.fullState(b),before,'preview changes live state');
  const log=[],shots=[];E.stepTurn(b,{...a,...bo},{log:m=>log.push(m),onShot:e=>shots.push(e)});
  assert.equal(hidden.cloaked,true,'fixture must stay cloaked');assert.deepEqual(hidden.pos,{q:6,r:0});
  return {globalDetected:hidden.detected,locked:b.contacts.locks.A.includes(hidden.id),shots:shots.length,
    scanLogged:log.some(s=>s.includes('contact(s)')),
    previewScans:preview.actions.some(a=>a.mounts?.some(m=>m.reason==='Scanning action') || a.notes?.some(n=>n.includes('sweeps arc')))};
}
check('healthy sensors acquire a real lock and inform automatic gunnery', () => {
  const result=scanFixture(false);assert.equal(result.globalDetected,true);assert.equal(result.locked,true);
  assert.equal(result.scanLogged,true);assert.ok(result.shots>0);assert.equal(result.previewScans,true);return result;
});
check('disabled sensors cannot reveal a cloaked ship to global gunnery or the preview', () => {
  const result=scanFixture(true);assert.equal(result.globalDetected,old);assert.equal(result.locked,false);
  assert.equal(result.scanLogged,old);assert.equal(result.shots>0,old);assert.equal(result.previewScans,old);return result;
});
const report={source:root,mode:old?'original-defect-reproduction':'fixed-expectations',groups:rows.length,pass:true,rows};
if(arg('--out'))fs.writeFileSync(resolve(arg('--out')),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
