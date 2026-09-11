# Torpedo retargeting enacted, and point-defence saturation

11 September 2026. Chris: retargeting "does make sense - even our speculative missile diagram / schematic
includes a time to retargeting. enact", and "another level to enact is how many missiles PD may shoot
down in a turn".

## The rules now live

- **Retargeting**, radius 4: a torpedo whose target dies takes the nearest living, uncloaked enemy within
  4 hexes of where it is (docs/balance-2026-09-11-missile-retarget.md).
- **Saturation**, `pointDefence.interceptsPerPoint = 1`: each point of point defence stops at most one
  torpedo a turn. A battery that has spent its kills drops out of the pool, so the chance for the next
  torpedo falls, and a big enough salvo gets through. The kill is charged to the battery nearest the
  torpedo's target. A light cruiser (PD 2) stops at most two a turn; three of them together, six. The
  console's point-defence key now says so: "POINT DEFENCE 2 · 3 HEX UMBRELLA · STOPS ≤2/TURN".

## Choosing the number (retargeting on, corpus 300 pairs, torpedo outcomes 3600 battles at 52 pts)

| Kills per point a turn | Intercepted | ZAN | VRA | EAR | KRE | Asterion Line, Earth |
|---|---|---|---|---|---|---|
| unlimited | 39% | 65.4 | 49.5 | 46.2 | 38.5 | 59.2% |
| 3 | 39% | 65.4 | 49.0 | 46.9 | 38.3 | 59.3% |
| 2 | 39% | 64.7 | 48.6 | 48.3 | 37.9 | 57.6% |
| **1 (enacted)** | **35%** | **64.3** | **43.7** | **54.8** | **36.9** | **53.4%** |

At two or three kills per point the screen almost never runs out: a 52-point fleet carries about ten
points, more than the torpedoes that reach it in a turn. One per point is the only setting that bites,
and the plainest to state.

## Where it lands (live data, 11 September evening)

| Power (52 pts) | This morning | Now |
|---|---|---|
| Zandrax | 65.8% | 64.3% |
| Earth | 43.1% | 54.8% |
| Vraygon | 49.1% | 43.7% |
| Krelath | 41.4% | 36.9% |

Torpedoes at 52 points: 16% wasted on a dead target (was 21%), 48% hit (was 42%), 35% intercepted (was 37%).
Asterion: Earth 54.2% (The Asterion Line, back on its 55% target) and 57.0% (Battleship variant).

Earth - the torpedo doctrine - gains most from both rules. Krelath fall to the bottom and lose to Zandrax
89/11. Open for a rebalance.
