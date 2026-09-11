# The straight warp

10 September 2026. Chris, after a Krelath game in which every warp he ordered was silently refused:
"I think these rules around warp are too fussy and elaborate. Warp should be: travel UP TO 8 hexes in
a straight line, no turning, same restrictions to landing on non-play spaces." And: "there should also
be a warp effect to make the warp maneuver obvious."

## The rule as built

- A warp is one action: `{ turn: 0, forward: N, warp: true }`, N from 1 to 8.
- The ship jumps N hexes along its present heading and keeps that heading.
- Only the landing hex is tested: not off the map, not a moon, planet or large asteroid, not an
  enemy's hex. Asteroid fields, nebulae and friendly hexes are fine. The jump passes over anything.
- "Up to" is literal: if the ordered hex is illegal, the ship comes out at the farthest legal hex
  short of it, and the log says so ("ordered 6, landed 5: an enemy's hex").
- Kept from before: 35% of the pool, once a turn, and the whole action (no fire in it).
- Gone: the rear-arc insertion, the chosen target, the 4-hex closing gain, the stand-off check and
  the 0.6 fleet quota.

## Why his warps failed (fleet-command-side-record (8).json)

The old warp landed 4 hexes behind the target and had to be within 10 hexes of the jumper. Against a
ship facing you that hex is on its far side, so it never worked against an enemy line advancing head
on - which the Earth line did for turns 1-6 and 10. No warp succeeded in that game: every large
displacement in the record matches ordinary movement cost (0.78 P/hex for the destroyers, 4.68 for
the battleship), none is the flat 35% a warp costs. The console gave no forecast and no refusal
message, so a failed warp was an action lost in silence.

## Balance (fleet corpus 300 pairs; Asterion 3000-5000 battles)

The engine's own AI has to use the new warp too, and how it uses it moved the numbers far more than
the price did.

| Setting | Krelath overall (52 pts) | Asterion Line, Earth | Asterion Battleship, Earth |
|---|---|---|---|
| Old warp (before) | 38.8% | 53.3% | 55.1% |
| Straight, 35%, AI lands at preferred range | 31.5% | 25.9% | 52.4% |
| Straight, 15%, AI lands at preferred range | 39.2% | 22.7% | 48.6% |
| Straight, AI never warps | 57.9% | 91.5% | 59.2% |
| Straight, 15%, AI warps only when no gun bears | 46.8% | 89.2% | 59.0% |
| Straight, 15%, AI lands 2 outside preferred range | 61.3% | 55.2% | 49.9% |
| Straight, 25%, AI lands 2 outside | 58.4% | 54.9% | 52.0% |
| **Straight, 35%, AI lands 2 outside (adopted)** | **54.4%** | **56.2%** | **53.7%** |

Adopted: the cost stays 35%, and the scripted helm jumps down its bow onto the nearest contact dead
ahead, coming out 2 hexes outside its preferred range. Both tutorial scenarios stay where their
rebalances put them. The corpus moves:

| Power (52 pts) | Before | After |
|---|---|---|
| Zandrax | 64.8% | 67.9% |
| Krelath | 38.8% | 54.4% |
| Vraygon | 55.6% | 40.1% |
| Earth | 40.2% | 37.0% |

The big swing is Vraygon against Krelath: 69/31 before, 22/78 after. The slowest fleet in the game
cannot keep a Krelath ship out of its range when that ship can jump 8 hexes. Open.

A finding worth keeping: in the corpus the AI's warp has always cost Krelath - with no AI warp at all
they win 57.9%, against 38.8% with the old trait. A jump costs 35% of the pool, and the pool is the
shields.

## Magazines (Chris: "Magazines could be larger")

Measured with the straight warp at 15%, before the adopted setting:

| Change | Earth | Vraygon | Zandrax | Krelath |
|---|---|---|---|---|
| none | 42.3% | 51.6% | 66.2% | 39.2% |
| every magazine x1.5 | 50.7% | 44.4% | 68.1% | 36.3% |
| every magazine x2 | 57.2% | 39.0% | 68.6% | 35.1% |
| Krelath fits only x1.5 | 42.3% | 51.6% | 66.2% | 39.2% (+3-5 at 68 and 132 pts) |

A uniform increase is an Earth buff: Earth is the torpedo doctrine. A Krelath-only increase changes
nothing at 52 points because the AI rarely runs a Krelath magazine dry; it only shows where the
battleship appears. Not applied; awaiting a ruling.

Tooling added for this: `--tune path=value` and `--magazine-scale X [--magazine-faction F]` on
`test/fleet-trial.js`, `--tune` on `scripts/scenario-balance.mjs`.
