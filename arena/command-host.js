// Trusted setup host for Fleet Command. The page supplies known setup data,
// never receives this battle, and cannot change side after session creation.
import { createBattle } from '../src/tactical/resolver.js';
import { enableContacts } from '../src/tactical/contacts.js';
import { SENSING_PROFILE } from '../src/tactical/sensing.js';
import { bindPlayerSession } from '../src/captains/player-session.js';
import { jsonCopy, freezeTree } from '../src/captains/json.js';
import { validateScenario } from './editor-core.js';

export function createCommandSession(input, tuning, loadouts) {
  const setup=jsonCopy(input,{bytes:8*1024*1024,depth:40,nodes:200000});
  if(!setup||Object.keys(setup).sort().join(',')!=='mode,scenario,side'||
    !['quick','bundled','authored'].includes(setup.mode)||!['A','B'].includes(setup.side))throw new Error('Invalid command setup');
  const s=setup.scenario;
  if(!s||!Number.isInteger(s.map?.widthHexes)||!Number.isInteger(s.map?.heightHexes)||
    s.map.widthHexes<1||s.map.widthHexes>240||s.map.heightHexes<1||s.map.heightHexes>160)throw new Error('Command maps must be whole hexes, up to 240 × 160');
  if(!Array.isArray(s.sides)||s.sides.length!==2||s.sides.some(side=>!Array.isArray(side.ships)||side.ships.length>128))throw new Error('Command requires two sides of at most 128 ships each');
  if((s.terrain?.length??0)>4096||(s.maxTurns??1)>500)throw new Error('Command setup exceeds the terrain or turn limit');
  if(s.startDistanceHexes!==undefined&&(!Number.isInteger(s.startDistanceHexes)||s.startDistanceHexes<1||s.startDistanceHexes>240))throw new Error('Invalid deployment gap');
  const local=structuredClone(tuning);
  if(s.startDistanceHexes!==undefined)local.battle.startDistanceHexes=s.startDistanceHexes;
  const fleetFloorPolicy=setup.mode==='quick'?'strict':'warn';
  const errors=validateScenario(s,local,loadouts,{fleetFloorPolicy});
  if(errors.length)throw new Error(errors.join(' '));
  const battle=createBattle(s,local,structuredClone(loadouts),String(s.seed??'orion'),{fleetFloorPolicy});
  enableContacts(battle,{profile:SENSING_PROFILE});
  const session=bindPlayerSession(battle,setup.side);
  const text=(value,max=1500)=>typeof value==='string'?value.slice(0,max):'';
  const mission=freezeTree({name:text(s.name,120)||'Fleet engagement',side:setup.side,
    faction:s.sides[setup.side==='A'?0:1].faction,
    objective:text(s.victory?.text)||'Destroy the opposing fleet. At the turn limit, surviving points decide the result.',
    ownProtectedClass:s.victory?.type==='flagship'?s.victory.protectedClass[setup.side]:null,
    // Briefing and warnings are authored setup information, not live enemy status.
    briefing:Array.isArray(s.tutorial?.steps)?s.tutorial.steps.slice(0,12).map(step=>text(step)):[],
    warnings:[...(battle.warnings||[])],fleetFloorPolicy});
  return Object.freeze({session,mission});
}
