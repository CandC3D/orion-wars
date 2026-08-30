// Hex geometry for the tactical layer. Axial coordinates (q, r), pointy-top.
// Six directions, indices 0-5, used for both movement and facing.

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

// Cartesian projection, used only to turn a vector into a direction index.
function cart(pos) {
  return { x: Math.sqrt(3) * (pos.q + pos.r / 2), y: -1.5 * pos.r };
}

// Which of the six directions does `to` lie in, seen from `from`?
export function bearing(from, to) {
  const a = cart(from);
  const b = cart(to);
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const norm = (deg + 360) % 360;
  return Math.round(norm / 60) % 6;
}

// Shields are numbered clockwise from front-left: #1 front-left, #2 forward,
// #3 front-right, #4 rear-right, #5 rear, #6 rear-left. Offset 0 is dead ahead.
const SHIELD_BY_OFFSET = [2, 3, 4, 5, 6, 1];

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
