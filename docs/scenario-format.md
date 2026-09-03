# Scenario format (v1, 2026-09-02)

A scenario places every element of a tactical battle explicitly. It is the
contract between the game editor, the recorder and the engine.

```json
{
  "name": "Ambush at the Twin Moons",
  "seed": "any string - same seed, same battle",
  "map": { "widthHexes": 72, "heightHexes": 40 },
  "terrain": [
    { "type": "planet", "q": 0,  "r": 0 },
    { "type": "moon",   "q": 8,  "r": -6 }
  ],
  "sides": [
    { "faction": "EAR", "ships": [
      { "className": "dreadnought",   "q": -14, "r": 0, "facing": 0 },
      { "className": "light-cruiser", "q": -14, "r": 2, "facing": 0 },
      { "className": "frigate" }
    ]},
    { "faction": "KRE", "ships": [
      { "className": "carrier",       "q": 14, "r": 0, "facing": 3 },
      { "className": "frigate",       "q": 12, "r": -2, "facing": 3 }
    ]}
  ]
}
```

Rules:
- **Coordinates** are pointy-top axial `q, r` (x = √3·(q + r/2), y = −1.5·r).
  A hex is on the map when `|q + r/2| ≤ widthHexes/2` and `|r| ≤ heightHexes/2`.
- **Facing** 0 = east, counter-clockwise by 60° per step (0–5).
- **Terrain**: `moon` and `asteroid` (a large asteroid) each occupy one hex;
  `planet` occupies its hex plus the six neighbours (a seven-hex rosette).
  None of these may be entered, warped into or deployed on, and all block
  line of fire (beams, missile launches and the spinal cannon) along the hex
  line between shooter and target. `asteroids` (an asteroid field) occupies
  one hex and is **passable but slow** - entering costs twice the ship's
  normal movement power (`battle.terrainRules.asteroids.moveCostMultiplier`)
  - and **blocks fire in and out**: a ship inside a field can neither shoot
  nor be shot at, and no line of fire may cross a field. Ships may deploy in
  a field and warp into one.
- **Ships without `q`/`r`** are placed by the engine's line-of-battle
  deployment for their side (side 0 west facing east, side 1 east facing
  west); explicitly placed ships keep their positions. Placing a ship on
  terrain is an error.
- **Factions**: EAR, VRA, ZAN, KRE — any pairing, including mirror matches.
  Class names are the keys of `hullClasses` in `data/tactical-tuning.json`;
  which classes a faction may field are listed in `rosters.<faction>` in the
  same file (the five common hulls plus that power's uniques — NOT the keys of
  `data/loadouts.json`, which lists only faction-specific weapon fits).
  Points per class are in `hullClasses.<class>.points`. `facing` must be an
  integer 0–5.
- **Same-hex rule** (FASA): ships may share a hex and cannot fire at each
  other while they do. There is no collision.

Engine API (`src/tactical/resolver.js`):

```js
const { fleets, terrain, tuning } = buildScenario(scenario, TUNING, LOADOUTS, rng);
const result = runBattle(fleets, tuning, rng, { terrain, onRound, onShot, log });
```

`rng` is `makePrng(seedFromString(scenario.seed))` from `src/prng.js`. The
same seed always reproduces the same battle. The engine has no Node
dependencies and runs unchanged in a browser as ES modules.
