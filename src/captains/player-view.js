// Trusted host projection. Never serialize raw events, enemy objects or logs.
import { sideView } from './observation.js';
import { freezeTree } from './json.js';

export function playerFrame(battle, side, phase = 'planning', round = 0) {
  const observation = structuredClone(sideView(battle, side));
  observation.phase = phase === 'planning' ? 'pre-resolution' : 'resolution';
  for (const own of observation.own) own.powerPhase = phase === 'planning'
    ? 'residual-before-arriving-missiles' : 'at-recorded-event';
  return freezeTree({ format: 'player-contact-frame/1', phase, round, turn: battle.turn,
    maxTurns: battle.maxTurns, observation,
    result: battle.done ? { victor: ['A','B'].includes(battle.result?.victor) ? battle.result.victor : null,
      reason: 'Battle concluded', turns: battle.turnsRun } : null });
}

// Reports lost since a previous sample carry only the already-known ID. A lost
// target is not declared dead; neither its new position nor reason is exposed.
export function contactChanges(before, after) {
  const a = new Set(before.observation.contacts.map(c => c.id)), b = new Set(after.observation.contacts.map(c => c.id));
  return [ ...after.observation.contacts.filter(c => !a.has(c.id)).map(c => ({ kind: 'contact-acquired', contactId: c.id })),
    ...before.observation.contacts.filter(c => !b.has(c.id)).map(c => ({ kind: 'contact-lost', contactId: c.id })) ];
}

export function playerShot(event, before, after) {
  const own = new Set(before.observation.own.map(s => s.id));
  const visible = new Set(before.observation.contacts.map(c => c.id));
  const afterVisible = new Set(after.observation.contacts.map(c => c.id));
  const known = id => own.has(id) || (visible.has(id) && afterVisible.has(id));
  const shooterOwn = own.has(event.shooterId);
  const recipient = event.victimId ?? event.targetId;
  const recipientOwn = own.has(recipient);
  // Conservative proof policy: unrelated third-party fire is omitted entirely.
  if (!shooterOwn && !recipientOwn) return null;
  const kind = ['beam','spinal','strike','launch','missile'].includes(event.kind) ? event.kind : 'fire';
  const projected = { kind, direction: shooterOwn ? 'outgoing' : 'incoming',
    outcome: kind === 'launch' ? 'launched' : event.outcome === 'dead-target' ? 'unconfirmed'
      : event.outcome === 'intercepted' ? 'intercepted' : event.outcome === 'evaded' ? 'evaded'
      : event.hit === false ? 'miss' : 'resolved' };
  if (!recipientOwn && !known(recipient) && kind !== 'launch') projected.outcome = 'unconfirmed';
  if (shooterOwn) projected.shooterId = event.shooterId;
  // An impact never discloses launcher coordinates: even a currently known
  // launcher can have fired this missile from a previously unobserved position.
  if (kind !== 'missile' && known(event.shooterId)) {
    projected.shooterId = event.shooterId;
    if (event.shooterPos) projected.source = { q: event.shooterPos.q, r: event.shooterPos.r };
  }
  if (known(recipient)) {
    projected.targetId = recipient;
    const pos = event.victimPos ?? event.targetPos;
    if (pos) projected.destination = { q: pos.q, r: pos.r };
  }
  if (recipientOwn && Number.isInteger(event.face)) projected.face = event.face;
  // No raw damage value, enemy shield face, victim array, flight ID/course,
  // squadron, weapon definition or unfiltered text is forwarded.
  return freezeTree(projected);
}
