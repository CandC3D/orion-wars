# Per-hull regions - revision 07

Generated with `node arena/prototype-3d/write-region-table.mjs`. Keys are raw linear COLOR_0 tuples. Percentages measure source triangle surface area, including hidden faces, not corner counts or screen coverage. Emissive-designated regions are non-emissive physical paint with an inert energy attachment map.

Chris's faction-wide material rulings are encoded in faction-palettes.json; per-hull anatomy remains in hull-art.js.

## EAR / Monoceros

| Linear key | Source area % | Reduced area % | Classification | Interpretation |
|---|---:|---:|---|---|
| #bfc7cc | 43.952 | 43.941 | metal | silver / steel hull |
| #009fd7 | 28.377 | 28.416 | paint | bright blue panelling |
| #e91d2d | 2.553 | 2.551 | emissive-designated | red across multiple parts; nav, collector, muzzle and outlet; not a global function |
| #0076a9 | 19.302 | 19.286 | paint | deep blue panelling |
| #f5831f | 1.556 | 1.562 | paint | orange weapons-warning paint at the actual laser housing |
| #e1ad34 | 2.177 | 2.173 | metal | metallic gold confined to the sensor dish |
| #fafafa | 0.304 | 0.291 | emissive-designated | white windows and fittings; individual functions not all assigned |
| #61676a | 1.766 | 1.767 | paint | dark grey aft nacelle outlet surround |
| #46b749 | 0.013 | 0.013 | emissive-designated | small starboard nav fitting; 3888 source corners |

## KRE / Sparrowhawk

| Linear key | Source area % | Reduced area % | Classification | Interpretation |
|---|---:|---:|---|---|
| #126936 | 57.232 | 57.251 | paint | painted hull green A |
| #46b749 | 25.942 | 25.934 | paint | painted hull green B; meaning of distinction unresolved |
| #a97b50 | 13.537 | 13.533 | metal | metallic bronze hull |
| #f5831f | 2.274 | 2.268 | emissive-designated | orange collector, vertical exhaust and horizontal radiators |
| #fafafa | 0.358 | 0.359 | emissive-designated | white windows |
| #ffdd1a | 0.432 | 0.431 | emissive-designated | yellow including both domes; only larger dome is a confirmed weapon |
| #e91d2d | 0.225 | 0.225 | paint | red warning rings |

## VRA / Shard

| Linear key | Source area % | Reduced area % | Classification | Interpretation |
|---|---:|---:|---|---|
| #d3bfe5 | 8.672 | 8.751 | emissive-designated | lavender; individual system functions unassigned |
| #e1ad34 | 53.521 | 53.126 | metal | actual metallic gold hull |
| #7e3f98 | 9.290 | 8.933 | emissive-designated | purple; individual system functions unassigned |
| #ffdd1a | 27.175 | 27.804 | paint | yellow hull surfaces; explicitly not in Vraygon emissive set |
| #f5831f | 0.480 | 0.520 | paint | orange paint; no inferred system |
| #46b749 | 0.850 | 0.857 | paint / optional moulded transparent | green fixtures; no inferred function from geometry alone |
| #e91d2d | 0.011 | 0.009 | emissive-designated | small red fixture; no inferred system |

## VRA / Crystal (material comparison only)

90 mm is a provisional study size, not a class-scale ruling. All eight existing green patches share the optional clear material; no fixture is enlarged or relocated.

| Linear key | Source area % | Reduced area % | Classification | Interpretation |
|---|---:|---:|---|---|
| #75cedb | 1.203 | 1.220 | paint | pale cyan painted part; not a clear crystal |
| #7e3f98 | 7.484 | 7.452 | emissive-designated | purple; function unassigned |
| #ffdd1a | 32.843 | 32.888 | paint | yellow paint |
| #f5831f | 0.306 | 0.304 | paint | orange paint |
| #e1ad34 | 52.257 | 52.353 | metal | gold |
| #46b749 | 1.091 | 1.082 | paint / optional moulded transparent | grown-crystal components; optional supplied clear kit parts |
| #d3bfe5 | 4.809 | 4.694 | emissive-designated | lavender; function unassigned |
| #e91d2d | 0.007 | 0.007 | emissive-designated | red; function unassigned |

## Resolved and remaining distinctions

- Monoceros steel is 43.952% of source area; its two blue panels together are 47.679%. No colour keys were swapped. After the 2 mm base rise, the planning camera sees 39.48% steel and 53.52% blue. The source, not a desired screen majority, governs placement.
- Monoceros gold is confirmed metal, confined to the sensor dish: all 12,480 source corners / 4,160 source triangles are within the authored dish bounds. The derivative has one connected gold patch / 467 triangles, entirely at the dish. The preparation and region generator fail if gold appears elsewhere.
- Alternate steel #a7adb1 is absent from Monoceros, as supplied. No region is synthesised. The faction contract gives it a darker, slightly warmer alloy response with the same rough metal-flake finish. It is not drawn on the three-frigate board.
- Shard yellow #ffdd1a is 27.175% and definitively paint. Lavender, purple and red are energy-designated by faction, but no system socket is inferred. Pale cyan on larger hulls is ordinary paint.
- Krelath's two greens are both painted hull. Their fictional distinction and the smaller dorsal dome's function remain unassigned. Pale green flight-deck paint on larger Krelath hulls is dead-flat, with no specular return.
- Shard green remains paint by default and optional clear green styrene in the comparison. Green alone is eligible for this variant across Vraygon. A colour does not supply a mount count or firing point.
- All 23 current regions now have confirmed material classifications. Unassigned functions are separate from material classification. Zandrax remains a future colour-name contract, with no fabricated source keys or hull.
