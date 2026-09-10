// Faction lever sweep: change one faction modifier, measure every pairing at
// several fleet sizes, and see what it costs the other three.
//
//   node test/faction-levers.mjs [pairs]
//
// Written for the Krelath diagnosis of 2026-09-07 (docs/krelath-diagnosis-2026-09-07.md)
// and kept because the question recurs for every power.
//
// Diagnosis so far: identical common-hull fleets, Krelath lose hulls fastest of
// the four - first loss turn 2.35 against 3.02/3.40/2.89 - and are down to 29% of
// their fleet by turn 5 while Earth still hold 58%. They close fastest in the
// game (movementPointRatio 0.78) on the joint-flimsiest hull (superstructure
// 0.95), and their shield efficiency of 0.95 does not buy back what Earth's 0.85
// does. NOTE: doctrine.reserveFraction is NOT a live lever - doctrine.dynamic is
// enabled, so every power computes the same reserve from the tactical picture.
//
// Each variant is a local clone. Nothing is written to data/.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const R = 'file:///' + root.replace(/\\/g, '/') + '/';
const { makePrng, seedFromString } = await import(R + 'src/prng.js');
const { runBattle, buildFleet, deployFleets } = await import(R + 'src/tactical/resolver.js');
const { SCALES, compFor } = await import(R + 'test/comp.js');
const BASE = JSON.parse(readFileSync(join(root, 'data/tactical-tuning.json'), 'utf8'));
const L = JSON.parse(readFileSync(join(root, 'data/loadouts.json'), 'utf8'));
const F = ['EAR', 'VRA', 'ZAN', 'KRE'];
const PAIRS = Number(process.argv[2] || 100);
const SIZES = [18, 32, 52, 68];

function sweep(t) {
  const out = {};
  for (const pts of SIZES) {
    const tally = Object.fromEntries(F.map(f => [f, { w: 0, n: 0 }]));
    for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
      for (let k = 0; k < PAIRS; k++) for (const [x, y] of [[F[i], F[j]], [F[j], F[i]]]) {
        const rng = makePrng(seedFromString(`lv-${i}-${j}-${k}`));
        const A = buildFleet(x, compFor(x, SCALES[pts], t), t, L, rng, 'A');
        const B = buildFleet(y, compFor(y, SCALES[pts], t), t, L, rng, 'B');
        deployFleets(A, B, t);
        const r = runBattle([A, B], t, rng, {});
        const w = r?.victor === 'A' ? x : r?.victor === 'B' ? y : null;
        if (w) { tally[w].w++; tally[x].n++; tally[y].n++; }
      }
    }
    out[pts] = Object.fromEntries(F.map(f => [f, tally[f].n ? 100 * tally[f].w / tally[f].n : 0]));
  }
  return out;
}
const mk = (mut) => { const t = structuredClone(BASE); mut(t); return t; };
const K = t => t.factionModifiers.KRE;
const VARIANTS = [
  ['baseline', BASE],
  ['KRE hull 0.95 -> 1.05', mk(t => { K(t).superstructure = 1.05; })],
  ['KRE hull 0.95 -> 1.15', mk(t => { K(t).superstructure = 1.15; })],
  ['KRE shields 0.95 -> 0.85 (Earth\'s)', mk(t => { K(t).shieldPointRatio = 0.85; })],
  ['KRE shields 0.95 -> 0.75', mk(t => { K(t).shieldPointRatio = 0.75; })],
  ['KRE move 0.78 -> 0.95 (close slower)', mk(t => { K(t).movementPointRatio = 0.95; })],
  ['KRE hull 1.05 + shields 0.85', mk(t => { K(t).superstructure = 1.05; K(t).shieldPointRatio = 0.85; })]
];
console.log(`Krelath levers — all pairings, ${PAIRS} mirrored pairs per pairing per size\n`);
const head = 'variant'.padEnd(38) + SIZES.map(s => ('KRE@' + s).padStart(9)).join('') + '   spread@52  others@52';
console.log(head);
for (const [label, t] of VARIANTS) {
  const s = sweep(t);
  const at52 = F.map(f => s[52][f]);
  const spread = Math.max(...at52) - Math.min(...at52);
  const others = F.filter(f => f !== 'KRE').map(f => f + ' ' + s[52][f].toFixed(0)).join(' ');
  console.log(label.padEnd(38) + SIZES.map(x => (s[x].KRE.toFixed(0) + '%').padStart(9)).join('')
    + ('  ' + spread.toFixed(0) + 'pp').padStart(11) + '  ' + others);
}
