import { copy, validatePack, forkPack } from '../src/construction/index.js';
import { sameContent } from '../src/construction/content.js';
import { createBattle, previewOrders } from '../src/tactical/resolver.js';
import { DIRS, faceFor } from '../src/tactical/hex.js';
import { validateScenario } from '../arena/editor-core.js';
import { shieldAbsorbable } from '../src/tactical/ship.js';
export const DRAFT_KEY='orion-wars:drydock:draft:v1';
export { LIBRARY_KEY } from '../src/construction/stock-library.js';
export const SESSION_KEY='orion-wars:scenario-replay:v3';
export const newId=()=>`local:${crypto.randomUUID()}`;
export function history(pack) {
  return {pack:copy(pack),past:[],future:[],change(next) {this.past.push(copy(this.pack));this.past=this.past.slice(-30);this.pack=copy(next);this.future=[];},
    undo(){if(!this.past.length)return;this.future.push(copy(this.pack));this.pack=this.past.pop();},
    redo(){if(!this.future.length)return;this.past.push(copy(this.pack));this.pack=this.future.pop();}};
}
export function nextRevision(pack,library) {
  if(pack.design.id.startsWith('stock:'))throw new Error('Fork the stock design before saving');
  const next=copy(pack);next.design.revision=Math.max(0,...library.filter(p=>p.design.id===pack.design.id).map(p=>p.design.revision))+1;return next;
}
export function importDraft(pack,current,library) {
  // An imported revision may coexist, but must not rewrite a different revision's
  // content. Fork on collision; the imported component snapshots stay pinned.
  const match=library.find(p=>p.design.id===pack.design.id&&p.design.revision===pack.design.revision);
  return match&&!sameContent(match,pack)?forkPack(pack,newId()):copy(pack);
}
export function trialScenario(pack,tuning,{face=2,range=8}={}) {
  const errors=validatePack(pack,tuning);if(errors.length)throw new Error(errors.join('; '));
  const d=pack.design,dir=DIRS.findIndex((_,i)=>faceFor(0,i)===face),delta=DIRS[dir];
  // Tactical rectangular maps are centered on axial (0,0), not positive-only.
  const origin={q:0,r:0},bounded=Math.max(1,Math.min(20,Math.round(range)));
  const sides=[{faction:d.faction,ships:[{className:d.className,designPack:copy(pack),...origin,facing:0}]},
    {faction:d.faction,ships:[{className:d.className,q:origin.q+delta.q*bounded,r:origin.r+delta.r*bounded,facing:(dir+3)%6}]}];
  // Respect existing class fleet floors. Escorts are explicit, never a tuning override.
  sides.forEach((s,i)=>{
    const floor=tuning.hullClasses[d.className].minFleetPoints??0;
    const points=i===0?d.hull.points:tuning.hullClasses[d.className].points;
    for(let n=0;n<Math.ceil(Math.max(0,floor-points)/tuning.hullClasses.frigate.points);n++) {
      const r=(i===0?-22:22)+(i===0?1:-1)*Math.floor(n/8);
      s.ships.push({className:'frigate',q:-Math.round(r/2)-4+(n%8),r,facing:i===0?0:3});
    }
  });
  const scenario={name:`Drydock trial — ${d.name} r${d.revision}`,seed:'drydock-trial-1',maxTurns:20,map:{widthHexes:52,heightHexes:52},terrain:[],sides};
  const issues=validateScenario(scenario,tuning);if(issues.length)throw new Error(issues.join('; '));return scenario;
}
export function engineering(pack,tuning,loadouts,{face=2,range=8,reserve=0.3,move=0}={}) {
  const scenario=trialScenario(pack,tuning,{face,range});
  const battle=createBattle(scenario,tuning,loadouts,scenario.seed);
  const ship=battle.A.find(s=>s.designId===pack.design.id);
  const target=battle.B.find(s=>s.className===pack.design.className);
  const order={target:target.id,reserve,plan:[{turn:0,forward:move},{turn:0,forward:0},{turn:0,forward:0}]};
  const forecast=previewOrders(battle,ship.id,order);
  return {forecast,ship,scenario,shieldAbsorbable:shieldAbsorbable({...ship,power:forecast.remaining},face)};
}
