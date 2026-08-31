# Ship Art Pipeline Handbook

Everything learned building the four-faction fleet (Aug 29–31, 2026), written
for the next art pass — when more detailed models arrive, this is the map.

## 1. Workflow overview

Headless Blender 5.2 LTS (`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`,
run `--background --python <script>`). Everything is scripted and reproducible;
no hand edits live in .blend files. Stage order per faction:

1. **Probe** — measure the meshes before writing any rules
   (`probe_fleet.py`, `probe_krelath.py`, `diag_*.py`, `slice_probe.py`).
   Every hand-guessed coordinate failed on these models; every measured one held.
2. **Kit on the battleship** — one hull, iterate with Chris's markups until
   approved (`earth_kit.py`, `krelath_kit.py` are the archived kit iterations).
3. **Fleet script** — parameterized per-hull build
   (`fleet_build.py` Earth, `krelath_fleet.py`, `vraygon_fleet.py`,
   `zandrax_fleet.py`). Renders 6 views/hull to `assets/blender/renders/<faction>/`,
   saves `assets/blender/<slug>.blend`.
4. **Contact sheets** — `contact_sheet*.ps1` (PowerShell + System.Drawing,
   2×3 labeled grid per ship) → `renders/<faction>/sheets/`.
5. **External review** — codex CLI with sheet images (see §7).
6. **Polish** — `docs/polish_spec.md` records the fleet-wide plan-b pass.
7. **GLB export** — `glb_export.py` bakes and exports
   `assets/game/ships/<slug>.glb`; `glb_check.py` round-trip-renders one.

## 2. Fleet-wide conventions (Chris-established canon)

- **Weapons doctrine:** never on engine pods. Mounts: head (dorsal, ventral,
  port/starboard cheeks — starboard can be an asymmetric missile battery),
  boom/spine, ventral aft.
- **Nav lights:** always on engine-pod collar rings; red port, green starboard.
  Stations from detected ring bands, lateral aim at the nozzle row.
  Battleship (Earth) pinned: `nav_fixed=[(-6.7,0.0),(-19.4,0.0)]`.
- **Flight decks:** centered by circle fit through the aperture cap's boundary
  vertices (caps are often partial discs; centroid/bbox estimates drift).
  Rim ring + vertical retracting-door slat graphic.
- **Frigates carry no missile weapons.**
- **Dorsal pods with their own nozzle are engine pods** — no turret on them,
  collar carved bronze/silver.
- **Silhouettes are canon.** Detail via materials, bump, minor fittings only.
  Feature glows: windows rectangular, missile ports circular.
- **Plating polygons:** Earth rectangle, Krelath triangle, Zandrax hexagon,
  Vraygon crystal shatter. Plate/window physical size is constant across a
  faction so class scale reads in-fleet.

## 3. Faction kit parameters (approved values)

### Earth Federation (`fleet_build.py`)
- Blue (0.028,0.085,0.28); silver metallic 0.9/rough 0.28; windows white-blue
  (0.7,0.85,1.0); engine glow orange-red (1.0,0.16,0.015); gunmetal machinery.
- Rect plating: Voronoi randomness 0, anisotropic mapping (1.0,0.62,1.0),
  scale 0.85, seam 0.06.
- Detection: sphere fit (fwd verts, |z| gated), patch analysis for brim/rings,
  stern caps by radius (small→nozzle glow, central rearmost→bay, rest→bulkhead),
  raycast-seated fittings. Per-hull configs in the `HULLS` dict.

### Krelath Empire (`krelath_fleet.py`)
- Green chitin (0.020,0.110,0.030); bronze on WEAPONS ONLY (0.34,0.185,0.05,
  metallic 0.95/rough 0.30); windows yellow-green (0.75,1.0,0.25); engine glow
  red (1.0,0.035,0.015).
- Triangle lattice: 3 stripe families at 60°, min distance = seams; triplanar.
  Feathering: shingle ramps (period 1.6) + barb micro-ridges (0.42, strength
  0.10 after polish).
- BB uses Chris's annotated hull (`Krelath - suggested weapons placements.stl`);
  mounts auto-detected as dense patches (≥40 faces, bbox diag <5) + measured
  dome boxes at (±4.3,−6.2). Other hulls place his turret STLs (z-up, base at
  min z, muzzle +y) per the `mounts` config.
- Engine arrays: red triangle cells on ALL big flat rear faces (clusters,
  aft 35%, area-gated) — these hulls have no nozzle geometry.

### Vraygon Star Realm (`vraygon_fleet.py`)
- Texture+glow ONLY (Chris: no greebles). Gold crystal (dark 0.28,0.155,0.03 →
  light 0.63,0.42,0.10); blue inclusion facets (cell tone > 0.90); red glowing
  seam veins; orange windows (1.0,0.42,0.06); orange crystal-cell engines.
- Crystal: Voronoi randomness 1.0, scale 0.30, seam 0.07, FLAT-shaded
  (the faceting is the species — never smooth).
- Sterns are angled crystal (n.y≈−0.60, never flat): engine gate n.y<−0.55,
  aft 25%, min cluster area 1.2.

### Zandrax Horde (`zandrax_fleet.py`)
- Texture+glow only. Red plates (0.24→0.40 range); gold replacement plates
  (tone > 0.87, colour 0.62,0.40,0.08); weld-dark seams; yellow windows
  (1.0,0.85,0.15); PURPLE vent slats (0.62,0.10,1.0); yellow hex engines.
- Honeycomb: custom node lattice — two offset rectangular grids + hex support
  metric (max of |projections| on 0/60/120° edge normals); HEX_R 0.95, weld
  band 0.84–1.00 of inradius; hammered noise bump; grime multiply layer.
- Corvette: engines are chevron TRAILING faces at mid-hull — detection cascade
  aft 25% → widen 55% → rearmost flat cluster.

## 4. Detection techniques (transfer to any new model)

- **Patch analysis** (the workhorse): union-find flood fill across edges with
  face angle < 30°; classify patches by area / y-extent / z-extent / mean |n·ŷ|
  / radial stats. Finds saucer brims (thin annulus concentric with a fitted
  sphere: min rh < r+0.5 AND max rh > r+2.5), collar rings (short radial
  bands), dorsal pods (patch owning the highest face in a window), collar
  washer annuli (mny>0.85 patches sharing vertices with ring bands).
- **Least-squares fits:** spheres (algebraic 4×4), circles in a plane with
  outlier-rejection loops. Fit face CENTERS on smooth barrels — vertices sit
  only at feature rings and lie about the surface.
- **Cross-sections:** `bmesh.ops.bisect_plane` + grid flood-fill clustering
  when patches/verts are ambiguous.
- **Stern caps:** connectivity clusters of rear-facing faces; classify by
  rmax (small = nozzle, central rearmost large = flight deck).
- **Raycast placement:** `obj.ray_cast` from outside along an axis; seat
  fittings at hit point minus normal×sink. Nothing floats.
- **Bay centring:** circle fit through boundary vertices (verts shared with
  non-cap faces).

## 5. Blender 5.2 API gotchas (hard-won)

- `ShaderNodeMix`: link `inputs["A"]/["B"]` BY NAME. `inputs[0]` is Factor;
  index linking breaks the node silently (renders as 0).
- Render engine enum: `"BLENDER_EEVEE"` (no `_NEXT`).
- Compositor: `scene.node_tree` is GONE. Use
  `ng = bpy.data.node_groups.new("Comp","CompositorNodeTree")`,
  `scene.compositing_node_group = ng`, add `CompositorNodeRLayers` +
  `CompositorNodeGlare` + `NodeGroupOutput`, create the output socket via
  `ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")`.
  Glare TYPE is a menu INPUT socket: `gl.inputs["Type"].default_value = "Fog Glow"`.
- Smooth shading: `bpy.ops.object.shade_auto_smooth(angle=...)`; use 12° on
  dense meshes (35° goes cloudy), skip entirely for crystal (Vraygon).
- STL import: `bpy.ops.wm.stl_import`.
- AgX view transform washes bright emissives to white — colored glows want
  strength ~1–3 plus compositor bloom, not strength 10+.
- Triplanar procedural lattices: blend three projections by normal dominance;
  make tie-breaks ASYMMETRIC (lo=0.0/hi=0.04) or 45° chamfers get a mushy
  average of two fields; bias the fore/aft plane (lo=0.15/hi=0.25) so sloped
  roofs never receive a near-perpendicular projection.
- Repeating shader cells clipped by a span boundary leave half-features:
  use explicit feature stations + a |n·ŷ| flatness gate.

## 6. Bake & GLB export (`glb_export.py`)

- Cycles, samples 2 (deterministic passes), 1024²: DIFFUSE (COLOR filter
  only), ROUGHNESS, EMIT, NORMAL (captures shader bump). Smart UV Project
  (66°, margin 0.003).
- **Zero every material's Metallic before the diffuse bake** — metals
  otherwise bake near-black (lost silver/bronze/gold).
- Bake target: add an Image Texture node with the target image to EVERY
  material slot, make it active+selected, then `bpy.ops.object.bake`.
- Earth hulls planar-decimate (DISSOLVE, 4°) 85–90% silhouette-safe;
  alien hulls native. Krelath GLBs still 11–33k tris (dense turret domes).
- Final: one Principled material (metallic 0.35 uniform, emission strength
  1.5), export GLB `use_selection=True`. 1.5–4.1 MB/ship.

## 7. Delegation & tooling

- **codex CLI** for spec-driven code edits and image review:
  `codex exec "PROMPT FIRST" -m gpt-5.6-sol -c model_reasoning_effort=high
  --skip-git-repo-check [--sandbox workspace-write] [-i img ...]`.
  Prompt must precede `-i` flags. Resume a session (its context retains full
  read files — useful for recovery): options BEFORE the subcommand:
  `codex exec --sandbox workspace-write resume --last - < prompt.txt`.
- Chris's standing review instruction: after a usage-limit resume, run
  ChatGPT-5.6 Sol (high effort) over the render sheets.
- **Process rules:** never regex-replace `try:...except` spans (a first-match
  anchor once gutted four scripts); never pipe long Blender runs through
  `| head` (SIGPIPE kills the render — log to a file); commit to git after
  every approved milestone.

## 8. When the detailed models arrive

1. Drop new STLs in `assets/models/` (keep the same names if they replace
   hulls 1:1 — the fleet scripts key on names).
2. Re-run the faction probe scripts FIRST; expect densities like the annotated
   Krelath BB (33k tris) — patch detection thresholds assume feature fixtures
   are denser than hull; if the whole hull is dense, gate patches by bbox
   size/shape, not face count.
3. Detection that transfers as-is: stern-cap classification, sphere/circle
   fits, raycast fittings, bay boundary-fit. Re-measure anything with
   hardcoded coordinates (Krelath BB dome boxes, Earth BB rod gate,
   nav_fixed) — they are model-specific.
4. Modelled-in mounts: detect as dense small patches (≥40 faces, diag <5) —
   Chris prefers placing mounts in the model; expect that pattern.
5. Keep check-in cadence: battleship kit → Chris markup rounds → fleet →
   sheets → review → polish → GLB. Commit at each approval.

## 9. Review takeaways still open (plan c, deferred)

Per-class texture motifs to distinguish FF/DD and CL/CA sisters (stripe
layouts, engine-array rhythms, accent placement) — texture-only, silhouettes
canon. Reviews archived: `docs/vraygon_review.txt`, `docs/zandrax_review.txt`
(Earth/Krelath reviews summarized in session memory).
