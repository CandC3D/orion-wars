# Distance legibility & free-camera implementation review (ChatGPT-5.6 Sol, high effort, 2026-09-01)

Asked with the Earth 2.1 line (LC, CA, BB, DN, CV) and the Krelath Frigate as image reference.
Question A: making ships more visually distinct at a distance (silhouettes canon).
Question B: implementation guidance for a freely zoom/rotate camera (Sins of a Solar Empire style).

## A. Visual distinction and distance legibility

1. **Create a large-area class paint code.** Thin stripes disappear first; assign 20–35% of the dorsal surface to the class identifier.

   - **FF:** mostly cyan, one white dorsal panel.
   - **DD:** cyan with a dark prow/spine wedge.
   - **CL:** white forward third, cyan drum panels.
   - **CA:** dark central drum with two separated cyan panels.
   - **BB:** alternating cyan/dark armor blocks and prominent coral radiators.
   - **Flagships:** continuous white or gold-edged dorsal “crown” stripe.

   Put the same code on the tactical sprites and icons. Prioritize separating FF/DD and CL/CA rather than making every ship unique.

2. **Design primarily for the dorsal view.** Reserve a clean recognition plane on top of every hull. Move class markings, large value blocks, and important emissives there; side details should be secondary. In oblique view, repeat the class code on nacelle tops and the upper drum rim.

3. **Give each sister class one unmistakable value difference.**

   - FF light body / DD dark upper spine.
   - CL light drum center / CA dark drum center.
   - Do not rely on fixture count alone: several orange balls or nacelles merge into noise at distance.

4. **Use emissive placement as a rhythm, not decoration.** Keep Earth to two operational colors: cyan-white systems and coral-red weapons.

   - FF: one continuous engine/glow group.
   - DD: two short paired groups.
   - CL: three evenly spaced dorsal groups.
   - CA: paired fore/aft groups with a dark gap.
   - BB: long bilateral radiator bars.
   - Flagship: a unique central spine or pulsing command beacon.

   Preserve a solid, non-bloomed core so the pattern remains visible when bloom is reduced.

5. **Differentiate factions by value structure and material character, not hue alone.**

   - **Earth:** pale cyan/white shells, charcoal gaps, smooth painted metal, orderly coral bars and warm gold fixtures.
   - **Krelath:** medium-value sage planes, near-black recesses, rough bronze edges, sparse amber or acid-green point lights.
   - Give the other factions different distributions—such as dark hull/bright edges or warm hull/cool engines—rather than merely new base colors.

6. **Increase material contrast selectively.** Earth should read as smooth manufactured shells over dark mechanical structure: satin cyan, glossy white trim, matte charcoal recesses, metallic gold sensors. Krelath can remain faceted and rougher. Avoid making every surface metallic or equally glossy; that destroys the large color blocks under moving light.

7. **Use fixture density in grouped zones.** Escorts should have a few isolated fixtures and generous empty hull area; capitals should have repeated batteries, window banks, antenna clusters, and radiator groups. Cluster details into readable masses instead of distributing them uniformly.

8. **Cheat scale presentation.** Keep windows, turret rings, sensor dishes, and radiator widths within a fairly consistent apparent physical size across classes. Capitals then gain many repeats rather than simply enlarged fixtures. Slightly exaggerate these cues on the lowest LOD and sprites.

9. **Retain a redundant icon language.** Class must remain identifiable in monochrome: silhouette thumbnail + class glyph/tick count + faction frame. This protects readability for color-vision deficiencies, extreme bloom, and backlighting.

---

## B. Game implementation

1. **Drive LOD by projected screen size, not world distance.**

   | Projected ship length | Representation |
   |---|---|
   | Above 300 px | LOD0 |
   | 120–300 px | LOD1 |
   | 40–120 px | LOD2 |
   | 18–50 px | Impostor or tactical sprite |
   | Below 18 px | Class/faction icon |

   Add approximately 20% hysteresis and a 150–250 ms delay so rotating or zooming does not cause LOD chatter. Dither-fade model/impostor transitions over roughly 0.15 seconds.

2. **Use practical triangle targets.**

   | Hull | LOD0 | LOD1 | LOD2 |
   |---|---:|---:|---:|
   | FF/DD | 30–60k | 12–25k | 3–7k |
   | CL/CA | 50–100k | 20–40k | 6–12k |
   | BB | 90–160k | 35–65k | 10–20k |
   | Flagship | 150–220k | 55–100k | 15–30k |

   Keep the 400k dreadnought only as an optional inspection/hero LOD. Simplify hidden intersections, tiny bevels, turret segmentation, and cylindrical side counts first; preserve the outer contour, dorsal markings, nacelle ends, and large fixtures.

3. **Use two far representations.**

   - When the camera is steeply top-down, reuse the existing tactical sprites.
   - At low/oblique angles, use a small multiview impostor—about 16 directions at 128–256 px, ideally with separate emissive data.
   - Switch to a vector-like class icon once the ship is too small for its orientation to matter.

   Do not use a single top-down billboard at shallow camera angles; the flattening becomes immediately obvious.

4. **Reduce materials and texture traffic.** Target one primary material plus, at most, one emissive/transparent material per hull.

   - Escorts: 1K texture set; capitals: 2K; only hero inspection assets merit 4K.
   - Pack AO/roughness/metalness; use a separate low-resolution emissive mask or spare packed channel.
   - Parameterize faction and class colors in the shader so repeated hulls share textures.
   - Use mipmaps, GPU texture compression, and mesh compression.
   - Load only factions and LODs required for the current encounter.

5. **Use restrained, stable lighting.** A neutral directional key plus soft environment/hemisphere fill is sufficient. Avoid per-ship lights. Use an ACES-like or similarly filmic tone map with locked gameplay exposure; automatic exposure will make faction colors change while zooming. Bloom should enhance emissives, while the underlying colored geometry remains legible without it.

6. **Instance repeated ships.** Share geometry and materials, then batch each hull/LOD combination with instancing. Keep selection, damage, team color, and emissive phase as per-instance attributes. For a representative 100–200 ship battle at 1080p, aim initially for roughly 2–4 million visible triangles and under 300–500 draw calls, then profile on the actual target machines.

7. **Manage fleet spacing in silhouette widths.** Default center spacing should be about 1.5–2 ship widths for escorts and 2.5–3 for capitals. Prevent formations from placing small ships directly behind capitals in the common camera projection. Limited vertical staggering helps, but excessive depth stacking makes selection and threat assessment difficult.

8. **Separate ship, faction, and selection information.**

   - Ship model/sprite: faction paint and class markings.
   - Base ring: faction color plus a non-color shape pattern.
   - Selection: bright neutral outline or bracket, not another faction-colored ring.
   - Icon: class silhouette, health arc, then status/order glyphs.
   - Declutter automatically: selected units, threats, objectives, and damaged ships win icon-layer priority; distant formations collapse into stack icons with counts.

9. **Decouple interaction from rendered LOD.** Picking, health bars, orders, and selection should reference one logical ship entity with a simple persistent hit proxy. Never attach gameplay state to whichever mesh or impostor is currently visible.

10. **Guard against common Sins-style camera failures.**

   - Dynamically manage near/far clipping to avoid cutting through capitals and losing depth precision.
   - Zoom toward the cursor or current selection; prevent abrupt focus-point changes.
   - Maintain a clear strategic “up” direction and provide a quick reset-to-top-down action.
   - Cap angular camera speed near ships to reduce nausea and LOD flashing.
   - Keep rings and labels out of transparent-object sorting; render them in controlled overlay passes.
   - Test backlit, edge-on, overlapping, and maximum-bloom cases—not only attractive three-quarter hero views.
tokens used
## A. Visual distinction and distance legibility

1. **Create a large-area class paint code.** Thin stripes disappear first; assign 20–35% of the dorsal surface to the class identifier.

   - **FF:** mostly cyan, one white dorsal panel.
   - **DD:** cyan with a dark prow/spine wedge.
   - **CL:** white forward third, cyan drum panels.
   - **CA:** dark central drum with two separated cyan panels.
   - **BB:** alternating cyan/dark armor blocks and prominent coral radiators.
   - **Flagships:** continuous white or gold-edged dorsal “crown” stripe.

   Put the same code on the tactical sprites and icons. Prioritize separating FF/DD and CL/CA rather than making every ship unique.

2. **Design primarily for the dorsal view.** Reserve a clean recognition plane on top of every hull. Move class markings, large value blocks, and important emissives there; side details should be secondary. In oblique view, repeat the class code on nacelle tops and the upper drum rim.

3. **Give each sister class one unmistakable value difference.**

   - FF light body / DD dark upper spine.
   - CL light drum center / CA dark drum center.
   - Do not rely on fixture count alone: several orange balls or nacelles merge into noise at distance.

4. **Use emissive placement as a rhythm, not decoration.** Keep Earth to two operational colors: cyan-white systems and coral-red weapons.

   - FF: one continuous engine/glow group.
   - DD: two short paired groups.
   - CL: three evenly spaced dorsal groups.
   - CA: paired fore/aft groups with a dark gap.
   - BB: long bilateral radiator bars.
   - Flagship: a unique central spine or pulsing command beacon.

   Preserve a solid, non-bloomed core so the pattern remains visible when bloom is reduced.

5. **Differentiate factions by value structure and material character, not hue alone.**

   - **Earth:** pale cyan/white shells, charcoal gaps, smooth painted metal, orderly coral bars and warm gold fixtures.
   - **Krelath:** medium-value sage planes, near-black recesses, rough bronze edges, sparse amber or acid-green point lights.
   - Give the other factions different distributions—such as dark hull/bright edges or warm hull/cool engines—rather than merely new base colors.

6. **Increase material contrast selectively.** Earth should read as smooth manufactured shells over dark mechanical structure: satin cyan, glossy white trim, matte charcoal recesses, metallic gold sensors. Krelath can remain faceted and rougher. Avoid making every surface metallic or equally glossy; that destroys the large color blocks under moving light.

7. **Use fixture density in grouped zones.** Escorts should have a few isolated fixtures and generous empty hull area; capitals should have repeated batteries, window banks, antenna clusters, and radiator groups. Cluster details into readable masses instead of distributing them uniformly.

8. **Cheat scale presentation.** Keep windows, turret rings, sensor dishes, and radiator widths within a fairly consistent apparent physical size across classes. Capitals then gain many repeats rather than simply enlarged fixtures. Slightly exaggerate these cues on the lowest LOD and sprites.

9. **Retain a redundant icon language.** Class must remain identifiable in monochrome: silhouette thumbnail + class glyph/tick count + faction frame. This protects readability for color-vision deficiencies, extreme bloom, and backlighting.

---

## B. Game implementation

1. **Drive LOD by projected screen size, not world distance.**

   | Projected ship length | Representation |
   |---|---|
   | Above 300 px | LOD0 |
   | 120–300 px | LOD1 |
   | 40–120 px | LOD2 |
   | 18–50 px | Impostor or tactical sprite |
   | Below 18 px | Class/faction icon |

   Add approximately 20% hysteresis and a 150–250 ms delay so rotating or zooming does not cause LOD chatter. Dither-fade model/impostor transitions over roughly 0.15 seconds.

2. **Use practical triangle targets.**

   | Hull | LOD0 | LOD1 | LOD2 |
   |---|---:|---:|---:|
   | FF/DD | 30–60k | 12–25k | 3–7k |
   | CL/CA | 50–100k | 20–40k | 6–12k |
   | BB | 90–160k | 35–65k | 10–20k |
   | Flagship | 150–220k | 55–100k | 15–30k |

   Keep the 400k dreadnought only as an optional inspection/hero LOD. Simplify hidden intersections, tiny bevels, turret segmentation, and cylindrical side counts first; preserve the outer contour, dorsal markings, nacelle ends, and large fixtures.

3. **Use two far representations.**

   - When the camera is steeply top-down, reuse the existing tactical sprites.
   - At low/oblique angles, use a small multiview impostor—about 16 directions at 128–256 px, ideally with separate emissive data.
   - Switch to a vector-like class icon once the ship is too small for its orientation to matter.

   Do not use a single top-down billboard at shallow camera angles; the flattening becomes immediately obvious.

4. **Reduce materials and texture traffic.** Target one primary material plus, at most, one emissive/transparent material per hull.

   - Escorts: 1K texture set; capitals: 2K; only hero inspection assets merit 4K.
   - Pack AO/roughness/metalness; use a separate low-resolution emissive mask or spare packed channel.
   - Parameterize faction and class colors in the shader so repeated hulls share textures.
   - Use mipmaps, GPU texture compression, and mesh compression.
   - Load only factions and LODs required for the current encounter.

5. **Use restrained, stable lighting.** A neutral directional key plus soft environment/hemisphere fill is sufficient. Avoid per-ship lights. Use an ACES-like or similarly filmic tone map with locked gameplay exposure; automatic exposure will make faction colors change while zooming. Bloom should enhance emissives, while the underlying colored geometry remains legible without it.

6. **Instance repeated ships.** Share geometry and materials, then batch each hull/LOD combination with instancing. Keep selection, damage, team color, and emissive phase as per-instance attributes. For a representative 100–200 ship battle at 1080p, aim initially for roughly 2–4 million visible triangles and under 300–500 draw calls, then profile on the actual target machines.

7. **Manage fleet spacing in silhouette widths.** Default center spacing should be about 1.5–2 ship widths for escorts and 2.5–3 for capitals. Prevent formations from placing small ships directly behind capitals in the common camera projection. Limited vertical staggering helps, but excessive depth stacking makes selection and threat assessment difficult.

8. **Separate ship, faction, and selection information.**

   - Ship model/sprite: faction paint and class markings.
   - Base ring: faction color plus a non-color shape pattern.
   - Selection: bright neutral outline or bracket, not another faction-colored ring.
   - Icon: class silhouette, health arc, then status/order glyphs.
   - Declutter automatically: selected units, threats, objectives, and damaged ships win icon-layer priority; distant formations collapse into stack icons with counts.

9. **Decouple interaction from rendered LOD.** Picking, health bars, orders, and selection should reference one logical ship entity with a simple persistent hit proxy. Never attach gameplay state to whichever mesh or impostor is currently visible.

10. **Guard against common Sins-style camera failures.**

   - Dynamically manage near/far clipping to avoid cutting through capitals and losing depth precision.
   - Zoom toward the cursor or current selection; prevent abrupt focus-point changes.
   - Maintain a clear strategic “up” direction and provide a quick reset-to-top-down action.
   - Cap angular camera speed near ships to reduce nausea and LOD flashing.
   - Keep rings and labels out of transparent-object sorting; render them in controlled overlay passes.
