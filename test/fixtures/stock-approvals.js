// Append new approvals; never rewrite the original returned-design oracle.
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
export const originalApproved=read('../../docs/drydock/stock-promotion-2026-09-05/approved-designs.json').designs;
export const amendments=[
  ...read('../../docs/drydock/stock-amendments-2026-09-06/approved-designs.json').designs,
  ...read('../../docs/drydock/earth-light-cruiser-amendment-2026-09-06/approved-designs.json').designs,
  ...read('../../docs/drydock/earth-gunstar-amendment-2026-09-07/approved-designs.json').designs,
  ...read('../../docs/drydock/vraygon-battleship-amendment-2026-09-07/approved-designs.json').designs
];
export const approved=originalApproved.map(entry=>amendments.find(a=>a.key===entry.key)??entry);
export const suppliedRevision=key=>amendments.find(a=>a.key===key)?.suppliedRevision??2;
