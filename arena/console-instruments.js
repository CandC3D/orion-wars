// Drawn console instruments: value-only SVG/HTML string builders.
// No DOM, no listeners, no randomness - the same ship always renders the same
// markup so the lead can diff, cache and test it. The page owns every event.
import { FACE_NAMES, OFFSET_OF_FACE, shields as engineShields, format, escapeHTML } from "./command-model.js";
import { advanceManualSpinal } from '../src/tactical/spinal-control.js';

export const WEAPON_COLOURS = { beam: "#8ec6dc", missile: "#efb773", spinal: "#c2a0f1" };
const BASE_TRACK = "#43535d", ERROR = "#ffafa2", INK = "#e9f4f6", MUTED = "#b3c4ce";
const VIEW = 300, CX = 150, CY = 150;
const RING = 118, RING_WIDTH = 12, GAP_DEG = 6;
const NUMBER_RADIUS = 136;      // clear of the ring (outer edge 124) and of the viewBox
// HULL PLAN. The glyph and the mount lamps share one frame, so a turret
// authored at a ship-local position lands on the same part of the hull in
// the console as it does in Drydock. Everything below is derived from that
// frame rather than hard-coded, which is why the art can grow without the
// turrets sliding off it.
//
// The traced class glyphs are generated to a common frame: the ink is 96.3%
// of the 100-unit viewBox tall and never more than 59% wide. Height is
// therefore always the limiting dimension under xMidYMid meet, and a box of
// side S puts INK_FRACTION * S of ship on screen.
const INK_FRACTION = 0.963;
// A hull spans about +/-1.3 ship-local units bow to stern - the same extent
// Drydock's plan uses - so that is what the ink height represents.
const HULL_EXTENT = 1.3;
// Furniture inside the ring the art must not sit under: the BOW chevron and
// its label at the top, and the keel-gun charge bar at the bottom when the
// hull carries one.
const PLAN_TOP = 74, PLAN_BOTTOM_KEEL = 202, PLAN_BOTTOM_CLEAR = 236, PLAN_MAX = 176;
const HIT_R = 14, LAMP_R = 9;
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round2 = value => Math.round(num(value) * 100) / 100;
const polar = (radius, degrees) => {
  const a = degrees * Math.PI / 180;
  return { x: round2(CX + Math.cos(a) * radius), y: round2(CY + Math.sin(a) * radius) };
};
// Face 2 (forward) sits at the top; port faces fall to screen left, matching the
// legacy canvas schematic and the authoritative hex offsets.
const faceAngle = face => -90 - (OFFSET_OF_FACE[face] ?? 0) * 60;
function arcPath(radius, fromDeg, toDeg) {
  const a = polar(radius, fromDeg), b = polar(radius, toDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
}
// The schematic ring is a HEXAGON, the same decision the map ring took on 9 September and extended
// here by Chris on the 10th. A shield face is the hex edge an attack crosses, so it is drawn as a
// flat rather than as an arc standing in for one - and the two readouts of the same six faces now
// share a silhouette instead of only a numbering.
//
// Inscribed in the circle the arcs used, so the ring keeps its footprint: corners on RING, flats
// inside it. `half` is the arc half-width the circle would have used, carried across so the gaps
// between faces stay the same width they were.
const INRADIUS = Math.cos(Math.PI / 6);
function faceEnds(radius, centreDeg, half) {
  const t = Math.tan(half * Math.PI / 180) / Math.tan(30 * Math.PI / 180);
  const mid = polar(radius * INRADIUS, centreDeg);
  const v0 = polar(radius, centreDeg - 30), v1 = polar(radius, centreDeg + 30);
  return { a: { x: mid.x + (v0.x - mid.x) * t, y: mid.y + (v0.y - mid.y) * t },
           b: { x: mid.x + (v1.x - mid.x) * t, y: mid.y + (v1.y - mid.y) * t } };
}
function facePath(radius, centreDeg, half, ratio = 1) {
  const { a, b } = faceEnds(radius, centreDeg, half);
  const k = Math.max(0, Math.min(1, ratio));
  const e = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  return `M ${round2(a.x)} ${round2(a.y)} L ${round2(e.x)} ${round2(e.y)}`;
}

// Own-ship observations carry shields[]; raw engine ships do not. Accept both.
export function shieldFaces(ship) {
  const supplied = Array.isArray(ship?.shields) ? ship.shields : null;
  if (supplied) return [1, 2, 3, 4, 5, 6].map(face => {
    const row = supplied.find(s => Number(s.face) === face) || {};
    const capacity = Math.max(0, num(row.capacity));
    return { face, capacity, remaining: row.down ? 0 : Math.max(0, num(row.remaining)),
      down: !!row.down || !!ship.destroyed, powerPerDamage: num(row.powerPerDamage) };
  });
  return engineShields(ship).map(s => ({ face: s.face, capacity: Math.max(0, num(s.max)),
    remaining: Math.max(0, num(s.remaining)), down: !!s.down,
    powerPerDamage: num(ship.shieldGenerators?.[s.face]?.powerPerDamage ?? ship.shieldPointRatio) }));
}

export function mountState(mount, ship) {
  if (!mount) return { state: "offline", label: "NO MOUNT" };
  if (ship?.destroyed) return { state: "destroyed", label: "DESTROYED" };
  if (mount.inop) return { state: "offline", label: "OFFLINE" };
  if (mount.kind === "spinal" && ship?.spinal) {
    const spinal = ship.spinal;
    if (spinal.state === "wrecked") return { state: "offline", label: "WRECKED" };
    if (spinal.state === "cooldown") return { state: "spent", label: "COOLING" };
    if (spinal.state !== "ready" && spinal.charge <= 0) return { state: "spent", label: "COLD" };
    if (spinal.state !== "ready") return { state: "spent", label: "CHARGING" };
  }
  if (mount.firedThisTurn) return { state: "spent", label: "FIRED" };
  if (mount.kind === "missile" && ship && num(ship.magazine, 1) <= 0) return { state: "spent", label: "NO ROUNDS" };
  return { state: "ready", label: "READY" };
}

export function spinalReading(ship) {
  const spinal = ship?.spinal;
  if (!spinal) return null;
  if (ship.destroyed) return { state: 'wrecked', label: 'UNAVAILABLE', fill: 0, charge: 0, required: 0 };
  const mount = (ship.mounts || []).find(m => m.kind === "spinal");
  const required = Math.max(0, num(mount?.weapon?.chargeRequired));
  const charge = Math.max(0, num(spinal.charge));
  if (spinal.state === "wrecked") return { state: "wrecked", label: "WRECKED", fill: 0, charge, required };
  if (spinal.state === "cooldown") return { state: "venting", label: `VENTING ${format(num(spinal.cooldown))}`, fill: 0, charge, required };
  if (spinal.state === "ready") return { state: "ready", label: "READY", fill: 1, charge, required };
  if (charge <= 0) return { state: "cold", label: "COLD", fill: 0, charge, required };
  return { state: "charging", label: `CHARGING ${format(charge)}${required ? `/${format(required)}` : ""}`,
    fill: required > 0 ? Math.min(1, charge / required) : 0, charge, required };
}

function faceGroup(face, { nebula, accent }) {
  const centre = faceAngle(face.face), half = 30 - GAP_DEG / 2;
  const from = centre - half, to = centre + half;
  const ratio = face.capacity > 0 ? Math.max(0, Math.min(1, face.remaining / face.capacity)) : 0;
  const valueColour = nebula ? "#5c6a72" : face.down ? ERROR : accent;
  const label = face.down ? `${face.face} ×` : String(face.face);
  const at = polar(NUMBER_RADIUS, centre);
  const title = `Face ${face.face} · ${FACE_NAMES[face.face]} · ${format(face.remaining)} / ${format(face.capacity)} · cost ${format(face.powerPerDamage)} P per damage`;
  return `<g class="face-arc${face.down ? " face-down" : ""}" data-face="${face.face}">`
    + `<title>${escapeHTML(title)}</title>`
    + `<path d="${facePath(RING, centre, half)}" fill="none" stroke="${BASE_TRACK}" stroke-width="${RING_WIDTH}"/>`
    + (ratio > 0 && !face.down ? `<path d="${facePath(RING, centre, half, ratio)}" fill="none" stroke="${valueColour}" stroke-width="${RING_WIDTH}"/>` : "")
    + `<text x="${at.x}" y="${at.y}" text-anchor="middle" dominant-baseline="middle" font-size="20" font-weight="bold" fill="${nebula ? "#6d7c84" : face.down ? ERROR : INK}">${escapeHTML(label)}</text>`
    + `</g>`;
}

// The frame the hull art and its turrets share. `unit` is pixels per
// ship-local unit, so a mount at x = 0.5 sits half a unit to starboard of the
// keel line on the drawn hull, whatever size the art happens to be.
export function hullPlan(ship) {
  const bottom = ship?.spinal ? PLAN_BOTTOM_KEEL : PLAN_BOTTOM_CLEAR;
  const size = Math.min(PLAN_MAX, (bottom - PLAN_TOP) / INK_FRACTION);
  const cy = round2((PLAN_TOP + bottom) / 2);
  return { size: round2(size), cx: CX, cy,
    unit: round2(size * INK_FRACTION / 2 / HULL_EXTENT),
    // A lamp is drawn at r 9 with a hit circle of 14; keep the whole hit
    // circle inside the ring, measured from the RING centre, not the plan.
    limit: RING - RING_WIDTH / 2 - HIT_R };
}

export function lampLayout(mounts, plan = hullPlan(null)) {
  // Anchors are plan-relative; the clamp is ring-relative, because the plan
  // centre shifts down when no keel bar takes the space beneath the hull.
  const drop = plan.cy - CY;
  // Pulling a lamp back towards the hull centre is not a plain scale of its
  // distance from the RING centre, because the plan sits `drop` px below it and
  // that offset does not scale. Solve for the factor k that puts the lamp
  // exactly on the limit circle: |(kx, ky + drop)| = limit.
  const pullback=(x,y)=>{
    const a=x*x+y*y;
    if(!a) return 1;
    const disc=y*y*drop*drop-a*(drop*drop-plan.limit*plan.limit);
    if(disc<0) return 0;
    return Math.max(0,Math.min(1,(-y*drop+Math.sqrt(disc))/a));
  };
  const anchors=mounts.map(m=>{
    const x=num(m.position?.x)*plan.unit,y=-num(m.position?.y)*plan.unit;
    const k=pullback(x,y);
    return {x:x*k,y:y*k};
  });
  const crowded=anchors.some((a,i)=>anchors.some((b,j)=>j<i&&Math.hypot(a.x-b.x,a.y-b.y)<32));
  if(!crowded)return anchors.map(a=>({...a,anchor:a,hit:HIT_R}));
  // Separate display lamps, not the authored mounts. Small leaders retain each
  // physical attachment point. Assign nearest free slots deterministically.
  let step=32,slots=[];
  do {
    slots=[];
    for(let x=-plan.limit;x<=plan.limit;x+=step)for(let y=-plan.limit;y<=plan.limit;y+=step)
      if(Math.hypot(x,y+drop)<=plan.limit)slots.push({x,y});
    if(slots.length>=mounts.length)break;
    step-=2;
  } while(step>=2);
  return anchors.map(anchor=>{
    slots.sort((a,b)=>Math.hypot(a.x-anchor.x,a.y-anchor.y)-Math.hypot(b.x-anchor.x,b.y-anchor.y)||a.y-b.y||a.x-b.x);
    return {...slots.shift(),anchor,hit:Math.min(HIT_R,step/2-1)};
  });
}

function lampGroup(mount, index, { selected, ship, placement, plan }) {
  const { state, label } = mountState(mount, ship);
  const colour = WEAPON_COLOURS[mount.kind] || WEAPON_COLOURS.beam;
  const {x,y}=placement;
  const cx = round2(plan.cx + x), cy = round2(plan.cy + y);
  const arcs = Array.isArray(mount.arc) ? mount.arc.join(",") : "";
  const title = `${index + 1} · ${mount.displayName || mount.type || mount.id} · faces ${arcs} · ${format(num(mount.maxRange))} hex · ${label}`;
  const glow = state === "ready" ? `<circle cx="${cx}" cy="${cy}" r="12.5" fill="none" stroke="${colour}" stroke-width="2.5" opacity="0.35"/>` : "";
  const halo = selected ? `<circle cx="${cx}" cy="${cy}" r="15.5" fill="none" stroke="#ffffff" stroke-width="2"/>` : "";
  const dead = state === "offline" || state === "destroyed"
    ? `<circle cx="${cx}" cy="${cy}" r="11.5" fill="none" stroke="${ERROR}" stroke-width="2"/>`
      + `<line x1="${round2(cx - 7)}" y1="${round2(cy + 7)}" x2="${round2(cx + 7)}" y2="${round2(cy - 7)}" stroke="${ERROR}" stroke-width="2"/>`
    : "";
  return `<g class="lamp lamp-${escapeHTML(mount.kind || "beam")} ${state}${selected ? " selected" : ""}" data-mount="${escapeHTML(mount.id)}" data-mount-index="${index + 1}" data-mount-state="${state}"${state === "spent" ? ' opacity="0.45"' : ""}>`
    + `<title>${escapeHTML(title)}</title>${halo}${glow}`
    + `<circle cx="${cx}" cy="${cy}" r="${LAMP_R}" fill="${colour}"/>${dead}`
    + `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="bold" fill="#0d161c">${index + 1}</text>`
    + `<circle cx="${cx}" cy="${cy}" r="${placement.hit}" fill="transparent" style="pointer-events:all"/></g>`;
}

export function schematicMarkup(ship, { size = 300, selectedMount = null, iconHref = null, nebula = false } = {}) {
  const accent = nebula ? "#5c6a72" : "var(--accent, #7bc6ec)";
  const faces = shieldFaces(ship || {});
  const mounts = Array.isArray(ship?.mounts) ? ship.mounts : [];
  const plan = hullPlan(ship);
  const placements=lampLayout(mounts, plan);
  const leaders=placements.filter(p=>Math.hypot(p.x-p.anchor.x,p.y-p.anchor.y)>1).map(p=>`<path pointer-events="none" d="M${round2(plan.cx+p.anchor.x)},${round2(plan.cy+p.anchor.y)}L${round2(plan.cx+p.x)},${round2(plan.cy+p.y)}" stroke="${MUTED}" opacity=".45" fill="none"/>`).join('');
  const hull = iconHref
    ? `<image href="${escapeHTML(iconHref)}" x="${round2(plan.cx - plan.size / 2)}" y="${round2(plan.cy - plan.size / 2)}" width="${plan.size}" height="${plan.size}" preserveAspectRatio="xMidYMid meet"/>`
    : `<path class="hull-outline" d="${[0, 1, 2, 3, 4, 5].map(i => { const a = (-90 + i * 60) * Math.PI / 180, r = plan.size * 0.4; return `${i ? "L" : "M"} ${round2(plan.cx + Math.cos(a) * r)} ${round2(plan.cy + Math.sin(a) * r)}`; }).join(" ")} Z" fill="none" stroke="${accent}" stroke-width="3"/>`;
  const keel = spinalReading(ship);
  const keelBar = keel ? `<g class="keel-bank" data-keel="${keel.state}">`
    + `<rect x="90" y="206" width="120" height="7" fill="#1a2731" stroke="${BASE_TRACK}" stroke-width="1"/>`
    + (keel.fill > 0 ? `<rect x="90" y="206" width="${round2(120 * keel.fill)}" height="7" fill="${WEAPON_COLOURS.spinal}"/>` : "")
    + `<text x="150" y="224" text-anchor="middle" font-size="11" letter-spacing="1" fill="${WEAPON_COLOURS.spinal}">CANNON ${escapeHTML(keel.label)}</text></g>` : "";
  return `<svg class="console-schematic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" width="${num(size, 300)}" height="${num(size, 300)}" role="img" aria-label="Shield faces, hull and weapon mounts"${nebula ? ' data-nebula="true"' : ""}>`
    + faces.map(face => faceGroup(face, { nebula, accent })).join("")
    + hull
    + `<g class="bow-marker"><path d="M 141 53 L 150 44 L 159 53" fill="none" stroke="${MUTED}" stroke-width="2"/>`
    + `<text x="150" y="68" text-anchor="middle" font-size="13" letter-spacing="2" fill="${MUTED}">BOW</text></g>`
    + leaders + mounts.map((mount, i) => lampGroup(mount, i, { selected: selectedMount != null && mount.id === selectedMount, ship, placement:placements[i], plan })).join("")
    + keelBar
    + `</svg>`;
}

// Direction 0 = east = screen right; directions increase counter-clockwise on
// screen, so screen angle = -60 * direction.
export const HEADING_ANGLE = dir => 0 - 60 * (((num(dir) % 6) + 6) % 6);
export function headingRoseMarkup({ facing = 0, startFacing = facing, plannedFacing = null, turnRate = 1, size = 120 } = {}) {
  const c = 60, inner = 20, outer = 52;
  const here = ((num(facing) % 6) + 6) % 6;
  const rate = Math.max(0, num(turnRate, 1));
  const petals = [0, 1, 2, 3, 4, 5].map(dir => {
    const a = HEADING_ANGLE(dir), lo = (a - 26) * Math.PI / 180, hi = (a + 26) * Math.PI / 180;
    const pt = (r, t) => `${round2(c + Math.cos(t) * r)} ${round2(c + Math.sin(t) * r)}`;
    const delta = Math.min((dir - startFacing + 6) % 6, (startFacing - dir + 6) % 6);
    const reachable = delta <= rate;
    return `<polygon class="rose-petal${reachable ? " reachable" : ""}" data-heading-dir="${dir}"`
      + ` points="${pt(inner, lo)} ${pt(outer, lo)} ${pt(outer, hi)} ${pt(inner, hi)}"`
      + ` fill="${reachable ? "#2b4150" : "#1a2731"}" stroke="${BASE_TRACK}" stroke-width="1" opacity="${reachable ? 1 : 0.5}">`
      + `<title>Heading ${dir}${reachable ? "" : " (beyond turn rate)"}</title></polygon>`;
  }).join("");
  const needle = (dir, colour, dash) => {
    const t = HEADING_ANGLE(dir) * Math.PI / 180;
    return `<line x1="${c}" y1="${c}" x2="${round2(c + Math.cos(t) * 48)}" y2="${round2(c + Math.sin(t) * 48)}"`
      + ` stroke="${colour}" stroke-width="3.5"${dash ? ' stroke-dasharray="5 4"' : ""} stroke-linecap="round"/>`;
  };
  const planned = plannedFacing == null ? null : ((num(plannedFacing) % 6) + 6) % 6;
  return `<svg class="heading-rose" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${num(size, 120)}" height="${num(size, 120)}"`
    + ` role="img" aria-label="Heading ${here}${planned != null && planned !== here ? `, planned ${planned}` : ""}"`
    + ` data-facing="${here}"${planned != null ? ` data-planned="${planned}"` : ""}>`
    + petals
    + (planned != null && planned !== here ? needle(planned, "var(--signal, #edb478)", true) : "")
    + needle(here, "var(--accent, #7bc6ec)", false)
    + `<circle cx="${c}" cy="${c}" r="6" fill="#0d161c" stroke="var(--accent, #7bc6ec)" stroke-width="2"/></svg>`;
}

const SEGMENT_ORDER = ["helm", "weapons", "charge", "free", "reserve"];
// Forecast only from the owned observation, using the same pre-reserve bank step
// as the resolver. Automatic weapon spending is deliberately not estimated.
export function consolePower(ship, order, forecast) {
  if (ship.destroyed) return { pool: 0, rated: ship.ratedPower, helm: null, charge: 0, reserve: 0 };
  const next = structuredClone(ship), pool = next.fullPower ?? next.power;
  next.power = pool;
  if (next.spinal) advanceManualSpinal(next, next.mounts.find(m => m.kind === 'spinal')?.weapon || {}, order.spinal);
  const end = forecast?.actions?.at(-1)?.powerCeiling;
  return { pool, rated: ship.ratedPower, charge: pool - next.power,
    reserve: Math.round(next.power * (order.reserve ?? 0)),
    helm: Number.isFinite(end) ? Math.max(0, next.power - end) : null };
}
export function powerBarMarkup({ pool = 0, rated = 0, helm = 0, weapons = 0, charge = 0, reserve = 0, width = 360 } = {}) {
  const p = Math.max(0, num(pool)), r = Math.max(0, num(rated));
  const demand = { helm: Math.max(0, num(helm)), weapons: Math.max(0, num(weapons)), charge: Math.max(0, num(charge)), reserve: Math.max(0, num(reserve)) };
  const claimed = demand.helm + demand.weapons + demand.charge + demand.reserve;
  const free = Math.max(0, p - claimed);
  const over = claimed > p;
  const span = Math.max(p, claimed, 1);
  const barWidth = Math.max(60, num(width, 360));
  const values = { ...demand, free };
  const segments = SEGMENT_ORDER.map(key => {
    const value = values[key];
    if (value <= 0) return "";
    const w = round2(barWidth * value / span);
    const text = w >= 34 ? `<b>${escapeHTML(format(value))}</b>` : "";
    return `<i data-segment="${key}" title="${key}: ${format(value)} P" style="width:${w}px">${text}</i>`;
  }).join("");
  const aria = `Next refill ${format(p)} of rated ${format(r)}; helm ${helm == null ? 'unresolved' : format(demand.helm)}, automatic weapon spending unestimated, charge ${format(demand.charge)}, reserve floor ${format(demand.reserve)}, remainder before weapons ${format(free)}`;
  return `<div class="power-bar" role="img" aria-label="${escapeHTML(aria)}"${over ? ' data-over="true"' : ""} style="--power-bar-width:${barWidth}px">`
    + `<div class="power-bar-track">${segments}</div>`
    + `<div class="power-bar-readout">Next refill ${format(p)} P · cannon ${format(demand.charge)} · helm ${helm == null ? '?' : format(demand.helm)} · floor ${format(demand.reserve)}<br>Before automatic fire: ${helm == null ? 'unresolved' : format(free + demand.reserve) + ' P'}</div></div>`;
}
