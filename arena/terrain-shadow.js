// Terrain shadow for the SELECTED own ship: where its sensors cannot see, and
// where its weapons cannot reach through, given the terrain on the board.
//
// Everything here is observation-derived. `sensorPathClear` reads only
// `battle.terrain` and `battle.tuning.battle.terrainRules`, so an
// observation-shaped stand-in is enough; `publicWeaponGeometry` is already
// exported and returns the engine's own line-of-fire verdict. No hidden state
// is read, nothing about an enemy is inferred: this is the shape of the terrain
// seen from a hex the player owns.
//
// MEASURED (2026-09-07): across every scenario carrying terrain, seven firing
// positions each, 36,512 cells, no cell was fire-blocked while sensor-clear.
// So the cheap sensor test runs over the whole grid and the costlier fire test
// only over the shadow, which is what keeps a redraw affordable. If that ever
// stops holding, the overlay under-reports blocked fire rather than misreporting
// sight - and test/terrain-shadow.mjs fails.
import { sensorPathClear } from '../src/tactical/sensing.js';
import { publicWeaponGeometry } from '../src/tactical/resolver.js';
import { hexGridPath } from './contact-map-layout.js';

const SHADOW = '#33506a', BLIND = '#efb773';
// One all-round, effectively unbounded probe mount, so the only verdicts that
// can come back are the terrain ones - never range or bearing.
const PROBE = Object.freeze({ kind: 'beam', maxRange: 4096, arc: [1, 2, 3, 4, 5, 6],
  bands: [{ to: 4096, damageBonus: 0 }] });

export function shadowTuning(view) {
  return { battle: { terrain: view.terrain, terrainRules: view.rules.terrain,
    sameHexNoFire: view.rules.movement.sameHexNoFire } };
}
const sensingStandIn = view => ({ terrain: view.terrain, tuning: { battle: { terrainRules: view.rules.terrain } } });

// 'clear' | 'shadow' (blind and cannot fire through) | 'blind' (cannot see, CAN fire)
export function classifyCell(from, cell, view, cache = null) {
  const key = cache ? `${cell.q},${cell.r}` : null;
  if (cache && cache.has(key)) return cache.get(key);
  let verdict = 'clear';
  if (!sensorPathClear(sensingStandIn(view), from, cell)) {
    const reason = publicWeaponGeometry({ pos: from, facing: 0, mounts: [PROBE] }, PROBE,
      { pos: cell, facing: 0 }, shadowTuning(view));
    verdict = (reason === 'Line of fire blocked' || reason === 'Nebula visibility') ? 'shadow' : 'blind';
  }
  if (cache) cache.set(key, verdict);
  return verdict;
}

// A cache is keyed by the observing hex; the caller drops it when the ship or
// the terrain changes, so panning and zooming reuse the work.
export function shadowCache(from) { return { from: `${from.q},${from.r}`, cells: new Map() }; }

export function shadowMask(ship, view, cells, cache = null) {
  const out = { shadow: [], blind: [] };
  if (!ship || ship.destroyed || !Array.isArray(view?.terrain) || !view.terrain.length) return out;
  const store = cache && cache.from === `${ship.pos.q},${ship.pos.r}` ? cache.cells : null;
  for (const cell of cells) {
    if (cell.q === ship.pos.q && cell.r === ship.pos.r) continue;
    const verdict = classifyCell(ship.pos, cell, view, store);
    if (verdict === 'shadow') out.shadow.push(cell);
    else if (verdict === 'blind') out.blind.push(cell);
  }
  return out;
}

export function shadowMarkup(ship, view, cells, { project, scale, cache = null } = {}) {
  const mask = shadowMask(ship, view, cells, cache);
  if (!mask.shadow.length && !mask.blind.length) return '';
  const parts = [];
  if (mask.shadow.length)
    parts.push(`<path data-shadow="sensor" d="${hexGridPath(mask.shadow, project, scale)}" fill="${SHADOW}" fill-opacity=".26" stroke="${SHADOW}" stroke-opacity=".5" stroke-width=".8">`
      + `<title>Terrain shadow: no sensor contact and no line of fire from this hull's position</title></path>`);
  // Rare, and worth its own mark: the line of fire is open where sight is not.
  if (mask.blind.length)
    parts.push(`<path data-shadow="blind" d="${hexGridPath(mask.blind, project, scale)}" fill="${BLIND}" fill-opacity=".1" stroke="${BLIND}" stroke-opacity=".5" stroke-width="1" stroke-dasharray="3 3">`
      + `<title>Blind but able to fire: no sensor contact here, though the line of fire is open</title></path>`);
  return `<g class="terrain-shadow" data-shadow-hexes="${mask.shadow.length}" data-blind-hexes="${mask.blind.length}" pointer-events="none" role="img" aria-label="Terrain shadow from the selected hull: ${mask.shadow.length} hexes blind, ${mask.blind.length} blind but within a clear line of fire">${parts.join('')}</g>`;
}
