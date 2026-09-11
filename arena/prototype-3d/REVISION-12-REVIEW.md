# Earth and Krelath window correction — revision 12

All seven Earth hulls and eleven active Krelath entries have been rebuilt with
crease-aware smooth normals. Both inspection sheets pass a fresh visual review.
The board's Monoceros and Sparrowhawk use the same correction. Vraygon's approved
derivatives, region maps, captures and sheet are unchanged.

I can see the captured images. I directly inspected every finished side and
three-quarter cell, both neutral flanks, the Acamar and Sparrowhawk detail pairs,
the Earth command spheres, Krelath curved bodies and both fighter wings, and the
sheet overviews and shared-scale strips. These are my adversarial self-review
scores, not Chris's approval. No visual criterion in this scoped review is unscored.

- [Earth inspection sheet](fleet-sheets/earth.html) / [full PNG](fleet-sheets/earth.png)
- [Krelath inspection sheet](fleet-sheets/krelath.html) / [full PNG](fleet-sheets/krelath.png)
- [Matched before/after viewer — all 18 hulls](WINDOW-COMPARISONS.html)
- [Rubric written before implementation](REVISION-12-RUBRIC.md)
- [Machine-readable scores and evidence hashes](evidence/revision-12/scores.json)

## Diagnosis and chosen threshold

The fault was our unrestricted normal averaging across inset walls and surrounding
panels. The two primary demonstrations use the same geometry, camera, lights and
neutral grey material, with paint, ink, AO, textures, environment reflections and
shadows absent:

| Hull / location | Previous smooth normals | Corrected normals |
|---|---|---|
| Acamar, recessed main-hull flank window strip | [Before](evidence/revision-12/neutral/ear-acamar-before-detail.png) | [After](evidence/revision-12/neutral/ear-acamar-after-detail.png) |
| Sparrowhawk, central habitation window strip | [Before](evidence/revision-12/neutral/kre-sparrowhawk-before-detail.png) | [After](evidence/revision-12/neutral/kre-sparrowhawk-after-detail.png) |

On Acamar, the long triangles surrounding the small window insets previously
carried alternating bright and dark fans across the strip. On Sparrowhawk, the
same averaging pulled the surrounding surface into apparent pillows around the
windows. Changing normals alone removes both effects. This is not evidence that
Chris's window geometry needs remodelling: the prepared triangles are unchanged.

**40° is the crease threshold**, applied to the geometric angle between adjacent
faces. Smooth shading continues within each region; edges steeper than the
threshold split their corner normals. Within those regions, normals are weighted
by **face area and corner angle**, with Blender's weight set to **50** and
**Keep Sharp** enabled. Small inset bevels therefore cannot drag a broad panel's
normal sideways, and the weighting cannot reconnect a deliberately split crease.

The threshold was selected from neutral comparisons at 30°, 40° and 60°.
40° separates the window walls and housing shoulders while retaining the curved
surfaces. Weighting also removes the shallow residual pillows that angle splitting
alone left around Sparrowhawk's windows. The final comparison viewer contains the
chosen result and the required historical baseline, not a menu of competing fixes.

The source GLBs have no authored NORMAL attribute. Preparation now fails for an
Earth or Krelath source that acquires one, so a future export cannot silently lose
authored shading. Vraygon retains its existing face-normal path and was not rebuilt.

## Hull coverage and adversarial scores

**N**: no pinching at any window cluster and no new faceting on curved surfaces
(40%). **G**: unchanged geometry and authored material regions (25%).
**M**: approved miniature treatment (20%). **I**: matched inspection readability
and completeness (15%). Every criterion must independently score at least 90.

All 16 non-fighter hulls needed correction at window strips/belts and related
recesses. Both fighters have no white window cluster; their oval inserts and small
housing breaks still benefited from the same normal policy. They were checked and
rebuilt rather than silently omitted. The visible change on fighters is smaller
than on the capital hulls. No new anatomical designation was inferred.

<!-- HULL-SCORES -->

| Hull | N | G | M | I | Weighted /100 | Checked detail and remaining limits |
|---|---:|---:|---:|---:|---:|---|
| [Monoceros · EFG-03](WINDOW-COMPARISONS.html#ear-monoceros/neutral-side) | 94 | 100 | 95 | 97 | **96.2** | Command-sphere window belt and nacelle insets are crisp; the sphere and cylindrical body retain continuous shading. Small existing join irregularities remain visible in macro. |
| [Victory · EDD-02](WINDOW-COMPARISONS.html#ear-victory/neutral-side) | 94 | 100 | 95 | 97 | **96.2** | Command-sphere bands, window belt and twin nacelle recesses checked on both sides. No new flat patches across the broad sphere. |
| [Saturn · EDM-01](WINDOW-COMPARISONS.html#ear-saturn/neutral-side) | 94 | 100 | 95 | 97 | **96.2** | Window belt, cylinder rings and elongated nacelle insets checked. Broad curvature stays smooth; sharp housing ends now remain hard. |
| [Acamar · ELC-01](WINDOW-COMPARISONS.html#ear-acamar/neutral-side) | 95 | 100 | 95 | 97 | **96.6** | The flank window strip loses its radial fans in the neutral detail pair. Both flanks, nacelles and command sphere checked; shallow insets remain subtle under neutral light. |
| [Yi Sun-sin · ECA-03](WINDOW-COMPARISONS.html#ear-yi-sun-sin/neutral-side) | 94 | 100 | 95 | 97 | **96.2** | Cylinder window rows and command-sphere belt remain complete. Curved surfaces are round; existing small trim intersections are not remodelled. |
| [Federation · EBB-01](WINDOW-COMPARISONS.html#ear-federation/neutral-side) | 95 | 100 | 95 | 97 | **96.6** | Repeated window rows, sphere belt, cylindrical housings and rounded gold fixtures checked. No triangular shading fans or new broad faceting observed. |
| [Yamato · EBY-00](WINDOW-COMPARISONS.html#ear-yamato/neutral-side) | 94 | 100 | 95 | 97 | **96.2** | Main cylinder recesses, smaller command body and repeated forward rings checked. Rings have hard shoulders with smooth curved outer surfaces. |
| [Sparrowhawk · KFG-01](WINDOW-COMPARISONS.html#kre-sparrowhawk/neutral-side) | 96 | 100 | 96 | 97 | **97.2** | Habitation window strip loses both large fans and the residual pillows. Curved wings, central nacelle and both dorsal domes remain round. |
| [Swift · KDD-02](WINDOW-COMPARISONS.html#kre-swift/neutral-side) | 95 | 100 | 96 | 97 | **96.8** | Central window strip and paired curved hull surfaces checked from both flanks. Small recesses stay tight and organic surfaces stay smooth. |
| [Ballista · KDG-01](WINDOW-COMPARISONS.html#kre-ballista/neutral-side) | 95 | 100 | 96 | 97 | **96.8** | Central window strip, repeated housings and forward prism details checked. No new faceting across the broad green forms. |
| [Raptor · KCL-02](WINDOW-COMPARISONS.html#kre-raptor/neutral-side) | 96 | 100 | 96 | 97 | **97.2** | Window groups on the flank inserts and forward rim are distinct; the broad curved body and dome profiles remain smooth. |
| [Lightning · KCS-02](WINDOW-COMPARISONS.html#kre-lightning/neutral-side) | 96 | 100 | 96 | 97 | **97.2** | Flank and forward window groups are controlled; the curved body and upper housings keep continuous shading. |
| [Star Knight · KCA-03](WINDOW-COMPARISONS.html#kre-star-knight/neutral-side) | 95 | 100 | 96 | 97 | **96.8** | Both flank window groups, forward perimeter and ring recesses checked. Rounded annuli and organic bow remain smooth. |
| [Bladestar · KCV-01](WINDOW-COMPARISONS.html#kre-bladestar/neutral-side) | 95 | 100 | 96 | 97 | **96.8** | Flank window inserts and carrier deck breaks checked. Curved rings remain round, and the approved flight deck stays matte. |
| [Star Lord · KBB-02](WINDOW-COMPARISONS.html#kre-star-lord/neutral-side) | 95 | 100 | 96 | 97 | **96.8** | Multiple flank window inserts and bow perimeter checked. Stacked curved wings and ring forms retain their smooth profiles. |
| [Fighter — Bomber · KFB-03](WINDOW-COMPARISONS.html#kre-bomber/neutral-side) | 94 | 100 | 96 | 96 | **96.2** | No white window cluster. Checked the oval insert and recessed prism housing; broad swept wing remains smooth. Small geometric tessellation remains visible at diagnostic magnification, not at the six-craft inspection size. |
| [Fighter — Interceptor · KFY-02](WINDOW-COMPARISONS.html#kre-interceptor/neutral-side) | 94 | 100 | 96 | 96 | **96.2** | No white window cluster. Checked the oval insert and front housing breaks; broad swept wing remains smooth. Six craft and supplied code remain legible in the finished inspection cell. |
| [Intrallus · KDN-0000](WINDOW-COMPARISONS.html#kre-intrallus/neutral-side) | 94 | 100 | 96 | 95 | **96.1** | Stacked flank window groups, ring surfaces, forward door surround and deck edges checked. Dense overlapping structures still require the neutral opposite-flank view to inspect fully; no new curved-body faceting observed. |

<!-- END-HULL-SCORES -->

Scores deliberately stop short of 100 for normal appearance: tiny pre-existing
trim intersections and tessellation remain apparent at diagnostic magnification,
and dense overlapping parts require more than one view. The inspected surfaces
show no remaining triangular window fans and no new flat bands across curved
bodies. Geometry fidelity scores 100 specifically for the unchanged-geometry
criterion; it is not a claim that the original decimation is lossless to the source.

The numerical smooth-edge audit supports this visual judgement but does not
replace it. On every hull, more than 99.9% of tested shared edges below 30° retain
continuous corner normals, and more than 99.9% above 60° have separated normals.
Exact values and the small exceptions remain in the JSON; non-manifold edges and
degenerate triangles are excluded from this particular continuity statistic.
The result is not a mathematical guarantee for every possible camera angle.

## Sheet review

Weights: inventory 25%; corrected windows/curvature 35%; comparison, captions and
approved scale 25%; layout and evidence integrity 15%.

<!-- SHEET-SCORES -->

| Sheet | Inventory | Windows/curvature | Comparison/scale | Layout/evidence | Weighted /100 |
|---|---:|---:|---:|---:|---:|
| Earth | 100 | 95 | 98 | 98 | **97.5** |
| Krelath | 100 | 95 | 97 | 97 | **97.1** |

<!-- END-SHEET-SCORES -->

Both sheets retain their inspection cameras, 3.333 pixels/mm shared-scale strip,
approved compressed ladder, clear posts, black FASA bases, arc-2 triangles and
face-2/4/6 codes. Krelath retains both six-craft flights and Intrallus, with its
KDN-0000 code. The retired Boss is absent. No material, lining, colour, light,
furniture, attachment placement, scale or game-camera setting was changed.

The previously reported game-board identification failures remain open:
planning rim capitals are 2.38–2.58 CSS pixels and Sparrowhawk covers its cast
triangle at all six headings. Their recorded 20/100 legibility scores in
[revision 11](REVISION-11-REVIEW.md) still stand. Passing these inspection sheets
does not clear the withheld game board. The pre-alpha reel remains on hold.

## Validation and cost

- Fast regression suite: **all passed**, recorded in
  [fast-suite.log](evidence/revision-12/fast-suite.log).
- **29 prototype checks and 32 fleet checks passed.** The board browser review
  also passes its existing assertions; its planning view remains 109,281 submitted
  triangles and 114 draws, under the existing budgets.
- [Normal/geometry audit](evidence/revision-12/normal-audit.json): all 18 fleet
  derivatives plus both board frigates have exactly the same triangle-corner
  positions, ordering and COLOR_0 values as their preserved baselines. Maximum
  position and colour deltas are **zero**. Reduction ratios, triangle counts,
  connected components and measured surface-error bounds remain unchanged.
- Region and energy-attachment maps were regenerated and validate. Every map is
  semantically identical to its baseline. All source palettes remain enforced.
- [Matched-capture audit](evidence/revision-12/matched-captures.json): all **54**
  finished quarter/side/strip views have identical cameras, bounds and submitted
  triangle counts to their baselines. Each hull has a measured visible change;
  all seven Vraygon capture records remain identical. Neutral before/after cameras
  are also asserted equal when captured.
- **82 protected file hashes** match, covering the staged source GLBs, Vraygon
  derivatives/maps/reports and fleet images/sheet, plus shared sheet CSS. Vraygon's
  independent detail captures were retained as well.
- The 18 fleet GLBs grow from **37,548,188 to 40,830,752 bytes**: approximately
  **3.13 MiB / 8.7%**, because split normals require extra exported vertices.
  Triangle counts and draw calls do not rise. Board Monoceros grows from 334,512
  to 413,824 bytes; Sparrowhawk from 371,236 to 420,524 bytes. This is a storage
  and vertex-buffer cost, not a new surface-density allowance.
- Earth export: **3200 × 4190**; Krelath: **3200 × 5776**. Browser checks find
  no missing cells, broken images, caption overflow, strip overflow or page errors.
  Final exports check the review scores and SHA-256 evidence before capture.

## Reproduction and handover

All commands run from the worktree root. Blender 5.2 prepares the assets; the
capture scripts use the installed Playwright package and Edge. The preserved
baseline is revision 120ea9f and must not be overwritten. `snapshot-window-baseline.mjs`
is the one-time baseline recorder, not a step to rerun now.

```powershell
node arena/prototype-3d/rebuild-window-normals.mjs
node arena/prototype-3d/audit-window-normals.mjs
node arena/prototype-3d/capture-normal-study.mjs
```

For finished captures, set `PLAYWRIGHT_MODULE` to the installed Playwright module
and `PROTOTYPE_BROWSER` to Edge, then run `capture-fleet.mjs` with the Earth and
Krelath IDs only. The comparison viewer's images are those actual captures; there
is no image retouching.

```powershell
node arena/prototype-3d/verify-window-captures.mjs
node arena/prototype-3d/build-window-comparisons.mjs
node arena/prototype-3d/build-fleet-sheets.mjs --factions=EAR,KRE --review=evidence/revision-12/scores.json --report=REVISION-12-REVIEW.md --rubric=REVISION-12-RUBRIC.md
node arena/prototype-3d/capture-fleet-sheets.mjs --factions=EAR,KRE --revision=12 --review=evidence/revision-12/scores.json --final
```

Rebuilt or recaptured evidence requires another direct visual review before
resealing scores. `seal-window-review.mjs` computes totals and fingerprints from
the explicitly authored criterion scores; it does not award scores or inspect art.

Campaign-map can carry the 40° split/weighted-normal policy into permanent intake
for the curved Earth/Krelath hulls. Its permanent assets, exporters and schematics
were not edited here. The source window meshes did not need changing to remove
this defect. No commit or branch was made; implementation stays inside
`arena/prototype-3d/`. No reel, destruction, planet/nebula sample, rules change or
full-board test was started.
