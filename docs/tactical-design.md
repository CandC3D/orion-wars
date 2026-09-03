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

---

## 21. The flight-regime balance pass (adopted 2026-08-30)

Three-agent workflow; all 24 faction/size cells now inside 35–65%, held on
eight independent seed runs and re-verified after adoption (spreads 8–26pp).
The change set: ~20 changes across the tuning data plus two faction-neutral
resolver changes.

### Chris's knife-fight observation became the load-bearing rule

`movement.withdrawFireFraction 0.7`: **opening the range is a decision, not a
reflex** — a ship only withdraws if it keeps at least 70% of its weight of
fire while doing so; otherwise it stands and fights. Watching the arena, Chris
saw Earth "retreat to maintain maximum range and get chased down rather than
stick it out in the knife fight" — this rule is that observation, faction-
neutral. The merger rates it one of the two most load-bearing changes
(reverting it breaks five cells).

### Instrumentation overturned the plausible stories, again

- **Earth's collapse was not primarily the stand-off AI.** The Earth agent
  built a value-based stand-off replacement and measured it: helped three
  cells, hurt Earth at 24, wrecked three other factions. Rejected. The real
  killer: **Earth's own command ship was a −25pp purchase**, fielded at
  exactly the three collapsed cells (24/32/64) and none of the healthy ones.
  Fixes: aura radius 4→6 (the +1 covered only ~45% of Earth's shots — the
  fleet was wider than the bubble), command-ship turn rate 1→2 (a hull bought
  to keep station with light cruisers cannot turn at half their rate), and
  reserve 0.5→0.45 (a destroyer was holding back enough power for one laser
  out of two mounts).
- **Krelath's 90% at 32 points was a stance bug, not the warp.** The warp
  survived untouched.
- **Vraygon at 16 points was fighting inside its own dead band** — held at
  ~11 hexes where the heavy blaster earns nothing and the laser still
  collects +1. Movement 1.45→1.25: still the slowest fleet by 25%, but able
  to reach the range its gun was priced on.

### The price, and the two open problems

1. **The concentration matrix is broken.** Verified post-adoption: 4 CL beat
   every other shape at 95–100%; destroyer and frigate swarms lose almost
   everything (8 DD vs 1 BB fell 73%→5%). The merger attributes it to
   withdrawFireFraction ending the era of backs-turned fights — once
   everyone stands, capital-class absorption dominates small hulls — and
   found no dial that fixes it without breaking the faction pass. **Next
   job:** a class-balance fix to how capital shield absorption scales
   against many small attackers.
2. **Two sixth hulls remain negative purchases** (audited with/without):
   EAR command ship −25pp at 24 points even after its fixes; KRE strike
   cruiser −19pp at 64. VRA monitor is +22pp at 32; ZAN corvette neutral.

Two code-intent bugs recorded, deliberately unfixed: `poolScaling`'s sign
contradicts its comment (but the comment's intent measures as the worse
game), and the command ship's sensor/detection ratings buy nothing while no
cloak exists in-game.

---

## 22. The command ship retires; the Yamato and the flight deck arrive (rulings, 2026-09-01)

Chris: "the Earth needs the Yamato more than ever," and "a Krelath carrier as
a first go." Both adopted from referee-verified prototype trees.

**Earth Dreadnought** (8 pts, sixth hull, replacing the command ship): three
cores driving a 63-power pool into the **photonic cannon** — a spinal keel
mount that draws the pool off the top for ~4 turns (visibly soft while
charging, by the residual-shield model's own arithmetic), fires one 26-damage
shield-bypassing bolt, then vents dark for 2 turns. Aimed by pointing the
ship; worst band inside 6 hexes (a keel gun cannot track a knife fight). No
stern battery — it cannot withdraw fighting, and per measurement it should
not. Killed mid-charge, the capacitor bank goes up with the ship. The referee
proved it the only candidate that repairs the balance hole the command ship's
retirement opens (the old hull was secretly Earth's handicap holding Krelath
in band).

**Krelath Carrier** (8 pts, bought from the heavy cruiser): the strike-craft
system adopted engine-wide — squadrons as persistent sub-units (2×6
interceptors, 2×4 bombers), permanent attrition, PD interaction, and a
carrier exempt from the withdrawal-fire test because its battery is its wing,
which bears on every heading. Krelath keeps the strike cruiser too; fielding
policy per scenario size is a harness matter. First measurements: fixes
Krelath's chronic large-action weakness and overshoots (94% at 16, 77-80% at
64), with one beautiful hole — Vraygon's all-round arcs and armour weather
the strikes (30% at 24). A tune-and-verify workflow is bringing it into band.

Maiden battle (dreadnought fleet vs carrier fleet, logged): the cannon charged
20/40/60/72, fired its first historic bolt at point-blank range — and missed
(its worst band; the game teaching its own doctrine). Mutual near-annihilation;
Krelath's last ship held the field. Both new systems log fully for the arena.

Merged via git merge-file three-way (both prototypes shared the pristine
base): zero conflicts, harness green, both hulls coexist in one engine.

Open: carrier tuning in flight; arena replays to re-record after it lands;
models for the two new hulls (the retired command ship model is available for
repurposing, Chris's call); the stale strategic-layer factions.json still
awaits its bridge to the tactical roster.

---

## 23. The carrier tuned into band (adopted 2026-09-01)

Tune-and-verify workflow, adopted with the verifier's four conditions. All 72
cells (4 factions × 6 sizes × 3 seed sets) inside 35–65% at 600
battles/pairing, **with the dreadnought present** — the combined state is the
verified state. Data-only: resolver byte-identical.

The diagnosis corrected our story again:
- **The warp hypothesis was wrong.** Deleting the warp entirely barely moved
  the carrier's numbers. What protected the deck: `fire()` targets the
  nearest enemy, and the formation leash held the whole fleet back with the
  carrier — it wasn't hiding behind the line; the line was chained to it.
- **The CAP missile screen, not the strike wave, carried most of the hull's
  value** — a ceiling-raising interception bonus cut missiles getting through
  six-fold, fleet-wide, unbounded, free. Nerfed 5×: the single biggest lever
  (+12 to +23pp of buy).
- **16 points is structurally unfixable by tuning**: the carrier there is
  bought out of the fleet's only capital and half the list's fighting power
  is aircraft (79–94% under every tuning tried). Now a **game rule in data**:
  `strikeCraft.minFleetPoints: 24` — a carrier requires a 24-point fleet.
- Krelath now field a ladder: nothing at 2, strike cruiser at 8–16, carrier
  at 24+ — the 8-point dip (34%) was simply their unique hull being
  unaffordable there; fixed by fielding policy, row now 51/42/54/50.

Honest numbers per the verifier: the carrier is **break-even at 24 and 32
points** (+1.5 to +3.4pp) and genuinely positive only at 64 (+11pp). It pays
for itself at fleet scale; it is not a bargain. Vraygon still beats it
(armour + all-round arcs weather strikes) — the matchup texture survived.

**KNOWN OPEN (documented in `strikeCraft._capCouplingNote`):** with the
missile screen nerfed, flying CAP is now a strictly dominated AI stance, and
the band depends on the AI continuing to fly it — tubeThreat 0 puts Krelath
at 62–67%. The next strike-system pass must make CAP earn its cost or re-tune
the stance weights. The verifier flagged this as the one finding that could
have changed the verdict.

Thinnest margins on record: ZAN 37.2% mean at 64 points; ZAN ~63% at 32
(pre-existing). Also open: Chris's pending ruling on dreadnought
charge-immobility (§22 follow-up); models for dreadnought and carrier.

---

## 24. Charge immobility, and the icon pivot (2026-09-01)

**Ruling: the dreadnought is immobile except for turning to aim.** Implemented
with the five defaults Chris accepted: planted while charging and while
holding a full bank; free to move while venting; turns at the normal rate;
and the bank is not lit until an enemy is within `chargeStartRangeHexes`
(20) — without that gate the ship would plant at its deployment hex on turn
one. Flags on `weapons.photonic-cannon`; guarded on `ship.spinal`; determinism
byte-identical. Measured but NOT tuned (content-first directive): Earth 44%
at 24 points and 38% at 32 — the rule costs roughly 5–11pp and stays in band.
Maiden battle under the rule: cold → four planted turns → a hit on the
Krelath battleship at 17 hexes → venting → reconnected.

**Process directive (Chris): content first, tune once.** No more rolling
balance passes; the consolidated tuning pass waits until the roster settles.

**Visual pivot (Chris): schematic icons in place of 3D assets until the core
game is complete.** `scripts/gen-icons.js` generates 44 SVGs to
`assets/icons/` (+ manifest + contact sheet): faction = colour + hull family
(Earth lozenge, Vraygon crystal, Zandrax arrowhead, Krelath carapace); class
= footprint + rank bars (FF 1 … BB 5) with glyphs for the specials (spinal
line, flight deck, fortress, missile, dot). Nose up; the viewer rotates by
facing. Icons are the arena's default; sprites remain as a toggle.

Also found and handed to Codex: the arena recorder carried a stale private
roster copy, so no replay yet contained a dreadnought or carrier; it now
imports `test/comp.js`.

### 24a. Rulings queued 2026-09-01 (Chris)

- **Landscape arena, FASA-paper-map style.** The battle map becomes a wide
  rectangle of hexes rather than a hexagon of radius 34, with fleets entering
  from the short ends — more room to manoeuvre along the long axis. Engine
  side: `battle.map {shape: "rect", widthHexes, heightHexes}` with in-bounds
  by hex-pixel extents; deployment on the long axis; start distance widened.
  Viewer side: draw the rectangle, fit to width. Applied after the current
  Codex arena task lands (it holds write access to the resolver).
- **Small craft as stacks, not individuals.** Confirmed as already built:
  each squadron is a stack with a `strength` (craft count) that depletes
  under point defence and enemy CAP, and its striking power scales with what
  is left — the wing thins as planes die. Squadrons carry no map position in
  v1 (they fly from the parent carrier within a radius); giving them map
  positions is the v2 step if the playfield needs it. Icons for both craft
  types (interceptor: slim dart; bomber: broad wedge with payload) are in the
  icon set for the viewer to place.

### 24b. Scale ruling: one ship, one hex, no collisions (Chris, 2026-09-01)

As in the FASA original, a ship occupies a single hex and is far smaller than
it; ships may share a hex and pass through one another without collision.
Only the largest objects (planets) will ever span more than one hex. This
fixes the game at fleet-battle scale. Engine audit: already true — there is
no occupancy or collision rule, and zero-range fire resolves (a co-located
attacker registers as bearing east; a harmless deterministic fallback).
Verified by stacking four ships in one hex and running a full battle. The
perceived deviation was visual only: sprites scaled past a hex. Viewer rule
from here: an icon's footprint fits inside one hex; co-located ships are
drawn offset within the hex so each remains visible. Deployment spacing and
formation stations are doctrine, not physics, and are unaffected.

### 24c. Landscape arena — built (2026-09-01)

`battle.map {shape: "rect", widthHexes: 72, heightHexes: 40}`; in-bounds is
`|q + r/2| ≤ W/2 and |r| ≤ H/2` in pointy-top axial. Deployment needed no
change — the fleets already stood west and east with the line of battle
north–south; only the edges were hexagonal. Verified: harness green, zero
draws in sixty 24-point battles, determinism byte-identical. Instructive
number: fleets used 15 of the 36 available columns and 6 of 20 rows — the
room exists; the helm AI does not yet seek it (see §24, maneuver incentive).
A maneuver index (share of hits landing on flank/rear faces) is being added
to the trial harness so the incentive is measured, not hoped.

### 24d. Maneuver index — baseline (2026-09-01)

Added to the trial harness (`stats.hitsForward/hitsRear`, counted in
`resolveHit`; printed after the size sweep and in `--scale` mode): the share
of a faction's landed hits that strike flank/rear faces (4/5/6). Baseline on
the landscape map, 60 battles/pairing:

    points   EAR   VRA   ZAN   KRE
    8        19%   19%   31%   41%
    24       24%   25%   32%   26%
    64       14%   16%   27%   35%

Reading: three hits in four land on the nose. Zandrax (fast, emergency
burst) and Krelath (warp behind targets) reach the rear most; Earth, the line
fighter, least — 14% at fleet scale. This is the number the maneuver
incentive work must move; the map now has the room, the helm AI does not yet
seek the flank. Strike-craft damage bypasses resolveHit and is not counted.

### 24e. Same-hex rule restored from the original (2026-09-01)

Research (Sonnet agent, from the rulebook's page images): FASA STTCS p.16,
"Additional Rules" — *"Two or more starships may occupy the same hex, but
they may not fire at one another while they are in that hex. Ships may
neither ram nor collide with one another."* No stacking limit, no ramming,
no point-blank fire. And p.7–8: the Starfield Mapsheet is 22×33 inches with
the fleets deployed *"at the center of opposite short sides"* — the landscape
ruling (§24c) is the original's own layout.

Chris's concern — nothing to stop ships parking in an enemy's hex and
slugging it out — is answered by the source: parking there **forfeits the
shot at that ship**, mutually, while both may still fire at others. Restored
as `battle.sameHexNoFire` (mayEngage() in the resolver, applied to beams,
missiles and the spinal gun; the helm stops one hex short when closing).
Verified: a frozen stacked pair exchanges zero shots; harness green;
determinism byte-identical. Not balance-tuned (content-first).

### 24f. Viewer caught up (2026-09-02, Opus agent after two Codex failures)

Recorder now imports the shared roster (`test/comp.js` — untracked; must be
committed with it) and echoes the map shape; replay meta v3; all four bundled
replays re-recorded and finally field the dreadnought and the carrier.
Viewer: landscape rectangle fitted to width (hexagon fallback kept), icons by
default with a sprites toggle, icon footprint capped inside one hex, stacked
ships ringed within the hex, and log-driven effects for the photonic cannon
(cold/charging/held/bolt/venting) and the air group (orbit, strike run,
attrition). Verified in a real browser, zero errors; engine hashes unchanged.
Consequence of the map ruling: ~6 px ships at full-map fit — pan/zoom with
auto-framing handed to Sol (first task on the repaired stdin invocation).

### 24g. Camera (2026-09-02, Sol — first task on the repaired invocation)

Cursor-centred wheel zoom (min whole map, max ~60 px hex), drag panning with
a click/drag threshold, transformed hit-testing, a smooth auto-frame on the
living fleets (default on; any manual zoom or drag disengages it; "Frame
fleets" re-engages; "Fit map" shows the whole rectangle), camera-aware grid
culling, one canvas transform for every element and effect. Verified in
headless Chromium on all four replays, no errors. Smoke test not extended
(test/ was declared read-only in the brief); camera assertions were run as
temporary checks — extending `test/arena-smoke.js` for the camera is a small
open item. The viewer is now complete for the playtest phase.

Camera fix (Sol, same day): zoom initialised on load and resize; auto-frame
engages immediately; playback hardened against NaN timestamps and a render
failure no longer stops the loop; round matching unified across shots,
effects and the log panel. Verified in headless Chrome on all four replays
(finite zooms ~2.0–2.4, playback to the end at 1× and 4×). Script at
`?v=camera2`.

---

## 25. Playtest ledger (observations for the consolidated tuning pass)

Per the content-first directive, observations are logged here and NOT acted
on until the roster settles. Each entry: what was seen, what the harness says.

- **2026-09-02, Chris — "the game seems too short; torpedoes seem awfully
  powerful"** (watching ear-kre-24, a commanding Earth victory). Harness,
  240 battles/size: average 10.2 turns at 24 pts and 11.0 at 32 (31–33 fire
  rounds); missiles land 35–37% of launches at ~10 damage each; beams hit
  46–47%. Lopsided wins (victor keeps 75%+ of fleet): 26% at 24, 5% at 32.
  The watched seed is a rout, and its cause is the next entry, not missiles.
  Missile weight vs beams is a legitimate feel question for the pass.
- **2026-09-02 — carrier fights in the battle line and dies on turn 3** with
  15 craft aboard (round log: `B-carrier-9 destroyed … goes down with 15
  craft`). Already measured by the carrier tuning pass: the deck trails its
  line by 0.2–1.4 hexes because `formation.cohesionRadius` leashes the whole
  fleet to its centre of mass, and the withdrawal exemption cannot act
  against the leash. This is a FORMATION-ROLE gap (content), not a number:
  a carrier needs a rear station behind the line, screened, with the line
  advancing without it. Candidate for the roster-settled pass or a small
  content change before it.
- **2026-09-02 — the Yamato held its charge all battle** ("holds the photonic
  charge - no capital in the arc") once Krelath's capitals were gone. Working
  as designed (holdForCapitalTurns 2 then it fires anyway) — but in a rout it
  looks idle; worth a glance at whether the hold should relax faster when
  the enemy has no capitals left at all.

---

## 26. Scenarios and terrain (ruling 2026-09-02, Chris): the game editor

Chris: a game editor to set up fleets and scenarios — composition and the
position of every element under the player's control, all four factions,
basic planets and moons, then run in a simulator (same product or separate).

Engine side, built: **moons** are one impassable hex; **planets** are a
seven-hex rosette (the footprint the old sprites spilled over). Both block
movement, warp landings and deployment, and both block **line of fire**
along the hex line (FASA: large bodies block fire) for beams, missile
launches and the spinal cannon. `buildScenario()` places every element
explicitly and falls back to the line deployment for unplaced ships;
`runBattle` takes terrain via `opts.terrain`. Contract in
`docs/scenario-format.md`. Verified: a planet between two frozen frigates
yields zero shots; the same geometry without it yields fire; a moon is never
entered; placement and facing honoured; terrain placement refused; a full
mixed scenario with terrain is deterministic. Client side (Sol): the editor
page, an in-browser runner (the engine is dependency-free ES modules), and
the hand-off to the viewer.
- **2026-09-02 — ships do not route around terrain.** In the moon test a
  frigate whose forward step was blocked sat in place for the turn rather
  than turning to go round. Flight rules plus the "close" step test explain
  it; a helm rule for obstacle avoidance (steer to the neighbouring bearing
  that still closes) is engine content for when scenarios with terrain are
  played in earnest.

### 26a. The editor delivered (Sol, 2026-09-02)

`arena/editor.html` (+ editor.js, editor-core.js, editor.css): two sides
with all four factions, roster with points and running totals, drag
placement with snapping and facing, moon/planet tools, map size, seed and
name, save/load of scenario JSON, validation, Random line deployment, and
**Run battle** — the engine runs in the browser (dependency-free ES modules)
and hands the replay to the viewer through sessionStorage
(`orion-wars:scenario-replay:v3`; `index.html?replay=session`; "Back to
editor" link). One shared recording module (`arena/record.js`) serves both
the browser runner and `test/record-battle.js --scenario`, byte-identical.
The viewer renders terrain from `meta.terrain` under ships and effects.
Sample: `arena/scenarios/twin-moons.json` (a planet, two moons, placed and
unplaced ships, EAR vs KRE). Seen in the pane: the planet as a large body,
a laser crossing past it, the carrier's wing orbiting the deck, wrecks,
zero console errors. Sonnet verification pending at time of writing.

Verification (Sonnet, same day): adopt-with-fixes. Byte-identity between the
browser runner and the CLI confirmed; protected hashes unchanged; three
defects: no facing check in validation, Save/Run usable before data loads,
and — the important one — the CONTRACT ITSELF was wrong: I had written that
a faction fields "the keys of its loadouts entry", but loadouts lists only
faction-specific fits, so the editor offered Earth no frigate or battleship
and still offered the retired command ship. Fixed at the source: a
`rosters` key in `data/tactical-tuning.json` is now the single source of
truth (five common hulls plus each power's uniques); the editor, docs and
smoke test follow it. A reminder that the contract is code too.

Cache lesson, again (2026-09-02): after the `rosters` key was added, the
editor still offered every hull to every faction — the browser served a
cached `tactical-tuning.json` without the key, so the roster fallback ran.
Data and manifest fetches in the arena now use `cache: "no-store"`, and the
script tags are re-versioned (`editor.js?v=editor3`, `arena.js?v=terrain4`).
Rule for the client: game data must never come from the browser cache — a
stale tuning silently changes rosters and battles.

Follow-up verification (Sonnet): **adopt.** Suites green and identical to
the pre-patch run (the 48-turn deterministic campaign reproduces to the
treasury); byte-identity holds with the new data; all six roster/facing
checks pass; resolver hash unchanged; tuning hash changed by design (the
`rosters` key). Practice adopted from the verifier: snapshot a protected
file before an expected change so the diff is exact, not inferential.
The editor is adopted.

### 26b. The editor must be served (2026-09-02)

Chris opened `arena/editor.html` from disk in two browsers: no map, dead
buttons, "Loading tactical data…" forever. Cause: browsers block data
fetches and ES-module imports on `file://` pages, and the editor runs the
engine in the browser, so it cannot work from disk (the viewer only seemed
to, thanks to its file-drop fallback). Fixes: `Start Orion Wars.cmd` at the
repo root (serves on 8642 and opens the editor), `npm run arena`, a plain
error message when the editor is opened from disk, README instructions
first, and a permanent "Scenario editor" link in the viewer header (the
back link had been conditional on a scenario replay). Lesson for briefs:
"no server required" applies to the viewer only; state it explicitly.
- **2026-09-02 — Chris's first authored scenario (`arena/scenarios/
  first-obstacles.json`): a planet flanked by two moons across Earth's line
  of advance, 30 vs 30.** Earth 18–12 on the 20-turn clock. The terrain
  exposed the routing gap completely: the Yamato never moved and never fired
  (57 rounds motionless), two Earth light cruisers and a destroyer sat 38–49
  rounds behind the gate, the Krelath carrier idled 26 rounds; only light
  hulls got through. **Obstacle avoidance is now the first engine content
  item for the next pass** (helm: when the forward step is blocked, steer to
  the neighbouring bearing that still closes; when the line of fire is
  blocked, reposition rather than wait). Also: the photonic cannon's hold
  logic meant a planted, blocked Yamato spent the whole battle charged and
  silent.
- **2026-09-02 — Chris's destroyer duel (`arena/scenarios/small-action.json`)
  found an engine bug: any lone ship never moved.** The cohesion leash
  compared the ship's range to `fleetGap - leash` with `fleetGap = Infinity`
  when a ship has no living mates, so a lone ship always read as "too far
  ahead of the fleet" and held. Consequences: one-ship scenarios were a
  20-turn stare-down, and the LAST SURVIVOR of any fleet stopped advancing
  the moment its last friend died — present in every trial, invisible to the
  sweep. Fixed (the leash binds only when mates exist). Balance effect: the
  endgame changes slightly; re-measured in the consolidated pass.

---

## 27. Re-priced point ladder and carrier doctrine (rulings 2026-09-02, Chris)

**Points now represent observed power:** corvette 1, frigate 2, destroyer 5
(it carries a torpedo now), strike cruiser 8, light cruiser 12, heavy
cruiser 20, battleship 28; the big specials — dreadnought, carrier, monitor
— at 32, **limit one per fleet**. Old ladder: 0.5 / 1 / 2 / 4 / 4 / 8 / 16 /
8 / 8 / 16. Stated aim: "more correctly represent the power of the ship
types relative to each other" and see what it does to fleet composition.
Applied in `hullClasses.<class>.points` (+ `limit`); the harness keeps the
same six hull lists (now costed 4 / 22 / 38 / 62 / 70 / 138) so faction
results stay comparable, with every unique-hull swap re-expressed as an
equal-points trade on the new ladder (a special = BB + 2 FF or CA + CL;
strike cruiser + 2 FF = CL; two corvettes = a frigate). The concentration
matrix is re-cut at 60 points a side: 2 BB + 2 FF / 3 CA / 5 CL / 12 DD /
30 FF.

**Carrier doctrine:** "carriers are standoff ships that use their strike
craft and their long-range weapons." Standoff 16 and launch 18 hexes set for
the doctrine, explicitly untuned (the earlier cut to 9 was tuning around
the in-line behaviour). The viewer stops drawing the wing orbiting the deck.

Measured, not tuned, per content-first — results in the ledger.
- **2026-09-02 — first measurement on the re-priced ladder (150 battles/
  pairing at 62 points; 50 per pairing per size).** Two changes landed
  together (prices → different swaps; carrier standoff doctrine), so an
  attribution run with the old doctrine follows. Headlines:
  *Faction sweep* — 4: 58/49/43/47 · 22: 31/34/45/**90** · 38: 64/37/52/45 ·
  62: 37/78/78/**0** · 70: 39/61/79/19 · 138: 37/59/71/33 (EAR/VRA/ZAN/KRE).
  Krelath collapse at 62+ (a 32-point standoff carrier bought out of CA+CL,
  untuned) and Krelath 90% at 22 (strike cruiser + 2 frigates for a light
  cruiser is a far better buy than the cruiser at these prices).
  *Concentration at 60 pts a side* — 2BB+2FF beats every shape (84–100%);
  3 CA beats 12 DD (100%) and 30 FF (94%) but loses to 5 CL (4%); 5 CL beats
  swarms; 30 FF and 12 DD lose almost everything. The matrix flipped from
  "light-cruiser packs win" to "capitals win, swarms dead": frigates at 2
  and destroyers at 5 now look OVER-priced against their power, light
  cruisers at 12 still beat heavy cruisers at 20 per point, and a
  battleship at 28 beats everything. Intransitive chain: BB > CL > CA > DD/FF.
  *Maneuver index* rose for Earth at 62–70 (44–46%) — the dreadnought's
  planted-and-flanked fights.
  *Attribution (same sweep, new prices, OLD carrier doctrine):* 62:
  27/73/75/17 · 70: 25/56/91/23 · 138: 29/45/72/53. So the standoff doctrine
  costs Krelath roughly 17pp at 62 and 20pp at 138 as set (untuned), but the
  larger effect is the PRICE itself: every 32-point special is bought out of
  a heavy cruiser plus a light cruiser, and on current tuning a dreadnought,
  monitor or carrier is worth far less than that line strength — measured at
  the old prices the dreadnought was −8.5pp and the carrier break-even *at 8
  points*; at 32 they are ruinous buys. Zandrax, which fields no special,
  keeps its whole line and soars to 72–91%. Reading for the consolidated
  pass: either the specials must be made worth 32 (stronger cannon, wing,
  monitor) or 32 is not their price; and light hulls are over-priced against
  their measured power.

---

## 28. Toward a refined ladder: pricing for freedom of choice (2026-09-02)

Chris: two price sets tried; now "run some numbers on the ships themselves,
the battle findings under both price regimes, and come to a refined set
that balances toward freedom of choice in fleet compositions, letting the
player choose as a skill rather than a stark min-max choice."

Definition of success used by the search (the **freedom index**): across
many equal-points fleet shapes — pure stacks and realistic mixes — every
shape lands between 35% and 65% against the field and no single pairing is
beyond 25/75; intransitive cycles are choice and are welcome, dominance is
not. Mean and max |win − 50| per budget are the reported numbers.

Method: a three-agent search (Opus). One analyst fits line-hull prices
iteratively against the shape matrix (raise what wins, lower what loses,
re-cut the shapes, repeat to convergence) and explains each price in prose;
one prices the specials and uniques by buy value (the price at which
fielding one is neutral to mildly positive); a referee reconciles one
ladder, applies it, and measures the shape matrix, the faction sweep and
every buy delta on its own seeds. Ship stats are frozen throughout — this
is pricing what exists, not tuning. Results below when the search lands.

---

## 29. Zandrax special: the Hypershield Wall (idea captured 2026-09-02, Chris)

**Ruling-in-waiting.** The Zandrax special ship is the **Hypershield Wall**.
When active, ships behind it are protected from all incoming damage the
wall blocks. It is overcome by **mass volley firepower** (saturation) or by
**going around** it to attack the flanks or rear. Reference: the Gamilas
shield wall of *Star Blazers 2202*, which stopped damage and also kept enemy
ships from warping past it.

Why it fits: it closes the roster gap the re-pricing measurement exposed —
Zandrax had no 32-point special to buy, so their line stayed whole while
every other power paid for one. And it is the first special whose whole
purpose is *maneuver incentive*: a wall makes flanking the only cheap answer.

**First mechanical sketch, using systems we already have** (to be built after
the ladder settles; nothing implemented yet):
- A special hull (limit one) with a `wall` system that projects a barrier
  segment ahead of it — a line of hexes perpendicular to its facing at short
  range (say 5–7 hexes wide, 2 hexes out), rotating with the ship's facing,
  so the wall's turn rate is the ship's turn rate.
- **Absorption pool, not invulnerability**: each turn the wall absorbs
  incoming damage whose line of fire crosses the segment, up to a pool bought
  from the ship's power — the same residual-power model as shields and the
  cloak (power into the wall is power not spent on guns). Once the turn's
  pool is spent, the rest passes through: that is "mass volley overcomes it".
  A line-of-fire test already exists for planets and moons; the wall reuses
  it with a per-turn budget instead of a hard block.
- **Flanks and rear**: any shot whose line of fire does not cross the
  segment is unaffected — the maneuver index becomes the counter-play.
- **Warp denial** (the Gamilas rule): a Krelath warp may not land on the far
  side of the segment; the jump is refused or stops short at the wall.
- **Movement**: enemy ships cannot pass through the segment while it is up
  (as terrain), friends can; the segment drops when the ship's power is gone
  or the ship dies.
- Viewer: a glowing arc in Zandrax red with a brightness that follows the
  remaining pool; a flare where a volley breaks through.

Open for Chris: price and fleet-floor (the price search now running does
not include it), whether the wall costs the corvette swap its place as the
Zandrax unique, and the wall's width and range. An icon glyph (an arc) is
needed in the icon set.

**Design intent, revised (Chris, same day):** "my first notion was that
specials should be expensive, but it seems that while they add flavor they
are not necessarily so decisive as to warrant the highest price." So the
specials are priced at their measured worth — a real option, neither trap
nor must-buy — and their flavor is the reason to take them. If a special
should later *become* decisive (a stronger cannon, a real wing), that is a
stats decision for the tuning pass, and its price follows the measurement.

### 26c. Asteroid fields and large asteroids (rulings 2026-09-02, Chris)

Two more tiles for scenarios. **Asteroid field** (`asteroids`): one hex,
passable but slow — entering costs twice the normal movement power — and it
**blocks fire in and out**: a ship inside can neither shoot nor be shot, and
no line of fire crosses a field (cover, at a price in tempo). **Large
asteroid** (`asteroid`): one impassable hex that blocks fire, a small moon
in the rules and a craggy rock in the picture. Engine: a second terrain set
for fields, a per-hex step cost in the helm (the movement budget now looks
at the cost of the hex ahead; the Zandrax burst refunds what the hex cost),
and the line-of-fire test extended to endpoints for fields. Contract in
`docs/scenario-format.md`; editor tools and rendering with the client agent.

### 26d. What FASA had for terrain (lookup 2026-09-02, from the rulebook)

Chris asked whether FASA had nebula rules. **It did not** — nothing on
nebulae, gas clouds, ion storms, dust or energy fields anywhere (table of
contents and every sensors/movement/fire/equipment section read directly).
What the book defines:
- **Obstacles — moons, planets, asteroid fields, "other large obstacles"**
  (Advanced Course pp. 26–27): ships may not fire through them, and they
  cast a **sensor shadow** — trace a line from sensor to target; if it
  crosses any part of the obstacle's hex the target "does not register on
  the sensors, and cannot be fired upon"; shadows are **mutual**, and a
  gamemaster may hide counters in a shadow entirely. No movement cost.
- **Mines** (p. 29): immobile photon torpedoes in a hex; detonation by die
  roll on entry or lingering; damage to the shield facing the direction of
  entry; one may be evaded per movement phase by an emergency turn.
- **Defense outposts / space stations** (Graduate Course p. 38): immobile,
  rotate in place, three firing arcs, their own damage table; optional
  orbital drift of one hex a turn.

Reading for us: our moons/planets/large asteroids are FASA's obstacles
exactly (blocked fire is the sensor shadow, and it was mutual there too);
our asteroid field's movement cost and its in-and-out blocking are our own
additions. **A nebula would be an Orion Wars invention** — a natural design
is a multi-hex region that casts a sensor shadow (mutual, no fire in or
out) and perhaps degrades shields or absorbs beam power, priced by playtest.
Mines and outposts are FASA content the editor could carry later.

**Nebula, Mutara pattern (Chris, same day):** rather than a sensor shadow
that blocks fire outright, a nebula *degrades* — reduced visibility and
reduced hit chance, as at the Battle of the Mutara Nebula. Sketch: a
multi-hex region; ships inside it (or firing into or through it) suffer a
to-hit penalty and can only be detected/targeted at short range; shields
are weakened or useless inside ("shields will be useless" — the film's
rule); missiles and strike craft may lose their locks. Fire is not blocked,
so the fog is a place to take a fight where gunnery counts for less and
nerve for more. Distinct from the obstacle rule; both can coexist as tiles.

### 26e. Nebula — the Mutara rules (ruling 2026-09-02, Chris: "let's follow the example")

"We can't follow them into the nebula, Sir. Our shields would be useless."
(Joachim, to Khan.) A nebula hex is passable and does **not** block fire; it
degrades. Inside one, a ship can engage and be engaged only within
`visibilityHexes` (3); any shot with a ship in the fog at either end takes a
`toHitPenalty` (2 pips, applied to beams and the spinal gun alike); and
**shields are useless inside** — every hit on a ship in a nebula bypasses
its shields (the photonic cannon's bypass path, reused). Paint several tiles
for a cloud. Untuned; the numbers are dials. Verified by the terrain check:
unengageable at 6 hexes, engageable at 2, fire across a nebula between two
ships outside it unaffected, more internal damage in the fog than in clear
space for the same exchange, deterministic. Missiles and strike craft do
not yet lose their locks in the fog — a later dial.

### Viewer observations (Chris, 2026-09-02) → queued client work

- Beam weapons do not visibly connect with their targets (effects drawn
  against one round's positions while ships interpolate toward the next —
  to be fixed by drawing each shot between the shooter's and target's
  positions in the round the shot occurred, shown while that round plays).
- Missile targets are unclear (to be fixed with a target marker and a
  flight line from shooter to target at launch; the shooter is now on the
  event).
- The battle log should narrate: who fires what at whom, with range and
  damage; where each ship moves from and to; and other diagnostics. Engine
  side done: every shot event now carries `range` and `damage` (0 on a
  miss), launches carry the warhead, and missile arrivals carry the shooter.
  Movement narration comes from the recorder's per-round positions. The
  viewer's round log will be built from these events plus the engine's own
  lines, with filters (movement / fire / damage / special).

**Refinement (Chris, same day):** weapons fired from *outside* a nebula
penetrate no further than its first hex — absorption decoheres beams and
missiles lose their sensor locks. So nothing crosses a nebula and nothing
reaches its interior from outside; a ship in the first fog hex can still be
hit from outside, one deeper cannot. From inside, the visibility rule
governs. Verified: through-fire blocked; first hex reachable; second not.

### 26f. Editor and viewer caught up with the tiles (2026-09-02, Sonnet agent)

Five terrain brushes in the editor (moon, planet, large asteroid, asteroid
field, nebula — the nebula brush stays active so a cloud is painted a hex
per click), the same deterministic per-hex art in editor and viewer, ships
drawn with the icon set on the map, the fleet-builder buttons and the tray
cards, and the chevron fallback removed everywhere ("no need for little
triangles") — a coverage assertion proves every roster class has an icon.
Verified in the pane with Chris's first scenario plus every tile type; no
console errors. Committed. Sol now has the beam-connect, missile-target and
narrative-log brief.

### 26g. Viewer: connected beams, missile targets, narrative log (Sol, 2026-09-02)

Shot effects are now drawn between the shooter's and target's recorded
positions for the round the shot occurred, shown while that round plays
(movement and firing phases separated), so beams connect; missiles fly a
dashed line from shooter to target with a persistent reticle and an arrival
label; the round log is a narrative built from the shot events (range,
damage, shooter) and the per-round positions — moves with from/to and
compass facing, holds, warps, fire with hit/miss and damage, launches with
warhead, arrivals with outcome, strikes, cannon phases, detonations and
deaths — with Movement / Fire / Damage / Specials filters and a raw-lines
toggle. Verified in the pane with the 62-point Earth–Krelath replay; no
console errors. Follow-up: effect widths and labels scaled with the camera.


### 28a. The refined ladder — results (search landed 2026-09-03; applied)

**Ladder (frigate = 2 is the unit of account):** corvette 1 · frigate 2 ·
destroyer 4 · strike cruiser 8 · light cruiser 10 · heavy cruiser 16 ·
dreadnought 16 · carrier 16 · monitor 20 · battleship 32; the three big
specials limit one, fielded from a 52-point fleet (the reference line's
cost). Every harness swap is equal-points.

**Freedom index** (mean / max |field − 50| over 13 shapes, Earth mirror,
160 battles a pairing): 15.5 / 48 at 52 points as shipped, 13.6 / 20.7 once
oversized fleets deploy in ranks; the 32-point ladder measured 20.3 / 39.
Specials at their prices are neutral to mildly positive buys (mirror
50–53% at fleet sizes; the monitor a little rich at +9 at 52).

**Two bugs the search found — both fixed with the ladder:**
1. *Points were also rules.* Six dials read `hull.points` (the class-
   interaction "heavy" thresholds, the cannon's capital and battle-line
   thresholds, interceptor and bomber target points, plus timeout scoring
   and deployment order). Chris's 32-point ladder had silently promoted
   light and strike cruisers to "heavy" and let bombers hunt destroyers —
   part of §27's measurement was a rules change in disguise. The dials are
   now pinned to hull classes (heavy = CA 16; capital 16; battle line 32;
   interceptors ≤ 4; bombers ≥ 8) and must be re-pinned on any re-pricing.
2. *Fleets over ~21 hulls did not fit the map.* One deployment rank at
   2-hex spacing put 30 frigates at rows ±30 on a ±20 map, some behind the
   enemy start line — most of "swarms lose everything" was that. Deployment
   now wraps into ranks of 20 (bit-identical for smaller fleets; the
   52-point matrix reproduced exactly).
Also corrected: the carrier's standoff (16) exceeded its own strike radius
(12), so the wing could not reach from the deck's chosen range; standoff is
now 11. Untuned.

**What the ladder does not fix (the referee, plainly):** no ladder gets the
worst pairing under 90/10 — at exactly equal points **combined arms beats
monocultures structurally**, because capitals carry no screen or point
defence and light hulls do (3 CA + 2 FF lose 9/91 to the reference line).
Raising a capital's price only makes the mixed list buy fewer capitals and
keep its escort. If a capital line is to be a viable shape, the lever is a
rule — intrinsic screening or point defence on capitals, or a cap on how
much screening a fleet may stack — not a price. Faction sweep under the
ladder is out of band at fleet sizes (stats frozen): that is the tuning
pass's job.

**Per-hull rationale (the referee's prose, for Chris to read as design):**

THE LADDER IN ONE LINE, on the frigate: corvette ½, frigate 1, destroyer 2, strike cruiser 4, light cruiser 5, heavy cruiser 8, dreadnought 8, carrier 8, monitor 10, battleship 16. Every rung is a doubling or a simple sum, and every price except the Zandrax corvette is EVEN — which is not decoration. The frigate at 2 is the smallest hull three of the four powers own, so an odd price anywhere makes some equal-points trade impossible. That single constraint decided three of the arguments below.

  2 corvettes = a frigate.  2 frigates = a destroyer.  2 destroyers = a strike cruiser.
  A strike cruiser and a frigate = a light cruiser.  8 frigates = a heavy cruiser.
  2 light cruisers = a monitor.  A dreadnought = a carrier = a heavy cruiser.  2 heavy cruisers = a battleship.

WHY THE LADDER IS SHAPED LIKE THIS, and it is not what the paper stats suggest. Per point, a frigate buys twice the guns and twice the hull of a battleship. The price ladder is close to the inverse of that, and the reason is the SHIELD THRESHOLD. Absorption is capped per facing per round, and a beam lands 7 damage (Earth's laser at max power inside 6 hexes) to 9 (Vraygon's heavy blaster inside 5). Against a corvette, frigate or destroyer — caps 3, 4, 4 — every single shot in the game puts 3 to 5 through. Against a light cruiser at cap 9, one shot puts through nothing; it takes two hits on the same facing in the same round. Against a heavy cruiser at 13 and a battleship at 18 it takes two heavy hits or three light ones. You are not buying guns or hull. You are buying the number of enemy ships that must bear on one facing at once before anything happens at all.

CORVETTE 1 — two to a frigate. Not half a frigate: it is a frigate's worth of gun in two bodies you will lose, on 6 superstructure and cap 3, and its weaponReach of 0.70 drags the whole fleet's standoff down because the corvette is nearly always the nearest enemy. Measured at ½ point the Zandrax screen re-bought as corvettes wins its own mirror 61-73% and is a +6 to +28pp buy; at 1 point, 36-53% and −13 to +1pp; at 1½, 11-46% and −8 to −32pp. One point, and Chris's shipped price stands.

FRIGATE 2 — the unit of account. One all-round beam, 8 superstructure, cap 4. Everything else is priced against it and it does not move.

DESTROYER 4 — two frigates, and knowingly the one dear hull on the ladder. Its measured value is about 3½ and I can bracket it very sharply: at 3 points a pure destroyer flotilla wins 86% of the field at 52 points, 97% at 80 and 99% at 104; at 4 it wins 21-32%. The reason it is worth so little more than a frigate is that it does NOT buy the shield threshold — cap 4, the same as the frigate — and it trades the frigate's all-round beams for forward and starboard-aft. What it buys is a torpedo tube, six superstructure and a point of screen. A price of 3½ is unpayable on a ladder whose smallest common hull is 2, so 4 is delivered as the lesser of two errors and the destroyer stack is the shape most out of band (20-32%). If Chris will accept a doubled scale, corvette 2 / frigate 4 / destroyer 7 / strike cruiser 16 / light cruiser 20 / heavy cruiser 32 / dreadnought 32 / carrier 32 / monitor 40 / battleship 64 prices the destroyer at its measured value with every trade still exact — at the cost of doubling every point value in the game.

STRIKE CRUISER 8 — four frigates, two destroyers, or a light cruiser less a frigate. Three tubes and two beams on a 22-point hull with screen 0: a light capital the fleet screens, not a picket. Unchanged from the shipped price, and see the buy-delta note for the one place my two instruments disagree.

LIGHT CRUISER 10 — five frigates. This is the hull the whole ladder turns on: cap 9 is the cheapest place in the game where a single shot from any gun bounces. That threshold, not the third beam, is what the fifth frigate buys. Priced at 12 it was over; at 9 the cruiser pack runs away with the small budgets; 10 is where both ends sit.

HEAVY CRUISER 16 — eight frigates, two strike cruisers, four destroyers. Cap 13, five beams, three tubes — and screen 0 and point defence 0, which is the whole story of the top of the ladder. It needs a fleet around it. Escorted it is worth 16; massed it is worth about 10, and at exactly equal points three heavy cruisers lose to two heavy cruisers with a screen 14/86.

BATTLESHIP 32 — two heavy cruisers. Cap 18, eight beams, five tubes, the same screen 0 and PD 0. The same story, doubled. Raised from 28 rather than lowered, because at the reference size a battleship with a screen around it is the strongest thing on the board (1BB+2DD+6FF reads 68.6% against seven other 52-point shapes).

DREADNOUGHT 16, limit 1 — exactly a heavy cruiser, and that identity is the design. The Yamato is not a bigger battleship: it is a heavy cruiser that gives up two lasers and two tubes and buys the photonic cannon, eleven superstructure, two points of shield cap and four points of screen. At 32 it was a −30 to −56pp purchase and the power that fielded one collapsed; at 16 its owner's mirror reads 53/50/45 across the three fleet-action sizes.

CARRIER 16, limit 1 — the same rung. A heavy cruiser's worth of flight deck, and the price is stable across five different standoff settings. It is the strongest matchup piece in the game and the one hull whose price is conditional on a doctrine ruling.

MONITOR 20, limit 1 — two light cruisers, or a heavy cruiser and two frigates. 110 superstructure, guns on every bearing, and by a wide margin the slowest hull in the game. It is the anti-swarm piece and it is what makes Vraygon competitive at 68 points at all.

COMMAND SHIP 16 — retired, parked on the dreadnought's rung purely so an old replay does not load a hull whose class weight is an outlier.

**Independent measurement after applying (150 battles/pairing at 52; 50 per
pairing per size).** Shape matrix at 52 a side, row beats column: the
monocultures are the weak shapes (3 CA + 2 FF beat by the reference line
92/8 and by 1 BB + 2 DD + 6 FF 98/2; 13 DD lose to 3 CA 92/8) while the
combined-arms lists sit near the top, and there are real cycles — 5 CL + 1 FF
beat 1 BB + 2 CL 84/16 and lose to 16 FF + 5 DD 22/78; 13 DD lose to the
light mix 20/80 and beat it 40/60 against the battleship line. Choice, with
combined arms as the skill. Faction sweep (stats frozen): 4: 58/49/43/47 ·
18: 53/51/59/37 · 32: 45/43/44/67 · 52: 47/68/57/27 · 68: 45/45/52/58 ·
132: 74/37/32/57 — out of band at 52 and 132; that is the consolidated
tuning pass's brief, now on an honest ladder and a map that holds a swarm.
