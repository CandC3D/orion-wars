# Playfield contract (v1, 2026-09-03)

Current extension (2026-09-06): actions support exclusive `warp: true` or an
integer `burst` extension alongside normal turn/forward. Exact execution costs,
constraints, forecasts and failure behavior are in
`docs/tactical-ai/special-commands/README.md`. These supersede the earlier notes
below that ordered ships could not use specials and zero-gain bursts paid stress.

Authored-scenario extension (2026-09-06): editor/imported/bundled games explicitly
request `{ fleetFloorPolicy: "warn" }` at validation and engine construction.
Quick build remains strict, and restart retains the initiating host policy.
Class floor exceptions are visible and recorded; all other fleet and deployment
errors remain blocking. Failed replacement does not overwrite the current battle
or restart source. See `docs/tactical-ai/scenario-rulings/README.md`.

The interactive playfield lets a human command ONE side turn by turn against
the scripted AI, so scenarios can teach — and so what human players actually
do can be recorded and analysed against the AI's choices. This document is
the contract between the playfield page and the engine's turn-by-turn API.

## Current implementation notes — 2026-09-05

Chris approved two geometry rules: the counter-clockwise sector owns an exact
face boundary, and either hex at an exact edge-grazing line sample can block
fire. The engine and clients share the exact bearing classifier; line-of-fire
checks retain simultaneous cell groups for terrain/nebula depth. New recordings
identify these rules as `meta.geometryRules: "ccw-seams-grazing-blocks-v1"`.
These are rule changes, so pre-geometry balance results are historical.

The API's missing-order fallback remains scripted helm/gunnery. The Stage 3.1
client, however, submits explicit hold/fire orders (30% reserve) for **every**
living human ship at commit, including ships never inspected. Selecting a ship
does not change that packet's default behavior. Enemy ships remain AI-controlled.

`previewOrders` is the current course/fire forecast: it runs real movement,
charge and weapon allocation on private copies, assuming stationary contacts
and no incoming/outgoing damage, initiative or cloak coordination. `shipPlan`
provides static helm properties, not a guaranteed affordable full-turn route.

Ordered translation observes the established charging/ready spinal plant;
turning is still allowed. A requested move that is clamped does not become a
free firing action. Movement cannot finish in a living enemy's hex when the
same-hex restriction is enabled, including a forced stop at terrain, an edge or
a power limit. Legal transit and friendly co-location remain allowed; only
committed steps consume power or appear in the preview.

The same endpoint protection now covers every scripted helm movement path and
warp landing. AI transit through enemy hexes remains legal; an occupied ending
suffix is discarded with its movement cost restored before the next actor acts.
Warp refuses an occupied destination without spending jump power or allowance.

Every scripted helm step must also afford the actual destination's terrain
price without spending reserved power. Formation, mutual support, orbit and
evasion use the same step guard. Refusing an unaffordable step consumes no
power or moved-distance. The Zandrax emergency burst explicitly waives power
but retains terrain legality and its existing stress/accuracy costs.

The engine validates flagship objectives at scenario construction and the
direct-fleet entry point. Each side must field exactly one named protected
class. A supplied wreck counts as fielded (and can validly end an objective);
an absent class does not. No roster floors were added to the direct-fleet API.

New version-3 recordings advertise `meta.eventGeometry: "resolution-v1"`.
Shot events add `shooterPos`, `shooterFacing`, `targetPos`, `targetFacing`, and,
when damage lands, `victimId`, `victimPos`, `victimFacing`, `face`. `targetId`
continues to name the intended target; screening can change the victim.
Timed-homing recordings additionally advertise `meta.missileFlight: "timed-homing/1"`.
Missiles retain next-turn, pre-refill arrival, with action-end course updates.
Their own final approach and the victim's impact-time heading determine the face;
`shooterPos` remains launch attribution, while `approachPos` and `flight.path`
record projectile geometry. Action frames carry copied pending `missiles`.
See `tactical-ai/missile-homing/README.md` for the fixed-arrival formula and limits.
Old recordings still load using their legacy geometry fallback; their
missing event-time geometry cannot be recovered exactly. Round-based playback
remains a compressed presentation, not a complete initiative-event timeline.

The original v1 description below is retained for historical context. Its
byte-parity claim applies to the API extraction, not later audited rule fixes.

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
