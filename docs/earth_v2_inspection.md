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

## LC weapons note (owner, 2026-08-31)

The Light Cruiser carries THREE BALL TURRETS on the forward pod (its 3
beam mounts) - painted gray-family, NOT orange. Orange component probe
finds only one dome turret (~2,000 faces + detail bits, one cluster).
=> At kit time, find LC ball turrets geometrically (sphere fit / reused-
part fingerprint), not by warning colour. Orange is not a reliable
weapons marker on every hull.

## Earth weapons-colour canon (owner, 2026-08-31)

Orange = weapon marker in the Earth style, applied BOTH to turret domes
AND as coloured muzzle rings on torpedo tubes (see DD/CA bow tubes).
Caveat from the LC note above still holds: not every weapon is orange
(gray ball turrets), but everything orange IS a weapon (or its ring).
At kit time: orange faces -> weapons-warning accent material, keep as-is
per the colour key.

## CORRECTION - LC v2.1 weapons colours (2026-08-31)

There are NO gray ball turrets (owner). The LC carries 3 ball turrets on
the forward pod + 2 orange torpedo-tube rings + dome turret, all meant to
be orange-marked. The v2.1 GLB export shows the SAME colour
nondeterminism as the first Destroyer v2.1 export: only ONE orange item
survived (a boom-mounted ball, z-fighting with a coincident shell in
(0.65,0.68,0.69) medium gray - that population is the fight partner, not
a real palette colour). Tube rings exported gray, dome turret red.
=> LC needs a Union Group re-export, same as the Destroyer fix.
Supersedes the earlier "gray ball turrets" note above.

## Earth reusables library (owner-supplied, 2026-08-31)

assets/models/v2/greebles/ - the standard fixture/greeble parts as
individual STLs (colourless; use for geometric identification, part
matching, and canonical orientation/scale reference):

  Part                     tris    dims (x,y,z)
  Aft Hangar Bay           5,860   22.9 x 25.1 x 25.1
  Ball Turret              7,728   11.0 x 11.0 x 17.5
  Dome Light (Port)        1,296   0.5 x 0.9 x 0.9
  Dome Light (Starboard)   1,296   0.5 x 0.9 x 0.9   (same mesh as Port)
  Engine Nacelle          47,624   95.0 x 16.8 x 20.0
  Engine Strut                48   52.6 x 10.3 x 6.1
  Hangar Control           2,156   13.8 x 5.6 x 3.5
  Sensor Dish              5,016   16.0 x 15.4 x 29.0
  Torpedo Tube             2,690   14.3 x 8.2 x 8.2
  Window Bank              2,930   13.8 x 13.8 x 4.2

Validation: Dome Light 1,296 tris == the constant green population
(3,888 corners / 3) on every hull censused so far. Parts are multi-
colour on the hulls (e.g. Sensor Dish = gold 2,496 faces + gray
remainder), so a part's full tri count spans multiple colour
populations - match on contiguous-component counts, not censuses alone.

## LC Union re-export + Battleship 2.1 intake (2026-08-31)

LC v2.1 Union Group: FIXED and authoritative. Orange restored - exactly
3 ball turrets (~4,000-4,269 faces each) on the forward pod + 2 torpedo
muzzle rings (~970 faces) + inner detail = 10 components. Census: gray
198,201 / blue 114,690 / red 111,399 / orange 49,224 / gold 12,408 /
white 12,312 / medium-gray 9,297 / mid-dark 8,514 (+green). 173,302 tris
(Union flattening differs from the defective export's 213,204).

Battleship 2.1 series: CLEAN, spec-exact. 339,348 tris (largest so far).
Orange components: EIGHT ball turrets (4,003-4,235 faces) + FIVE tube
muzzle rings (956-970) + detail bits = 26 comps == BB envelope (8 beams,
5 tubes). No confetti, colours correct. Quad-nacelle layout. Census:
gray 414,072 / red 221,718 / blue 173,559 / orange 130,752 / medium-gray
22,905 / white 21,273 / mid-dark 17,505 / gold 12,420 (+green).

Ball-turret component size ~4,000-4,300 faces and muzzle-ring ~960-970
faces are now confirmed part fingerprints across CL/CA/BB.

## Krelath Frigate v1 intake (2026-08-31) - FLAGGED

First Krelath detailed model. Geometry good: 7,724 tris, low-poly faceted
wedge design; reusable fixtures per owner: window bays, double-barreled
dodecahedron ball turret, sensor dish, hangar bay. "Same but different"
vs Earth tech.

COLOURS SCRAMBLED (export nondeterminism, worst case yet): hull renders
brown where Tinkercad shows green; the red turret has NO red population
in the file; an unexpected magenta (0.85,0.04,0.55) appeared on the
turret collar + wing stripe. Census: brown(0.67,0.49,0.31) 7,044 /
green(0.27,0.72,0.29) 4,800 / magenta 3,888 / blue(0,0.62,0.85) 3,888 /
yellow(1.0,0.86,0.1) 3,552 corners. Union Group re-export requested.
Also pending: Krelath colour key from owner (Earth key does not apply).

## Krelath colour key - emissives (owner, 2026-09-01)

Yellow, blue, and purple are EMISSIVE for Krelath: blue + purple = nav
light colours, yellow = weapons and engine glows. This legitimises two
census populations flagged above: blue 3,888 and purple(0.85,0.04,0.55)
3,888 corners are each exactly one Dome Light part (1,296 faces) - the
two nav lights, correctly coloured. Still wrong in the v1 GLB: the red
dodecahedron turret has no red (exported brown), and the green/brown
hull balance is inverted vs Tinkercad. Union re-export still needed.
Remaining key questions for the full Krelath set: green + brown roles
(hull/accent), red = turret as-is?

## Krelath colour key - complete (owner, 2026-09-01)

Green and bronze as per the v1 faction kit: GREEN = chitin hull plating
(v1 kit green 0.020,0.110,0.030), BROWN (0.67,0.49,0.31) = BRONZE metal
(v1: bronze finish, metallic ~0.95). Full Krelath key:
  green  -> chitin hull
  brown  -> bronze metal
  yellow -> EMISSIVE weapons, engine glows, AND windows (windows are
            TRIANGLES on Krelath ships; cf. v1 kit yellow-green windows)
  blue   -> EMISSIVE nav light
  purple -> EMISSIVE nav light
  red    -> WEAPONS WARNING colour, analogous to Earth orange; NOT
            emissive. Marks weapons (e.g. the dodecahedron turret).

## Krelath Frigate v1 re-export ACCEPTED (2026-09-01)

Union-style re-export fixed the palette: green hull 7,605 / purple 3,846
/ blue 3,837 / bronze 3,729 / yellow 1,977 / RED 546 (turret restored).
7,180 tris. Nav lights ~= dome-light fingerprint less boolean clipping.
Render matches Tinkercad. Authoritative Krelath Frigate.

## Yamato-class Dreadnought + Enterprise-class Carrier 2.1 intake (2026-09-01)

Both CLEAN (no confetti, palette correct). Candidates to replace the
Command Ship (see docs/earth-ship-classes.md).

DREADNOUGHT: 401,936 tris (largest hull). Orange audit: 3 ball turrets
(4,015-4,234 faces), 3 tube muzzle rings (973-980), FOUR small orange
spine strips (114-146 faces) and ONE 2,773-face orange component ~20
units cubed at the extreme bow = the PHOTONIC CANNON emitter (spinal
mount, orange-ringed barrel). Five nacelles. Tube rings sit on dedicated
weapons pods (window-bank pods, no radiators) - not on engine pods, so
the doctrine holds. Census: gray 436,926 / red 321,528 / blue 290,712 /
orange 63,171 / mid-dark 26,349 / gold 24,867 / white 22,386 /
medium-gray 15,990 (+green).

CARRIER: 160,376 tris. Owner design note: repurposed light-cruiser-type
hull; Battlestar-style OUTRIGGER pods are the flight decks (Galactica
homage); the usual globe command pod reduced to a SAUCER in the same
place serving as command + flight deck (USS Enterprise homage). Orange
audit: ONE ball turret (4,198) + detail - defensive armament only, the
offence flies. Census: gray 193,239 / blue 124,752 / red 109,866 /
white 14,427 / orange 13,806 / gold 12,411 / mid-dark 8,751 / green
3,876 (dome light).
