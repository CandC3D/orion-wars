// Append new approvals; never rewrite the original returned-design oracle. The latest amendment of a
// key wins (findLast): a class amended twice is judged against its newest approved return.
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
export const originalApproved=read('../../docs/drydock/stock-promotion-2026-09-05/approved-designs.json').designs;
export const amendments=[
  ...read('../../docs/drydock/stock-amendments-2026-09-06/approved-designs.json').designs,
  ...read('../../docs/drydock/earth-light-cruiser-amendment-2026-09-06/approved-designs.json').designs,
  ...read('../../docs/drydock/earth-gunstar-amendment-2026-09-07/approved-designs.json').designs,
  ...read('../../docs/drydock/vraygon-battleship-amendment-2026-09-07/approved-designs.json').designs,
  ...read('../../docs/drydock/frigate-structure-amendment-2026-09-08/approved-designs.json').designs,
  ...read('../../docs/drydock/magazine-amendment-2026-09-11/approved-designs.json').designs,
  ...read('../../docs/drydock/vraygon-armour-amendment-2026-09-11/approved-designs.json').designs,
  ...read('../../docs/drydock/zandrax-krelath-hull-amendment-2026-09-11/approved-designs.json').designs
];
export const approved=originalApproved.map(entry=>amendments.findLast(a=>a.key===entry.key)??entry);
export const suppliedRevision=key=>amendments.findLast(a=>a.key===key)?.suppliedRevision??2;

// September 11 rulings (Chris): "magazines - increase for all" (every magazine x1.5, rounded) and the
// warp rebalance's Vraygon armour (1.80 -> 2.10). Tests written for an EARLIER amendment compare against
// tables with both undone, so they keep proving what they were written to prove.
export const MAGAZINES_BEFORE_SEP11={hull:{destroyer:4,'light-cruiser':5,'heavy-cruiser':12,battleship:20,monitor:32,'command-ship':14,'strike-cruiser':16,carrier:6,'gunstar-battlecruiser':12,'missile-destroyer':8},
  fit:{'EAR/light-cruiser':8,'VRA/destroyer':6,'VRA/light-cruiser':12,'VRA/heavy-cruiser':12,'VRA/battleship':18,'ZAN/light-cruiser':12,'ZAN/battleship':26,'KRE/heavy-cruiser':20,'KRE/battleship':26}};
const sep11=[...read('../../docs/drydock/magazine-amendment-2026-09-11/approved-designs.json').designs,
  ...read('../../docs/drydock/vraygon-armour-amendment-2026-09-11/approved-designs.json').designs,
  ...read('../../docs/drydock/zandrax-krelath-hull-amendment-2026-09-11/approved-designs.json').designs];
export const VRAYGON_ARMOUR_BEFORE_SEP11=1.8;
// And the Krelath rebalance the same evening: Zandrax hull 1.20 -> 1.10, Krelath 0.95 -> 1.05.
export const HULL_BEFORE_SEP11={ZAN:1.2,KRE:0.95};
export function beforeMagazineRuling(tuning,loadouts){
  const t=structuredClone(tuning),l=structuredClone(loadouts);
  for(const [c,m] of Object.entries(MAGAZINES_BEFORE_SEP11.hull))t.hullClasses[c].magazine=m;
  for(const [k,m] of Object.entries(MAGAZINES_BEFORE_SEP11.fit)){const [f,c]=k.split('/');l[f][c].magazine=m;}
  t.factionModifiers.VRA.superstructure=VRAYGON_ARMOUR_BEFORE_SEP11;
  for(const [f,m] of Object.entries(HULL_BEFORE_SEP11))t.factionModifiers[f].superstructure=m;
  for(const key of new Set(sep11.map(e=>e.key)))if(l._publishedStock?.revisions?.[key]!==undefined){
    const r=Math.min(...sep11.filter(e=>e.key===key).map(e=>e.suppliedRevision))-1;
    if(r<=(l._publishedStock.revision??1))delete l._publishedStock.revisions[key];else l._publishedStock.revisions[key]=r;}
  return {tuning:t,loadouts:l};
}
