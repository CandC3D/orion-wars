// Opt-in, observer-owned contact state. No RNG and no changes to legacy combat.
// This compatibility profile adds no range/terrain fog to uncloaked signals.
import { SENSING_PROFILE, DEFAULT_SENSING_PROFILE, createSensingState, currentContacts,
  validateSensingProfile, operationalSensorRating, observedDamage, acquireScanLock, revokeTargetLocks } from './sensing.js';
export const CONTACT_PROFILE = 'signals-and-scans/1';
export function enableContacts(battle, { profile, sensing } = {}) {
  if (profile !== undefined && ![CONTACT_PROFILE, SENSING_PROFILE].includes(profile)) throw new Error('Unknown contact profile');
  if (battle.contacts) {
    if (profile !== undefined && profile !== battle.contacts.profile)
      throw new Error('An enabled contact profile cannot be silently replaced');
    if (sensing !== undefined) {
      if (battle.contacts.profile !== SENSING_PROFILE) throw new Error('Sensing parameters require the finite profile');
      const pinned = validateSensingProfile(sensing, [...battle.A, ...battle.B]);
      if ([0, 1, 2, 3, 4, 5].some(r => pinned.passiveRadiusHexes[r] !== battle.contacts.sensing.passiveRadiusHexes[r]))
        throw new Error('An enabled contact profile cannot be silently replaced');
    }
    return;
  }
  if (battle.turnsRun !== 0) throw new Error('Contact tracking must start before combat');
  if (profile === SENSING_PROFILE) {
    battle.contacts = createSensingState(battle, sensing === undefined ? DEFAULT_SENSING_PROFILE : sensing);
    return;
  }
  if (sensing !== undefined) throw new Error('Sensing parameters require the finite profile');
  battle.contacts = { profile: CONTACT_PROFILE, locks: { A: [], B: [] } };
}
// Revalidate host-edited hulls/identities before any finite-profile execution.
// Ordinary battles remain compatible unless the host explicitly enables C1.
export function assertExecutableContacts(battle) {
  if (!battle.contacts || battle.contacts.profile === CONTACT_PROFILE) return;
  if (battle.contacts.profile !== SENSING_PROFILE) throw new Error('Unknown executable contact profile');
  createSensingState(battle, battle.contacts.sensing);
}
export const sensorAbility = operationalSensorRating;
export function grantScanContact(battle, scanner, target, face) {
  if (battle?.contacts?.profile === SENSING_PROFILE) return acquireScanLock(battle, scanner, target, face);
  if (!battle?.contacts || sensorAbility(scanner, battle.tuning) < 2 || scanner.side === target.side) return;
  const locks = battle.contacts.locks[scanner.side];
  if (!locks.includes(target.id)) { locks.push(target.id); locks.sort(); }
}
export function loseContact(battle, target) {
  if (!battle?.contacts) return;
  if (battle.contacts.profile === SENSING_PROFILE) return revokeTargetLocks(battle, target.id);
  for (const side of ['A', 'B']) battle.contacts.locks[side] = battle.contacts.locks[side].filter(id => id !== target.id);
}
export function sideContacts(battle, side) {
  if (!['A', 'B'].includes(side)) throw new Error('Invalid observing side');
  if (battle.contacts?.profile === SENSING_PROFILE) return currentContacts(battle, side);
  if (battle.contacts?.profile !== CONTACT_PROFILE) throw new Error('Contact profile not enabled');
  const own = battle[side], enemy = battle[side === 'A' ? 'B' : 'A'];
  const ability = Math.max(0, ...own.map(s => sensorAbility(s, battle.tuning)));
  if (ability < 1) return [];
  const locks = battle.contacts.locks[side];
  return enemy.filter(s => !s.destroyed && (!s.cloaked || locks.includes(s.id)))
    .map(s => ({ id: s.id, faction: s.faction, className: s.className,
      pos: { q: s.pos.q, r: s.pos.r }, facing: s.facing,
      observedDamage: observedDamage(s, ability) }))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
