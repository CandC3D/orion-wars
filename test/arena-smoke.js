// Dependency-free DOM/canvas smoke test for the static battle arena.
// Advances every round in all bundled shot-enabled replays and verifies that
// the distinct beam, missile, warp-cut, and motion-trail renderers execute,
// that the landscape rectangle of hexes is drawn and bounded correctly, that
// the playtest icons are the default marker and stay inside their hex (with
// co-located ships nudged apart), and that both new mechanics -- the photonic
// cannon and the carrier air group -- render from the replay's log lines.
// Also checks deployment frames and compatibility with a pre-round-0 replay.

import { mkdtempSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import {
  FACTIONS, TERRAIN_TYPES, asteroidFieldRocks, blockingTerrainHexSet, compositionFor, fleetPoints, inMap,
  largeAsteroidOutline, nebulaOutline, rosterFor, snapWorldToHex, terrainBlocksShips, terrainFootprint, validateScenario
} from "../arena/editor-core.js";
import { recordScenario } from "../arena/record.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "arena", "arena.js"), "utf8");
const tuning = JSON.parse(readFileSync(join(root, "data", "tactical-tuning.json"), "utf8"));
const loadouts = JSON.parse(readFileSync(join(root, "data", "loadouts.json"), "utf8"));
const sampleScenario = JSON.parse(readFileSync(join(root, "arena", "scenarios", "twin-moons.json"), "utf8"));
const iconManifest = JSON.parse(readFileSync(join(root, "assets", "icons", "manifest.json"), "utf8"));
const spriteManifest = JSON.parse(readFileSync(join(root, "arena", "sprites", "manifest.json"), "utf8"));
const replayFiles = [
  join(root, "arena", "replay.json"),
  join(root, "arena", "replays", "ear-kre-24.json"),
  join(root, "arena", "replays", "vra-zan-32.json"),
  join(root, "arena", "replays", "ear-kre-32.json")
];
const shotEffectKeys = ["laser", "blaster", "neutronic", "plasma", "intercept", "evade", "shieldFlash"];

class ElementStub {
  constructor(id = "") {
    this.id = id;
    this.hidden = false;
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.max = "";
    this.style = {};
    this.dataset = {};
    this.listeners = new Map();
    this.classes = new Set();
    this.attributes = new Map();
    this.classList = { add: (name) => this.classes.add(name), remove: (name) => this.classes.delete(name) };
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  dispatch(type, extra = {}) {
    this.listeners.get(type)?.({ target: this, preventDefault() {}, ...extra });
  }
  replaceChildren() {}
  append() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 640 }; }
}

// A canvas stub that keeps just enough of the transform stack to know where
// each drawImage() actually landed, which is what the one-ship-one-hex and
// same-hex-offset rules are asserted against.
function makeContext(counts, draws) {
  const stack = [];
  const ctx = {
    fillStyle: "", strokeStyle: "", shadowColor: "", shadowBlur: 0,
    lineWidth: 1, lineCap: "butt", globalAlpha: 1, filter: "none",
    tx: 0, ty: 0,
    save() {
      stack.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, shadowColor: this.shadowColor,
        shadowBlur: this.shadowBlur, lineWidth: this.lineWidth, lineCap: this.lineCap,
        globalAlpha: this.globalAlpha, filter: this.filter, tx: this.tx, ty: this.ty });
    },
    restore() { Object.assign(this, stack.pop() || {}); },
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {},
    translate(x, y) { this.tx += x; this.ty += y; },
    rotate() {}, setTransform() { this.tx = 0; this.ty = 0; }, clearRect() {}, fillRect() {},
    drawImage(image, x, y, w) { draws.push({ key: image?.key, x: this.tx, y: this.ty, box: w }); },
    stroke() {
      if (this.strokeStyle === "#bfeaff" || this.strokeStyle === "#ffffff") counts.laser++;
      if (this.strokeStyle === "#ff7848" || this.strokeStyle === "#ff512f") counts.blaster++;
      if (this.strokeStyle === "#ffd36a" || this.strokeStyle === "#56ffd0") counts.intercept++;
      if (this.strokeStyle === "rgba(152,255,229,.75)") counts.evade++;
      if (this.strokeStyle === "#72f7cf") counts.warp++;
      if (this.strokeStyle === "rgba(116,210,190,.42)") counts.trail++;
      if (this.strokeStyle === "#c9a6ff" || this.strokeStyle === "#fdfbff") counts.spinalBolt++;
      if (this.strokeStyle === "rgba(228, 194, 117, .24)") counts.boundary++;
      if (this.strokeStyle === "rgba(130, 161, 181, .105)") counts.grid++;
    },
    fill() {
      const stops = this.fillStyle?.stops || [];
      if (stops.some(([, color]) => color.includes("255,206,91"))) counts.neutronic++;
      if (stops.some(([, color]) => color.includes("46,235,174"))) counts.plasma++;
      if (stops.some(([, color]) => color.includes("78,206,255"))) counts.shieldFlash++;
      if (stops.some(([, color]) => color.includes("163,120,255"))) counts.spinalGlow++;
      if (stops.some(([, color]) => color.includes("255,176,84"))) counts.strikeImpact++;
      if (stops.some(([, color]) => color.includes("244,247,248"))) counts.moon++;
      if (stops.some(([, color]) => color.includes("255,241,201"))) counts.planet++;
    },
    createRadialGradient() {
      return { stops: [], addColorStop(offset, color) { this.stops.push([offset, color]); } };
    }
  };
  return ctx;
}

const BLANK = () => ({
  laser: 0, blaster: 0, neutronic: 0, plasma: 0, intercept: 0, evade: 0, shieldFlash: 0,
  warp: 0, trail: 0, spinalBolt: 0, spinalGlow: 0, strikeImpact: 0, grid: 0, boundary: 0,
  moon: 0, planet: 0
});

async function runReplay(replay, { legacy = false, icons = true, mode = null } = {}) {
  const counts = BLANK();
  const draws = [];
  const elements = new Map();
  const get = (selector) => {
    const id = selector.startsWith("#") ? selector.slice(1) : selector;
    if (!elements.has(id)) elements.set(id, new ElementStub(id));
    return elements.get(id);
  };
  const canvas = get("#arena-canvas");
  const context2d = makeContext(counts, draws);
  canvas.getContext = () => context2d;
  canvas.width = 0;
  canvas.height = 0;
  const document = {
    querySelector: get,
    querySelectorAll: () => [],
    createElement: () => new ElementStub()
  };
  const window = { devicePixelRatio: 1, addEventListener() {} };
  let clock = 0;
  let nextFrame = null;
  // Images resolve on the microtask queue, exactly as a decoded <img> would.
  class ImageStub {
    constructor() { this.handlers = new Map(); }
    addEventListener(type, callback) { this.handlers.set(type, callback); }
    set src(value) {
      this.key = value;
      Promise.resolve().then(() => this.handlers.get(icons ? "load" : "error")?.());
    }
  }
  const context = vm.createContext({
    console, document, window,
    performance: { now: () => clock },
    requestAnimationFrame(callback) { nextFrame = callback; },
    fetch: async (url) => {
      if (url.includes("assets/icons/manifest.json")) return icons ? { ok: true, json: async () => iconManifest } : { ok: false };
      if (url.includes("sprites/manifest.json")) return { ok: true, json: async () => spriteManifest };
      if (url.includes("manifest")) return { ok: false };
      return { ok: true, json: async () => replay };
    },
    FileReader: class {}, Image: ImageStub,
    setTimeout, clearTimeout
  });
  new vm.Script(source, { filename: "arena/arena.js" }).runInContext(context);
  // Two macrotask turns: one for the replay fetch, one for the icon preloads.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (mode) window.__arena.setRenderMode(mode);
  const firstLabel = get("#round-label").textContent;
  // Count only what playback draws: the first frame lands before the icon
  // images have decoded, and legitimately draws nothing for that one frame.
  for (const key of Object.keys(window.__arena.state.rendered)) window.__arena.state.rendered[key] = 0;
  // Let the actual transport run continuously so each interval exercises its
  // movement phase followed by the snapshot-true firing phase.
  get("#play").dispatch("click");
  const frameLimit = replay.rounds.length * 14;
  for (let frame = 0; frame < frameLimit && window.__arena.state.playing; frame++) {
    clock += 100;
    const callback = nextFrame;
    nextFrame = null;
    callback?.(clock);
  }
  assert(!window.__arena.state.playing, "replay transport did not reach its final round");
  if (legacy && shotEffectKeys.some((key) => counts[key])) throw new Error("Legacy replay unexpectedly rendered shot effects");
  return { counts, draws, firstLabel, arena: window.__arena, elements };
}

function hexDistance(a, b) {
  const dq = b.q - a.q, dr = b.r - a.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

const assert = (condition, message) => { if (!condition) throw new Error(message); };

// -------------------------------------------- editor core and shared recorder

{
  const footprint = terrainFootprint({ type: "planet", q: 3, r: -2 });
  assert(footprint.length === 7 && new Set(footprint.map((hex) => `${hex.q},${hex.r}`)).size === 7,
    "planet footprint is not a seven-hex rosette");
  assert(terrainFootprint({ type: "moon", q: 3, r: -2 }).length === 1, "moon footprint is not one hex");
  assert(terrainFootprint({ type: "asteroid", q: 3, r: -2 }).length === 1, "large asteroid footprint is not one hex");
  assert(terrainFootprint({ type: "asteroids", q: 3, r: -2 }).length === 1, "asteroid field footprint is not one hex");
  assert(terrainFootprint({ type: "nebula", q: 3, r: -2 }).length === 1, "nebula footprint is not one hex");

  // Asteroid field and nebula (rulings 2026-09-02, docs/tactical-design.md
  // #26c, #26d): a ship MAY occupy or be dragged onto either, unlike moon,
  // planet and the large asteroid.
  assert(TERRAIN_TYPES.includes("asteroid") && TERRAIN_TYPES.includes("asteroids") && TERRAIN_TYPES.includes("nebula"),
    "editor-core does not recognize every terrain type");
  assert(terrainBlocksShips("moon") && terrainBlocksShips("planet") && terrainBlocksShips("asteroid") &&
    !terrainBlocksShips("asteroids") && !terrainBlocksShips("nebula"),
    "terrainBlocksShips disagrees with the engine's asteroid field/large asteroid/nebula ruling");
  assert(blockingTerrainHexSet([{ type: "asteroids", q: 2, r: 2 }]).size === 0,
    "an asteroid field was wrongly counted as blocking terrain");
  assert(blockingTerrainHexSet([{ type: "nebula", q: 2, r: 2 }]).size === 0,
    "a nebula hex was wrongly counted as blocking terrain");
  assert(blockingTerrainHexSet([{ type: "asteroid", q: 2, r: 2 }]).has("2,2"),
    "a large asteroid was not counted as blocking terrain");

  // Asteroid and nebula art is deterministic per hex (so it does not shimmer
  // between frames) and varies from one hex to the next.
  {
    const rocksA = asteroidFieldRocks(3, -7), rocksAgain = asteroidFieldRocks(3, -7), rocksOther = asteroidFieldRocks(4, -7);
    assert(rocksA.length >= 6 && rocksA.length <= 9, `asteroid field rock count ${rocksA.length} is out of the expected 6-9 range`);
    assert(JSON.stringify(rocksA) === JSON.stringify(rocksAgain), "asteroid field rock layout is not deterministic per hex");
    assert(JSON.stringify(rocksA) !== JSON.stringify(rocksOther), "asteroid field art does not vary between hexes");
    const outlineA = largeAsteroidOutline(3, -7), outlineAgain = largeAsteroidOutline(3, -7), outlineOther = largeAsteroidOutline(4, -7);
    assert(outlineA.length >= 9 && outlineA.length <= 12, `large asteroid outline has ${outlineA.length} vertices, expected 9-12`);
    assert(JSON.stringify(outlineA) === JSON.stringify(outlineAgain), "large asteroid outline is not deterministic per hex");
    assert(JSON.stringify(outlineA) !== JSON.stringify(outlineOther), "large asteroid art does not vary between hexes");
    const nebA = nebulaOutline(3, -7), nebAgain = nebulaOutline(3, -7), nebOther = nebulaOutline(4, -7);
    assert(nebA.length >= 10 && nebA.length <= 14, `nebula outline has ${nebA.length} vertices, expected 10-14`);
    assert(JSON.stringify(nebA) === JSON.stringify(nebAgain), "nebula outline is not deterministic per hex");
    assert(JSON.stringify(nebA) !== JSON.stringify(nebOther), "nebula art does not vary between hexes");
  }

  // Every roster class has an icon in assets/icons/manifest.json -- this is
  // what lets both the editor and the viewer drop the chevron/triangle
  // fallback for ship markers entirely.
  for (const faction of FACTIONS) {
    for (const className of rosterFor(faction, tuning)) {
      assert(iconManifest.icons[`${faction}/${className}`], `${faction}/${className} has no entry in the icon manifest`);
    }
  }
  for (const hex of [{ q: 0, r: 0 }, { q: -17, r: 8 }, { q: 12, r: -9 }, { q: 31, r: 5 }]) {
    const x = Math.sqrt(3) * (hex.q + hex.r / 2), y = 1.5 * hex.r;
    const snapped = snapWorldToHex(x + .08, y - .06);
    assert(snapped.q === hex.q && snapped.r === hex.r, `hex snapping missed ${hex.q},${hex.r}`);
  }
  assert(inMap(36, 0, sampleScenario.map) && !inMap(37, 0, sampleScenario.map), "editor map bounds disagree with the contract");
  // Re-priced point ladder (docs/tactical-design.md #27): dreadnought 32 +
  // light-cruiser 12 + destroyer 5 = 49; carrier 32 + strike-cruiser 8 +
  // heavy-cruiser 20 = 60.
  assert(fleetPoints(sampleScenario.sides[0], tuning) === 49, "side A points total is wrong");
  assert(fleetPoints(sampleScenario.sides[1], tuning) === 60, "side B points total is wrong");
  assert(validateScenario(sampleScenario, tuning, loadouts).length === 0, "sample scenario does not validate");

  // rosters.<faction> (data/tactical-tuning.json), not the keys of loadouts.json, is the
  // source of truth for which hulls a faction may field: loadouts.json lists only
  // faction-specific weapon fits, so it omits classes a faction fields on hull defaults.
  const earRoster = rosterFor("EAR", tuning);
  assert(earRoster.includes("frigate") && earRoster.includes("battleship"),
    "EAR roster is missing a common hull that has no faction-specific loadout entry");
  assert(!earRoster.includes("command-ship"), "EAR roster still offers the retired command-ship");
  const kreRoster = rosterFor("KRE", tuning);
  assert(kreRoster.includes("carrier") && kreRoster.includes("strike-cruiser"),
    "KRE roster is missing its unique hulls");
  assert(!kreRoster.includes("command-ship"), "KRE roster offers the retired command-ship");

  const invalid = JSON.parse(JSON.stringify(sampleScenario));
  invalid.sides[0].ships[0].q = 0; invalid.sides[0].ships[0].r = 0;
  invalid.sides[0].ships[0].facing = 9;
  invalid.sides[0].ships[1].className = "unknown-hull";
  invalid.sides[1].ships = [];
  const errors = validateScenario(invalid, tuning, loadouts).join(" | ");
  assert(errors.includes("on terrain"), "validation missed a ship on terrain");
  assert(errors.includes("unknown class"), "validation missed an unknown class");
  assert(errors.includes("Side 2 is empty"), "validation missed an empty side");
  assert(errors.includes("invalid facing"), "validation missed a bad facing value");

  // Asteroid field (rulings 2026-09-02): a ship placed in one must NOT be
  // reported as "on terrain" -- unlike every other terrain type, ships may
  // occupy or pass through it (docs/tactical-design.md #26c).
  const onField = JSON.parse(JSON.stringify(sampleScenario));
  onField.terrain.push({ type: "asteroids", q: onField.sides[0].ships[0].q, r: onField.sides[0].ships[0].r });
  const onFieldErrors = validateScenario(onField, tuning, loadouts);
  assert(onFieldErrors.length === 0, `a ship on an asteroid field wrongly failed validation: ${onFieldErrors.join(" | ")}`);

  // The large asteroid, unlike the field, blocks a ship the same as a moon.
  const onLargeAsteroid = JSON.parse(JSON.stringify(sampleScenario));
  onLargeAsteroid.terrain.push({ type: "asteroid", q: onLargeAsteroid.sides[0].ships[0].q, r: onLargeAsteroid.sides[0].ships[0].r });
  assert(validateScenario(onLargeAsteroid, tuning, loadouts).some((m) => m.includes("on terrain")),
    "validation did not flag a ship placed on a large asteroid");

  // Nebula (ruling 2026-09-02, docs/tactical-design.md #26d, the Mutara
  // rules): also passable, so a ship inside must not be flagged "on terrain".
  const onNebula = JSON.parse(JSON.stringify(sampleScenario));
  onNebula.terrain.push({ type: "nebula", q: onNebula.sides[0].ships[0].q, r: onNebula.sides[0].ships[0].r });
  const onNebulaErrors = validateScenario(onNebula, tuning, loadouts);
  assert(onNebulaErrors.length === 0, `a ship inside a nebula wrongly failed validation: ${onNebulaErrors.join(" | ")}`);

  // A hull that exists in hullClasses but is outside the faction's roster (the
  // retired command-ship, or another power's unique) must be rejected too, even
  // though loadouts.json has no entry for it either.
  const cannotField = JSON.parse(JSON.stringify(sampleScenario));
  cannotField.sides[1].ships[2].className = "command-ship";
  const cannotFieldErrors = validateScenario(cannotField, tuning, loadouts).join(" | ");
  assert(cannotFieldErrors.includes("cannot be fielded"), "validation let KRE field the retired command-ship");

  // hullClasses.<class>.limit caps how many of that class one fleet may field
  // (currently the big specials -- dreadnought, carrier, monitor -- at 1
  // apiece, docs/tactical-design.md #27). The sample scenario already fields
  // exactly one dreadnought (side A) and one carrier (side B), at their
  // limits, which is why it validates cleanly above; push a second
  // dreadnought onto side A to exercise the cap.
  assert(tuning.hullClasses.dreadnought?.limit === 1 && tuning.hullClasses.carrier?.limit === 1,
    "dreadnought/carrier no longer carry a fleet limit of 1 in tactical-tuning.json");
  const overLimit = JSON.parse(JSON.stringify(sampleScenario));
  overLimit.sides[0].ships.push({ className: "dreadnought" });
  const overLimitErrors = validateScenario(overLimit, tuning, loadouts).join(" | ");
  assert(overLimitErrors.includes("Side 1 fields 2 dreadnought(s); the limit is 1."),
    "validation did not enforce the per-class fleet limit");
  // A class with no `limit` in tuning is uncapped, same as before.
  const manyFrigates = JSON.parse(JSON.stringify(sampleScenario));
  for (let i = 0; i < 5; i++) manyFrigates.sides[0].ships.push({ className: "frigate" });
  assert(!validateScenario(manyFrigates, tuning, loadouts).some((m) => m.includes("frigate")),
    "a hull class with no configured limit was wrongly capped");

  // arena/editor.js disables a class's add button for a side once its limit
  // is reached, reading the same compositionFor() + hullClasses.<class>.limit
  // pairing checked here -- this is that logic exercised without a DOM.
  const dnLimit = tuning.hullClasses.dreadnought.limit;
  const sideAComposition = compositionFor(sampleScenario.sides[0]);
  assert((sideAComposition.dreadnought || 0) >= dnLimit,
    "side A should already be at its dreadnought limit (button should disable)");
  const sideBComposition = compositionFor(sampleScenario.sides[1]);
  assert((sideBComposition.dreadnought || 0) < dnLimit,
    "side B fields no dreadnought and should be under the limit (button should stay enabled)");

  const sharedReplay = recordScenario(sampleScenario, tuning, loadouts);
  const scratch = mkdtempSync(join(tmpdir(), "orion-arena-smoke-"));
  const cliReplayPath = join(scratch, "twin-moons.json");
  execFileSync(process.execPath, [join(root, "test", "record-battle.js"), "--scenario",
    join(root, "arena", "scenarios", "twin-moons.json"), "--out", cliReplayPath], { cwd: root });
  const cliBytes = readFileSync(cliReplayPath, "utf8");
  assert(cliBytes === JSON.stringify(sharedReplay, null, 2) + "\n",
    "browser/shared recorder output is not byte-identical to record-battle.js --scenario");
}

// ---------------------------------------------------------------- replays

const replays = replayFiles.map((file) => ({ file, replay: JSON.parse(readFileSync(file, "utf8")) }));

for (const { file, replay } of replays) {
  const deployment = replay.rounds[0];
  assert(deployment?.turn === 0 && deployment?.round === 0, `${file} does not start with a round-0 deployment frame`);
  const next = replay.rounds[1];
  for (const ship of deployment.ships) {
    const later = next.ships.find((candidate) => candidate.id === ship.id);
    assert(later && Object.keys(ship).sort().join("|") === Object.keys(later).sort().join("|"),
      `${file} deployment ship ${ship.id} does not use the normal snapshot fields`);
  }
  assert(replay.meta.version >= 3, `${file} was recorded before meta.version 3`);
  const map = replay.meta.tuning.map;
  assert(map && map.shape === "rect" && map.widthHexes > 0 && map.heightHexes > 0,
    `${file} carries no rectangular map shape`);
  assert(Number.isFinite(replay.meta.tuning.mapRadiusHexes),
    `${file} dropped the mapRadiusHexes fallback`);
  // Every ship in a replay must have an icon to render with.
  for (const ship of deployment.ships) {
    assert(iconManifest.icons[`${ship.faction}/${ship.className}`],
      `${file} fields ${ship.faction}/${ship.className}, which has no icon in the manifest`);
  }
}

// The recorder now imports the live roster, so the current sixth hulls appear.
const rosterClasses = new Set(replays.flatMap(({ replay }) => replay.rounds[0].ships.map((s) => s.className)));
for (const className of ["dreadnought", "carrier"]) {
  assert(rosterClasses.has(className), `no bundled replay fields a ${className}`);
}

// ------------------------------------------------------------- animation

const totals = BLANK();
let warpTransitionFound = false;
const drawTallies = [];
for (const { file, replay } of replays) {
  assert(Array.isArray(replay.shots) && replay.shots.length, `${file} has no shot events`);
  warpTransitionFound ||= replay.rounds.some((round, index) => {
    const next = replay.rounds[index + 1];
    return next && round.ships.some((ship) => {
      const later = next.ships.find((candidate) => candidate.id === ship.id);
      return later && hexDistance(ship.pos, later.pos) >= 4;
    });
  });
  const run = await runReplay(replay);
  for (const key of Object.keys(totals)) totals[key] += run.counts[key];
  drawTallies.push({ file, run });
}
assert(warpTransitionFound, "Bundled replays contain no warp-cut transition");

// -------------------------------- narrative log and snapshot-true endpoints

{
  const arena = drawTallies[0].run.arena;
  const ship = (id, q, r, facing = 0) => ({ id, pos: { q, r }, facing });
  const synthetic = {
    rounds: [
      { turn: 0, round: 0, ships: [ship("A-destroyer-3", -12, 2), ship("B-frigate-4", 0, 2, 3)] },
      { turn: 1, round: 1, ships: [ship("A-destroyer-3", -9, 2), ship("B-frigate-4", 0, 2, 3)] }
    ],
    log: [],
    shots: [
      { turn: 1, round: 1, kind: "beam", weapon: "laser-cannon", shooterId: "A-destroyer-3", targetId: "B-frigate-4", hit: true, range: 7, damage: 9 },
      { turn: 1, round: 1, kind: "beam", weapon: "heavy-blaster", shooterId: "B-frigate-4", targetId: "A-destroyer-3", hit: false, range: 7, damage: 0 },
      { turn: 1, round: 1, kind: "launch", weapon: "plasma-torpedo", shooterId: "A-destroyer-3", targetId: "B-frigate-4", range: 9, damage: 12 },
      { turn: 1, round: 1, kind: "missile", weapon: "plasma-torpedo", shooterId: "A-destroyer-3", targetId: "B-frigate-4", outcome: "hit", damage: 10 }
    ]
  };
  const lines = arena.buildNarrative(synthetic, 1).map((entry) => entry.text);
  for (const expected of [
    "A-destroyer-3 moves (-12,2) → (-9,2), facing E",
    "B-frigate-4 holds (0,2), facing W",
    "A-destroyer-3 fires laser-cannon at B-frigate-4, range 7: HIT for 9",
    "B-frigate-4 fires heavy-blaster at A-destroyer-3, range 7: miss",
    "A-destroyer-3 launches plasma-torpedo at B-frigate-4, range 9 (warhead 12)",
    "plasma-torpedo from A-destroyer-3 hits B-frigate-4 for 10"
  ]) assert(lines.includes(expected), `narrative line missing: ${expected}\n${lines.join("\n")}`);

  const savedReplay = arena.state.replay;
  arena.state.replay = synthetic;
  const beam = arena.buildShotEffects(synthetic).find((effect) => effect.kind === "beam");
  const geo = arena.geometry();
  const endpoints = arena.effectEndpoints(beam, geo);
  const expectedStart = arena.project(synthetic.rounds[1].ships[0].pos, geo);
  const expectedEnd = arena.project(synthetic.rounds[1].ships[1].pos, geo);
  assert(endpoints.start.x === expectedStart.x && endpoints.start.y === expectedStart.y,
    `beam start ${JSON.stringify(endpoints.start)} does not equal the shooter's round position ${JSON.stringify(expectedStart)}`);
  assert(endpoints.end.x === expectedEnd.x && endpoints.end.y === expectedEnd.y,
    `beam end ${JSON.stringify(endpoints.end)} does not equal the target's round position ${JSON.stringify(expectedEnd)}`);
  arena.state.replay = savedReplay;
}

for (const [path, count] of Object.entries(totals).filter(([path]) => path !== "moon" && path !== "planet")) {
  assert(count, `Canvas ${path} effect path did not execute`);
}

// ---------------------------------------------------- landscape rectangle

{
  const { run } = drawTallies[0];
  const arena = run.arena;
  const shape = arena.mapShape();
  assert(shape.shape === "rect" && shape.width === 72 && shape.height === 40,
    `map shape is ${JSON.stringify(shape)}, expected the 72x40 rectangle`);
  // |q + r/2| <= W/2 and |r| <= H/2, in pointy-top axial.
  assert(arena.inBounds(0, 0, shape), "origin is out of bounds");
  assert(arena.inBounds(36, 0, shape) && !arena.inBounds(37, 0, shape), "width bound is wrong on the long axis");
  assert(arena.inBounds(-10, 20, shape) && !arena.inBounds(-10, 21, shape), "height bound is wrong on the short axis");
  assert(arena.inBounds(16, 20, shape) && !arena.inBounds(27, 20, shape), "the r/2 shear is not applied to the width bound");
  // Fit to WIDTH: the field must span most of the canvas across and must not
  // be clipped by the canvas height.
  const geo = arena.geometry();
  const halfX = (Math.sqrt(3) * shape.width / 2 + Math.sqrt(3) / 2) * geo.scale;
  const halfY = (1.5 * shape.height / 2 + 1) * geo.scale;
  assert(halfX * 2 <= 960 + 1e-6 && halfX * 2 > 960 * .9, `landscape field is ${halfX * 2}px wide on a 960px canvas`);
  assert(halfY * 2 <= 640 + 1e-6, `landscape field is ${halfY * 2}px tall on a 640px canvas`);
  // A legacy replay carrying only mapRadiusHexes still gets the hexagon.
  const legacyShape = (() => {
    const saved = arena.state.replay.meta.tuning.map;
    delete arena.state.replay.meta.tuning.map;
    const out = arena.mapShape();
    arena.state.replay.meta.tuning.map = saved;
    return out;
  })();
  assert(legacyShape.shape === "hex" && legacyShape.radius === 34,
    `legacy replays lost the hexagon path: ${JSON.stringify(legacyShape)}`);
  assert(arena.inBounds(34, 0, legacyShape) && !arena.inBounds(35, 0, legacyShape), "hexagon bound is wrong");
}

// ------------------------------------------------- icons, hexes and stacks

{
  const { run } = drawTallies[1];
  const arena = run.arena;
  assert(arena.state.render === "icons", "icon mode is not the default");
  assert(arena.icons.size >= 52, `only ${arena.icons.size} icons preloaded`);
  assert(run.counts.laser + run.counts.blaster > 0, "no beams drawn alongside the icons");
  assert(arena.state.rendered.icon > 0, "no ship was drawn as an icon");
  assert(arena.state.rendered.missing === 0, "a ship drew nothing (missing art) with icons available");

  // Rule (a): an icon's footprint fits inside one hex. The drawing box is
  // ICON_SPAN circumradii wide; the artwork inside it is `size` of that box and
  // may be rotated to any facing, so its worst-case reach from the centre is
  // half its diagonal.
  const { HEX_INRADIUS, ICON_SPAN, ICON_EXTENT } = arena.constants;
  assert(ICON_SPAN * ICON_EXTENT < HEX_INRADIUS,
    `an unstacked icon reaches ${ICON_SPAN * ICON_EXTENT} circumradii, past the hex edge at ${HEX_INRADIUS}`);
  const geo = arena.geometry();
  // Combat strokes are specified against the displayed hex size, with only a
  // small screen-pixel floor. Zooming the camera must therefore grow a laser
  // from its floor to 0.06 of the on-screen hex, not multiply a fixed world
  // width into a cruiser-sized stripe.
  const oldZoom = arena.state.camera.zoom;
  const effectGeo = { scale: 10 };
  arena.state.camera.zoom = 1;
  assert(arena.effectScreenSize(effectGeo, .06, 1) === 1,
    "fit-map laser did not retain its 1px visibility floor");
  arena.state.camera.zoom = 4;
  for (const [name, fraction, floor] of [["laser", .06, 1], ["blaster", .12, 1.5], ["spinal", .25, 2]]) {
    const screenWidth = arena.effectScreenSize(effectGeo, fraction, floor);
    assert(Math.abs(screenWidth - effectGeo.scale * arena.state.camera.zoom * fraction) < 1e-9,
      `${name} width does not scale as ${fraction} of the on-screen hex radius`);
    assert(Math.abs(arena.effectWorldSize(effectGeo, fraction, floor) * arena.state.camera.zoom - screenWidth) < 1e-9,
      `${name} world width is not camera-compensated`);
  }
  arena.state.camera.zoom = oldZoom;
  const byKey = new Map();
  for (const [key, entry] of arena.icons) byKey.set(entry.image.key, entry.size);
  const shipDraws = run.draws.filter((d) => Math.abs(d.box - ICON_SPAN * geo.scale) < 1e-6);
  assert(shipDraws.length, "no ship icon was drawn at the full hex box");
  for (const draw of shipDraws) {
    const size = byKey.get(draw.key) ?? 1;
    const reach = .5 * Math.hypot(draw.box * size, draw.box * size);
    assert(reach <= HEX_INRADIUS * geo.scale + 1e-9,
      `an icon reaches ${reach.toFixed(2)}px from its hex centre, past the ${(HEX_INRADIUS * geo.scale).toFixed(2)}px edge`);
  }

  // Rule (b): ships MAY share a hex, and are then offset so each is visible.
  for (const count of [2, 3, 4, 6]) {
    const layout = arena.stackLayout(count);
    assert(layout.length === count, `stackLayout(${count}) returned ${layout.length} places`);
    for (const place of layout) {
      const ring = Math.hypot(place.dx, place.dy);
      assert(ring > 0, `stackLayout(${count}) left a ship on the hex centre`);
      assert(ring + ICON_SPAN * ICON_EXTENT * place.shrink <= HEX_INRADIUS + 1e-9,
        `a stack of ${count} spills out of its hex`);
    }
    // Neighbours on the ring must not sit on top of one another.
    const chord = Math.hypot(layout[0].dx - layout[1].dx, layout[0].dy - layout[1].dy);
    assert(chord > ICON_SPAN * ICON_EXTENT * layout[0].shrink,
      `a stack of ${count} overlaps its own members`);
  }
  assert(arena.stackLayout(1).length === 1 && arena.stackLayout(1)[0].dx === 0, "a lone ship should not be offset");

  // And the offsets must actually be applied when a replay stacks ships.
  const stackedRun = drawTallies.find(({ run: r }) => r.arena.state.rendered.stacked > 0);
  assert(stackedRun, "no bundled replay ever put two ships in one hex");

  // Sprites stay available behind the toggle.
  const spriteRun = await runReplay(drawTallies[1].run ? replays[1].replay : replays[1].replay, { mode: "sprites" });
  assert(spriteRun.arena.state.render === "sprites", "the sprites toggle did not switch modes");
  assert(spriteRun.arena.state.rendered.sprite > 0, "sprite mode drew no sprites");
  // The sprite sheet predates the dreadnought and the carrier, which is why
  // icons are now the default; there is no chevron any more (every roster
  // class has an icon), so those two hulls fall back to their icon instead.
  assert(spriteRun.arena.state.rendered.icon > 0, "sprite mode did not fall back to icons for hulls the sprite sheet predates");
  assert(spriteRun.arena.state.rendered.missing === 0, "sprite mode drew nothing for a hull that has an icon");
  assert(spriteRun.elements.get("mode-sprites").classes.has("active"), "the sprites button is not marked active");

  // No chevron/triangle fallback at all: with the icon manifest unavailable
  // (and sprite mode not selected, so sprites are not consulted either),
  // every ship draws nothing and is tallied as missing rather than as a
  // fallback marker.
  const bareRun = await runReplay(replays[1].replay, { icons: false });
  assert(bareRun.arena.icons.size === 0, "icons loaded when the manifest was unavailable");
  assert(bareRun.arena.state.rendered.icon === 0 && bareRun.arena.state.rendered.sprite === 0,
    "bare run drew ship art it should not have had");
  assert(bareRun.arena.state.rendered.missing > 0, "no missing-art tally when the icon manifest is unavailable");
}

// ------------------------------------- photonic cannon and carrier air group

{
  const spinalRuns = drawTallies.filter(({ run }) => run.arena.state.rendered.spinalBolt > 0);
  assert(spinalRuns.length >= 2, "the photonic cannon bolt never fired in the bundled replays");
  const tallies = drawTallies.map(({ run }) => run.arena.state.rendered);
  const sum = (key) => tallies.reduce((total, entry) => total + entry[key], 0);
  for (const key of ["spinalCharge", "spinalHold", "spinalVent", "spinalBolt", "spinalHit", "spinalMiss", "craft", "strikeRun", "strikeImpact"]) {
    assert(sum(key) > 0, `the ${key} render path did not execute`);
  }
  assert(totals.spinalGlow > 0, "no photonic charge glow reached the canvas");
  assert(totals.strikeImpact > 0, "no strike impact flicker reached the canvas");

  // The timeline itself, parsed straight out of the log lines. No single
  // battle shows every capacitor phase - the bank in arena/replay.json holds a
  // full charge to the end, the one in ear-kre-24 fires and vents - so the
  // phases are checked across the bundled set.
  const { run } = drawTallies[1];
  const timelines = replays.map(({ replay }) => run.arena.buildLogEffects(replay));
  const phases = new Set(timelines.flatMap((t) => t.spinal.flat()).map((entry) => entry.phase));
  for (const phase of ["cold", "charging", "ready", "venting"]) {
    assert(phases.has(phase), `the capacitor bank never reached the ${phase} phase`);
  }
  const effects = timelines[1];
  const climbing = effects.spinal.map((frame) => frame.find((entry) => entry.phase === "charging")?.ratio ?? null)
    .filter((ratio) => ratio !== null);
  assert(climbing.length >= 3 && Math.max(...climbing) > Math.min(...climbing),
    "the charge ratio does not grow with the logged charge level");
  const fires = effects.fires.flat();
  // Structural, not pinned to one recording: every fire event is the
  // dreadnought's, carries a target and a hit flag, and the bundled set
  // exercises both the miss and the hit render paths (asserted above).
  assert(fires.length >= 1 && fires.every((f) => f.shooterId.includes("dreadnought") && f.targetId && typeof f.hit === "boolean"),
    `unexpected photonic-cannon fire events: ${JSON.stringify(fires)}`);
  const strikes = effects.strikes.flat();
  assert(strikes.length > 0 && strikes.every((s) => s.carrierId && (s.type === "bomber" || s.type === "interceptor")),
    "squadron strikes were not parsed out of the log");
  const aloft = effects.wing.map((frame) =>
    frame.reduce((total, entry) => total + entry.squadrons.reduce((n, sq) => n + sq.strength, 0), 0));
  assert(Math.max(...aloft) >= 12, `the air group never reached strength: peak ${Math.max(...aloft)}`);
  const peak = aloft.indexOf(Math.max(...aloft));
  assert(aloft.slice(peak).some((n) => n < Math.max(...aloft)), "the air group never thinned as losses were logged");
  // A deck that goes down takes its air group with it.
  const scuttled = replays.findIndex(({ replay }) =>
    replay.log.some((entry) => / goes down with \d+ craft still aboard or in the air$/.test(entry.message)));
  assert(scuttled >= 0, "no bundled replay sinks a carrier");
  const afterScuttle = timelines[scuttled].wing[timelines[scuttled].wing.length - 1]
    .reduce((total, entry) => total + entry.squadrons.reduce((n, sq) => n + sq.strength, 0), 0);
  assert(afterScuttle === 0, "the wing survived its carrier");
}

// -------------------------------------------------------------- terrain

{
  const scenarioReplay = recordScenario(sampleScenario, tuning, loadouts);
  assert(scenarioReplay.meta.terrain.length === 3 && scenarioReplay.meta.scenario.name === sampleScenario.name,
    "scenario metadata was not preserved in the replay");
  const terrainRun = await runReplay(scenarioReplay);
  assert(terrainRun.counts.planet > 0 && terrainRun.counts.moon > 0,
    "planet and moon bodies did not reach the canvas");
  assert(terrainRun.arena.state.rendered.planet > 0 && terrainRun.arena.state.rendered.moon > 0,
    "terrain render paths did not execute");
  // The sample scenario carries no asteroid or nebula terrain -- confirm
  // those render paths stay untouched rather than firing spuriously.
  assert(terrainRun.arena.state.rendered.asteroid === 0 && terrainRun.arena.state.rendered.asteroids === 0 &&
    terrainRun.arena.state.rendered.nebula === 0,
    "an asteroid/nebula render path fired without any such terrain");

  const oldReplay = JSON.parse(JSON.stringify(scenarioReplay));
  delete oldReplay.meta.terrain;
  delete oldReplay.meta.scenario;
  const oldRun = await runReplay(oldReplay);
  assert(oldRun.counts.planet === 0 && oldRun.counts.moon === 0,
    "an old replay without terrain drew a body");
  assert(oldRun.arena.state.rendered.asteroid === 0 && oldRun.arena.state.rendered.asteroids === 0 && oldRun.arena.state.rendered.nebula === 0,
    "an old replay without meta.terrain drew asteroid or nebula terrain");

  // Every terrain type, rendered end-to-end from a recorded replay: one ship
  // deliberately sits inside the asteroid field and another inside the
  // nebula (both allowed) to prove buildScenario, the recorder and the
  // viewer all agree they are passable, not just validateScenario.
  const allTerrainScenario = {
    name: "Every Terrain Type Check", seed: "every-terrain-type-check",
    map: { widthHexes: 72, heightHexes: 40 },
    terrain: [
      { type: "planet", q: 0, r: 0 },
      { type: "moon", q: -8, r: -6 },
      { type: "asteroid", q: 9, r: 5 },
      { type: "asteroids", q: 5, r: -3 },
      { type: "nebula", q: -5, r: -3 }
    ],
    sides: [
      { faction: "EAR", ships: [
        { className: "dreadnought", q: -15, r: 0, facing: 0 },
        { className: "light-cruiser", q: -14, r: 3, facing: 0 },
        { className: "frigate", q: 5, r: -3, facing: 0 } // parked inside the asteroid field on purpose
      ] },
      { faction: "KRE", ships: [
        { className: "carrier", q: 15, r: 0, facing: 3 },
        { className: "strike-cruiser", q: 14, r: -3, facing: 3 },
        { className: "frigate", q: -5, r: -3, facing: 3 } // parked inside the nebula on purpose
      ] }
    ]
  };
  assert(validateScenario(allTerrainScenario, tuning, loadouts).length === 0,
    "the every-terrain-type check scenario does not validate");
  const allTerrainReplay = recordScenario(allTerrainScenario, tuning, loadouts);
  assert(TERRAIN_TYPES.every((type) => allTerrainReplay.meta.terrain.some((t) => t.type === type)),
    "recorded replay lost one or more terrain types");
  const allTerrainRun = await runReplay(allTerrainReplay);
  assert(allTerrainRun.arena.state.rendered.asteroid > 0, "the large-asteroid render path did not execute");
  assert(allTerrainRun.arena.state.rendered.asteroids > 0, "the asteroid-field render path did not execute");
  assert(allTerrainRun.arena.state.rendered.nebula > 0, "the nebula render path did not execute");
}

// --------------------------------------------------------------- legacy

const legacy = JSON.parse(readFileSync(replayFiles[1], "utf8"));
delete legacy.shots;
delete legacy.meta.tuning.map;
legacy.rounds = legacy.rounds.slice(1);
const legacyRun = await runReplay(legacy, { legacy: true });
assert(legacyRun.firstLabel === "Turn 1 / Round 1", "Legacy replay without round 0 did not open on its first available round");
assert(legacyRun.arena.mapShape().shape === "hex", "Legacy replay was not drawn on the hexagonal field");
assert(legacyRun.counts.grid > 0 && legacyRun.counts.boundary > 0, "Legacy replay drew no grid");

console.log("Arena DOM smoke passed:", totals);
console.log("Render tallies:", drawTallies.map(({ file, run }) =>
  `${file.split(/[\\/]/).pop()} ${JSON.stringify(run.arena.state.rendered)}`).join("\n                 "));
