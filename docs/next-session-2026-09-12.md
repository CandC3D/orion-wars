# Gameplay: what to pick up on 12 September

Written 11 September, end of usage. Everything below is doable from this machine with no
dependency on the work workstation. Live master when this was written: `b594281`.

## Where things stand

- Live and verified: straight warp (8 hexes, forecast, effect), magazines x1.5, torpedo
  retargeting (radius 4), point-defence saturation (1 kill per point a turn), Krelath/Zandrax
  hull rebalance, the 10 September console playtest list.
- Corpus at 52 points: Zandrax 57.0, Earth 54.9, Krelath 44.1, Vraygon 43.7.
- Docs from this week: `docs/balance-2026-09-1{0,1}-*.md`.
- Harnesses to reuse: `node test/fleet-trial.js --battles 300 [--tune path=value] [--scale N]
  [--magazine-scale X [--magazine-faction F]]` and
  `node scripts/scenario-balance.mjs <scenario.json> --battles N [--tune path=value]`.

## A. Zandrax models (they arrive tomorrow) — half a day

The intake path is the one in `docs/art-pipeline-handbook.md`; the Vraygon rework and Zandrax
set were the two things the intake was parked on (memory: vraygon-zandrax-intake).

1. Inspect the GLBs against the colour key before anything else; flag re-exports early.
2. Map icons and console schematics per class, into `assets/icons/` with `manifest.json`
   entries (`framed`, `size`) — the console's symbol ladder reads those directly.
3. Check each new icon at zoom 1 and zoom 12 in the console (symbols now track the hex).
4. Only then the 3D prototype's fleet sheets, if there is time.

## B. Balance, in the order that matters

1. **Zandrax v Krelath is still 80/21.** Everything tried is in
   `docs/balance-2026-09-11-krelath-zandrax.md`; the untried levers are Zandrax weapon side
   (beam damage/bands) and the Krelath AI's warp policy per-opponent. Half a day with the
   corpus harness.
2. **Earth v Vraygon 58/42** and **Earth 65% at 32 points** — the two remaining lopsided cells.
3. **The Asterion Line gives Earth 50.3%**, below its 55% target, because the Krelath
   battleship is tougher. A lighter Krelath escort overshot to 62%; the scenario is otherwise
   untouched. Decide: accept 50%, or sweep deployment rather than composition.
4. **Zandrax lead everywhere above 4 points** is older than this week and still open.

## C. Console and rules work already scoped

1. **Weapon shadows are still hard to read** (Chris, 10 September playtest). Open.
2. **A retargeted torpedo says nothing in the tape.** The map shows the new target; a line
   ("Torpedo retargets onto IKS Honor") would close the loop. Small.
3. **Point-defence saturation is invisible during playback.** The key states capacity
   ("STOPS <=2/TURN"); showing kills spent this turn would make saturation legible. Small.
4. **Fleet commissioning and captain controls are still not wired into the console.** The
   engine layer is done (`src/tactical/captain-roster.js`, postures, rules); the console has
   no way to commission or to read a captain. Half a day.
5. **Warp: enemy warps are reported but never animated for the observer** if only the arrival
   is seen. Check what a player sees when an enemy jumps into contact.

## D. Decisions waiting on Chris

- Shield capacitor: measured and left OFF (it pays most for the cheapest shields, so every
  variant pushed Earth to 69-82% at 32 points). Say if it should ship anyway.
- Point-defence cap is still 70%; a 50% cap cuts interception 37% -> 30% but needs a rebalance
  (Vraygon up, Krelath down).
- Krelath hull is now 1.05 against Earth's 0.95 — a small identity change. The alternative
  measured was 1.10 for both Krelath and Zandrax.
- Naming: Zoltek/Zeldrik sit close to Archon Zeltus; the Vraygon "Avalanche" was inferred as a
  missile destroyer and never confirmed.

## E. Not on this machine

Astra's presentation checkpoint (`checkpoint/presentation-2026-09-11`) is local to the work
workstation and unpushed: Earth weapon attachment points, Krelath fore emitters, calibrated
beam optics, the bridge console study, effects study r05. One `git push origin
checkpoint/presentation-2026-09-11` there makes it available here. Everything on this machine
is now on GitHub, including `work/presentation-3d` (the board, fleets and pre-alpha reel).
