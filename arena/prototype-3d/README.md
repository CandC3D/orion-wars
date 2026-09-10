# The tabletop, 1987 - revision 03

Sparrowhawk now carries a developed period paint pass using its actual COLOR_0
regions: both greens, bronze housings, orange/yellow/white paint and red warning
rings. Recess lining and chalky edge work follow measured geometry. Separate
imagined energy sits on the confirmed exhaust and larger emitter. Black stands
and all measured physical sizes remain unchanged.

The final self-review clears every criterion: brief 100, art 95, period 92,
scale 96, tabletop reading 93 (weighted 95.30). All eight final captures were
visually inspected. The 20 prototype checks, 38 fast-suite groups and browser
checks pass. See the scored review for deductions and work left unscored.

I missed vertex colours in the previous source inspection. The old assertion
that the reference was missing was incorrect; [the source contract](SOURCE-GAP.md)
records the correction, palette, preparation method and painting rules.

- [Review rubric](RUBRIC.md) and [final scored review](REVIEW.md).
- [Scale table](SCALE.md), regenerated from the built scene; still a provisional
  frigate-only range, not an approved cross-class ladder.
- [Identification proposal](IDENTIFICATION.md): no replacement scheme chosen.
- [Information projection contract](PROJECTION.md).

## Inspect the frame

Serve this worktree on an unused local port, separate from PLAY:

```powershell
$env:PORT = '18873'
node scripts/serve.js
```

Open `http://127.0.0.1:18873/arena/prototype-3d/index.html`. No network, npm
install or CDN is required. The local Three.js r180 build and loader have an
integrity manifest and MIT licence. WebGL2 failure offers the unchanged SVG
Fleet Command fallback.

The ordinary [planning](evidence/planning.png) and [resolution beam](evidence/beam.png)
frames show the intended presentation. Review zooms show the
[painted hull](evidence/sparrowhawk-detail.png),
[habitation side](evidence/sparrowhawk-side.png),
[stern/exhaust](evidence/sparrowhawk-stern.png) and
[bow/collector](evidence/sparrowhawk-bow.png).
These zooms stay above the same height and pitch floors; they are evidence
hooks, not additional gameplay camera modes. Shield and anonymous-arrival
captures are also in `evidence/`.

## Budgets

| Item | Limit / current observation |
|---|---|
| Source preparation | 83,508 to 13,351 triangles; 7,015,984 to 371,208 bytes; all three components retained |
| Captured submissions | 60,280-61,310 triangles / 67-76 calls; caps remain 70,000 / 90 |
| Physical lighting | One warm shadow key and hemisphere fill; no energetic lights |
| Shadows | One 2048 x 2048 map; physical objects only |
| Material textures | 22.67 MiB estimated RGBA8 including mips; cap 24 MiB |
| New hull paint textures | None; authored vertex colours and geometric masks |
| Targets | Estimated <=64 MiB; excludes driver overhead/canvas storage |
| Planning camera | (8, 63, 54), 32-degree lens, deep focus |
| Resolution camera | (5, 28, 30), 40-degree lens, <=3 pixel focus blur |
| Camera floor | Y >=24 units (240 mm), downward angle >=32 degrees |
| Phase transition | 900 ms on the existing contact playback clock |
| Transient effects | One event; beam 850 ms / shield 650 ms; two beam layers |
| Engine sample | Two legacy reference glows plus the current Krelath exhaust patch |
| Bloom | Half-resolution, 0.18 gain and bounded contribution |
| Render buffer | <=2,073,600 pixels, DPR <=1.5 |
| Deferred nebula proposal | Sum <=0.06 linear/channel; <=15% board coverage at >=0.01 contribution; mean <=0.012 |

Only Sparrowhawk is the developed candidate. Earth and Vraygon retain source
albedo under matte non-emissive reference materials, without normal maps.
The two greens remain a question for Chris; both are treated as hull paint.
The smaller dome's function stays unresolved. No label, mount or energetic
activation is assigned to it.

## Verification

```powershell
node arena/prototype-3d/test.mjs
node test/run-tests.js
```

The 20 prototype checks cover source/derivative colour preservation, source
hashes, scale, register contracts, information boundaries and the shared clock.
The unchanged fast suite has 38 groups. Neither shared tests nor their runner
was modified to include this isolated page.

For browser evidence, point to an existing Playwright installation:

```powershell
$env:PLAYWRIGHT_MODULE = 'file:///path/to/playwright/index.mjs'
$env:PROTOTYPE_BROWSER = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node arena/prototype-3d/review.mjs
```

This serves only this worktree on an ephemeral loopback port and closes its own
browser/server. It regenerates screenshots, the scale table and detailed
`evidence/review.json`. Checks include missing COLOR_0 rejection, cube/plane/
concave-fold paint masks, physical paint going black with lights off, separate
energy remaining visible, physical/shadow invariance, depth occlusion, playback
pause/skip/reduced motion and SVG fallback.

Headless Edge 152 / RTX 5060 Ti / ANGLE D3D11 timings are only a warm three-hull
submission-plus-gl.finish probe at 1920 x 1080. They are not full-board or target
hardware guarantees. Interactive/integrated-GPU results and peak decoded-image/
driver memory remain unmeasured. No destruction, planet/nebula sample or
full-board test has been built.

## Ownership

All implementation files remain under `arena/prototype-3d/` on
`work/presentation-3d`, HEAD `2aaa446`. No commit or branch was created. The
pre-existing user `.gitignore` change and source files are preserved. No PLAY,
shared runtime, permanent asset, export, integration, picking or control file
was changed. The standing mailbox receives the report separately.

Campaign-map still owns permanent intake, the exporter-root bug and the
roster-to-filename gap. Map owns integration/picking; console owns live controls.
Stop here for Chris's frame review before destruction or full-board work.
