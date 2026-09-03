# Playfield contract (v1, 2026-09-03)

The interactive playfield lets a human command ONE side turn by turn against
the scripted AI, so scenarios can teach — and so what human players actually
do can be recorded and analysed against the AI's choices. This document is
the contract between the playfield page and the engine's turn-by-turn API.

Ruling (Chris): when a ship is selected, its firing arcs, ranges, shield
levels and power must be shown graphically on the map; speed, movement and
changes of direction must be both controllable and visualised on the map.

## Engine API (`src/tactical/resolver.js`, ES modules, browser-safe)

```js
const battle = createBattle(scenario, TUNING, LOADOUTS, seed);   // from a scenario JSON (docs/scenario-format.md)
const view   = battleView(battle);                                // serialisable snapshot for the UI
const plan   = shipPlan(battle, shipId);                          // what this ship may do this turn
const turn   = stepTurn(battle, orders, opts);                    // resolves ONE full turn (three rounds)
```

- `createBattle` places every ship exactly as the scenario says (unplaced
  ships take the line deployment), attaches terrain, seeds the rng, and
  returns a battle object holding `turn` (starting at 1), `fleets` (A, B),
  `terrain`, `tuning`, `rng`, `result` (null until the battle ends).
- `battleView(battle)` returns, for every ship: `id, faction, side,
  className, points, pos {q,r}, facing, destroyed, superstructure / max,
  power / fullPower, movementPointRatio, turnRate, shieldCap[1..6],
  shieldDown[1..6], magazine, mounts[]` where each mount has `id, type,
  kind (beam|missile|spinal), arcName, arc (faces it covers, 1..6),
  maxRange, bands (to, toHitMod, damageBonus), inop, firedThisTurn`; plus
  `squadrons` for carriers and `spinal` state for the gunstar-battlecruiser; plus
  `terrain`, `turn`, `roundsPerTurn`, `map`, and `result`.
- `shipPlan(battle, shipId)` returns `{ turnRate, movementPointRatio,
  spendable, maxHexesPerRound, stepCosts }` so the UI can draw a legal path
  preview: per round a ship may turn at most `turnRate` hexsides and then
  move forward along its facing while power remains (entering an asteroid
  field costs double; terrain and the map edge stop it; it may not end a
  closing step in an enemy hex).
- `stepTurn(battle, orders, opts)` runs the three rounds of one turn. Ships
  named in `orders` follow their orders; every other ship — the whole AI
  side, and any human ship left unordered — uses the scripted helm and
  gunnery exactly as `runBattle` does. Returns `{ turn, rounds: [round
  frames as the recorder writes them], shots, log, result }` and advances
  `battle.turn`. `opts.onRound / onShot / log` behave as in `runBattle`.
- `runBattle` is re-expressed as `createBattle` + a loop of `stepTurn` with
  no orders. This MUST be byte-identical to today's `runBattle` for every
  harness run (the fleet-trial output is the guard), and determinism holds
  for stepped play: the same scenario, seed and orders reproduce the same
  battle.

## Orders (one turn, human side)

```json
{
  "A-destroyer-3": {
    "plan": [ { "turn": -1, "forward": 3 }, { "turn": 0, "forward": 2 }, { "turn": 1, "forward": 0 } ],
    "target": "B-frigate-4",
    "reserve": 0.3
  }
}
```

- `plan` has one entry per round (`roundsPerTurn`, three). `turn` is the
  number of hexsides to rotate before moving that round — positive is
  counter-clockwise (facing 0 = east) — clamped to `±turnRate`; `forward`
  is hexes to move along the new facing, clamped by power and stopped by
  terrain, the map edge and the same-hex rule. The engine reports what was
  actually executed in the round frames and the log ("as ordered" /
  "clamped: power exhausted after 2 hexes").
- `target` is an enemy ship id or `"auto"` (the scripted gunnery chooses).
  Mounts whose arcs do not bear on the target fire at the scripted choice.
- `reserve` (0–1) is the fraction of the pool held back from movement and
  gunnery for shields this turn; omitted = the doctrine default.
- Missing ships → scripted helm and gunnery. Orders for dead ships are
  ignored. Illegal values are clamped, never rejected, and every clamp is
  logged so the player learns the rule.

## Recording for analysis

The playfield records the whole game as a replay in the viewer's format
(round frames, shots, log, terrain, scenario, meta.version 3) plus
`meta.orders`: `[{ turn, side, orders }]` — the human's orders per turn — so
a played game can be replayed in the viewer and the human's choices
compared with what the scripted helm would have done.

## UI requirements (arena/play.html)

- Scenario from a bundled file or handed from the editor (same session key
  the viewer uses); choose which side the human commands.
- Planning phase: the map (the viewer's rendering, camera, icons and
  terrain). Selecting a ship overlays its **firing arcs** (a translucent
  wedge per mount, shaded by range band out to `maxRange`), its **shield
  hexagon** (six faces filled by `shieldCap`, downed faces marked) and its
  **power** (a bar: full pool, reserve, movement cost of the planned path,
  remaining for guns). Movement is planned on the map: rotate within the
  turn rate, then set forward hexes by clicking along the facing or with a
  speed control; the planned path and final facing are drawn, with the
  power cost updating live. Targets are chosen by clicking an enemy.
- **End turn** calls `stepTurn`, then the three rounds play back with the
  viewer's animation and narrative log; then the next planning phase.
  Battle end shows the verdict; the recording can be saved.
