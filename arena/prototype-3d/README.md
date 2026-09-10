# Three frigates, painted white metal - revision 04

Monoceros, Sparrowhawk and Shard now use current source hulls and the same
period paint treatment. Each keeps its own COLOR_0 palette and interpretation.
Bodies are matte; ink follows real recesses, chalk follows real raised edges,
and dull metallic paint replaces broad chrome reflections. Furniture is unchanged.

The final self-review scores 94.30 weighted; every criterion and every hull
material assessment clears 90. The review attaches deductions and all 19
visually inspected images.

Start with the [ordinary planning frame](evidence/planning.png), at its native
size, then [resolution](evidence/beam.png). These are the gameplay distances
used to tune the paint. Native planning crops, without enlargement:
[Monoceros](evidence/monoceros-planning.png),
[Sparrowhawk](evidence/sparrowhawk-planning.png), [Shard](evidence/shard-planning.png).

| Hull | Plan close-up | Side | Stern | Bow |
|---|---|---|---|---|
| Monoceros | [Plan](evidence/monoceros-detail.png) | [Side](evidence/monoceros-side.png) | [Stern](evidence/monoceros-stern.png) | [Bow](evidence/monoceros-bow.png) |
| Sparrowhawk | [Plan](evidence/sparrowhawk-detail.png) | [Side](evidence/sparrowhawk-side.png) | [Stern](evidence/sparrowhawk-stern.png) | [Bow](evidence/sparrowhawk-bow.png) |
| Shard | [Plan](evidence/shard-detail.png) | [Side](evidence/shard-side.png) | [Stern](evidence/shard-stern.png) | [Bow](evidence/shard-bow.png) |

The close-up hooks obey the same height/pitch floors; they are review cameras,
not new game controls. [Rubric](RUBRIC.md), [scored adversarial review](REVIEW.md),
[measured scale](SCALE.md), [source/material contract](SOURCE-GAP.md),
[projection contract](PROJECTION.md), and the unchanged
[identification proposal](IDENTIFICATION.md) accompany the frame.

## Source preparation and budgets

| Hull | Source triangles / bytes | Local triangles / bytes | Length |
|---|---:|---:|---:|
| Monoceros v3 | 120,632 / 10,134,364 | 11,442 / 334,512 | 55 mm |
| Sparrowhawk | 83,508 / 7,015,984 | 13,351 / 371,208 | 65 mm |
| Shard v3 | 14,064 / 1,182,644 | 4,188 / 139,164 | 45 mm |

The page loads only these local derivatives. No deprecated repo hull or raw
source GLB is loaded by the page. All supplied sources remain unchanged and
ignored. Preparation retains all welded connected components and all 9/7/7
colour regions. Shard's reduction creates 20 duplicate faces; validation removes
them locally before final measurement/export. No connected feature disappears.

| Budget | Current observation / cap |
|---|---|
| Ordinary frame submissions | 68,736-69,766 triangles / 66-75 calls; caps 70,000 / 90 |
| Material textures | 17.31 MiB including 5.31 MiB of generated float crease data; cap 24 MiB |
| Targets | Estimated <=64 MiB; excludes canvas/driver storage |
| Lighting | One warm shadow key plus existing soft fill; energy adds no lights |
| Shadows | One 2048 x 2048 map, physical objects only |
| Camera | Planning (8,63,54), 32-degree lens; resolution (5,28,30), 40-degree lens |
| Floors / clock | Y >=24 units, downward angle >=32 degrees; 900 ms on the existing playback clock |
| Effects | One transient; beam 850 ms, shield 650 ms; bloom half-resolution, gain 0.18 |
| Focus / buffer | Resolution blur <=3 px; <=2,073,600 pixels, DPR <=1.5 |

Crease data stores actual line segments, not invented panel artwork or a normal
map. Using neighbouring segments prevents wide brush marks from stopping at a
triangle boundary. Paint widths are 0.25 mm ink, 0.38 mm drybrush, 0.12 mm picked
edge. Body roughness is 0.98 with strongly suppressed broad specular return;
metallic paint is roughness 0.82 / metalness 0.18, with small local edge returns.

All bright paint is physical and emits nothing. Separate energy copies the
confirmed exhaust and weapon patches on Earth and Krelath. Shard has no inferred
weapon or exhaust assignment. Sparrowhawk's second green and smaller dome stay
unanswered. No replacement base identifier is implemented.

## Run and verify

Serve this worktree independently of PLAY, for example:

```powershell
$env:PORT = '18873'
node scripts/serve.js
```

Open `http://127.0.0.1:18873/arena/prototype-3d/index.html`. The pinned local
Three.js r180 build needs no CDN or install. WebGL2 failure offers the unchanged
SVG Fleet Command fallback.

```powershell
node arena/prototype-3d/test.mjs
node test/run-tests.js
```

**23 prototype checks and 38 unchanged fast-suite groups pass.** Browser checks
also pass: source classifications, real crease masks, planning-distance brush
visibility, lights-off physical/energy separation, physical/shadow invariance,
depth occlusion, floors, pause/skip/reduced motion and SVG fallback. No console
or page errors. No shared tests or fixtures were changed.

To regenerate the 19 captured images, scale table and measured browser evidence:

```powershell
$env:PLAYWRIGHT_MODULE = 'file:///path/to/playwright/index.mjs'
$env:PROTOTYPE_BROWSER = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node arena/prototype-3d/review.mjs
```

The review server uses an ephemeral loopback port and closes with its browser.
The warm RTX 5060 Ti / Edge 152 probe at 1920 x 1080 averages 0.48 ms, p95
0.70 ms for submission plus gl.finish. It is a three-hull probe, not a target
hardware or full-board result. See the source contract for asset rebuild commands.

All implementation remains under `arena/prototype-3d/`, on
`work/presentation-3d`, HEAD `2a1184f`. No commit or branch was created. Furniture,
base identification, the shared runtime, PLAY and other sessions' files are
unchanged. Campaign-map owns permanent intake and the exporter/roster gaps;
map owns integration/picking, console owns live controls.

Stop here for frame review. Destruction, planet/nebula samples and the full-board
test remain deferred. The cross-class size ladder, identification readability,
interactive/integrated-GPU timings and peak decoded-image/driver memory remain
unscored. The existing nebula proposal remains a <=0.06 additive contribution,
<=15% coverage and <=0.012 mean, with no sample built.
