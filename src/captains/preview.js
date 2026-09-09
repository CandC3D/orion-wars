// Observation-only movement envelope, not an omniscient combat prediction.
import { previewPublicStep, publicWeaponGeometry } from '../tactical/resolver.js';
import { SENSING_PROFILE } from '../tactical/sensing.js';
import { validateOrders } from './orders.js';
import { freezeTree } from './json.js';
import { advanceManualSpinal } from '../tactical/spinal-control.js';
import { appraiseContact, ventsUnderFire } from '../tactical/ship-command.js';

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
      stressDamage: burst.stressDamage, toHitPenalty: burst.toHitPenalty } : null,
    captainProfiles: observation.rules.captainProfiles };
  let ship = structuredClone(own);
  ship.weaponDefinitions = Object.fromEntries(ship.mounts.map(m => [m.type, m.weapon]));
  ship.power = ship.fullPower;
  // The captain is declared, never silently applied to the route below: that route is a CEILING and
  // it must stay an upper bound on where the hull can be. The one exception is the bank, and the
  // reason is that the two decisions rest on different evidence. Breaking off a charge is read from
  // OWN state, which the console knows exactly, so it is certain and is folded in - otherwise the
  // preview would show a planted ship that the engine is about to set free, and the ceiling would be
  // wrong in the dangerous direction. Refusing to close rests on an appraisal of the enemy, which
  // can be wrong, so it is declared beside the ceiling instead of shortening it.
  const captain = own.captain ?? null;
  delete ship.captain;                        // belt and braces: the ceiling pass must never consult him
  const appraised = captain ? observation.contacts.map(c => appraiseContact(c, observation.rules.hullPoints)) : null;
  const declared = [];
  let intent = accepted.spinal;
  const breakOff = captain && intent !== 'vent' ? ventsUnderFire(own, tuning) : null;
  if (breakOff) { intent = 'vent'; declared.push({ round: null, ...breakOff, certain: true }); }
  const bankNote=ship.spinal?advanceManualSpinal(ship,ship.mounts.find(m=>m.kind==='spinal')?.weapon||{},intent):'';
  ship.reserve = Math.round(accepted.reserve * ship.power);
  ship.emergencyUsed = false; ship.warpedThisTurn = false; ship.movedThisTurn = 0;
  // The captain keeps his own cursor through the plan. Once he has held a ship short, every later
  // action starts from where HE will be, not from where the ceiling says the hull could have got to.
  let shadowShip = captain ? { ...structuredClone(ship), captain } : null;
  const contacts = observation.contacts.map(c => ({ ...structuredClone(c), destroyed: false, cloaked: false }));
  const actions = [], route = [{ ...ship.pos, facing: ship.facing, round: 0 }];
  let unknownPosition = !!(ship.cloaked || ship.decloaking || ship.squadrons);
  for (let i = 0; i < accepted.plan.length; i++) {
    const entry = accepted.plan[i], round = i + 1, start = { ...ship.pos, facing: ship.facing };
    const notes = [];
    if(bankNote)notes.push(bankNote);
    if(breakOff)notes.push(`Captain: ${breakOff.reason}.`);
    const kind = entry.scan ? 'scan' : entry.warp ? 'warp' : entry.turn || entry.forward || entry.burst ? 'move' : 'hold';
    if (entry.warp) unknownPosition = true;
    if (unknownPosition) notes.push('Course unresolved: warp, cloak, keel or flight-deck coordination requires execution.');
    else if (ship.destroyed) notes.push('Burst stress would destroy this vessel; later actions unavailable.');
    else if (kind === 'move') {
      const result = previewPublicStep(ship, entry, contacts, tuning);
      ship = result.ship; notes.push(...result.notes);
      route.push(...result.route.map(p => ({ ...p, round })));
      // The same step, re-run along the captain's own track with the contacts appraised. It is the
      // engine's own rule against the console's picture: what he says here is what he will say at
      // execution, unless the plot is wrong about the enemy.
      if (captain) {
        const shadow = previewPublicStep(shadowShip, entry, appraised, tuning);
        const said = shadow.notes.find(n => n.includes(' captain: '));
        const hexes = shadow.ship.movedThisTurn - shadowShip.movedThisTurn;
        shadowShip = shadow.ship;
        if (said) {
          const holdAt = { ...shadow.ship.pos, facing: shadow.ship.facing };
          const reason = said.slice(said.indexOf(' captain: ') + 10);
          // Ahead of the ceiling notes, which otherwise read "moves as ordered" directly above an
          // officer saying he will do no such thing. The objection is the first thing to read.
          notes.unshift(`Captain: ${reason}, ending (${holdAt.q}, ${holdAt.r}).`);
          declared.push({ round, rule: 'will-not-close', reason, holdAt, hexes, certain: false });
        }
      }
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
    captain: captain ? { ...captain, declared,
      basis: 'A refusal to close is judged from the contact report: nominal points for the reported class, and the best condition the sensors have not ruled out. A refit heavier than its class, or damage worse than reported, can change what he decides at execution. Breaking off a charge is read from own state and is certain.' } : null,
    caveat: 'Optimistic movement ceiling, not a promised route: current contacts are stationary; incoming damage, unseen traffic, future contacts and weapon spending can shorten movement. Advanced coordination is left unresolved.' });
}
