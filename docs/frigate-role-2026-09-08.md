# What a frigate is for — 8 September 2026

Chris asked to try the frigate at 1.15, and then asked the better question: what
would make frigates survivable enough that a player would buy them at all, rather
than cut them from the game? His framing set the terms this document answers —
that in a mixed battle a frigate must **contribute to the defence of the rest of
the fleet**, that a skilled opponent picking them off early is a reason for a
power to invest in their survival rather than an argument against them, and that
there should be **a reason for them to be small and swift**.

All measurements use the compositions in `test/comp.js`, never a restatement of
them, and every pairing is played as side-swapped mirrored pairs.

## 1. What a frigate was worth

Eight frigates (16 points) against four destroyers (16 points), same power on
both sides, so nothing differs but the purchase decision:

| frigates | points | EAR | VRA | ZAN | KRE | mean |
|---|---|---|---|---|---|---|
| 8 | 16 | 37% | 17% | 12% | 16% | **20.5%** |
| 10 | 20 | 56% | 63% | 76% | 66% | 65.1% |
| 12 | 24 | 98% | 96% | 96% | 98% | 97.0% |

Break-even sits at about **9.3 frigates — 18.6 points**. The frigate was
overpriced by roughly 16%, and in any scenario permitting no heavier hull it was
a trap purchase.

## 2. Why, when every ratio says otherwise

Per point the frigate *beats* the destroyer on structure (4.00 against 3.50) and
on power (4.00 against 3.25), ties it on guns (0.50 per point), and its single
gun bears through all six faces where the destroyer's two split fore and aft. The
deficit was not on the ratio sheet. It was that **the frigate was not small**:

- Evasion is `floor(hexesMoved / evasionPerHexesMoved)` and nothing else. A
  stationary picket was exactly as easy to hit as a stationary battleship.
- `toHit.classInteraction` has one threshold, at 16 points. Frigate, destroyer,
  strike cruiser and light cruiser are all "light", so between a frigate and a
  destroyer it did nothing whatsoever.
- The frigate is *slower* than the destroyer — the same movement cost per hex,
  but impulse 2 against 3 and a core of 8 against 13.

The small, swift escort was out-run by the bigger ship and no harder to hit. It
had no dimension on which it was best.

## 3. Levers tested on that duel

Mean of the four powers. Each is a data-only edit to `hullClasses.frigate` unless
noted.

| lever | mean |
|---|---|
| baseline | 20.5% |
| structure ×1.15 | 30.4% |
| shield cap 4 → 6 | 38.7% |
| impulse 2 → 4 | 38.7% |
| move cost 1 → 0.5 | 38.0% — EAR 66, KRE 76, VRA 2, ZAN 8; unusable |
| reach 0.84 → 1.0 | 52.1% — but a frigate outranging a destroyer is poor flavour |
| **target profile −1 pip** | **42.8%** |
| **profile −1 + structure ×1.15** | **51.8%** |
| profile −2 pips | 63.7% — overshoots; the frigate becomes the better buy |

Two levers measured as *exactly* zero, which is itself a finding:
`hullClasses.beamMounts` and `missileMounts` are **dead for frigates**, because
all four powers give their frigate explicit `mounts` in `loadouts.json`. Any
arming change must be made there, per faction. Relatedly, Zandrax's frigate is
forward-arc only where the other three are all-arc, which is why theirs is the
worst in the duel.

## 4. The escort role already existed, and already worked

This corrects a conclusion drawn from section 1 alone. `screenFor()` lets any
hull with `screen > 0` take a hit meant for a consort with `screen === 0`, so
escorts shield capitals and capitals cannot shield themselves. Same power, 40
points a side, one battleship each, the remaining 8 points spent two ways:

| | frigate side wins | battleship survives |
|---|---|---|
| BB + 4 frigates vs BB + 2 destroyers | **62.0%** | **60%** with frigates / 38% with destroyers |

Four frigates and two destroyers carry the *same* four screen points, so the gap
is not the screen rating — it is hull count. Four bodies to interpose instead of
two, and double the point-defence barrels. Being small and numerous was already
the reason it worked. A battle line escorted by frigates keeps its capitals; one
escorted by destroyers loses them.

**Raising the screen rating is the obvious move and it is wrong.** Frigate screen
1 → 2 measured *worse* for the fleet it escorts: 62.0% → 59.6%, capital survival
60% → 58%. Screening more often just feeds escorts into fire meant for the
capital, and dead escorts screen nothing. Point defence is the lever that works.

| escort lever | frigate side wins | battleship survives |
|---|---|---|
| baseline | 62.0% | 60% / 38% |
| frigate screen 1 → 2 | 59.6% | 58% / 40% |
| screening range 2 → 3 | 62.5% | 61% / 38% |
| **frigate point defence 1 → 2** | **72.1%** | **72% / 29%** |

One inconsistency found while looking and left unfixed: `screening.rangeHexes` is
**2** while `helm.formation.screenStation` is **3**, so escorts are ordered to
hold station one hex outside the range at which they can screen. Correcting it
measured as roughly neutral (62.0% → 62.5%), so it is recorded rather than
changed.

## 5. Survivability is a different problem from worth

Of the **winning** side's hulls, the share still afloat at the end:

| frigate | destroyer | light cruiser | heavy cruiser | battleship |
|---|---|---|---|---|
| 35% | 27% | 42% | 72% | 73% |

Frigates were never dying more than their neighbours — they come home *more*
often than destroyers. The cliff is between light cruiser and heavy cruiser, 42%
to 72%. "Light hulls are fragile" is a light-versus-heavy cliff, not a frigate
problem, and none of these levers touches it: with profile and structure both in,
the frigate's share destroyed moves 89% → 87% and its mean turn of death 4.09 →
4.4.

**What makes light hulls come home is `damage.crippling` and withdrawal**, which
are approved in principle and shipped disabled. Crippling alone moved crew losses
from 95% to 62% when it was measured on 7 September. This document is about
whether the frigate is worth buying; that one is about whether its crew survives.

## 6. The four-power ladder

200 mirrored pairs per pairing per size.

| arm | EAR | VRA | ZAN | KRE | worst gap | no-heavies | escort | BB lives |
|---|---|---|---|---|---|---|---|---|
| baseline | 49.6 | 36.6 | 64.4 | 49.3 | 14.4pp | 22.8% | 62.1% | 60% / 38% |
| **profile + structure ×1.15** | 49.5 | **38.1** | 62.8 | 49.6 | **12.8pp** | **52.6%** | 67.4% | 66% / 33% |
| point defence 2 + structure ×1.15 | 50.3 | 37.6 | 62.8 | 49.3 | **12.8pp** | 41.9% | **72.4%** | **72% / 30%** |
| all three together | 50.1 | 38.3 | 63.0 | 48.6 | 13.0pp | 66.2% | 78.0% | 77% / 25% |

"no-heavies" is the eight-frigates-against-four-destroyers value test from
section 1 — the scenario that permits no heavier hull. "escort" is section 4.

**The two are not to be combined.** Each alone lands the worst-power gap at
12.8pp; together the frigate becomes the *better* buy than the destroyer at equal
points, 66.2% against a baseline 22.8%, which inverts the trap rather than
removing it.

The profile is the one adopted. It serves the no-heavies scenario far better
(52.6% against 41.9%) and improves the escort role by 5pp *without touching the
escort rules at all*, because a frigate that is harder to hit stays on station
longer. Point defence is held in reserve as the stronger escort knob, recorded in
`toHit.hullProfile._pairingNote`.

Two costs, stated plainly. The corvette carries the same pip as the frigate
rather than a larger one: Zandrax field four corvettes at 4 points where the
other three powers field two frigates, so a frigate-only rule dropped Zandrax
from 46% to 25% in that cell, and a corvette pip of 2 overcorrected them to 67%
across the ladder. And **Vraygon pay for any frigate buff** — they are the
missile power and the weakest at 36.6%, and at 132 points they slip from 20% to
18% with the profile, 16% with point defence, 14% with both.

The 18-point cell — the worst in the game at 61pp spread, Krelath on 20% — is
untouched by all of this, necessarily: no power fields a frigate at 18 points.

## 7. What shipped

- `toHit.hullProfile` in `data/tactical-tuning.json`, **`enabled: false`**, with
  `byClass: { corvette: 1, frigate: 1 }` in d10 pips. Applied in
  `src/tactical/resolver.js` by `hullProfileMod()` at both beam to-hit sites.
- `hullClasses.frigate.superstructure` 8 → **9.2**, live. A class-level ×1.15
  applied before the faction modifier and its rounding, so stock frigates become
  EAR 9, VRA 17, ZAN 11, KRE 9. Deliberately not the integer 9, which would round
  Vraygon to 16 and lose the measured value.
- Four approval amendments in
  `docs/drydock/frigate-structure-amendment-2026-09-08/`, one frigate per power,
  each advancing one revision. No other pack in any roster moves — asserted.
- `test/frigate-profile.mjs`, nine groups. Its largest obligation is proving the
  disabled rule is *inert*: 120 battles resolve byte-identically with the block
  present-but-disabled and with it deleted outright.
- `test/terminal-recording.js`: the pinned turn-4 replay's surviving structure
  moved 3 → 4, exactly the point Earth's frigate gained. Turns, victor, callback
  count and frame count are unchanged.

The governance guards could not be run. `test/fixtures/stock-approvals.js` reads
four approval files under `docs/drydock/` that are **absent from this branch and
from its whole history**, so `stock-promotion.js`, `stock-amendments.js` and
`stock-earth-light-cruiser.mjs` fail on a missing file before reaching any
assertion. This is a pre-existing condition, not a consequence of this change.
The new amendment is written in the same shape as the one file that does survive
and slots into the chain when the others are restored; until then, that only four
frigate packs move is verified by `test/frigate-profile.mjs` against a locally
reconstructed before-state rather than against the approval oracle. Every other
suite passes.

## 8. The flavour in this

Per Chris's standing direction that balance findings become content: powers build
frigates not because they are cheap, and not because a few dozen beings can crew
one, but because **a battle line without escorts loses its capital ships** — 38%
survival against 60%. The escort's value is that there are many of it and that
capital fire control cannot track something that small. That is a real in-world
reason for a power to invest in the survival of ships it knows will be picked off
first, which is exactly the investment Chris described. It has no player-facing
home yet; see the standing note that flavour has nowhere to live.

## 9. Reproducing

The scratch measurement scripts were written under an ignored `.tmp-` path and
not kept; the tables above record everything they measured. The two that recur
are committed: `test/faction-levers.mjs` for the faction-modifier sweep, and
`test/frigate-profile.mjs` for the gate and the pinned pack values.

Nothing is adopted. `toHit.hullProfile.enabled` remains `false` until Chris turns
it on.
