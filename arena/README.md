## Play online (no install)

- **Scenario editor:** https://candc3d.github.io/orion-wars/arena/editor.html
- **Battle arena (viewer):** https://candc3d.github.io/orion-wars/arena/index.html

Served by GitHub Pages from the `master` branch; every push updates the site
within a minute or two. The local launcher below is only needed for offline
work or for changes not yet pushed.

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
node test/record-battle.js --a EAR --b KRE --points 52 --seed mybattle --out arena/replay.json
```

Or record an editor scenario (the fleet flags are ignored when `--scenario`
is present):

```sh
node test/record-battle.js --scenario arena/scenarios/twin-moons.json --out arena/replays/twin-moons.json
```

Open `arena/editor.html` to build a scenario, place terrain and ships, save or
reload its JSON, and run it directly in the browser. Terrain comes in five
types: moon, large asteroid and planet are impassable and block fire;
asteroid field is passable at double movement cost and blocks fire in and
out; nebula is passable and does not block fire, though a ship inside one
fights under the Mutara rules (short visibility, a to-hit penalty, shields
useless). Ship markers use the same playtest icon set in the editor and the
viewer. Browser-run replays are stored in `sessionStorage` under
`orion-wars:scenario-replay:v3`, then opened
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
load panel). No server is required for the replay viewer alone. The scenario
editor and interactive playfield import engine modules and data, so run them
through the launcher or another static server.

Four records ship with the viewer: `replay.json` plus
`replays/ear-kre-24.json`, `replays/vra-zan-32.json` and
`replays/ear-kre-32.json`. The numbered filenames are historical labels from
earlier point ladders, not current fleet totals. Each record carries its own
seed, composition and tuning echo in `meta`. When served, all four can be
opened from the bundled-record buttons; when opened directly from disk, select
the JSON file with the picker.

Ships are drawn with the schematic icons from `assets/icons/` by default; the
**Sprites** button in the transport bar switches to the rendered sprite sheet,
and any hull the sprite sheet predates (gunstar-battlecruiser, carrier) falls back to
its icon instead — every roster class has one, so there is no chevron/
triangle marker any more. The engagement area is
the landscape rectangle of hexes from `battle.map` and is fitted to the width
of the window; a replay recorded before that ruling carries only
`mapRadiusHexes` and is still drawn on the old hexagonal field.
