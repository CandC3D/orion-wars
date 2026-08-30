# Tactical Combat Design — working spec

## State of play (read this first; sections below are the chronological log)

*Updated 2026-08-29.*

**The system as it stands.** FASA-style power model: one pool per ship per
turn; movement, beams, and missile arming all spend from it; shields absorb
damage out of the residue, capped per facing per round. Six side-facing
shields. Firing arcs limit which mounts bear; ships steer toward the heading
that brings the most fire to bear. Weapon reach scales with hull class. One
damage-location roll per penetrating hit, on a table chosen by the facing
struck — rear hits take engineering and bite the current turn's pool. Turns
are three rounds; initiative is bid from movement commitment; each weapon
fires once per turn. Fleets hold formation and deploy as a line of battle,
heaviest hulls centre. Ships detonate on death in proportion to remaining
engine power. The engagement area is bounded.

**Hulls.** Corvette 0.5 (ZAN only) / FF 1 / DD 2 / CL 4 / CA 8 / BB 16, plus
unique sixth hulls: EAR Command Ship 8 (to-hit and sensor aura), VRA Monitor
16 (siege hull), KRE Strike Cruiser 4 (fast missile boat). Assault rides on
CA/BB; screening and point defence on the light hulls.

**Factions.** EAR: best shields, long accurate lasers, command aura, nose-heavy
arcs with a soft tail. VRA: worst shields on much the thickest hulls, heavy
blasters, tubes and beams on every bearing, ponderous, easy to detect. ZAN:
poor shields, tough, fastest, mixed weapons, emergency manoeuvre, corvette
swarms. KRE: efficient everything, short brutal guns, plasma, and the
short-range warp jump (once per turn, 30% of pool, up to 10 hexes, prefers
the target's rear arc). **No cloak exists in the game**; the cloak/detection
rules are written but dormant.

**Balance method.** All claims from the fleet trial harness
(`node test/fleet-trial.js`, sweeping 2–64 point scenarios), instrumented
workflow agents, and adversarial verification — several intuitive fixes
measured backwards. As of 2026-08-30 (§18) every faction is inside 35–65% at
all six scenario sizes; sweep at `--battles 450` minimum before trusting any
cell, ±7pp at the default.

---

Living document. Captures decisions settled in design conversation; supersedes
the rev. 1 brief where they conflict. Original design — no licensed material.
Lineage is acknowledged (FASA STCS, Star Fleet Battles) but nothing is copied.

## 1. Powers

| Power | Code | Colour | Beams | Missiles | Cloak | Shields | Hulls |
|---|---|---|---|---|---|---|---|
| Earth Federation | EAR | Blue | Laser cannons | Neutronic | No | Excellent | Average |
| Vraygon Star Realm | VRA | Gold | **Heavy blasters** | Neutronic | Light hulls only | — | Sturdiest |
| Zandrax Horde | ZAN | Red | Laser cannons | Neutronic + Plasma | No | Poor | Strong |
| Krelath Empire | KRE | Green | Blaster beams | Plasma* | Yes | Average | Average |

*Krelath heavy cruiser is the exception: neutronic missiles instead of plasma.

Note the pattern — blasters go to both cloaking powers, lasers to both
uncloaked ones. Blasters and plasma are short-range weapons; a cloaked ship
closes and strikes on decloak. Doctrine and armoury agree.

Earth: disciplined line fighter, standoff weapons, arcs cover the rear
(frigate mounts a single 360-degree beam).
Krelath: pure ambusher, nothing that reaches. Arcs 90-180 degrees forward.
Vraygon: **close-quarters bruisers with a standoff opener.** They begin the
engagement at range with neutronic missiles, cross under fire on the sturdiest
hulls in the game, and finish with the heaviest short-range gun anyone fields
— the heavy blaster, brutal inside 4 hexes and useless past 6. Their cloak
covers only the light hulls, so the battle line walks in openly while its
screen is hidden.

Vraygon's **heavy cruiser is a missile boat**: its beam and missile counts are
inverted against the class envelope (3 beams / 5 missiles) with an enlarged
magazine. This is faction flavour, not a change to the heavy cruiser class —
the other three powers keep the standard 5 beams / 3 missiles. Loadouts may
override the class envelope for exactly this kind of character.
Zandrax: mixes all three weapon types. No signature weapon, cannot be
countered by preparing for one threat. Grinds.

### Species

- **Earth Federation** — humans. Sphere-and-cylinder hulls; clean, disciplined.
- **Vraygon Star Realm** — silicoid life forms, which is why their ships are
  faceted hexagonal crystals. The armoured look is literal.
- **Zandrax Horde** — humanoid, green. Arrowhead hulls bristling with spikes.
- **Krelath Empire** — multi-limbed arthropods. Flat, wide, many-limbed hulls.

Models live in `assets/models/`, five hulls per power.

## 2. Weapons

Beams — no ammunition, variable power investment up to a maximum, damage
modified across four range bands.
- **Laser cannons** — accurate, moderate damage, consistent at range.
- **Blaster beams** — higher damage, shorter effective range, less accurate.

Missiles — finite magazine, fixed power cost to arm, interceptable.
- **Neutronic missiles** — slow, powerful, long reach.
- **Plasma torpedoes** — high alpha damage decaying with flight distance.

## 3. Hull classes

Points double per class. The class sets a maximum envelope; each design fills
it differently, which is what makes "destroyers may mount one missile" work.

| Class | Pts | Cores | Beams | Missiles | Magazine | Screen | Point defence | Assault |
|---|---|---|---|---|---|---|---|---|
| Frigate | 1 | 1 | 1 | 0 (hard) | — | 1 | light | no |
| Destroyer | 2 | 1 | 2 | 0-1 | small | 2 | light | no |
| Light Cruiser | 4 | 2 | 3 | 1-2 | medium | 3 | medium | no |
| Heavy Cruiser | 8 | 2 | 5 | 2-3 | large | no | no | yes |
| Battleship | 16 | 4 | 8 | 4-5 | large | no | no | yes |

Mounts grow ~1.6x while points double. A swarm out-shoots a capital ship on
raw mounts but dies faster and cannot take a world. Planetary assault is
inherent to CA and BB. Screening and point defence live on FF/DD/CL — the
light hulls are how a fleet survives a missile alpha strike.

Reference fleet at 24 points: 1 CA + 2 CL + 2 DD + 4 FF. Nine ships, eight
screening hulls, and exactly one assault-capable ship — kill it and the fleet
wins every exchange in space and still takes nothing.

### Weapon reach scales with hull class

A frigate does not mount the battleship's gun. Each class carries a smaller
mark of the same weapon, with `weaponReach` scaling both maximum range and the
range-band boundaries: frigate 0.50, destroyer 0.62, light cruiser 0.75, heavy
cruiser 0.88, battleship 1.00. An Earth laser reaches 9 hexes on a frigate and
18 on a battleship.

This follows the FASA pattern, where a beam type appears in successive marks of
growing reach, and it is the answer to light hulls out-fighting capitals on
equal-reach fire: a capital can now hold a range its lighter opponents cannot
answer. It also gives the standoff AI something to work with — out-reaching an
enemy is now a real advantage that a ship will manoeuvre to keep.

## 4. Shields

Six shields, one per hex side. **Side facing** — a distinct forward shield.
Numbered clockwise from front-left: #1 front-left, #2 forward, #3 front-right,
#4 rear-right, #5 rear, #6 rear-left.

Each shield is allocated power per turn, up to a maximum. Power converts to
shield points at the ship's **shield point ratio** — this is where faction
character lives. Earth's excellent shields are a favourable ratio, not bigger
raw numbers. Same power in, different protection out.

## 5. Power and allocation

**Engine cores** generate power. Cores are a rules abstraction; the visible
engine pods on the 3D models are cosmetic and carry no power meaning.
Every ship also has an impulse engine. Core capacity scales with class, so a
battleship's four cores are individually larger than a frigate's one.

Each turn every ship allocates its available power across four categories:
**movement, shields, weapons, cloak.**

Power converts to movement at the ship's **movement point ratio**.

Engine damage reduces available power directly, which gives big ships
graceful degradation and small ships brittleness: a battleship losing one of
four cores fights on at three-quarters budget; a frigate losing its single
core is finished. Sixteen frigates have sixteen single points of failure.
This is the efficiency advantage that concentration of force ought to have.

## 6. Damage

Three separate pools:
1. **Shields** — per facing, regenerate from the power budget.
2. **Superstructure** — internal, permanent, does not come back.
3. **System hit track** — graduated hits degrade sensors, individual shields,
   and engineering grids (shields / weapons / manoeuvre) to inoperative.

Individual weapon mounts can be damaged, repaired, or knocked out.

Shields regenerating while superstructure does not is what makes Earth and
Zandrax feel different rather than being the same ship with numbers moved
around. Earth shrugs off sustained fire from a direction it prepared for and
rebuilds between turns. Zandrax lets damage through to a deep structure it can
never recover. Earth wins engagements it controls the geometry of; Zandrax
wins ugly ones.

## 7. Cloak

Power to cloak **scales with hull size**, calibrated so that cloak and weapons
are an either/or choice at every class. In effect the cloak occupies the
weapons slot in the power budget: a cloaked ship of any size has given up its
guns, and on decloak that exact budget returns as weapons fire.

Movement and shields are unaffected. A cloaked ship is not weakened generally
— it is specifically disarmed. It manoeuvres and shields normally while
invisible, which makes cloak a pure positioning instrument: all that power
buys is *where you are when you appear*.

Because the cost scales, Vraygon's restriction to light hulls is a categorical
capability limit, not an economic one. Their capitals do not carry the device
at all; it is not that they cannot afford to run it.

**A cloaked ship cannot fire.** This is a hard prohibition, not merely an
economic pressure — firing would reveal position, and the cloak already taxes
the power systems. It holds even if a ship somehow has weapon power to spare.

Two consequences follow without needing separate rules. A cloaked ship cannot
run point defence, because interception is firing. And it cannot screen,
because screening means presenting yourself as a target and a cloaked ship is
not visible to be targeted. Cloak therefore removes a ship from the defensive
economy entirely.

For Vraygon this is the central per-turn decision: cloak the escorts and they
contribute nothing to fleet defence, or decloak them and they screen and
intercept but are visible. Hidden or protective, not both.

### Decloaking

Decloaking **occupies a combat turn**, but the power reallocation from cloak to
weapons happens on that same turn — so the guns charge while the ship is
uncloaking rather than costing a second turn afterwards.

Sequence: turn N cloaked and manoeuvring into position; turn N+1 decloaks,
shifting the cloak budget into weapons, exposed and unable to fire; turn N+2
opens fire with a full weapons budget.

The defender therefore gets exactly one turn of warning. That single turn is
the entire counterplay against ambush.

### Detection

Detection costs no power but **consumes a combat turn**, and it is
**directional**: the scanning ship picks one of its six numbered shield faces
and sweeps the arc originating there. Guess the wrong arc and the turn is
spent for nothing.

You can always look; you cannot look and shoot. Both sides pay: the cloaked
ship gives up its guns, the hunting ship gives up its turn. Hunting a cloaked
fleet is expensive, which is what keeps cloak worth its cost.

**Range is limited to 10 hexes.** Beyond that the cloak simply holds — a
cloaked ship crossing open space at distance is undetectable by any means.
Ten hexes is the contested approach: the band an ambusher must cross while
vulnerable to being found.

**A successful detection informs all friendly forces.** One scanner protects
the whole fleet, so the scanning tax is a few dedicated hulls rather than
every ship looking for itself.

A successful scan pays twice over — it finds the enemy *and* tells you which
shield facing to pour power into before the strike lands.

**Detection persists, but is breakable.** Once found, a cloaked ship stays
found until it escapes. Each turn a detected cloaked ship may roll to
**evade**, and a success loses it to the scanner again.

The evade roll resolves **before movement**, which makes a successful break
clean: the hunter loses contact and only then does the cloaked ship move, so
its new position is unobserved. Fail the roll and it moves under observation,
handing the defender both its bearing and the shield facing to reinforce.

That gives a detected ambusher a real decision each turn — press the approach
while visible, or spend the turn trying to disappear and start the approach
over.

The two cloaking powers differ by **distribution, not by rule** — same
mechanic, fitted to different hulls.

- **Krelath: every hull.** The entire fleet vanishes, capitals included. True
  ambush doctrine — nothing shows until contact.
- **Vraygon: light hulls only (FF/DD/CL).** Heavy cruisers and battleships
  never cloak. Their battle line advances in the open while its screen is
  hidden, so an enemy sees the capitals coming but not what escorts them.

This also splits the two powers' intel texture on the campaign map: a Krelath
fleet is simply absent from foreign sensors, while a Vraygon fleet reports as
capitals only, with unknown escort strength.

## 7a. Turn sequence (provisional)

Assembled from rules settled so far; ordering beyond the evade/move
relationship is inferred and needs confirmation.

1. **Energy allocation** — each ship distributes available power across
   movement, shields, weapons, and cloak.
2. **Evasion** — detected cloaked ships roll to break contact.
3. **Movement** — ships spend movement points.
4. **Combat actions** — each ship either fires, or sweeps a detection arc
   from one of its six faces. Cloaked ships may do neither.
5. **Damage resolution** — shields by facing, then superstructure, then
   system hits.

## 8. Crew

Captain's skill rating, crew efficiency rating, weapon damage factor.
Casualties degrade the ship progressively, with a threshold beyond which it
cannot fire at all.

## 9. Open

- Core capacity numbers; shield and movement point ratios per class and power.
- Magazine sizes; arcs per mount per design.
- Is the **evade roll modified by hull class**? A cloaked battleship ought to
  be harder to hide than a frigate. This is the natural lever on Krelath's
  capital-ship cloak, currently their strongest single asset, and it would
  give Vraygon's light-hull-only restriction a silver lining — the hulls they
  *can* cloak are the ones that evade best.
- Does evading cost anything beyond the roll — power, or the combat action?
- Where in the turn does the detection scan resolve? Sketched below as a
  combat action after movement, since scanning "uses a combat turn," but this
  needs confirming.
- **The critical unknowns are now weapon ranges and movement rates**, because
  together with the 10-hex detection bubble they decide whether ambush works
  at all. If blasters and plasma reach most of 10 hexes, an ambusher can
  strike from the edge of detection. If they reach half that, the attacker
  must cross five detectable hexes before it can hurt anyone, and the
  defender's scanning turns are well spent. Everything about cloak balance
  reduces to this ratio.
- How much allocation the player does by hand vs. doctrine presets.
  Four categories per ship is light enough to expose; nine ships per fleet is
  the pressure. Leaning presets with override.

## 10. Stale

`data/factions.json` predates all of this. It carries flat beam/torpedo
scalars, costs of 4-25 rather than the 1/2/4/8/16 ladder, blasters wrongly on
Zandrax, and no cloak on Vraygon. Rewrite it once the numbers above land.

---

## 11. Trial results (first build)

`node test/fleet-trial.js` runs point-buy fleets against each other and reports
win rates. `--watch EAR KRE` narrates a single battle. Seeded throughout, so
any result reproduces.

### Bugs the harness caught

- Dead ships kept absorbing fire for the rest of a volley, inflating the
  winner's damage figures.
- **The scanning AI aimed its detection arc at the centroid of all living
  enemies, including cloaked ones it could not see** — sweeping with hidden
  knowledge, so detection never failed and cloak was worthless.
- Cloaked ships approached straight down the obvious bearing, throwing away
  the one thing cloak buys. They now curve to a flank while beyond detection
  range and turn in only to strike.

### Balance as it stands (200 battles per pairing, 24 points a side)

| Power | Win rate |
|---|---|
| Earth Federation | 95% |
| Zandrax Horde | 69% |
| Krelath Empire | 33% |
| Vraygon Star Realm | 2% |

**The structural finding: short-range weapons without full cloak are
unplayable.** Earth's laser cannons reach 15 hexes and Zandrax's the same, so
both can fight at a distance the blaster powers cannot answer. Krelath
survives it by cloaking every hull and choosing the engagement. Vraygon cannot
— their capitals must cross open ground under fire carrying an 8-hex weapon —
and they sit at 2%.

Vraygon holds the worst structural position in the game: the short-range
armoury without the cloak that justifies it. This is a design question rather
than a tuning one. Options include giving them laser cannons, extending
blaster reach, widening their capitals' missile armament, or granting the
capitals some other compensation entirely.

### Concentration of force

Equal points, different shapes, Earth on both sides:

|  | 1 BB | 2 CA | 4 CL | 8 DD | 16 FF |
|---|---|---|---|---|---|
| 1 BB | – | 54% | 100% | 100% | 100% |
| 2 CA | 0% | – | 100% | 100% | 100% |
| 4 CL | 0% | 43% | – | 100% | 100% |
| 8 DD | 0% | 24% | 100% | – | 100% |
| 16 FF | 0% | 0% | 42% | 99% | – |

Strictly transitive, big beats small, and **overshot in the opposite direction
from the first draft.** Before the rebalance eight destroyers beat everything;
now sixteen frigates lose to one battleship 100-0, because a frigate beam does
4 damage against a 44-point shield facing that fully regenerates each turn.
Small ships literally cannot scratch a capital.

The sweet spot is between the two runs. The dial is the ratio of capital
shield capacity to light-hull damage output — currently far too wide.

### Also outstanding

- Battles now average 20-24 turns against a 25-turn cap, so a meaningful
  share are being decided on surviving points rather than fought out.
- Crew skill, crew efficiency and casualty effects are specified in the design
  but not implemented; crew rating is pinned at 0.
- Missile flight is modelled as one turn with interception on arrival.

---

## 12. What the FASA research changed

Six research agents read the public record on the FASA factions. The findings
were largely a critique of what we had built, and several reversed our choices.

### We had invented SFB Gorn, not FASA Gorn

Two of our four Vraygon pillars matched and two did not. Sturdiest hulls: yes,
best-evidenced fact about them. Close-quarters bruiser: half — FASA Gorn want
the close brawl for an **arc** reason, not because they own a short-range gun;
their beams reach about as far as a Federation phaser of the same era. Standoff
missile opener: **no**, and inverted — FASA's Gorn were the faction that got
*out-ranged*, and FASA has no ammunition-limited weapon anywhere. Heaviest
short-range gun: **no** — in FASA that is unambiguously the Romulan plasma
launcher, which is our Krelath. We had given the same signature to two powers.

**The FASA Gorn distinctive is arcs, not range.** Every other power concentrates
firepower in the nose. The Gorn spread their guns into four wide quarter-arcs
with no straight-ahead position at all. Vraygon are now the power with no blind
side: quarter-arc beams, missile tubes fore *and* aft, no privileged bearing.
You can flank a Vraygon; it will not help you.

### Corrections applied

- **The reach gap was a category error.** FASA's era-matched gap was ~20%
  (Federation 24 hexes against Klingon 20). Ours was 80%. An 80% gap converts
  directly into an unanswerable kite, because the standoff AI holds the range
  open at exactly the enemy's reach plus one. Narrowed to ~17%.
- **Our arc logic was inverted.** FASA gave its dominant nose-forward faction a
  soft tail, and the overfly into the aft shield was the named counter to the
  strongest ship in the game. We had given Earth all-round coverage and Vraygon
  forward-weighted arcs. Both are now the other way round.
- **Vraygon had good shields.** FASA Gorn are the worst-shielded of the majors
  and never improve across three centuries; the hull carries them. Vraygon now
  have the worst shield ratio in the game on much the thickest hull — armour
  rather than shields, so they degrade monotonically instead of resetting.
- **Vraygon lost the cloak entirely.** Gorn carry no cloaking device, and the
  research notes we had diluted the cloak by giving it to two powers. It is now
  Krelath's alone. NOTE: this reverses the earlier ruling that Vraygon cloak
  their light hulls, and should be confirmed.
- **System damage is now per penetrating hit**, on a table chosen by the facing
  struck — forward hits take sensors and bridge, flank hits take weapons, rear
  hits take engineering and bite the current turn's power pool. Previously we
  accumulated damage and rolled once per 8 points, which rewarded few big hits
  and made light hulls irrelevant.
- **Zandrax gained a real mechanic**: the emergency manoeuvre. Extra hexes at no
  power cost, paid for in self-inflicted engine stress and accuracy. The Klingon
  pattern of buying tempo by hurting yourself.
- **Initiative is bid from movement commitment** rather than a d100 coin flip.

### The verdict we should not ignore

The research is blunt that **FASA did not solve our problem either.** Its
Federation dominated for exactly our reasons — best shields, longest reach, most
power, no cloak tax — and contemporary players describe the game collapsing into
"park at optimum range and trade dice." Its Romulans were the weakest major by a
wide margin, and the cloak cost 55-73% of the power pool: never cloaking meant
playing an undercosted ship, always cloaking meant playing one with half its
stats switched off. Our Krelath sat at 33% for the same reason.

So we should not expect to inherit a solution. The per-facing damage tables are
the one mechanism FASA had that genuinely rewards crossing open ground, and we
have now taken it.

### Current state, and an unresolved tension

Two settings, each good at one objective and bad at the other:

- Steep class reach ladder (0.50-1.00): faction spread of just **10 points**
  (EAR 48, VRA 44, KRE 39, ZAN 38) but a strictly transitive shape matrix where
  frigates lose to everything.
- Narrow ladder (0.78-1.00) with wider light-hull arcs: a genuine
  rock-paper-scissors cycle in the shape matrix — destroyers beat battleships,
  frigates beat destroyers, battleships beat frigates — but faction spread blows
  out to 51 points as Zandrax collapses.

Faction balance and fleet-shape balance are currently pulling against each
other through the same lever. That is the open problem.

---

## 13. Formation, and what scenario size revealed

### Fleets now hold formation

Ships previously moved with complete freedom: each picked the nearest enemy and
closed at its own speed. Since movement costs differ by a factor of six across
the classes, a mixed fleet arrived piecemeal every battle — frigates were in
contact on turn one while the heavy cruiser was still four hexes back, and the
fleet was beaten in detail. Screening, which needs ships within two hexes of
what they protect, was only ever half-covering and collapsed to nothing by the
midpoint.

Both human and AI commanders would at least try to hold formation, so the AI now
does. Escorts hold station on the capital they screen, and no ship advances more
than a cohesion radius ahead of the fleet's centre of mass. Measured effect:
screen coverage of the capital rose from 2 (decaying to 0) to a steady 3, and
fleet spread tightened from 8 hexes to 2.

That change cost turns. A formation-keeping fleet closes at the pace of its
slower elements, and a 24-hex approach on a 12-turn clock began timing battles
out before contact — Earth against Krelath drew 94% of the time. The approach is
now 16 hexes on a 16-turn clock.

### Scenario size is a first-class variable

Scenarios run from about 2 points to 64 or more, so the harness now sweeps six
sizes rather than testing one. Compositions scale from two frigates up to a
64-point fleet of 2 BB, 2 CA, 2 CL, 2 DD and 4 FF.

**This immediately falsified the idea that one balance number describes the
game.** Win rates by scenario size:

| points | EAR | VRA | ZAN | KRE |
|---|---|---|---|---|
| 2 | 55% | 2% | 40% | 23% |
| 8 | 17% | 26% | 47% | **92%** |
| 16 | 68% | 33% | 71% | 5% |
| 24 | 73% | 40% | 58% | 23% |
| 32 | 78% | 52% | 57% | 4% |
| 64 | 86% | 76% | 38% | **1%** |

### The finding: cloak does not scale

Krelath are dominant in small actions and worthless in large ones — 92% at eight
points, 1% at sixty-four. The mechanism is clear once stated. A cloaked ship
cannot fire, so cloaking a whole force switches off *all* of its firepower during
the approach. In a small action that is two or three ships hiding for a couple of
turns, and the ambush pays. In a large action it is a dozen ships contributing
nothing while a dozen enemies shoot, and the bigger enemy fleet also fields more
sensors to hunt with. The cost of the cloak grows with fleet size while its
payoff does not.

This is a structural property of the cloak rules as ruled, not a tuning error,
and no adjustment to the evade chance or power fraction will remove it. If
Krelath are to work at every scenario size, the cloak probably needs to be
partial — a force that hides part of itself while the rest fights — rather than
all-or-nothing across the fleet.

Vraygon show the inverse and milder version: weakest at 2 points, strongest at
64. Heavy armour and all-round arcs need a fleet around them to matter.

---

## 14. The sixth hulls, and what they cost Krelath

Each power now has one unique sixth hull, carrying its doctrine as a capability
rather than a stat modifier. Models for all four are in `assets/models/`.

| Power | Hull | Pts | Character |
|---|---|---|---|
| Zandrax | Corvette | 0.5 | Soviet-tank doctrine: cheap, numerous, one short heavy gun, almost no shields, and a x3 explosion yield |
| Krelath | Dimension Submarine | 4 | The only cloaking hull in the game |
| Vraygon | Monitor | 16 | Silicoid siege hull: 221 structure, guns on every bearing, 14.5 power per hex |
| Earth | Command Ship | 8 | +1 to hit and extended detection for friendlies within 6 hexes |

Two new mechanics came with them. **Ships detonate when destroyed**, damaging
neighbours in proportion to the power left in their engines over distance — a
healthy ship is a bomb, a gutted one fizzles. And **command ships coordinate**,
which makes the counter to the submarine a purchase rather than a free trait.

### Cloak moved to one hull, which fixed the scaling problem and broke Krelath

Restricting cloak to the submarine does what it was meant to: a fleet no longer
switches off all its firepower during the approach, so the cost of cloaking
scales with the points committed to it rather than with fleet size.

It also removed Krelath's entire identity, and nothing of comparable value
replaced it. Faster engines and slightly better shields do not compensate for
losing the ability to choose every engagement. Krelath now sit at 4% overall.

**Worse, their own sixth hull makes them weaker.** Measured at 24 points:

| opponent | Krelath *with* submarine | Krelath *without* |
|---|---|---|
| Earth | 0% | 1% |
| Vraygon | 1% | **26%** |
| Zandrax | 0% | 5% |

Trading a fighting light cruiser for a hull that hides and never fires is a
straight downgrade. A cloaked ship contributes nothing while hidden, so it only
pays if the ambush it eventually delivers is worth more than four points of
guns for the whole battle. As costed, it is not close.

### Bugs fixed while diagnosing this

- **Plasma spread was applied before the shield.** An 18-point torpedo was split
  into 5-point chunks and each was absorbed separately, so a 13-capacity facing
  swallowed the whole thing. In FASA the spread applies to damage that has
  already penetrated. Now fixed: the blow lands whole against the shield, and
  only the penetrating remainder is spread across damage-location rolls.
- **The blaster's long band was -4 to hit** against the laser's 0/-2, a 40%
  swing on d10, so Krelath could not usefully return fire while closing. Now -2.
- **Plasma reached 12 against the neutronic missile's 20**, making Krelath's
  entire missile armament dead weight against anything standing off. Now 17,
  with the damage decay kept severe so the identity survives.
- **The map had no edges**, so a long-ranged fleet could retreat forever. Bounds
  added at radius 22. Honest note: this had *no measured effect*, because at a
  16-hex start the kiter never needs to retreat far enough to reach one. It is
  correct in principle and inert in practice at current settings.

### The open design question

Krelath need a replacement fleet-wide identity. One hull cannot carry a faction.
The options, none of which the build should choose unilaterally:

1. Give them a different standing trait — superior sensors, unusually efficient
   power, or plasma that behaves differently against shields.
2. Make them submarine *specialists*: cheaper submarines, or several per fleet,
   so the hull becomes a real fleet component rather than a token.
3. Make the submarine itself decisive enough to be worth its points — which
   probably means it fires while submerged, a rule previously ruled out.

---

## 15. The Krelath short-range warp

Krelath's replacement fleet-wide identity, standing in for the cloak that moved
onto the submarine.

Once per turn a Krelath ship may spend **30% of its power pool** to reposition
up to **9 hexes**, arriving by preference in the target's **rear arc**. The jump
takes the ship's action for that round, so the guns come to bear the following
round of the same turn.

It answers precisely the two things that were killing them:

- **It closes on a standing-off enemy instantly.** Krelath were being kited into
  their worst range band and hitting 10% of shots; they can now refuse the
  geometry entirely.
- **It puts damage on shield 5**, where the rear facing table takes engineering
  and bites the *current* turn's power pool — so a ship caught from behind can
  neither retreat nor absorb.

The old cloak identity was choosing *whether* to engage. This is choosing
*where you appear* in an engagement, paid for in guns rather than in silence.
It is louder, more aggressive, and more Krelath.

Measured effect at 24 points: 4% → 13% on the warp alone, then 23% once the
submarine was re-costed. At 32 points all four powers now fall between 33% and
54%, a 22-point spread and the tightest yet recorded.

### The submarine, re-costed

Dropped from 4 points to 2, with stats trimmed to match. The measurement was
unambiguous: at 4 points, swapping a light cruiser for the submarine cost
Krelath 25 percentage points against Vraygon. With the warp carrying the faction
identity, the submarine is the scout and flanker you buy on top of it, not the
doctrine itself — and it was priced as though it were the latter.

### Still outstanding

Vraygon at 80-84% in the larger actions: their monitor and all-round arcs look
too strong at scale. Earth at 87% in the 2-point skirmish. Krelath at 8% at 64
points, so the warp has not fully solved their large-action problem.

---

## 16. The search finds the AI was the problem

Two of five search agents completed before a session limit stopped the rest.
Between them they found five genuine bugs — four in the AI, one in the sim —
and their combined result is adopted.

### The big one: ships could not point their guns

The AI always turned a ship's nose toward its nearest enemy. So any mount whose
arc excluded dead-ahead **never fired**. Instrumented: the destroyer's stern
beam, the light cruiser's quarter beam, the heavy cruiser's aft mount, both
battleship stern chasers, most of Vraygon's broadside — 0.00–0.03 firings per
battle. A Vraygon frigate, whose single gun sits in a port arc, could not shoot
at all: mirror matches were 100% draws.

Every arc decision made since the FASA research was running on top of this.
Vraygon's "no blind side" identity, Earth's soft tail, the monitor's all-round
battery — none of it was actually being exercised. Ships now turn toward the
heading that brings the most weight of fire to bear (`bestHeading`), which
makes the arc system real for the first time.

### The others

- **Deployment was on a hex diagonal**, where distance is degenerate: every A
  ship was equidistant from most of B, targeting fell through to array order,
  and side A's whole force converged on one enemy while B stayed strung out.
  Mirror matches ran 77–97% for side A — and the harness always seats the
  alphabetically first faction as A, which manufactured much of "EAR 52% / KRE
  8% at 64 points". Fleets now deploy on a proper line abreast; mirror matches
  measure 45–50%.
- **The warp never fired.** It was tried only when no weapon could bear, and a
  Krelath blaster reaches 17 hexes of a 16-hex opening range — so the faction
  trait never triggered once. It is now attempted before firing when it gains
  at least `minGain` hexes, with a fleet-fraction cap per turn.
- **Explosions used full rated power, not remaining power**, contradicting the
  written rule. A gutted ship detonated as hard as a healthy one. (This was my
  implementation error; the agent caught it.)
- **`preferredRange` had a floor of 4 hexes**, silently stationing short-gun
  hulls (Krelath light hulls, the corvette) outside their own best band.
- **The reserve was slack**: measured power flow showed ~15 of a ship's pool
  wasted per turn, so the doctrine fractions barely mattered. Reserve is now
  dynamic — low at standoff, high when enemies are in threat range — and the
  optimiser retuned it per faction.

Also from measurement: Vraygon's dominance tracked one hull almost exactly
(the six-tube heavy cruiser: 64–78% with it, 27–35% without), and the command
ship's +1 aura scaled from a 4% buy at 24 points to a 93% buy at 64. Both
re-statted. The submarine measured 13–43% against a same-cost destroyer at
every scale — still a bad buy; its capability has no target since nothing
enemy ever cloaks. Open design question.

### State after adoption

Mirror matches are fair, the concentration matrix is non-transitive with no
degenerate shape, and per-size spreads dropped from 51–86pp to roughly 28–53pp
at most sizes. Two clear outliers remain: **Zandrax collapse at 32 points**
(~5%) and **Krelath excess at 24–32** (~70–90%). A warp re-price barely moved
either, so the levers are elsewhere. Three of the five search agents never ran;
the next search session starts from a much sounder foundation.

---

## 17. Submarine retired; strike cruiser in its place

The Dimension Submarine is removed by ruling. Its epitaph is the measurement:
a hull that hides and never fires is a bad buy at any price in a game where
nothing enemy cloaks to hunt — and its apparent value in earlier trials was a
scoring artifact (a cloaked survivor banking its points at the tiebreak while
contributing nothing). **No hull in the game now carries a cloak.** The cloak
and detection rules remain written and dormant; the model is repurposed:
`Krelath Dimension Submarine.stl` is renamed `Krelath Strike Cruiser.stl` and
serves as the strike cruiser's model.

Krelath's sixth hull is now the **strike cruiser**: a missile-dominant light
cruiser with real legs — 4 points, 1 beam / 4 tubes, 16-round magazine,
movement at 1.2 power per hex against the light cruiser's 2. With the warp it
repositions, launches, and runs.

First measurements: it is a mild *negative* buy (−4 to −13pp against the light
cruiser it displaces), through two loadout variants (pure plasma; 50/50 mix).
Handed to a focused diagnose-and-verify workflow rather than more blind
iteration; constraints hold it to the ruled spec (4 pts, missile-dominant,
fast).

### Strike cruiser: diagnosed, rebuilt, verified, adopted

A diagnose-and-verify workflow instrumented the failing hull rather than
guessing. Three measured causes, none of them "numbers too low":

1. **Salvo stacking on corpses.** Missiles resolve a turn after launch, so a
   tube cannot see that an earlier tube already killed the target. Four tubes
   put 50–55% of launches into already-dead ships, and half its fire went at
   frigates one plasma already kills.
2. **Its speed bought it the worst shot.** Initiative is bid from movement
   commitment, so at 1.0 power/hex the hull fired first in essentially every
   round — into per-round shield caps still full. Only 18.6% of its beam damage
   reached structure, against 42.5% for the light cruiser. In this resolver
   movementPointRatio is mostly an initiative dial, not a mobility dial.
3. **`screen: 2` classed the fastest hull in the game as a picket**, bolting it
   to within 2 hexes of the heavy cruiser and making it unscreenable itself.

Rebuild (data only): 3 tubes + 2 beams (still missile-dominant), movement 1.5
(still fastest cruiser), screen 0 (a light capital the fleet screens),
structure 22, paid for with impulse and a point of PD. Like-for-like in the
same deployment slot the buy went from −8.6 to **+5.5**, reproduced by an
adversarial verifier on independent seeds.

The verifier also caught a harness artifact worth more than the hull: the
sixth hull was APPENDED to compositions and deployment ran in list order, so
it always deployed on the extreme flank — a slot measured at **~27pp of win
rate** against any 4-point hull placed there. Deployment now forms a proper
line of battle, heaviest hulls in the centre, wings light. Mirror matches
stay fair (30/28/2).

Where it lands: the flank artifact is gone (buy −25 → ≈−9 in fleet context)
but the strike cruiser still runs slightly negative against a plain light
cruiser at 24 points. The hull is sound like-for-like; the residue is a
fleet-composition effect, left for the next balance pass. Sweep after
adoption: spreads 27–60pp, worst cells EAR 78% at 32 and KRE 23% at 64.

---

## 18. The outlier balance pass (adopted 2026-08-30)

A three-agent workflow (large-action tuner, small-action tuner, merger with
independent verification) closed the remaining scenario-size outliers.
**Every faction now sits inside 35–65% at all six sizes**, held on five
independent seed sets at up to 800 battles per pairing. The change set is
data-only — 21 values in `tactical-tuning.json`, 16 in `loadouts.json`, the
resolver untouched — so any single change reverts independently.

The diagnoses matter more than the numbers:

- **Earth's large-action dominance was not the aura or the battleship — it was
  the command ship's point defence.** By the back half of a fleet action
  Earth's escorts are dead, and the command ship was the only PD left beside
  the surviving capital, halving every missile aimed at it. PD 3→0 alone moved
  Earth 74→45 at 32 points. The aura was worth only 7–12pp.
- **The heavy cruiser was a trap purchase.** At 4 power/hex it spent its pool
  closing and had nothing left to absorb with; Earth fielding one instead of
  two light cruisers fell 51→24% at 32 points. Now 3 power/hex. This one
  change carried Krelath from 31% to 39% at 64 (their CA died first).
- **Zandrax's emergency manoeuvre was hurting its owner** — ablating their own
  signature trait was worth +14–16pp. Two points of self-damage was a quarter
  of a corvette. Now 1 stress for 5 hexes: it finally does what it's named for.
- **The corvette's short reach let enemies kite the whole Zandrax fleet**,
  because standoff range keys off the nearest enemy, and the fastest hull is
  almost always nearest. Its 0.66 reach was talking opponents into holding at
  12 hexes where every Zandrax gun is dead. Now 0.78, inside the ladder's
  documented spread.
- **The warp was costing Krelath 35pp at 64 points** — a ship that jumps
  behind a fourteen-ship line arrives alone and does not come back. Costlier
  and wider (0.35 pool, 60% of the fleet may jump) rather than shorter, which
  preserved the trait where it wins the small game.
- **The strike cruiser now pays for its own escort**: PD back to 2, so it
  stops consuming fleet protection without returning any. Finally a positive
  buy (+2 at 32, +5 at 64).

Caveat recorded by the merger: the sweep at default `--battles` gives only
±7pp per cell. Use `--battles 450` (150/pairing) as the honest minimum and
`--battles 2400` for a definitive table. Thinnest margins: Zandrax 37–39%
at 32 points, Krelath ~60–63% ceiling there.

---

## 19. Class-interaction accuracy (ruling, 2026-08-30)

Hulls below 8 points take a to-hit malus firing at hulls of 8 points and up,
and heavies take the same firing down — small guns cannot hurt capitals,
capital guns cannot track small ships. Config: `toHit.classInteraction`.
Units are d10 pips; fractional pips resolve probabilistically through the
seeded PRNG, so −0.5 is a true −5%. **Beams only** — missiles carry no
accuracy roll in this sim, an asymmetry with consequences (below).

Measured at −5% and −10% (both ways, 150 battles/pairing, against the §18
baseline):

- **Faction balance survives both magnitudes** — all 24 cells stay inside
  35–65%, and mid-size spreads actually tighten (24-point spread 24pp → 19pp
  at −5%), mostly via Earth's 24-point cell rising from 36% toward 46% as
  enemy light hulls lose accuracy against its heavy-rich fleet. The 2- and
  8-point cells are bit-identical across all runs — those compositions carry
  no heavy hulls, so the rule never fires: a clean internal validation.
- **The shape matrix moves toward the capitals**, increasingly with magnitude.
  16 frigates vs 1 battleship: 32% baseline → 26% at −5% → 17% at −10%.
  8 destroyers vs 2 heavy cruisers: 80% → 69% → 46%.
- **The missile exemption is why.** The malus is nominally symmetric, but
  heavies fire missile-heavy batteries (unaffected) while light swarms are
  beam-reliant — so in practice the rule protects capitals from swarms more
  than it protects swarms from capitals. Directionally half of the intent.

Default adopted: **−0.5 (−5%) both ways** — the gentler setting; the shape
matrix keeps its non-transitive texture with no cell below 26%. At −10% the
swarm-versus-capital game starts collapsing. If the "capital guns cannot
track small ships" half should bite equally, the missile analogue would be a
small interception/accuracy penalty for heavy-launched missiles against light
hulls — an open option, not built.

### The missile half (adopted, 5%)

`toHit.missileClassInteraction`: a missile launched by a heavy hull at a light
hull is **evaded outright** with the configured probability, rolled before
interception — a nimble ship dodging a capital-grade warhead needs no point
defence nearby. One-directional by design; light-launched missiles at big slow
targets need no help. Missiles carry their shooter's class with them in flight.

Measured at 5% and 10% against the beam-only baseline (150 battles/pairing):

- **The intended texture returns.** 16 FF vs 1 BB recovered 26% → 29-30%; the
  battleship's swarm-kill softened 83% → 80-81%; and 1 BB vs 4 CL dropped
  51% → 41/38% — the battleship now genuinely struggles to track cruiser
  packs, since both halves of the rule land on it.
- **Faction balance holds** with two watch items: Zandrax at 24 points rides
  the ceiling (65-66%, up from 60 — capital missiles missing their corvettes
  is a direct buff to the swarm), and Earth's 24-point cell sits low but in
  band at 36-39%. Everything else 38-64%.
- 5% vs 10% differences are mostly within noise; 5% adopted for parity with
  the beam rule's −5% and because it keeps Zandrax at rather than over the
  ceiling.

Both dials (`classInteraction`, `missileClassInteraction`) are independent
single-value edits if balance needs shading later.

---

## 20. Flight rules (ruling, 2026-08-30)

Chris: ships were "sliding around like hockey pucks" — movement had no
relationship to heading, because the engine had none. Ruled and built:

**A ship moves only straight along its facing, and may turn at most
`turnRatePerRound` hexsides per round** (corvette 3; frigate, destroyer,
strike and light cruisers 2; every heavy hull 1). Turning costs no power —
the cost is tempo, as in FASA. Config: `tuning.movement`.

Consequences that fall out with no further rules: pursuit becomes banked
arcs; capitals wallow through their turns while light hulls dance; a ship
that wants to open the range must first turn *away*, pointing its forward
guns off-target — retreat now has a price in fire. The warp jump is exempt
(it is dimensional travel, not flight) and Zandrax's emergency burst spends
its free hexes along the facing like any other flight. **Momentum** (forced
carry-over of speed between rounds) is deliberately not in v1; noted as a
future dial.

**Balance broke along doctrine lines, as it should.** At 100 battles/pairing:
Earth collapsed to 17% at 24 points (its kiting doctrine requires facing away,
silencing six of its eight forward guns; its soft tail cannot fight
retreating) while no-blind-side Vraygon rose to 76% (it does not care which
way it flies). Krelath (warp-exempt) and Zandrax held. The full sweep spread
widened to 57–63pp at mid/large sizes. This is the new rules being real, not
a defect — a re-balance pass under the flight regime is the next step, and
the old balanced state remains reachable by `movement.coupledToFacing: false`.

Viewer: replays re-recorded; all radial-gradient effects hardened against
non-finite coordinates (`safeRadial`), and `arena.js` now carries a
cache-busting version query — a stale cached script cost a full debugging
loop chasing a ghost error.
