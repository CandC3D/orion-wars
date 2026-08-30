# Battle Arena

Record a deterministic battle from the repository root:

```sh
node test/record-battle.js --a EAR --b KRE --points 24 --seed mybattle --out arena/replay.json
```

Open the viewer with a second command (Windows):

```sh
start "" arena\index.html
```

On macOS use `open arena/index.html`; on Linux use `xdg-open arena/index.html`.
The viewer tries `arena/replay.json` automatically. If the browser blocks local
`file://` fetches, use **Load replay** and choose that file (or drag it onto the
load panel). No server is required.

The `replays/` directory contains EAR vs KRE at 24 points and VRA vs ZAN at
32 points. When served, either can be opened from the bundled-record buttons;
when opened directly from disk, select its JSON file with the picker.
