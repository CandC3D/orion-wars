# Corrected fleets and game cameras - revision 11

The three inspection sheets pass this self-review. **The board is withheld on planning-facing legibility.** The requested cast triangle exists and follows the correct arc, but it cannot function reliably under these hulls at the required planning camera. The rim codes also remain unreadable there. Neither failure is averaged into a passing sheet score.

I can see my captured frames. I directly inspected both views of every retained entry, all three shared-scale strips, the Vraygon diagnostic comparisons, the six game headings, native fighter-flight crops, and the planning/resolution frames. These are fresh adversarial self-review scores, not Chris's approval and not carried-forward scores.

## Deliverable inspection sheets

| Faction | Entries | Sheet score | Full image | Interactive sheet |
|---|---:|---:|---|---|
| EAR | 7 | 97.6 | [earth.png](fleet-sheets/earth.png) | [earth.html](fleet-sheets/earth.html) |
| KRE | 11 | 97.3 | [krelath.png](fleet-sheets/krelath.png) | [krelath.html](fleet-sheets/krelath.html) |
| VRA | 7 | 98.2 | [vraygon.png](fleet-sheets/vraygon.png) | [vraygon.html](fleet-sheets/vraygon.html) |

There are **25 supplied models on 25 bases**, representing **35 individual craft** because both fighter entries now carry six. Boss/Game Secret is retired and absent from the active asset table and sheet; Intrallus remains. Old Boss derivative files/captures remain historical, unused evidence. All source GLBs are untouched. Three whole-fleet composites remain excluded; no Zandrax assets were supplied.

The [pre-build rubric](REVISION-11-RUBRIC.md) governs the scores below. Hull weights: generated-art fidelity **25%**, practised-painter lining **25%**, period physical materials **25%**, approved mounting/codes/scale **15%**, inspection composition **10%**. Every individual criterion clears 90. Mounting here evaluates construction and arc alignment; **game-camera facing legibility is scored separately and fails**.

| Hull / flight | Art 25% | Controlled lining 25% | Materials 25% | Mount 15% | Inspection 10% | Total |
|---|---:|---:|---:|---:|---:|---:|
| EAR Monoceros | 98 | 94 | 93 | 97 | 96 | 95.4 |
| EAR Victory | 97 | 94 | 93 | 97 | 96 | 95.2 |
| EAR Saturn | 97 | 94 | 93 | 97 | 96 | 95.2 |
| EAR Acamar | 97 | 94 | 93 | 96 | 95 | 94.9 |
| EAR Yi Sun-sin | 97 | 94 | 93 | 96 | 95 | 94.9 |
| EAR Federation | 97 | 94 | 93 | 96 | 94 | 94.8 |
| EAR Yamato | 97 | 94 | 93 | 96 | 94 | 94.8 |
| KRE Sparrowhawk | 98 | 95 | 95 | 97 | 96 | 96.2 |
| KRE Swift | 98 | 94 | 95 | 97 | 96 | 95.9 |
| KRE Ballista | 97 | 94 | 95 | 97 | 95 | 95.6 |
| KRE Raptor | 98 | 95 | 95 | 97 | 96 | 96.2 |
| KRE Lightning | 97 | 94 | 95 | 97 | 96 | 95.7 |
| KRE Star Knight | 97 | 94 | 95 | 96 | 95 | 95.4 |
| KRE Bladestar | 97 | 94 | 95 | 96 | 94 | 95.3 |
| KRE Star Lord | 97 | 94 | 95 | 96 | 94 | 95.3 |
| KRE Fighter — Bomber | 98 | 95 | 94 | 95 | 96 | 95.6 |
| KRE Fighter — Interceptor | 98 | 95 | 94 | 95 | 96 | 95.6 |
| KRE Intrallus | 97 | 93 | 94 | 95 | 93 | 94.6 |
| VRA Shard | 98 | 97 | 95 | 97 | 96 | 96.7 |
| VRA Point | 98 | 97 | 94 | 97 | 96 | 96.4 |
| VRA Avalanche | 98 | 97 | 94 | 97 | 96 | 96.4 |
| VRA Feldspar | 98 | 97 | 95 | 97 | 95 | 96.6 |
| VRA Crystal | 98 | 97 | 96 | 97 | 96 | 96.9 |
| VRA Cluster | 98 | 97 | 95 | 96 | 95 | 96.4 |
| VRA Bastion | 98 | 96 | 95 | 96 | 94 | 96.1 |

Sheet weights: inventory **30%**, direct comparison **30%**, approved scale strip **25%**, evidence/reproduction **15%**.

| Sheet | Inventory | Comparison | Scale strip | Evidence | Total |
|---|---:|---:|---:|---:|---:|
| EAR | 100 | 95 | 98 | 97 | 97.6 |
| KRE | 100 | 94 | 98 | 97 | 97.3 |
| VRA | 100 | 97 | 98 | 97 | 98.2 |

Specific deductions are attached to every hull in [scores.json](evidence/fleet/scores.json), alongside hashes of its derivative, region map, preparation record and all three captures. The main limits are genuinely hidden interior surfaces in the fixed inspection pair, the very dense Intrallus assembly, warm light on neutral silver, and approximate clear-plastic optics. A shared view pair cannot expose every underside. No hull has been given extra invented detailing to compensate.

## Diagnosis and paint correction

**The Vraygon pinching was our preparation fault.** Blanket smooth normals averaged recessed-window edges into broad flat panels. Neutral-material tests removed ink, AO and metal response: the smooth derivative pinched, the same geometry with face normals did not, and the source with face normals agreed. The large fans were not collapsed windows or a source defect.

[WINDOW-DIAGNOSIS.md](WINDOW-DIAGNOSIS.md) supplies the three-way diagnostic images and matched finished before/after views for **Shard and Crystal**. [Matched camera parameters](evidence/revision-11/matched-views.json) are identical to 5dd04ba. All seven Vraygon derivatives now export flat normals; the paint preparation retains actual triangle facets. Colour regions, component counts and measured surface error remain validated. The board Shard now retains 5,597 triangles (0.40 reduction ratio) to stay below the existing 0.18 mm deviation limit at its approved, slightly larger size. Flat normals duplicate some export vertices, so its file is 587,296 bytes; the triangle and fidelity limits are explicit. No source geometry was filled or moved.

The old nearest-three crease selection could miss parts of long real breaks, and the picked-edge modulation added scratchiness. The new brush support includes every relevant crease reaching a triangle on its own plane; it rejects neighbouring parallel inset planes. Ink is a continuous **0.24 mm full-width line**, with a common **0.44 mm drybrush reach** and **0.14 mm picked-edge width**. Chalk variation stays in drybrush and cast-paint texture, not in the continuity of the ink. The largest real triangle neighbourhood is 613 crease references on Intrallus; none is silently truncated. A synthetic test exercises eight crossing lines and rejects a nearby parallel-plane line.

**Earth steel is bright again.** The 0.36 steel-body multiplier was the cause of the dull grey/khaki read. It is now 1.0 against the source colour, while steel/bronze/gold retain the shared rough fine-flake finish (metalness 0.58, body roughness 0.62, brighter real-edge burnish). Earth blue is unchanged. [Monoceros before](evidence/revision-11/ear-monoceros-before.png) and [after](evidence/revision-11/ear-monoceros-after.png) use the same camera. Independent **bright steel at game-planning height: 92/100**. The unchanged warm key still warms its hue; its value is no longer suppressed into dark trim.

All physical emissive-designated regions remain inert paint. Room-lights-off checks produce zero non-black physical pixels for every fleet entry. The energetic layer remains separate and does not change the physical render or shadow buffer.

## Approved stands, codes and fighter units

Clear tapered posts are standard on the board and all sheets. Black FASA bases retain their **3 mm bevelled skirt**, **2 mm pyramid rise**, and independently measured **30 mm exposed post** above the 5 mm apex. Posts taper from **3.0 to 2.4 mm**. Vraygon green is clear moulded styrene by default on all seven hulls; yellow and pale cyan remain paint. No lining, drybrush or emission is applied to clear plastic. Historical painted/black comparisons remain explicitly labelled as historical.

Point and Avalanche contain separated authored green rear-cap/tip surfaces around opaque housings. They are paired only where their axes and bounds uniquely match, to form the optical depth volume. Visible triangles are unchanged and the housing stays opaque. Bastion needs 52 clipping planes for one actual clear patch; the reviewed capacity now keeps all of them. Optical limits remain convex-volume approximation, neutral transmitting shadows, no caustics or multiple internal reflections.

Rims carry supplied codes only on **faces 2, 4 and 6**. The orientation test imports `faceFor` and `DIRS` from `src/tactical/hex.js` and verifies all six ship headings: face 2 is dead ahead, the same facet carries the triangle, and the base and markings turn together. Faces 1/3/5 are blank. There is no filename-derived code. `KFY-02`, `KFB-03` and the full four-digit `KDN-0000` are applied. The longest code is width-fitted, not shortened. The printed method remains off-white waterslide lettering in Arial bold, a period-available stock sans face.

The alternating pattern itself supplies a weak facing cue: forward is coded, dead astern blank. No extra emphasis was added to that pattern.

Both fighter types use **one clear post carrying a moulded formation frame**: one spine and three paired crossarms, with six craft in two columns by three ranks. It gives a period kit-like unit with fewer board penetrations than six separate stems. The bars are 0.8 mm diameter and meet the actual craft undersides at the common support height. Craft stay 9.45 / 10.70 mm long, with 2 mm bounding clearance; they were not enlarged to fit the base. Real manufacturing strength remains untested.

Independent **six-craft recognition at game-planning height: 95/100**. Native crops: [Bomber](evidence/revision-11/kre-bomber-game-planning-native.png), [Interceptor](evidence/revision-11/kre-interceptor-game-planning-native.png). Each fighter projects to about 21-24 pixels in length; all six silhouettes remain separated. These use the actual game-planning pose and 1514 x 750 viewport, not the fitted contact-sheet camera.

The compressed scale ladder is now labelled **approved**, including the board's 55.00 / 54.33 / 50.40 mm frigates. [FLEET-SCALE.md](FLEET-SCALE.md) records every length, support dimension and fighter formation. [SCALE.md](SCALE.md) retains measured object dimensions with pyramid rise and post length in separate rows. The common strip is 3.333 pixels/mm on every sheet. Shared Vraygon source-unit calibration is explicit; approval of the compressed ladder does not invent an independent fictional-length reference.

## Point-defence map and handover

The smaller yellow dorsal dome is labelled **point-defence emitter** on Sparrowhawk and the clearly matching **Swift, Ballista and Raptor**. Their diameters are approximately 2.20 source units, with the same hemispherical proportions; the larger beam domes are approximately 3.46. Each map records the exact prepared faces, geometry bounds, an attachment point, the role and the evidence. It is inert until an authorised effect uses it. Other Krelath hulls were checked and not given a designation on merely similar shapes. The sheet captions label the four confirmed cases; their region maps are the effect contract.

**campaign-map handover:** Chris has identified the previously unlabelled smaller Sparrowhawk dorsal dome as point defence. Its schematic can now receive that label in the owning session. No schematic, permanent asset intake, export pipeline or roster integration was edited here.

## Game cameras and the failed planning gate

Inspection-camera orientations are unchanged. The game has a distinct pair:

| Camera | Position (scene units) | Pitch down | Vertical FOV | Focus |
|---|---|---:|---:|---|
| Planning | 0, 150, 48 | 72.14 degrees | 12.7 degrees | Deep; zero blur |
| Resolution | 5, 26, 30 | 38.04 degrees | 40 degrees | Macro band; up to 4 buffer pixels blur |

The **1200 ms smooth descent and lens change** run inside `contact-playback.js` active time, shared with effects. Pause holds both; skip settles back to planning. All 1201 sampled progress values respect the **24-unit height and 32-degree pitch floors**. [Five actual-playback samples](evidence/revision-11/camera-move.json) record the move, with image filenames. [Planning](evidence/planning.png) and [resolution](evidence/beam.png) show the different focus and perspective. The planning board is wholly visible; the near-orthographic view no longer depends on a dramatic low angle.

The cast triangle is black like the base, with a **5.9 x 5.0 mm footprint and 0.35 mm relief**, bevelled into the forward pyramid facet. It reads as casting in inspection. At planning height its projected footprint is about **10-12 x 9-13 CSS pixels**, but that number does not make it readable. **Sparrowhawk covers it at all six headings.** Earth and Shard also cover it at several headings. Even exposed samples have very low black-on-black contrast. Raising relief cannot fix a marker hidden by the hull.

**Triangle planning legibility: 20/100, withheld. Rim planning legibility: 20/100, withheld.** At the new camera the best visible rim capitals are only **2.38-2.58 CSS pixels**. They remain useful in the close inspection pair, not for planning identification. [Six headings, ray visibility, projected glyph height and triangle-ablation contrast](evidence/revision-11/facing.json) preserve the measurements; each heading has a native captured frame. These results require a decision about mounting/base exposure or a different planning presentation of facing. I did not move posts off the apex, enlarge bases, lower the planning camera or add unapproved paint to force a score.

| Board criterion | Weight | Score |
|---|---:|---:|
| Planning comprehension | 25% | 95 |
| Resolution move and macro character | 20% | 94 |
| Approved physical construction and treatment | 20% | 97 |
| Triangle legibility at planning height | 20% | **20 - fails** |
| Print margin, budgets and regressions | 15% | 96 |
| Weighted total | 100% | **80.4 - withheld** |

## Header, budgets and checks

The grid is clipped below the header without moving or scaling either supplied mark. Its top is **4.17 mm inside the playing field**, leaving a clean gap below the title. The [header crop](evidence/brand/header.png) now includes that margin. Both original SVG silhouettes and the registered mark remain unchanged; raster checks find zero solid-outline mismatches and zero grid-ink pixels in the protected margin. Furniture geometry and textures are unchanged.

The approved clear defaults require a transmission pass. The board's revised budget is **110,000 submitted triangles / 128 draws / 96 MiB offscreen targets**; the old 70,000 / 90 opaque-default budget no longer applies. Measured planning: **109,281 triangles / 114 draws**, estimated targets **58.23 MiB**, material textures **19.57 MiB of 24 MiB**. The new complete crease table uses less texture storage than the old per-triangle duplicated endpoints. Intrallus reaches **1,162,776 submitted triangles** in isolated inspection, within its separate 1.2M cap; this is not a full-board budget.

Validation completed:

- Fast regression suite: **passed**; its existing missing-icon fixture warnings remain.
- Prototype tests: **29 passed**. Fleet tests: **32 passed**, including all supplied-source hashes, palette and inert attachment maps, all Vraygon facet normals, the four explicit PD matches, six-craft inventory and game-camera floors.
- All 25 entries captured in quarter/side/shared-scale views with no browser errors, no clipping and readable inspection codes.
- Browser checks pass for physical/energetic isolation, light-off behaviour, clear optical depth and transmitting shadow, controlled crease coverage and adjacent-plane isolation, both flight units at game planning, pause/skip/reduced motion, six arc orientations, header outlines/margin and SVG fallback.
- Final sheet capture validates complete inventory, no layout overflow, all criterion scores at least 90 and evidence hashes.

The measured desktop was Edge 152 / ANGLE on RTX 5060 Ti. The three-frigate submission benchmark reported 60 samples, mean 1.39 ms, p95 2.00 ms using JS submission plus gl.finish; this is not a device-independent or full-board performance claim. Driver memory overhead and other GPUs remain unmeasured.

**Unscored/out of scope:** full-board occupancy and performance, target-device coverage beyond this desktop, physical manufacturing/stability of the flight frame, destruction, planet/nebula samples, and absent Zandrax art. No visual criterion was left unscored because of inability to see frames.

## Reproduce

Run from the worktree, with local Playwright and Edge available (the scripts accept `PLAYWRIGHT_MODULE` and `PROTOTYPE_BROWSER`):

```powershell
node arena/prototype-3d/test.mjs
node arena/prototype-3d/test-fleet.mjs
node test/run-tests.js
node arena/prototype-3d/review.mjs
node arena/prototype-3d/review-study.mjs
node arena/prototype-3d/review-facing.mjs
node arena/prototype-3d/review-revision-11.mjs
node arena/prototype-3d/review-camera-move.mjs
node arena/prototype-3d/review-brand.mjs
node arena/prototype-3d/capture-fleet.mjs
node arena/prototype-3d/build-fleet-sheets.mjs
node arena/prototype-3d/capture-fleet-sheets.mjs --final
```

Final export deliberately rejects changed evidence until it has been visually re-reviewed and its score record updated. Preparation remains prototype-local through `prepare-fleet.mjs` and `prepare-models.py`; the original source libraries are not rewritten. Source palettes and complete per-hull surface shares are in [FLEET-REGIONS.md](FLEET-REGIONS.md).

Changes remain uncommitted on `work/presentation-3d`, starting at `5dd04ba`. HEAD advanced externally to `a147fe3` during this pass; that commit only records the new weapon-colour/effects-style ruling. I made no commit. That treatment is recorded for the next effects pass; the existing beam fixture remains a camera demonstration. No branch was created. Implementation, artifacts and reports remain inside `arena/prototype-3d/`; the authorised mailbox reply is separate. Shared simulation/runtime, permanent assets, source libraries, schematics and deferred furniture are untouched. Destruction, planet/nebula samples and the full-board test remain unbuilt.
