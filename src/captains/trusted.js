// Reviewed local functions ONLY. This is not an interpreter or sandbox and must
// never be wired to source-code uploads. No time/fuel safety claim is made.
import { stepTurn } from '../tactical/resolver.js';
import { enableContacts, assertExecutableContacts } from '../tactical/contacts.js';
import { captainObservation } from './observation.js';
import { acceptDecision, allHoldOrders, validateOrders } from './orders.js';
import { jsonCopy, freezeTree } from './json.js';

export function assertShipIdentities(battle) {
  const seen = new Set();
  for (const ship of battle.fleets.flat()) {
    const id = ship.id;
    if (typeof id !== 'string' || !id.trim() || ['__proto__','constructor','prototype'].includes(id))
      throw new Error('Captain ships require nonempty, JSON-safe string IDs');
    if (seen.has(id)) throw new Error('Captain ship IDs must be globally unique');
    seen.add(id);
  }
}
export function assertPilot(battle,mode='earth-control') {
  assertExecutableContacts(battle);
  assertShipIdentities(battle);
  if(!['earth-control','special-command-proof'].includes(mode))throw new Error('Unknown trusted pilot mode');
  // Capability gate, not a claim that other factions are intrinsically weaker.
  for (const s of battle.fleets.flat()) {
    if (s.canCloak || s.cloaked || s.decloaking || s.spinal || s.squadrons ||
        !['EAR','KRE','VRA','ZAN'].includes(s.faction) || (mode==='earth-control' && (s.faction!=='EAR'||
        battle.tuning.warpJump?.factions?.includes(s.faction) || battle.tuning.emergencyManoeuvre?.factions?.includes(s.faction))))
      throw new Error('Pilot requires supported non-cloaking, non-carrier, non-spinal hulls; default mode remains non-special Earth only pending full parity acceptance');
  }
}
export function createTrustedSession(battle, controllers, {mode='earth-control'}={}) {
  // Explicit developer proof only. This does not enable C1 sensing, a sandbox,
  // uploaded controllers, a default captain or a faction leaderboard.
  assertPilot(battle,mode);
  if (!controllers || ['A','B'].some(s => typeof controllers[s] !== 'function')) throw new Error('Two reviewed controllers required');
  enableContacts(battle);
  return { battle, controllers, mode, memory: { A: null, B: null }, packets: [] };
}
export function stepTrusted(session) {
  const { battle } = session;
  assertExecutableContacts(battle);
  // Recheck before either controller runs if trusted host code edited a roster.
  assertShipIdentities(battle);
  if (battle.done) throw new Error('Match already complete');
  // Construct BOTH snapshots before either call. Never offer the second captain
  // the first captain's decisions. Copies prevent memory freezing/mutation leaks.
  const views = Object.fromEntries(['A','B'].map(side => [side, captainObservation(battle, side)]));
  const decisions = {};
  for (const side of ['A','B']) {
    try {
      const output = session.controllers[side](views[side], freezeTree(jsonCopy(session.memory[side])));
      decisions[side] = acceptDecision(views[side], output, session.memory[side]);
    } catch {
      decisions[side] = { ok: false, orders: allHoldOrders(views[side]), memory: jsonCopy(session.memory[side]),
        adjustments: [], faults: [{ code: 'controller-threw', detail: 'Reviewed controller failed' }] };
    }
  }
  const packet = { turn: battle.turn, decisions };
  session.packets.push(structuredClone(packet));
  for (const side of ['A','B']) session.memory[side] = jsonCopy(decisions[side].memory);
  return { packet, ...executePacket(battle, packet) };
}
// Accepted-packet resimulation; separate from viewing recorded event frames.
// Recording import/integrity validation belongs to the trusted host, not a bot.
export function executePacket(battle, packet) {
  assertExecutableContacts(battle);
  // Covers direct accepted-packet replay as well as createTrustedSession.
  assertShipIdentities(battle);
  if (packet.turn !== battle.turn || battle.done) throw new Error('Packet turn mismatch');
  // A damaged accepted-order log must not become a request for the privileged
  // helm. Check both complete maps atomically before touching engine state.
  const accepted = {};
  for (const side of ['A','B']) {
    const view = captainObservation(battle, side);
    const result = validateOrders(view, packet.decisions?.[side]?.orders);
    if (!result.ok || result.adjustments.length) throw new Error('Corrupt or noncanonical accepted packet');
    accepted[side] = result.orders;
  }
  const shots = [], log = [], frames = [];
  stepTurn(battle, { ...accepted.A, ...accepted.B }, {
    onShot: e => shots.push(structuredClone(e)),
    log: message => log.push(message),
    onRound: (turn, round) => frames.push({ turn, round, state: fullState(battle) })
  });
  return { shots, log, frames, state: fullState(battle) };
}
export function fullState(battle) {
  // Trusted omniscient evidence only; never part of an observation. Preserve
  // all ship fields (including caches), PRNG, missiles, stats and contact locks.
  return JSON.parse(JSON.stringify({ turn: battle.turn, turnsRun: battle.turnsRun, done: battle.done,
    maxTurns: battle.maxTurns, rounds: battle.rounds, result: battle.result, victory: battle.victory,
    fleets: battle.fleets, rngState: battle.rng.state, stats: battle.stats, inFlight: battle.inFlight,
    contacts: battle.contacts ?? null, contactLogged: battle.contactLogged },
  (_k, v) => typeof v === 'number' && !Number.isFinite(v) ? { nonFiniteNumber: String(v) } : v));
}
