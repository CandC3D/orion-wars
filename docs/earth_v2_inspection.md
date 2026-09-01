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
