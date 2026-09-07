// Presentation reads recorded course samples. It must never reconstruct homing
// from ship snapshots, extrapolate an unfinished flight, or alter combat timing.
import { MISSILE_FLIGHT_PROFILE } from '../src/tactical/missiles.js';

export function courseLegs(frame) {
  return (frame.missiles ?? []).flatMap(missile => {
    if (missile.flight?.profile !== MISSILE_FLIGHT_PROFILE) return [];
    const path = missile.flight.path, last = path.at(-1), prior = path.at(-2);
    if (!prior || last.phase !== 'course' || last.turn !== frame.turn || last.round !== frame.round) return [];
    return [{ missileId: missile.missileId, weapon: missile.weapon, from: {...prior.pos}, to: {...last.pos} }];
  });
}

// Times are viewer-frame coordinates, not speeds or new action phases. The
// impact is still next-turn IMPACTS; .85 and .15 only pace its animation.
export function missileTrack(effect, rounds) {
  let flight = effect.arrival?.flight;
  if (!flight && effect.launch.missileId) {
    for (let i = rounds.length - 1; i >= effect.launchIndex; i--) {
      flight = rounds[i].missiles?.find(m => m.missileId === effect.launch.missileId)?.flight;
      if (flight) break;
    }
  }
  if (flight?.profile !== MISSILE_FLIGHT_PROFILE) return null;
  const points = [];
  for (const point of flight.path) {
    const index = rounds.findIndex(r => r.turn === point.turn && r.round === point.round && !r.terminal);
    if (index < 0) continue; // An incomplete record cannot invent a time slot.
    points.push({ at: index + (point.phase === 'course' ? .85 : 0), pos: {...point.pos} });
  }
  const arrival = effect.arrival;
  const destination = arrival?.victimPos ?? arrival?.targetPos;
  if (destination && effect.arrivalIndex < rounds.length) {
    points.push({ at: effect.arrivalIndex + .15, pos: {...destination} });
  }
  return points.length ? points : null;
}

export function sampleMissileTrack(points, time) {
  let start = points[0], end = start;
  for (const point of points) {
    end = point;
    if (time < point.at) break;
    start = point;
  }
  const fraction = end.at > start.at ? Math.max(0, Math.min(1, (time - start.at) / (end.at - start.at))) : 1;
  return { from: {...start.pos}, to: {...end.pos}, fraction,
    pos: {q:start.pos.q+(end.pos.q-start.pos.q)*fraction, r:start.pos.r+(end.pos.r-start.pos.r)*fraction} };
}
