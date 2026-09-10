# Per-hull regions - revision 05

Generated from the source triangle areas and the explicit hull profiles by `node arena/prototype-3d/write-region-table.mjs`. Keys identify raw linear COLOR_0 tuples. Percentages are whole surfaces, including hidden faces, not corner counts or projected screen coverage. All default materials emit zero light. Emissive-designated means bright physical paint plus an inert attachment map.

Authority: Chris through Fable, mailbox 20260910T105112Z (metals) and 20260910T105522Z (faction emissive sets and optional clear insert).

## EAR / Monoceros

| Linear key | Source area % | Reduced area % | Classification | Interpretation |
|---|---:|---:|---|---|
| #bfc7cc | 43.952 | 43.941 | metal | silver / steel hull |
| #009fd7 | 28.377 | 28.416 | paint | bright blue panelling |
| #e91d2d | 2.553 | 2.551 | emissive-designated | red across multiple parts; nav, collector, muzzle and outlet; not a global function |
| #0076a9 | 19.302 | 19.286 | paint | deep blue panelling |
| #f5831f | 1.556 | 1.562 | paint | orange weapons-warning paint at the actual laser housing |
| #e1ad34 | 2.177 | 2.173 | paint | gold-coloured lower dish; brass versus paint unresolved |
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

## Decisions and remaining questions

- Earth steel is 43.952% of the source; combined blue panels are 47.679%. No colour keys were swapped. The error was calling steel pale paint. The native planning-camera ID pass sees 38.77% steel and 53.84% blue; the camera cannot expose all hull surfaces at once. Silver now has the same rough flake finish as bronze and gold. Blue faces remain blue.
- Earth #e1ad34 is provisionally gold-coloured paint. Geometry establishes a lower dish, not its substance. Brass versus paint is explicitly unresolved; no cross-faction inference from Vraygon gold is used.
- Shard yellow #ffdd1a is 27.175% of source area. It covers large authored facets as well as smaller fittings. Chris's later faction set explicitly makes it paint, not an emissive. Confidence in that classification is high; system functions are still unassigned.
- Vraygon lavender/purple/red are emissive-designated by Chris. Their exact faces are available to a future effects layer; no weapon or engine socket is invented from that designation.
- Krelath's two greens are both paint, definitively outside its emissive set. Their fictional distinction remains unanswered. The small yellow dorsal dome is designated energy-capable, but has no system name, second weapon mount or animation.
- Shard green is paint by default and optional moulded transparent green styrene in the comparison. It is not energy-capable. Chris identifies grown-crystal weapon components, but this does not supply a firing point or mount count.
- All 23 regions have an explicit rendering classification. The only unresolved physical substance is the Earth gold dish. Unassigned functions are recorded separately from material classification.
- Zandrax is recorded for future intake only: green/magenta designated energy, dark grey/lead metal. No Zandrax profile or hull is fabricated for this slice.
