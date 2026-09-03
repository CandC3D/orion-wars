# Repository audit — 2026-09-03

Requested by Chris after the 2026-08-21 through 2026-09-03 change burst.

## Scope and authority

I inventoried every tracked path, untracked/ignored root item, local Markdown
link, JavaScript module, JSON file, scenario, test CLI, manifest and package
script. I also inspected recent git history before judging asset files.

The audit treated `src/tactical/*.js`, `data/*.json`, `arena/play.js`,
`arena/play.html` and `arena/play.css` as read-only. They were inspected but
not edited. The pre-existing edits in the three `arena/play.*` files and
`assets/blender/scripts/probe_v2_final.py`, plus the user's untracked
`.claude/settings.local.json`, were left alone. No commit was made.

Current rules authority used for this audit:

- Points: CT 1, FF 2, DD 4, CS 8, CL 10, CA/DN/CV 16, MN 20, BB 32.
- Harness budgets: 4 / 18 / 32 / 52 / 68 / 132.
- Live map: bounded 72×40 rectangle. `mapRadiusHexes` is legacy fallback only.
- Live roster specials: EAR Dreadnought; VRA Monitor; ZAN Corvette; KRE Strike
  Cruiser and Carrier. The Earth Command Ship is retired from live rosters.

## Changes made

### Documentation and comments

- `README.md`
  - Before: “Status: Phase 1 — Engine core (complete, awaiting check-in).”
    After: “Status: strategic prototype + tactical playtest.”
  - Before: “Each fields six hull classes: Frigate (1 pt), Destroyer (2),
    Light Cruiser (4), Heavy Cruiser (8), Battleship (16) … Earth Command
    Ship (8).” After: the current common ladder and roster uniques are listed,
    and the Command Ship is identified as legacy compatibility only.
  - Before: “A watch-only browser arena.” After: “scenario editor, static
    replay viewer and interactive turn-by-turn playfield.”
  - Before: “A Blender MCP polish pass on the 24 STLs is the next art task.”
    After: the original pass is complete and the later Dreadnought/Carrier
    prototypes are acknowledged.

- `arena/README.md`
  - Before: recorder example `--points 62`. After: `--points 52`.
  - Before: “No server is required.” After: “No server is required for the
    replay viewer alone”; the editor and playfield are explicitly server-only.
  - Before: bundled records were described as current “24 points” and “32”
    examples. After: their numbered filenames are explicitly called historical
    labels from earlier ladders, not current fleet totals.

- `docs/arena-brief.md`
  - Before: “Architecture rules (binding …)” and a watch-only future direction.
    After: the file is an “archived implementation brief” with current
    contracts named as authoritative.
  - Before: scales “2/8/16/24/32/64.” After: “4/18/32/52/68/132.”
  - Before: “Draw a subtle hex grid out to `mapRadiusHexes`.” After: draw inside
    rectangular width/height bounds; radius-only data is a legacy replay case.
  - Before: “a marker per ship — triangle or chevron.” After: “a manifest icon
    per roster ship.”
  - Before: unqualified “No server required.” After: viewer-only qualification.

- `docs/tactical-design.md`, top “State of play” section
  - Before: “Updated 2026-08-29” and “Corvette 0.5 / FF 1 / DD 2 / CL 4 / CA 8
    / BB 16 … EAR Command Ship 8.” After: updated 2026-09-03 with the refined
    ladder, live roster specials and their fleet floors.
  - Before: the harness swept “2–64 point scenarios.” After: it names the
    current 4 / 18 / 32 / 52 / 68 / 132 budgets and 52-point shape matrix.
  - Before: merely “The engagement area is bounded.” After: the live 72×40
    rectangle, terrain, same-hex rule and browser clients are summarized.
  - The numbered sections below remain a chronological design log. Old ladders
    there are retained as historical measurements and are now labeled as such
    in the state-of-play section.

- `docs/earth-ship-classes.md`
  - Before: Dreadnought and Carrier were both “speculative” and the replacement
    decision was pending. After: Yamato Dreadnought is the adopted Earth unique;
    Enterprise Carrier is an asset prototype, while the live Carrier is Krelath.

- `docs/ship-asset-brief.md`
  - Before: “Starting brief for a fresh session” and the old 0.5/1/2/4/8/16
    ladder. After: it is labeled an archived, completed original pass and lists
    the current ladder plus the later Dreadnought/Carrier assets.

### Test and diagnostic tools

The questioned `test/buy.js`, `test/probe.js`, `test/scan.js` and `test/xp.js`
are tracked, referenced by `docs/tactical-design.md`/`test/comp.js`, and each
has a distinct live diagnostic role. None was deleted.

- `test/buy.js`: before, default sizes were `8,16,24,32,64`, all absent from
  current `SCALES` except 32, and missing entries were silently skipped. After,
  defaults are derived from `Object.keys(SCALES)`.
- `test/probe.js`: before, `--size` defaulted to removed scale 24. After, it
  defaults to the 52-point reference fleet and the usage comment agrees.
- `test/scan.js`: before, `BUY_SIZES` was 24/32/64 and `ALL_SIZES` was
  2/8/16/24/32/64, causing undefined compositions. After, all sizes derive from
  `SCALES`; buy checks use the current special-bearing 52/68/132 budgets and
  the output header is generated from those values.
- `test/xp.js`: before, the default sweep used the removed old six keys. After,
  it derives its sweep from `SCALES`.
- `test/fleet-trial.js`: before, the documented one-scale example was 64 and
  watch mode printed “24 points each” while actually using `STANDARD` (52).
  After: the example is 68 and watch mode reports 52.
- `test/record-battle.js`: before, both comment and default requested removed
  scale 24. After, both use 52.
- `test/comp.js` is the live shared roster/scale authority and was not changed.

### Housekeeping and launch path

- `.gitignore`: added `.claude/settings.local.json`, root `.tmp-*` recovery
  workspaces and root `.tmp_*` scratch outputs. Existing render/cache rules
  remain.
- `.gitattributes`: added exactly `* text=auto`. This lets Git recognize text
  files and normalize their repository representation on future additions or
  an explicit renormalization. It does not itself rewrite the current working
  tree; no `git add --renormalize` or bulk EOL conversion was run.
- Removed the empty untracked root `.tmp-restore-tools/` directory tree.
- Removed `arena/scenarios/twin-moons-replay.json`: despite its location it was
  a generated v3 replay, not a v1 scenario; it was unreferenced and duplicated
  the embedded `twin-moons` scenario. It is recoverable from commit `0a7d992`.
- `package.json`: before, `npm run arena` required `python -m http.server 8642`;
  Python is unavailable in the audit environment. After, it uses the new
  dependency-free `node scripts/serve.js`.
- `Start Orion Wars.cmd`: before, it launched Python. After, it launches the
  same Node server as the package script.
- `scripts/serve.js`: new minimal, repository-root static server with MIME
  types, a root-bound path check, port 8642 and editor URL output.

## Findings not changed

### Protected JSON annotations are stale

These strings do not drive rules, but they read as current claims. They were
not edited because all `data/*.json` files were explicitly protected.

- `data/loadouts.json` `_sixthHull` says: “Each power has one unique sixth hull
  … EAR command ship.” Recommendation: replace it with the current roster list,
  including EAR Dreadnought and both Krelath uniques.
- `data/tactical-tuning.json` Carrier `_note` says the hull costs 8 and is not
  fielded below 24. Current values are Carrier 16 and fleet floor 52.
- `data/tactical-tuning.json` `_minFleetNote` first says “at least 24 points”
  and later says “62 new points”; the live `minFleetPoints` value is 52.
- Many `_note` fields in both files cite 2/8/16/24/32/64 measurements. Preserve
  those measurements if historically useful, but prefix them “historical old
  ladder” and add the current budget equivalent; do not silently relabel data.

Recommendation: once concurrent tuning work finishes, do one annotation-only
pass in the protected JSON. The executable point and roster fields are already
correct.

### Bundled replay names and embedded snapshots are historical

`arena/replays/ear-kre-24.json`, `ear-kre-32.json` and `vra-zan-32.json` retain
old-ladder filenames and old recorded per-ship point values even though the
current compositions price differently. They still render and are useful
compatibility fixtures. I did not regenerate or rename them because that would
change curated playback, large generated artifacts and viewer button wiring.

Recommendation: decide whether they are compatibility fixtures (then move them
under a clearly named `legacy/` group) or current demos (then regenerate and
rename them at current totals after arena work settles).

### Sprite and asset inventory

- Every live roster hull has an existing entry/file in
  `assets/icons/manifest.json`.
- `arena/sprites/manifest.json` has one entry outside live rosters:
  `EAR/command-ship`. I kept it because the hull class and viewer explicitly
  support old replay loading. Recommendation: retain it while legacy replay
  compatibility is a requirement.
- Current Dreadnought and Carrier have icons but no raster sprites; viewer
  fallback to their icons is intentional and tested.
- The broad `assets/icons` cross-faction set, `.blend1` sources, probes and
  render scripts look excessive by runtime-reference counting, but git history
  shows they are generated design-system coverage and the documented art
  investigation trail (not anonymous scratch). No asset was deleted.
- `assets/blender/scripts/probe_v2_final.py` already had a concurrent local edit
  and was left untouched.

### Other local/environment findings

- Direct `npm` invocation in this PowerShell is blocked by the machine's script
  execution policy (`npm.ps1`); `npm.cmd` works. This is environment noise, not
  a package problem.
- The managed audit sandbox denies listening on `127.0.0.1:8642` with `EACCES`,
  so the final server bind/HTTP fetch could not be exercised here. The previous
  Python command failed earlier, before binding, because Python was absent.
  `scripts/serve.js` passes Node syntax checking. Recommendation: run
  `npm run arena` once in an ordinary local shell as the final launch smoke.

## Scenario and static consistency results

- Valid current scenarios: `first-obstacles.json` (64 vs 64), all three
  formation scenarios (8 vs 8), `small-action.json` (4 vs 4), and
  `twin-moons.json` (EAR 30 vs KRE 40). Unequal sides are legal in v1.
- Every scenario validates through `validateScenario(scenario, tuning,
  loadouts)` against the current rosters and terrain rules.
- All repository JSON parsed successfully.
- All 28 JavaScript/MJS files passed `node --check`.
- All 17 tracked Markdown files had valid local links (zero missing).
- Initial EOL inventory: 142 LF text files, 44 CRLF text files, 11 mixed text
  files, 131 binary files. No line-ending normalization was performed.
- `git diff --check` found no whitespace errors. Git prints expected
  core.autocrlf warnings on this Windows checkout; the new attribute makes the
  policy explicit without retroactive churn.

## Test results

All diagnostic balance runs below used one battle per cell where a small value
was available. That proves the CLI path and current scale plumbing, not balance.

| Command | Result | Classification |
|---|---|---|
| `node test/harness.js --quiet` | exit 0; determinism, save/load and deterrence OK | Green |
| `node test/arena-smoke.js` | exit 0; all renderer/assertion tallies passed | Green, noisy |
| `node test/terrain-check.mjs` | exit 0; all asteroid/nebula/determinism checks OK | Green |
| `node test/buy.js --battles 1` | all current scales ran | Green after stale-default fix |
| `node test/fleet-trial.js --battles 1 --scale 4` | matrix and maneuver report completed | Green after comment fix |
| `node test/probe.js --battles 1` | 52-point carrier reports completed | Green after stale-default fix |
| `node test/scan.js <baseline> --battles 1` | current 4/18/32/52/68/132 sweep completed | Green after broken-scale fix |
| `node test/xp.js --battles 1` | current sweep and buy report completed | Green after broken-scale fix |
| `node test/record-battle.js … --points 52 --out <temp>` | replay written successfully, then deleted | Green after stale-default fix |
| `node test/comp.js` | imports/exits 0; no CLI output by design | Live module, not a CLI |
| `npm.cmd test` | exit 0 | Green |
| `npm.cmd run war -- --quiet` | exit 0 | Green |
| `npm.cmd run arena` | reached Node server, bind denied by managed sandbox | Environment-blocked |

`test/arena-smoke.js` printed 80 “no ship art” warnings while deliberately
running the branch where the icon/sprite manifests are unavailable. Its own
assertions then confirmed `missing: 0` for all bundled normal-render passes.
The warnings are test noise. Recommendation: inject a silent logger for that
deliberate negative case so a real missing-art warning remains conspicuous.

## Final status

The safe stale documentation, CLI defaults, scratch handling and portable
launcher were fixed. Scenarios, JSON, local links and JavaScript syntax are
clean. The remaining work is decision-bound: annotation cleanup in protected
JSON, legacy replay naming/regeneration, and whether to silence expected arena
smoke warnings.
