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
      { "className": "gunstar-battlecruiser",   "q": -14, "r": 0, "facing": 0 },
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
  `nebula` occupies one hex (paint several for a cloud) and follows the
  Mutara pattern: passable; a ship inside can engage and be engaged only
  within `battle.terrainRules.nebula.visibilityHexes` (3); every shot with a
  ship in the fog at either end takes a to-hit penalty (2); **shields are
  useless inside** - every hit on a ship in a nebula bypasses its shields;
  and **from outside, weapons penetrate no further than the first fog hex**
  (beams decohere, missiles lose lock) - nothing crosses a nebula and
  nothing reaches its interior from outside.
- **Ships without `q`/`r`** are placed by the engine's line-of-battle
  deployment for their side (side 0 west facing east, side 1 east facing
  west); explicitly placed ships keep their positions. A moon, large asteroid,
  or any of a planet's seven cells cannot contain a deployed ship. This applies
  to automatic and mixed placement too. Asteroid fields and nebulae are legal
  starting positions. The loader rejects illegal placement, never relocates it.
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
// For an authored/saved scenario, keep its roster and DISPLAY these warnings.
// Omit the policy argument for strict harness / fleet-construction validation.
const { fleets, terrain, tuning, warnings = [] } = buildScenario(
  scenario, TUNING, LOADOUTS, rng, { fleetFloorPolicy: "warn" }
);
warnings.forEach(message => console.warn(message));
const result = runBattle(fleets, tuning, rng, { terrain, onRound, onShot, log });
```

`rng` is `makePrng(seedFromString(scenario.seed))` from `src/prng.js`. The
same seed always reproduces the same battle. The engine has no Node
dependencies and runs unchanged in a browser as ES modules.

### Authored fleet exceptions (Chris, 6 September 2026, design §34)

The scenario editor, editor/imported/bundled playfield engagements and scenario
recorder **warn and load** a fleet below a class's `minFleetPoints`. No ship is
added, removed, repriced or re-pinned. Warnings remain visible in play and travel
in recording metadata to the replay viewer; scenario JSON stays unchanged.
Roster restrictions, ship-count limits, invalid pinned designs and unsatisfiable
objectives remain errors. Deployment restrictions are never warnings.

Quick build, the composition harness and fleet recorder remain strict. The
low-level `buildScenario`, `createBattle` (fifth argument) and `validateScenario`
APIs default to strict validation; only a trusted loader opts into `warn`.
Putting `fleetFloorPolicy` or `historicalFloorOverride` in scenario JSON grants
no exemption. `scenarioIssues` returns separate `errors` and `warnings` for UIs.
The low-level direct-fleet simulation API does not construct or re-price fleets;
it now validates body occupancy before mutating caller-owned ships.

## Arc glossary (ruling 2026-09-03)

Shield faces number clockwise around the bow: **1** forward-port, **2**
forward, **3** forward-starboard, **4** aft-starboard, **5** aft, **6**
aft-port. Weapon arcs are sets of faces (`arcs` in `data/tactical-tuning.json`):

| arc | faces | meaning |
|---|---|---|
| `f` | 2 | forward only |
| `a` | 5 | aft only |
| `fwd` | 1, 2, 3 | forward 180 |
| `aft` | 4, 5, 6 | aft 180 |
| `p` | 6, 1 | port broadside |
| `s` | 3, 4 | starboard broadside |
| `fp` | 1, 2 | port fore |
| `fs` | 2, 3 | starboard fore |
| `pa` | 5, 6 | port rear |
| `sa` | 4, 5 | starboard rear |
| `bow` | 6, 1, 2, 3, 4 | forward turret: everything but dead astern |
| `stern` | 3, 4, 5, 6, 1 | rear turret: everything but dead ahead |
| `all` | 1–6 | all-round |
| `pfwd` | 6, 1, 2 | port bow 180 |
| `sfwd` | 2, 3, 4 | starboard bow 180 |
| `broad` | 6, 1, 3, 4 | two-turret broadside |
| `pb` | 1 | port bow only |
| `sb` | 3 | starboard bow only |

The bow and stern turrets overlap on faces 1, 3, 4 and 6 — the two-turret
broadside.  That overlap is now a preset in its own right, `broad`.

The five arcs below `all` were named on 2026-09-07 (ruling: Chris) after a survey
found six face-sets in use with no preset behind them, which the interface could
only render as `custom (1,2,6)`. `pfwd` and `sfwd` are true 180-degree spans
rotated one face off the bow, so they belong to the forward-180 family rather
than to the broadsides. Every arc in use is now named: 18 of 18, no mount falls
back to a custom label.

The same survey found the Vraygon battleship's sixth mount bearing on faces
3, 4 and 6 — a disconnected arc, with a gap at dead astern and face 6 stranded
on the far side of it, unlike every other arc in the game. Chris ruled it a slip
and face 6 was removed, leaving the starboard broadside.
