import { stockPack, stockWeapons, forkPack } from '../../src/construction/index.js';
import { trialScenario } from '../../drydock/model.js';
// Minimal independent reproduction of Chris's R2 missile-frigate playtest.
// No dependency on his Downloads directory or browser storage.
export function frigateTrial(tuning,loadouts) {
  const pack=forkPack(stockPack('EAR','frigate',tuning,loadouts),'local:terminal-frigate');
  const missile=stockWeapons(tuning).find(w=>w.id==='stock:neutronic-missile');
  pack.weapons.push(missile);pack.design.revision=2;
  pack.design.hull.magazine=4;
  pack.design.mounts=[{id:'mount-missile',weapon:{id:missile.id,revision:1},faces:[2],position:{x:0,y:1.2,z:0},orientation:0}];
  return trialScenario(pack,tuning);
}
export function frigateOrders(turn) {
  return {'A-frigate-1':{reserve:.3,target:turn<3?'B-frigate-1':'auto',plan:[{turn:0,forward:turn===1?2:0},{turn:0,forward:0},{turn:0,forward:0}]}};
}
