// Read-only presentation model. Pinned definitions and compiled ranges are the
// authority; a name such as "heavy" is never turned into an invented size stat.
import {compileDesign, weaponKey, copy} from '../src/construction/index.js';
import {shieldCapacity, shieldCost, shieldAbsorbable} from '../src/tactical/ship.js';

export function weaponSpecification(pack,tuning,{mountId,definition}={}) {
  const compiled=compileDesign(pack,tuning),installation=pack.design.mounts.find(m=>m.id===mountId);
  const weapon=definition||pack.weapons.find(w=>weaponKey(w)===weaponKey(installation?.weapon||{}));
  if(!weapon)return null;
  const s=weapon.spec,m=definition?null:compiled.mounts.find(m=>m.id===mountId),reach=pack.design.hull.weaponReach;
  const effective=s.rangeBands.map(b=>({...b,to:Math.max(1,Math.round(b.to*reach))}));
  let previous=0,basePrevious=0;
  const bands=effective.map((b,i)=>{
    const row={from:previous+1,to:b.to,baseFrom:basePrevious+1,baseTo:s.rangeBands[i].to,
      damageBonus:b.damageBonus??0,damageMod:b.damageMod??0,toHitMod:b.toHitMod??0,collapsed:b.to<=previous};
    previous=b.to;basePrevious=s.rangeBands[i].to;return row;
  });
  return {name:weapon.name,key:weaponKey(weapon),kind:s.kind,
    family:{beam:'Beam',missile:'Missile / torpedo',spinal:'Spinal'}[s.kind],
    size:'Not modeled — no mass, calibre or size tier',
    installation:definition?null:copy(installation),maxRange:m?.maxRange??Math.max(1,Math.round(s.maxRange*reach)),baseRange:s.maxRange,reach,bands,
    magazine:s.kind==='missile'?pack.design.hull.magazine:null,ammoPerShot:s.kind==='missile'?1:0,
    power:s.kind==='beam'?s.maxPower:s.kind==='missile'?s.powerToArm:s.firePower,
    cadence:s.kind==='spinal'?'Charge → fire → cooldown → recharge':'At most once per mount per turn',
    actionsPerTurn:tuning.battle.roundsPerTurn,
    charge:s.kind==='spinal'?{required:s.chargeRequired,draw:s.chargeDrawPerTurn,hold:s.holdDrawPerTurn??0,
      cooldown:s.cooldownTurns,minimumTicks:s.chargeDrawPerTurn>0?Math.ceil(s.chargeRequired/s.chargeDrawPerTurn):null,
      startRange:s.chargeStartRangeHexes??null,planted:!!s.immobileWhileCharging}:null,
    spec:copy(s)};
}

export function systemsSpecification(pack,reading) {
  const {forecast:f,ship}=reading;
  // These are forecast aggregates, not a second power allocator. Unclassified
  // scan/other draws remain explicit instead of making the accounting lie.
  const other=f.fullPower-f.overhead-f.movement-f.weapons-f.deck-f.remaining;
  return {reactors:ship.cores.map((r,i)=>({name:r.displayName||`Reactor ${i+1}`,power:r.power,alive:r.alive})),
    impulse:ship.impulse,full:f.fullPower,overhead:f.overhead,available:f.available,reserve:f.reserve,
    movement:f.movement,weapons:f.weapons,deck:f.deck,other:Math.abs(other)<1e-9?0:other,
    remaining:f.remaining,free:f.free,moveCost:ship.movementPointRatio,structure:ship.superstructureMax,
    pointDefence:ship.hull.pointDefence,screen:ship.hull.screen,
    magazine:ship.magazine,magazineRemaining:f.actions.at(-1)?.magazine??ship.magazine,
    shields:[1,2,3,4,5,6].map(face=>({face,name:ship.shieldGenerators?.[face]?.displayName||'Uniform hull grid',
      capacity:shieldCapacity(ship,face),cost:shieldCost(ship,face),absorbable:shieldAbsorbable({...ship,power:f.remaining},face)}))};
}
