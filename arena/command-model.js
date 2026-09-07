// Shared, DOM-free display conventions derived from authoritative hex geometry.
import { faceFor, bearing, distance } from "../src/tactical/hex.js";
import { shieldAbsorbable } from "../src/tactical/ship.js";
export { bearing, distance };
export const FACE_AT_OFFSET = Array.from({ length: 6 }, (_, dir) => faceFor(0, dir));
export const OFFSET_OF_FACE = Object.fromEntries(FACE_AT_OFFSET.map((face, dir) => [face, dir]));
export const FACE_NAMES = { 1: "forward-port", 2: "forward", 3: "forward-starboard", 4: "aft-starboard", 5: "aft", 6: "aft-port" };
export const FACTIONS = { EAR: "Earth", KRE: "Krelath", VRA: "Vraygon", ZAN: "Zandrax" };
export const HEADINGS = ["E", "NE", "NW", "W", "SW", "SE"];
export const format = value => Number.isFinite(value) ? Number(value.toFixed(4)).toLocaleString("en-US", { maximumFractionDigits:4 }) : "—";
export const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function shipLabel(ship) {
  if (ship.displayName) return `${ship.displayName} ${/-(\d+)$/.exec(ship.id)?.[1]?.padStart(2, '0') || ''}`.trim();
  const name = ship.className === "gunstar-battlecruiser" ? "Gunstar" : ship.className.replaceAll("-", " ");
  const number = /-(\d+)$/.exec(ship.id)?.[1];
  return `${name.replace(/\b\w/g, c => c.toUpperCase())}${number ? ` ${number.padStart(2, "0")}` : ""}`;
}
// Multiple actions can finish in one hex (move, turn in place, hold/fire).
// Keep every action number instead of painting later waypoints over earlier ones.
export function courseMarkers(route) {
  const groups = new Map();
  for (const point of route.filter(p => p.waypoint)) {
    const key = `${point.q},${point.r}`;
    if (!groups.has(key)) groups.set(key, { q: point.q, r: point.r, actions: [] });
    groups.get(key).actions.push({ round: point.round, hold: !!point.hold, facing: point.facing });
  }
  return [...groups.values()];
}
// Report what the authoritative forecast can execute, separately from the
// user's editable request. Count actual steps; do not calculate a second route.
export function courseReadings(forecast, order) {
  return (forecast?.actions || []).map(action => {
    if(action.special?.kind==='warp')return {round:action.round,special:'warp',requested:null,moved:distance(action.start,action.end),
      limited:!action.unavailable&&!action.special.executed,reason:action.special.executed?null:'WARP REFUSED',
      detail:action.notes.join('; '),unavailable:action.unavailable};
    const entry=order?.plan?.[action.round-1];
    const requested = Math.max(0, Math.trunc(Number(entry?.forward) || 0))+Math.max(0,Math.trunc(Number(entry?.burst)||0));
    const moved = forecast.route.filter(p => p.round === action.round && p.moved).length;
    const clamps = action.notes.filter(n => /order clamped:/.test(n));
    const clamp = (moved < requested ? clamps.find(n => !/turn rate/.test(n)) : null) || clamps[0];
    const limited = !action.unavailable && (!!clamp || moved < requested);
    const reason = !limited ? null : /enemy's hex/.test(clamp) ? "CONTACT BLOCK"
      : /power exhausted/.test(clamp) ? "POWER LIMIT"
      : /impassable terrain|map edge/.test(clamp) ? "TERRAIN / EDGE"
      : /spinal charge plants/.test(clamp) ? "CHARGE PLANT"
      : /turn rate/.test(clamp) ? "TURN LIMIT" : action.notes.some(n=>/burst refused/.test(n)) ? "BURST REFUSED" : "COURSE LIMIT";
    return { round: action.round, requested, moved, limited, reason, detail: clamps.join("; "), unavailable: action.unavailable };
  });
}
export function shields(ship) {
  return [1, 2, 3, 4, 5, 6].map(face => {
    const max=ship.shieldGenerators?.[face]?.capacity ?? ship.shieldMax ?? 0;
    const ratio=ship.shieldGenerators?.[face]?.powerPerDamage ?? ship.shieldPointRatio;
    const affordable=ratio>0?Math.floor(Math.max(0,ship.power)/ratio):0;
    const down = !!ship.shieldDown?.[face], cap = Math.max(0, ship.shieldCap?.[face] ?? 0);
    const remaining = down ? 0 : cap;
    const status = ship.destroyed ? "DESTROYED" : down ? "OFFLINE" : ship.shieldsBypassed ? "BYPASSED" : affordable === 0 ? "NO POWER" : Math.floor(remaining) === 0 ? "EXHAUSTED" : affordable < Math.floor(remaining) ? "POWER LIMITED" : "INTACT";
    return { face, max, remaining, percent: max > 0 ? Math.round(remaining / max * 100) : 0, down, status,
      absorbable: down || ship.destroyed || ship.shieldsBypassed ? 0 : shieldAbsorbable(ship,face) };
  });
}
