// Ship-local placement, shared by pointer, numeric and keyboard controls.
// Snap around the ship origin, never screen pixels. Reflection is exact about
// the forward/aft (2–5) axis; it creates an independent installation, not a link.
export const GRID_STEPS = Object.freeze([0.1, 0.05, 0.025, 0.01]);
const round = n => Number(n.toFixed(5));
const clamp = n => Math.max(-2, Math.min(2, n));
export function snapPosition(position, { snap = true, step = 0.05, axis = true } = {}) {
  if (!GRID_STEPS.includes(step)) throw new Error('Unsupported placement grid');
  const out = { ...position };
  for (const key of ['x','y']) {
    if (!Number.isFinite(position[key])) throw new Error('Position must be finite');
    // Symmetric tie rounding makes ± half-grid points reflect identically.
    const n = clamp(position[key]);
    out[key] = round(snap ? Math.sign(n) * Math.round(Math.abs(n) / step + 1e-10) * step : n);
  }
  if (axis && Math.abs(position.x) <= step * 0.6) out.x = 0;
  return out;
}
export function mirroredMount(mount, id) {
  const faces = { 1:3, 2:2, 3:1, 4:6, 5:5, 6:4 };
  return { ...structuredClone(mount), id,
    position: { ...mount.position, x: round(-mount.position.x) },
    orientation: round(-mount.orientation), faces: mount.faces.map(f => faces[f]).sort((a,b) => a-b) };
}
