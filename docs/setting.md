# The Achernar Sector

The setting document for **Distant Sectors: the Achernar Campaign**. Authored by Chris, 8 September 2026. Living: the fiction is his, dates are provisional, and the open sections fill in as he supplies them.

Everything here except the campaign present is **backstory**. The game opens in 2201 CE.

---

## The situation

> It is the 23rd Century...
>
> Humanity has journeyed into the stars and established the EARTH FEDERATION. The Federation is an alliance of Earth and its colony and Dominion planets, dedicated to the ideals of peace and prosperity.
>
> Unfortunately, the galaxy is not an idyllic place. Humanity is not alone in the universe, and while Man has made friends he has also found enemies amongst the stars. The Federation fought two wars valiantly against invaders. Its ships, while equipped with laboratories and powerful scientific instruments, are also heavily armed.
>
> A hushed but turbulent peace fell the defeat of the Krelath Empire in the Second Orion Arm War and the defeat of its leader, Archon Vezder. Empire now seeks out new resources in its quest to avenge itself on the Federation for its defeat.
>
> Those resources are needed more than ever. The Vraygon, a species of silicoid lifeforms from a Venus-like hellworld, have recently been pressing claims to areas of the Achernar Sector that the Krelath hope to take for themselves.
>
> Even as Earth, Krelath, and Vraygon shoulder each other for control of the Achernar Sector's worlds, a new force has emerged to stake a claim on territory there. The Zandrax Horde, an insectoid lifeform with a hive-like social organization with radically morphologically different Zandrax assuming roles they were born for, desire all of the Achernar Sector for themselves.
>
> And each of the four powers must also win over, buy up, or conquer the many inhabited planets that dot Achernar. Settlers, refugees, traders, rogues, and pirates call the Achernar Sector their home. They won't surrender it to any of the four powers easily.

## The register

The Earth Federation stands at roughly **1926**. It is both Britain and America at once, so unlike Britain it did not have to break up under overextension after its second global conflict. In Chris's words: *the future is open but the future could be dark.*

1926 carries three things with it. It is eight years past the war. It is the middle of the good years — the peace holding, and everyone aware it is holding rather than settled. And it is the year the Dominions were declared equal in status and in no way subordinate, which is exactly the standing the Federation's Dominion worlds hold.

## The Federation is not monolithic

The lineage is the Earth Empire of *Doctor Who*, itself modelled on the rise, decline and fall of the British Empire. Dominion planets — Sirius III among them — carry near-equal political and diplomatic weight to Earth. A Federation fleet in Achernar is therefore a coalition, and its officers do not all answer to the same capital.

It also gives the Federation something none of the other three powers can offer an independent world: not merely protection or purchase, but **status**.

## The Krelath, and the man who is coming

Defeated in the Second Orion Arm War, the Krelath Empire was not dismembered. Democracy was imposed on it by the peace terms. It is revanchist, and its restorationists want their Archon back.

They will not get him. The Krelath are preparing for their final thrust-upon-them democratic election, which will place their fate in the hands of **Supreme Leader Stratan Valdar**. Valdar then has the former Archon Vezder assassinated, so that he cannot come back. The restoration is the ladder he climbs and the first thing he kicks away.

Valdar is one of the few characters Chris is consciously importing: modelled on Leader Desslar, but grimmer and more relentlessly competent — an antagonist who is prepared for what you are about to do.

### The Valdar Cannon

At some point the Krelath surprise everyone with a flagship carrying the **Valdar Cannon**. It cannot bear his name before he holds power, so it belongs after 2202.

Mechanically this is the second spinal hull in the game: the Earth gunstar is currently the only one of twenty-nine. It makes the charge-and-plant weapon a two-sided affair rather than a Federation quirk, and it hands the player the counter-play they have been on the wrong end of — a planted capital ship is a target for strike craft.

**There is only ever one.** Not for technical reasons: who could be trusted with a second, other than the Supreme Leader? The scarcity is his paranoia, and it means the ship is a named vessel rather than a class, and that losing it ends it. Chris conceives it as the campaign's boss.

**Parked — not to be designed yet.** One practical note for whenever it is: a unique boss hull must stay out of `rosters` in `data/tactical-tuning.json`, which is the single source of truth for what each power may field. If it lands there it appears in quick build and in the balance sweep, and it will wreck both.

## The Vraygon

Silicoid lifeforms from a Venus-like hellworld, pressing claims on areas of Achernar the Krelath want for themselves.

## The Zandrax Horde

Insectoid, hive-organised, with radically morphologically different individuals assuming the roles they were born for. They want the whole sector.

## The worlds of Achernar

Settlers, refugees, traders, rogues and pirates. They will not surrender to any of the four powers easily, and each power must win them over, buy them up, or conquer them. The Federation alone can also grant them standing.

---

## Provisional timeline

Dates are drafted to the register and are expected to change. 2201 is the 1926 beat.

| Year | Event |
|---|---|
| c. 2090s | Humanity reaches the stars. The Earth Federation is founded from Earth, its colonies and its Dominion worlds. |
| 2161–2164 | **First Orion Arm War.** The invader is not yet named. |
| 2189–2193 | **Second Orion Arm War.** The Krelath Empire is defeated; Archon Vezder is deposed. |
| 2194 | Peace terms. Democracy is imposed on the Krelath. |
| 2197 | Armaments agreement limiting fleet tonnage between the powers. *(Proposed — see design notes.)* |
| 2198 | The Vraygon begin pressing claims in the Achernar Sector. |
| 2200 | The accord confirming the peace. The Zandrax Horde appears in Achernar. |
| **2201** | **The campaign opens.** Dominion equality is formally declared. Four powers contest the sector. |
| 2202 | The Krelath hold their final election. Stratan Valdar becomes Supreme Leader. Archon Vezder is assassinated. |
| 2202+ | The Krelath reveal a flagship carrying the **Valdar Cannon**. |

The last entries sit inside playable time rather than behind it. Chris wants a Krelath-versus-Krelath battle or mini-campaign built around Valdar's rise.

---

## Where the rules already say this

None of this was planned into the tuning. It was produced by measurement, and it agrees anyway.

- **Federation ships are science ships that fight.** Sensor ratings and the Scan action (rating 2+, one action, no extra power) sit on hulls that also carry the cheapest shield absorption in the game, bought by handing a third of the power pool to the capacitor every turn.
- **They stand.** The Gunstar has nothing astern, so the engine refuses it a fighting withdrawal. The tuning note says it "does what a Federation line ship is for: it stands."
- **The Vraygon have no blind side.** Measured, they keep about ninety per cent of their battery astern and are the only power that can genuinely fight a withdrawal — which is a creature of rock, armoured in every direction.
- **The Krelath stood where others ran.** In the same measurement a Krelath battleship of identical arcs fired 48% of its battery, against 27–30% for hulls that turned away.
- **The Zandrax swarm wins by numbers and specialisation**, and beats the Federation's heaviest hull outright at 32 points. The design note on that reads: "the swarm beating this hull is the game working."

## Names and titles

The convention is **title plus name**. The title comes from rank or caste; the name morphology belongs to the species.

| Power | Worked examples | Register |
|---|---|---|
| Krelath | Archon Vezder · Supreme Leader Stratan Valdar | Hard consonants, two-part names, imperial and then revolutionary titles |
| Zandrax | Hivelord Kzzx'xt | Caste titles; clicking consonants, apostrophes |
| Federation | *open* | Earth surnames **and** Dominion registers side by side in one navy |
| Vraygon | *open* | *open* |

Ranks below Hivelord, the Krelath naval ladder and the Federation title ladder are all still to be written.

---

## Design notes — Fable, not setting

Kept separate so the fiction above stays Chris's.

**Points are tonnage.** 1926 means a treaty-era fleet. The game already has a points system, hulls bought "out of two light cruisers", strict fleet floors and warnings when an authored fleet breaks them. If the powers fight Achernar under an armaments agreement nobody entirely trusts, an abstract balance mechanic becomes a piece of the setting and the campaign gains something to violate.

**The assassination as a campaign event.** If the campaign straddles the election, Krelath behaviour changes mid-campaign rather than being fixed at the start, and the player feels the politics turn without being told.

**Krelath politics belong in posture, not in treachery.** A divided service is superb material for the ship-captain layer — restorationist, republican and Valdar's people in the same uniform. But under the ruling in `docs/consultations/fable-ship-captains-2026-09-07/recommendation.md`, deviation stays a closed list of declared conditions visible before commitment. Politics may decide which posture a captain is given. It must not introduce hidden disobedience, or the console stops being trustworthy.

**Same-faction battles should already work.** Sides are A and B, not factions, and under the restricted view the player sees own ships and reported contacts rather than two coloured fleets, so a civil war needs no art change. Worth one check before it is promised.

**Valdar suggests a tier above ship captains.** Named admirals with their own doctrine, of which he would be the first, and the natural home for a hypercompetent opponent that sets traps rather than simply fielding more points.

## Open questions

1. **Where exactly does the campaign sit relative to the election and the assassination?** It changes whether the Krelath fleet is divided or unified.
2. **Whose voice is the opening text?** It reads from the Federation's side. If all four powers are playable, either each needs its own version or the document should say plainly that this is Earth's account.
3. **Who invaded in the First Orion Arm War?** A power on the far side of Earth's bubble-shaped sphere of influence, and perhaps the subject of a future Distant Sector. Name pending.

   One consequence is worth keeping whatever the name turns out to be: the two wars came from **opposite sides of the bubble**. The Federation can therefore never commit its full weight to Achernar, because the other side is unwatched. That is the reason the player commands what Earth can spare rather than what Earth has.
