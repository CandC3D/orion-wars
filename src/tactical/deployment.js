// Shared placement geometry. No tuning cache, ship or PRNG mutation during
// validation: a rejected direct-fleet start must leave caller state intact.
import { DIRS } from './hex.js';

export function terrainBlocksShips(type) { return type !== 'asteroids' && type !== 'nebula'; }

export function terrainFootprint(item) {
  if (!item || !Number.isFinite(item.q) || !Number.isFinite(item.r)) return [];
  const center = { q: item.q, r: item.r };
  return item.type === 'planet'
    ? [center, ...DIRS.map(d => ({ q: center.q + d.q, r: center.r + d.r }))]
    : [center];
}

export function deploymentErrors(fleets, terrain = []) {
  const blocking = new Map();
  for (const body of terrain) if (terrainBlocksShips(body.type)) {
    for (const hex of terrainFootprint(body)) blocking.set(`${hex.q},${hex.r}`, body.type);
  }
  return fleets.flat().flatMap(ship => {
    const key = `${ship.pos?.q},${ship.pos?.r}`, type = blocking.get(key);
    return type ? [`${ship.id} placed on terrain (${type}) at ${key}. Move the ship or body before starting.`] : [];
  });
}
