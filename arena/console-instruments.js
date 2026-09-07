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
const MOUNT_SCALE = 42;         // hull-relative +/-1.3 -> +/-55px, inside the 120px hull art
const MOUNT_LIMIT = 96;         // hard clamp: lamp hit circle (r 14) stays clear of the ring
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
    + `<path d="${arcPath(RING, from, to)}" fill="none" stroke="${BASE_TRACK}" stroke-width="${RING_WIDTH}"/>`
    + (ratio > 0 && !face.down ? `<path d="${arcPath(RING, from, from + (to - from) * ratio)}" fill="none" stroke="${valueColour}" stroke-width="${RING_WIDTH}"/>` : "")
    + `<text x="${at.x}" y="${at.y}" text-anchor="middle" dominant-baseline="middle" font-size="20" font-weight="bold" fill="${nebula ? "#6d7c84" : face.down ? ERROR : INK}">${escapeHTML(label)}</text>`
    + `</g>`;
}

export function lampLayout(mounts) {
  const anchors=mounts.map(m=>{
    let x=num(m.position?.x)*MOUNT_SCALE,y=-num(m.position?.y)*MOUNT_SCALE;
    const k=Math.min(1,MOUNT_LIMIT/(Math.hypot(x,y)||1));
    return {x:x*k,y:y*k};
  });
  const crowded=anchors.some((a,i)=>anchors.some((b,j)=>j<i&&Math.hypot(a.x-b.x,a.y-b.y)<32));
  if(!crowded)return anchors.map(a=>({...a,anchor:a,hit:HIT_R}));
  // Separate display lamps, not the authored mounts. Small leaders retain each
  // physical attachment point. Assign nearest free slots deterministically.
  let step=32,slots=[];
  do {
    slots=[];
    for(let x=-MOUNT_LIMIT;x<=MOUNT_LIMIT;x+=step)for(let y=-MOUNT_LIMIT;y<=MOUNT_LIMIT;y+=step)
      if(Math.hypot(x,y)<=MOUNT_LIMIT)slots.push({x,y});
    if(slots.length>=mounts.length)break;
    step-=2;
  } while(step>=2);
  return anchors.map(anchor=>{
    slots.sort((a,b)=>Math.hypot(a.x-anchor.x,a.y-anchor.y)-Math.hypot(b.x-anchor.x,b.y-anchor.y)||a.y-b.y||a.x-b.x);
    return {...slots.shift(),anchor,hit:Math.min(HIT_R,step/2-1)};
  });
}

function lampGroup(mount, index, { selected, ship, placement }) {
  const { state, label } = mountState(mount, ship);
  const colour = WEAPON_COLOURS[mount.kind] || WEAPON_COLOURS.beam;
  const {x,y}=placement;
  const cx = round2(CX + x), cy = round2(CY + y);
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
  const placements=lampLayout(mounts);
  const leaders=placements.filter(p=>Math.hypot(p.x-p.anchor.x,p.y-p.anchor.y)>1).map(p=>`<path pointer-events="none" d="M${CX+p.anchor.x},${CY+p.anchor.y}L${CX+p.x},${CY+p.y}" stroke="${MUTED}" opacity=".45" fill="none"/>`).join('');
  const hull = iconHref
    ? `<image href="${escapeHTML(iconHref)}" x="90" y="90" width="120" height="120" preserveAspectRatio="xMidYMid meet"/>`
    : `<path class="hull-outline" d="${[0, 1, 2, 3, 4, 5].map(i => { const p = polar(48, -90 + i * 60); return `${i ? "L" : "M"} ${p.x} ${p.y}`; }).join(" ")} Z" fill="none" stroke="${accent}" stroke-width="3"/>`;
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
    + leaders + mounts.map((mount, i) => lampGroup(mount, i, { selected: selectedMount != null && mount.id === selectedMount, ship, placement:placements[i] })).join("")
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
