import {DIRS} from '../src/tactical/hex.js';
import {radiusOutlinePath} from './hex-region.js';
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
// Outlines the actual hexes, along their edges, rather than a polygon through the corner cells'
// centres which cut through every cell on its boundary (Chris, 10 September 2026).
export function movementRangeMarkup(ship,range,project,scale){
  if(!ship||range.hexes===null||range.hexes<=0||!(scale>0))return '';
  return `<path class="movement-range" data-movement-radius="${range.hexes}" d="${radiusOutlinePath(ship.pos,range.hexes,project,scale)}"><title>Ordinary movement upper bound: ${range.hexes} hex; every outlined hex is within reach of the power ceiling, though heading and terrain can shorten the route</title></path>`;
}
