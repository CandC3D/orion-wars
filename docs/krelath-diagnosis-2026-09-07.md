# Why Krelath lose — 7 September 2026

Chris asked for fleet tests of Krelath against the other powers *and against
themselves*, to find what is actually causing the defeats. The mirror matches are
the control: a power against itself wins 50% by construction, so the result says
nothing, but the **shape** of that battle is a clean read on the power's own
character before any matchup effect is mixed in.

All measurements use the compositions in `test/comp.js`, never a restatement of
them, and every pairing is played as side-swapped pairs.

## 1. The mirrors — what each power is

52 points, 150 mirrored pairs.

| mirror | turns | beam hit | mean range | dmg/shot | launches per hull | magazine used |
|---|---|---|---|---|---|---|
| EAR v EAR | 10.2 | 52% | 9.5 | 2.95 | 3.13 | 78% |
| VRA v VRA | 18.7 | 30% | 10.6 | 2.14 | 9.93 | 73% |
| ZAN v ZAN | 6.3 | 51% | 6.8 | 3.28 | 2.03 | 51% |
| **KRE v KRE** | **17.5** | **43%** | 9.5 | 2.63 | **1.68** | 63% |

The first oddity: Krelath are the missile power — five tubes on their heavy
cruiser against Earth's three — and they launch the **fewest missiles per hull in
the game**, with a third of the magazine unspent.

## 2. Three explanations tested and rejected

**Not the reserve.** Krelath's `doctrine.reserveFraction` is 0.07, the lowest, and
that looked damning. It is a dead value: `doctrine.dynamic.enabled` is **true**, so
every power computes the same reserve from the tactical picture and the
per-faction fraction is never read. Worth stating plainly because the number is
sitting in the tuning file inviting exactly the wrong conclusion.

**Not the tube arcs.** Krelath's tubes are 89% forward-arc — but Earth's and
Zandrax's are 100% forward-arc and both launch more. Vraygon have the broadest
tube arcs and launch most, so arcs matter, but they do not explain Krelath.

**Not the closing speed.** Krelath have the fastest fleet in the game
(`movementPointRatio` 0.78) and close to 2.3 hexes by turn 6 while Vraygon are
still at 6.3. The obvious story — they arrive first, alone, and are concentrated
on — is **wrong**. Slowing them to 0.95 makes them *worse everywhere*: 39% → 33%
at 52 points, 21% → 17% at 18. Their speed is an asset holding them up, not the
thing killing them.

## 3. What is actually happening

Identical common-hull fleets for all four powers, so only the faction modifiers
and loadout overrides differ. Share of the fleet still alive:

| turn | EAR | VRA | ZAN | **KRE** |
|---|---|---|---|---|
| 2 | 97% | 98% | 95% | **86%** |
| 3 | 84% | 92% | 79% | **65%** |
| 4 | 70% | 84% | 62% | **46%** |
| 5 | 58% | 77% | 47% | **29%** |

Mean turn of first loss: EAR 3.02, VRA 3.40, ZAN 2.89, **KRE 2.35**.

Krelath do not lose because of how they shoot. They lose because they are dead.
By turn 5 they are down to 29% of their hulls while Earth still hold 58%. The low
launch count, the 43% beam hit rate and the unspent magazine are all downstream of
that — a fleet that has lost two thirds of itself by turn 4 has few tubes left to
fire and few ships left to aim.

The cause is a mismatch between role and durability:

| | superstructure | shield cost | move cost |
|---|---|---|---|
| EAR | 0.95 | **0.85** best | 1.00 |
| VRA | **1.80** thickest | 1.40 worst | 1.25 slowest |
| ZAN | 1.20 | 1.35 | 0.80 |
| **KRE** | **0.95** joint-flimsiest | 0.95 | **0.78** fastest |

Zandrax also close fast, and survive it on a hull 26% thicker. Earth are equally
flimsy, and survive by closing more slowly behind the best shields in the game.
Krelath are built to close and brawl — fastest fleet, short brutal blasters, tubes
concentrated on the heavy hulls — while carrying the joint-flimsiest hull in the
game and only middling absorption. The doctrine commits them to a knife fight
their construction cannot survive.

## 4. Which lever fixes it

All pairings, 100 mirrored pairs per pairing per size. Krelath's win rate:

| variant | @18 | @32 | @52 | @68 | spread@52 | others@52 |
|---|---|---|---|---|---|---|
| baseline | 21% | 66% | 39% | 59% | 24pp | EAR 39 VRA 60 ZAN 62 |
| **hull 0.95 → 1.05** | 27% | 69% | **45%** | 65% | 25pp | EAR 37 VRA 55 ZAN 62 |
| **hull 0.95 → 1.15** | 33% | 74% | **51%** | 71% | 24pp | EAR 36 VRA 54 ZAN 59 |
| shields 0.95 → 0.85 | 22% | 67% | 41% | 59% | 22pp | EAR 39 VRA 60 ZAN 61 |
| shields 0.95 → 0.75 | 26% | 67% | 42% | 63% | 24pp | EAR 37 VRA 60 ZAN 61 |
| move 0.78 → 0.95 | 17% | 64% | **33%** | 55% | 33pp | EAR 42 VRA 59 ZAN 66 |
| hull 1.05 + shields 0.85 | 29% | 70% | 46% | 65% | 24pp | EAR 37 VRA 57 ZAN 60 |

**Hull is the lever.** It is the only modifier that moves Krelath materially, and
it moves them at every fleet size without disturbing the others — at 1.15 the
spread at 52 points is unchanged at 24pp while Krelath come up from 39% to 51%.
Shield efficiency is worth almost nothing to them, and speed is worth negative.

Two cautions on adopting it. Krelath are **already strong at 32 and 68 points**
(66% and 59% at baseline); a flat hull buff takes 32 to 74%, so it overshoots
where they are healthy while fixing where they are not. And it slightly erodes the
Krelath identity note in `factionModifiers`, which pairs "efficient shields and
engines" with a deliberately thin hull.

## 5. The deeper finding

Krelath's real problem is not their average — it is their **variance across fleet
size**: 21% at 18 points and 66% at 32, on the same modifiers. A flat multiplier
cannot fix a size-dependent failure; it can only move the whole curve. If the 18-
and 52-point cells are the ones that matter for play, the honest fix is in what
those specific fleets field — Krelath's light cruiser carries one tube to Earth's
two, and a magazine of five to Earth's eight — rather than in a faction-wide dial.

## 6. Reproducing

    node test/faction-levers.mjs 100     # the lever sweep in section 4

The lever sweep is committed because the question recurs for every power. The
mirror-profile and attrition scripts that produced sections 1 and 3 were scratch,
written under an ignored `.tmp-` path and not kept; both are short, and the tables
above record everything they measured.

Nothing has been retuned. These are measurements and a recommendation.
