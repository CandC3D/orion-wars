# Notes on the FASA starship combat system

Read from the rules document Chris supplied (132pp; text layer only — the
charts and figures are images and were not extracted). Mechanics summarised in
my own words for design reference. Nothing here is copied text or reproduced
tables, and none of it should be transcribed into our data files: game systems
are fair to learn from, their expression is not ours to take.

## The one that matters: shields are the residual, not an allocation

This is the deep structural difference from what we built, and it is the
mechanic our design is missing.

In FASA, a ship's power pool resets at the start of each turn to the sum of its
functioning engines. Every action spends from that pool — moving, firing,
running the cloak. **Shields then absorb damage out of whatever is left.** When
a shot lands, the defender *elects* how much of it the shield soaks, and each
absorbed point costs power at the ship's Shield Point Ratio. When the pool hits
zero the ship can neither act nor absorb until the next turn.

So defence is not budgeted in advance. It is the residue of restraint.

The consequences are large:

- **Firing is defensively expensive.** A ship that empties its guns has nothing
  left to soak the reply. Alpha-striking is a genuine gamble rather than a
  free action.
- **Movement is defensively expensive.** Closing the range costs power that
  would otherwise have stopped the fire you take while closing.
- **This is the natural counterweight between long and short range that our
  model lacks entirely.** In our sim shields are pre-allocated in a separate
  slot, so Earth fires every turn at no defensive cost. Under FASA's model
  Earth's five lasers cost it the power that would have absorbed Vraygon's
  reply. Our long-range dominance is at least partly an artefact of our
  allocation design, not of the weapon ranges.

There is a second, tighter limit layered on top: each shield also has a
per-round Maximum Shield Power that resets every round, and a turn is three
rounds. So a shield can be saturated in one round even when the ship still has
plenty of power.

## Turn and action structure

- A turn is **three rounds**. Ships act individually in action order.
- **Action order is rolled per ship: D100 plus the Captain's tactics skill.**
  Crew quality decides who shoots first, which is a far more elegant use of the
  captain stat than a flat to-hit bonus.
- **Each weapon fires at most once per turn** — it needs a turn to repower.
- Power is restored in full at the start of each turn, less engine damage.

## Cloak

- Costs a fixed number of power points, removed from the pool while running, so
  the ship's whole budget is smaller the entire time it is hidden.
- **Decloaking returns the power immediately** — which is exactly the rule
  Chris specified independently.
- **If engine damage drops available power below the device's cost, the ship
  decloaks automatically.** Excellent failure mode: hurt a cloaked ship's
  engines and you force it into the open.
- The cloaked ship is removed from the map and its movement recorded secretly.

## Cloak detection — differs from our ruling in two ways

1. **The die is in the other hand.** FASA has the *hunter* re-roll each turn to
   maintain a lock on a cloaked ship, failing which the lock breaks. We ruled
   that the *hider* rolls to evade. Functionally similar, opposite agency.
2. **A cloaked ship can be fired on** if the attacker holds a sensor lock, at a
   stiff penalty — worse against a stationary target than a moving one. Our
   rule makes cloaked ships untargetable outright. FASA's version makes the
   sensor lock the prize rather than the cloak an absolute shield.

Both systems scan **one arc at a time** and the detection roll is indexed by
range and by whether the target is moving. The detail worth stealing: the
scanning player is **not told whether the target was in the arc** — only that
the scan found nothing. Failure and absence look identical.

Also: a hit on a ship negates any sensor lock *that ship* was holding.

## Weapons

- Beams take **variable power; more power does more damage.** We have this.
- **Laser cannons may be overcharged to twice maximum, yielding two shots at
  half power each.** We do not have this, and it is a good decision-point.
- Missiles cost a fixed allocation. Plasma is special-cased with its own
  variable damage table and may be fired at half strength.
- Plasma that penetrates rolls damage location **separately per five points**,
  spreading across the hull rather than concentrating. That is a real
  mechanical identity for plasma beyond "big number".
- To-hit is **roll-under on D10** against a per-weapon chart indexed by range,
  rather than our roll-over with band modifiers. Equivalent in spirit.

## Damage, and several ideas worth taking

- **Engine damage immediately reduces the current turn's power budget**, not
  just future turns. Getting hit makes you weaker *this* turn.
- **Emergency heading change** costs no movement points but inflicts stress
  damage on your own engines, and imposes a to-hit penalty if you fire after
  it. Manoeuvre that hurts you is a lovely tension.
- **Grazing hits**: the target captain may roll to halve incoming missile or
  plasma damage.
- **Sensor damage prevents firing altogether.** Sensors become a critical
  system rather than an information convenience.
- **Ships explode**, damaging nearby vessels in proportion to their remaining
  engine power over distance. A healthy ship dying is a bomb; a crippled one
  fizzles.
- **Casualties impose a to-hit penalty** scaled to the percentage lost.
- Damage is located on a table, with a skill roll allowing a called shot at a
  penalty.
- Repairs may be attempted once per turn per system, taking effect the
  following turn.

## Recommendation

Adopt the residual-shield power model. It is a single structural change that
plausibly addresses our central balance failure — long-range powers dominating
because shooting costs them nothing defensively — and it makes every turn a
real decision instead of a budget split entered in advance.

Doing so would supersede the pre-allocated four-way split in
`data/tactical-tuning.json` and the `allocate()` function in the resolver.

---

## Ship data, read from a canonical Gorn battleship

Source: the fasaststcs.com entry for the Gorn BH-2 battleship, which prints
full FASA construction data. Figures below are cited only as evidence of how
the *system* works.

### Two mechanics we are missing entirely

**1. Firing arcs limit which weapons can bear.** The BH-2 mounts eight beams,
but their arcs are spread two to each of forward-port, forward-starboard,
port-aft and starboard-aft. It has all-round coverage and can bring only
**two** beams onto any one target. Its eight torpedoes are forward-weighted —
four dead ahead, one to each forward flank, two astern.

Our resolver lets every mount fire at any target regardless of facing. That is
the single largest thing wrong with it. Arcs are what make the six faces
matter, what makes manoeuvre a real decision, and what stops a big ship simply
out-mounting a small one. Adding arcs probably matters more than any number we
could tune.

**2. The "ratios" are power costs, and I had one inverted.** Movement Point
Ratio is *power spent per movement point* — the Gorn battleship's is 6/1, so
six power buys one hex. With 62 total power it can barely move, which is
exactly the "ponderous" character the prose describes. Shield Point Ratio is
*power spent per damage point absorbed* — 1/2 means soaking 13 damage costs
six and a half power, drawn from the same pool as everything else.

Our `moveRatio` is hexes-per-power, the inverse. Flipping it makes slow ships
genuinely slow *and* makes their slowness cost them defensively.

### Other calibration notes

- Beams reach much further than I assumed, with graduated bonuses rather than
  penalties: the BH-2's are +3 out to 10 hexes, +2 to 15, +1 to 20. Our bands
  top out at 15 for lasers and 6-8 for blasters.
- Torpedoes are cheap to arm and hit hard — 2 power each for 10 damage on the
  B model, against beams needing up to 6 power for comparable output.
- FASA rates ships for balance with a **Combat Efficiency (D)** figure and a
  **Weapon Damage Factor (WDF)** rather than a points ladder. Those numbers
  climb steeply across models of the same hull, so FASA was explicitly
  comparing ships of different eras rather than pricing them for fair fights.

### What the Gorn actually are — and the honest verdict on Vraygon

The Gorn are **slow, tough, heavily armed gun platforms with good sensors.**
Their prose stresses heavy hull reinforcement, efficient shields, accurate
targeting, and poor manoeuvrability — one account has a BH-2 out-manoeuvred by
Romulan scouts, absorbing point-blank plasma hits, and destroying both anyway.
They also have a distinctive weakness: little internal shielding, which makes
them **easy to find on long-range sensors**. And their fleet is deliberately
heterogeneous, built by different clans with different design philosophies, so
no two Gorn ships are alike.

So the honest finding: **the Gorn are not close-quarters bruisers.** They do
not close, because they cannot. They out-shoot you from wherever they happen to
be, with long-reaching beams and heavy forward torpedoes, and they survive the
reply. The "comes in close to use its short-range guns" half of our Vraygon
styling is not a Gorn trait — that is closer to the Klingon or Romulan role.

What *does* transfer, and transfers well: sturdiest hulls, efficient shields,
heavy armament, ponderous movement, strong targeting, easy to detect, and a
mixed fleet where individual ships break the pattern. The trade wealth in the
Gorn blurb also matches Vraygon's treasury.
