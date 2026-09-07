import {DIRS} from '../src/tactical/hex.js';
import {advanceManualSpinal} from '../src/tactical/spinal-control.js';
// A power-only ordinary-movement ceiling, not a reachability/pathfinder claim.
export function movementRange(ship,reserveFraction,intent,manual=false){
  if(!ship||ship.destroyed)return {hexes:0,reason:'Destroyed: no movement'};
  if(manual&&ship.spinal){
    ship=structuredClone(ship);ship.power=ship.fullPower;
    advanceManualSpinal(ship,ship.mounts.find(m=>m.kind==='spinal')?.weapon||{},intent);
    ship.fullPower=ship.power;
  }
  const spinal=ship.mounts.find(m=>m.kind==='spinal');
  if(spinal?.inop&&ship.spinal)return {hexes:null,reason:'Cannon offline: movement awaits turn-start bank reset; no radius shown'};
  if(spinal?.weapon.immobileWhileCharging&&ship.spinal&&
    (ship.spinal.state==='ready'||(ship.spinal.state==='charging'&&ship.spinal.charge>0)))
    return {hexes:0,reason:'Cannon bank active: planted; turning remains possible'};
  if(!manual&&ship.spinal?.state==='charging'&&ship.spinal.charge<=0)
    return {hexes:null,reason:'Cold cannon may charge before orders: movement ceiling unresolved; no radius shown'};
  if(ship.cloaked||ship.decloaking)return {hexes:null,reason:'Movement ceiling unresolved while cloaked / decloaking'};
  if(!(ship.movementPointRatio>0))return {hexes:null,reason:'Movement cost unavailable'};
  const power=ship.fullPower,reserve=Math.round(power*reserveFraction);
  const hexes=Math.max(0,Math.floor((power-reserve)/ship.movementPointRatio));
  return {hexes,label:`Movement ≤ ${hexes} hex / turn · refill/reserve ceiling, not a route`,
    reason:`Ordinary movement ceiling: ${hexes} hex total / turn after refill and reserve. Heading, terrain, incoming damage and other spending can shorten it. Warp/burst not included.`};
}
export function movementRangeMarkup(ship,range,project){
  if(!ship||range.hexes===null||range.hexes<=0)return '';
  const points=DIRS.map(d=>project({q:ship.pos.q+d.q*range.hexes,r:ship.pos.r+d.r*range.hexes}));
  return `<polygon class="movement-range" data-movement-radius="${range.hexes}" points="${points.map(p=>`${p.x},${p.y}`).join(' ')}"><title>Ordinary movement upper bound: ${range.hexes} hex; not all enclosed hexes are reachable</title></polygon>`;
}
