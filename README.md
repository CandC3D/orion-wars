# The Orion Wars

A single-player strategic wargame in the browser. Four powers — the **Earth
Federation** (blue), the **Vraygon Star Realm** (gold), the **Zandrax Horde**
(red), and the **Krelath Empire** (green) — fight a limited war over a
contested zone of independent worlds where their spheres meet. Mutual
deterrence closes each power's home sphere to invasion, so the war is fought
entirely over the independents. Victory is worlds held when the war ends.

Original setting and ships; no licensed material.

## Status: Phase 1 — Engine core (complete, awaiting check-in)

Headless rules engine with a placeholder world graph, seeded PRNG, save/load,
and a WEGO turn loop (movement + economy phases live; combat, assault, and
unrest are stubs behind frozen interfaces for Phases 2 and 5).

```bash
node test/harness.js
```

runs a full 48-turn war on random legal orders from all four powers and
verifies: determinism (seed + order log replays exactly), lossless mid-war
save/load, and the deterrence rule (no foreign fleets in home spheres).

## Powers

| Power | Color | Doctrine |
|---|---|---|
| Earth Federation | Blue | Deep shields, torpedo throw-weight; absorbs independents slowly, holds durably |
| Vraygon Star Realm | Gold | Richest treasury, sturdiest hulls, slowest yards; buys what it cannot storm |
| Zandrax Horde | Red | Speed and heavy beams on thin shields; conquers fastest, holds worst |
| Krelath Empire | Green | Short-range warp jump and ambush volley; smallest economy |

Each fields six hull classes: Frigate (1 pt), Destroyer (2), Light Cruiser
(4), Heavy Cruiser (8), Battleship (16), plus one hull unique to the power —
Earth Command Ship (8), Vraygon Monitor (16), Zandrax Corvette (0.5), Krelath
Strike Cruiser (4). The 3D models are in `assets/models/`, referenced by the
`model` field on each ship class.

## Tactical combat trials

```bash
node test/fleet-trial.js
```

Runs point-buy fleets against each other and reports win rates, plus a
concentration-of-force matrix. `--watch EAR KRE` narrates a single battle.
Design and current findings: [docs/tactical-design.md](docs/tactical-design.md).

## Layout

- `src/tuning.js` — **the** tuning table; every balance constant lives here
- `src/prng.js` — seeded PRNG (mulberry32); all engine randomness flows through it
- `src/map.js` — warp-lane graph, pathfinding, deterrence rule, supply tracing
- `src/model.js` — game state, new game, save/load
- `src/orders.js` — order validation + random legal-order generation
- `src/combat.js` — the frozen combat interface; Phase 1 stub resolver
- `src/engine.js` — WEGO turn pipeline: movement → combat → assault → economy → unrest
- `data/worlds-placeholder.json` — placeholder graph: four home spheres around 12 contested worlds (to be replaced by the Orion Wars map)
- `data/factions.json` — four orders of battle, first-draft stats for review
- `assets/models/` — 24 ship STLs (4 powers × 6 classes)
- `src/tactical/` — hex geometry, ship model, and combat resolver
- `data/tactical-tuning.json` — all tactical balance constants
- `data/loadouts.json` — which weapons each power fits to each hull
- `test/harness.js` — full-war harness
- `test/fleet-trial.js` — fleet action trials

## Battle arena (handed to Sol/Codex)

A watch-only browser arena for observing tactical battles — recorder script +
static replay viewer. Spec: [docs/arena-brief.md](docs/arena-brief.md).

## Ship visual assets

A Blender MCP polish pass on the 24 STLs is the next art task; the starting
brief — color schemes, surface language per species, and rulings — is
[docs/ship-asset-brief.md](docs/ship-asset-brief.md).

## Open rulings (Chris's — the build does not decide these)

- **Assault capacity.** The dedicated planetary-assault hull is gone with the
  five-class ladder. Provisional: assault capacity rides on Heavy Cruisers and
  Battleships, screening on Frigates and Destroyers. This keeps "kill the
  troop carriers to save the world" alive, but now the assault ships are also
  the line-of-battle ships — a real change to the original design tension.
- **Map.** Chris is supplying the Orion Wars map, which replaces the placeholder
  graph. World count, lane topology, and home-sphere placement come from it.
- War length (default 48 monthly turns), turn cadence (monthly WEGO).
- Player seat: all four powers are symmetric at engine level; UI will expose
  the Earth Federation first.
- Flagship mechanic: omitted, but the engine does not preclude it.

## Play online

The scenario editor and battle arena are published by GitHub Pages:
https://candc3d.github.io/orion-wars/arena/editor.html
