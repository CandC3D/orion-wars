# The Asterion scenarios at 20 turns

10 September 2026. Both bundled Asterion scenarios went from a 12-turn to a 20-turn limit in the
playtest of 10 September, and the point-defence radius went from 3 to 4 hexes. Chris: "We'll run
balance on it."

Harness: `node scripts/scenario-balance.mjs <scenario.json> --battles N [--max-turns T] [--pd R]`.
It runs the scenario AI-vs-AI through the engine's own scenario path, seeds `${seed}/${i}`, so the
same arguments always print the same numbers. 5000 battles per row. Earth is side A.

## Point defence returns to 3 hexes

Later the same day Chris reverted the radius: "let's go back to 3 - a worthy experiment we may revisit
in some other form someday." Radius 4 cost Earth 13.8 points against the Zandrax in the fleet corpus
(83 fewer wins in 600) and 5.2 against the Vraygon; Earth's doctrine is torpedo weight of fire, and a
wider enemy umbrella intercepts more of it. The live figures for both scenarios, 20 turns, PD 3,
5000 battles:

- The Asterion Line: **Earth 53.3%**, Krelath 45.0%, draw 1.7%, median 9 turns.
- The Asterion Line - Battleship (rebalanced below): **Earth 55.1%**, Krelath 44.1%, draw 0.8%,
  median 14 turns, 70.4% flagship kills.

The tables below were measured while the radius was 4; the PD-3 rows are included where they were run.

## The Asterion Line (the tutorial): no change needed

| Turns | PD | Earth | Krelath | Draw | Median turns | Flagship kill | On points |
|---|---|---|---|---|---|---|---|
| 12 | 3 | 53.2% | 45.2% | 1.7% | 9 | 64.9% | 33.7% |
| 12 | 4 | 54.4% | 44.2% | 1.4% | 9 | 64.4% | 34.4% |
| 20 | 3 | 53.3% | 45.0% | 1.7% | 9 | 69.7% | 28.7% |
| **20** | **4** | **54.7%** | **43.8%** | 1.5% | 9 | 69.8% | 28.9% |

Still the 55/45 with the small edge in the learner's seat that the 7 September rebuild set. The
longer limit turns about five points of points-decided battles into flagship kills; the learner still
meets both win conditions.

## The Asterion Line - Battleship: rebalanced

It was never balanced. It was created alongside the console (7 September) at 68 points a side, and
the rebuild of the main scenario did not touch it. Equal points favoured the carrier heavily, and
the longer limit made it worse, because a longer fight gives the flight deck more strike runs:

| Turns | PD | Earth | Krelath |
|---|---|---|---|
| 12 | 3 | 23.7% | 75.1% |
| 20 | 4 | 17.0% | 82.4% |

Sweep of the Krelath escort at 20 turns, PD 4 (3000 battles each; the carrier needs a fleet of at
least 52 points):

| Krelath fleet | Points | Earth |
|---|---|---|
| carrier, 2 heavy cruisers, 2 light cruisers (was) | 68 | 16.3% |
| extra heavy cruiser to light cruiser | 62 | 30.9% |
| extra heavy cruiser to destroyer | 56 | 44.6% |
| extra heavy cruiser to missile destroyer | 56 | 43.3% |
| extra heavy cruiser to two frigates | 56 | 43.8% |
| extra heavy cruiser to frigate, same slot (14,5) | 54 | 47.2% |
| same, frigate astern (16,0) | 54 | 46.6% |
| **same, frigate on the northern flank (13,-6)** | **54** | **56.5%** |
| extra heavy cruiser dropped | 52 | 59.8% |

Adopted: carrier, heavy cruiser, two light cruisers and a frigate at (13,-6). At 5000 battles:
**Earth 56.9%, Krelath 42.5%, draw 0.6%**, median 14 turns, 68.8% decided by a flagship kill and
31.2% on points - the same shape as the main scenario, with the same small edge for the learner.
The frigate's placement is worth ten points on its own (46.6% astern, 56.5% on the flank), so
deployment is part of this balance and should not be moved casually. At 12 turns the same fleets
run 70.2% to Earth: this balance is for the 20-turn limit.

The briefing's points sentence is rewritten to say 68 against 54 and why.

## Rulings recorded with this pass

Chris, 10 September, on the playtest follow-ups:
- Torpedo course: the engine's round-end homing samples stand; no literal pause at the midpoint.
- A torpedo from a launcher this side cannot see shows only as a warning on its target, never a
  position or track ("missile to ship telemetry is a bitch").
- Per-weapon target assignments and hold fire reset every turn, like the ship's priority target.
- The fleet-trial baseline drift found by Astra (likely the frigate target-profile commit 2198e66)
  is accepted.
