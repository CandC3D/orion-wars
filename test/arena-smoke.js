// Dependency-free DOM/canvas smoke test for the static battle arena.
// Advances every round in both bundled shot-enabled replays and verifies that
// the distinct beam, missile, warp-cut, and motion-trail renderers execute.
// Also checks deployment frames and compatibility with a pre-round-0 replay.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "arena", "arena.js"), "utf8");
const replayFiles = [
  join(root, "arena", "replays", "ear-kre-24.json"),
  join(root, "arena", "replays", "vra-zan-32.json")
];
const bundledReplayFiles = [join(root, "arena", "replay.json"), ...replayFiles];
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
    this.classList = { add() {}, remove() {} };
  }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  dispatch(type, extra = {}) {
    this.listeners.get(type)?.({ target: this, preventDefault() {}, ...extra });
  }
  replaceChildren() {}
  append() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 640 }; }
}

function makeContext(counts) {
  const stack = [];
  const ctx = {
    fillStyle: "", strokeStyle: "", shadowColor: "", shadowBlur: 0,
    lineWidth: 1, lineCap: "butt", globalAlpha: 1, filter: "none",
    save() {
      stack.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, shadowColor: this.shadowColor,
        shadowBlur: this.shadowBlur, lineWidth: this.lineWidth, lineCap: this.lineCap,
        globalAlpha: this.globalAlpha, filter: this.filter });
    },
    restore() { Object.assign(this, stack.pop() || {}); },
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {},
    translate() {}, rotate() {}, setTransform() {}, clearRect() {}, fillRect() {}, drawImage() {},
    stroke() {
      if (this.strokeStyle === "#bfeaff" || this.strokeStyle === "#ffffff") counts.laser++;
      if (this.strokeStyle === "#ff7848" || this.strokeStyle === "#ff512f") counts.blaster++;
      if (this.strokeStyle === "#ffd36a" || this.strokeStyle === "#56ffd0") counts.intercept++;
      if (this.strokeStyle === "rgba(152,255,229,.75)") counts.evade++;
      if (this.strokeStyle === "#72f7cf") counts.warp++;
      if (this.strokeStyle === "rgba(116,210,190,.42)") counts.trail++;
    },
    fill() {
      const stops = this.fillStyle?.stops || [];
      if (stops.some(([, color]) => color.includes("255,206,91"))) counts.neutronic++;
      if (stops.some(([, color]) => color.includes("46,235,174"))) counts.plasma++;
      if (stops.some(([, color]) => color.includes("78,206,255"))) counts.shieldFlash++;
    },
    createRadialGradient() {
      return { stops: [], addColorStop(offset, color) { this.stops.push([offset, color]); } };
    }
  };
  return ctx;
}

async function runReplay(replay, legacy = false) {
  const counts = { laser: 0, blaster: 0, neutronic: 0, plasma: 0, intercept: 0, evade: 0, shieldFlash: 0, warp: 0, trail: 0 };
  const elements = new Map();
  const get = (selector) => {
    const id = selector.startsWith("#") ? selector.slice(1) : selector;
    if (!elements.has(id)) elements.set(id, new ElementStub(id));
    return elements.get(id);
  };
  const canvas = get("#arena-canvas");
  const context2d = makeContext(counts);
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
  const context = vm.createContext({
    console, document, window,
    performance: { now: () => clock },
    requestAnimationFrame(callback) { nextFrame = callback; },
    fetch: async (url) => url.includes("manifest")
      ? { ok: false }
      : { ok: true, json: async () => replay },
    FileReader: class {}, Image: class {},
    setTimeout, clearTimeout
  });
  new vm.Script(source, { filename: "arena/arena.js" }).runInContext(context);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const firstLabel = get("#round-label").textContent;
  for (let i = 1; i < replay.rounds.length; i++) {
    get("#play").dispatch("click");
    for (let frame = 0; frame < 5; frame++) {
      clock += 100;
      const callback = nextFrame;
      nextFrame = null;
      callback?.(clock);
    }
    get("#play").dispatch("click");
    get("#step-forward").dispatch("click");
  }
  if (legacy && shotEffectKeys.some((key) => counts[key])) throw new Error("Legacy replay unexpectedly rendered shot effects");
  return { counts, firstLabel };
}

function hexDistance(a, b) {
  const dq = b.q - a.q, dr = b.r - a.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

for (const file of bundledReplayFiles) {
  const replay = JSON.parse(readFileSync(file, "utf8"));
  const deployment = replay.rounds[0];
  if (deployment?.turn !== 0 || deployment?.round !== 0) throw new Error(`${file} does not start with a round-0 deployment frame`);
  const next = replay.rounds[1];
  for (const ship of deployment.ships) {
    const later = next.ships.find((candidate) => candidate.id === ship.id);
    if (!later || Object.keys(ship).sort().join("|") !== Object.keys(later).sort().join("|")) {
      throw new Error(`${file} deployment ship ${ship.id} does not use the normal snapshot fields`);
    }
  }
}

const totals = { laser: 0, blaster: 0, neutronic: 0, plasma: 0, intercept: 0, evade: 0, shieldFlash: 0, warp: 0, trail: 0 };
let warpTransitionFound = false;
for (const file of replayFiles) {
  const replay = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(replay.shots) || !replay.shots.length) throw new Error(`${file} has no shot events`);
  warpTransitionFound ||= replay.rounds.some((round, index) => {
    const next = replay.rounds[index + 1];
    return next && round.ships.some((ship) => {
      const later = next.ships.find((candidate) => candidate.id === ship.id);
      return later && hexDistance(ship.pos, later.pos) >= 4;
    });
  });
  const { counts } = await runReplay(replay);
  for (const key of Object.keys(totals)) totals[key] += counts[key];
}
if (!warpTransitionFound) throw new Error("Bundled replays contain no warp-cut transition");
const legacy = JSON.parse(readFileSync(replayFiles[0], "utf8"));
delete legacy.shots;
legacy.rounds = legacy.rounds.slice(1);
const legacyRun = await runReplay(legacy, true);
if (legacyRun.firstLabel !== "Turn 1 / Round 1") throw new Error("Legacy replay without round 0 did not open on its first available round");

for (const [path, count] of Object.entries(totals)) {
  if (!count) throw new Error(`Canvas ${path} effect path did not execute`);
}
console.log("Arena DOM smoke passed:", totals);
