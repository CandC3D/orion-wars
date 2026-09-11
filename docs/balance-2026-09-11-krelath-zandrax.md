# Krelath rebalance, and the Zandrax lead

11 September 2026, evening. After torpedo retargeting and point-defence saturation, Krelath had fallen to
36.9% at 52 points and were losing to Zandrax 89/11, while Zandrax led at every size above 4 points.
Chris: "yes please".

## Adopted

| Hull multiplier (factionModifiers.*.superstructure) | From | To |
|---|---|---|
| Zandrax | 1.20 | 1.10 |
| Krelath | 0.95 | 1.05 |

Stock amendment `docs/drydock/zandrax-krelath-hull-amendment-2026-09-11`: 14 designs, one revision each
(Krelath battleship 76 -> 84 hull, destroyer 13 -> 15; Zandrax battleship 96 -> 88, heavy cruiser 54 -> 50).
Krelath are now a little thicker than Earth (1.05 against 0.95) - a small move on an identity that was
"thin hulls, efficient shields and engines". Zandrax remain the thickest of the three shielded powers.

## Why the Zandrax-Krelath matchup was so bad (120 battles, instrumented)

- Zandrax field 11 hulls to Krelath's 9 (four corvettes), and their beams dealt 2.3 times the Krelath beam
  damage in a 6.5-turn fight.
- The Krelath AI warped 8 times a battle into that swarm and 95% of the ships that jumped were later
  destroyed. With no AI warps Krelath won 24% instead of 13%, but switching the AI's warp off breaks the
  Asterion scenarios (docs/balance-2026-09-10-warp.md), and a more cautious landing (3 or 4 hexes outside
  range) only reached 18%.
- It is not the carrier: with a heavy cruiser in its place Krelath won 18%.
- Generic Krelath buffs moved it little: hull 1.15 alone reached 80/20 but beat Earth 63/35.

The Zandrax trim is justified on its own - they led everywhere - and it is what moves this matchup.

## Candidates (corpus 300 pairs)

| Change | ZAN | EAR | KRE | VRA | ZAN v KRE | 52-pt spread | Spread sum |
|---|---|---|---|---|---|---|---|
| none (after torpedo rules) | 64.3 | 54.8 | 36.9 | 43.7 | 89/11 | 30 | 224 |
| KRE hull 1.05 | 63.6 | 52.9 | 41.6 | 41.6 | 87/13 | 21 | 218 |
| KRE hull 1.15 | 61.2 | 48.6 | 49.6 | 39.9 | 80/20 | 19 | 224 |
| warp 35% | 63.9 | 53.4 | 40.0 | 42.2 | 88/12 | 22 | 215 |
| ZAN hull 1.10 | 58.7 | 56.8 | 38.4 | 45.8 | 85/15 | 22 | 192 |
| ZAN hull 1.00 | 48.9 | 61.2 | 40.8 | 48.8 | 78/23 | 25 | 201 |
| ZAN 1.05 + KRE 1.05 | 51.1 | 58.0 | 45.3 | 45.3 | 76/24 | 12 | 189 |
| ZAN 1.10 + KRE 1.10 | 55.8 | 52.9 | 47.5 | 43.3 | 76/24 | 8 | 177 |
| **ZAN 1.10 + KRE 1.05 (adopted)** | **57.0** | **54.9** | **44.1** | **43.7** | **80/21** | **11** | **183** |

(Spread sum: the best-minus-worst gap at 4, 18, 32, 52, 68 and 132 points, added.) ZAN 1.10 + KRE 1.10 is
slightly more even, but makes Krelath the thicker of the two by a wide margin; 1.05 is the smaller move.

## Where it lands

52 points: Zandrax 57.0, Earth 54.9, Krelath 44.1, Vraygon 43.7 - the tightest spread measured this week.
Still lopsided: Zandrax v Krelath 80/21, Earth v Vraygon 58/42, and Earth 65% at 32 points.

Asterion (5000 battles): The Asterion Line **Earth 50.3%** (below its 55% target - the Krelath battleship
is tougher; a lighter Krelath escort overshot to 62%, so the scenario is left as it is and flagged); the
Battleship variant Earth 53.5%.
