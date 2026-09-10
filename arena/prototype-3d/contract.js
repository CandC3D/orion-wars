// Pure, presentation-only contracts. No simulation imports or state access.
import { SIZES, mm } from './scale.js';
export const FORMAT = 'tabletop-projection/1';
export const BUDGETS = Object.freeze({
  pixelRatio: 1.5, maxPixels: 2073600, shadowSize: 2048, shadowLights: 1,
  maxTriangles: 70000, maxDrawCalls: 90, materialTextureMiB: 24, renderTargetMiB: 64,
  activeEffects: 1, beamLayers: 2, bloomScale: 0.5, bloomGain: 0.18,
  cameraFloor: 24, pitchFloor: 32, postHeight: mm(SIZES.postHeight), hexRadius: mm(SIZES.hexAcrossFlats) / Math.sqrt(3),
  cameraMoveMs: 900, beamMs: 850, shieldMs: 650, focusBlurPixels: 3,
  nebulaPeak: 0.06, nebulaBoardCoverage: 0.15, nebulaMean: 0.012
});
const fail = message => { throw new Error(`Tabletop contract: ${message}`); };
const keys = (o, allowed, label) => {
  if (!o || typeof o !== 'object' || Array.isArray(o)) fail(`${label} must be an object`);
  for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(`${label}.${k} is not permitted`);
};
const finite = (n, label) => { if (!Number.isFinite(n)) fail(`${label} must be finite`); };
const id = (v, label) => { if (typeof v !== 'string' || !v.length || v.length > 120) fail(`${label} must be a short string`); };
export function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export function assertRegister(value, label) {
  if (!['physical', 'energetic'].includes(value)) fail(`${label} missing or invalid register classification`);
}
function hex(p) {
  keys(p, ['q','r'], 'hex'); finite(p.q, 'q'); finite(p.r, 'r');
  if (!Number.isInteger(p.q) || !Number.isInteger(p.r)) fail('hex must be whole q/r');
}
export function validateAssets(manifest) {
  if (manifest?.format !== 'tabletop-assets/1') fail('unknown asset format');
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== 3) fail('this slice needs three assets');
  const seen = new Set();
  for (const a of manifest.assets) {
    assertRegister(a.register, a.key);
    if (a.register !== 'physical') fail('a hull must be physical');
    id(a.key, 'asset key'); id(a.faction, 'faction'); id(a.className, 'class');
    if (seen.has(a.key)) fail('duplicate asset'); seen.add(a.key);
    if (a.key !== `${a.faction}/${a.className}`) fail('asset key disagrees with faction/class');
    if (typeof a.url !== 'string' || !(/^(?:\.\.\/\.\.\/assets\/game\/ships\/|\.\/prepared\/)[a-z_]+\.glb$/).test(a.url)) fail('asset must name an existing local or prepared GLB');
    finite(a.rotationY, 'asset rotation');
    if (a.paint === 'candidate-1987' && a.regionMap !== './prepared/regions.json') fail('candidate needs authored COLOR_0 region map');
    if (a.stand?.height !== BUDGETS.postHeight) fail('stand height must be uniform');
    for (const p of [a.stand.attachment, a.sockets?.weapon, a.sockets?.impact, ...(a.sockets?.engines ?? [])]) {
      if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) fail('asset attachment requires three coordinates');
    }
    if (!a.sockets.engines.length && !a.regionMap) fail('missing engine sockets');
    if (!['candidate-1987','basecoat-reference'].includes(a.paint)) fail('missing paint treatment');
    if (!(a.length > 0 && a.length <= 7.5)) fail('hull length outside slice budget');
  }
  if (manifest.assets.filter(a => a.paint === 'candidate-1987').length !== 1) fail('exactly one paint candidate');
  return manifest;
}

export function validateRegionMap(map) {
  if(map?.format!=='tabletop-colour-regions/1'||map.palette?.length!==7||!map.patches?.length)fail('missing authored region map');
  for(const p of [...map.palette,...map.patches]){
    assertRegister(p.register,'paint region');if(p.register!=='physical')fail('source colours are physical paint');
  }
  if(Object.keys(map.features??{}).sort().join(',')!=='beamEmitter,exhaust')fail('only the confirmed exhaust and larger emitter may animate');
  for(const p of Object.values(map.features)){
    assertRegister(p.register,'separate glow region');if(p.register!=='energetic')fail('glow needs a separate energetic object');
    if(!p.faces?.length||p.faces.some(i=>!Number.isInteger(i)||i<0))fail('glow requires exact authored faces');
  }
  return map;
}

export function validateProjection(packet) {
  keys(packet, ['format','phase','turn','units','events'], 'packet');
  if (packet.format !== FORMAT || !['planning','resolution'].includes(packet.phase)) fail('unknown projection or phase');
  if (!Number.isInteger(packet.turn) || packet.turn < 0) fail('invalid turn');
  if (!Array.isArray(packet.units) || !Array.isArray(packet.events)) fail('missing projection arrays');
  const units = new Map();
  for (const u of packet.units) {
    keys(u, ['id','faction','className','hex','facing','owned','confirmedDestroyed'], 'unit');
    id(u.id, 'unit id'); id(u.faction, 'faction'); id(u.className, 'class'); hex(u.hex);
    if (units.has(u.id)) fail('duplicate unit'); units.set(u.id, u);
    if (!Number.isInteger(u.facing) || u.facing < 0 || u.facing > 5) fail('invalid heading');
    if (typeof u.owned !== 'boolean' || typeof u.confirmedDestroyed !== 'boolean') fail('explicit ownership/confirmation required');
    if (u.confirmedDestroyed && !u.owned) fail('enemy kill disclosure is not supported by this adapter');
  }
  for (const e of packet.events) {
    keys(e, ['kind','source','destination','outcome','confirmation'], 'event');
    if (!['beam','anonymous','shield-flare'].includes(e.kind)) fail('unsupported effect');
    for (const p of [e.source, e.destination].filter(Boolean)) {
      keys(p, ['id','hex'], 'endpoint'); hex(p.hex);
      if (!units.has(p.id)) fail('endpoint is not a currently projected hull');
    }
    if (e.kind === 'beam' && (!e.source || !e.destination)) fail('beam requires two disclosed endpoints');
    if (e.kind === 'anonymous' && (!!e.source === !!e.destination)) fail('anonymous effect requires exactly one endpoint');
    if (e.kind === 'shield-flare' && (e.source || !e.destination || !units.get(e.destination.id)?.owned || e.confirmation !== 'authored-own-shield')) fail('shield flare requires explicit own confirmation');
    if (!['resolved','unconfirmed','miss','intercepted','evaded','confirmed-shield'].includes(e.outcome)) fail('unsupported outcome');
  }
  return packet;
}

// Consumes the existing safe frame/event stream. Extra raw-looking fields are deliberately
// discarded here; the renderer's output packet is strict and contains only allowlisted values.
export function projectContactFrame(frame, events = []) {
  if (frame?.format !== 'player-contact-frame/1') fail('expected a player contact frame');
  const view = frame.observation;
  if (!Array.isArray(view?.own) || !Array.isArray(view?.contacts)) fail('missing side observation');
  const units = [...view.own.map(u => ({ u, owned: true })), ...view.contacts.map(u => ({ u, owned: false }))]
    .map(({u, owned}) => ({ id: u.id, faction: u.faction, className: u.className,
      hex: { q: u.pos.q, r: u.pos.r }, facing: u.facing, owned, confirmedDestroyed: owned && u.destroyed === true }));
  const known = new Set(units.map(u => u.id)), effects = [];
  for (const e of events.filter(Boolean)) {
    if (!['beam','fire','missile'].includes(e.kind)) continue;
    const source = e.kind !== 'missile' && known.has(e.shooterId) && e.source
      ? { id: e.shooterId, hex: { q: e.source.q, r: e.source.r } } : null;
    const destination = known.has(e.targetId) && e.destination
      ? { id: e.targetId, hex: { q: e.destination.q, r: e.destination.r } } : null;
    if (!source && !destination) continue;
    effects.push({ kind: source && destination ? 'beam' : 'anonymous',
      ...(source ? { source } : {}), ...(destination ? { destination } : {}),
      outcome: ['resolved','miss','intercepted','evaded'].includes(e.outcome) ? e.outcome : 'unconfirmed' });
  }
  return freeze(validateProjection({ format: FORMAT, phase: frame.phase === 'planning' ? 'planning' : 'resolution', turn: frame.turn, units, events: effects }));
}

export function hexWorld(p) {
  return { x: Math.sqrt(3) * BUDGETS.hexRadius * (p.q + p.r / 2), z: 1.5 * BUDGETS.hexRadius * p.r };
}
export function displayLayout(units) {
  const groups = new Map(), out = {};
  for (const u of units) { const key = `${u.hex.q},${u.hex.r}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(u); }
  for (const group of groups.values()) {
    group.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    group.forEach((u,i) => {
      const anchor = hexWorld(u.hex), angle = i * Math.PI * 2 / group.length;
      const radius = group.length > 1 ? 0.88 : 0;
      out[u.id] = { anchor, x: anchor.x + Math.cos(angle) * radius, z: anchor.z + Math.sin(angle) * radius,
        baseScale: group.length > 1 ? Math.min(0.62, 1.3 / group.length) : 1 };
    });
  }
  return out;
}

export function cameraPose(progress) {
  const p = Math.min(1, Math.max(0, Number(progress) || 0)), s = p * p * (3 - 2 * p);
  const pose = { x: 8 - s * 3, y: Math.max(BUDGETS.cameraFloor, 63 - s * 35), z: 54 - s * 24,
    targetY: 1.0 + s * 1.2, fov: 32 + s * 8, blur: s * BUDGETS.focusBlurPixels };
  const minimum = pose.targetY + Math.hypot(pose.x, pose.z) * Math.tan(BUDGETS.pitchFloor * Math.PI / 180);
  pose.y = Math.max(pose.y, minimum);
  return pose;
}
