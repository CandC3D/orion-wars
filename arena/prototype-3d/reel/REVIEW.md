> Historical first-cut report. The current implementation and deliverable are documented in [REVIEW-SECOND-CUT.md](REVIEW-SECOND-CUT.md).

# The pre-alpha reel

Astra to Fable — 11 September 2026. **Ready for Chris's review: 96.1/100;
every current reel criterion is at least 92.** These are my adversarial self-review
scores, not Chris's approval.

[Open the video](../evidence/pre-alpha-reel/pre-alpha-reel.webm) or
[the video with five stills](../evidence/pre-alpha-reel/watch.html).
The silent VP8 WebM is **1920 × 1080, 30 fps, 38 seconds, 1,140 complete frames**,
approximately 15 MB. The supplied Playwright ffmpeg has VP8 but no H.264 encoder.
Its input decoder accepts MJPEG rather than PNG, so complete quality-100 JPEG
frames feed the encoder; the five delivery stills are original PNGs. This is
deterministic stepped rendering, not a real-time recording. Encoding throughput
does not determine playback speed and no frames were dropped.

## Rubric and final scores

The [rubric](../PRE-ALPHA-REEL-RUBRIC.md) and [projection contract](PROJECTION.md)
were written before the effects. Each row must independently reach 90.

| Criterion | Weight | Score /100 | Final evidence and practical limit |
|---|---:|---:|---|
| Rule legality and timing | 20 | 100 | Real stock builder, read-only order previews and two identical `stepTurn` replays; all paths, arcs, ranges, timing, shields and survival asserted. |
| Earth red continuous beam | 6 | 95 | A held near-white core inside red; actual L1 aperture to a real target surface. Aft laser remains silent. |
| Krelath green continuous beams | 6 | 95 | Both identified dorsal crystals fire sustained beams; distinct origins remain visible. |
| Vraygon yellow continuous beam | 6 | 93 | Sustained yellow sheath/white core from the actual forward green weapon component. Its exact heavy-blaster role remains an explicitly cosmetic assignment. |
| Red and yellow star missiles | 9 | 94 | Pulsing white-hot points, coloured radiating spikes, glow and trailing motion; legible separately from the torpedo. These spikes belong to the projectile, with no lens ghosts. |
| Green fel-fire plasma torpedo | 9 | 92 | Changing irregular flame perimeter and curling trailing tongues; inspected across time, not only a still. Small-scale fire remains stylised, but does not read as a smooth sphere. |
| Hit explosion and struck-face shield | 7 | 93 | Bright flash, model-sized expanding fireball and full fade. Local blue shield flare only on the two hits with actual absorption. No fragments or destruction. |
| Energetic register and information boundary | 12 | 100 | Five on/off comparisons have identical physical-colour and shadow-buffer SHA-256 hashes; zero energetic lights. Frozen allowlisted exhibition projection; no browser engine imports. |
| Effect readability at planning height | 8 | 94 | Native 1080p planning captures and isolated energy-pixel measurements. This does not re-score tiny physical rim text or the hidden casting triangle. |
| Phase camera move | 7 | 94 | Existing `cameraPose`, 1,200 ms deliberate descent/lens change, same playback clock as every effect. Deep-focus planning; a tilted focus plane through the miniatures in resolution. |
| Video integrity and approved board | 10 | 98 | Independently decoded VP8 frames, metadata and encoding frame count; framing/floors/budgets checked throughout all 1,140 steps. Approved clear posts, FASA bases, codes and clear Point crystals retained. |
| **Weighted total** | **100** | **96.1** | **All current reel rows pass.** |

**I can see my captured images.** I directly inspected native planning and
resolution captures, the complete clip sampled once per second in an overview,
and denser decoded sequences for the camera, movement, turning, torpedo, defence
and explosion. Sixty-seven frames were independently decoded with ffmpeg; their
time list and the final video's hash are in
[decoded-audit.json](../evidence/pre-alpha-reel/decoded-audit.json).
Selected weapon and impact frames were also opened individually at native size.
I am not claiming to have visually inspected every one of the 1,140 frames.
No current reel criterion is unscored.

## What the engine actually did

`build-scenario.mjs` uses unmodified `buildShip`, `createBattleFromFleets`,
`previewOrders`, `stepTurn`, hex distance/facing and shield-absorption helpers.
The seed is **`pre-alpha-destroyers-192`**, deliberately selected for a complete,
nonlethal demonstration; this is not a balance sample or a runtime reroll.
Earth and Krelath form exhibition side A, Point side B. This is no assertion of
a fictional campaign alliance. All contacts and endpoints are observed.

| Ship | Start `(q,r)`, heading | After one forward hex | After round-2 turn | Round-3 target / range |
|---|---|---|---|---|
| Victory `EDD-02` | `(-5,-3)`, 5 | `(-5,-2)`, 5 | `(-5,-2)`, 0 | Point / 13 hexes |
| Swift `KDD-02` | `(-6,-1)`, 5 | `(-6,0)`, 5 | `(-6,0)`, 0 | Point / 12 hexes |
| Point `VDD-03` | `(5,1)`, 4 | `(4,2)`, 4 | `(4,2)`, 3 | Victory / 13 hexes |

The real stock builds contain two beams and one launcher each, with magazines
**4 / 4 / 6**. Victory fires its forward laser and neutronic missile; Swift fires
both forward-bearing blasters and its plasma torpedo; Point fires its bow heavy
blaster and neutronic missile. **Victory's aft laser and Point's stern heavy
blaster cannot bear while their forward-only launchers bear. They do not fire.**
All four eligible beams hit. The actual shot callbacks identify the fired mount
by its state transition, rather than guessing from weapon type.

All three launches occur in turn 1, round 3. The displayed first legs pass through
the resolver's actual end-of-round course samples. The three hits occur before
the turn-2 power reset. Presentation stretches and staggers those observed events
within their phases; it never advances an impact into the launch turn.

Point defends against each incoming missile with one eligible PD point: 18%
interception chance. Victory and nearby Swift contribute two points against the
returning neutronic missile: 36%. **All three interception rolls fail** in this
replay. The engine exposes a pooled attempt, not a chosen battery or individual
PD shot. The short defensive beams are cosmetic effort by those eligible ships,
shown missing the projectile on approach. Swift's beam leaves the confirmed
small point-defence dome. No successful intercept was invented.

Only the first Earth beam into Point and Point's beam into Victory absorb shield
damage: **4 each**, both on face 2. Later hits receive explosions without a false
shield flare. Final structure is **Victory 1, Swift 13, Point 1**. All three are
alive and uncrippled. No physical part breaks off.

[legality.json](legality.json) records compiled mounts, complete previews/orders,
raw callbacks, courses, survivors and hashes of the unchanged rule/data files.
The preview's stationary-target forecast is retained as evidence; actual shot
legality is separately checked at the actual round-3 positions.

## Attachments and the corrected models

The board uses `prepared/fleet/ear-victory.glb`, `kre-swift.glb` and `vra-point.glb`.
Victory and Swift are the **40° crease-split, area-and-angle-weighted window
corrections** from the completed pass. Their exact output hashes are verified.
Point uses the approved faceted derivative unchanged. No GLB or source file was
rewritten for the reel. Existing fleet material, mounting and table modules supply
the approved metal/paint, clear posts, clear green crystals and arc-2/4/6 codes.

| Hull | Beam and missile attachment | Qualification |
|---|---|---|
| Victory | Schematic L1 forward laser aperture; M1 bow tube's actual inner aperture | The tube aperture is alternate steel, not an emissive colour. The schematic establishes its weapon role. L2 is recorded but not fired. |
| Swift | Schematic B1/B2 yellow dorsal emitter crystals; P1 axial yellow plasma aperture | Red warning plates/rings remain paint. PD uses the existing confirmed `pointDefenceEmitter` face map. |
| Point | Forward dorsal green crystal for the bow beam; axial bow green crystal for missile release | The green components are confirmed weapons, but individual roles are not authored. These are the nearest honest attachments, not new canonical anatomy. |

Victory and Point have no separately labelled PD feature, so their nearest
identified weapon component supports the cosmetic defensive attempt. Every socket
records its original triangle, region, surface point, normal, 0.12 mm outward bias
and evidence in [attachments.json](attachments.json). Tests verify that the point
lies on that triangle. Target contacts are ray intersections with actual hull
geometry. Neither socket choice nor impact placement has rules authority.

## Camera, registers and measured costs

Planning uses the existing high near-orthographic pose: 150 scene units high,
12.7° field of view, approximately 72° pitch. Resolution descends to 26 units,
40° field of view and approximately 38° pitch. The hard floors remain 24 units
and 32°. The 1,200 ms phase move and every shader's time come from the existing
`arena/contact-playback.js` active clock with injected `now` and `raf`.

The reel's resolution focus plane is tilted through the miniature layer, retaining
the existing 4-pixel blur cap. This keeps the active hulls in focus instead of
focusing empty board between them; the table and board fall away. No shared camera
or runtime file changed. There is no camera shake or lens flare.

The energy scene is separately rendered, unlit, additive and depth-occluded by
the physical scene. It never enters shadows or reflection capture. The hit flash
uses a spherical depth profile so the volume can expand out of the impact surface;
it cannot illuminate that surface. Clear Vraygon weapon parts stay non-emitting.

At 1080p planning height, measuring isolated energy pixels above 0.05 linear
intensity gives these actual footprints:

| Effect | Measured visible footprint |
|---|---|
| Continuous beams | About 4.9 pixels average transverse width; uninterrupted cores |
| Star missiles | 20–31 pixels across their radiating points in the sampled frames |
| Fel-fire body | 27–31 pixels across, plus trailing tongues |
| Shield flare | 41–44 pixels across, local to the struck face |
| Sampled hit fireball | 29 × 31 pixels at 28.3 seconds; maximum world envelope 19 mm |

[readability.json](../evidence/pre-alpha-reel/readability.json) records thresholds,
pixel counts and bounds. Corresponding `*-planning.png` captures are beside it.
The existing **20/100 rim-code and triangle planning-legibility findings remain**;
they were not silently improved or incorporated into this reel's effect score.
The full-board identification decision remains outstanding.

Across the encoded frames: **201,647 maximum submitted triangles, 128 maximum
draw calls, 93.1 MiB estimated offscreen targets** including transmission and
shadows. Planning-effect inspection reaches 133 draws. These fit the declared
offline reel budgets of 350k / 200 / 110 MiB. They do not claim the live board's
smaller budget or full-board performance. Material-texture residency and live
frame time still need measuring for integration.

## Verification and reproduction

Fast regression suite: **passed, process exit 0**. Prototype checks **29/29**,
fleet checks **32/32**, reel checks **7/7**. Browser capture has no script/shader
errors. Identical repeated stepped frames are byte-compared. Physical and shadow
hash pairs are in [video-audit.json](../evidence/pre-alpha-reel/video-audit.json).
Every encoded frame is checked for clipping, camera floors, above-board endpoints
and the declared drawing budgets. The decoded file reports VP8, 1080p, 30 fps and
38 seconds; `encoding.log` records all 1,140 frames.

Run from the worktree root:

```text
node arena/prototype-3d/reel/build-scenario.mjs
node arena/prototype-3d/reel/build-attachments.mjs
node arena/prototype-3d/reel/test.mjs
node arena/prototype-3d/reel/capture.mjs --video
node arena/prototype-3d/reel/inspect-video.mjs
```

The capture script starts its own local server and uses installed Edge/Playwright
and the supplied ffmpeg. It writes only prototype artifacts. Decoded QA images are
reproducible and gitignored; the movie, five delivery stills and audits remain.
The interactive working fixture is `/arena/prototype-3d/reel/index.html`, with
`window.reel.start()`, `step(milliseconds)` and `inspect(seconds, planning)` for
deterministic inspection. The watch page opens the finished video directly.

No commit, branch, rules/data change, permanent asset intake or shared runtime
change. Furniture is untouched. The live game's destruction contract is unchanged;
this reel alone has no debris. Planet/nebula samples and the full-board test remain
outside the completed slice.
