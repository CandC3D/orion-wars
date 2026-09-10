# The tabletop, 1987 — prototype slice 01

Built in `C:\Users\chorr\Documents\ds-work\presentation-3d` on
`work/presentation-3d`, based on `f9af402`. Nothing is committed. All work is
under `arena/prototype-3d/`; no shared runtime, assets, controls, exporter,
integration or test-runner file was changed.

## Look at the frame

From this worktree, use an unused local port, separate from the PLAY server:

```powershell
$env:PORT = '18873'
node scripts/serve.js
```

Open `http://127.0.0.1:18873/arena/prototype-3d/index.html`. No npm install or
network access is needed to view it. Three.js 0.180.0 is vendored locally with
its MIT licence and SHA-256 manifest. The pinned core and loader originate at
[Three.js r180](https://github.com/mrdoob/three.js/tree/r180).
The [WebGL renderer](https://threejs.org/docs/pages/WebGLRenderer.html) uses
WebGL2. Unsupported contexts show a diagnostic and link to the unchanged SVG
Fleet Command client; that is a fallback, not a 3D renderer hidden inside PLAY.

Fixed-state captures:

- [Planning](evidence/planning.png): the board, paper edge, warm room light,
  neutral posts, rulebook, mug, dice and pencilled spiral notebook.
- [Resolution beam](evidence/beam.png): same scene, permitted macro camera.
- [Own shield flare](evidence/shield.png): explicitly authored confirmation.
- [Anonymous arrival](evidence/anonymous.png): no inferred bearing or shooter.

The frame passes my initial miniature gate: posts, bases, printed card and table
remain legible at the permitted angles. No low-angle camera or added hull
geometry was needed. Chris should review the Earth paint and these frames
before any destruction work or full-board test.

## What is actually implemented

Three existing game GLBs: Earth frigate (11,256 triangles), Krelath frigate
(11,664) and Vraygon frigate (150). Geometry is cloned, centred, scaled and
oriented at runtime. Source files are unchanged. The newer 120,756-triangle
Earth Monoceros import was not substituted or reduced here; that pipeline
decision belongs to `campaign-map`.

Only Earth receives the candidate paint shader: opaque blue block coats over
black, glossy ink lines, broken chalky strokes and hand-picked silver collars.
These are albedo/roughness/metal-mask changes, with no normal map, displacement,
zenithal pass or extra hull topology. The other two hulls are simple basecoat
references, explicitly not paint-complete candidates. Legacy baked emissions
and dense normal maps are not used by any physical material.

The board texture is generated as printed artwork: paper ground, two spot inks,
halftone dots, a displaced registration impression and fold lines. No skybox,
starfield horizon or surface relief. Room props are plain period objects.

`assets.json` is the prototype's explicit material/register/socket sidecar.
Every drawable and material is independently classified; validation rejects
missing, mixed or unknown classifications, physical emission and energy lights.
The source GLBs have no such metadata, so this adapter declares it rather than
pretending the export pipeline already provides it.

Both source and impact sockets are seated against the loaded hull geometry.
Engine sockets must hit the stern region; the initial forward intersections
were rejected and corrected. Stand attachment is an authored XYZ parameter;
post height is uniformly 1.6. Cosmetic display offsets keep an anchor and tether
to the unchanged q/r hex. No collision, range, picking or movement rules exist
in this renderer.

Read [PROJECTION.md](PROJECTION.md), written before the effects layer, for the
full information contract. Important limits: today's safe stream lacks an
exact mount id, an unknown endpoint's bearing, a confirmed enemy-kill event,
and a positive shield-hit confirmation. Consequently:

- Hull sockets are cosmetic attachments, not simulated firing-mount claims.
- Unknown endpoint geometry is never recovered from current or old positions.
- Anonymous effects are neutral radial cues. A random bearing would leak a
  directional claim, so none is invented.
- `resolved` never becomes a hit, shield flare or kill. The shield sample is
  explicitly authored own-ship confirmation, not a new live event disclosure.
- Contact loss removes the report with no breakage or inferred wreck.

The renderer consumes frozen allowlisted projection packets only. Production
prototype modules import no simulation module. `app.js` imports the existing
`arena/contact-playback.js` unchanged; camera `hold` and effect `onTick` use
that one active clock. Planning is stationary. Skip, pause, cancellation and
reduced motion settle coherently. The review hooks set fixed poses; they are
not a second animation clock.

## Chosen budgets

These are small-scene budgets, not a promise about a 72×40 board.

| Item | Limit / choice |
|---|---|
| Scene | Three hulls, original geometry; ≤70,000 submitted triangles, ≤90 draw calls including shadows and fullscreen passes |
| Physical light | One warm directional shadow key, one soft hemisphere fill |
| Shadows | One 2048² map; updated when projected hull layout changes |
| Stands | 1.6 units each; attachment parameterised; no gameplay altitude |
| Camera | Planning (12,31,35), 32° lens; resolution (9,16.053,22), 40° lens |
| Hard camera floor | Y ≥12 and downward angle ≥32°, both checked over interpolation |
| Transition / focus | 900 ms each way; deep-focus planning; resolution blur ≤3 output pixels |
| Render buffer | ≤2,073,600 pixels; device-pixel ratio ≤1.5 |
| Transient energy | One event at a time, sequenced by playback; a beam has two layers. Active events finish before the next starts |
| Engine glow | Four tiny stern glows, ≤0.15 alpha/strength; no emitted lights |
| Beam / shield duration | 850 / 650 ms; no camera shake, flash exposure or lens flare |
| Bloom | Two half-resolution blur passes, gain 0.18, per-channel bloom contribution capped at 0.18 |
| Materials | Provisional 24 MiB generated texture budget (including mipmaps); no legacy hull textures uploaded |
| Targets | Estimated ≤64 MiB for HDR targets, physical depth and shadow texture at the pixel cap; excludes driver overhead and canvas storage |
| Deferred nebula proposal | Additive sum ≤0.06 linear per channel; ≤15% of visible board at contribution ≥0.01; board mean ≤0.012 |

The physical colour/depth pass is separate from energy. Energy samples physical
depth, writes no depth, and contributes no lights or shadows. A bounded blur
of energy only is combined afterward; physical materials never enter bloom.
The brief's later unamended sentence saying ambient brightness is "floored"
is treated as superseded by the explicit cap ruling. A planet will require two
separate drawables, physical sphere plus energetic halo. Neither stationary
feature is built in this slice.

## Verification

Run the independent checks without editing the shared test runner:

```powershell
node arena/prototype-3d/test.mjs
node test/run-tests.js
```

17 prototype checks pass. The existing fast suite also passes all 38 groups on
this branch. It was not modified to include the prototype.

For browser evidence, install/use the repository's Playwright or point
`PLAYWRIGHT_MODULE` at an existing `playwright/index.mjs`, then run:

```powershell
node arena/prototype-3d/review.mjs
```

`PROTOTYPE_BROWSER` may name an installed browser executable. The script serves
only this worktree on an ephemeral loopback port and closes its own browser
and server. It writes screenshots and [review.json](evidence/review.json).
It checks register failures, physical/shadow invariance, energetic depth
occlusion with visible and hidden probes, pause, skip, reduced motion and
WebGL2-to-SVG fallback. Browser console/page errors: zero.

Measured on headless Edge 152 / ANGLE D3D11 / RTX 5060 Ti. Captured states used
55–56 draws and 50,780–51,306 submitted triangles. The included 1920×1080 timing
sample is a warm three-hull rendering probe (JS submission plus `gl.finish`),
not input-to-photon latency, a production-browser promise, or a fleet-scale
result. Exact timing and GPU identification are recorded in `review.json`.

Still to measure: a chosen reference machine in ordinary interactive browsing,
integrated/mobile GPUs, GPU timer-query timings, decoded-image peak memory and
driver allocations, class labels at full-board scale, transit/shared-hex
arrangements, and eventual nebula coverage under overlap. The scope stop is
deliberate: no destruction, planet/nebula sample or full-board load test yet.

## Handover, without editing another owner's files

`campaign-map`:

1. `assets/blender/scripts/glb_export.py:21` hardcodes the PLAY-tree root, and
   `glb_check.py:3` does too. Export creates its output directory from that root
   before processing arguments. Please make input/output roots explicit and
   validated before worktree execution. Neither script was run or modified.
2. Exact roster-to-filename construction misses EAR missile-destroyer and
   gunstar-battlecruiser, VRA and ZAN missile-destroyers, and KRE
   missile-destroyer/carrier. A named asset mapping and completeness validation
   belong in your pipeline. This sidecar declares only the three actual assets;
   no substitute hulls or new full-roster mapping were invented.
3. Future exports need register regions/masks, authored weapon/engine and stand
   sockets, and the later fracture hierarchy. Current GLBs combine physical and
   emissive data in one material. Their raw normal/emission maps cannot simply
   be left on the physical miniature. Runtime normalization here is not a
   replacement export policy.

`map`: integration, picking and overlapping-unit presentation remain yours.
This miniature layout is a non-authoritative, tethered prototype example.

`console`: live controls and phase integration remain yours; the only controls
added are this isolated page's review playback buttons.

Contact/captain owner: please review `PROJECTION.md` before adding any new
shield confirmation, exact mount selection or confirmed enemy-kill disclosure.

Suggested future commit message: `Add isolated 1987 tabletop presentation prototype`.
