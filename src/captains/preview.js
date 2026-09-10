// Observation-only movement envelope, not an omniscient combat prediction.
import { previewPublicStep, publicWeaponGeometry } from '../tactical/resolver.js';
import { SENSING_PROFILE } from '../tactical/sensing.js';
import { validateOrders } from './orders.js';
import { freezeTree } from './json.js';
import { advanceManualSpinal } from '../tactical/spinal-control.js';
import { appraiseContact, ventsUnderFire, captainOf } from '../tactical/ship-command.js';

const numeric = v => Number.isFinite(Number(v)) ? Number(v) : 0;

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
  // THE CEILING, and what a captain is allowed to do to it.
  //
  // The route below is an upper bound on where the hull can be. Everything a captain might do is
  // therefore either folded in when it could LENGTHEN the route, or declared beside it when it
  // would only shorten it. Nothing he might do may shorten the bound, because the player reads it
  // as "at most this far".
  //
  // An earlier version of this file folded the bank in as CERTAIN. It is not, and Astra proved it
  // on 2026-09-09: the console reads a turn counter that the engine replaces before it decides,
  // and a missile arriving this turn lands before both. So the bank is now folded in whenever a
  // vent could happen AT ALL - the most permissive reading of an uncertain input - and declared as
  // a possibility rather than a fact.
  const captain = own.captain ?? null;
  delete ship.captain;                        // belt and braces: the ceiling pass must never consult him
  const appraised = captain ? observation.contacts.filter(c => !c.destroyed).map(c => appraiseContact(c, observation.rules.hullPoints)) : null;
  const declared = [];
  // A direct order overrules the captain for this turn. His objection is still declared, because
  // being overruled is exactly the case where the player most wants to have seen it first.
  const insist = !!accepted.insist;
  // When the range rule is LIVE, say so, because silence from it is not the same as consent. The
  // judgement is made from current contacts only: an enemy the sensors have not found, and one
  // whose refit prices it far above its class, both stop this ship at execution with nothing
  // declared here. Astra reproduced each on 2026-09-09.
  const officer = captain ? captainOf(own, tuning) : null;
  const hull = numeric(own.superstructureMax) > 0 ? numeric(own.superstructure) / numeric(own.superstructureMax) : 1;
  const armed = !!(officer && officer.profile.minRangeHexes > 0 && hull <= officer.profile.holdBelowHull);
  const armedNote = armed && !insist
    ? `Captain: his ${officer.profile.minRangeHexes}-hex line is live at ${Math.round(hull * 100)}% hull, judged from current contacts only.`
    : '';
  let intent = accepted.spinal;
  // Whichever side of the turn roll the engine reads, and whatever arrives before it does, take the
  // worse figure: an upper bound that is sometimes generous is safe, one that is sometimes short is not.
  const worstHullLoss = Math.max(numeric(own.hullLostLastTurn), numeric(own.hullLostThisTurn));
  const breakOff = captain && intent !== 'vent'
    ? ventsUnderFire({ ...own, hullLostLastTurn: worstHullLoss }, tuning) : null;
  if (breakOff && !insist) { intent = 'vent'; declared.push({ round: null, ...breakOff, rule: 'may-break-charge', reason: breakOff.possible, certain: false, insisted: false }); }
  else if (breakOff) declared.push({ round: null, ...breakOff, rule: 'holds-charge-under-protest', reason: breakOff.protest, certain: false, insisted: true });
  const bankNote=ship.spinal?advanceManualSpinal(ship,ship.mounts.find(m=>m.kind==='spinal')?.weapon||{},intent):'';
  ship.reserve = Math.round(accepted.reserve * ship.power);
  ship.emergencyUsed = false; ship.warpedThisTurn = false; ship.movedThisTurn = 0;
  // The captain keeps his own cursor through the plan. Once he has held a ship short, every later
  // action starts from where HE will be, not from where the ceiling says the hull could have got to.
  let shadowShip = captain ? { ...structuredClone(ship), captain, insistThisTurn: insist } : null;
  const contacts = observation.contacts.filter(c => !c.destroyed).map(c => ({ ...structuredClone(c), destroyed: false, cloaked: false }));
  const actions = [], route = [{ ...ship.pos, facing: ship.facing, round: 0 }];
  let unknownPosition = !!(ship.cloaked || ship.decloaking || ship.squadrons);
  for (let i = 0; i < accepted.plan.length; i++) {
    const entry = accepted.plan[i], round = i + 1, start = { ...ship.pos, facing: ship.facing };
    const notes = [];
    if(bankNote)notes.push(bankNote);
    if(breakOff)notes.push(`Captain: ${insist ? breakOff.protest : breakOff.possible}.`);
    if(armedNote)notes.push(armedNote);
    const kind = entry.scan ? 'scan' : entry.warp ? 'warp' : entry.turn || entry.forward || entry.burst ? 'move' : 'hold';
    if (entry.warp) unknownPosition = true;
    // A captain-free route that DIES cannot bound a route that has a captain aboard: he may refuse
    // the very burst that killed the hull here, and the ship then lives and travels further than
    // this forecast ever showed (Astra, 2026-09-09). Unresolved is the honest answer.
    if (ship.destroyed && captain) unknownPosition = true;
    if (unknownPosition) notes.push('Course unresolved: warp, cloak, keel, flight-deck coordination or a captain declining a fatal burst requires execution.');
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
          // The engine states its verdict flatly because it has truth. The console does not, so the
          // sentence is moved into the register it can actually support. A seam, and it goes when
          // the resolver emits a structured captain event instead of a line of prose.
          const reason = said.slice(said.indexOf(' captain: ') + 10).replace('will not close', 'may refuse to close');
          // Ahead of the ceiling notes, which otherwise read "moves as ordered" directly above an
          // officer saying he will do no such thing. The objection is the first thing to read.
          // Under a direct order there is no hold hex to name: he goes where he was sent.
          notes.unshift(insist ? `Captain: ${reason}.` : `Captain: ${reason} - expects to hold at (${holdAt.q}, ${holdAt.r}).`);
          declared.push({ round, rule: insist ? 'closes-under-protest' : 'may-refuse-to-close',
            reason, holdAt, hexes, certain: false, insisted: insist });
        }
      }
    } else if (kind === 'scan') notes.push(`Scan face ${entry.scan}; no movement or mount fire. New contacts cannot be predicted.`);
    else notes.push('Hold & fire: weapon expenditure is not deducted from this movement ceiling.');
    const mounts = own.mounts.map(m => ({ id: m.id,
      contacts: unknownPosition || kind !== 'hold' || m.inop || ship.destroyed || accepted.mountOrders?.[m.id] === 'hold' ? [] : contacts.filter(c => !publicWeaponGeometry(ship, m, c, tuning)).map(c => c.id),
      status: m.inop ? 'Offline' : ship.destroyed ? 'Destroyed' : accepted.mountOrders?.[m.id] === 'hold' ? 'Holding fire' : unknownPosition ? 'Unresolved' : kind !== 'hold' ? 'Action reserved' : 'Geometry only; readiness, spending and contacts may change'
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
    captain: captain ? { ...captain, insisted: insist, armed, declared,
      basis: 'Every captain note here is an ESTIMATE, and none of it is a promise. A refusal to close is judged from the contact report - nominal points for the reported class, and the best condition the sensors have not ruled out - so an enemy not yet found, a refit heavier than its class, or damage worse than reported all change what he decides at execution. Breaking off a charge is judged from a turn counter the engine replaces before it decides, and fire arriving this turn lands before both, so the route below assumes the bank IS vented whenever one could happen at all. The route stays an upper bound: what a captain might do can lengthen it, never shorten it.' } : null,
    caveat: 'Optimistic movement ceiling, not a promised route: current contacts are stationary; incoming damage, unseen traffic, future contacts and weapon spending can shorten movement. Advanced coordination is left unresolved.' });
}
