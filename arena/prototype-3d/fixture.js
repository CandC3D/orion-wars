// Authored SAFE observations, not a battle recording or a simulation fixture.
import { projectContactFrame, validateProjection, freeze } from './contract.js';
const own = { id: 'EAR-FF-1', faction: 'EAR', className: 'frigate', pos: { q: -2, r: 0 }, facing: 0, destroyed: false };
const enemies = [
  { id: 'KRE-FF-1', faction: 'KRE', className: 'frigate', pos: { q: 2, r: 0 }, facing: 3 },
  { id: 'VRA-FF-1', faction: 'VRA', className: 'frigate', pos: { q: 0, r: -2 }, facing: 5 }
];
const frame = phase => ({ format: 'player-contact-frame/1', phase, turn: 1, observation: { own: [own], contacts: enemies } });
export const planning = projectContactFrame(frame('planning'));
export const exchange = projectContactFrame(frame('resolution'), [{ kind: 'beam', direction: 'outgoing', outcome: 'resolved',
  shooterId: own.id, targetId: enemies[0].id, source: own.pos, destination: enemies[0].pos }]);
// This explicitly authored shield observation tests the material. It is NOT derived from
// the engine's "resolved" outcome and proposes no additional live disclosure.
export const shield = freeze(validateProjection({ ...exchange, events: [{ kind: 'shield-flare',
  destination: { id: own.id, hex: own.pos }, outcome: 'confirmed-shield', confirmation: 'authored-own-shield' }] }));
export const anonymous = projectContactFrame(frame('resolution'), [{ kind: 'missile', direction: 'incoming', outcome: 'unconfirmed',
  targetId: own.id, destination: own.pos }]);
export const timeline = [planning, exchange, shield, planning].map(frame => ({ frame, events: frame.events }));
