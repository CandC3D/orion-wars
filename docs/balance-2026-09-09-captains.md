# What commissioning captains costs — 9 September 2026

I told Chris twice, in writing, that officers could be switched on and read before any ship
behaved differently, and that the balance corpus would not need re-measuring. That was wrong,
Astra reproduced it, and this is the measurement I should have taken first.

The short version: **the captain layer's entire effect on the four-power corpus is one rule,
on one hull, in one navy.** Give Earth's gunstar a bold captain and every number returns to
exactly where it was.

## Method

`test/fleet-trial.js` gained a `--captains` flag that commissions both fleets before
deployment, and a `--captains-faction X` flag that commissions only one power's. Officers are
opt-in in the engine, so without a flag the sweep measures precisely what it measured before
they existed. Every run below is 300 mirrored pairs per pairing on the open board at 52 points,
the same instrument and sample as the 7 September pass.

## 1. The unofficered corpus reproduces exactly

Before measuring anything new, the baseline was re-run against the current tree — after the
whole ship-captain slice, the resolver integration, `insist`, and the scripted-helm change.

| pairing | 7 Sep | today | avg turns |
|---|---|---|---|
| EAR v VRA | 38% / 62% | 38% / 62% | 15.1 |
| EAR v ZAN | 39% / 61% | 39% / 61% | 7.0 |
| EAR v KRE | 46% / 54% | 46% / 54% | 11.6 |
| VRA v ZAN | 39% / 61% | 39% / 61% | 8.8 |
| VRA v KRE | 69% / 31% | 69% / 31% | 17.3 |
| ZAN v KRE | 73% / 28% | 73% / 28% | 8.8 |

Identical, to the tenth of a turn. A battle with no officers is untouched, and the recorded
numbers stay comparable.

## 2. Commissioning both fleets moves almost nothing — except Earth

| overall at 52 points | unofficered | both officered |
|---|---|---|
| Zandrax Horde | 65.0% | 64.3% |
| Vraygon Star Realm | 56.3% | 56.5% |
| Earth Federation | **40.8%** | **38.8%** |
| Krelath Empire | **37.5%** | **39.8%** |

Earth and the Krelath swap places. Every other figure moves by less than a point, and the whole
scale sweep from 4 to 132 points is unchanged except at 52 and 68, where the same two powers
trade one or two points. The manoeuvre index does not move at all.

The pairing that carries it is EAR v KRE: **46% / 54% becomes 38% / 61%**, and the battle
lengthens from 11.6 turns to 12.5.

## 3. It is entirely Earth's own captains

| EAR v KRE | result | avg turns |
|---|---|---|
| nobody officered | 46% / 54% | 11.6 |
| both officered | 38% / 61% | 12.5 |
| **Earth only** | 38% / 61% | 12.5 |
| **Krelath only** | 46% / 54% | 11.6 |

Earth-only is identical to both-officered. Krelath-only is identical to nobody. The Krelath
gain nothing from their own officers and lose nothing to Earth's; they simply collect what
Earth gives away.

## 4. Why: it is the gunstar, and it is one rule

Instrumented over 240 battles with both fleets officered, counting every captain intervention:

| power | interventions | rule |
|---|---|---|
| Earth Federation | **76** | all of them the spinal bank venting |
| Krelath Empire | 3 | will-not-close |
| Zandrax Horde | 2 | will-not-close |
| Vraygon Star Realm | 0 | — |

**Seventy-six of eighty-one interventions are Earth's gunstar throwing away its charge.** No
other power fields a spinal hull, so no other power's captains have that decision to make.

Two things follow, and the second is as important as the first.

**The range rule is very nearly inert in AI play.** `will-not-close` fired five times in 240
battles. It arms only when a ship is below its posture's hull threshold *and* faces an enemy
both heavier and largely intact *and* is asked to shorten the range — a conjunction that
scripted battles rarely reach, because they resolve before ships spend long in the hurt-but-
alive band. It will matter far more in a played game, where the admiral orders ships to close
on purpose. Nothing here says the rule is wrong; it says the corpus cannot currently measure it.

**The vent rule lands on precisely the hull that was already Earth's problem.** The 7 September
pass concluded that Earth is dragged down by its gunstar. A captain who breaks off the charge
under fire takes away the one thing the hull exists to do, and does it in the long battle
against the Krelath where the bank would otherwise have time to fill.

## 5. The lever, and it is exact

| EAR v KRE, 300 pairs | Earth | Krelath | turns | vents |
|---|---|---|---|---|
| no captains | 46% | 54% | 11.6 | 0 |
| all standard | 38% | 61% | 12.5 | 429 |
| **standard, but the gunstar bold** | **46%** | **54%** | **11.6** | **0** |

A bold captain never breaks off a charge, so the gunstar plants and stays planted. That single
change restores the entire corpus — not approximately, exactly.

## Ruled, and verified — Chris, 9 September 2026

**Spinal hulls get a bold captain by default.** `defaultPostureFor` in `src/tactical/ship-command.js`
gives any hull carrying a spinal bank the bold posture unless a caller says otherwise, so a plain
`commissionCaptains(fleet, seed, registers)` does the right thing without every caller remembering.
The officer is **Captain Hikaru Kobayashi**, modelled on Okita but not imported as him — the same
relation Valdar has to Desslar. See `docs/setting.md`.

Re-measured with the ruling in force, 300 mirrored pairs, every fleet fully officered:

| pairing | unofficered | officered under the ruling |
|---|---|---|
| EAR v VRA | 38% / 62% · 15.1 | 38% / 62% · 15.1 |
| EAR v ZAN | 39% / 61% · 7.0 | 38% / 62% · 7.0 |
| EAR v KRE | 46% / 54% · 11.6 | **46% / 54% · 11.6** |
| VRA v ZAN | 39% / 61% · 8.8 | 39% / 61% · 8.8 |
| VRA v KRE | 69% / 31% · 17.3 | 69% / 31% · 17.3 |
| ZAN v KRE | 73% / 28% · 8.8 | 73% / 27% · 8.8 |

Overall at 52 points: Zandrax 65.0 → 65.3, Vraygon 56.3 → 56.4, Earth 40.8 → 40.5, Krelath
37.5 → 37.4. The standings hold their order and every figure is inside the noise of a
300-pair sample. **A fully officered corpus now costs essentially nothing.**

### One harness bug worth recording

The first run of this verification appeared to show the ruling doing nothing at all — EAR v KRE
stayed at 38 / 61. The ruling was fine; the instrument was not. `--captains` was passing an
explicit `"standard"` to every ship, and an explicit posture overrides the hull-aware default, so
the sweep was commissioning gunstar captains as ordinary officers and measuring the wrong fleet.
The flag now passes nothing unless `--posture` is given.

It is the same shape as the defect Astra found in the vent rule: a fixture that supplied a value
"to be careful" was the thing concealing the behaviour under test.

## The reasoning behind the ruling

**Give spinal hulls a bold captain by default**, and let the other hulls take the standing
posture. It restores the measured balance exactly, it needs no threshold tuning, and it is a
better piece of fiction than a number: *the Federation gives the gunstar to officers chosen for
nerve, because the hull's whole function is to stand still while being shot at.* That is the
same shape as the existing note that the gunstar "does what a Federation line ship is for: it
stands".

The alternative — raising `ventUnderFireDamage` for spinal hulls — reaches the same balance
through a tuning constant and earns no flavour. I would not.

It was Chris's call because it decides what a Federation captain *is*, and he took it the same
day, with a name attached.

## Two things this measurement does not cover

- **Only the open board.** The 7 September pass found the open board the least representative
  case available, and repeated its matrix over four board types. This pass has not been. Terrain
  changes how often ships are hurt but alive, which is exactly the condition the range rule
  waits for, so the near-inert result above may not hold on a cluttered board.
- **Only standard posture.** Cautious captains hold at five hexes rather than three and vent at
  eight per cent rather than fifteen. Nothing here says what a cautious fleet costs, and the
  answer is probably not small.
