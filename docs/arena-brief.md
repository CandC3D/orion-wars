# Battle Arena Brief — archived implementation brief

**Status (2026-09-03): implemented and superseded.** This document records the
original watch-only viewer assignment. The live browser suite now also has a
scenario editor and interactive playfield; `docs/playfield-contract.md`,
`docs/scenario-format.md`, `arena/README.md` and the code take precedence.
Current harness budgets are 4 / 18 / 32 / 52 / 68 / 132, the live map is a
72×40 rectangle, roster ships use manifest icons (never chevrons), and only the
replay viewer can operate without a server.

Build a simple browser arena for **observing battles** from The Orion Wars'
tactical combat engine. Watch-only for now; it will grow into the interactive
tactical playfield later, so keep the bones clean.

## Original architecture rules (historical)

1. **The engine stays headless.** Everything under `src/` runs with no DOM.
   The arena is a CLIENT that consumes recorded battle data. Do not import
   DOM-touching code into `src/`, and do not move engine logic into the viewer.
2. **Record, then replay.** Do not couple the viewer to live engine internals.
   The pipeline is: a small Node script runs one battle and writes a replay
   JSON; the viewer is a static page that loads and animates that JSON.
3. **One permitted engine touch.** `runBattle(fleets, tuning, rng, opts)` in
   `src/tactical/resolver.js` already accepts `opts.log`. You may add ONE
   optional callback, `opts.onRound(turn, round, fleets)`, invoked at the end
   of each round (after the detonation pass), passing the live fleet arrays
   for snapshotting. Nothing else in `src/` may change. If you also want
   weapon-fire events for animation, do NOT restructure `fire()` — derive
   what you can from `opts.log` lines and round-to-round state diffs, or add
   an equally minimal `opts.onShot(event)` guarded so it is a no-op when
   absent.
4. **Do not touch `data/`** (balance constants are under active tuning) and do
   not modify `test/fleet-trial.js` or `test/harness.js`.
5. No build step, no frameworks, no npm dependencies. Plain ES modules,
   vanilla JS, one static HTML page. Canvas or SVG, your choice.

## Part 1 — the recorder: `test/record-battle.js`

CLI: `node test/record-battle.js --a EAR --b KRE --points 52 --seed mybattle --out arena/replay.json`

- Factions: EAR, VRA, ZAN, KRE. Compositions by points: reuse the SCALES
  shared `SCALES` table from `test/comp.js` (4/18/32/52/68/132), including the
  per-faction unique-hull swap (`compFor`) — import that shared authority; do
  not copy it.
- Build fleets with `buildFleet`, place with `deployFleets`, run with
  `runBattle`, seeding via `makePrng(seedFromString(seed))` exactly as the
  trial script does. Determinism matters: same args → identical replay.
- Snapshot per round via `opts.onRound`: for every ship record id, faction,
  className, points, pos {q,r}, facing, cloaked/detected, destroyed,
  superstructure + superstructureMax, power, shieldCap (all six faces),
  shieldDown, magazine, and mount inop flags. Deep-copy — the arrays mutate.
- Also capture `opts.log` lines tagged with turn/round, and the final result
  object (victor, survivors, points, stats).
- Replay JSON shape: `{ meta: {factions, comps, seed, tuning: {name-only
  echo of key battle constants: startDistanceHexes, map,
  roundsPerTurn}}, rounds: [{turn, round, ships: [...]}], log: [...],
  result: {...} }`.

## Part 2 — the viewer: `arena/index.html` (+ `arena/arena.js`, `arena/arena.css`)

A static page; opening it with a replay loaded shows the battle.

- **Hex geometry:** axial coordinates, pointy-top, matching `src/tactical/hex.js`
  (`x = sqrt(3) * (q + r/2)`, `y = -1.5 * r`). Draw the subtle hex grid inside
  the rectangular `map.widthHexes` × `map.heightHexes` bounds. A replay with
  only `mapRadiusHexes` is a legacy compatibility case.
- **Ships:** a manifest icon per roster ship, pointing along `facing`
  (facing 0 = east, counter-clockwise by 60°). Size scaled roughly by points
  (corvette smallest → monitor/battleship largest). Faction colors: EAR blue,
  VRA gold, ZAN red, KRE green. Destroyed ships: brief explosion flash, then
  a dim wreck marker. Cloak is currently dormant in-game, but render
  cloaked-and-undetected ships at low opacity if present in a replay.
- **Status:** under each marker a hull bar (superstructure/max) and a small
  six-segment shield indicator arranged around the marker matching facings
  (1 front-left, 2 forward, 3 front-right, 4 rear-right, 5 rear, 6 rear-left);
  downed faces marked distinctly.
- **Playback:** play/pause, step forward/back one round, a scrubber over all
  rounds, speed control (0.5×/1×/2×/4×). Interpolate marker movement between
  rounds for smoothness; snap on scrub.
- **Side panel:** turn/round counter, per-side surviving points, the log lines
  for the current round, and the final verdict banner when the replay ends.
- **File loading:** try `fetch('./replay.json')` first; if that fails (`file://`
  CORS), fall back to a drag-and-drop / file-picker target. No server is
  required for this replay viewer alone; the editor and playfield require one.
- Click a ship to pin a detail card (name, class, power, magazine, per-face
  shields, mount status).

## Part 3 — convenience

- `arena/README.md`: how to record and view a battle in two commands.
- A couple of pre-generated replays checked into `arena/replays/` (EAR vs KRE
  at 24, VRA vs ZAN at 32) so the viewer works out of the box.

## Original acceptance checks

1. `node test/harness.js --quiet` still passes (engine untouched apart from
   the optional callback).
2. `node test/fleet-trial.js --battles 30` output unchanged vs. before your
   change (the callback must be zero-cost when absent).
3. Recording the same seed twice produces byte-identical JSON.
4. The two bundled replays play start-to-finish in the viewer with no console
   errors, in a plain browser, no server.

## Context for good taste (read, don't re-litigate)

- `docs/tactical-design.md` — "State of play" section at top explains the
  combat model (power pool, residual shields, arcs, warp jump).
- Ship visual identity: EAR clean navy, VRA crystalline, ZAN brutalist,
  KRE arthropod — echo these in marker styling only if it stays cheap.
- The former future direction — order input and ship selection — is now the
  interactive playfield governed by `docs/playfield-contract.md`. Camera and
  replay event work also continued after this brief.

---

## Addendum — weapon fire effects (ruling, 2026-08-30)

We want to SEE the shooting: beams and both missile types, with glows.

### Replay data (one more minimal engine touch, sanctioned like `onRound`)

Add optional `opts.onShot(event)` to `runBattle` — a guarded no-op when absent,
consuming NO rng draws (determinism must be untouched; acceptance re-checks
byte-identical fleet-trial output). Suggested pattern: `runBattle` wraps the
caller's `onShot` in a closure that stamps the current `{turn, round}` before
handing it down, so `fire()` needs no signature change.

Events (all carry turn, round):
- `{kind:'beam', weapon, shooterId, targetId, hit}` — from the beam branch of
  `fire()`; weapon is the mount type (laser-cannon / blaster-beam / heavy-blaster).
- `{kind:'launch', weapon, shooterId, targetId}` — missile branch of `fire()`.
- `{kind:'missile', weapon, targetId, outcome, damage}` — at the arrival block
  in `runBattle`; outcome one of hit / evaded / intercepted / dead-target.

The recorder captures events into the replay as `shots: [...]`; bump the
replay `meta.version` and re-record the bundled replays. The viewer resolves
positions from the round snapshots by ship id (a dead ship's last snapshot
position is fine for a fading missile).

### Visuals (canvas, glows via radial gradients / shadowBlur)

- **Laser cannons** — thin, fast, precise beam pulse. Cool color (white-blue).
- **Blasters (incl. heavy)** — thick, short, brutal bolt. Hot color (orange-red);
  heavy blaster slightly wider/deeper. Lasers and blasters must read as two
  clearly different colors at a glance.
- **Neutronic missile** — the traditional photon-torpedo read: a compact
  glowing ball (warm gold/orange) travelling shooter→target across its flight,
  with a soft pulsing halo.
- **Plasma torpedo** — the traditional plasma read: a larger, unstable
  green-teal mass with a decaying trail, visibly heavier and slower-feeling
  than the neutronic ball.
- Misses streak past the target; intercepted missiles pop mid-flight;
  evaded missiles swerve wide. Hits flash the struck shield facing.
- Keep it cheap: no particles beyond a handful of alpha-fading circles;
  effects must not stutter playback at 4x.

### Rules unchanged

`src/` read-only EXCEPT the single `onShot` addition to resolver.js. `data/`,
`test/fleet-trial.js`, `test/harness.js` untouched. Same four acceptance
checks as the base brief, plus: byte-identical fleet-trial output proves the
callback costs nothing when absent.
