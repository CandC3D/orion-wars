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

// Omniscient recording data only. The side-view torpedo projection applies its
// own allowlist and visibility gate; never forward these raw records to players.
export function snapshotMissiles(missiles) {
  return missiles.filter(m=>m.flight?.profile===MISSILE_FLIGHT_PROFILE).map(m=>({
    missileId:m.missileId,shooterId:m.shooterId,targetId:m.targetId,side:m.side,
    weapon:m.weapon,pos:missilePosition(m.flight),flight:copy({profile:m.flight.profile,path:m.flight.path})
  }));
}

// Retargeting (EXPERIMENT, Chris 2026-09-11). A torpedo whose target dies before it lands takes the
// nearest living enemy within `radiusHexes` of where the torpedo now is; with none that close, it is
// lost as before ("dead-target"). No fuel limit, deliberately - Sins of a Solar Empire caps its
// chases by fuel, and a flight here lasts one turn - so the radius is the whole of the restraint.
// A cloaked hull is not a homing target. Nearest by exact distance from the torpedo's current
// sample, ties by id; consumes no RNG. Disabled, nothing here runs.
const cubeDistance = (a, b) => { const dq = a.q - b.q, dr = a.r - b.r; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
export function retargetOrphan(missile, fleets, rule) {
  if (!rule?.enabled || missile.flight?.profile !== MISSILE_FLIGHT_PROFILE) return false;
  const ships = fleets.flat(), current = ships.find(s => s.id === missile.targetId);
  if (current && !current.destroyed) return false;
  const at = missilePosition(missile.flight);
  const pick = ships.filter(s => s.side !== missile.side && !s.destroyed && !s.cloaked)
    .map(s => ({ s, d: cubeDistance(at, s.pos) })).filter(x => x.d <= rule.radiusHexes)
    .sort((a, b) => a.d - b.d || (a.s.id < b.s.id ? -1 : a.s.id > b.s.id ? 1 : 0))[0];
  if (!pick) return false;
  missile.retargets = [...(missile.retargets ?? []), { from: missile.targetId, to: pick.s.id }];
  missile.targetId = pick.s.id;
  return true;
}
export function retargetOrphans(missiles, fleets, rule) {
  if (!rule?.enabled) return;
  for (const m of missiles) retargetOrphan(m, fleets, rule);
}
