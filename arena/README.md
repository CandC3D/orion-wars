## Starting the arena and editor (read this first)

The editor runs the game engine in your browser, and browsers refuse to load
engine modules or data from a page opened straight from disk (`file://`). So:

1. Double-click **`Start Orion Wars.cmd`** in the project folder (or run
   `npm run arena` there). It serves the project on port 8642 and opens
   the editor.
2. Editor: http://localhost:8642/arena/editor.html
   Viewer: http://localhost:8642/arena/index.html
   The two pages link to each other in their headers.

# Battle Arena

Record a deterministic battle from the repository root:

```sh
node test/record-battle.js --a EAR --b KRE --points 24 --seed mybattle --out arena/replay.json
```

Or record an editor scenario (the fleet flags are ignored when `--scenario`
is present):

```sh
node test/record-battle.js --scenario arena/scenarios/twin-moons.json --out arena/replays/twin-moons.json
```

Open `arena/editor.html` to build a scenario, place terrain and ships, save or
reload its JSON, and run it directly in the browser. Browser-run replays are
stored in `sessionStorage` under `orion-wars:scenario-replay:v3`, then opened
as `arena/index.html?replay=session`; the viewer shows a **Back to editor** link
for these records. When opening modules from `file://` is restricted, serve the
repository root with any static HTTP server.

Open the viewer with a second command (Windows):

```sh
start "" arena\index.html
```

On macOS use `open arena/index.html`; on Linux use `xdg-open arena/index.html`.
The viewer tries `arena/replay.json` automatically. If the browser blocks local
`file://` fetches, use **Load replay** and choose that file (or drag it onto the
load panel). No server is required.

Four records ship with the viewer: `replay.json` (EAR vs KRE, 24 points, seed
`mybattle`) plus `replays/ear-kre-24.json`, `replays/vra-zan-32.json` and
`replays/ear-kre-32.json` (seed `yamato-vs-flightdeck`). Each carries its own
seed and composition in `meta`, so any of them can be reproduced exactly with
the command above. When served, all four can be opened from the bundled-record
buttons; when opened directly from disk, select the JSON file with the picker.

Ships are drawn with the schematic icons from `assets/icons/` by default; the
**Sprites** button in the transport bar switches to the rendered sprite sheet,
and any hull without a sprite falls back to a chevron. The engagement area is
the landscape rectangle of hexes from `battle.map` and is fitted to the width
of the window; a replay recorded before that ruling carries only
`mapRadiusHexes` and is still drawn on the old hexagonal field.
