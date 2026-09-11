// Scenario balance: run one authored scenario AI-vs-AI many times and report how it plays out.
//
//   node scripts/scenario-balance.mjs arena/scenarios/asterion-line.json --battles 2000
//   node scripts/scenario-balance.mjs <file> --max-turns 12 --pd 3     counterfactuals
//
// Uses the engine's own scenario path (createBattle, stepTurn with no orders, battleResult),
// so the result is what the arena would produce, seed by seed. Seeds are `${scenario.seed}/${i}`;
// the same arguments always print the same numbers.
import { readFileSync } from 'node:fs';
import { createBattle, stepTurn } from '../src/tactical/resolver.js';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a));
const num = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) : dflt; };
if (!file) { console.error('usage: node scripts/scenario-balance.mjs <scenario.json> [--battles N] [--max-turns T] [--pd R]'); process.exit(2); }
const read = p => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const scenario = read(file), tuning = read('data/tactical-tuning.json'), loadouts = read('data/loadouts.json');
const battles = num('--battles', 1000), maxTurns = num('--max-turns', scenario.maxTurns), pd = num('--pd', tuning.pointDefence.rangeHexes);
const local = structuredClone(tuning); local.pointDefence.rangeHexes = pd;
// --tune path=value, repeatable, as in test/fleet-trial.js.
for (let i = args.indexOf('--tune'); i >= 0; i = args.indexOf('--tune', i + 1)) {
  const [path, value] = args[i + 1].split('='), keys = path.split('.'), last = keys.pop(), node = keys.reduce((o, k) => o[k], local);
  if (!node || !(last in node)) throw new Error('--tune: no such tuning field ' + path);
  node[last] = JSON.parse(value);
}
const run = { ...structuredClone(scenario), maxTurns };

const tally = { A: 0, B: 0, draw: 0 }, reasons = {}, turns = [];
let atLimit = 0;
for (let i = 0; i < battles; i++) {
  const battle = createBattle(run, local, structuredClone(loadouts), `${scenario.seed ?? 'orion'}/${i}`);
  while (!battle.done) stepTurn(battle, {});
  const r = battle.result;
  tally[r.victor ?? 'draw']++;
  reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  turns.push(r.turns);
  if (r.turns >= maxTurns) atLimit++;
}
turns.sort((a, b) => a - b);
const pct = n => (100 * n / battles).toFixed(1) + '%';
console.log(`${scenario.name} · ${battles} battles · ${maxTurns}-turn limit · PD radius ${pd}`);
console.log(`  A ${pct(tally.A)}  B ${pct(tally.B)}  draw ${pct(tally.draw)}  · decisive ${pct(tally.A + tally.B)}`);
console.log(`  turns: median ${turns[battles >> 1]}, p10 ${turns[Math.floor(battles * .1)]}, p90 ${turns[Math.floor(battles * .9)]} · reached the limit ${pct(atLimit)}`);
console.log('  ' + Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v)}`).join(' · '));
