// Local trusted-fixture trial + exact accepted-packet resimulation. Never loads
// arbitrary controller source. Outputs are host-side omniscient audit artifacts.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBattle } from '../src/tactical/resolver.js';
import { enableContacts, CONTACT_PROFILE } from '../src/tactical/contacts.js';
import { stockPack } from '../src/construction/index.js';
import { createTrustedSession, stepTrusted, executePacket } from '../src/captains/trusted.js';
import { OBSERVATION_VERSION } from '../src/captains/observation.js';
import { ORDER_VERSION } from '../src/captains/orders.js';
import { holdCaptain, approachCaptain } from '../src/captains/fixtures.js';
import { canonicalJSON } from '../src/captains/json.js';
import { snapshotShip, appendTerminalFrame } from '../arena/record.js';
import { GEOMETRY_RULESET } from '../src/tactical/hex.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : canonicalJSON(value)).digest('hex');
const read = path => JSON.parse(readFileSync(join(root,path),'utf8'));
const tuning = read('data/tactical-tuning.json'), loadouts = read('data/loadouts.json');
function sourceInventory() {
  const out = [];
  function walk(dir) {
    for (const item of readdirSync(join(root,dir),{withFileTypes:true})) {
      const path = join(dir,item.name);
      if (item.isDirectory()) walk(path);
      else if (/\.(js|mjs)$/.test(path)) out.push({ path:path.replaceAll('\\','/'), sha256:digest(readFileSync(join(root,path),'utf8')) });
    }
  }
  walk('src');
  for(const path of ['arena/record.js','scripts/captain-trial.mjs']) out.push({path,sha256:digest(readFileSync(join(root,path),'utf8'))});
  return out.sort((a,b)=>a.path < b.path ? -1 : 1);
}
export function runTrial(seed = 'captains-c01-1', reverse = false) {
  const list = { 'heavy-cruiser':1, 'light-cruiser':2, destroyer:4 };
  const ships = Object.entries(list).flatMap(([className,n]) => Array.from({length:n},()=>({className,designPack:stockPack('EAR',className,tuning,loadouts)})));
  assert.equal(ships.reduce((sum,s)=>sum+s.designPack.design.hull.points,0),52);
  const scenario = { name:'Captain foundation — trusted EAR fixtures',seed,map:{widthHexes:72,heightHexes:40},terrain:[],
    maxTurns:12,sides:[{faction:'EAR',ships:structuredClone(ships)},{faction:'EAR',ships:structuredClone(ships)}] };
  const create = () => createBattle(structuredClone(scenario),structuredClone(tuning),structuredClone(loadouts),seed);
  const battle=create(), replay=create(); enableContacts(replay);
  const session=createTrustedSession(battle,reverse ? {A:holdCaptain,B:approachCaptain} : {A:approachCaptain,B:holdCaptain});
  const evidence=[],rounds=[{turn:0,round:0,ships:battle.fleets.flat().map(snapshotShip)}],shots=[],log=[];
  while(!battle.done) {
    const turn=stepTrusted(session), rebuilt=executePacket(replay,structuredClone(turn.packet));
    for(const key of ['state','shots','log','frames']) assert.deepEqual(rebuilt[key],turn[key],`${key} resimulation differs`);
    evidence.push({turn:turn.packet.turn,stateSha256:digest(turn.state),shotsSha256:digest(turn.shots),logSha256:digest(turn.log),framesSha256:digest(turn.frames)});
    rounds.push(...turn.frames.map(f=>({turn:f.turn,round:f.round,ships:f.state.fleets.flat().map(snapshotShip)})));
    shots.push(...turn.shots);
    // Keep turn logs as turn-level evidence; do not invent a round attribution.
    log.push(...turn.log.map(message=>({turn:turn.packet.turn,message})));
  }
  appendTerminalFrame(rounds,battle.fleets,battle.result);
  const sources=sourceInventory();
  const controllerIds=reverse?{A:'fixture-hold/1',B:'fixture-approach/1'}:{A:'fixture-approach/1',B:'fixture-hold/1'};
  const audit = { format:'orion-trusted-captain-audit/1',controllerIds,observation:OBSERVATION_VERSION,orders:ORDER_VERSION,contacts:CONTACT_PROFILE,
    runtime:{node:process.version,v8:process.versions.v8,mode:'trusted-local-code',instructionBudget:null},
    sourceInventory:sources,sourceSha256:digest(sources),input:{scenario,tuning,loadouts},contentSha256:digest({scenario,tuning,loadouts}),
    packets:session.packets,evidence,result:structuredClone(battle.result),ranked:false,
    notes:'Fixture proof only; no sandbox, model comparison, or special-command parity. Packet resimulation checked full state, RNG, every shot/log and round state.' };
  const recording = { meta:{version:3,name:scenario.name,seed,scenario,terrain:[],eventGeometry:'resolution-v1',geometryRules:GEOMETRY_RULESET,
    factions:{A:'EAR',B:'EAR'},tuning:{map:{shape:'rect',widthHexes:72,heightHexes:40},roundsPerTurn:battle.rounds},
    captains:{controllerIds,contract:OBSERVATION_VERSION,ranked:false}},rounds,shots,log,result:structuredClone(battle.result) };
  return { audit,recording };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outIndex=process.argv.indexOf('--out'), out=outIndex>=0 ? resolve(process.argv[outIndex+1]) : null;
  if(out && (relative(root,out).startsWith('..') || relative(root,out)==='')) throw new Error('Output must be a workspace child directory');
  const results=[];
  for(let i=1;i<=4;i++)for(const reverse of [false,true]) {
    const {audit,recording}=runTrial(`captains-c01-${i}`,reverse);
    results.push({seed:audit.input.scenario.seed,reverse,turns:audit.result.turns,victor:audit.result.victor,verifiedTurns:audit.evidence.length,
      faults:audit.packets.reduce((n,p)=>n+p.decisions.A.faults.length+p.decisions.B.faults.length,0)});
    if(out){mkdirSync(out,{recursive:true});const base=`pilot-${i}-${reverse?'BA':'AB'}`;
      writeFileSync(join(out,base+'-audit.json'),JSON.stringify(audit,null,2)+'\n',{flag:'wx'});
      writeFileSync(join(out,base+'-replay.json'),JSON.stringify(recording,null,2)+'\n',{flag:'wx'});}
  }
  const summary={ranked:false,matches:results.length,combatExecutions:results.length*2,results};
  if(out)writeFileSync(join(out,'trial-summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(summary,null,2));
}
