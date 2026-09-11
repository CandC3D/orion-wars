# Magazines x1.5 and the warp rebalance

11 September 2026. Chris, after the straight-warp measurements (docs/balance-2026-09-10-warp.md):
"magazines - increase for all" and "warp balance - yes let's try a rebalance".

## What changed

| Change | From | To |
|---|---|---|
| Every missile magazine, hull defaults and faction fits | as was | x1.5, rounded |
| Krelath warp cost | 35% of pool | 45% of pool |
| Vraygon armour (factionModifiers.VRA.superstructure) | x1.80 | x2.10 |

Two stock amendments carry them into the approved designs: `docs/drydock/magazine-amendment-2026-09-11`
(24 of 29 classes; frigates and corvettes carry no magazine) and
`docs/drydock/vraygon-armour-amendment-2026-09-11` (all 7 Vraygon classes). A class amended twice is now
judged against its newest approved return (`findLast` in `test/fixtures/stock-approvals.js`); tests written
for earlier amendments compare against tables with both September 11 rulings undone.

## The search (fleet corpus, 300 pairs; Asterion 2000-5000 battles)

Starting point, magazines x1.5 with the warp as shipped on 10 September (35%, AI lands 2 outside its range):
Zandrax 69.5, Krelath 51.6, Earth 45.2, **Vraygon 33.1**; Vraygon v Krelath **22/78**.

| Lever | ZAN | VRA | EAR | KRE | VRA v KRE |
|---|---|---|---|---|---|
| warp 45% | 69.8 | 34.3 | 47.1 | 48.2 | 25/75 |
| warp 55% | 71.6 | 36.7 | 49.1 | 42.1 | 33/68 |
| VRA armour 1.95 | 67.0 | 40.8 | 42.6 | 49.1 | 29/71 |
| VRA armour 2.10 | 65.6 | 46.7 | 41.2 | 45.9 | 39/61 |
| VRA 2.00 + warp 40% | 67.4 | 42.3 | 42.7 | 46.9 | 33/67 |
| VRA 2.10 + warp 40% | 65.9 | 46.8 | 41.4 | 45.1 | 39/61 |
| **VRA 2.10 + warp 45% (adopted)** | **65.8** | **49.1** | **43.1** | **41.4** | **46/54** |

Warp cost alone could not reach the Vraygon: at 55% of pool they still lost 33/68, and the price
dragged Krelath down against everyone else. The Vraygon's own lever - armour, the one their doctrine note
says moves them - did most of the work; the dearer warp finished it.

## Where it lands

| Power (52 pts) | 10 Sept (before today) | 11 Sept |
|---|---|---|
| Zandrax | 67.9% | 65.8% |
| Vraygon | 40.1% | 49.1% |
| Earth | 37.0% | 43.1% |
| Krelath | 54.4% | 41.4% |

Spread by size: 4 pts 6pp, 18 pts 36pp, 32 pts 23pp, 52 pts 25pp, 68 pts 57pp, 132 pts 49pp. Zandrax
remain the outlier at every size above 4 points; that predates this work and is not addressed here.

Asterion (5000 battles, Earth is side A):
- The Asterion Line: **Earth 60.1%** (55.2% after 10 September). Bigger magazines favour Earth here. Adding
  Krelath frigates or a destroyer did not move it - the scenario is decided by the flagship duel - so it
  is left a little generous to the learner. Flagged.
- The Asterion Line - Battleship: **Earth 57.2%**.
