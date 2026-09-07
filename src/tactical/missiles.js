// Timed homing is geometry, not a speed / collision simulation. Every salvo
// still resolves at next-turn impacts. Rational axial positions preserve exact
// face seams under integer-hex rotation and translation; no RNG is consumed.
import { DIRS, bearing, faceFor, shieldFacing } from './hex.js';
export const MISSILE_FLIGHT_PROFILE = 'timed-homing/1';
const copy = structuredClone;
const gcd = (a,b) => { while(b) [a,b]=[b,a%b]; return Math.abs(a); };
function rational(q,r,d=1) {
  if (![q,r,d].every(Number.isSafeInteger) || d<1) throw new Error('Missile course exceeds exact coordinate limits');
  const g=gcd(gcd(Math.abs(q),Math.abs(r)),d)||1;
  return {q:q/g,r:r/g,d:d/g};
}
export const missilePosition = flight => ({q:flight.position.q/flight.position.d,r:flight.position.r/flight.position.d});
const vector = (position,target) => ({q:target.q*position.d-position.q,r:target.r*position.d-position.r});

export function createMissileFlight(source,target,heading,turn,round) {
  const position=rational(source.q,source.r),v=vector(position,target);
  return {profile:MISSILE_FLIGHT_PROFILE,position,
    lastDirection:v.q||v.r?v:{...DIRS[heading]},
    path:[{turn,round,phase:'launch',pos:{...source}}]};
}

export function advanceMissileFlights(missiles,fleets,turn,round,rounds) {
  const ships=new Map(fleets.flat().map(s=>[s.id,s]));
  // Remaining course samples, PLUS the final leg at next-turn impact.
  const segments=rounds-round+2;
  for(const missile of missiles) {
    const f=missile.flight,target=ships.get(missile.targetId);
    if(f?.profile!==MISSILE_FLIGHT_PROFILE || !target || target.destroyed) continue;
    const v=vector(f.position,target.pos);
    if(v.q||v.r)f.lastDirection=rational(v.q,v.r); // scale is immaterial to bearing
    const {q,r,d}=f.position;
    f.position=rational(q*(segments-1)+target.pos.q*d,r*(segments-1)+target.pos.r*d,d*segments);
    f.path.push({turn,round,phase:'course',pos:missilePosition(f)});
  }
}

// A target can move onto the missile's current sample. Arrival is not early:
// retain the last nonzero course (launch heading if launched co-located under
// an explicit sameHexNoFire:false configuration), never the launcher's new hex.
export function missileImpactFace(missile,victim) {
  const f=missile.flight;
  if(f?.profile!==MISSILE_FLIGHT_PROFILE)return shieldFacing(victim,missile.shooterPos);
  const toward=vector(f.position,victim.pos);
  const from=toward.q||toward.r?{q:-toward.q,r:-toward.r}:{q:-f.lastDirection.q,r:-f.lastDirection.r};
  return faceFor(victim.facing,bearing({q:0,r:0},from));
}

export function missileGeometry(missile) {
  if(missile.flight?.profile!==MISSILE_FLIGHT_PROFILE)return {};
  return {missileId:missile.missileId,approachPos:missilePosition(missile.flight),
    flight:copy({profile:missile.flight.profile,path:missile.flight.path})};
}

// Omniscient recording data only. Captains still receive the existing incoming
// warning allowlist, never these coordinates or the launcher's identity.
export function snapshotMissiles(missiles) {
  return missiles.filter(m=>m.flight?.profile===MISSILE_FLIGHT_PROFILE).map(m=>({
    missileId:m.missileId,shooterId:m.shooterId,targetId:m.targetId,side:m.side,
    weapon:m.weapon,pos:missilePosition(m.flight),flight:copy({profile:m.flight.profile,path:m.flight.path})
  }));
}
