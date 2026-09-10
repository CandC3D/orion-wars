// Source-root-parameterized C1a acceptance. Real built ships, independent range
// and grazing fixtures, no balance or rendered-player-parity claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const index = process.argv.indexOf('--source');
const root = index < 0 ? fileURLToPath(new URL('../', import.meta.url)) : path.resolve(process.argv[index + 1]);
const mod = p => import(pathToFileURL(path.join(root, p)));
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const { buildShip } = await mod('src/tactical/ship.js');
const E = await mod('src/tactical/resolver.js');
const C = await mod('src/tactical/contacts.js');
const S = await mod('src/tactical/sensing.js');
const O = await mod('src/captains/observation.js');
const T = await mod('src/captains/trusted.js');
const { makePrng } = await mod('src/prng.js');
const { allHoldOrders, validateOrders } = await mod('src/captains/orders.js');
const baseTuning = read('data/tactical-tuning.json'), baseLoadouts = read('data/loadouts.json');
const clone = structuredClone, snapshot = x => JSON.stringify(x);
const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
const rotate = ({ q, r }) => ({ q: -r, r: q + r });
const shift = (p, by) => ({ q: p.q + by.q, r: p.r + by.r });
let assertions = 0, groups = 0;
const equal = (a, b, label) => { assertions++; assert.deepEqual(a, b, label); };
const throws = (fn, pattern) => { assertions++; assert.throws(fn, pattern); };
function check(name, fn) { fn(); groups++; console.log(`ok: ${name}`); }
function world({ rating = 1, targetPos = { q: 10, r: 0 }, finite = true } = {}) {
  const tuning = clone(baseTuning), loadouts = clone(baseLoadouts), rng = makePrng(812);
  const a = buildShip('A-observer', 'EAR', 'destroyer', tuning, loadouts, rng);
  const b = buildShip('B-target', 'KRE', 'destroyer', tuning, loadouts, rng);
  a.pos = { q: 0, r: 0 }; a.facing = 0; a.hull.sensorRating = rating;
  b.pos = targetPos; b.facing = 3;
  const battle = E.createBattleFromFleets([[a], [b]], tuning, rng, { maxTurns: 2, terrain: [] });
  if (finite) C.enableContacts(battle, { profile: S.SENSING_PROFILE });
  return { battle, a, b, tuning, loadouts };
}
function companion(w, id, rating, pos = { q: 0, r: 0 }, side = 'A') {
  const ship = buildShip(id, 'EAR', 'destroyer', w.tuning, w.loadouts, makePrng(7));
  ship.side = side; ship.hull.sensorRating = rating; ship.pos = pos;
  w.battle[side].push(ship); return ship;
}
const contacts = w => C.sideContacts(w.battle, 'A');
const terrain = (w, list) => { w.battle.terrain = list; w.tuning.battle.terrain = list; };

check('approved table, all 29 stock designs, pinned copy and atomic profile validation', () => {
  equal(S.DEFAULT_SENSING_PROFILE.passiveRadiusHexes, { 0: 0, 1: 18, 2: 26, 3: 34, 4: 42, 5: 50 });
  let count = 0;
  for (const [faction, roster] of Object.entries(baseTuning.rosters).filter(([, r]) => Array.isArray(r)))
    for (const type of roster) {
      const ship = buildShip(`stock-${count}`, faction, type, baseTuning, baseLoadouts, makePrng(2));
      equal(S.validateSensingProfile(S.DEFAULT_SENSING_PROFILE, [ship]).id, S.SENSING_PROFILE); count++;
    }
  equal(count, 29);
  const w = world({ finite: false }), profile = clone(S.DEFAULT_SENSING_PROFILE);
  C.enableContacts(w.battle, { profile: S.SENSING_PROFILE, sensing: profile });
  profile.passiveRadiusHexes[1] = 200;
  equal(w.battle.contacts.sensing.passiveRadiusHexes[1], 18);
  throws(() => { w.battle.contacts.sensing.passiveRadiusHexes[1] = 200; }, /read only/);
  throws(() => { w.battle.contacts.sensing = profile; }, /read only/);
  const before = snapshot(w.battle);
  const reordered = { passiveRadiusHexes: clone(S.DEFAULT_SENSING_PROFILE.passiveRadiusHexes), id: S.SENSING_PROFILE };
  C.enableContacts(w.battle, { profile: S.SENSING_PROFILE, sensing: reordered });
  equal(snapshot(w.battle), before, 'same content with reordered keys does not change identity');
  throws(() => C.enableContacts(w.battle, { profile: C.CONTACT_PROFILE }), /replaced/);
  throws(() => C.enableContacts(w.battle, { profile: S.SENSING_PROFILE, sensing: profile }), /replaced/);
  const invalid = [null, {}, { id: 'bogus' }, { ...clone(S.DEFAULT_SENSING_PROFILE), extra: 1 },
    { id: S.SENSING_PROFILE, passiveRadiusHexes: [0,18,26,34,42,50] }];
  for (const value of [-1, 0, 1.5, Infinity, NaN, '18', undefined]) {
    const p = clone(S.DEFAULT_SENSING_PROFILE); p.passiveRadiusHexes[1] = value; invalid.push(p);
  }
  for (const r of [0, 1, 2, 3, 4, 5]) {
    const p = clone(S.DEFAULT_SENSING_PROFILE); delete p.passiveRadiusHexes[r]; invalid.push(p);
  }
  for (const p of invalid) {
    const x = world({ finite: false }), unchanged = snapshot(x.battle);
    throws(() => C.enableContacts(x.battle, { profile: S.SENSING_PROFILE, sensing: p }), /sensing|radii/);
    equal(snapshot(x.battle), unchanged);
  }
  for (const rating of [undefined, -1, 0.5, 6, '2', NaN]) {
    const x = world({ finite: false }); x.a.hull.sensorRating = rating; const unchanged = snapshot(x.battle);
    throws(() => C.enableContacts(x.battle, { profile: S.SENSING_PROFILE }), /rating/);
    equal(snapshot(x.battle), unchanged);
  }
  for (const profile of ['', null, 'unknown']) throws(() => C.enableContacts(world().battle, { profile }), /Unknown/);
});

check('radius equality, just outside, omnidirectional translation/rotation and target heading independence', () => {
  // Enumerate each ring independently in cube coordinates, not engine distance.
  for (let rating = 1; rating <= 5; rating++) {
    const w = world({ rating }), radius = 10 + 8 * rating;
    for (const ring of [radius - 1, radius, radius + 1]) {
      for (let q = -ring; q <= ring; q++) for (let r = -ring; r <= ring; r++) {
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q-r)) !== ring) continue;
        w.a.pos = { q: -17, r: 11 }; w.b.pos = { q: q - 17, r: r + 11 };
        equal(!!S.observerSupport(w.battle, w.a, w.b), ring <= radius);
      }
    }
    for (let heading = 0; heading < 6; heading++) {
      w.a.facing = heading; w.b.facing = (heading + 2) % 6;
      w.a.pos = { q: 0, r: 0 }; w.b.pos = { q: radius, r: 0 };
      equal(contacts(w).length, 1);
      for (let rot = 0; rot < 6; rot++) {
        w.b.pos = rotate(w.b.pos); equal(contacts(w).length, 1);
      }
    }
  }
});

check('disabled and zero sensors cannot originate even same-hex contacts; ownership enforced', () => {
  const w = world({ rating: 0, targetPos: { q: 0, r: 0 } });
  equal(contacts(w), []);
  w.a.hull.sensorRating = 2; equal(contacts(w).length, 1);
  w.a.systems.sensors = w.tuning.damage.systemHitsToInoperative; equal(contacts(w), []);
  w.a.systems.sensors = 0; w.a.destroyed = true; equal(contacts(w), []);
  w.a.destroyed = false; w.b.destroyed = true; equal(contacts(w), []);
  w.b.destroyed = false;
  equal(S.observerSupport(w.battle, clone(w.a), w.b), null, 'detached observer cannot report');
  equal(S.observerSupport(w.battle, w.a, clone(w.b)), null, 'detached target cannot report');
  equal(S.observerSupport(w.battle, w.a, w.a), null);
  throws(() => C.sideContacts(w.battle, 'C'), /side/);
  for (const mutate of [x => { x.b.id = x.a.id; }, x => { x.a.id = 'constructor'; }, x => { x.a.side = 'B'; }]) {
    const x = world({ finite: false }); mutate(x); const before = snapshot(x.battle);
    throws(() => C.enableContacts(x.battle, { profile: S.SENSING_PROFILE }), /unique/);
    equal(snapshot(x.battle), before);
  }
});

check('quality is per contact, not side-wide; damage downgrades, multiple observers, detached immutable output', () => {
  const w = world({ rating: 1 }); w.b.superstructure = w.b.superstructureMax * 0.43;
  const far = companion(w, 'A-distant', 3, { q: 45, r: 0 });
  equal(contacts(w)[0].observedDamage, { detail: 'condition', condition: 'damaged' });
  far.pos.q = 44; equal(contacts(w)[0].observedDamage, { detail: 'interval', remainingFraction: { min: 0.4, max: 0.5 } });
  const mid = companion(w, 'A-middle', 2);
  far.systems.sensors = w.tuning.damage.systemHitsToInoperative;
  equal(contacts(w)[0].observedDamage, { detail: 'bracket', condition: 'heavily-damaged' });
  equal(contacts(w)[0].observers.map(o => o.observerId), ['A-middle', 'A-observer']);
  const old = contacts(w); mid.destroyed = true; w.b.pos.q++;
  equal(contacts(w)[0].observedDamage.detail, 'condition');
  equal(old[0].pos.q, 10); equal(Object.isFrozen(old[0].observers[0]), true);
  throws(() => { old[0].pos.q = 999; }, /read only/);
  w.a.destroyed = true; equal(contacts(w), []);
});

check('bodies and all seven planet cells cast shadows; blocking fields include endpoints', () => {
  for (const type of ['moon', 'asteroid', 'planet']) {
    const w = world({ targetPos: { q: 6, r: 0 } });
    terrain(w, [{ type, q: 3, r: 0 }]); equal(contacts(w), []);
  }
  const neighbors = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];
  for (const offset of neighbors) {
    const w = world({ targetPos: { q: 6, r: 0 } });
    terrain(w, [{ type: 'planet', q: 3-offset.q, r: -offset.r }]); equal(contacts(w), []);
  }
  for (const q of [0, 3, 6]) {
    const w = world({ targetPos: { q: 6, r: 0 } });
    terrain(w, [{ type: 'asteroids', q, r: 0 }]); equal(contacts(w), []);
    w.tuning.battle.terrainRules.asteroids.blocksFire = false; equal(contacts(w).length, 1);
    terrain(w, [{ type: 'moon', q, r: 0 }]); equal(contacts(w), []);
  }
});

check('either grazing cell blocks, independent of ray direction, rotation and translation', () => {
  // Midpoint (1,-0.5) between (0,0) and (2,-1) grazes (1,0)/(1,-1).
  for (const type of ['moon', 'asteroids']) for (const blocker of [{ q: 1, r: 0 }, { q: 1, r: -1 }]) {
    let end = { q: 2, r: -1 }, cell = blocker;
    for (let rot = 0; rot < 6; rot++) {
      for (const offset of [{ q: 0, r: 0 }, { q: -19, r: 23 }]) {
        const w = world(); w.a.pos = offset; w.b.pos = shift(end, offset);
        terrain(w, [{ type, ...shift(cell, offset) }]); equal(contacts(w), []);
        [w.a.pos, w.b.pos] = [w.b.pos, w.a.pos]; equal(contacts(w), []);
      }
      end = rotate(end); cell = rotate(cell);
    }
  }
});

check('nebula first cell and three-hex limits, including intentional inside/outside asymmetry', () => {
  const w = world({ targetPos: { q: 3, r: 0 } });
  terrain(w, [{ type: 'nebula', q: 3, r: 0 }]); equal(contacts(w).length, 1);
  w.b.pos.q = 4; terrain(w, [{ type: 'nebula', q: 4, r: 0 }]); equal(contacts(w), []);
  w.b.pos.q = 3; terrain(w, [{ type: 'nebula', q: 2, r: 0 }, { type: 'nebula', q: 3, r: 0 }]); equal(contacts(w), []);
  equal(S.observerSupport(w.battle, w.b, w.a)?.kind, 'passive', 'inside can see out at three hexes');
  terrain(w, [{ type: 'nebula', q: 2, r: 0 }]); equal(contacts(w), [], 'neither endpoint in fog, but path crosses fog');
  terrain(w, []); equal(contacts(w).length, 1);
});

check('scan locks belong to actual acquiring observers; no global detected shortcut or lock transfer', () => {
  const w = world({ rating: 2, targetPos: { q: 6, r: 0 } }); w.b.cloaked = true; w.b.detected = true;
  const buddy = companion(w, 'A-buddy', 3);
  equal(contacts(w), []);
  equal(S.acquireScanLock(w.battle, w.a, w.b, 5), false);
  equal(C.grantScanContact(w.battle, w.a, w.b, 2), true);
  equal(contacts(w)[0].observers, [{ observerId: w.a.id, rating: 2, kind: 'scan' }]);
  equal(S.acquireScanLock(w.battle, w.a, w.b, 2), true);
  equal(w.battle.contacts.locks.A.length, 1, 'repeat scan does not duplicate lock');
  w.a.destroyed = true;
  const before = snapshot(w.battle); equal(contacts(w), []); equal(snapshot(w.battle), before, 'query does not prune');
  equal(S.pruneScanLocks(w.battle), [{ side: 'A', observerId: w.a.id, targetId: w.b.id }]);
  w.a.destroyed = false; equal(contacts(w), [], 'restoring an observer does not restore a revoked lock');
  equal(S.acquireScanLock(w.battle, buddy, w.b, 2), true);
  equal(contacts(w)[0].observedDamage.detail, 'interval');
  C.grantScanContact(w.battle, w.a, w.b, 2); buddy.destroyed = true;
  equal(contacts(w)[0].observedDamage.detail, 'bracket');
  C.loseContact(w.battle, w.b); equal(contacts(w), [], 'evasion revokes all contributions');
  throws(() => S.acquireScanLock(w.battle, w.a, w.b, 0), /face/);
});

check('scan support revokes on range, damage, shadow, removal and uncloaking; reacquisition is explicit', () => {
  const mutations = [
    w => { w.a.pos = { q: -100, r: 0 }; },
    w => { w.a.systems.sensors = w.tuning.damage.systemHitsToInoperative; },
    w => { terrain(w, [{ type: 'moon', q: 3, r: 0 }]); },
    w => { w.battle.A.splice(0, 1); },
    w => { w.b.destroyed = true; },
    w => { w.b.cloaked = false; }
  ];
  for (const mutate of mutations) {
    const w = world({ rating: 2, targetPos: { q: 6, r: 0 } }); w.b.cloaked = true;
    equal(S.acquireScanLock(w.battle, w.a, w.b, 2), true); mutate(w);
    if (w.b.cloaked) equal(contacts(w), []);
    equal(S.pruneScanLocks(w.battle).length, 1); equal(w.battle.contacts.locks.A, []);
  }
  const w = world({ rating: 2, targetPos: { q: 100, r: 0 } }); w.b.cloaked = true;
  equal(S.acquireScanLock(w.battle, w.a, w.b, 2), false);
  w.b.pos.q = 6; w.a.hull.sensorRating = 1; equal(S.acquireScanLock(w.battle, w.a, w.b, 2), false);
  w.a.hull.sensorRating = 2; terrain(w, [{ type: 'nebula', q: 6, r: 0 }]);
  equal(S.acquireScanLock(w.battle, w.a, w.b, 2), false);
});

check('active command-range/signature rules preserved, but ordinary passive signals ignore signature bonus', () => {
  const w = world({ rating: 2 }); const base = w.tuning.cloak.detectionRangeHexes;
  w.b.cloaked = true; w.b.detectionBonusAgainst = 2; w.b.pos.q = base + 3;
  equal(S.acquireScanLock(w.battle, w.a, w.b, 2), false);
  const command = companion(w, 'A-command', 3); command.hull.commandRadius = 4; command.hull.commandDetectionBonus = 1;
  equal(S.acquireScanLock(w.battle, w.a, w.b, 2), true);
  command.destroyed = true; equal(contacts(w), []); equal(S.pruneScanLocks(w.battle).length, 1);
  w.b.cloaked = false; w.b.pos.q = 26; w.b.detectionBonusAgainst = -100;
  equal(contacts(w).length, 1); w.b.pos.q = 27; w.b.detectionBonusAgainst = 100;
  equal(contacts(w), []);
});

check('hidden-state differential worlds; strict allowlist, frozen queries, deterministic ordering and no RNG', () => {
  const w = world({ rating: 1, targetPos: { q: 50, r: 0 } });
  const first = snapshot(O.sideView(w.battle, 'A'));
  const mutations = [b => { b.pos = { q: -80, r: 5 }; }, b => { b.facing = 5; }, b => { b.power = 0; },
    b => { b.reserve = 123; }, b => { b.magazine = 999; }, b => { b.systems.sensors = 9; },
    b => { b.shieldDown[2] = true; }, b => { b.cores[0].alive = false; }, b => { b.mounts = []; },
    b => { b.spinal = { state: 'ready', charge: 999 }; }, b => { b.squadrons = [{ strength: 999 }]; },
    b => { b.design = { secret: 'private-pack' }; }, b => { b.displayName = 'secret-name'; },
    b => { b.hull.sensorRating = 5; }, b => { b.superstructure = 1; }, b => { b.detected = true; }];
  for (const mutate of mutations) { mutate(w.b); equal(snapshot(O.sideView(w.battle, 'A')), first); }
  w.b.pos = { q: 6, r: 0 };
  const view = O.sideView(w.battle, 'A');
  equal(Object.keys(view.contacts[0]).sort(), ['className','facing','faction','id','observedDamage','observers','pos']);   // unnamed fleet
  for (const named of [false,true]) {
    const wreckWorld=world(),victim=wreckWorld.b,battle=wreckWorld.battle;
    if(named)victim.vesselName={full:'ISS Remembered'};
    victim.superstructure=1;victim.power=0;
    wreckWorld.tuning.pointDefence.maxChance=0;wreckWorld.tuning.screening.maxChance=0;wreckWorld.tuning.explosion.enabled=false;
    battle.inFlight.push({side:'A',shooterId:wreckWorld.a.id,shooterPos:{...wreckWorld.a.pos},targetId:victim.id,damage:100000,spread:0});
    E.stepTurn(battle);
    const wreck=O.sideView(battle,'A').contacts[0];
    equal(Object.keys(wreck).sort(),['className','destroyed','facing','faction','id','pos',...(named?['vesselName']:[]),'wreckedTurn'].sort());
    equal(wreck.destroyed,true);equal(wreck.wreckedTurn,1);
    equal(O.sideView(battle,'B').own[0].wreckedTurn,1);
  }
  equal(view.contract, O.SENSING_OBSERVATION_VERSION); equal(view.sensing, S.DEFAULT_SENSING_PROFILE);
  equal(view.execution, 'engine-proof');
  equal(snapshot(view).includes('private-pack'), false); equal(snapshot(view).includes('secret-name'), false);
  const other = companion(w, 'B-second', 1, { q: 7, r: 0 }, 'B');
  other.superstructure = other.superstructureMax * 0.3;
  const sorted = snapshot(C.sideContacts(w.battle, 'A')); w.battle.B.reverse();
  equal(snapshot(C.sideContacts(w.battle, 'A')), sorted);
  const before = snapshot(w.battle); freeze(w.battle);
  for (let i = 0; i < 5; i++) { O.sideView(w.battle, 'B'); O.sideView(w.battle, 'A'); }
  equal(snapshot(w.battle), before);
});

check('restricted target validation and incoming warnings; omniscient preview still blocked', () => {
  const w = world();
  w.battle.inFlight.push({ targetId: w.a.id, shooterId: 'secret-launcher', shooterPos: { q: 300, r: 0 }, weapon: 'secret', flight: { pos: { q: 9, r: 0, d: 1 } } });
  const view = O.sideView(w.battle, 'A'), order = allHoldOrders(view);
  equal(view.incoming, [{ targetId: w.a.id, arrival: 'before-next-refill' }]);
  order[w.a.id].target = w.b.id; equal(validateOrders(view, order).ok, true);
  w.b.pos.q = 80; equal(validateOrders(O.sideView(w.battle, 'A'), order).ok, false);
  let calls = 0; const controller = v => { calls++; return { orders: allHoldOrders(v), memory: null }; };
  const before = snapshot(w.battle);
  throws(() => E.previewOrders(w.battle, w.a.id, order[w.a.id]), /observation-derived/);
  throws(() => T.executePacket(w.battle, { turn: 1 }), /Corrupt/);
  const session = { battle: w.battle, controllers: { A: controller, B: controller }, memory: { A: null, B: null }, packets: [] };
  equal(snapshot(w.battle), before); equal(calls, 0); equal(session.packets, []); equal(session.memory, { A: null, B: null });
});

check('legacy profile remains map-wide and executable, unchanged observation version and structure', () => {
  const w = world({ finite: false, targetPos: { q: 50, r: 0 } }); C.enableContacts(w.battle);
  const view = O.sideView(w.battle, 'A'); equal(view.contacts.length, 1);
  equal(view.contract, 'captain-observation/2'); equal(view.contactProfile, 'signals-and-scans/1');
  equal(Object.hasOwn(view, 'sensing'), false); equal(Object.hasOwn(view, 'execution'), false);
  equal(Object.hasOwn(view.contacts[0], 'observers'), false);
  E.stepTurn(w.battle, { ...allHoldOrders(view), ...allHoldOrders(O.sideView(w.battle, 'B')) });
  equal(w.battle.turnsRun, 1);
});
console.log(JSON.stringify({ suite: 'C1a acquisition foundation', groups, assertions, source: root,
  execution: 'Host-only C1b engine proof; default game, human presentation and independent C1 acceptance unchanged' }, null, 2));
