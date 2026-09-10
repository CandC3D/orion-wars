// "Provide a message to the player when a discharged weapon comes back online and is ready to fire."
// Chris, 10 September 2026.
//
// Compares own mounts between two planning pictures and reports the transitions that are news.
// Every gun is FIRED in one turn and READY in the next - that happens to the whole battery every
// turn, and announcing it would bury the tape - so FIRED is excluded. What IS news is the cannon
// cycle and anything returning from being out of action: a bank finishing its cooldown, a bank
// reaching full charge, a mount coming back from OFFLINE.
import { mountState } from './console-instruments.js';

const ROUTINE = new Set(['FIRED']);

export function readinessChanges(before, after) {
  const prior = new Map((before?.own ?? []).map(s => [s.id, s]));
  const events = [];
  for (const ship of after?.own ?? []) {
    const was = prior.get(ship.id);
    if (!was || ship.destroyed) continue;
    for (const mount of ship.mounts ?? []) {
      const old = (was.mounts ?? []).find(m => m.id === mount.id);
      if (!old) continue;
      const a = mountState(old, was), b = mountState(mount, ship);
      const name = mount.displayName || String(mount.type || 'weapon').replaceAll('-', ' ');
      if (b.state === 'ready' && a.state !== 'ready' && !ROUTINE.has(a.label))
        events.push({ kind: 'weapon-ready', shipId: ship.id, mountId: mount.id, weapon: name,
          from: a.label, detail: a.label === 'CHARGING' ? 'fully charged and ready to fire' : 'back online and ready to fire' });
      // The cannon's cooldown ending is the moment it can be charged again - the "discharged weapon
      // comes back online" beat, even though a cold bank is not yet ready to fire.
      else if (a.label === 'COOLING' && b.label !== 'COOLING' && b.state !== 'offline')
        events.push({ kind: 'weapon-ready', shipId: ship.id, mountId: mount.id, weapon: name,
          from: 'COOLING', detail: 'cooldown complete; available to charge' });
    }
  }
  return events;
}
