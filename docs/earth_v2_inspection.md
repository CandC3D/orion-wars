# Earth v2 Models — Inspection Report (ChatGPT-5.6 Sol via codex, 2026-08-31)

Six Tinkercad GLB exports, held until all four fleets arrive. Structure:
one merged mesh + one grey material per ship; colours are per-corner
BYTE_COLOR vertex attributes (no UVs). Owner colour key: blue=Earth plate
blue, gray=silver, yellow=gold, orange=as-is (weapons warning), red=heat
radiator, dark gray=as-is.

## Fleet-wide flags

- Scale ladder not class-readable at 1:1 (FF 1.00 / DD 1.14 / CL 1.72 /
  CA 1.78 / BB 1.78 normalized lengths; CL=CS and CA~BB share dims; CL/CS
  wider than CA/BB). ACTION: owner approves per-class display scales
  anchored to gameplay footprints (FF1/DD2/CL4/CA8/BB16).
- Meshes offset far from origin (Tinkercad workplane positions retained).
  ACTION: recenter on gameplay pivots + apply transforms before detection.
- Orientation contract needed (sphere bow, +Y forward, +Z up apparent).
  ACTION: confirm vs v1 convention, rotate once, record metadata.
- 93.8k-276.4k tris/hull (1.08M fleet total). ACTION: keep as source
  masters; LOD budgets + colour-safe LODs + collision proxies for runtime.
- CL, BB, CS show striping/speckling (coplanar duplicate shells or
  overlapping parts suspected). BLOCKING before bake/detection; CA and DD
  are clean controls for diagnosis.
- Bake path not ready: no UVs, semantic colour only in COLOR_0. ACTION:
  extract palette masks (lock tolerances; orange vs yellow are close),
  split seams BEFORE any weld/decimate, then either COLOR_0-consuming
  material or bake masks to textures.
- Full-fleet palette audit incomplete (only Frigate enumerated).

## Per-ship highlights

- Frigate: stray colour (0.23,0.33,0.64)x24 — locate + map to plate blue
  unless intentional; ventral appendage attachment suspect; FF/DD size gap
  weak.
- Destroyer: wider but LOWER than frigate (class cue inconsistency); dorsal
  dish faces aft (don't infer bow from appendages); otherwise clean.
- Light Cruiser: severe striping (blocking); dims identical to Command
  Ship; narrow neck fragile-looking.
- Heavy Cruiser: cleanest large hull (use as export-settings control);
  CA/BB same footprint — owner decision on BB scale; thin nacelle pylons +
  red radiator collars need preserving through cleanup.
- Battleship: 276k tris (highest); widespread striping (blocking); dense
  module interpenetrations to validate.
- Command Ship: CL chassis + dorsal saucer (confirm intentional); saucer
  pedestal reads detached; inherits CL striping.

## Colour-key amendments (Frigate v2 FINAL baseline, 2026-08-31)

- Emissives for Earth v2: red = engine glow + port light, green = starboard
  light, white = windows.
- OWNER NOTE: the engine strut may be painted white in the model — treat it
  as grey/silver metal, not emissive window-white. Split by geometry (strut =
  large structural frame; windows = small hull rectangles).
- Red is dual-use: radiator paint (long strips, non-emissive) vs engine/port
  glows (rear discs / port lamp, emissive) — same RGB, split by geometry.
- Export format: GLB mandatory (STL loses all colour); Union Group vs Bundle
  Group are interchangeable (identical imported content).

## Light-gray resolution (2026-08-31, settled)

The (0.98,0.98,0.98) population is Tinkercad's lighter gray used on
structure (sphere band, collar rings, strut frame, bay housings) AND the
window slots - one shared RGB. Kit-time rule per owner: contiguous
components >~500 tris -> silver/metal; small slot components -> emissive
white windows. Source GLBs untouched. Optional: paint windows a distinct
colour in future uploads for zero ambiguity.

## Light Cruiser v2.0 intake (2026-08-31)

244,496 tris, 7 colour populations: blue 350,076 / gray 204,801 / red
121,752 / orange 38,571 / gold 7,488 / light-gray 6,912 / green 3,888
(corner counts). Gold + green match Frigate/Destroyer exactly ->
standardized sensor dish + starboard light confirmed across three hulls.
Light-gray usage is minimal here (windows only, ~2.3k faces).

Striping: STILL VISIBLE from some angles (mid drum renders dark/streaked
in persp view, clean from rear; one ball turret speckled gold/gray) -
same near-coincident-shell depth-order artifact as the old CL. No
re-export needed; kit-time exterior extraction resolves it. Re-verify
this hull after cleanup.

## v2.1 Destroyer + Light Cruiser intake (2026-08-31, weapons-spec alignment)

Light Cruiser v2.1: CLEAN. 213,204 tris. Turrets pruned (orange 38,571 ->
8,448), forward torpedo tubes present at bow. New medium-gray population
(0.65,0.68,0.69) x10,992. Gold/green fingerprints unchanged. Renders good.

Destroyer v2.1: FLAGGED - two anomalies vs v2.0:
1. ~80k corners swapped white->gold (white 86,070 -> 4,194; gold 7,488 ->
   86,670). Sphere hull above/below the blue band now renders GOLD, as do
   large structural areas that were light-gray. Looks like a palette-wide
   recolor, not the intended tube/cell change.
2. Heavy shell z-fighting on the boom/engine assembly (confetti speckle on
   pods and balls, candy-striped drum) - much worse than v2.0, which was
   one of the two clean hulls (1.2% metric). Suggests duplicated or
   near-coincident shells introduced in this revision.
Orange drop 15,360 -> 3,840 is consistent with launch-cell removal (OK).
Awaiting owner confirmation before treating as authoritative.

## Destroyer v2.1 re-export resolution (2026-08-31)

Owner re-exported as Union Group + Bundle Group; Tinkercad screenshots
confirm the model is authored clean. Findings:
1. COLOR NONDETERMINISM: one ~79k-corner group of structural parts gets a
   different colour per export - gray (Union, CORRECT), gold (first v2.1
   export), orange (Bundle). Everything else identical. => For future
   uploads prefer Union Group; always sanity-check the census against the
   Tinkercad screenshot palette.
2. Z-FIGHT CONFETTI on the boom/engine assembly is NOT a v2.1 regression -
   rendering the archived v2.0 from git history shows identical confetti.
   The shells date from the v2.0 greeble pass and are the known
   flattened-export artifact; kit-time exterior extraction handles it.
AUTHORITATIVE: "Earth Destroyer v2.1 Union Group.glb". First v2.1 export
and Bundle Group variants removed (in git history).
White population now 4,200 (windows only) - the structural recolor to
standard gray is confirmed, simplifying the window split for this hull.

## Heavy Cruiser 2.1 series intake (2026-08-31)

CLEAN - best export of the set so far (no confetti, colours correct).
265,038 tris, 9 colour populations: gray 333,582 / red 166,086 / blue
144,282 / orange 86,178 / white 21,363 / medium-gray 14,202 / mid-dark
13,116 / gold 12,423 / (+green, below print cap). Orange verified by
component analysis: FIVE dome turrets (two aft-nacelle, three bow) +
THREE torpedo-tube muzzle rings = exactly the CA envelope (5 beams,
3 tubes). Three-nacelle layout is an homage to the classic USS
Federation-class dreadnought (owner note). Supersedes Earth Heavy
Cruiser v2.glb (git history).
