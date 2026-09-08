# Four-power balance pass — 7 September 2026

Chris asked for a balance pass across all four powers, and for the *flavour* that
falls out of the conflicts to be carried into the game rather than left as
numbers. This is the measurement; the closing section is the flavour it earned.

Two instruments were used. The first is the established sweep,
`test/fleet-trial.js`, which plays every pairing as mirrored pairs on an **open
board** at six fleet sizes, using the compositions in `test/comp.js`. The second
is a supplement added for this pass: the same matrix repeated over four **board
types**, because an open board turned out to be the least representative case we
could have measured on. It reuses `test/comp.js` rather than restating the
compositions, which that file warns is "a silent source of wrong measurements".

## 1. The open board — 300 mirrored pairs per pairing, 52 points a side

| pairing | A | B | draws | avg turns |
|---|---|---|---|---|
| EAR v VRA | 38% | 62% | 0% | 15.1 |
| EAR v ZAN | 39% | 61% | 0% | 7.0 |
| EAR v KRE | 46% | 54% | 1% | 11.6 |
| VRA v ZAN | 39% | 61% | 0% | 8.8 |
| VRA v KRE | 69% | 31% | 0% | 17.3 |
| ZAN v KRE | 73% | 28% | 0% | 8.8 |

Overall: **Zandrax 65.0%, Vraygon 56.3%, Earth 40.8%, Krelath 37.5%** — a spread
of 27.5 percentage points. Only EAR v KRE (46/54) is close to even.

## 2. Balance is size-dependent, not power-dependent

This is the more important result. No power is consistently strong or weak; each
swings violently with fleet size.

| points | EAR | VRA | ZAN | KRE | spread |
|---|---|---|---|---|---|
| 4 | 59% | 36% | 45% | 57% | 23pp |
| 18 | 45% | 57% | **79%** | **19%** | 61pp |
| 32 | 60% | 34% | 42% | 61% | 27pp |
| 52 | 42% | 60% | 62% | 36% | 26pp |
| 68 | 34% | 26% | **78%** | 61% | 53pp |
| 132 | 55% | **20%** | 71% | 54% | 50pp |

Krelath runs 19% at 18 points and 61% at 68 — a 42-point swing on fleet size
alone. Vraygon runs 60% at 52 and 20% at 132. Quoting any single number as "the"
balance of a power would be meaningless.

## 3. Terrain roughly doubles the imbalance

150 mirrored pairs per pairing per board, 52 points a side. Boards are synthetic
rings placed symmetrically about the origin, so neither side is handed the cover.

| board | EAR | VRA | ZAN | KRE | spread |
|---|---|---|---|---|---|
| open (the control above) | 38% | 61% | 63% | 39% | 25pp |
| asteroid clutter | **20%** | 62% | **75%** | 43% | 55pp |
| nebula | **21%** | **73%** | 66% | 38% | 52pp |
| planet, screen and fog | 33% | **78%** | **34%** | 54% | 45pp |

The open board is the *fairest* board in the game, and it is the only one the
established sweep measures. Every terrain board roughly doubles the spread.

This was found by accident. A 3000-run study of the authored Mutara Nebula duel
had the same two heavy cruisers going **58.7% to Earth on an empty board and
10.6% once the rocks were added** — terrain moved that matchup 48 points, which
is far more than any hull difference in it.

## 4. What the numbers say each power is

Four coherent identities fall out, and they agree with the design notes rather
than contradicting them.

**Earth is a gunnery power.** Best on the open board and ruined by cover: 38% →
20% on clutter, 21% in fog. Earth lands the first hit in 88% of the Mutara duels
and still loses them, because clutter denies it the range it wins at. Its beams
fall off hard — measured on Chris's own side records, 8% of shots resolved at
13–15 hexes against 50% inside 8. Earth needs clear lanes and the room to use
them, and has nothing when it cannot get them.

**Vraygon is the terrain power.** The only power that *gains* from a broken
board: 61% open, 73% in fog, 78% on the mixed board. This is what "no blind side"
buys — all-round arcs and armour mean cover costs Vraygon nothing while denying
everyone else. Its fights are also the longest in the game (17–20 average turns
against 7–9 for a Zandrax action). Vraygon wins by not losing.

**Zandrax is a manoeuvre power, and manoeuvre needs room.** Highest flank-and-rear
hit share in the game at small scales — 71% of its hits land on flank or rear
faces at 4 points, against Earth's 3%. It is dominant on open and cluttered
boards (63%, 75%) and then **collapses to 34% on the mixed board**, the only one
with a planet in the middle. A large central obstacle breaks the flanking runs
its whole method depends on.

**Krelath is the steadiest and currently the weakest.** 39 / 43 / 38 / 54 across
the four boards — almost terrain-indifferent, because a close-range missile power
does not care about lanes. The fog and clutter that halve Earth barely touch it.
It is also the worst power at 52 points (37.5%) and the worst at 18 (19%), while
being one of the best at 68 (61%).

## 5. Verdict and what has NOT been done

The game is **not balanced**: 27.5 points of spread on the fairest board, up to
55 on a realistic one, and no power holding a stable position across fleet sizes.

Nothing has been retuned. This pass measures and reports; changing four powers'
statistics is a design act that belongs to Chris, and the numbers above are the
evidence he would need to direct it. Two honest limits on them: the terrain
boards are synthetic rings rather than authored scenarios, and every battle is
AI against AI, so they describe how the scripted captains fight, not how a person
does.

## 6. Reproducing

    node test/fleet-trial.js --battles 300        # the open-board matrix, all sizes
    node test/fleet-trial.js --scale 68           # one budget only
    node test/fleet-trial.js --watch EAR KRE      # one battle, narrated

The terrain supplement is not yet a committed tool. It is a small script over
`test/comp.js` and `runBattle({terrain})`; if this pass is to be repeated it
should be promoted into `test/` beside `fleet-trial.js` so the board dimension
stops being optional.

---

# Part two — the Asterion board, specials-free

Chris asked for the same pass on the Asterion board with the specials removed.
"Specials" are each power's **unique hull**: EAR gunstar-battlecruiser, KRE
carrier, VRA monitor, ZAN corvette. Excluding them is exactly `compFor` switched
off, since the `SCALES` compositions are already built from the six common hulls
— so no second composition table is introduced. 200 mirrored pairs per pairing.

## 7. Removing the unique hulls reorders the whole game

Same open board, same 52-point common fleet, the only change being that no power
fields its unique hull.

| power | with its unique hull | specials-free | change |
|---|---|---|---|
| Earth | 38% | **66%** | **+28** |
| Vraygon | 61% | 48% | −13 |
| Zandrax | 63% | 62% | −1 |
| Krelath | 39% | **24%** | −15 |

**The gunstar is a liability.** Taking it away nearly doubles Earth's win rate.
That agrees with the 2000-run Asterion study: the gunstar plants itself the
moment its bank lights, spends the battle unable to bear or unable to see past
the planet, and dies holding a full charge in 17% of runs.

The carrier and the monitor are the opposite — each is carrying its power by
13–15 points of win rate. The corvette is worth nothing measurable to Zandrax.

So the four "specials" are not comparable in value at all: one is negative, two
are large positives, one is neutral.

## 8. Map size does nothing; terrain does everything

| board | EAR | VRA | ZAN | KRE | spread | avg turns |
|---|---|---|---|---|---|---|
| A. default arena 72×40, empty | 66% | 48% | 62% | 24% | 43pp | 6–12 |
| B. Asterion map 60×36, empty | 66% | 48% | 62% | 24% | 43pp | 6–12 |
| C. Asterion map 60×36 with its terrain | **74%** | **70%** | 42% | **13%** | 61pp | 17–20 |

A and B are identical to the last digit — fleets deploy at `startDistanceHexes`
and never reach the edges, so the board's dimensions are inert. The entire
difference is the eight pieces of terrain, and they also **triple the length of
the battle**, from 6–12 turns to 17–20.

On the Asterion board specials-free, EAR v KRE runs **96% / 4%**.

## 9. Bigger fleets are better balanced

Asterion board, specials-free, across the ladder:

| points | EAR | VRA | ZAN | KRE | spread |
|---|---|---|---|---|---|
| 4 | 67% | 32% | 50% | 50% | 35pp |
| 18 | 59% | 60% | **75%** | **11%** | 63pp |
| 32 | 69% | 65% | 37% | 30% | 39pp |
| 52 | 72% | 72% | 43% | **13%** | 59pp |
| 68 | 48% | 64% | 41% | 46% | 23pp |
| 132 | 47% | 57% | 50% | 45% | **11pp** |

At 132 points the four powers sit within 11 points of each other — very nearly
balanced. The game converges as fleets grow, because single-hull quirks average
out across a larger line. The worst imbalance is in the middle of the ladder,
at 18 and 52 points, which is where most play actually happens.

## 10. Two consequences worth acting on

**Krelath without its carrier is not a viable power.** 24% on an open board, 13%
on Asterion, 11% at 18 points. Either the carrier is load-bearing to a degree
that should be deliberate, or the common Krelath hulls need help.

**This validates the tutorial's asymmetry.** The rebuilt Asterion tutorial pits
Earth against Krelath specials-free — and the table above says symmetric common
fleets in that matchup run 96/4 to Earth. The tutorial measures 55/45 because it
is deliberately asymmetric: Earth fields four even cruisers at 46 points while
Krelath brings a battleship and three light escorts at 44. That asymmetry is not
decoration; it is the only reason the matchup is playable, and it should not be
"tidied" into a mirror later.

## 11. Method notes

Mirrored pairs throughout: every seed is played twice with the sides swapped, so
a deployment or initiative edge cannot pass for a faction edge. Battles are AI
against AI, so all of this describes how the scripted captains fight. Nothing has
been retuned.
