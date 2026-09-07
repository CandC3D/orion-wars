// Hex geometry for the tactical layer. Axial coordinates (q, r), pointy-top.
// Six directions, indices 0-5, used for both movement and facing.
export const GEOMETRY_RULESET = "ccw-seams-grazing-blocks-v1";

export const DIRS = [
  { q: 1, r: 0 },   // 0  east
  { q: 1, r: -1 },  // 1  north-east
  { q: 0, r: -1 },  // 2  north-west
  { q: -1, r: 0 },  // 3  west
  { q: -1, r: 1 },  // 4  south-west
  { q: 0, r: 1 }    // 5  south-east
];

export function distance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

export function add(pos, dir, n = 1) {
  return { q: pos.q + DIRS[dir].q * n, r: pos.r + DIRS[dir].r * n };
}

// Which of the six directions does `to` lie in, seen from `from`?
// RULING 2026-09-05 (Chris): the counter-clockwise sector owns an exact
// boundary. Sorting the relative cube coordinates identifies each sextant
// without atan2/rounding noise or a position-dependent epsilon.
export function bearing(from, to) {
  const q = to.q - from.q, r = to.r - from.r, s = -q - r;
  if (q === 0 && r === 0) return 0;
  if (q >= r && r > s) return 0;
  if (q > s && s >= r) return 1;
  if (s >= q && q > r) return 2;
  if (s > r && r >= q) return 3;
  if (r >= s && s > q) return 4;
  return 5; // r > q >= s
}

// Shields are numbered clockwise from front-left: #1 front-left, #2 forward,
// #3 front-right, #4 rear-right, #5 rear, #6 rear-left. Offset 0 is dead ahead.
// RULING 2026-09-03 (Chris): shield faces number CLOCKWISE around the bow, as
// on the FASA sheet - 1 front-left, 2 forward,
// 3 front-right, 4 rear-right, 5 rear, 6 rear-left. Hex direction indices
// increase counter-clockwise, so one step counter-clockwise from the bow
// meets face 1 (front-left). (The table was [2,3,4,5,6,1] before, which put
// "front-right" on the icon's left.)
const SHIELD_BY_OFFSET = [2, 1, 6, 5, 4, 3];

// Which shield number faces direction `dir` on a ship holding heading `facing`?
export function faceFor(facing, dir) {
  return SHIELD_BY_OFFSET[(dir - facing + 6) % 6];
}

// Which shield number on `target` faces an attack arriving from `attackerPos`?
export function shieldFacing(target, attackerPos) {
  return faceFor(target.facing, bearing(target.pos, attackerPos));
}

// Is `other` inside the 60-degree arc originating from `face` of `observer`?
// `face` is a shield number 1-6.
export function inArc(observer, face, otherPos) {
  const offset = SHIELD_BY_OFFSET.indexOf(face);
  const arcDir = (observer.facing + offset) % 6;
  return bearing(observer.pos, otherPos) === arcDir;
}

// Turn `facing` toward `targetDir` by at most one step per call.
export function turnToward(facing, targetDir) {
  if (facing === targetDir) return facing;
  const cw = (targetDir - facing + 6) % 6;
  return cw <= 3 ? (facing + 1) % 6 : (facing + 5) % 6;
}

// Distance-step cube line, with every equally near hex retained at a grazing
// edge. Each group is one simultaneous sample, not a sequence of two visits.
// Rational numerators keep exact ties exact under rotation and translation.
// This preserves the existing sampled-line definition; it is not a continuous
// polygon-intersection/vertex-supercover rule. Endpoints are singleton groups.
export function hexLineGroups(a, b) {
  const n = distance(a, b);
  if (n === 0) return [[{ q: a.q, r: a.r }]];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const nq = a.q * n + (b.q - a.q) * i;
    const nr = a.r * n + (b.r - a.r) * i;
    const q0 = Math.floor(nq / n), r0 = Math.floor(nr / n);
    let best = Infinity, group = [];
    for (let q = q0; q <= q0 + 1; q++) for (let r = r0; r <= r0 + 1; r++) {
      const dq = q * n - nq, dr = r * n - nr;
      const error = dq * dq + dr * dr + (dq + dr) * (dq + dr);
      if (error < best) { best = error; group = [{ q, r }]; }
      else if (error === best) group.push({ q, r });
    }
    out.push(group);
  }
  return out;
}

// Flat coverage for callers that only need membership. Fire penetration uses
// groups so arbitrary ordering of two grazed cells cannot change its result.
export function hexLine(a, b) {
  return hexLineGroups(a, b).flat();
}
