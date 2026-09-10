// Presentation of an OWN mount's exact faces, not target legality or a forecast.
// Both combat and Drydock use the engine's numbered-face convention.
import {escapeHTML as esc} from './command-model.js';
import {bearing,faceFor,distance} from '../src/tactical/hex.js';
import {hexGridPath} from './contact-map-layout.js';
export function weaponRangeBands(mount){
  let from=1;
  return (mount?.bands||[]).flatMap(b=>{const to=Math.min(b.to,mount.maxRange),row={...b,from,to};from=Math.max(from,to+1);return row.from<=to?[row]:[];});
}
// The modifier a band actually carries: warhead for tubes, damage for guns.
export function bandDamage(mount,band){return mount?.kind==='missile'?(band?.damageMod||0):(band?.damageBonus||0);}
// Where the weapon is at its best, as opposed to where it can still reach.
// `graded` is false for a mount whose modifier never falls off, so a flat
// weapon keeps reading as a single reach rather than gaining a second number.
export function effectiveBand(mount){
  const bands=weaponRangeBands(mount);if(!bands.length)return null;
  const best=Math.max(...bands.map(b=>bandDamage(mount,b)));
  return {to:Math.max(...bands.filter(b=>bandDamage(mount,b)===best).map(b=>b.to)),
    damage:best,graded:bands.some(b=>bandDamage(mount,b)!==best),maxRange:mount.maxRange};
}
export function weaponRangeKey(mount){
  if(!mount)return '';
  const bands=weaponRangeBands(mount),missile=mount.kind==='missile',damage=b=>missile?(b.damageMod||0):(b.damageBonus||0);
  const bestDamage=Math.max(...bands.map(damage)),bestAim=Math.max(...bands.map(b=>b.toHitMod||0));
  const varied=bands.some(b=>damage(b)!==bestDamage||(!missile&&(b.toHitMod||0)!==bestAim));
  const signed=n=>n>=0?'+'+n:String(n);
  return bands.map((b,i)=>`<span class="range-band-key" data-range-band="${i}" style="--band-opacity:${.09+(bands.length-i-1)*.055}"><b>${b.from}–${b.to} hex</b> ${missile?'warhead':'damage'} ${signed(damage(b))}${missile?'':` · accuracy ${signed(b.toHitMod||0)}`}${varied&&damage(b)===bestDamage&&(missile||(b.toHitMod||0)===bestAim)?' · best modifiers':''}</span>`).join('')+`<span class="range-limit">Beyond ${mount.maxRange} hex / outside selected faces: no coverage. Bands describe modifiers, not hit guarantees.</span>`;
}
export function weaponCoverageCells(ship,mount,candidates=null){
  if(!ship||ship.destroyed||!mount)return [];
  if(!candidates){
    candidates=[];const n=Math.floor(mount.maxRange);
    for(let q=-n;q<=n;q++)for(let r=Math.max(-n,-q-n);r<=Math.min(n,-q+n);r++)
      candidates.push({q:ship.pos.q+q,r:ship.pos.r+r});
  }
  const bands=weaponRangeBands(mount);
  return candidates.flatMap(p=>{
    const d=distance(ship.pos,p);if(d===0||d>mount.maxRange)return [];
    const face=faceFor(ship.facing,bearing(ship.pos,p));
    return mount.arc.includes(face)?[{...p,face,band:bands.findIndex(b=>d<=b.to)}]:[];
  });
}
export function weaponArcMarkup(ship,mount,{project,scale,cells=null}) {
  if(!ship||ship.destroyed||!mount)return '';
  const color=mount.kind==='missile'?'#efb773':mount.kind==='spinal'?'#c2a0f1':'#8ec6dc';
  const bands=weaponRangeBands(mount);
  // Entire covered cells belong to one engine face and one band. A continuous
  // sector edge through cell centres cannot express the engine's seam ruling.
  const covered=weaponCoverageCells(ship,mount,cells);
  return `<g class="weapon-coverage" data-arc-mount="${esc(mount.id)}" role="img" aria-label="Weapon coverage: faces ${mount.arc.join(', ')}; current position and heading; not a firing solution">${mount.arc.map(face=>{
    const group=covered.filter(p=>p.face===face);
    return `<path data-arc-face="${face}" d="${hexGridPath(group,project,scale)}" fill="${color}" fill-opacity=".09" stroke="none"><title>Face ${face} · ${mount.maxRange} hex maximum · coverage only</title></path>`+
      bands.slice(0,-1).map((b,i)=>`<path data-arc-band="${b.to}" data-band-face="${face}" d="${hexGridPath(group.filter(p=>p.band<=i),project,scale)}" fill="${color}" fill-opacity=".055" stroke="none"/>`).join('');
  }).join('')}</g>`;
}
export const WEAPON_COLORS={beam:'#8ec6dc',missile:'#efb773',spinal:'#c2a0f1'};
// Union per family: multiple turrets do not darken their overlap and disguise
// the battery as a single off-centre mount. Individual selection retains bands.
export function batteryArcMarkup(ship,{project,scale,cells=null}){
  if(!ship||ship.destroyed)return '';
  return ['beam','missile','spinal'].map(kind=>{
    const mounts=ship.mounts.filter(m=>m.kind===kind);if(!mounts.length)return '';
    // Best modifier available at each cell from any mount of this family, so
    // the shading answers "what does the battery do here", not "can it reach".
    const union=new Map();
    for(const mount of mounts){
      const bands=weaponRangeBands(mount);
      for(const p of weaponCoverageCells(ship,mount,cells)){
        const band=bands[p.band];if(!band)continue;
        const damage=bandDamage(mount,band),key=`${p.q},${p.r}`,prev=union.get(key);
        if(!prev||damage>prev.damage)union.set(key,{p,damage});
      }
    }
    if(!union.size)return '';
    const colour=WEAPON_COLORS[kind],signed=n=>n>=0?'+'+n:String(n);
    const tiers=[...new Set([...union.values()].map(v=>v.damage))].sort((a,b)=>b-a);
    // Each cell belongs to exactly one tier, so the fills never compound.
    const shading=tiers.map((damage,i)=>{
      const group=[...union.values()].filter(v=>v.damage===damage).map(v=>v.p);
      return `<path data-band-damage="${damage}" data-band-tier="${i}" d="${hexGridPath(group,project,scale)}" fill="${colour}" fill-opacity="${(.055+(tiers.length<2?0:(tiers.length-1-i)*(.11/(tiers.length-1)))).toFixed(3)}" stroke="none"><title>${kind==='missile'?'Warhead':'Damage'} ${signed(damage)} here${tiers.length>1?` · best ${signed(tiers[0])}`:''} · coverage only</title></path>`;
    }).join('');
    // The outline still marks where coverage ends; the fill says where it bites.
    return `<g class="weapon-coverage" data-battery-family="${kind}" data-band-tiers="${tiers.length}" aria-label="Whole ${kind} battery coverage, shaded by the modifier available at each range">${shading}<path d="${hexGridPath([...union.values()].map(v=>v.p),project,scale)}" fill="none" stroke="${colour}" stroke-opacity=".55" stroke-width="1.2" stroke-linejoin="round"/></g>`;
  }).join('');
}
export function batteryRangeKey(ship,solutions=null){
  if(!ship||ship.destroyed)return '';
  return ship.mounts.map((m,i)=>{
    const eff=effectiveBand(m);
    const reach=eff&&eff.graded?`best ≤${eff.to} hex · reach ${m.maxRange} hex`:`1–${m.maxRange} hex`;
    return `<span class="range-band-key" style="border-color:${WEAPON_COLORS[m.kind]||'#8ec6dc'}"><b>${i+1} · ${esc(m.displayName||m.type.replaceAll('-',' '))}</b> · ${m.kind} · faces ${m.arc.join(',')} · ${reach}${m.arc.includes(5)?' · REAR':''}${m.inop?' · offline':m.firedThisTurn?' · spent':''}${(()=>{const f=solutions?.get?.(m.id);if(!f||!f.short)return '';return f.locked?` · <b class="target-locked" title="${esc(f.full)}">◈ TARGET LOCKED · ${esc(f.targetName)}</b>`:` · <b>${esc(f.short)}</b>`;})()}</span>`;
  }).join('')+'<span class="range-limit">Whole battery: overlapping families mix colours; deeper shading marks the ranges carrying the better modifier. Select one mount to inspect its exact range bands. Coverage is geometry, not a clear-shot or readiness guarantee.</span>';
}
