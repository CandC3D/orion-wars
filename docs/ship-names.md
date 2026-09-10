# Vessel names

Chris's source registers live in `data/source/{ear,kre,vra}-ship-names.txt`.
After editing them, run `node scripts/build-ship-names.mjs` from any working
directory using the script's path. Commit both the sources and the generated
`data/ship-names.json`. The generator preserves list order, checks its explicit
class mapping against `data/tactical-tuning.json` rosters, and rejects unknown
class headings or missing classes before writing. The JSON uses LF line endings
on every platform so regeneration is byte-identical.

The JSON mirrors `captain-names.json`: `_comment` plus faction-keyed `registers`.
Each faction has `prefix`, `prefixName`, `navy`, and `classes`; each engine
`className` has its `sourceClass` and flat `names` list.

## Opting in

In PLAY, check **Name vessels from naval registers** before taking command.
It starts unchecked. Restart preserves that engagement's choice and seed.
The worker loads the registers only when requested. The command host accepts
`setup.nameShips: true` with `{ shipNames: registers }` as its fourth argument.
It does not activate naming merely because registers are available.

At the engine boundary, call
`createBattle(scenario, tuning, loadouts, seed, { shipNames: registers })`, where
`registers` is the JSON's `registers` object. Omit the option for unchanged ship
state. `createBattleFromFleets`, fleet trials and existing fixtures remain as
before. Both sides are named, with collisions resolved independently per fleet.

`drawShipName(shipId, seed, faction, className, registers, { taken })` draws one
record. The optional `taken` set is the caller's collision accumulator, as in
`drawCaptain`. `drawShipNames(ships, seed, registers)` returns a pure id-to-record
map for one fleet. `nameShips(ships, seed, registers)` is the sole attaching
helper. It writes `{ prefix, name, full }` to `ship.vesselName`; the Drydock
`displayName` is preserved. Own observations include a cloned vessel record,
and `shipLabel` uses its `full` name without adding a hull number.

The shared `registerSpace` and `drawRegisterEntry` exports in `captain-roster.js`
implement lookup and deterministic forward probing for both officers and vessels.
Only a private stream hashed from the seed and ship id is used. Names are unique
across a faction's classes within the fleet. Reuse adds Roman ordinals; vessels
can continue beyond X to cover PLAY's 128-ship limit with small registers.
Captains retain their existing ten-pass ceiling and draws. Naming ships never
commissions captains.

## Source decisions

- The second `Hero` in Krelath's Swift register is discarded with a warning;
  the first position is kept. Cross-class repeats (`Ranger`, `Starwing`) remain
  in their written registers and are resolved when a fleet draws.
- `*Lightning* Class` parses as supplied. The mixed-case `Monitors` section
  also parses. None of the three source files is corrected.
- Vraygon Avalanche maps to `missile-destroyer` per Fable's explicit instruction.
  This remains an inference: its supplied model designation is VDD. The mapping
  is one line in `scripts/build-ship-names.mjs` if Chris corrects it.
- Krelath's carrier remains `Starblade` from the names register; Fable reports
  `Bladestar` in the model filename. Its first listed vessel is spelled
  `Starbade`; that spelling is preserved too. These are Chris's decisions.
- Zandrax has no source register. Every ZAN roster class explicitly draws no
  name, and opting in adds no vessel fields to its ships.

## Verification (2026-09-09)

The original fast suite passed before and after implementation, before adding
the new test entry. Its complete combined stdout/stderr was byte-identical:
61,325 bytes, SHA-256
`362b8e0433a4af582fedb17f552f8f64340c0699dea179fc9d92d17faf32f245`.
No test fixtures or `test/fleet-trial.js` were edited.

The expanded fast suite passed all 43 groups, including 23 vessel-register
checks. An additional comparison against `ec19b98` reproduced captain draws
exactly for 20 fleets of 200 ships and the historical ten-pass overflow ceiling.
The PLAY worker path passed with naming both off and on. A live visual check
was unavailable because no browser was connected in the implementation session.

`test/ship-registry.mjs` is registered in the fast suite. It covers all four
rosters explicitly, reproducibility, private PRNG use, forward probing,
cross-class collisions, 128-ship overflow, source parsing and clean-copy
regeneration, PLAY host/worker opt-in, labels and own observations. It also
compares complete recorded states through EAR/KRE and VRA/ZAN battles: names
are the only added field and the actual battle PRNG stays identical.
