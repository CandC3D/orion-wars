import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBattle, stepTurn } from '../arena/play-engine.js';
import { createBattle as engineCreate, stepTurn as engineStep } from '../src/tactical/resolver.js';
import { snapshotShip, appendTerminalFrame, recordScenario } from '../arena/record.js';
import { frigateTrial, frigateOrders } from './fixtures/drydock-frigate.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const t=read('../data/tactical-tuning.json'),l=read('../data/loadouts.json');
const scenario=frigateTrial(t,l),b=createBattle(scenario,t,l,scenario.seed),control=engineCreate(scenario,t,l,scenario.seed);
const rounds=[],events=[];let last,callbacks=0;
while(!b.done) {
  const orders=frigateOrders(b.turn);
  last=stepTurn(b,orders,{onRound(){callbacks++;}});rounds.push(...last.rounds);events.push(...last.shots);
  engineStep(control,orders);
  assert.deepEqual(b.fleets.flat().map(snapshotShip),control.fleets.flat().map(snapshotShip));
  assert.equal(b.rng.next(),control.rng.next()); // identical draws; restored below by keeping both streams aligned
}
// The extra diagnostic draw changes later die rolls, so use a clean seeded run
// for the exact historical result and the frame/callback count assertions.
const exact=createBattle(scenario,t,l,scenario.seed);const exactFrames=[];let exactLast,exactCallbacks=0;
while(!exact.done){exactLast=stepTurn(exact,frigateOrders(exact.turn),{onRound(){exactCallbacks++;}});exactFrames.push(...exactLast.rounds);}
assert.equal(exact.result.turns,4);assert.equal(exact.result.victor,'A');assert.equal(exact.A[0].superstructure,3);
assert.equal(exactCallbacks,9);assert.equal(exactFrames.length,10);
assert.equal(exactLast.rounds.length,1);assert.equal(exactLast.rounds[0].phase,'impacts');assert.equal(exactLast.rounds[0].terminal,true);
assert.equal(exactLast.rounds[0].turn,4);assert.equal(exactLast.rounds[0].round,1);
assert.equal(exactLast.rounds[0].ships.find(s=>s.id==='B-frigate-1').destroyed,true);
assert.deepEqual(exactLast.rounds[0].ships,exact.fleets.flat().map(snapshotShip));
assert.ok(exactLast.shots.some(s=>s.kind==='missile'&&s.damage>0&&s.turn===4&&s.round===1));
const n=exactFrames.length;appendTerminalFrame(exactFrames,exact.fleets,exact.result);assert.equal(exactFrames.length,n);
assert.deepEqual(stepTurn(exact).rounds,[]);
// Normal recorder and AI route end on exactly the actual final state too.
for(let seed=0;seed<12;seed++) {
  const s=structuredClone(scenario);s.seed=`terminal-ai-${seed}`;
  const record=recordScenario(s,t,l),engine=engineCreate(s,t,l,s.seed);
  while(!engine.done)engineStep(engine);
  assert.deepEqual(record.result,engine.result);
  assert.deepEqual(record.rounds.at(-1).ships,engine.fleets.flat().map(snapshotShip));
  assert.ok(record.rounds.filter(f=>f.terminal).length<=1);
}
// Existing last-action kills need no duplicate; terminal cleanup is explicit.
const final=exact.fleets.flat().map(snapshotShip),frames=[{turn:4,round:2,ships:final}];
appendTerminalFrame(frames,exact.fleets,exact.result);assert.equal(frames.length,1);
frames[0].ships[0].cloaked=true;appendTerminalFrame(frames,exact.fleets,exact.result);assert.equal(frames.length,2);assert.equal(frames[1].phase,'end');
console.log('Terminal recording passed: R2-style turn-4 impact kill, no extra engine action/RNG/state changes, repeated-step/idempotency, cleanup, 12 headless final-state comparisons.');
