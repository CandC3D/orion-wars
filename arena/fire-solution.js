// Why a mount cannot bear on the PREFERRED CONTACT, from own telemetry and the
// current report alone.
//
// NOT A FIRING SOLUTION. This is the geometry at the ship's current position
// against a contact that may move, and against a plan whose power may be spent
// elsewhere, before the round resolves. It answers "why is this mount dark
// against the ship I have chosen", which the deck could not say before.
//
// Every input is disclosed: own mounts and power come from observation.own, the
// contact from observation.contacts, and the terrain and rules from the
// observation itself. No hidden state is read and none is inferred - the same
// tuning shape `previewContactOrders` builds is rebuilt here.
import { publicWeaponGeometry } from '../src/tactical/resolver.js';
import { mountState } from './console-instruments.js';

// The engine's own wording, compacted for an instrument. The full string is
// kept alongside so a hover and the engine can never drift apart in silence.
const SHORT = Object.freeze({
  'Outside bearing arc': 'NO ARC',
  'Out of range': 'RANGE',
  'Line of fire blocked': 'BLOCKED',
  'Same hex — no fire': 'SAME HEX',
  'Nebula visibility': 'NEBULA'
});
const num = n => Number.isFinite(Number(n)) ? Number(n) : 0;

// The observation-derived tuning `geometryReason` needs: terrain for the line
// of fire and the nebula, and the same-hex rule. Mirrors preview.js exactly.
export function tuningFromObservation(view) {
  return { battle: { map: view.map, mapRadiusHexes: view.map.radiusHexes,
    terrain: view.terrain, terrainRules: view.rules.terrain,
    sameHexNoFire: view.rules.movement.sameHexNoFire } };
}

// What one shot off this mount costs, by the engine's own firing paths: a beam
// spends whatever is free down to a floor of 1, a tube pays powerToArm, the
// cannon pays firePower.
export function shotCost(mount) {
  if (!mount) return 0;
  if (mount.kind === 'beam') return 1;
  if (mount.kind === 'spinal') return num(mount.weapon?.firePower);
  return num(mount.weapon?.powerToArm);
}

// `budget` is what the CURRENT PLAN leaves for weapons after refill, cannon
// charge, helm spending and the reserve floor - the figure the power bar
// already shows as free. Pass null to skip the power test.
export function fireSolution(ship, mount, contact, view, budget = null) {
  if (!ship || !mount) return null;
  const ready = mountState(mount, ship);
  if (ready.state !== 'ready') return { short: ready.label, full: ready.label, state: ready.state };
  if (!contact) return { short: '', full: 'No preferred target: whole battery shown', state: 'none' };
  const reason = publicWeaponGeometry(ship, mount, contact, tuningFromObservation(view));
  if (reason) return { short: SHORT[reason] ?? reason.toUpperCase(), full: reason, state: 'blocked' };
  const need = shotCost(mount);
  if (budget !== null && Number.isFinite(budget) && budget < need)
    return { short: 'POWER', full: `Insufficient power: this plan leaves ${Math.round(budget)} P for weapons, one shot needs ${Math.round(need)} P`,
      state: 'blocked' };
  return { short: 'BEARS', full: 'Bears on the preferred contact at the current position; not a firing solution', state: 'bears' };
}

// One pass for the whole battery, keyed by mount id.
export function batterySolutions(ship, contact, view, budget = null) {
  const out = new Map();
  if (!ship || ship.destroyed) return out;
  for (const mount of ship.mounts || []) {
    const solution = fireSolution(ship, mount, contact, view, budget);
    if (solution) out.set(mount.id, solution);
  }
  return out;
}
