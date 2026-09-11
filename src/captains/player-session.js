// Trusted host only. The browser worker owns this closure; no battle escapes.
import { createBattle, stepTurn } from '../tactical/resolver.js';
import { enableContacts } from '../tactical/contacts.js';
import { SENSING_PROFILE } from '../tactical/sensing.js';
import { validateOrders } from './orders.js';
import { playerFrame, playerShot, contactChanges } from './player-view.js';
import { freezeTree } from './json.js';

export function createPlayerSession(scenario, tuning, loadouts, side = 'A') {
  const battle = createBattle(structuredClone(scenario), structuredClone(tuning), structuredClone(loadouts),
    String(scenario.seed ?? 'contacts'), { fleetFloorPolicy: 'warn' });
  enableContacts(battle, { profile: SENSING_PROFILE });
  return bindPlayerSession(battle, side);
}

// Also usable by host-side regression fixtures. Never exposed as a worker verb.
export function bindPlayerSession(battle, side) {
  if (!['A','B'].includes(side) || battle.contacts?.profile !== SENSING_PROFILE) throw new Error('Invalid player session');
  let resolving = false;
  const view = () => playerFrame(battle, side);
  return Object.freeze({
    view,
    step(input) {
      if (resolving || battle.done) throw new Error('Session unavailable');
      const initial = view(), accepted = validateOrders(initial.observation, input);
      if (!accepted.ok) return freezeTree({ ok: false, faults: [{ code: 'invalid-orders', detail: 'Invalid orders; no turn advanced.' }], frame: initial });
      resolving = true;
      const timeline = []; let last = initial, beforeShot = null;
      // A captain's deviation is the player's OWN officer explaining his own ship, so it belongs in
      // the restricted tape - clause 2 of the ruling, which held only for a trusted caller until
      // Astra pointed that out. The raw narrative log stays unsubscribed because it is omniscient;
      // these are structured records that never name the enemy that provoked them.
      battle.captainLog = [];
      battle.destructionLog = [];
      battle.warpLog = [];
      let lossesDrained = 0, warpsDrained = 0;
      let drained = 0;
      const captainEvents = () => battle.captainLog.slice(drained)
        .filter(e => e.side === side)
        .map(e => ({ kind: 'captain', shipId: e.shipId, rule: e.rule, reason: e.reason,
          ...(e.insisted ? { insisted: true } : {}), ...(e.unordered ? { unordered: true } : {}),
          ...(Number.isFinite(e.held) ? { held: e.held, of: e.of } : {}) }));
      const sample = (phase, round, event = null, force = false) => {
        const frame = playerFrame(battle, side, phase, round);
        const fromCaptains = captainEvents(); drained = battle.captainLog.length;
        const losses = battle.destructionLog.slice(lossesDrained).filter(e => e.side === side)
          .map(e => ({ kind: 'destruction', shipId: e.shipId, name: e.name, turn: e.turn, own: e.own }));
        lossesDrained = battle.destructionLog.length;
        // Warps: own jumps and refusals are this side's own record. An enemy jump is shown only as far
        // as sensors saw it - its arrival if it is a live contact now, its departure if it was one before.
        const seen = obs => new Set((obs?.contacts ?? []).filter(c => !c.destroyed).map(c => c.id));
        const before = seen(last?.observation), after = seen(frame.observation);
        const warps = battle.warpLog.slice(warpsDrained).flatMap(e => {
          if (e.side === side) return [e.refused ? { kind: 'warp-refused', shipId: e.shipId, reason: e.refused }
            : { kind: 'warp', direction: 'outgoing', shipId: e.shipId, source: { ...e.from }, destination: { ...e.to }, hexes: e.hexes, ...(e.shortened ? { shortened: e.shortened } : {}) }];
          if (e.refused || (!before.has(e.shipId) && !after.has(e.shipId))) return [];
          return [{ kind: 'warp', direction: 'incoming', shipId: e.shipId, ...(before.has(e.shipId) ? { source: { ...e.from } } : {}),
            ...(after.has(e.shipId) ? { destination: { ...e.to } } : {}) }];
        });
        warpsDrained = battle.warpLog.length;
        // Omit invisible enemy actions and their ordering/count. Public round
        // boundaries remain, but raw callback/initiative indices never escape.
        if (!force && !event && !fromCaptains.length && !losses.length && !warps.length && JSON.stringify(frame.observation) === JSON.stringify(last.observation)) return frame;
        const events = contactChanges(last, frame); if (event) events.push(event);
        events.push(...fromCaptains);
        events.push(...losses);
        events.push(...warps);
        timeline.push({ frame, events }); last = frame; return frame;
      };
      try {
        stepTurn(battle, accepted.orders, {
          onBeforeShot: (_turn, round) => { beforeShot = playerFrame(battle, side, 'event', round); },
          onShot: event => {
            const phase = event.kind === 'missile' ? 'impacts' : 'event';
            const round = event.kind === 'missile' ? 0 : event.round;
            const after = playerFrame(battle, side, phase, round);
            const safe = playerShot(event, beforeShot ?? after, after);
            sample(phase, round, safe);
            beforeShot = null;
          },
          onState: (_turn, round, phase) => sample(phase, round),
          onRound: (_turn, round) => sample('round-end', round, null, true)
          // Raw narrative log is deliberately not subscribed to.
        });
        const frame = sample('planning', 0, null, true);
        return freezeTree({ ok: true, frame, timeline, adjustments: accepted.adjustments });
      } finally { resolving = false; }
    }
  });
}
