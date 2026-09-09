// Target profile: a small hull is a poor mark for any gun, not merely for a keel
// gun. Ships DISABLED, so the first and largest obligation of this file is to
// prove the rule is inert until Chris adopts it - a present-but-disabled block
// must resolve battles identically to no block at all, byte for byte.
//
// The frigate structure change that ships live alongside it (class envelope 8 ->
// 9.2) is pinned here too, because it is the only live change and it moves four
// approved stock packs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makePrng, seedFromString } from '../src/prng.js';
import { runBattle, buildFleet, deployFleets } from '../src/tactical/resolver.js';
import { stockPack } from '../src/construction/index.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const tuning = read('../data/tactical-tuning.json'), loadouts = read('../data/loadouts.json');
const untouched = JSON.stringify({ tuning, loadouts });
const copy = o => structuredClone(o);
let groups = 0; const check = (name, fn) => { fn(); groups++; console.log('ok: ' + name); };

// A battle reduced to the facts a to-hit change can move.
const play = (t, seed, compA, compB, a = 'EAR', b = 'KRE') => {
  const rng = makePrng(seedFromString(seed));
  const A = buildFleet(a, compA, t, loadouts, rng, 'A');
  const B = buildFleet(b, compB, t, loadouts, rng, 'B');
  deployFleets(A, B, t);
  const r = runBattle([A, B], t, rng, {});
  return { victor: r.victor, turns: r.turns, survivors: r.survivorsA + r.survivorsB, shots: r.stats.A.shots + r.stats.B.shots, hits: r.stats.A.hits + r.stats.B.hits };
};
const series = (t, compA, compB, n = 24, a, b) =>
  Array.from({ length: n }, (_, i) => play(t, 'profile-' + i, compA, compB, a, b));
const hitRate = rows => {
  const shots = rows.reduce((s, r) => s + r.shots, 0), hits = rows.reduce((s, r) => s + r.hits, 0);
  assert.ok(shots > 400, `too few shots to measure a to-hit change: ${shots}`);
  return hits / shots;
};

const absent = copy(tuning); delete absent.toHit.hullProfile;
const on = copy(tuning); on.toHit.hullProfile.enabled = true;
const FRIGATES = { frigate: 6 }, DESTROYERS = { destroyer: 4 }, MIXED = { frigate: 4, destroyer: 1 };

check('Ships disabled: the shipped tuning declares the rule but does not apply it', () => {
  assert.equal(tuning.toHit.hullProfile.enabled, false);
  assert.deepEqual(tuning.toHit.hullProfile.byClass, { corvette: 1, frigate: 1 });
});

check('Disabled is inert: every battle resolves exactly as it does with no block at all', () => {
  for (const comp of [FRIGATES, MIXED, DESTROYERS])
    for (let i = 0; i < 24; i++)
      assert.deepEqual(play(tuning, 'inert-' + i, comp, comp), play(absent, 'inert-' + i, comp, comp),
        `a disabled hullProfile changed a battle (${JSON.stringify(comp)}, seed ${i})`);
});

check('Enabled, a frigate is genuinely harder to hit - both fleets frigates, so every shot is at one', () => {
  const before = hitRate(series(tuning, FRIGATES, FRIGATES)), after = hitRate(series(on, FRIGATES, FRIGATES));
  assert.ok(after < before - 0.02,
    `frigates must be measurably harder to hit once enabled: ${(100 * before).toFixed(1)}% -> ${(100 * after).toFixed(1)}%`);
});

check('A class outside byClass is untouched - destroyers carry no pip, so nothing changes', () => {
  for (let i = 0; i < 24; i++)
    assert.deepEqual(play(on, 'dd-' + i, DESTROYERS, DESTROYERS), play(tuning, 'dd-' + i, DESTROYERS, DESTROYERS));
});

check('The pip is read per class, not per hull size: an unlisted class stays at zero', () => {
  const onlyCorvette = copy(on); onlyCorvette.toHit.hullProfile.byClass = { corvette: 1 };
  for (let i = 0; i < 24; i++)
    assert.deepEqual(play(onlyCorvette, 'fr-' + i, FRIGATES, FRIGATES), play(tuning, 'fr-' + i, FRIGATES, FRIGATES));
});

check('Frigate structure 8 -> 9.2 at the class envelope, rounded per power after the faction modifier', () => {
  assert.equal(tuning.hullClasses.frigate.superstructure, 9.2);
  assert.deepEqual(
    Object.fromEntries(['EAR', 'VRA', 'ZAN', 'KRE'].map(f => [f, stockPack(f, 'frigate', tuning, loadouts).design.hull.superstructure])),
    { EAR: 9, VRA: 17, ZAN: 11, KRE: 9 });
});

check('The structure change moves the four frigate packs and nothing else in any roster', () => {
  const before = copy(tuning); before.hullClasses.frigate.superstructure = 8;
  const moved = [];
  for (const [faction, roster] of Object.entries(tuning.rosters).filter(([k]) => !k.startsWith('_')))
    for (const className of roster) {
      const a = stockPack(faction, className, before, loadouts), b = stockPack(faction, className, tuning, loadouts);
      if (JSON.stringify(a) !== JSON.stringify(b)) moved.push(`${faction}/${className}`);
    }
  assert.deepEqual(moved.sort(), ['EAR/frigate', 'KRE/frigate', 'VRA/frigate', 'ZAN/frigate']);
});

check('Each amended frigate pack advances exactly one revision from the published stock', () => {
  for (const faction of ['EAR', 'VRA', 'ZAN', 'KRE'])
    assert.equal(stockPack(faction, 'frigate', tuning, loadouts).design.revision,
      loadouts._publishedStock.revision + 1, `${faction}/frigate revision`);
});

check('Verification does not mutate the supplied tables',
  () => assert.equal(JSON.stringify({ tuning, loadouts }), untouched));

console.log(`Frigate target profile: ${groups} groups passed; 120 inert-gate comparisons and two hit-rate series.`);
