// Observation-only movement envelope, not an omniscient combat prediction.
import { previewPublicStep, publicWeaponGeometry } from '../tactical/resolver.js';
import { SENSING_PROFILE } from '../tactical/sensing.js';
import { validateOrders } from './orders.js';
import { freezeTree } from './json.js';
import { advanceManualSpinal } from '../tactical/spinal-control.js';

export function previewContactOrders(observation, shipId, order) {
  if (observation.contactProfile !== SENSING_PROFILE) throw new Error('Finite observation required');
  const own = observation.own.find(s => s.id === shipId && !s.destroyed);
  if (!own) throw new Error('Owned living ship required');
  const validated = validateOrders(observation, { [shipId]: order });
  if (!validated.ok) return freezeTree({ valid: false, faults: validated.faults });
  const accepted = validated.orders[shipId], burst = own.specials.burst;
  const tuning = { battle: { map: observation.map, mapRadiusHexes: observation.map.radiusHexes,
    terrain: observation.terrain, terrainRules: observation.rules.terrain,
    sameHexNoFire: observation.rules.movement.sameHexNoFire },
    emergencyManoeuvre: burst ? { factions: [own.faction], extraHexes: burst.maxExtraHexes,
      stressDamage: burst.stressDamage, toHitPenalty: burst.toHitPenalty } : null };
  let ship = structuredClone(own);
  ship.weaponDefinitions = Object.fromEntries(ship.mounts.map(m => [m.type, m.weapon]));
  ship.power = ship.fullPower;
  const bankNote=ship.spinal?advanceManualSpinal(ship,ship.mounts.find(m=>m.kind==='spinal')?.weapon||{},accepted.spinal):'';
  ship.reserve = Math.round(accepted.reserve * ship.power);
  ship.emergencyUsed = false; ship.warpedThisTurn = false; ship.movedThisTurn = 0;
  const contacts = observation.contacts.map(c => ({ ...structuredClone(c), destroyed: false, cloaked: false }));
  const actions = [], route = [{ ...ship.pos, facing: ship.facing, round: 0 }];
  let unknownPosition = !!(ship.cloaked || ship.decloaking || ship.squadrons);
  for (let i = 0; i < accepted.plan.length; i++) {
    const entry = accepted.plan[i], round = i + 1, start = { ...ship.pos, facing: ship.facing };
    const notes = [];
    if(bankNote)notes.push(bankNote);
    const kind = entry.scan ? 'scan' : entry.warp ? 'warp' : entry.turn || entry.forward || entry.burst ? 'move' : 'hold';
    if (entry.warp) unknownPosition = true;
    if (unknownPosition) notes.push('Course unresolved: warp, cloak, keel or flight-deck coordination requires execution.');
    else if (ship.destroyed) notes.push('Burst stress would destroy this vessel; later actions unavailable.');
    else if (kind === 'move') {
      const result = previewPublicStep(ship, entry, contacts, tuning);
      ship = result.ship; notes.push(...result.notes);
      route.push(...result.route.map(p => ({ ...p, round })));
    } else if (kind === 'scan') notes.push(`Scan face ${entry.scan}; no movement or mount fire. New contacts cannot be predicted.`);
    else notes.push('Hold & fire: weapon expenditure is not deducted from this movement ceiling.');
    const mounts = own.mounts.map(m => ({ id: m.id,
      contacts: unknownPosition || kind !== 'hold' || m.inop || ship.destroyed ? [] : contacts.filter(c => !publicWeaponGeometry(ship, m, c, tuning)).map(c => c.id),
      status: m.inop ? 'Offline' : ship.destroyed ? 'Destroyed' : unknownPosition ? 'Unresolved' : kind !== 'hold' ? 'Action reserved' : 'Geometry only; readiness, spending and contacts may change'
    }));
    const end = unknownPosition ? null : { ...ship.pos, facing: ship.facing };
    if (end) route.push({ ...end, round, waypoint: true, kind });
    actions.push({ round, kind, scan: entry.scan ?? null, start: unknownPosition ? null : start, end,
      powerCeiling: unknownPosition ? null : ship.power, notes, mounts });
    // A ready bank may discharge in this hold action, removing the movement
    // lock. Do not claim zero is an upper bound for later motion or predict a
    // shot from hidden execution state. Cold/charging and vent routes are known.
    if(kind==='hold'&&ship.spinal?.state==='ready')unknownPosition=true;
  }
  return freezeTree({ valid: true, mode: 'movement-ceiling/1', route, actions,
    adjustments: validated.adjustments.filter(a => a.shipId === shipId),
    caveat: 'Optimistic movement ceiling, not a promised route: current contacts are stationary; incoming damage, unseen traffic, future contacts and weapon spending can shorten movement. Advanced coordination is left unresolved.' });
}
